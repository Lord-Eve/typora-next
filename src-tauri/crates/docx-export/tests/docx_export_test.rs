use std::path::Path;

fn extract_document_xml(bytes: &[u8]) -> String {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
    let mut file = archive.by_name("word/document.xml").unwrap();
    let mut xml = String::new();
    std::io::Read::read_to_string(&mut file, &mut xml).unwrap();
    xml
}

/// Test basic DOCX export from simple markdown.
#[test]
fn test_basic_paragraph() {
    let md = "Hello, world!";
    let result = docx_export::markdown_to_docx(md, Path::new("."));
    assert!(result.is_ok(), "DOCX generation failed: {:?}", result.err());
    let bytes = result.unwrap();
    assert_eq!(&bytes[0..2], b"PK", "DOCX should be a valid ZIP file");

    let xml = extract_document_xml(&bytes);
    assert!(xml.contains("Hello, world!"));
}

/// Test heading generation.
#[test]
fn test_headings() {
    let md = "# Heading 1\n## Heading 2\n### Heading 3";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains(r#"w:pStyle w:val="Heading1""#));
    assert!(xml.contains(r#"w:pStyle w:val="Heading2""#));
    assert!(xml.contains(r#"w:pStyle w:val="Heading3""#));
    assert!(xml.contains(r#"w:outlineLvl w:val="0""#));
    assert!(xml.contains(r#"w:outlineLvl w:val="1""#));
    assert!(xml.contains(r#"w:outlineLvl w:val="2""#));
}

/// Test bold text.
#[test]
fn test_bold() {
    let md = "**bold**";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("bold"));
    assert!(xml.contains("<w:b />") || xml.contains("<w:b/>"));
}

/// Test italic text.
#[test]
fn test_italic() {
    let md = "*italic*";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("italic"));
    assert!(xml.contains("<w:i />") || xml.contains("<w:i/>"));
}

/// Test strikethrough text.
#[test]
fn test_strikethrough() {
    let md = "~~deleted~~";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("deleted"));
    assert!(xml.contains("<w:strike />") || xml.contains("<w:strike/>"));
}

/// Test nested italic inside bold.
#[test]
fn test_bold_with_italic_nested() {
    let md = "**a *b* c**";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("a"));
    assert!(xml.contains("b"));
    assert!(xml.contains("c"));
    assert!(
        xml.contains("<w:b />") || xml.contains("<w:b/>"),
        "should contain bold property"
    );
    assert!(
        xml.contains("<w:i />") || xml.contains("<w:i/>"),
        "should contain italic property"
    );
}

/// Test code blocks.
#[test]
fn test_code_block() {
    let md = "```rust\nfn main() {}\n```";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    // Syntax highlighting splits the line into token runs.
    assert!(xml.contains("fn"));
    assert!(xml.contains("main"));
    assert!(xml.contains("{"));
    assert!(xml.contains("}"));
    assert!(xml.contains("rust"));
    assert!(xml.contains(r#"w:fill="F5F5F5""#));
    assert!(xml.contains("<w:pBdr>"));
    assert!(xml.contains("Courier New"));
}

/// Test code block layout and syntax-highlighting details.
#[test]
fn test_code_block_styling() {
    let md = "```rust\nfn ok() {}\n```";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(
        xml.contains(r#"<w:spacing w:before="80" w:after="80" w:line="280" w:lineRule="exact""#)
    );
    assert!(xml.contains(r#"<w:ind w:left="160" w:right="160""#));
    assert!(
        xml.contains(r#"<w:color w:val="666666""#),
        "language label should be gray"
    );
    assert!(
        xml.contains(r#"<w:color w:val="D73A49""#),
        "keyword should be highlighted"
    );
}

/// Test inline math export produces valid DOCX with OMML.
#[test]
fn test_inline_math() {
    let md = "Einstein's equation: $E=mc^2$";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<m:oMath"));
    assert!(!xml.contains("%%MATH_"));
}

/// Test block math export produces a standalone paragraph with OMML.
#[test]
fn test_block_math() {
    let md = "The integral:\n\n$$\n\\int_a^b f(x) dx\n$$";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<m:oMathPara"));
    assert!(!xml.contains("%%MATH_"));
}

/// Test math inside a code block is not converted to OMML.
#[test]
fn test_math_not_replaced_in_code_block() {
    let md = "```\n$x$\n```";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    // The raw math marker is tokenized into separate characters but not converted to OMML.
    assert!(xml.contains("$"));
    assert!(xml.contains("x"));
    assert!(!xml.contains("<m:oMath"));
}

/// \sqrt must produce `<m:rad>` with an empty hidden `<m:deg/>` — a missing
/// degree makes Word show an empty-argument placeholder box above the radical.
#[test]
fn test_sqrt_has_hidden_empty_degree() {
    let md = "Quadratic: $\\sqrt{b^2-4ac}$ and nth root $\\sqrt[3]{x}$";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(
        xml.contains(r#"<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>"#),
        "sqrt radical must carry a hidden empty degree"
    );
    // The explicit-degree root keeps its own degree, untouched by the fix.
    assert!(
        xml.contains("<m:rad><m:deg>"),
        "nth root must keep its explicit degree"
    );
    // No double-inserted degrees.
    assert!(
        !xml.contains(r#"<m:deg/>"#.repeat(2).as_str()),
        "degrees must not be duplicated"
    );
}

/// OMML must not nest m:oMath directly inside m:oMath (Word drops such equations).
#[test]
fn test_math_omml_not_nested() {
    let md = "inline $E=mc^2$ here\n\n$$\n\\frac{a}{b}\n$$";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(
        !xml.contains("<m:oMath><m:oMath"),
        "m:oMath must not nest directly inside m:oMath"
    );
    assert!(xml.contains("<m:oMathPara"));
    assert!(!xml.contains("%%MATH_"));
}

/// Test unordered list generation.
#[test]
fn test_unordered_list() {
    let md = "- Item 1\n- Item 2\n- Item 3";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("Item 1"));
    assert!(xml.contains("Item 2"));
    assert!(xml.contains("Item 3"));
    assert!(xml.contains("<w:numPr>"));
    assert!(xml.contains("<w:numId"));
    // Each item must have its text inside the same paragraph as the numbering,
    // not orphaned in a separate text-only paragraph.
    let numpr_count = xml.matches("<w:numPr").count();
    assert_eq!(
        numpr_count, 3,
        "each list item should have its own numPr paragraph"
    );
}

/// Test ordered list generation.
#[test]
fn test_ordered_list() {
    let md = "1. First\n2. Second\n3. Third";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("First"));
    assert!(xml.contains("Second"));
    assert!(xml.contains("Third"));
    assert!(xml.contains("<w:numPr>"));
}

/// Test nested list level.
#[test]
fn test_nested_list() {
    let md = "- Outer\n  - Inner";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("Outer"));
    assert!(xml.contains("Inner"));
    assert!(xml.contains(r#"w:ilvl w:val="1""#));
}

/// Helper to extract a file from the DOCX ZIP.
fn extract_docx_file(bytes: &[u8], path: &str) -> String {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
    let mut file = archive.by_name(path).unwrap();
    let mut content = String::new();
    std::io::Read::read_to_string(&mut file, &mut content).unwrap();
    content
}

/// Test link export creates a real Word hyperlink with proper relationship.
#[test]
fn test_links() {
    let md = "Visit [GitHub](https://github.com)";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);
    let rels = extract_docx_file(&bytes, "word/_rels/document.xml.rels");

    assert!(xml.contains("<w:hyperlink"));
    assert!(xml.contains("GitHub"));
    assert!(
        !xml.contains("https://github.com)"),
        "URL should not be appended as plain text"
    );
    // Verify the hyperlink relationship exists in the rels file.
    // docx-rs generates rIds in the format rIdHyperlink{N}
    let has_hyperlink_rels = rels.contains("rIdHyperlink")
        && rels.contains("github.com")
        && rels.contains("TargetMode=\"External\"");
    assert!(
        has_hyperlink_rels,
        "hyperlink relationship must be present in document.xml.rels"
    );
    // Debug: explicitly verify the specific r:id matches between doc and rels
    let rid_in_doc = xml
        .split("r:id=\"")
        .nth(1)
        .and_then(|s| s.split('"').next())
        .unwrap_or("");
    assert!(
        rels.contains(&format!("Id=\"{}\"", rid_in_doc)),
        "r:id='{}' from doc XML must have matching rel entry",
        rid_in_doc
    );

    // Save the DOCX to a temp file for manual inspection
    let out_path = std::env::temp_dir().join("typora_hyperlink_test.docx");
    std::fs::write(&out_path, &bytes).unwrap();
    eprintln!("Saved DOCX to: {}", out_path.display());

    // Extract and show the hyperlink section of document.xml
    if let Some(href_pos) = xml.find("<w:hyperlink") {
        let start = href_pos;
        let end = xml[start..]
            .find("</w:p>")
            .map(|e| start + e + 6)
            .unwrap_or(xml.len());
        eprintln!("HYPERLINK SECTION in document.xml:");
        eprintln!("{}", &xml[start..end.min(start + 800)]);
    }
    // Show one hyperlink rel entry
    for line in rels.split('>') {
        if line.contains("rIdHyperlink")
            || (line.contains("External") && line.contains("hyperlink"))
        {
            eprintln!("RELS ENTRY: {}>", line);
        }
    }
    assert!(
        rels.contains("github.com"),
        "URL must appear in the relationship target"
    );
    assert!(
        rels.contains("TargetMode=\"External\""),
        "external hyperlinks need TargetMode=External"
    );
}

/// Test hard break uses text wrapping, not page break.
#[test]
fn test_hard_break() {
    let md = "line 1  \nline 2";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains(r#"w:br w:type="textWrapping""#));
    assert!(!xml.contains(r#"w:br w:type="page""#));
}

/// Test mixed content.
#[test]
fn test_mixed_content() {
    let md = r#"# Test Document

This is a paragraph with **bold** and $\\int$ math.

## Section 2

- List item
- Another item

$$
\\sum_{i=1}^n i = \\frac{n(n+1)}{2}
$$
"#;
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains(r#"w:pStyle w:val="Heading1""#));
    assert!(xml.contains(r#"w:pStyle w:val="Heading2""#));
    assert!(xml.contains("List item"));
    assert!(xml.contains("<w:numPr>"));
    assert!(xml.contains("<m:oMath"));
}

/// Test empty document.
#[test]
fn test_empty() {
    let md = "";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    assert_eq!(&bytes[0..2], b"PK");
}

/// Test local image embedding.
#[test]
fn test_local_image() {
    let dir = std::env::temp_dir().join("typora_docx_test_image");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    // Create a tiny 1x1 PNG.
    let png_bytes: Vec<u8> = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60,
        0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0x7A, 0x5E, 0xAB, 0x3F, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let img_path = dir.join("pixel.png");
    std::fs::write(&img_path, &png_bytes).unwrap();

    let md = "![pixel](pixel.png)";
    let bytes = docx_export::markdown_to_docx(md, &dir).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<w:drawing>") || xml.contains("<w:pict>"));

    let _ = std::fs::remove_dir_all(&dir);
}

/// Test Obsidian WikiLink image embedding.
#[test]
fn test_wikilink_image() {
    let dir = std::env::temp_dir().join("typora_docx_test_wiki");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    let png_bytes: Vec<u8> = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60,
        0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0x7A, 0x5E, 0xAB, 0x3F, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    std::fs::write(dir.join("pixel.png"), &png_bytes).unwrap();

    let md = "![[pixel.png]]";
    let bytes = docx_export::markdown_to_docx(md, &dir).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<w:drawing>") || xml.contains("<w:pict>"));

    let _ = std::fs::remove_dir_all(&dir);
}

/// Test basic table generation.
#[test]
fn test_table_basic() {
    let md = "| Name | Value |\n|------|-------|\n| A | 1 |\n| B | 2 |";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<w:tbl>"), "should contain a table");
    assert!(xml.contains("<w:tr>"), "should contain table rows");
    assert!(xml.contains("<w:tc>"), "should contain table cells");
    assert!(xml.contains("Name"));
    assert!(xml.contains("Value"));
    assert!(xml.contains("A"));
    assert!(xml.contains("1"));
}

/// Column widths must reach Word: without `tblGrid`/`tcW` plus a fixed layout
/// Word re-flows every column to its own liking, which is the "表格列宽难看"
/// report. Guards the grid, the layout flag and the body-width total.
#[test]
fn test_table_grid_pins_column_widths() {
    let md = "| 概念 | 说明 | 备注 |\n|------|------|------|\n\
              | RDF | 资源描述框架，用于描述网络资源 | 用于知识图谱 |\n\
              | OWL | Web 本体语言 | 强 |\n\
              | SPARQL | 查询 | 略 |";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(
        xml.contains(r#"<w:tblLayout w:type="fixed" />"#),
        "table must pin its layout, otherwise Word ignores the column widths"
    );

    let cols: Vec<usize> = xml
        .match_indices(r#"<w:gridCol w:w=""#)
        .map(|(i, m)| {
            let rest = &xml[i + m.len()..];
            rest[..rest.find('"').unwrap()].parse().unwrap()
        })
        .collect();
    assert_eq!(cols.len(), 3, "one grid column per markdown column");

    let body: usize = cols.iter().sum();
    assert_eq!(body, 8504, "columns must span the 8504-twip text block");

    // A prose column earns more room than a column of short labels.
    assert!(
        cols[1] > cols[0] && cols[1] > cols[2],
        "the widest column should get the most room, got {cols:?}"
    );

    // Cells carry the same width so the grid is unambiguous.
    let cell_w: usize = {
        let i = xml
            .find(r#"<w:tcW w:w=""#)
            .expect("cells should carry a width");
        let rest = &xml[i + r#"<w:tcW w:w=""#.len()..];
        rest[..rest.find('"').unwrap()].parse().unwrap()
    };
    assert_eq!(
        cell_w, cols[0],
        "first cell width should match the first grid column"
    );
}

/// A one-character index column must still be given room to breathe: Word
/// reserves 108 twips of padding on each side of a cell, so a width derived
/// purely from "#"'s own glyph collapses the column onto its padding.
#[test]
fn test_table_narrow_column_is_not_collapsed() {
    let md = "| # | 模块 | 基线（常规做法） | 本发明的改动 | 为什么改 | 技术效果 |\n\
              |---|------|------------------|--------------|----------|----------|\n\
              | 1 | 状态→评分接口 | 无此接口（评分模型只接收特征图） | 全新增设状态-奖励适配模型：多层全连接 + 激活 + Dropout | 状态向量维度与评分模型所需的特征图格式不匹配 | 打通向量域到评分域的映射；零新增标注 |";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    let cols: Vec<usize> = xml
        .match_indices(r#"<w:gridCol w:w=""#)
        .map(|(i, m)| {
            let rest = &xml[i + m.len()..];
            rest[..rest.find('"').unwrap()].parse().unwrap()
        })
        .collect();
    assert_eq!(cols.len(), 6);

    // Word's per-cell padding is 108 twips a side; the column must clear it by
    // enough for a digit plus a comfortable gap.
    assert!(
        cols[0] >= 216 + 200,
        "index column collapsed to {} twips — barely more than its own cell padding",
        cols[0]
    );
    // The floor must not invert the ordering of the prose columns.
    assert!(
        cols[3] > cols[0] && cols[2] > cols[0],
        "prose columns should still outrank the index column, got {cols:?}"
    );
}

/// Test table column alignment is preserved.
#[test]
fn test_table_alignment() {
    let md = "| Left | Center | Right |\n|:-----|:------:|------:|\n| x | y | z |";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains(r#"w:jc w:val="left""#));
    assert!(xml.contains(r#"w:jc w:val="center""#));
    assert!(xml.contains(r#"w:jc w:val="right""#));
}

/// Test table fills page width and can carry a caption above it.
#[test]
fn test_table_width_and_caption() {
    let md = "表1：示例表格\n\n| Name | Value |\n|------|-------|\n| A | 1 |";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(
        xml.contains(r#"<w:tblW w:w="8504" w:type="dxa""#),
        "table should fill page width"
    );
    assert!(
        xml.contains("示例表格"),
        "caption description should be present"
    );
    assert!(xml.contains("表"), "caption prefix should be present");
    let caption_pos = xml.find("示例表格").expect("caption text missing");
    let table_pos = xml.find("<w:tbl>").expect("table missing");
    assert!(caption_pos < table_pos, "caption should appear above table");
    assert!(
        xml.contains(r#"<w:jc w:val="center""#),
        "caption should be centered"
    );
}

/// Test mermaid code blocks can be replaced with pre-rendered images.
#[test]
fn test_mermaid_block_as_image() {
    let png_bytes: Vec<u8> = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60,
        0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0x7A, 0x5E, 0xAB, 0x3F, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let mut mermaid_images = std::collections::HashMap::new();
    mermaid_images.insert(
        "graph LR\nA --> B".to_string(),
        docx_export::MermaidImage {
            bytes: png_bytes,
            width_px: 8,
            height_px: 8,
        },
    );

    let md = "```mermaid\ngraph LR\nA --> B\n```";
    let bytes =
        docx_export::markdown_to_docx_with_mermaid(md, Path::new("."), &mermaid_images).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<w:drawing>") || xml.contains("<w:pict>"));
    assert!(
        xml.contains(r#"<w:jc w:val="center""#),
        "mermaid image should be centered"
    );
    assert!(
        !xml.contains("graph LR"),
        "mermaid source should not appear as text"
    );
    assert!(
        xml.contains("Mermaid diagram"),
        "mermaid image should have a caption"
    );
}

/// Test mermaid matching normalizes CRLF line endings.
#[test]
fn test_mermaid_block_crlf_normalization() {
    let png_bytes: Vec<u8> = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60,
        0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0x7A, 0x5E, 0xAB, 0x3F, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let mut mermaid_images = std::collections::HashMap::new();
    mermaid_images.insert(
        "graph LR\nA --> B".to_string(),
        docx_export::MermaidImage {
            bytes: png_bytes,
            width_px: 8,
            height_px: 8,
        },
    );

    let md = "```mermaid\r\ngraph LR\r\nA --> B\r\n```";
    let bytes =
        docx_export::markdown_to_docx_with_mermaid(md, Path::new("."), &mermaid_images).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<w:drawing>") || xml.contains("<w:pict>"));
    assert!(
        !xml.contains("graph LR"),
        "mermaid source should not appear as text"
    );
}

/// Test mermaid images are embedded with the logical dimensions provided by the
/// frontend, so a high-resolution PNG can be displayed at the correct Word size.
#[test]
fn test_mermaid_image_uses_logical_dimensions() {
    // A 1x1 PNG that would otherwise render as a tiny image.
    let png_bytes: Vec<u8> = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60,
        0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0x7A, 0x5E, 0xAB, 0x3F, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let mut mermaid_images = std::collections::HashMap::new();
    mermaid_images.insert(
        "graph LR\nA --> B".to_string(),
        docx_export::MermaidImage {
            bytes: png_bytes,
            width_px: 560,
            height_px: 200,
        },
    );

    let md = "```mermaid\ngraph LR\nA --> B\n```";
    let bytes =
        docx_export::markdown_to_docx_with_mermaid(md, Path::new("."), &mermaid_images).unwrap();
    let xml = extract_document_xml(&bytes);

    // 560 px * 9525 EMU/px = 5334000, 200 px * 9525 = 1905000.
    assert!(
        xml.contains(r#"wp:extent cx="5334000" cy="1905000" /"#),
        "inline extent should use the logical dimensions supplied by the caller"
    );
    assert!(
        xml.contains(r#"a:ext cx="5334000" cy="1905000" /"#),
        "graphic extent should use the logical dimensions supplied by the caller"
    );
}

/// Test mermaid images receive a Word-native figure caption below them.
#[test]
fn test_mermaid_image_has_word_caption() {
    let png_bytes: Vec<u8> = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60,
        0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0x7A, 0x5E, 0xAB, 0x3F, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let mut mermaid_images = std::collections::HashMap::new();
    mermaid_images.insert(
        "graph LR\nA --> B".to_string(),
        docx_export::MermaidImage {
            bytes: png_bytes,
            width_px: 8,
            height_px: 8,
        },
    );

    let md = "```mermaid\ngraph LR\nA --> B\n```";
    let bytes =
        docx_export::markdown_to_docx_with_mermaid(md, Path::new("."), &mermaid_images).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(
        xml.contains(r#"w:pStyle w:val="Caption" /"#),
        "caption paragraph should use the Caption style"
    );
    assert!(
        xml.contains("SEQ Figure"),
        "caption should contain a Word SEQ field"
    );
    assert!(
        xml.contains("图"),
        "caption should have a Chinese figure prefix"
    );
    assert!(
        xml.contains("Mermaid diagram"),
        "caption should describe the diagram"
    );

    let img_pos = xml
        .find("<w:drawing>")
        .expect("mermaid image should be present");
    let caption_pos = xml
        .find("Mermaid diagram")
        .expect("caption text should be present");
    assert!(
        img_pos < caption_pos,
        "caption should appear after the image"
    );
}

/// Test mermaid matching tolerates extra blank lines and CRLF line endings.
#[test]
fn test_mermaid_block_normalizes_whitespace() {
    let png_bytes: Vec<u8> = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60,
        0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0x7A, 0x5E, 0xAB, 0x3F, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let mut mermaid_images = std::collections::HashMap::new();
    mermaid_images.insert(
        "graph LR\nA --> B".to_string(),
        docx_export::MermaidImage {
            bytes: png_bytes,
            width_px: 8,
            height_px: 8,
        },
    );

    let md = "```mermaid\r\n\r\ngraph LR\r\nA --> B\r\n\r\n```";
    let bytes =
        docx_export::markdown_to_docx_with_mermaid(md, Path::new("."), &mermaid_images).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(
        xml.contains("<w:drawing>") || xml.contains("<w:pict>"),
        "mermaid image should be embedded despite extra whitespace"
    );
    assert!(
        !xml.contains("graph LR"),
        "mermaid source should not appear as text"
    );
}

/// Test the `mmd` language alias is treated as a Mermaid block.
#[test]
fn test_mermaid_mmd_alias() {
    let png_bytes: Vec<u8> = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60,
        0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0x7A, 0x5E, 0xAB, 0x3F, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let mut mermaid_images = std::collections::HashMap::new();
    mermaid_images.insert(
        "graph LR\nA --> B".to_string(),
        docx_export::MermaidImage {
            bytes: png_bytes,
            width_px: 8,
            height_px: 8,
        },
    );

    let md = "```mmd\ngraph LR\nA --> B\n```";
    let bytes =
        docx_export::markdown_to_docx_with_mermaid(md, Path::new("."), &mermaid_images).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(
        xml.contains("<w:drawing>") || xml.contains("<w:pict>"),
        "mmd alias should be rendered as a mermaid image"
    );
    assert!(
        !xml.contains("graph LR"),
        "mermaid source should not appear as text"
    );
}

/// Test inline math inside a table cell is rendered as OMML, not block OMML.
#[test]
fn test_table_with_math() {
    let md =
        "| Algorithm | Complexity |\n|-----------|------------|\n| Binary Search | $O(\\log n)$ |";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<w:tbl>"));
    assert!(xml.contains("<m:oMath"), "should contain inline OMML math");
    assert!(
        !xml.contains("<m:oMathPara"),
        "table cell math must not be block-level oMathPara"
    );
    assert!(!xml.contains("%%MATH_"), "placeholder should be replaced");
}

/// Test inline code inside a table cell keeps Courier New styling.
#[test]
fn test_table_with_code() {
    let md = "| Command | Description |\n|---------|-------------|\n| `git init` | Initialize |";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<w:tbl>"));
    assert!(xml.contains("git init"));
    assert!(xml.contains("Courier New"));
}

/// Smoke test using samples/full.md: tables and inline math inside tables must render.
#[test]
fn test_full_md_table_and_math() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest_dir
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let full_md_path = project_root.join("samples").join("full.md");
    let base_dir = full_md_path.parent().unwrap();
    let markdown = std::fs::read_to_string(&full_md_path).expect("samples/full.md should exist");

    let bytes = docx_export::markdown_to_docx(&markdown, base_dir).unwrap();
    let xml = extract_document_xml(&bytes);

    // Tables must be real Word tables.
    let table_count = xml.matches("<w:tbl>").count();
    assert!(
        table_count >= 3,
        "full.md should contain at least 3 tables, found {}",
        table_count
    );

    // Inline math inside table cells must be OMML, not leftover placeholders.
    assert!(xml.contains("<m:oMath"), "should contain inline OMML math");
    assert!(
        !xml.contains("%%MATH_"),
        "no math placeholder should remain"
    );

    // Code inside table cells should keep monospace font.
    assert!(xml.contains("Courier New"));
}

/// Debug: print code block XML.
#[test]
#[ignore = "debug only"]
fn test_debug_code_block_xml() {
    let md = "```rust\nfn main() {}\n```";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);
    eprintln!("=== CODE BLOCK XML ===");
    eprintln!("{}", xml);
}

/// Debug: print events for nested blockquote code block.
#[test]
#[ignore = "debug only"]
fn test_debug_blockquote_events() {
    let md = "> Mixed content:\n>\n> ```python\n> print(\"Code in blockquote\")\n> ```\n";
    eprintln!("=== PARSER EVENTS ===");
    let parser = pulldown_cmark::Parser::new_ext(md, pulldown_cmark::Options::all());
    for (event, range) in parser.into_offset_iter() {
        let text = &md[range.clone()];
        eprintln!("  {:?} ({:?}) `{}`", event, range, text.escape_debug());
    }
}

/// Test blockquote is rendered with a left border bar.
#[test]
fn test_blockquote_left_border() {
    let md = "> Simple blockquote.";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);
    eprintln!("BLOCKQUOTE XML: {}", xml);
    // Must include a left border paragraph.
    assert!(
        xml.contains("<w:pBdr>"),
        "blockquote paragraph must have borders"
    );
    assert!(xml.contains("w:left"), "must have a left border line");
    assert!(
        xml.contains(r#"w:color="808080""#),
        "color must be set so the bar is visible"
    );
}

/// Test nested unordered list with deep indentation.
#[test]
fn test_deep_nested_list() {
    let md = "- A\n  - B\n    - C";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);
    // Verify each item's text is inside a numbered paragraph.
    assert!(xml.contains("A"));
    assert!(xml.contains("B"));
    assert!(xml.contains("C"));
    // Deep nested should be ilvl=2.
    assert!(xml.contains(r#"w:ilvl w:val="2""#));
    // No empty paragraphs with just numbering.
    assert!(
        xml.contains("<w:t xml:space=\"preserve\">A</w:t>"),
        "text must be inside a run"
    );
    assert!(xml.contains("<w:t xml:space=\"preserve\">B</w:t>"));
    assert!(xml.contains("<w:t xml:space=\"preserve\">C</w:t>"));
}

/// Test bold text inside a list item.
#[test]
fn test_list_with_bold() {
    let md = "- **bold item**";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<w:t xml:space=\"preserve\">bold item</w:t>"));
    assert!(
        xml.contains("<w:b />") || xml.contains("<w:b/>"),
        "bold should be preserved in list items"
    );
}

/// Test [toc] is converted to a Word TOC field.
#[test]
fn test_toc_placeholder() {
    let md = "# Heading 1\n\n[toc]\n\nSome text";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    // Should NOT contain %%TOC%% as text
    assert!(
        !xml.contains("%%TOC%%"),
        "%%TOC%% must not remain as plain text"
    );
    // Should NOT contain literal [toc]
    assert!(
        !xml.contains("[toc]"),
        "[toc] must not appear as plain text"
    );

    // Must contain the TOC field instruction with proper structure
    assert!(
        xml.contains("<w:instrText"),
        "must have field instruction element"
    );
    assert!(
        xml.contains("TOC \\o"),
        "TOC instruction must specify heading levels, got XML that contains TOC"
    );
}

/// Test [TOC] uppercase variant is also detected.
#[test]
fn test_toc_uppercase() {
    let md = "# Heading 1\n\n[TOC]\n\nSome text\n\nMore";
    let protected = docx_export::replace_toc_placeholder(md);
    assert!(
        protected.contains("%%TOC%%"),
        "uppercase [TOC] should be replaced"
    );
}

/// Test [toc] on a Windows CRLF file is detected (the `$` anchor must not be
/// defeated by the trailing `\r`).
#[test]
fn test_toc_crlf() {
    let md = "# Heading 1\r\n\r\n[toc]\r\n\r\nSome text";
    let protected = docx_export::replace_toc_placeholder(md);
    assert!(
        protected.contains("%%TOC%%"),
        "[toc] on CRLF line endings must be replaced, got: {:?}",
        protected
    );

    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);
    assert!(
        !xml.contains("[toc]"),
        "literal [toc] must not appear in the DOCX"
    );
    assert!(
        xml.contains("<w:instrText"),
        "TOC field instruction must be present in the DOCX"
    );
}

/// Test [toc] with leading/trailing spaces is detected.
#[test]
fn test_toc_with_spaces() {
    let md = "# H\n\n  [toc]  \n\ntext";
    let protected = docx_export::replace_toc_placeholder(md);
    assert!(
        protected.contains("%%TOC%%"),
        "[toc] with surrounding spaces must be replaced, got: {:?}",
        protected
    );
}

/// Test a hand-written TOC section ("## 目录" + numbered list) is replaced by
/// a Word TOC field, and the hand-typed entries are removed from the body.
#[test]
fn test_handwritten_toc_section() {
    let md = "# 启机模型数据预处理验收文档\n\n\
## 目录\n\n\
1. 项目背景、数据说明与验收范围\n\
2. 预处理算法能力总览\n\
3. 数据表结构定义\n\n\
## 1. 项目背景、数据说明与验收范围\n\n\
本次验收面向机组启机过程的离线复盘。\n\n\
## 2. 预处理算法能力总览\n\n\
本章从业务目标与价值说明预处理算法。\n";

    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    // Must contain the TOC field instruction.
    assert!(
        xml.contains("<w:instrText"),
        "hand-written TOC section must become a Word TOC field"
    );
    // The hand-written entries must be dropped (they only exist as headings now).
    // "预处理算法能力总览" appears once as the H2 heading, and must NOT also
    // appear as a numbered list item.
    let occurrences = xml.matches("预处理算法能力总览").count();
    assert_eq!(
        occurrences, 1,
        "hand-written TOC entry must be removed (only the real heading remains), found {}",
        occurrences
    );
    // No list numbering should remain where the hand TOC was.
    // (The document has no other lists, so no numPr should exist at all.)
    assert!(
        !xml.contains("<w:numPr>"),
        "hand-written TOC list items must not produce numbered list markup"
    );
    // Body headings are still headings.
    assert!(xml.contains(r#"w:pStyle w:val="Heading2""#));
}

/// Test a "目录" heading WITHOUT a following list also becomes a TOC field.
#[test]
fn test_handwritten_toc_heading_only() {
    let md = "# Title\n\n## 目录\n\n## 第一章\n\n内容\n";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(
        xml.contains("<w:instrText"),
        "bare 目录 heading must still become a Word TOC field"
    );
    assert!(
        xml.contains("第一章"),
        "following body heading must be preserved"
    );
}

/// Test a bullet-style hand-written TOC is also collapsed.
#[test]
fn test_handwritten_toc_bullet_list() {
    let md = "# Title\n\n## 目录\n\n- 第一章\n- 第二章\n\n## 第一章\n\n内容\n";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(xml.contains("<w:instrText"));
    assert!(
        !xml.contains("<w:numPr>"),
        "bullet TOC entries must be removed"
    );
}

/// Test that a heading whose text merely CONTAINS 目录 as part of a longer
/// title is NOT treated as a TOC section.
#[test]
fn test_toc_heading_exact_match_only() {
    let md = "# 附录目录结构说明\n\n正文内容\n";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let xml = extract_document_xml(&bytes);

    assert!(
        !xml.contains("<w:instrText"),
        "longer heading containing 目录 must NOT become a TOC field"
    );
    assert!(xml.contains("附录目录结构说明"));
}

/// Test the exported DOCX asks Word to update fields on open (for TOC).
#[test]
fn test_update_fields_on_open() {
    let md = "# Heading 1\n\n[toc]\n\nSome text";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).unwrap();
    let mut settings = String::new();
    std::io::Read::read_to_string(
        &mut archive.by_name("word/settings.xml").unwrap(),
        &mut settings,
    )
    .unwrap();
    assert!(
        settings.contains("updateFields"),
        "settings.xml must contain <w:updateFields w:val=\"true\"/> so Word regenerates the TOC on open"
    );
}

/// Test TOC paragraph styles (toc 1..5) with dot-leader tabs are injected into
/// styles.xml so Word renders a native-looking table of contents.
#[test]
fn test_toc_styles_injected() {
    let md = "# Heading 1\n\n[toc]\n\nSome text";
    let bytes = docx_export::markdown_to_docx(md, Path::new(".")).unwrap();
    let styles_xml = extract_docx_file(&bytes, "word/styles.xml");

    for level in 1..=5 {
        assert!(
            styles_xml.contains(&format!("w:styleId=\"TOC{}\"", level)),
            "styles.xml must define the toc {} style",
            level
        );
    }
    assert!(
        styles_xml.contains("w:leader=\"dot\""),
        "toc styles must have dot-leader tab stops"
    );
    assert!(
        styles_xml.contains("w:pos=\"8504\""),
        "toc styles must right-align page numbers at the body width (8504 twips)"
    );

    // The TOC field paragraph must end with a page break (body starts on a new
    // page), and must NOT begin with one (TOC stays on the title's page).
    let doc_xml = extract_document_xml(&bytes);
    let fld_begin = doc_xml
        .find("w:fldCharType=\"begin\"")
        .expect("field begin");
    let fld_end = doc_xml.find("w:fldCharType=\"end\"").expect("field end");
    let page_break = doc_xml.find("w:type=\"page\"").expect("page break");
    assert!(
        page_break > fld_end,
        "page break must come AFTER the field end (body starts on next page)"
    );
    assert!(
        page_break > fld_begin,
        "sanity: page break after field begin"
    );
    // "目录" caption text must be present before the field.
    assert!(doc_xml.contains("目"), "TOC caption text should be present");
}

/// Create a test PNG image at the given dimensions.
fn create_test_png(width: u32, height: u32) -> Vec<u8> {
    use std::io::Cursor;
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut encoder = png::Encoder::new(&mut cursor, width, height);
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        let pixel_data: Vec<u8> = vec![255u8; (width * 3 * height) as usize];
        writer.write_image_data(&pixel_data).unwrap();
    }
    cursor.into_inner()
}

/// Test image wider than MAX_IMAGE_WIDTH_PX is constrained.
#[test]
fn test_image_size_constrained() {
    let dir = std::env::temp_dir().join("typora_docx_test_image_constrain");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    // Create a 2000×1000 synthetic PNG image (wider than MAX_IMAGE_WIDTH_PX = 566).
    let png_bytes = create_test_png(2000, 1000);
    let img_path = dir.join("wide.png");
    std::fs::write(&img_path, &png_bytes).unwrap();

    let md = &format!("![wide]({})", img_path.display());
    let bytes = docx_export::markdown_to_docx(md, &dir).unwrap();
    let xml = extract_document_xml(&bytes);

    // 566px * 9525 EMU/px = 5391150, height scaled: 566 * 1000/2000 = 283px → 283 * 9525 = 2695575
    assert!(
        xml.contains(r#"cx="5391150""#),
        "image width should fill the 566px body width (5391150 EMU)"
    );
    assert!(
        xml.contains(r#"cy="2695575""#),
        "image height should be proportionally scaled"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

/// A narrow image is enlarged so figures keep a consistent size across a
/// document, but only up to MAX_IMAGE_UPSCALE — a 32px icon must not be
/// smeared across the page.
#[test]
fn test_small_image_upscale_is_capped() {
    let dir = std::env::temp_dir().join("typora_docx_test_small");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    // 32×32 small image
    let png_bytes = create_test_png(32, 32);
    let img_path = dir.join("small.png");
    std::fs::write(&img_path, &png_bytes).unwrap();

    let md = &format!("![small]({})", img_path.display());
    let bytes = docx_export::markdown_to_docx(md, &dir).unwrap();
    let xml = extract_document_xml(&bytes);

    // 32px enlarged 2× = 64px → 64 * 9525 = 609600 EMU.
    assert!(
        xml.contains(r#"cx="609600""#),
        "small image should be enlarged 2× only: expected 609600 EMU"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

/// A portrait image must be bounded by the page height as well: capping only
/// the width lets a tall screenshot grow far past the bottom margin.
#[test]
fn test_tall_image_capped_to_page_height() {
    let dir = std::env::temp_dir().join("typora_docx_test_tall");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    // 500×3000: width alone would allow 566px, making it 3396px (35in) tall.
    let png_bytes = create_test_png(500, 3000);
    std::fs::write(dir.join("tall.png"), &png_bytes).unwrap();

    let md = "![tall](tall.png)";
    let bytes = docx_export::markdown_to_docx(md, &dir).unwrap();
    let xml = extract_document_xml(&bytes);

    // Height capped at 800px → 7620000 EMU, width back-computed as 133px.
    assert!(
        xml.contains(r#"cy="7620000""#),
        "tall image height should be capped to the text block"
    );
    assert!(
        xml.contains(r#"cx="1266825""#),
        "width should shrink with the height to keep the aspect ratio"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

/// An image between the upscale cap and the body width fills the page, so a
/// 400px diagram is not left stranded at two thirds of the text width.
#[test]
fn test_medium_image_fills_body_width() {
    let dir = std::env::temp_dir().join("typora_docx_test_medium");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    let png_bytes = create_test_png(400, 200);
    std::fs::write(dir.join("medium.png"), &png_bytes).unwrap();

    let md = "![medium](medium.png)";
    let bytes = docx_export::markdown_to_docx(md, &dir).unwrap();
    let xml = extract_document_xml(&bytes);

    // 400px → 566px (body width) → 5391150 EMU; height 566 * 200/400 = 283px.
    assert!(
        xml.contains(r#"cx="5391150""#),
        "a 400px image should be widened to the body width"
    );

    let _ = std::fs::remove_dir_all(&dir);
}
