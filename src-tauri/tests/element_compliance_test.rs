//! Integration tests for element-compliance (D 层) checker.
//!
//! Pure logic lives in src/element_compliance.rs — included via `#[path]` because
//! app_lib-linked test exes fail to start on some machines
//! (STATUS_ENTRYPOINT_NOT_FOUND). Do NOT `#[path]`-include ai_agent.rs.
//!
//! Run with: cargo test --test element_compliance_test

#[path = "../src/element_compliance.rs"]
mod element_compliance;

use element_compliance::{check_chapter, is_code_block_forbidden};

// ---------- is_code_block_forbidden ----------

#[test]
fn technical_allows_programming_code_blocks() {
    assert!(!is_code_block_forbidden("technical", "python"));
    assert!(!is_code_block_forbidden("technical", "rust"));
    assert!(!is_code_block_forbidden("technical", "javascript"));
}

#[test]
fn engineering_bans_programming_code_blocks() {
    assert!(is_code_block_forbidden("engineering", "python"));
    assert!(is_code_block_forbidden("engineering", "python3"));
    assert!(is_code_block_forbidden("engineering", "javascript"));
    assert!(is_code_block_forbidden("engineering", "rust"));
}

#[test]
fn engineering_allows_mermaid_and_plaintext() {
    assert!(!is_code_block_forbidden("engineering", "mermaid"));
    assert!(!is_code_block_forbidden("engineering", "text"));
    assert!(!is_code_block_forbidden("engineering", "txt"));
    assert!(!is_code_block_forbidden("engineering", "tex"));
    assert!(!is_code_block_forbidden("engineering", "latex"));
}

#[test]
fn humanities_bans_programming_code_blocks() {
    assert!(is_code_block_forbidden("humanities", "python"));
    assert!(is_code_block_forbidden("humanities", "go"));
}

#[test]
fn hybrid_allows_programming_code_blocks() {
    // hybrid 计算类小节用 technical 元素（含代码），不做 D 层硬禁
    assert!(!is_code_block_forbidden("hybrid", "python"));
    assert!(!is_code_block_forbidden("hybrid", "javascript"));
}

#[test]
fn unknown_type_is_not_restricted() {
    assert!(!is_code_block_forbidden("something-else", "python"));
}

#[test]
fn empty_lang_is_forbidden_for_engineering() {
    // 未打标签的围栏代码块在 engineering 下视为编程块 → 违规
    assert!(is_code_block_forbidden("engineering", ""));
    assert!(is_code_block_forbidden("engineering", "  "));
}

// ---------- check_chapter ----------

#[test]
fn engineering_flags_python_fence() {
    let md = "正文\n\n```python\nx = 1\n```\n\n结尾";
    let v = check_chapter("engineering", "01-刻蚀.md", md);
    assert_eq!(v.len(), 1, "should flag one code block");
    assert_eq!(v[0].lang, "python");
    assert_eq!(v[0].file, "01-刻蚀.md");
    assert_eq!(v[0].line, 3, "opening fence should be on line 3 (1-based)");
    assert!(v[0].detail.contains("禁止"));
}

#[test]
fn engineering_allows_mermaid_fence() {
    let md = "```mermaid\nflowchart LR\nA-->B\n```";
    let v = check_chapter("engineering", "01.md", md);
    assert!(v.is_empty(), "mermaid fence should not be flagged");
}

#[test]
fn engineering_allows_tex_fence() {
    let md = "```tex\nE = m c^2\n```";
    let v = check_chapter("engineering", "01.md", md);
    assert!(v.is_empty());
}

#[test]
fn technical_never_flags_code_blocks() {
    let md = "```python\nx=1\n```\n```javascript\ny=2\n```";
    let v = check_chapter("technical", "01.md", md);
    assert!(v.is_empty());
}

#[test]
fn engineering_flags_multiple_fences_with_lang_and_line() {
    let md = "## 1.1 简介\n\n```bash\nls\n```\n\n好\n\n```python\na=1\n```";
    let v = check_chapter("engineering", "a.md", md);
    assert_eq!(v.len(), 2);
    assert!(v.iter().any(|x| x.lang == "bash"));
    assert!(v.iter().any(|x| x.lang == "python"));
    assert!(!v.iter().any(|x| x.lang == "mermaid"));
}

