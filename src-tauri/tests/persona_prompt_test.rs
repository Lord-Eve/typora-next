//! Integration tests for the learner persona pure module (Sprint 23).
//!
//! Pure logic lives in src/persona_prompt.rs — included via `#[path]` because
//! app_lib-linked test exes fail to start on some machines
//! (STATUS_ENTRYPOINT_NOT_FOUND). Do NOT `#[path]`-include ai_agent.rs.
//!
//! Run with: cargo test --test persona_prompt_test

#[path = "../src/persona_prompt.rs"]
mod persona_prompt;

use persona_prompt::{
    build_persona_prompt, collect_valid_concepts, fnv1a_hex, parse_persona_response,
    render_persona_block, rule_persona, MAX_ANALOGY_BANK, MAX_DOMAINS,
};
use serde_json::{json, Value};

fn course(path: &str, name: &str, mastered: &[&str], weak: &[&str]) -> Value {
    let mut cs: Vec<Value> = Vec::new();
    for m in mastered {
        cs.push(json!({ "name": m, "status": "mastered" }));
    }
    for w in weak {
        cs.push(json!({ "name": w, "status": "struggling" }));
    }
    json!({ "course_path": path, "course_name": name, "concepts": cs })
}

fn domains_json(items: &[(&str, &[&str])]) -> String {
    let arr: Vec<Value> = items
        .iter()
        .map(|(name, cs)| {
            json!({
                "name": name,
                "concepts": cs.iter().map(|c| c.to_string()).collect::<Vec<_>>(),
            })
        })
        .collect();
    json!({ "domains": arr }).to_string()
}

// ---------- fnv1a_hex ----------

