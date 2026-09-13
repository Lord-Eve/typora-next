//! Learner persona: domain portfolio + analogy material bank.
//!
//! Pure functions only — no tauri, no IO, no LLM. The persona is a *derived
//! cache*: its only source of truth are the per-course completion profiles
//! (`learner_profile::collect_persona_inputs` shape:
//! `{course_path, course_name, concepts: [{name, status}] }`,
//! flat-string concepts also accepted with status "unknown").
//!
//! Included via `#[path]` in tests/persona_prompt_test.rs (app_lib-linked
//! test exes fail on some machines). Run: cargo test --test persona_prompt_test

use serde_json::{json, Value};
use std::collections::HashSet;

/// Hard caps keeping both the persona file and the injected prompt block small.
pub const MAX_DOMAINS: usize = 8;
pub const MAX_ANALOGY_BANK: usize = 40;
const MAX_EXAMPLES_PER_DOMAIN: usize = 6;
const MAX_BANK_SHOWN: usize = 20;
const MAX_RULE_CONCEPTS_PER_COURSE: usize = 15;

/// FNV-1a 64-bit, hex-encoded: stable across processes (unlike DefaultHasher).
/// Only used as a change-detection fingerprint, never as a security primitive.
pub fn fnv1a_hex(input: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in input.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{:016x}", h)
}

fn course_name_of(c: &Value) -> String {
    c.get("course_name")
        .and_then(|v| v.as_str())
        .unwrap_or("未命名课程")
        .to_string()
}

