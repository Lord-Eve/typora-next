//! 文件关联自愈
//!
//! 根因：Tauri NSIS 更新流程先静默运行旧版 uninstall.exe，卸载器会删除
//! `HKCU\Software\Classes` 下的 ProgID（Markdown Document）与打开命令，
//! 而更新模式的新安装器不写回 → 更新后双击 .md 找不到应用。
//! 对策：每次启动（仅 release 构建，见 lib.rs setup 钩子）自检关联，
//! 缺失或指向陈旧路径则重写。
//!
//! 模块自包含（仅 std + cfg(windows) 下的 winreg），不引用 crate::，
//! 集成测试通过 #[path] include 直接测试（避免链接完整 app_lib）。

use std::path::Path;

/// 关联规格：必须与 tauri.conf.json `bundle.fileAssociations` 保持一致。
#[derive(Debug, Clone)]
pub struct AssocSpec {
    /// ProgID，如 "Markdown Document"
    pub prog_id: String,
    /// 关联的扩展名（含点），如 [".md", ".markdown"]
    pub extensions: Vec<String>,
}

/// 生产环境规格（tauri.conf.json: ext = md/markdown, name = "Markdown Document"）
pub fn default_spec() -> AssocSpec {
    AssocSpec {
        prog_id: "Markdown Document".to_string(),
        extensions: vec![".md".to_string(), ".markdown".to_string()],
    }
}

/// 一条待写入的注册表修复操作（key_path 相对 HKCU）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepairOp {
    pub key_path: String,
    /// "" 表示键的默认值
    pub value_name: String,
    pub value_data: String,
}

fn classes_key(suffix: &str) -> String {
    format!(r"Software\Classes\{suffix}")
}

/// shell\open\command 的期望内容：`"<exe>" "%1"`
pub fn open_command(exe_path: &str) -> String {
    format!("\"{exe_path}\" \"%1\"")
}

/// DefaultIcon 的期望内容：`<exe>,0`
pub fn icon_value(exe_path: &str) -> String {
    format!("{exe_path},0")
}

/// 规划修复操作。`read(key_path, value_name)` 返回当前值（None = 键或值不存在）。
///
/// 规则（与 BDD 场景一一对应）：
/// - ProgID 本体（名称/图标/打开命令）：与期望不符即重写（覆盖陈旧路径）
/// - 扩展名 → ProgID 映射：仅在缺失或已指向我们时写入（不劫持用户选的其他应用）
/// - OpenWithProgids：缺失则补（只增不删）
/// - Applications\<exe文件名>：缺失、或指向含 "TyporaNext" 的陈旧路径时重写
///   （用户在「打开方式」里选出的 UserChoice 依赖此键；指向无关程序则不动）
pub fn plan_repairs(
    spec: &AssocSpec,
    exe_path: &str,
    read: &dyn Fn(&str, &str) -> Option<String>,
) -> Vec<RepairOp> {
    let mut ops = Vec::new();

    // 1. ProgID 本体三键：不符即重写
    let prog_key = classes_key(&spec.prog_id);
    let prog_entries = [
        (prog_key.clone(), "name", spec.prog_id.clone()),
        (
            format!(r"{prog_key}\DefaultIcon"),
            "icon",
            icon_value(exe_path),
        ),
        (
            format!(r"{prog_key}\shell\open\command"),
            "command",
            open_command(exe_path),
        ),
    ];
    for (key, _label, desired) in prog_entries {
        if read(&key, "").as_deref() != Some(desired.as_str()) {
            ops.push(RepairOp {
                key_path: key,
                value_name: String::new(),
                value_data: desired,
            });
        }
    }

    // 2. 扩展名映射 + OpenWithProgids
    for ext in &spec.extensions {
        let ext_key = classes_key(ext);
        let current = read(&ext_key, "");
        let owned_by_us = current.as_deref() == Some(spec.prog_id.as_str());
        let unset = current.as_deref().map(str::is_empty).unwrap_or(true);
        if unset || owned_by_us {
            if !owned_by_us {
                ops.push(RepairOp {
                    key_path: ext_key,
                    value_name: String::new(),
                    value_data: spec.prog_id.clone(),
                });
            }
        }
        // OpenWithProgids：只增不删
        let open_with_key = format!(r"{}\OpenWithProgids", classes_key(ext));
        if read(&open_with_key, &spec.prog_id).is_none() {
            ops.push(RepairOp {
                key_path: open_with_key,
                value_name: spec.prog_id.clone(),
                value_data: String::new(),
            });
        }
    }

    // 3. Applications\<exe文件名>：救回用户「打开方式」选出的 UserChoice
    if let Some(exe_name) = Path::new(exe_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
    {
        let app_key = classes_key(&format!(r"Applications\{exe_name}\shell\open\command"));
        let desired = open_command(exe_path);
        let writable = match read(&app_key, "") {
            None => true,
            Some(cur) => cur == desired || cur.contains("TyporaNext"),
        };
        if writable && read(&app_key, "").as_deref() != Some(desired.as_str()) {
            ops.push(RepairOp {
                key_path: app_key,
                value_name: String::new(),
                value_data: desired,
            });
        }
    }

    ops
}

// ============================================================
// Windows 注册表 IO
// ============================================================

/// 应用修复计划，返回写入条数。
#[cfg(windows)]
pub fn apply_repairs(ops: &[RepairOp]) -> Result<usize, String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    for op in ops {
        let (key, _) = hkcu
            .create_subkey(&op.key_path)
            .map_err(|e| format!("create_subkey {}: {e}", op.key_path))?;
        key.set_value(&op.value_name, &op.value_data)
            .map_err(|e| format!("set_value {}: {e}", op.key_path))?;
    }
    Ok(ops.len())
}

/// 读取 HKCU 下的字符串值（None = 键或值不存在）。
#[cfg(windows)]
fn read_hkcu(key_path: &str, value_name: &str) -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(key_path)
        .ok()?
        .get_value(value_name)
        .ok()
}

/// 按规格自检并修复文件关联，返回修复条数（0 = 关联完好）。
#[cfg(windows)]
pub fn ensure_with(spec: &AssocSpec, exe_path: &str) -> Result<usize, String> {
    let ops = plan_repairs(spec, exe_path, &read_hkcu);
    apply_repairs(&ops)
}

/// 生产入口：以当前 exe 路径 + 默认规格执行自愈。
#[cfg(windows)]
pub fn ensure_file_associations() -> Result<usize, String> {
    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    ensure_with(&default_spec(), &exe.to_string_lossy())
}

/// 非 Windows 平台无注册表关联，直接视为完好。
#[cfg(not(windows))]
pub fn ensure_file_associations() -> Result<usize, String> {
    Ok(0)
}
