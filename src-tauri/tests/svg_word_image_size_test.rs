//! Integration tests for Word-export mermaid/svg image sizing.
//!
//! Verifies that small intrinsic SVGs are scaled up to the Word page width
//! (566 px) instead of staying tiny, while preserving aspect ratio.
//!
//! Run with: cargo test --test svg_word_image_size_test

#[path = "../src/docx_template.rs"]
mod docx_template;

use docx_template::render_svg_to_mermaid_image;

const TINY_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
  <rect width="100" height="50" fill="red"/>
</svg>
"#;

const WIDE_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200">
  <rect width="800" height="200" fill="blue"/>
</svg>
"#;

#[test]
fn tiny_svg_is_upscaled_to_page_width() {
    let img = render_svg_to_mermaid_image(TINY_SVG).expect("tiny svg must render");
    assert_eq!(img.width_px, 566, "小 svg 应该放大到 566px 页面宽度");
    assert_eq!(img.height_px, 283, "高度按 2:1 比例缩放为 283px");
    // PNG 物理分辨率应高于显示尺寸（RENDER_SCALE = 3）
    let (w, h) = image_dimensions(&img.bytes).expect("输出必须是有效 PNG");
    assert_eq!(w, 566 * 3, "PNG 宽度应为 566*3=1698");
    assert_eq!(h, 283 * 3, "PNG 高度应为 283*3=849");
}

#[test]
fn wide_svg_is_capped_to_page_width() {
    let img = render_svg_to_mermaid_image(WIDE_SVG).expect("wide svg must render");
    assert_eq!(img.width_px, 566, "过宽 svg 应被限制到 566px");
    assert_eq!(img.height_px, 142, "高度按 4:1 比例缩放为 142px");
}

/// A portrait `flowchart TB` must be bounded by height, not width. Scaling one
/// to the body width multiplies its height: an 11-step flowchart at 1:2.8 came
/// out 566×1593 px — 16.6 inches tall against a 9.13-inch text block.
#[test]
fn tall_svg_is_capped_to_page_height() {
    let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 566 1593">
      <rect width="566" height="1593" fill="orange"/>
    </svg>"#;
    let img = render_svg_to_mermaid_image(svg).expect("tall svg must render");

    assert_eq!(
        img.height_px, 800,
        "竖长图必须被高度上限截住，而不是撑到 1593px"
    );
    // 566 × 800/1593 = 284.2 → 284，宽度由高度反推，比例不变。
    assert_eq!(img.width_px, 284, "宽度按同一比例回缩，保持宽高比");
    assert!(
        (img.width_px as f64 / img.height_px as f64 - 566.0 / 1593.0).abs() < 0.002,
        "宽高比必须保持"
    );
}

#[test]
fn square_svg_keeps_aspect_ratio() {
    let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="green"/>
    </svg>"#;
    let img = render_svg_to_mermaid_image(svg).expect("square svg must render");
    assert_eq!(img.width_px, 566);
    assert_eq!(img.height_px, 566);
}

#[test]
fn invalid_svg_returns_error() {
    let result = render_svg_to_mermaid_image("not svg");
    assert!(result.is_err());
}

fn image_dimensions(bytes: &[u8]) -> Result<(u32, u32), String> {
    // Minimal PNG IHDR parser: offset 16, width/height are each 4 bytes big-endian.
    if bytes.len() < 24 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("not a PNG".to_string());
    }
    let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    Ok((w, h))
}
