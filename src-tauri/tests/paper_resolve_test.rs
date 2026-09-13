//! Integration tests for paper_import::resolve (#[path] include, pure parsing —
//! same pattern as paper_search_test.rs; network call itself is not tested).
//!
//! 可执行规格: tests/sprint29/features/sprint29_paper_search.feature

#[path = "../src/paper_import/resolve.rs"]
mod resolve;

use resolve::{parse_crossref_response, parse_paper_ref, parse_s2_response, upgrade_candidate_url, PaperRef};

#[test]
fn parses_doi_org_url() {
    assert_eq!(
        parse_paper_ref("https://doi.org/10.1145/3630106.3658952"),
        Some(PaperRef::Doi("10.1145/3630106.3658952".to_string()))
    );
}

#[test]
fn parses_semanticscholar_slug_url() {
    // 带 slug 的新式 S2 页面：/paper/<slug>/<40位hash>
    let r = parse_paper_ref("https://www.semanticscholar.org/paper/some-slug/63f5fe2df45cd666fc4d7ff8b3c48a9c49b18a9b");
    match r {
        Some(PaperRef::S2PaperId(id)) => assert_eq!(id, "63f5fe2df45cd666fc4d7ff8b3c48a9c49b18a9b"),
        other => panic!("expected S2PaperId, got {:?}", other.map(|_| ())),
    }
}

#[test]
fn rejects_unsupported_urls() {
    assert_eq!(parse_paper_ref("https://example.com/paper"), None);
    assert_eq!(parse_paper_ref("https://ieeexplore.ieee.org/document/123"), None);
    assert_eq!(parse_paper_ref(""), None);
}

#[test]
fn s2_response_with_open_access_pdf() {
    let json = serde_json::json!({
        "paperId": "63f5",
        "title": "Some paper",
        "openAccessPdf": { "url": "https://arxiv.org/pdf/2401.1.pdf", "status": "GREEN" }
    });
    assert_eq!(
        parse_s2_response(&json).unwrap(),
        Some("https://arxiv.org/pdf/2401.1.pdf".to_string())
    );
}

#[test]
fn s2_response_without_open_access_pdf() {
    let json = serde_json::json!({
        "paperId": "63f5",
        "title": "Paywalled",
        "openAccessPdf": null
    });
    assert_eq!(parse_s2_response(&json).unwrap(), None);
}

#[test]
fn s2_error_envelope_surfaces_reason() {
    let json = serde_json::json!({ "error": "Paper not found" });
    let err = parse_s2_response(&json).unwrap_err();
    assert!(err.contains("Paper not found"), "错误应透出原因: {}", err);
}

#[test]
fn s2_rate_limit_envelope_also_surfaces_reason() {
    // 429 用 message 字段（无 error 字段），不能误判成"无开放获取 PDF"
    let json = serde_json::json!({ "message": "Too Many Requests", "code": "429" });
    let err = parse_s2_response(&json).unwrap_err();
    assert!(err.contains("Too Many Requests"), "限流应透出原因: {}", err);
}

#[test]
fn crossref_response_with_pdf_link() {
    let json = serde_json::json!({
        "status": "ok",
        "message": {
            "DOI": "10.1145/3630106.3658952",
            "link": [
                { "URL": "https://dl.acm.org/doi/pdf/10.1145/3630106.3658952", "content-type": "application/pdf", "intended-application": "text-mining" },
                { "URL": "https://dl.acm.org/doi/xml/...", "content-type": "application/xml", "intended-application": "text-mining" }
            ]
        }
    });
    assert_eq!(
        parse_crossref_response(&json).unwrap(),
        Some("https://dl.acm.org/doi/pdf/10.1145/3630106.3658952".to_string())
    );
}

#[test]
fn crossref_response_without_pdf_link() {
    let json = serde_json::json!({
        "status": "ok",
        "message": { "DOI": "10.1/abc", "link": [] }
    });
    assert_eq!(parse_crossref_response(&json).unwrap(), None);
}

#[test]
fn crossref_unspecified_content_type_link_used_as_fallback() {
    // 部分出版商（如 OJS）deposit 的 galley 链接 content-type 是 unspecified，
    // 实际服务的是 PDF（/article/view/123/456 形态）——不能丢弃
    let json = serde_json::json!({
        "status": "ok",
        "message": {
            "link": [
                { "URL": "http://ojs.example.com/article/view/33327/32267", "content-type": "unspecified" },
                { "URL": "https://example.com/fulltext.xml", "content-type": "text/xml" }
            ]
        }
    });
    assert_eq!(
        parse_crossref_response(&json).unwrap(),
        Some("http://ojs.example.com/article/view/33327/32267".to_string())
    );
}

#[test]
fn crossref_pdf_link_preferred_over_unspecified() {
    let json = serde_json::json!({
        "message": {
            "link": [
                { "URL": "http://ojs.example.com/article/view/1/2", "content-type": "unspecified" },
                { "URL": "https://pub.example.com/paper.pdf", "content-type": "application/pdf" }
            ]
        }
    });
    assert_eq!(
        parse_crossref_response(&json).unwrap(),
        Some("https://pub.example.com/paper.pdf".to_string())
    );
}

#[test]
fn crossref_not_found_is_none_not_error() {
    // Crossref 对非其注册的 DOI 返回 404 + "Resource not found."
    // 归一为 Ok(None) → 上层回落 S2，而不是直接报错
    let json = serde_json::json!({ "status": "failed", "message": "Resource not found." });
    assert_eq!(parse_crossref_response(&json).unwrap(), None);
}

#[test]
fn ojs_view_page_rewritten_to_download() {
    // OJS3 galley /article/view/ 是 HTML 包装页，/article/download/ 才是真 PDF
    assert_eq!(
        upgrade_candidate_url("http://ojs.omniscient.sg/index.php/ECM/article/view/33327/32267"),
        "http://ojs.omniscient.sg/index.php/ECM/article/download/33327/32267"
    );
}

#[test]
fn non_ojs_urls_pass_through() {
    assert_eq!(
        upgrade_candidate_url("https://arxiv.org/pdf/2401.1.pdf"),
        "https://arxiv.org/pdf/2401.1.pdf"
    );
    assert_eq!(
        upgrade_candidate_url("https://example.com/article/viewpoint/1"),
        "https://example.com/article/viewpoint/1"
    );
}

#[test]
fn parses_doi_embedded_in_journal_site_url() {
    // 中文期刊站常以 DOI 作路径（无 doi.org 前缀），如过程工程学报
    assert_eq!(
        parse_paper_ref("http://www.jproeng.com/EN/10.12034/j.issn.1009-606X.217140"),
        Some(PaperRef::Doi("10.12034/j.issn.1009-606X.217140".to_string()))
    );
}

#[test]
fn embedded_doi_trailing_punctuation_stripped() {
    // 从正文粘贴的 URL 末尾可能带句点
    assert_eq!(
        parse_paper_ref("见 http://www.jproeng.com/EN/10.12034/j.issn.1009-606X.217140。"),
        Some(PaperRef::Doi("10.12034/j.issn.1009-606X.217140".to_string()))
    );
}