#[test]
fn engineering_flags_unclosed_fence_at_open() {
    // 未闭合的围栏也要标记（在 opening 行记录）
    let md = "前文\n```python\nx = 1";
    let v = check_chapter("engineering", "a.md", md);
    assert_eq!(v.len(), 1, "unclosed python fence should be flagged");
}

#[test]
fn engineering_does_not_flag_text_without_fences() {
    let md = "纯文本，没有代码块。电解铝的阳极消耗。";
    let v = check_chapter("engineering", "a.md", md);
    assert!(v.is_empty());
}

#[test]
fn engineering_flags_tilde_fences() {
    let md = "~~~python\nx=1\n~~~";
    let v = check_chapter("engineering", "a.md", md);
    assert_eq!(v.len(), 1, "tilde fences should also be detected");
}

// ---------- E 层：内联 SVG 插图（kind 字段 + 缺图检查） ----------

use element_compliance::{check_svg_figure, has_inline_svg, requires_inline_svg};

#[test]
fn code_block_violations_carry_kind() {
    let md = "```python\nx=1\n```";
    let v = check_chapter("engineering", "a.md", md);
    assert_eq!(v.len(), 1);
    assert_eq!(v[0].kind, "code-block");
}

#[test]
fn requires_inline_svg_matches_d_layer_scope() {
    assert!(requires_inline_svg("engineering"));
    assert!(requires_inline_svg("humanities"));
    assert!(!requires_inline_svg("technical"));
    assert!(!requires_inline_svg("hybrid"));
    assert!(!requires_inline_svg("unknown"));
}

#[test]
fn has_inline_svg_detects_bare_block_outside_fences() {
    assert!(has_inline_svg(
        "正文\n\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 680 300\">\n</svg>\n\n正文"
    ));
    // 大小写不敏感 + 无属性直接闭合
    assert!(has_inline_svg("<SVG>"));
    assert!(has_inline_svg("<svg\n  viewBox=\"0 0 680 300\">"));
}

#[test]
fn has_inline_svg_ignores_svg_inside_fences_and_prose() {
    // 围栏里的 svg 不会渲染，不算
    assert!(!has_inline_svg("```text\n<svg></svg>\n```"));
    // 行内 code / 普通文本里的半个标签不算
    assert!(!has_inline_svg("`<svg` 是 SVG 的开头"));
    assert!(!has_inline_svg("纯文本没有图"));
    // 非标签前缀不算（如 <svgx）
    assert!(!has_inline_svg("<svgx>not an svg</svgx>"));
}

#[test]
fn engineering_chapter_without_svg_is_flagged() {
    let md = "# 01: 电解铝\n\n## 1.1 核心直觉\n\n正文，无图。";
    let v = check_svg_figure("engineering", "01-x.md", md);
    assert!(v.is_some(), "engineering 章节缺 SVG 应违规");
    let v = v.unwrap();
    assert_eq!(v.kind, "missing-svg-figure");
    assert_eq!(v.file, "01-x.md");
    assert_eq!(v.line, 0);
    assert!(v.detail.contains("SVG"));
}

#[test]
fn humanities_chapter_with_svg_is_not_flagged() {
    let md = "## 1.1 莱比锡时期\n\n<svg viewBox=\"0 0 680 300\">\n</svg>\n\n正文。";
    assert!(check_svg_figure("humanities", "02-y.md", md).is_none());
}

#[test]
fn technical_chapters_never_need_svg() {
    assert!(check_svg_figure("technical", "01.md", "无图正文").is_none());
    assert!(check_svg_figure("hybrid", "01.md", "无图正文").is_none());
}

#[test]
fn svg_inside_fence_does_not_satisfy_requirement() {
    let md = "```text\n<svg></svg>\n```";
    assert!(check_svg_figure("humanities", "01.md", md).is_some());
}
