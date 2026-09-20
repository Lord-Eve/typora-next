//! Integration tests for case study session storage identity.
//!
//! 纯逻辑在 src/case_study_store.rs —— 用 `#[path]` include，
//! 因为 app_lib 链接的测试 exe 在部分机器起不来（见 decisions.md）。
//!
//! Run with: cargo test --test case_study_store_test

#[path = "../src/case_study_store.rs"]
mod case_study_store;

use case_study_store::{
    default_session_file_name, list_sessions, resolve_session_file_name,
    sanitize_session_file_name, save_session, sessions_dir, sessions_dir_kind,
};
use serde_json::json;
use std::fs;
use std::path::PathBuf;

fn tmp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "case_study_store_test_{}_{}",
        std::process::id(),
        tag
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn session(ended_at: &str, turns: usize) -> serde_json::Value {
    json!({
        "version": "1.0",
        "selected_text": "rdfs:domain",
        "chapter_file": "00-ch.md",
        "session_id": "s-1",
        "turns": (0..turns).map(|i| json!({ "role": "tutor", "content": format!("t{}", i) })).collect::<Vec<_>>(),
        "started_at": "2026-08-11T09:00:00",
        "ended_at": ended_at,
        "end_reason": "user_ended"
    })
}

// ============================================
// 文件名身份
// ============================================
#[test]
fn default_file_name_derives_from_ended_at() {
    let s = session("2026-08-11T09:00:00.123Z", 1);
    assert_eq!(
        default_session_file_name(&s),
        "2026-08-11T09-00-00-123Z.json"
    );
}

#[test]
fn overwrite_file_wins_over_ended_at() {
    let s = session("2026-09-17T10:00:00Z", 1);
    assert_eq!(
        resolve_session_file_name(&s, Some("2026-08-11T09-00-00.json")),
        "2026-08-11T09-00-00.json"
    );
}

#[test]
fn illegal_overwrite_file_falls_back_to_new_name() {
    let s = session("2026-09-17T10:00:00Z", 1);
    // 目录穿越 / 非文件名 → 必须回落到 ended_at 新建，绝不能落盘到目录外
    for bad in ["../../evil.json", "sub/dir.json", "..", "notes.txt", ""] {
        assert_eq!(
            resolve_session_file_name(&s, Some(bad)),
            "2026-09-17T10-00-00Z.json",
            "bad overwrite_file should be rejected: {:?}",
            bad
        );
    }
}

#[test]
fn sanitize_accepts_only_plain_json_basenames() {
    assert_eq!(
        sanitize_session_file_name("2026-08-11T09-00-00.json").as_deref(),
        Some("2026-08-11T09-00-00.json")
    );
    assert_eq!(sanitize_session_file_name("../x.json"), None);
    assert_eq!(sanitize_session_file_name("a/b.json"), None);
    assert_eq!(sanitize_session_file_name("x.txt"), None);
    assert_eq!(sanitize_session_file_name(".."), None);
}

// ============================================
// 落盘 / 列表
// ============================================
#[test]
fn save_creates_new_file_named_by_ended_at() {
    let root = tmp_dir("save_new");
    let path = root.to_str().unwrap();
    let s = session("2026-08-11T09:00:00", 2);

    let written = save_session(path, "case-studies", &s, None).unwrap();
    assert_eq!(
        written.file_name().unwrap().to_str().unwrap(),
        "2026-08-11T09-00-00.json"
    );
    assert!(written.exists());
}

#[test]
fn resume_overwrites_the_same_file_without_duplicating_history() {
    let root = tmp_dir("resume_overwrite");
    let path = root.to_str().unwrap();

    let first = session("2026-08-11T09:00:00", 2);
    save_session(path, "case-studies", &first, None).unwrap();

    // 续聊：沿用原文件名，内容变成 4 轮、ended_at 换新
    let resumed = session("2026-09-17T10:00:00", 4);
    save_session(path, "case-studies", &resumed, Some("2026-08-11T09-00-00.json")).unwrap();

    let files: Vec<_> = fs::read_dir(sessions_dir(path))
        .unwrap()
        .flatten()
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
        .collect();
    assert_eq!(files.len(), 1, "续聊必须覆盖原文件，不得新增重复条目");

    let listed = list_sessions(path, "case-studies").unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(
        listed[0]["turns"].as_array().unwrap().len(),
        4,
        "轮次不得被截断"
    );
}

