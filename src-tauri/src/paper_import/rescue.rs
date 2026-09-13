//! Agent-based batch rescue for failed paper imports.
//!
//! 用户原则：错误不是终点——全部失败条目（url/title/error 全文）一次性交给
//! agent 判断规划（批量视角：系统性 429 → 统一换源；单篇无 OA → 搜替代源），
//! agent 把每篇的候选下载地址写进 scratch JSON，Rust 读回后逐篇用候选重试。
//!
//! Module is self-contained (only `super::resolve`) so integration tests can
//! #[path]-include it, same pattern as resolve.rs.

use serde::Deserialize;

/// One entry in the agent's rescue scratch file.
#[derive(Debug, Clone, Deserialize)]
pub struct RescueAttempt {
    pub url: String,
    #[serde(default)]
    pub candidates: Vec<String>,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Deserialize)]
struct RescueFile {
    #[serde(default)]
    attempts: Vec<RescueAttempt>,
}

/// Parse the agent-written scratch JSON (`{"attempts": [...]}`).
/// Missing `attempts` key = empty (agent found nothing salvageable).
pub fn parse_rescue_result(json: &str) -> Result<Vec<RescueAttempt>, String> {
    let file: RescueFile =
        serde_json::from_str(json).map_err(|e| format!("解析 agent 补救结果失败: {}", e))?;
    Ok(file.attempts)
}

/// Validate an agent-proposed candidate URL: only http/https (agents can
/// hallucinate file:// or worse), plus the known OJS view→download upgrade.
pub fn sanitize_candidate(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return None;
    }
    Some(super::resolve::upgrade_candidate_url(trimmed))
}

/// Combined error shown for a paper that STILL failed after the agent rescue
/// pass: original error + what the agent tried + why it didn't work.
pub fn combine_failure_error(
    original: &str,
    notes: &str,
    candidates: &[String],
    last_error: &str,
) -> String {
    let mut msg = format!("{}；agent 补救", original);
    if candidates.is_empty() {
        if notes.is_empty() {
            msg.push_str("：未找到替代源");
        } else {
            msg.push_str(&format!("：{}", notes));
        }
    } else {
        msg.push_str(&format!("尝试 {} 个候选源仍失败", candidates.len()));
        let mut parts = Vec::new();
        if !notes.is_empty() {
            parts.push(notes.to_string());
        }
        if !last_error.is_empty() {
            parts.push(last_error.to_string());
        }
        if !parts.is_empty() {
            msg.push_str(&format!("（{}）", parts.join("；")));
        }
    }
    msg
}
