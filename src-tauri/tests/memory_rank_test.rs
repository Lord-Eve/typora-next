//! Integration tests for agent-driven memory ranking (Sprint 21 v2).
//!
//! Pure logic lives in src/memory_rank.rs — included via `#[path]` because
//! app_lib-linked test exes fail to start on some machines
//! (STATUS_ENTRYPOINT_NOT_FOUND). Do NOT `#[path]`-include ai_agent.rs.
//!
//! Run with: cargo test --test memory_rank_test

#[path = "../src/memory_rank.rs"]
mod memory_rank;

use memory_rank::{build_rank_prompt, parse_rank_response};
use serde_json::{json, Value};

fn course(path: &str, name: &str, concepts: &[&str]) -> Value {
    json!({ "course_path": path, "course_name": name, "concepts": concepts })
}

fn known(paths: &[&str]) -> Vec<String> {
    paths.iter().map(|s| s.to_string()).collect()
}

// ---------- build_rank_prompt ----------

#[test]
fn test_prompt_contains_goal_and_every_course_name_and_path() {
    let courses = vec![
        course("C:/a", "OWL 基础", &["本体", "描述逻辑"]),
        course("C:/b", "Rust 所有权", &[]),
    ];
    let p = build_rank_prompt("知识图谱推理", &courses);
    assert!(p.contains("知识图谱推理"));
    assert!(p.contains("OWL 基础"));
    assert!(p.contains("C:/a"));
    assert!(p.contains("Rust 所有权"));
    assert!(p.contains("C:/b"));
}

#[test]
fn test_prompt_caps_concepts_at_twelve() {
    let many: Vec<String> = (0..15).map(|i| format!("概念{i}")).collect();
    let refs: Vec<&str> = many.iter().map(|s| s.as_str()).collect();
    let courses = vec![course("C:/x", "大课程", &refs)];
    let p = build_rank_prompt("目标", &courses);
    assert!(p.contains("概念0"));
    assert!(p.contains("概念11"));
    assert!(!p.contains("概念12"), "concepts beyond 12 must be capped");
}

#[test]
fn test_prompt_requires_score_reason_json_contract() {
    let courses = vec![course("C:/a", "A", &["x"])];
    let p = build_rank_prompt("g", &courses);
    assert!(p.contains("course_path"));
    assert!(p.contains("score"));
    assert!(p.contains("reason"));
}

// ---------- parse_rank_response ----------

#[test]
fn test_parse_plain_array_sorted_desc() {
    let raw = r#"[{"course_path":"C:/b","score":40,"reason":"少"},{"course_path":"C:/a","score":90,"reason":"多"}]"#;
    let out = parse_rank_response(raw, &known(&["C:/a", "C:/b", "C:/c"]));
    assert_eq!(out.len(), 2);
    assert_eq!(out[0]["course_path"], "C:/a");
    assert_eq!(out[0]["score"], 90);
    assert_eq!(out[1]["course_path"], "C:/b");
}

#[test]
fn test_parse_accepts_code_fenced_json() {
    let raw = "```json\n[{\"course_path\":\"C:/a\",\"score\":70,\"reason\":\"r\"}]\n```";
    let out = parse_rank_response(raw, &known(&["C:/a"]));
    assert_eq!(out.len(), 1);
    assert_eq!(out[0]["score"], 70);
}

#[test]
fn test_parse_accepts_prose_wrapped_json() {
    let raw = "分析如下：\n好的，结果：[{\"course_path\":\"C:/a\",\"score\":10,\"reason\":\"弱\"}] 希望有帮助";
    let out = parse_rank_response(raw, &known(&["C:/a"]));
    assert_eq!(out.len(), 1);
}

#[test]
fn test_parse_accepts_object_wrapped_ranked_key() {
    let raw = r#"{"ranked":[{"course_path":"C:/a","score":55,"reason":"r"}]}"#;
    let out = parse_rank_response(raw, &known(&["C:/a"]));
    assert_eq!(out.len(), 1);
    assert_eq!(out[0]["score"], 55);
}

#[test]
fn test_parse_drops_unknown_hallucinated_paths() {
    let raw = r#"[{"course_path":"C:/ghost","score":99,"reason":"幻觉"}]"#;
    let out = parse_rank_response(raw, &known(&["C:/a"]));
    assert!(out.is_empty());
}

#[test]
fn test_parse_dedups_first_wins() {
    let raw = r#"[{"course_path":"C:/a","score":90,"reason":"first"},{"course_path":"C:/a","score":10,"reason":"second"}]"#;
    let out = parse_rank_response(raw, &known(&["C:/a"]));
    assert_eq!(out.len(), 1);
    assert_eq!(out[0]["score"], 90);
    assert_eq!(out[0]["reason"], "first");
}

#[test]
fn test_parse_clamps_out_of_range_and_invalid_scores() {
    let raw = r#"[
        {"course_path":"C:/hi","score":150},
        {"course_path":"C:/lo","score":-20},
        {"course_path":"C:/nan","score":"abc"}
    ]"#;
    let out = parse_rank_response(raw, &known(&["C:/hi", "C:/lo", "C:/nan"]));
    assert_eq!(out.len(), 3);
    assert_eq!(out[0]["course_path"], "C:/hi");
    assert_eq!(out[0]["score"], 100);
    assert_eq!(out[1]["score"], 0);
    assert_eq!(out[2]["score"], 0);
}

#[test]
fn test_parse_defaults_missing_reason_to_empty() {
    let raw = r#"[{"course_path":"C:/a","score":60}]"#;
    let out = parse_rank_response(raw, &known(&["C:/a"]));
    assert_eq!(out[0]["reason"], "");
}

#[test]
fn test_parse_garbage_or_empty_returns_empty() {
    assert!(parse_rank_response("完全不是 JSON", &known(&["C:/a"])).is_empty());
    assert!(parse_rank_response("", &known(&["C:/a"])).is_empty());
    assert!(parse_rank_response("[]", &known(&["C:/a"])).is_empty());
    assert!(parse_rank_response(r#"[{"score":1}]"#, &known(&["C:/a"])).is_empty());
}

#[test]
fn test_parse_stable_within_equal_scores() {
    let raw = r#"[
        {"course_path":"C:/a","score":50},
        {"course_path":"C:/b","score":50},
        {"course_path":"C:/c","score":50}
    ]"#;
    let out = parse_rank_response(raw, &known(&["C:/a", "C:/b", "C:/c"]));
    let paths: Vec<&str> = out
        .iter()
        .map(|v| v["course_path"].as_str().unwrap())
        .collect();
    assert_eq!(paths, vec!["C:/a", "C:/b", "C:/c"]);
}