#[test]
fn test_fnv_is_stable_16_hex_chars() {
    let a = fnv1a_hex("学习者画像指纹");
    let b = fnv1a_hex("学习者画像指纹");
    assert_eq!(a, b, "fingerprint must be reproducible across calls");
    assert_eq!(a.len(), 16);
    assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
fn test_fnv_differs_on_different_input() {
    assert_ne!(fnv1a_hex("course-a"), fnv1a_hex("course-b"));
    assert_ne!(fnv1a_hex(""), fnv1a_hex(" "));
}

// ---------- collect_valid_concepts ----------

#[test]
fn test_collect_valid_handles_both_concept_shapes() {
    let courses = vec![
        course("C:/a", "甲课", &["概念一"], &["概念二"]),
        json!({ "course_path": "C:/b", "course_name": "乙课", "concepts": ["概念三", ""] }),
    ];
    let valid = collect_valid_concepts(&courses);
    assert!(valid.contains("概念一"));
    assert!(valid.contains("概念二"), "struggling concepts are real too");
    assert!(valid.contains("概念三"), "flat string concepts accepted");
    assert!(!valid.contains(""), "blank names dropped");
}

// ---------- build_persona_prompt ----------

#[test]
fn test_prompt_contains_every_course_and_concept_and_json_contract() {
    let courses = vec![
        course(
            "C:/a",
            "电工学入门",
            &["反馈环路", "阻抗匹配"],
            &["麦克斯韦方程"],
        ),
        course("C:/b", "owl的学习和使用", &["描述逻辑"], &[]),
    ];
    let p = build_persona_prompt(&courses);
    for token in [
        "电工学入门",
        "反馈环路",
        "阻抗匹配",
        "麦克斯韦方程",
        "owl的学习和使用",
        "描述逻辑",
    ] {
        assert!(p.contains(token), "prompt must contain {token}");
    }
    assert!(
        p.contains("domains"),
        "prompt must state the JSON output key"
    );
    assert!(
        p.contains("原样") || p.contains("禁止发明"),
        "prompt must forbid invented concepts"
    );
    assert!(
        p.contains("至多 8") || p.contains("≤ 8"),
        "prompt must state domain cap"
    );
}

// ---------- parse_persona_response ----------

#[test]
fn test_parse_plain_object_builds_persona() {
    let courses = vec![course(
        "C:/a",
        "电工学入门",
        &["反馈环路"],
        &["麦克斯韦方程"],
    )];
    let raw = domains_json(&[("电子电路", &["反馈环路", "麦克斯韦方程"])]);
    let p = parse_persona_response(&raw, &courses).expect("valid persona");
    assert_eq!(p["source"], "llm");
    assert_eq!(p["domains"].as_array().unwrap().len(), 1);
    let d = &p["domains"][0];
    assert_eq!(d["name"], "电子电路");
    assert_eq!(d["course_names"].as_array().unwrap().len(), 1);
    assert_eq!(d["course_paths"][0], "C:/a");
    // mastered + struggling both stay in domain concept list
    assert_eq!(d["concepts"].as_array().unwrap().len(), 2);
    // analogy bank = mastered only
    let bank = p["analogy_bank"].as_array().unwrap();
    assert_eq!(bank.len(), 1);
    assert_eq!(bank[0]["concept"], "反馈环路");
    assert_eq!(bank[0]["source_course"], "电工学入门");
}

#[test]
fn test_parse_accepts_fenced_and_prose_wrapped() {
    let courses = vec![course("C:/a", "甲", &["x1"], &[])];
    let inner = domains_json(&[("域A", &["x1"])]);
    let fenced = format!("```json\n{inner}\n```");
    let prose = format!("好的，分析如下：\n{inner}\n希望有帮助。");
    assert!(parse_persona_response(&fenced, &courses).is_some());
    assert!(parse_persona_response(&prose, &courses).is_some());
}

#[test]
fn test_parse_drops_hallucinated_concepts() {
    let courses = vec![course("C:/a", "甲", &["真概念"], &[])];
    let raw = domains_json(&[("域A", &["真概念", "量子纠缠是瞎编的"])]);
    let p = parse_persona_response(&raw, &courses).unwrap();
    let names: Vec<&str> = p["domains"][0]["concepts"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["真概念"]);
    assert_eq!(p["analogy_bank"].as_array().unwrap().len(), 1);
}

#[test]
fn test_parse_dedups_concept_first_domain_wins() {
    let courses = vec![
        course("C:/a", "甲", &["共享"], &[]),
        course("C:/b", "乙", &["独有乙"], &[]),
    ];
    let raw = domains_json(&[("域一", &["共享"]), ("域二", &["共享", "独有乙"])]);
    let p = parse_persona_response(&raw, &courses).unwrap();
    let ds = p["domains"].as_array().unwrap();
    assert_eq!(ds[0]["concepts"].as_array().unwrap().len(), 1);
    assert_eq!(ds[1]["concepts"].as_array().unwrap().len(), 1);
    assert_eq!(ds[1]["concepts"][0]["name"], "独有乙");
    assert_eq!(p["analogy_bank"].as_array().unwrap().len(), 2);
}

#[test]
fn test_parse_drops_domains_empty_after_filter_and_none_when_all_garbage() {
    let courses = vec![course("C:/a", "甲", &["真"], &[])];
    let raw = domains_json(&[("瞎编域", &["不存在"])]);
    assert!(parse_persona_response(&raw, &courses).is_none());
    assert!(parse_persona_response("这不是 JSON", &courses).is_none());
    assert!(parse_persona_response("[]", &courses).is_none());
    assert!(parse_persona_response("", &courses).is_none());
}

#[test]
fn test_parse_caps_domains_and_bank() {
    let mut courses = Vec::new();
    let mut doms: Vec<(String, Vec<String>)> = Vec::new();
    for i in 0..(MAX_DOMAINS + 4) {
        courses.push(course(
            &format!("C:/{i}"),
            &format!("课{i}"),
            &[&format!("概念{i}")],
            &[],
        ));
        doms.push((format!("域{i}"), vec![format!("概念{i}")]));
    }
    let raw = {
        let arr: Vec<Value> = doms
            .iter()
            .map(|(n, cs)| json!({ "name": n, "concepts": cs }))
            .collect();
        json!({ "domains": arr }).to_string()
    };
    let p = parse_persona_response(&raw, &courses).unwrap();
    assert_eq!(p["domains"].as_array().unwrap().len(), MAX_DOMAINS);

    // one domain claiming 50 valid mastered concepts → bank clamps to 40
    let big: Vec<String> = (0..50).map(|i| format!("c{i}")).collect();
    let courses2: Vec<Value> = vec![course(
        "C:/x",
        "大课",
        &big.iter().map(String::as_str).collect::<Vec<_>>(),
        &[],
    )];
    let raw2 = {
        let cs: Vec<&str> = big.iter().map(String::as_str).collect();
        domains_json(&[("全域", &cs)])
    };
    let p2 = parse_persona_response(&raw2, &courses2).unwrap();
    assert_eq!(
        p2["analogy_bank"].as_array().unwrap().len(),
        MAX_ANALOGY_BANK
    );
}

// ---------- rule_persona ----------

#[test]
fn test_rule_persona_one_domain_per_course_mastered_only_bank() {
    let courses = vec![
        course("C:/a", "电工学入门", &["反馈环路"], &["麦克斯韦方程"]),
        course("C:/b", "owl的学习和使用", &["描述逻辑", "本体"], &[]),
    ];
    let p = rule_persona(&courses);
    assert_eq!(p["source"], "rule");
    let ds = p["domains"].as_array().unwrap();
    assert_eq!(ds.len(), 2);
    assert_eq!(ds[0]["name"], "电工学入门");
    assert_eq!(
        ds[0]["concepts"].as_array().unwrap().len(),
        1,
        "domain keeps mastered only"
    );
    let bank = p["analogy_bank"].as_array().unwrap();
    assert_eq!(bank.len(), 3);
}

#[test]
fn test_rule_persona_empty_courses_has_no_domains() {
    let p = rule_persona(&[]);
    assert!(p["domains"].as_array().unwrap().is_empty());
    assert!(render_persona_block(&p).is_none());
}

// ---------- render_persona_block ----------)

#[test]
fn test_render_contains_domains_bank_and_directives() {
    let courses = vec![course("C:/a", "电工学入门", &["反馈环路", "阻抗匹配"], &[])];
    let raw = domains_json(&[("电子电路", &["反馈环路", "阻抗匹配"])]);
    let p = parse_persona_response(&raw, &courses).unwrap();
    let block = render_persona_block(&p).unwrap();
    assert!(block.contains("学习者画像"));
    assert!(block.contains("电子电路"));
    assert!(block.contains("反馈环路"));
    assert!(
        block.contains("类比"),
        "must instruct the model to use analogy material"
    );
    assert!(
        block.contains("不得假设") || block.contains("不假设"),
        "must bound out-of-persona assumptions"
    );
}

#[test]
fn test_render_none_on_empty_domains() {
    let p = json!({ "source": "llm", "domains": [], "analogy_bank": [] });
    assert!(render_persona_block(&p).is_none());
    assert!(render_persona_block(&json!({})).is_none());
}

#[test]
fn test_render_caps_examples_per_domain() {
    // 全部为薄弱概念 → 类比素材库为空，段落里只可能出现领域示例行
    let big: Vec<String> = (0..12).map(|i| format!("c{i}")).collect();
    let big_refs: Vec<&str> = big.iter().map(String::as_str).collect();
    let courses = vec![course("C:/x", "大课", &[], &big_refs)];
    let raw = domains_json(&[("全域", &big_refs)]);
    let p = parse_persona_response(&raw, &courses).unwrap();
    let block = render_persona_block(&p).unwrap();
    assert!(block.contains("c5"), "first 6 examples kept");
    assert!(
        !block.contains("c6"),
        "per-domain example list must cap at 6"
    );
    assert!(block.contains("等"), "truncation must be marked");
}
