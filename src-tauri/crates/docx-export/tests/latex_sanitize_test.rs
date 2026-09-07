//! TDD tests for sanitize_latex (Sprint 25).
//!
//! 背景：真 LaTeX 中间距命令后裸上下标（`\,^`）合法，KaTeX 报
//! "Got group of unknown type: 'internal'"。sanitize 在间距命令与
//! ^ / _ 之间插入空基元 {}，使公式同时兼容真 LaTeX 与 KaTeX。

use docx_export::{extract_math_blocks, sanitize_latex, MathBlock};

// ---------- 核心规则：四类间距命令 × 上下标 ----------

#[test]
fn thin_space_before_superscript_gets_empty_base() {
    assert_eq!(sanitize_latex(r"a\,^b"), r"a\,{}^b");
}

#[test]
fn thick_space_before_subscript_gets_empty_base() {
    assert_eq!(sanitize_latex(r"a\;_i"), r"a\;{}_i");
}

#[test]
fn medium_space_before_superscript_gets_empty_base() {
    assert_eq!(sanitize_latex(r"a\:^2"), r"a\:{}^2");
}

#[test]
fn negative_space_before_superscript_gets_empty_base() {
    assert_eq!(sanitize_latex(r"a\!^b"), r"a\!{}^b");
}

// ---------- 真实病灶：semiconductor 课程三段公式 ----------

#[test]
fn real_world_siothermal_formula() {
    let src =
        r"\mathrm{SiO_2 + 2C \xrightarrow{\;1800\sim2000\,^\circ\mathrm{C}\;} Si + 2CO \uparrow}";
    let out = sanitize_latex(src);
    assert!(out.contains(r"\,{}^\circ"), "got: {}", out);
    // 其余部分不动
    assert!(out.contains(r"\xrightarrow{\;1800\sim2000\"));
    assert!(out.contains(r"SiO_2"));
}

#[test]
fn real_world_hcl_formula_with_comma() {
    let src = r"\mathrm{Si + 3HCl \xrightarrow{\;\sim 300\,^\circ\mathrm{C},\; Cu\;} SiHCl_3 \uparrow + H_2 \uparrow}";
    let out = sanitize_latex(src);
    assert!(out.contains(r"\,{}^\circ"), "got: {}", out);
}

// ---------- 幂等 / 不越界 ----------

#[test]
fn already_has_empty_base_unchanged() {
    let src = r"a\,{}^b";
    assert_eq!(sanitize_latex(src), src);
}

#[test]
fn normal_superscript_unchanged() {
    let src = r"x^2 + y_1";
    assert_eq!(sanitize_latex(src), src);
}

#[test]
fn control_space_before_superscript_unchanged() {
    // `\ `（控制空格）在 KaTeX 中可正常接 ^，不属于 internal 节点，不动
    let src = r"a\ ^b";
    assert_eq!(sanitize_latex(src), src);
}

#[test]
fn spacing_command_not_before_script_unchanged() {
    let src = r"a\,b\;c\:d\!e";
    assert_eq!(sanitize_latex(src), src);
}

#[test]
fn idempotent_on_second_pass() {
    let src = r"a\,^b\;_c";
    let once = sanitize_latex(src);
    assert_eq!(sanitize_latex(&once), once);
}

#[test]
fn whitespace_between_command_and_script_still_fixed() {
    // LaTeX 会吞掉命令后的空白，KaTeX 同样炸；空白保留、{} 紧跟命令插入
    let out = sanitize_latex("a\\, ^b");
    assert_eq!(out, "a\\,{} ^b");
}

// ---------- 提取链路接线 ----------

#[test]
fn extract_math_blocks_sanitizes_inline_content() {
    let text = r"反应温度 $1800\,^\circ$C 很高";
    let blocks = extract_math_blocks(text);
    assert_eq!(blocks.len(), 1);
    match &blocks[0].2 {
        MathBlock::Inline(c) => assert_eq!(c, r"1800\,{}^\circ"),
        other => panic!("expected inline, got {:?}", other),
    }
}

#[test]
fn extract_math_blocks_sanitizes_block_content() {
    let text = "$$\n\\mathrm{A \\xrightarrow{\\;100\\,^\\circ C} B}\n$$";
    let blocks = extract_math_blocks(text);
    assert_eq!(blocks.len(), 1);
    match &blocks[0].2 {
        MathBlock::Block(c) => assert!(c.contains(r"\,{}^\circ"), "got: {}", c),
        other => panic!("expected block, got {:?}", other),
    }
}

// ---------- DOCX 导出回归：sanitize 后 latex2mathml 链路不炸 ----------

#[test]
fn docx_export_regression_with_sanitized_math() {
    let md = "# 标题\n\n$$\n\\mathrm{SiO_2 + 2C \\xrightarrow{\\;1800\\sim2000\\,^\\circ\\mathrm{C}\\;} Si + 2CO \\uparrow}\n$$\n";
    let bytes = docx_export::markdown_to_docx(md, std::path::Path::new(".")).unwrap();
    assert!(!bytes.is_empty());
}
