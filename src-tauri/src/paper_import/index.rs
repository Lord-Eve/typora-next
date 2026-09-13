//! Import index: which paper URLs have been cached locally.
//!
//! Search results should show "已缓存" for papers already imported. The index
//! is a JSON file at `{app_local_data_dir}/papers/import_index.json` mapping
//! the original source URL (what search results / the user paste) to the
//! imported Markdown path. Keyed by ORIGINAL url (abs page / DOI landing
//! page), not the normalized PDF url, so repeated searches match.
//!
//! Module is self-contained (no `crate::` refs, only std + serde) so
//! integration tests can #[path]-include it.

use std::collections::BTreeMap;
use std::path::Path;

/// One imported paper record.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct ImportIndexEntry {
    /// Original source URL as the user saw it (arXiv abs page, DOI link...).
    pub url: String,
    /// Absolute path of the imported Markdown file.
    pub md_path: String,
    pub title: Option<String>,
    /// RFC3339 timestamp of the cache.
    pub cached_at: String,
    /// Search keyword that found this paper — the paper library
    /// home groups entries by it. `#[serde(default)]` keeps index
    /// files (no domain key) readable; those entries group under 未分类.
    #[serde(default)]
    pub domain: Option<String>,
}

/// The whole index: url → entry.
pub type ImportIndex = BTreeMap<String, ImportIndexEntry>;

/// Load the index from `path`; missing or corrupt file → empty index.
pub fn load_index(path: &Path) -> ImportIndex {
    let Ok(bytes) = std::fs::read(path) else {
        return BTreeMap::new();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

/// Persist the index atomically-ish (write + rename is overkill here; the
/// file is small and writes are rare). Errors are returned for the caller
/// to log — a failed index write must not fail the import itself.
pub fn save_index(path: &Path, index: &ImportIndex) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建索引目录失败: {}", e))?;
    }
    let json = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("写入导入索引失败: {}", e))
}

/// Insert or replace an entry, keyed by its url.
pub fn record(index: &mut ImportIndex, entry: ImportIndexEntry) {
    index.insert(entry.url.clone(), entry);
}

/// Look up by original url.
pub fn find_by_url<'a>(index: &'a ImportIndex, url: &str) -> Option<&'a ImportIndexEntry> {
    index.get(url)
}

/// Remove an entry by url (论文删除是真删除——文件删掉后索引同步移除).
/// Returns true when the entry existed.
pub fn remove(index: &mut ImportIndex, url: &str) -> bool {
    index.remove(url).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
