//! Integration tests for file_assoc (pure-std module, #[path] include —
//! linking the full app_lib pulls in WebView2 and the test exe fails to start
//! on some Windows environments).
//!
//! 可执行规格：tests/sprint28/features/sprint28_file_assoc_self_heal.feature
//! 每个 #[test] 与 feature 中的场景一一对应。

#[path = "../src/file_assoc.rs"]
mod file_assoc;

use file_assoc::{default_spec, icon_value, open_command, plan_repairs, AssocSpec, RepairOp};
use std::collections::HashMap;

const EXE: &str = r"C:\Users\u\AppData\Local\TyporaNext\app.exe";

fn spec() -> AssocSpec {
    default_spec()
}

/// 内存注册表：key_path -> (value_name -> value)
type MemReg = HashMap<String, HashMap<String, String>>;

fn reader(reg: &MemReg) -> impl Fn(&str, &str) -> Option<String> + '_ {
    move |k: &str, v: &str| reg.get(k).and_then(|vals| vals.get(v).cloned())
}

fn set(reg: &mut MemReg, key: &str, value_name: &str, data: &str) {
    reg.entry(key.to_string())
        .or_default()
        .insert(value_name.to_string(), data.to_string());
}

/// 构造一份「关联完好」的内存注册表（应产生零修复）
fn healthy_reg() -> MemReg {
    let mut reg = HashMap::new();
    let prog = r"Software\Classes\Markdown Document";
    set(&mut reg, prog, "", "Markdown Document");
    set(
        &mut reg,
        &format!(r"{prog}\DefaultIcon"),
        "",
        &icon_value(EXE),
    );
    set(
        &mut reg,
        &format!(r"{prog}\shell\open\command"),
        "",
        &open_command(EXE),
    );
    for ext in [".md", ".markdown"] {
        set(
            &mut reg,
            &format!(r"Software\Classes\{ext}"),
            "",
            "Markdown Document",
        );
        set(
            &mut reg,
            &format!(r"Software\Classes\{ext}\OpenWithProgids"),
            "Markdown Document",
            "",
        );
    }
    set(
        &mut reg,
        r"Software\Classes\Applications\app.exe\shell\open\command",
        "",
        &open_command(EXE),
    );
    reg
}

/// 场景：NSIS 更新删除 ProgID 后启动自愈
#[test]
fn nsis_update_deleted_progid_self_heals() {
    // 更新后残骸：扩展名映射还在，ProgID 三键与 Applications 键被卸载器删掉
    let mut reg = HashMap::new();
    set(&mut reg, r"Software\Classes\.md", "", "Markdown Document");
    set(
        &mut reg,
        r"Software\Classes\.markdown",
        "",
        "Markdown Document",
    );

    let ops = plan_repairs(&spec(), EXE, &reader(&reg));

    // 重建：ProgID 名称 + 图标 + 打开命令
    assert!(ops
        .iter()
        .any(|op| op.key_path == r"Software\Classes\Markdown Document"
            && op.value_data == "Markdown Document"));
    assert!(ops.iter().any(|op| op
        .key_path
        .ends_with(r"Markdown Document\shell\open\command")
        && op.value_data == open_command(EXE)));
    assert!(ops
        .iter()
        .any(|op| op.key_path.ends_with(r"Markdown Document\DefaultIcon")
            && op.value_data == icon_value(EXE)));
    // 打开命令必须指向当前 exe 路径
    let cmd = ops
        .iter()
        .find(|op| {
            op.key_path.ends_with(r"shell\open\command") && !op.key_path.contains("Applications")
        })
        .unwrap();
    assert!(cmd.value_data.contains(EXE));
    // 扩展名映射已指向我们 → 不重写
    assert!(!ops
        .iter()
        .any(|op| op.key_path == r"Software\Classes\.md" && op.value_name.is_empty()));
    // OpenWithProgids 缺失 → 补
    assert!(ops
        .iter()
        .any(|op| op.key_path == r"Software\Classes\.md\OpenWithProgids"
            && op.value_name == "Markdown Document"));
}

