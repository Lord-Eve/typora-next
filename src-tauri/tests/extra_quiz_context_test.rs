//! Integration test for the extra-question context module.
//!
//! Guards the half of the fix that lives outside the browser: if the highlighted
//! selection stops reaching the question, the modal silently renders a stem
//! that points at nothing — which is the bug this module exists to prevent.
//!
//! Run with: cargo test --test extra_quiz_context_test

#[path = "../src/extra_quiz_context.rs"]
mod extra_quiz_context;

use extra_quiz_context::read_cue_selection;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn temp_dir(tag: &str) -> PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("eqc-test-{}-{}", tag, n));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn write_cue(dir: &Path, name: &str, body: &str) -> PathBuf {
    let p = dir.join(name);
    std::fs::write(&p, body).expect("write cue file");
    p
}

/// The real shape of `.learning/explanations/{chapter}/cue-N.json`: the
/// selection sits next to the Q&A history, and the question refers to it.
#[test]
fn reads_selection_from_a_real_cue_file() {
    let dir = temp_dir("real");
    let p = write_cue(
        &dir,
        "cue-3.json",
        r#"{
          "id": "cue-3",
          "selected_text": "SELECT ?d ?usdPerOz ?cnyPerGram WHERE {\n  ?l gp:hasMarket gp:LBMAMarket ;\n}",
          "anchor": null,
          "qa_history": [{"q": "?", "a": "…", "ts": "2026-09-20T02:00:00.000Z"}],
          "created_at": "2026-09-20T02:00:00.000Z"
        }"#,
    );

    let got = read_cue_selection(&p).expect("划选内容必须被读出来");
    assert!(got.starts_with("SELECT ?d ?usdPerOz ?cnyPerGram"), "got: {got}");
    assert!(got.contains('\n'), "换行必须保留——代码块渲染依赖它");
    assert!(got.contains("gp:LBMAMarket"));
    let _ = std::fs::remove_dir_all(&dir);
}

/// A cue whose explanation was never generated (or was deleted) must degrade to
/// "no context block", not to a panic or an empty string.
#[test]
fn absent_file_yields_none() {
    let dir = temp_dir("absent");
    assert!(read_cue_selection(&dir.join("cue-9.json")).is_none());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn blank_or_structurally_broken_input_yields_none() {
    let dir = temp_dir("broken");

    let blank = write_cue(&dir, "blank.json", r#"{"selected_text":"   \n\t "}"#);
    assert!(read_cue_selection(&blank).is_none(), "纯空白不应渲染空块");

    let no_field = write_cue(&dir, "nofield.json", r#"{"id":"cue-1"}"#);
    assert!(read_cue_selection(&no_field).is_none());

    let not_json = write_cue(&dir, "bad.json", "这不是 JSON");
    assert!(read_cue_selection(&not_json).is_none());

    let not_a_string = write_cue(&dir, "num.json", r#"{"selected_text":42}"#);
    assert!(read_cue_selection(&not_a_string).is_none());

    let _ = std::fs::remove_dir_all(&dir);
}

/// Whitespace around the selection is trimmed, but interior whitespace is not —
/// a one-line code fragment keeps its alignment (`gp:hasUnit      gp:Gram ;`).
#[test]
fn trims_edges_but_keeps_interior_whitespace() {
    let dir = temp_dir("ws");
    let p = write_cue(
        &dir,
        "cue-1.json",
        r#"{"selected_text":"\n  gp:hasUnit       gp:Gram ;\n  "}"#,
    );
    assert_eq!(
        read_cue_selection(&p).as_deref(),
        Some("gp:hasUnit       gp:Gram ;")
    );
    let _ = std::fs::remove_dir_all(&dir);
}
