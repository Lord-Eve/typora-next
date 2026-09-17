//! 案例研习会话的落盘与检索（`.learning/case-studies/{name}.json`）。
//!
//! 为什么独立成模块：文件名即会话身份。历史会话「继续对话」要靠它**覆盖原文件**，
//! 否则每续聊一次就在历史里多出一条重复记录（旧的 N 轮 + 新的 N+M 轮）。
//! 这个身份规则同时带着目录穿越的校验责任，必须可测——而 lib.rs 里的 tauri
//! command 无法用 `#[path]` 单测（app_lib 链接的测试 exe 在部分机器起不来）。

use serde_json::Value;
use std::path::{Path, PathBuf};

/// 新建会话的文件名：`{ended_at 去冒号/点}.json`。
pub fn default_session_file_name(session: &Value) -> String {
    let ended = session
        .get("ended_at")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .replace([':', '.'], "-");
    format!("{}.json", ended)
}

/// 校验前端回传的原会话文件名。
///
/// 只接受纯文件名（单一路径分量、非 `.`/`..`、`.json` 结尾）。续聊覆盖写盘会直接
/// 用这个值当文件名，而它绕了一圈前端，必须在落盘前挡住目录穿越。
pub fn sanitize_session_file_name(name: &str) -> Option<String> {
    let path = Path::new(name);
    if path.components().count() != 1 {
        return None;
    }
    let file = path.file_name()?.to_str()?;
    if file == "." || file == ".." || !file.ends_with(".json") {
        return None;
    }
    Some(file.to_string())
}

/// 落盘文件名：优先沿用原文件（续聊覆盖），非法或缺失则按 `ended_at` 新建。
pub fn resolve_session_file_name(session: &Value, overwrite_file: Option<&str>) -> String {
    overwrite_file
        .and_then(sanitize_session_file_name)
        .unwrap_or_else(|| default_session_file_name(session))
}

pub fn sessions_dir(project_path: &str) -> PathBuf {
    Path::new(project_path)
        .join(".learning")
        .join("case-studies")
}

/// 写会话，返回落盘路径。
///
/// `overwrite_file` 是续聊时前端回传的原文件名；为空则按 `ended_at` 新建文件。
pub fn save_session(
    project_path: &str,
    session: &Value,
    overwrite_file: Option<&str>,
) -> Result<PathBuf, String> {
    let dir = sessions_dir(project_path);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 case-studies 目录失败: {}", e))?;
    let path = dir.join(resolve_session_file_name(session, overwrite_file));
    let json = serde_json::to_string_pretty(session)
        .map_err(|e| format!("序列化 case study session 失败: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("写入 case study session 失败: {}", e))?;
    Ok(path)
}

/// 列出会话（按 `ended_at` 新→旧），并给每条注入 `file` 字段。
///
/// 前端把 `file` 原样回传给 `save_session`，用来覆盖同一个文件而不是新增一条
/// 重复的历史记录。
pub fn list_sessions(project_path: &str) -> Result<Vec<Value>, String> {
    let dir = sessions_dir(project_path);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let entries =
        std::fs::read_dir(&dir).map_err(|e| format!("读取 case-studies 目录失败: {}", e))?;

    let mut sessions = vec![];
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let file_name = match path.file_name().and_then(|s| s.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(mut v) = serde_json::from_str::<Value>(&content) {
                if let Some(obj) = v.as_object_mut() {
                    obj.insert("file".to_string(), Value::String(file_name));
                }
                sessions.push(v);
            }
        }
    }

    // 文件名即 ISO 时间戳，按 ended_at 倒序（新→旧）
    sessions.sort_by(|a, b| {
        let ea = a.get("ended_at").and_then(|v| v.as_str()).unwrap_or("");
        let eb = b.get("ended_at").and_then(|v| v.as_str()).unwrap_or("");
        eb.cmp(ea)
    });
    Ok(sessions)
}