/// 场景：打开命令指向旧安装路径时重写
#[test]
fn stale_command_path_is_rewritten() {
    let mut reg = healthy_reg();
    let old = r"C:\Program Files\TyporaNext\app.exe";
    set(
        &mut reg,
        r"Software\Classes\Markdown Document\shell\open\command",
        "",
        &open_command(old),
    );
    set(
        &mut reg,
        r"Software\Classes\Markdown Document\DefaultIcon",
        "",
        &icon_value(old),
    );

    let ops = plan_repairs(&spec(), EXE, &reader(&reg));

    assert_eq!(ops.len(), 2, "只重写命令和图标：{ops:?}");
    assert!(ops.iter().all(|op| op.value_data.contains(EXE)));
}

/// 场景：关联完好时不做任何写操作
#[test]
fn healthy_association_plans_nothing() {
    let reg = healthy_reg();
    let ops = plan_repairs(&spec(), EXE, &reader(&reg));
    assert_eq!(ops, Vec::<RepairOp>::new());
}

/// 场景：用户已把 .md 默认程序设为其他应用时不劫持
#[test]
fn user_chosen_default_app_is_not_hijacked() {
    let mut reg = healthy_reg();
    // 用户把 .md 默认给了别的应用
    set(&mut reg, r"Software\Classes\.md", "", "OtherApp.md");

    let ops = plan_repairs(&spec(), EXE, &reader(&reg));

    // .md 默认值不被重写
    assert!(!ops
        .iter()
        .any(|op| op.key_path == r"Software\Classes\.md" && op.value_name.is_empty()));
    // ProgID 仍然保持完好（本例中本来就完好，零 ProgID 修复）
    assert!(!ops.iter().any(|op| op
        .key_path
        .starts_with(r"Software\Classes\Markdown Document")));
    // healthy_reg 已含 OpenWithProgids 条目，补一个「缺少」的情形验证追加
    let mut reg2 = healthy_reg();
    set(&mut reg2, r"Software\Classes\.md", "", "OtherApp.md");
    reg2.get_mut(r"Software\Classes\.md\OpenWithProgids")
        .unwrap()
        .remove("Markdown Document");
    let ops2 = plan_repairs(&spec(), EXE, &reader(&reg2));
    assert!(ops2
        .iter()
        .any(|op| op.key_path == r"Software\Classes\.md\OpenWithProgids"
            && op.value_name == "Markdown Document"));
}

/// 场景：OpenWithProgids 只增不删（plan 层面：已有条目不产生删除操作——
/// 我们的操作集本来就没有删除语义，已有其他 ProgID 时仅追加缺失项）
#[test]
fn open_with_progids_is_additive_only() {
    let mut reg = healthy_reg();
    set(
        &mut reg,
        r"Software\Classes\.md\OpenWithProgids",
        "OtherApp.md",
        "",
    );
    reg.get_mut(r"Software\Classes\.md\OpenWithProgids")
        .unwrap()
        .remove("Markdown Document");

    let ops = plan_repairs(&spec(), EXE, &reader(&reg));

    // 只有一条追加操作，且写入位置不动 OtherApp.md 条目
    let open_with_ops: Vec<_> = ops
        .iter()
        .filter(|op| op.key_path == r"Software\Classes\.md\OpenWithProgids")
        .collect();
    assert_eq!(open_with_ops.len(), 1);
    assert_eq!(open_with_ops[0].value_name, "Markdown Document");
}

/// 场景：修复可幂等重复执行
#[test]
fn repair_is_idempotent() {
    let mut reg = HashMap::new();
    let first = plan_repairs(&spec(), EXE, &reader(&reg));
    assert!(!first.is_empty());
    // 应用修复到内存注册表
    for op in &first {
        set(&mut reg, &op.key_path, &op.value_name, &op.value_data);
    }
    let second = plan_repairs(&spec(), EXE, &reader(&reg));
    assert_eq!(second, Vec::<RepairOp>::new());
}

/// 场景：Applications\app.exe 指向开发构建路径（不含 TyporaNext）时重写
/// 2026-09-17 实机 bug：UserChoice 记录 Applications\app.exe →
/// target\release\app.exe（开发构建旧版），应用内更新后双击 .md 仍开旧版。
#[test]
fn dev_build_same_name_exe_is_rewritten() {
    let mut reg = healthy_reg();
    set(
        &mut reg,
        r"Software\Classes\Applications\app.exe\shell\open\command",
        "",
        "\"C:\\CODE\\typora-next\\src-tauri\\target\\release\\app.exe\" \"%1\"",
    );
    let ops = plan_repairs(&spec(), EXE, &reader(&reg));
    let app_ops: Vec<_> = ops
        .iter()
        .filter(|op| op.key_path.contains("Applications"))
        .collect();
    assert_eq!(app_ops.len(), 1, "应重写 Applications 键：{ops:?}");
    assert_eq!(app_ops[0].value_data, open_command(EXE));
}

