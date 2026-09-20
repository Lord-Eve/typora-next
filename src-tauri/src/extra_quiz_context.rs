//! Context for extra questions: "what is this question about?"
//!
//! An extra question is generated per Cornell cue, and the stem often points
//! at that cue's highlighted selection ("关于这段…查询"). The review modal
//! shows only the stem and the options, so the selection has to travel with
//! the question — otherwise the referent is invisible and the question cannot
//! be answered.
//!
//! Kept in its own module (no crate-internal deps) so it can be exercised by
//! `tests/extra_quiz_context_test.rs` via `#[path]`.

use std::path::Path;

/// Read the learner's highlighted selection out of a cue's explanation file.
///
/// Returns `None` when the file is missing, unparseable, has no
/// `selected_text`, or the selection is blank — in which case the question
/// simply renders without a context block.
pub fn read_cue_selection(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let conversation: serde_json::Value = serde_json::from_str(&content).ok()?;
    let text = conversation.get("selected_text")?.as_str()?.trim();
    (!text.is_empty()).then(|| text.to_string())
}
