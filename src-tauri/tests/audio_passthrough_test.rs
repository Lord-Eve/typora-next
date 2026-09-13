//! Sprint 26: <audio> 透传回归测试。
//!
//! 人文课试听嵌入依赖 pulldown-cmark 默认放行 raw HTML block（<audio>、
//! 署名 div）。本测试用与 lib.rs render_markdown 相同的 Options 钉死该行为，
//! 防止未来升级 pulldown-cmark 或调整管线时静默破坏播放器。
//!
//! 只依赖 pulldown-cmark 外部 crate，不 link app_lib（本机 app_lib 测试
//! exe 起不来，见 plan_prompt_test.rs 注释）。

use pulldown_cmark::{html, Options, Parser};

fn render(md: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);
    let parser = Parser::new_ext(md, options);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

#[test]
fn audio_block_survives_markdown_render() {
    let md = "前文段落。\n\n<div class=\"audio-embed\">\n  <audio controls preload=\"none\" src=\"https://upload.wikimedia.org/x.ogg\"></audio>\n  <div class=\"audio-credit\">🎧 署名</div>\n</div>\n\n后文段落。\n";
    let html = render(md);
    assert!(html.contains("<audio controls"), "audio 标签被吞: {}", html);
    assert!(
        html.contains("src=\"https://upload.wikimedia.org/x.ogg\""),
        "src 被吞: {}",
        html
    );
    assert!(html.contains("前文段落"), "前文丢失");
    assert!(html.contains("后文段落"), "后文丢失");
}

#[test]
fn fallback_link_card_survives_render() {
    let md = "正文。\n\n<div class=\"audio-embed audio-fallback\">\n  🔎 试听：在 Wikimedia Commons 搜索\n</div>\n";
    let html = render(md);
    assert!(html.contains("audio-fallback"), "降级卡片被吞: {}", html);
}
