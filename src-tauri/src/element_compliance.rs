//! D/E 层：课程内容元素合规校验（element-compliance）。
//!
//! 生成章节后扫描 `{NN}-*.md`，两类检查：
//! - **D 层（编程代码块）**：对 engineering / humanities 课程，凡出现**非**图表/
//!   纯文本围栏的编程代码块（python / javascript / bash / pseudocode…）即记违规；
//! - **E 层（缺内联 SVG 插图）**：engineering / humanities 章节正文里一个
//!   `<svg>` 块都没有即记违规（skill 要求每章 ≥ 1 张，见 inline-svg-spec.md）。
//!
//! 两类违规都由 `generate_chapters` 后置触发一轮 agent `element-repair` 定向
//! 修复（best-effort）。
//!
//! 纯 std + serde_json，可用 `#[path]` include 测试（不 link app_lib）：
//!   cargo test --test element_compliance_test
//!
//! 设计边界：只抓**可靠信号**——代码块只认围栏、插图只认裸 `<svg>`（围栏内的
//! 不算，不会渲染）；行内 code / 裸伪代码等不可靠信号交给 SKILL.md 骨架 +
//! 模型自检兜底，不做假硬约束。
//!
//! 仅 engineering / humanities 受限；hybrid 计算类小节合法用代码，不硬禁。

/// engineering/humanities 允许的非编程围栏语言（图表 / 纯文本 / LaTeX）。
pub const ALLOWED_NON_CODE_LANGS: [&str; 5] = ["mermaid", "text", "txt", "tex", "latex"];

/// engineering/humanities 每章必须含 ≥ 1 个内联 SVG 插图。
pub fn requires_inline_svg(course_type: &str) -> bool {
    matches!(course_type, "engineering" | "humanities")
}

/// 该 course_type 下，给定围栏语言是否算"应禁止的编程代码块"。
pub fn is_code_block_forbidden(course_type: &str, lang: &str) -> bool {
    if !matches!(course_type, "engineering" | "humanities") {
        return false;
    }
    let l = lang.trim().to_ascii_lowercase();
    // 空标签（未打语言标签的围栏）在受限域下视为编程块 → 违规；
    // 非白名单的其它标签（python/js/bash/go…）同判违规。
    !ALLOWED_NON_CODE_LANGS.contains(&l.as_str())
}

/// 围栏语言检测：行首（去空白后）以 ``` 或 ~~~ 开头 → 返回其余部分 trim 后语言标签。
/// 关闭围栏自身匹配时返回 Some("")；调用方靠 inside/outside 状态区分开关。
fn fence_lang_of(line: &str) -> Option<&str> {
    let t = line.trim();
    if let Some(rest) = t.strip_prefix("```") {
        Some(rest.trim())
    } else if let Some(rest) = t.strip_prefix("~~~") {
        Some(rest.trim())
    } else {
        None
    }
}

/// 一条章节合规违规。
#[derive(Debug, Clone, PartialEq)]
pub struct ElementViolation {
    /// 违规类别：`"code-block"`（D 层编程代码块）或 `"missing-svg-figure"`（E 层缺插图）。
    pub kind: String,
    pub file: String,
    /// 违规围栏语言标签（空串 = 未打标签 / 不适用于缺图）。
    pub lang: String,
    /// opening 围栏所在行（1-based）；缺图违规为 0。
    pub line: usize,
    pub detail: String,
}

/// 扫描单章 Markdown 的编程代码块违规（D 层）。非 engineering/humanities 恒返回空。
pub fn check_chapter(course_type: &str, filename: &str, content: &str) -> Vec<ElementViolation> {
    let mut out = Vec::new();
    if !matches!(course_type, "engineering" | "humanities") {
        return out;
    }

    let mut in_fence = false;
    let mut fence_lang = String::new();
    let mut fence_start = 0usize;

    for (i, line) in content.lines().enumerate() {
        if !in_fence {
            if let Some(lang) = fence_lang_of(line) {
                in_fence = true;
                fence_lang = lang.to_string();
                fence_start = i + 1; // 1-based
            }
        } else if fence_lang_of(line).is_some() {
            // 遇到关闭围栏（或嵌套围栏）→ 结算前一个围栏
            if is_code_block_forbidden(course_type, &fence_lang) {
                let lang_display = if fence_lang.trim().is_empty() {
                    "(未打语言标签)".to_string()
                } else {
                    fence_lang.clone()
                };
                out.push(ElementViolation {
                    kind: "code-block".to_string(),
                    file: filename.to_string(),
                    lang: fence_lang.clone(),
                    line: fence_start,
                    detail: format!(
                        "{course_type} 课程禁止编程代码块：`{lang_display}`（{fence_start} 行起）"
                    ),
                });
            }
            in_fence = false;
        }
        // 注意：文件尾部未闭合的围栏在下面 EOF 处结算
    }

    // EOF：结算未闭合的围栏（未闭合 = 更可能是残留代码块，同样标记）
    if in_fence && is_code_block_forbidden(course_type, &fence_lang) {
        let lang_display = if fence_lang.trim().is_empty() {
            "(未打语言标签)".to_string()
        } else {
            fence_lang.clone()
        };
        out.push(ElementViolation {
            kind: "code-block".to_string(),
            file: filename.to_string(),
            lang: fence_lang.clone(),
            line: fence_start,
            detail: format!(
                "{course_type} 课程禁止编程代码块：`{lang_display}`（{fence_start} 行起，未闭合）"
            ),
        });
    }

    out
}

/// 章节正文（围栏之外）是否含裸 `<svg>` 块。围栏内出现的 `<svg>` 不会渲染，
/// 不算数。大小写不敏感匹配 `<svg` 后接空白或 `>`。
pub fn has_inline_svg(content: &str) -> bool {
    let mut in_fence = false;
    let mut fence_char = ' ';
    for line in content.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed
            .strip_prefix("```")
            .or_else(|| trimmed.strip_prefix("~~~"))
        {
            let ch = trimmed.chars().next().unwrap_or('`');
            if !in_fence {
                in_fence = true;
                fence_char = ch;
            } else if ch == fence_char {
                in_fence = false;
            }
            let _ = rest;
            continue;
        }
        if in_fence {
            continue;
        }
        let lower = line.to_ascii_lowercase();
        if let Some(pos) = lower.find("<svg") {
            let after = lower[pos + 4..].chars().next();
            if after.is_none() || after.is_some_and(|c| c.is_whitespace() || c == '>') {
                return true;
            }
        }
    }
    false
}

/// E 层：engineering/humanities 章节缺内联 SVG 插图 → 单条违规。
/// 非受限类型或已有插图 → None。
pub fn check_svg_figure(
    course_type: &str,
    filename: &str,
    content: &str,
) -> Option<ElementViolation> {
    if !requires_inline_svg(course_type) || has_inline_svg(content) {
        return None;
    }
    let menu = match course_type {
        "engineering" => "设备/槽型剖面、机理微观示意、产线布局、能耗产能对比图",
        _ => "场景重构、空间布局、地理路线、作品构图分析、器物结构",
    };
    Some(ElementViolation {
        kind: "missing-svg-figure".to_string(),
        file: filename.to_string(),
        lang: String::new(),
        line: 0,
        detail: format!(
            "{course_type} 课程章节缺少内联 SVG 插图：请在最合适的小节（如核心直觉/实例段之后）插入 1 张符合 inline-svg-spec 的插图（{menu}），顶格、带浅色底卡、全 inline 属性"
        ),
    })
}