fn course_path_of(c: &Value) -> String {
    c.get("course_path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

/// Concepts of one course as (name, status) pairs. Accepts both entry shapes:
/// `[{name,status}]` (persona inputs) and `["name"]` (legacy panel entries,
/// status → "unknown", which never enters the analogy bank).
fn course_concepts(c: &Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if let Some(arr) = c.get("concepts").and_then(|v| v.as_array()) {
        for it in arr.iter() {
            if let Some(s) = it.as_str() {
                let s = s.trim();
                if !s.is_empty() {
                    out.push((s.to_string(), "unknown".to_string()));
                }
            } else if let Some(name) = it.get("name").and_then(|v| v.as_str()) {
                let name = name.trim();
                if !name.is_empty() {
                    let status = it
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                    out.push((name.to_string(), status));
                }
            }
        }
    }
    out
}

/// Whitelist of every concept name that genuinely appears in the source
/// profiles. LLM output is filtered against this to kill hallucinations.
pub fn collect_valid_concepts(courses: &[Value]) -> HashSet<String> {
    let mut set = HashSet::new();
    for c in courses {
        for (name, _) in course_concepts(c) {
            set.insert(name);
        }
    }
    set
}

/// Prompt asking the LLM to cluster the user's completed-course concepts into
/// at most MAX_DOMAINS knowledge domains with representative concepts.
pub fn build_persona_prompt(courses: &[Value]) -> String {
    let mut listing = String::new();
    for (i, c) in courses.iter().enumerate() {
        let mut mastered: Vec<String> = Vec::new();
        let mut weak: Vec<String> = Vec::new();
        for (name, status) in course_concepts(c) {
            match status.as_str() {
                "mastered" => mastered.push(name),
                "struggling" => weak.push(name),
                _ => mastered.push(name),
            }
        }
        listing.push_str(&format!("{}. {}\n", i + 1, course_name_of(c)));
        if !mastered.is_empty() {
            listing.push_str(&format!("   已掌握：{}\n", mastered.join("、")));
        }
        if !weak.is_empty() {
            listing.push_str(&format!("   薄弱：{}\n", weak.join("、")));
        }
    }

    format!(
        r#"你是学习分析师。下面是某用户全部已完结课程的概念掌握清单：

{listing}
任务：把这些概念聚类为用户的「知识领域」画像（至多 {MAX_DOMAINS} 个领域）。

要求：
- 领域名用简洁中文短语（2~10 字），体现学科方向，如「电子电路」「知识表示与推理」
- 每个领域从输入清单中挑选 3~10 个最有代表性的概念；概念名必须**原样复制自输入清单，禁止发明或改写**
- 跨课程的相近概念合并进同一领域；确实不属于任何领域的概念可以舍弃
- 优先把具有"可迁移结构"（反馈、层级、符号系统这类）的概念归入领域——用户将用这些领域为全新学科打比方

只输出纯 JSON，不要任何解释：
{{"domains":[{{"name":"领域名","concepts":["概念1","概念2"]}}]}}"#,
        listing = listing,
    )
}

/// Locate the JSON object inside a possibly fenced / prose-wrapped response.
fn extract_object(raw: &str) -> Option<Value> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    serde_json::from_str(&raw[start..=end]).ok()
}

/// Parse the LLM persona answer into the persona value.
/// Defensive: whitelist-filtered concepts, global dedup (first domain wins),
/// empty domains dropped, hard caps. `None` → caller falls back to rule_persona.
pub fn parse_persona_response(raw: &str, courses: &[Value]) -> Option<Value> {
    let valid = collect_valid_concepts(courses);

    // concept → (status, course_name, course_path), first owner wins
    let mut lookup: std::collections::HashMap<String, (String, String, String)> =
        std::collections::HashMap::new();
    for c in courses {
        let cname = course_name_of(c);
        let cpath = course_path_of(c);
        for (name, status) in course_concepts(c) {
            lookup
                .entry(name)
                .or_insert_with(|| (status, cname.clone(), cpath.clone()));
        }
    }

    let value = extract_object(raw)?;
    let domains_arr = value.get("domains")?.as_array()?;

    let mut seen: HashSet<String> = HashSet::new();
    let mut domains: Vec<Value> = Vec::new();
    let mut bank: Vec<Value> = Vec::new();

    for d in domains_arr.iter() {
        if domains.len() >= MAX_DOMAINS {
            break;
        }
        let name = d.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        let mut concepts: Vec<Value> = Vec::new();
        let mut paths: Vec<String> = Vec::new();
        let mut names: Vec<String> = Vec::new();
        if let Some(cs) = d.get("concepts").and_then(|v| v.as_array()) {
            for it in cs.iter() {
                let c = match it.as_str() {
                    Some(s) => s.trim().to_string(),
                    None => continue,
                };
                if c.is_empty() || !valid.contains(&c) || seen.contains(&c) {
                    continue;
                }
                let (status, owner, owner_path) = lookup
                    .get(&c)
                    .cloned()
                    .unwrap_or_else(|| ("unknown".to_string(), String::new(), String::new()));
                seen.insert(c.clone());
                if !owner.is_empty() && !names.contains(&owner) {
                    names.push(owner.clone());
                }
                if !owner_path.is_empty() && !paths.contains(&owner_path) {
                    paths.push(owner_path);
                }
                if status == "mastered" && bank.len() < MAX_ANALOGY_BANK {
                    bank.push(json!({
                        "concept": c.clone(),
                        "domain": name,
                        "source_course": owner,
                    }));
                }
                concepts.push(json!({ "name": c, "status": status }));
            }
        }
        if concepts.is_empty() {
            continue;
        }
        domains.push(json!({
            "name": name,
            "concepts": concepts,
            "course_paths": paths,
            "course_names": names,
        }));
    }

    if domains.is_empty() {
        return None;
    }

    Some(json!({
        "version": 1,
        "fingerprint": "",
        "source": "llm",
        "generated_at": 0,
        "domains": domains,
        "analogy_bank": bank,
    }))
}

/// Zero-LLM fallback persona: one domain per course (named after the course),
/// mastered concepts only, same output shape as parse_persona_response.
pub fn rule_persona(courses: &[Value]) -> Value {
    let mut domains: Vec<Value> = Vec::new();
    let mut bank: Vec<Value> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for c in courses {
        let name = course_name_of(c);
        let path = course_path_of(c);
        let mastered: Vec<String> = course_concepts(c)
            .into_iter()
            .filter(|(_, st)| st == "mastered")
            .map(|(n, _)| n)
            .filter(|n| seen.insert(n.clone()))
            .take(MAX_RULE_CONCEPTS_PER_COURSE)
            .collect();
        if mastered.is_empty() {
            continue;
        }
        domains.push(json!({
            "name": name,
            "concepts": mastered.iter().map(|n| json!({"name": n, "status": "mastered"})).collect::<Vec<Value>>(),
            "course_paths": [path],
            "course_names": [name],
        }));
        for m in mastered {
            if bank.len() >= MAX_ANALOGY_BANK {
                break;
            }
            bank.push(json!({ "concept": m, "domain": course_name_of(c), "source_course": course_name_of(c) }));
        }
    }

    json!({
        "version": 1,
        "fingerprint": "",
        "source": "rule",
        "generated_at": 0,
        "domains": domains,
        "analogy_bank": bank,
    })
}

/// Render the persona into the prompt block injected into course planning.
/// `None` when there is nothing to say (no domains) → prompt stays byte-identical.
pub fn render_persona_block(persona: &Value) -> Option<String> {
    let domains = persona.get("domains")?.as_array()?;
    if domains.is_empty() {
        return None;
    }

    let mut lines = String::new();
    for d in domains.iter() {
        let name = d.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let owners: Vec<&str> = d
            .get("course_names")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
            .unwrap_or_default();
        let mut examples: Vec<String> = Vec::new();
        let mut total = 0usize;
        if let Some(cs) = d.get("concepts").and_then(|v| v.as_array()) {
            total = cs.len();
            for it in cs.iter().take(MAX_EXAMPLES_PER_DOMAIN) {
                if let Some(n) = it.get("name").and_then(|v| v.as_str()) {
                    examples.push(n.to_string());
                }
            }
        }
        let owner_txt = if owners.is_empty() {
            String::new()
        } else {
            format!("（来源：{}）", owners.join("、"))
        };
        let mut line = format!("- {}{}：{}", name, owner_txt, examples.join("、"));
        if total > examples.len() {
            line.push_str(&format!("等 {} 个概念", total));
        }
        lines.push_str(&line);
        lines.push('\n');
    }

    let bank: Vec<&str> = persona
        .get("analogy_bank")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|it| it.get("concept").and_then(|v| v.as_str()))
                .take(MAX_BANK_SHOWN)
                .collect()
        })
        .unwrap_or_default();
    let bank_line = if bank.is_empty() {
        String::new()
    } else {
        let more = if bank.len() >= MAX_BANK_SHOWN {
            format!("（共 {} 个，已列 {MAX_BANK_SHOWN}）", bank.len())
        } else {
            String::new()
        };
        format!(
            "类比素材库（用户已掌握、可优先用来打比方的概念）：{}{more}\n",
            bank.join("、")
        )
    };

    Some(format!(
        r#"## 学习者画像（由已完结课程派生，仅影响讲解方式与类比取材）
领域组合：
{lines}{bank_line}
## 类比规则
1. 讲解新概念时，优先从类比素材库挑选载体做比喻；只在结构真正相似时才类比，禁止生搬硬套
2. 画像内「已掌握」的概念不必按零基础展开，可一句带过；但**不得假设用户掌握画像之外的任何领域**
3. 画像不改变用户指定的学习目标、难度级别与总时长

"#,
        lines = lines,
        bank_line = bank_line,
    ))
}
