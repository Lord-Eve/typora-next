//! Integration tests for paper_import::index (#[path] include — the machine
//! cannot run test exes linked against app_lib, see file_assoc_test.rs).

#[path = "../src/paper_import/index.rs"]
mod index;

use index::{find_by_url, load_index, record, remove, save_index, ImportIndex, ImportIndexEntry};
use std::path::Path;

fn entry(url: &str, md: &str) -> ImportIndexEntry {
    ImportIndexEntry {
        url: url.to_string(),
        md_path: md.to_string(),
        title: Some("T".to_string()),
        cached_at: "2026-09-12T00:00:00+08:00".to_string(),
        domain: None,
    }
}

#[test]
fn load_missing_file_is_empty() {
    let idx = load_index(Path::new("/nonexistent/import_index.json"));
    assert!(idx.is_empty());
}

#[test]
fn load_corrupt_file_is_empty() {
    let tmp = std::env::temp_dir().join(format!(
        "typora_idx_corrupt_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    ));
    std::fs::write(&tmp, "{not json").unwrap();
    let idx = load_index(&tmp);
    assert!(idx.is_empty());
    let _ = std::fs::remove_file(&tmp);
}

#[test]
fn save_load_roundtrip() {
    let tmp = std::env::temp_dir().join(format!(
        "typora_idx_rt_{}.json",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    ));
    let mut idx = ImportIndex::new();
    record(&mut idx, entry("https://arxiv.org/abs/2401.1", "/papers/a.md"));
    save_index(&tmp, &idx).unwrap();
    let loaded = load_index(&tmp);
    assert_eq!(loaded.len(), 1);
    assert_eq!(
        find_by_url(&loaded, "https://arxiv.org/abs/2401.1")
            .unwrap()
            .md_path,
        "/papers/a.md"
    );
    let _ = std::fs::remove_file(&tmp);
}

#[test]
fn record_replaces_same_url() {
    let mut idx = ImportIndex::new();
    record(&mut idx, entry("https://x/1", "/a.md"));
    record(&mut idx, entry("https://x/1", "/b.md"));
    assert_eq!(idx.len(), 1);
    assert_eq!(find_by_url(&idx, "https://x/1").unwrap().md_path, "/b.md");
}

#[test]
fn domain_field_roundtrips() {
    // Sprint 30: 论文库首页按领域分组，索引条目必须携带 domain
    let mut idx = ImportIndex::new();
    let mut e = entry("https://x/1", "/papers/铝电解/2026-09/a.md");
    e.domain = Some("铝电解".to_string());
    record(&mut idx, e);
    let tmp = std::env::temp_dir().join(format!(
        "typora_idx_domain_{}.json",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    ));
    save_index(&tmp, &idx).unwrap();
    let loaded = load_index(&tmp);
    assert_eq!(
        find_by_url(&loaded, "https://x/1").unwrap().domain,
        Some("铝电解".to_string())
    );
    let _ = std::fs::remove_file(&tmp);
}

#[test]
fn legacy_index_without_domain_deserializes() {
    // 向后兼容：Sprint 29 写入的索引没有 domain 键，加载后应为 None
    let tmp = std::env::temp_dir().join(format!(
        "typora_idx_legacy_{}.json",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    ));
    std::fs::write(
        &tmp,
        r#"{"https://x/old": {"url": "https://x/old", "md_path": "/papers/old.md", "title": "旧论文", "cached_at": "2026-09-01T00:00:00+08:00"}}"#,
    )
    .unwrap();
    let loaded = load_index(&tmp);
    let e = find_by_url(&loaded, "https://x/old").expect("旧条目应可读");
    assert_eq!(e.domain, None);
    assert_eq!(e.title, Some("旧论文".to_string()));
    let _ = std::fs::remove_file(&tmp);
}

#[test]
fn remove_existing_entry() {
    // Sprint 30c: 真删除后索引条目必须移除
    let mut idx = ImportIndex::new();
    record(&mut idx, entry("https://x/1", "/a.md"));
    assert!(remove(&mut idx, "https://x/1"));
    assert!(find_by_url(&idx, "https://x/1").is_none());
}

#[test]
fn remove_missing_entry_is_false() {
    let mut idx = ImportIndex::new();
    assert!(!remove(&mut idx, "https://x/nonexistent"));
}
