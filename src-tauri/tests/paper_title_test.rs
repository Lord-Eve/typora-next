//! Integration tests for paper_import::storage::extract_title_hint
//! (#[path] include — machine cannot run app_lib-linked test exes).

#[path = "../src/paper_import/storage.rs"]
mod storage;

use std::path::Path;

use storage::extract_title_hint;

#[test]
fn first_atx_heading_becomes_title() {
    let md = "# 铝电解槽优化控制方法综述\n\n## 1 引言\n\n正文";
    assert_eq!(
        extract_title_hint(md),
        Some("铝电解槽优化控制方法综述".to_string())
    );
}

#[test]
fn emphasis_markers_stripped() {
    let md = "# **Attention** `Is` ~~All~~ You Need\n";
    assert_eq!(
        extract_title_hint(md),
        Some("Attention Is All You Need".to_string())
    );
}

#[test]
fn no_heading_returns_none() {
    let md = "没有标题的文档\n\n直接就是正文。";
    assert_eq!(extract_title_hint(md), None);
}

#[test]
fn leading_text_before_heading_skipped() {
    let md = "一些前言文字。\n\n# 真正的标题\n";
    assert_eq!(extract_title_hint(md), Some("真正的标题".to_string()));
}

#[test]
fn hash_without_space_is_not_a_heading() {
    // Obsidian 行首 #tag 不是 ATX 标题
    let md = "#notatag 说明文字\n\n# 真标题\n";
    assert_eq!(extract_title_hint(md), Some("真标题".to_string()));
}

use storage::choose_papers_dir;

#[test]
fn configured_root_wins() {
    let p = choose_papers_dir(Some(r"D:\papers"), None, Some(r"C:\proj"), Path::new(r"C:\appdata"));
    assert_eq!(p, Path::new(r"D:\papers"));
}

#[test]
fn domain_becomes_subdir_under_root() {
    // 论文按领域分目录：根目录/领域/年月/file.md（年月由 save_paper_md 追加）
    let p = choose_papers_dir(Some(r"D:\papers"), Some("铝电解因果建模"), None, Path::new(r"C:\appdata"));
    assert_eq!(p, Path::new(r"D:\papers").join("铝电解因果建模"));
}

#[test]
fn domain_sanitized_for_filesystem() {
    let p = choose_papers_dir(Some(r"D:\papers"), Some("领域? 建*模"), None, Path::new(r"C:\appdata"));
    assert_eq!(p, Path::new(r"D:\papers").join("领域-建模"));
}

#[test]
fn blank_domain_goes_to_root_directly() {
    let p = choose_papers_dir(Some(r"D:\papers"), Some("   "), None, Path::new(r"C:\appdata"));
    assert_eq!(p, Path::new(r"D:\papers"));
}

#[test]
fn blank_root_falls_through() {
    let p = choose_papers_dir(Some("   "), None, Some(r"C:\proj"), Path::new(r"C:\appdata"));
    assert_eq!(p, Path::new(r"C:\proj").join(".learning").join("papers"));
}

#[test]
fn project_dir_used_when_unconfigured() {
    let p = choose_papers_dir(None, None, Some(r"C:\proj"), Path::new(r"C:\appdata"));
    assert_eq!(p, Path::new(r"C:\proj").join(".learning").join("papers"));
}

#[test]
fn appdata_fallback_last() {
    let p = choose_papers_dir(None, None, None, Path::new(r"C:\appdata"));
    assert_eq!(p, Path::new(r"C:\appdata").join("papers"));
}

#[test]
fn index_path_is_global_not_per_domain() {
    // 索引必须全局唯一，否则跨领域搜索时 已缓存 标记失效
    let p = storage::import_index_path(Path::new(r"C:\appdata"));
    assert_eq!(p, Path::new(r"C:\appdata").join("papers").join("import_index.json"));
}
