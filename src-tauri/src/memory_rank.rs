//! Agent-driven relevance ranking for cross-course memory.
//!
//! When the user types a learning goal in the create dialog, the frontend
//! asks Rust to rank the indexed completed courses by relevance so the
//! memory panel can float matching history to the top (user may reject).
//!
//! Prompt building + response parsing live here as pure functions; the
//! ureq call itself stays in ai_agent.rs (mirrors plan_course_llm).
//! Parsing is defensive: unknown (hallucinated) course paths are dropped,
//! scores clamp to 0..=100, ties keep input order — the panel must never
//! break because the LLM misbehaved.

use serde_json::{json, Value};

/// Concepts shown per course in the ranking prompt (keeps the prompt small
/// even with many courses; the profile itself stores all of them).
const MAX_CONCEPTS_PER_COURSE: usize = 12;

/// Build the ranking prompt. `courses` are `list_course_entries` items:
/// `{course_path, course_name, concepts: [String]}`.
pub fn build_rank_prompt(goal: &str, courses: &[Value]) -> String {
    let mut list = String::new();
    for (i, c) in courses.iter().enumerate() {
        let name = c
            .get("course_name")
            .and_then(|v| v.as_str())
            .unwrap_or("未命名课程");
        let path = c.get("course_path").and_then(|v| v.as_str()).unwrap_or("");
        let concepts: Vec<&str> = c
            .get("concepts")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str())
                    .take(MAX_CONCEPTS_PER_COURSE)
                    .collect()
            })
            .unwrap_or_default();
        list.push_str(&format!(
            "{}. {}（path: {}）\n   概念：{}\n",
            i + 1,
            name,
            path,
            if concepts.is_empty() {
                "（无）".to_string()
            } else {
                concepts.join("、")
            }
        ));
    }
    format!(
        "用户在规划一门新课程，学习目标是：「{goal}」\n\n\
         历史已完结课程：\n{list}\n\
         请评估每门历史课程对该目标的相关性（0-100 整数）。主题、技术栈或前置知识重叠越多分越高；完全无关给 0。\n\
         严格只输出一个 JSON 数组（不要 markdown 代码块之外的任何文字）：\n\
         [{{\"course_path\":\"必须逐字使用上面给出的 path\",\"score\":85,\"reason\":\"一句话中文理由\"}}]"
    )
}

/// Parse the LLM ranking output defensively against the known course paths.
///
/// Returns objects `{course_path, score, reason}` sorted by score descending
/// (stable within equal scores). Unknown paths, duplicates (first wins) and
/// unparseable payloads degrade to fewer items / empty vec — never an error,
/// ranking is an enhancement only.
pub fn parse_rank_response(raw: &str, known_paths: &[String]) -> Vec<Value> {
    let Some(items) = extract_array(raw) else {
        return Vec::new();
    };
    let mut seen: Vec<&str> = Vec::new();
    let mut out: Vec<Value> = Vec::new();
    for it in items.iter() {
        let Some(path) = it.get("course_path").and_then(|v| v.as_str()) else {
            continue;
        };
        // drop hallucinated paths; dedup keeping the first occurrence
        if !known_paths.iter().any(|k| k == path) || seen.contains(&path) {
            continue;
        }
        seen.push(path);
        let score = it
            .get("score")
            .and_then(|v| v.as_f64())
            .map(|s| s.clamp(0.0, 100.0).round() as u64)
            .unwrap_or(0);
        let reason = it
            .get("reason")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        out.push(json!({ "course_path": path, "score": score, "reason": reason }));
    }
    // LLM 未必按分数排序输出；sort_by_key 是稳定排序，同分保持原顺序
    out.sort_by_key(|v| std::cmp::Reverse(v.get("score").and_then(|s| s.as_u64()).unwrap_or(0)));
    out
}

/// Locate the JSON array in the response: bare, code-fenced, or prose-
/// wrapped; also accepts `{"ranked": [...]}` object shape.
fn extract_array(raw: &str) -> Option<Vec<Value>> {
    let trimmed = raw.trim();
    if let Ok(Value::Array(a)) = serde_json::from_str::<Value>(trimmed) {
        return Some(a);
    }
    if let (Some(s), Some(e)) = (trimmed.find('['), trimmed.rfind(']')) {
        if e > s {
            if let Ok(Value::Array(a)) = serde_json::from_str::<Value>(&trimmed[s..=e]) {
                return Some(a);
            }
        }
    }
    if let (Some(s), Some(e)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if e > s {
            if let Ok(v) = serde_json::from_str::<Value>(&trimmed[s..=e]) {
                if let Some(a) = v.get("ranked").and_then(|r| r.as_array()) {
                    return Some(a.clone());
                }
            }
        }
    }
    None
}