/// Applications\app.exe 指向无关程序（文件名不同）时不动
#[test]
fn unrelated_applications_key_is_untouched() {
    let mut reg = healthy_reg();
    set(
        &mut reg,
        r"Software\Classes\Applications\app.exe\shell\open\command",
        "",
        "\"C:\\somewhere-else\\other-editor.exe\" \"%1\"",
    );
    let ops = plan_repairs(&spec(), EXE, &reader(&reg));
    assert!(!ops.iter().any(|op| op.key_path.contains("Applications")));
}

// ============================================================
// 真实注册表 round-trip（scratch 键，不影响真实关联）
// ============================================================

#[cfg(windows)]
mod real_registry {
    use super::*;
    use file_assoc::{apply_repairs, ensure_with};
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    // 注意：cargo test 同进程多线程并行，两个真实注册表测试必须使用
    // 各自独立的 scratch 键，否则 delete_subkey_all 的「标记删除」状态
    // 会撞上另一个测试的 create_subkey（os error 1018）。
    const RT_PROG: &str = "TyporaNextSelfHealRT";
    const RT_EXT: &str = ".tnselfrt";
    const APPLY_PROG: &str = "TyporaNextSelfHealApply";

    fn rt_spec() -> AssocSpec {
        AssocSpec {
            prog_id: RT_PROG.to_string(),
            extensions: vec![RT_EXT.to_string()],
        }
    }

    fn cleanup_keys(prog: &str, ext: Option<&str>, app_exe: Option<&str>) {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let _ = hkcu.delete_subkey_all(format!(r"Software\Classes\{prog}"));
        if let Some(e) = ext {
            let _ = hkcu.delete_subkey_all(format!(r"Software\Classes\{e}"));
        }
        if let Some(a) = app_exe {
            let _ = hkcu.delete_subkey_all(format!(r"Software\Classes\Applications\{a}"));
        }
    }

    #[test]
    fn round_trip_real_registry_scratch_keys() {
        cleanup_keys(RT_PROG, Some(RT_EXT), Some("tn-rt.exe"));
        let exe = r"C:\Users\u\AppData\Local\TyporaNext\tn-rt.exe";

        // 第一次：全部缺失 → 修复并写入
        let n = ensure_with(&rt_spec(), exe).expect("first ensure");
        assert!(n > 0, "应有修复写入");

        // 真实注册表验证
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let cmd: String = hkcu
            .open_subkey(format!(r"Software\Classes\{RT_PROG}\shell\open\command"))
            .and_then(|k| k.get_value(""))
            .expect("ProgID 打开命令应存在");
        assert_eq!(cmd, open_command(exe));
        let ext: String = hkcu
            .open_subkey(format!(r"Software\Classes\{RT_EXT}"))
            .and_then(|k| k.get_value(""))
            .expect("扩展名映射应存在");
        assert_eq!(ext, RT_PROG);

        // 幂等：第二次零修复
        let n2 = ensure_with(&rt_spec(), exe).expect("second ensure");
        assert_eq!(n2, 0, "修复后应为零写入（幂等）");

        cleanup_keys(RT_PROG, Some(RT_EXT), Some("tn-rt.exe"));
        // 确认清理干净
        assert!(hkcu
            .open_subkey(format!(r"Software\Classes\{RT_PROG}"))
            .is_err());
    }

    #[test]
    fn apply_repairs_writes_exact_ops() {
        cleanup_keys(APPLY_PROG, None, None);
        let key = format!(r"Software\Classes\{APPLY_PROG}\shell\open\command");
        let ops = vec![RepairOp {
            key_path: key.clone(),
            value_name: String::new(),
            value_data: "\"X:\\fake\\app.exe\" \"%1\"".to_string(),
        }];
        assert_eq!(apply_repairs(&ops).unwrap(), 1);
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let got: String = hkcu
            .open_subkey(&key)
            .and_then(|k| k.get_value(""))
            .unwrap();
        assert_eq!(got, ops[0].value_data);
        cleanup_keys(APPLY_PROG, None, None);
    }
}