#[test]
fn list_injects_file_identity_and_sorts_newest_first() {
    let root = tmp_dir("list_identity");
    let path = root.to_str().unwrap();

    save_session(path, "case-studies", &session("2026-08-10T10:00:00", 1), None).unwrap();
    save_session(path, "case-studies", &session("2026-08-12T10:00:00", 1), None).unwrap();
    save_session(path, "case-studies", &session("2026-08-11T10:00:00", 1), None).unwrap();

    let listed = list_sessions(path, "case-studies").unwrap();
    assert_eq!(listed.len(), 3);

    // 新→旧
    let ended: Vec<&str> = listed
        .iter()
        .map(|v| v["ended_at"].as_str().unwrap())
        .collect();
    assert_eq!(
        ended,
        vec![
            "2026-08-12T10:00:00",
            "2026-08-11T10:00:00",
            "2026-08-10T10:00:00"
        ]
    );

    // 每条都带 file，且与 ended_at 派生的文件名一致（前端靠它覆盖写盘）
    for v in &listed {
        let file = v["file"]
            .as_str()
            .expect("listing must inject file identity");
        assert!(file.ends_with(".json"), "unexpected file: {}", file);
        assert_eq!(file, default_session_file_name(v));
    }
}

#[test]
fn list_of_missing_dir_is_empty_not_error() {
    let root = tmp_dir("list_missing");
    let path = root.join("nope");
    assert!(list_sessions(path.to_str().unwrap(), "case-studies").unwrap().is_empty());
}

#[test]
fn broken_json_is_skipped_without_failing_the_list() {
    let root = tmp_dir("list_broken");
    let path = root.to_str().unwrap();
    save_session(path, "case-studies", &session("2026-08-11T10:00:00", 1), None).unwrap();
    fs::write(sessions_dir(path).join("broken.json"), "{ not json").unwrap();

    let listed = list_sessions(path, "case-studies").unwrap();
    assert_eq!(listed.len(), 1, "损坏文件应跳过而不是让整个列表失败");
}

// ============================================
// 场景隔离（own-voices / case-studies）
// ============================================
#[test]
fn kinds_are_stored_in_separate_directories() {
    let root = tmp_dir("kind_isolation");
    let path = root.to_str().unwrap();

    save_session(path, "case-studies", &session("2026-08-11T10:00:00", 2), None).unwrap();
    save_session(path, "own-voices", &session("2026-08-11T11:00:00", 3), None).unwrap();

    // 各自目录各一条，互不混放
    assert_eq!(list_sessions(path, "case-studies").unwrap().len(), 1);
    assert_eq!(list_sessions(path, "own-voices").unwrap().len(), 1);
    assert!(sessions_dir_kind(path, "own-voices").ends_with("own-voices"));

    // 列表按 kind 读取：case-studies 里看不到 own-voices 的内容
    let case_only = list_sessions(path, "case-studies").unwrap();
    assert_eq!(
        case_only[0]["ended_at"].as_str().unwrap(),
        "2026-08-11T10:00:00"
    );
}

#[test]
fn own_voice_resume_overwrites_within_its_own_kind() {
    let root = tmp_dir("own_voice_resume");
    let path = root.to_str().unwrap();

    save_session(path, "own-voices", &session("2026-08-11T09:00:00", 2), None).unwrap();
    save_session(
        path,
        "own-voices",
        &session("2026-09-17T10:00:00", 5),
        Some("2026-08-11T09-00-00.json"),
    )
    .unwrap();

    let files: Vec<_> = fs::read_dir(sessions_dir_kind(path, "own-voices"))
        .unwrap()
        .flatten()
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
        .collect();
    assert_eq!(files.len(), 1, "own-voices 续聊同样必须覆盖原文件");

    let listed = list_sessions(path, "own-voices").unwrap();
    assert_eq!(listed[0]["turns"].as_array().unwrap().len(), 5);
}
