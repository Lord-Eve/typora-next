//! Integration tests for paper_import::search (pure parsing, #[path] include —
//! linking the full app_lib pulls in WebView2 and the test exe fails to start
//! on some Windows environments; see file_assoc_test.rs for the same pattern).
//!
//! 可执行规格: tests/sprint29/features/sprint29_paper_search.feature

#[path = "../src/paper_import/search.rs"]
mod search;

use search::{parse_search_response, year_from_arxiv_url, PaperSearchResponse};

#[test]
fn parse_success_envelope() {
    let json = serde_json::json!({
        "code": 0,
        "message": "success",
        "data": {
            "results": [
                { "title": "Paper A", "url": "https://arxiv.org/abs/2401.10001", "content": "snippet a" },
                { "title": "Paper B", "url": "https://doi.org/10.1/abc", "snippet": "snippet b", "year": 2021 }
            ],
            "metadata": { "total_results": 2, "search_time_ms": 969 }
        }
    });
    let res: PaperSearchResponse = parse_search_response(&json).unwrap();
    assert_eq!(res.results.len(), 2);
    assert_eq!(res.results[0].title, "Paper A");
    assert_eq!(res.results[0].year, Some(2024)); // 从 arXiv URL 提取
    assert_eq!(res.results[1].year, Some(2021)); // 显式 year 字段优先
    assert_eq!(res.results[1].snippet.as_deref(), Some("snippet b"));
}

#[test]
fn parse_error_envelope_surfaces_reason() {
    let json = serde_json::json!({ "code": -1, "message": "Rate limited" });
    let err = parse_search_response(&json).unwrap_err();
    assert!(err.contains("Rate limited"), "错误信息应透出原因: {}", err);
}

#[test]
fn parse_empty_results() {
    let json = serde_json::json!({ "code": 0, "data": { "results": [] } });
    let res = parse_search_response(&json).unwrap();
    assert!(res.results.is_empty());
}

#[test]
fn parse_missing_data_treated_as_empty() {
    let json = serde_json::json!({ "code": 0 });
    let res = parse_search_response(&json).unwrap();
    assert!(res.results.is_empty());
}

#[test]
fn year_from_arxiv_new_style_id() {
    assert_eq!(
        year_from_arxiv_url("https://arxiv.org/abs/2401.10001"),
        Some(2024)
    );
    assert_eq!(
        year_from_arxiv_url("https://arxiv.org/abs/9901.12345"),
        Some(1999)
    );
}

#[test]
fn year_from_arxiv_rejects_garbage() {
    assert_eq!(year_from_arxiv_url("https://doi.org/10.1/abc"), None);
    assert_eq!(year_from_arxiv_url("https://arxiv.org/abs/abcd.1234"), None);
}
