//! Integration tests for paper_import::rescue pure functions
//! (#[path] include — machine cannot run app_lib-linked test exes).

#[path = "../src/paper_import/resolve.rs"]
mod resolve;
#[path = "../src/paper_import/rescue.rs"]
mod rescue;

use rescue::{combine_failure_error, parse_rescue_result, sanitize_candidate};

#[test]
fn parse_valid_result() {
    let json = r#"{"attempts": [{"url": "https://doi.org/10.1360/x", "candidates": ["https://oa.mg/work.pdf"], "notes": "OpenAlex 命中"}]}"#;
    let attempts = parse_rescue_result(json).unwrap();
    assert_eq!(attempts.len(), 1);
    assert_eq!(attempts[0].url, "https://doi.org/10.1360/x");
    assert_eq!(attempts[0].candidates, vec!["https://oa.mg/work.pdf".to_string()]);
    assert_eq!(attempts[0].notes, "OpenAlex 命中");
}

#[test]
fn parse_missing_attempts_is_empty() {
    let attempts = parse_rescue_result(r#"{}"#).unwrap();
    assert!(attempts.is_empty());
}

#[test]
fn parse_invalid_json_is_err() {
    assert!(parse_rescue_result("{not json").is_err());
}

#[test]
fn parse_attempt_without_candidates_defaults_empty() {
    let json = r#"{"attempts": [{"url": "https://x", "notes": "无救：期刊闭源"}]}"#;
    let attempts = parse_rescue_result(json).unwrap();
    assert!(attempts[0].candidates.is_empty());
    assert_eq!(attempts[0].notes, "无救：期刊闭源");
}

#[test]
fn sanitize_accepts_https_pdf() {
    assert_eq!(
        sanitize_candidate("https://oa.mg/work.pdf"),
        Some("https://oa.mg/work.pdf".to_string())
    );
}

#[test]
fn sanitize_rejects_non_http() {
    assert_eq!(sanitize_candidate("javascript:alert(1)"), None);
    assert_eq!(sanitize_candidate("file:///etc/passwd"), None);
    assert_eq!(sanitize_candidate("ftp://x/y.pdf"), None);
}

#[test]
fn sanitize_upgrades_ojs_view_to_download() {
    // 复用 resolve::upgrade_candidate_url 的 OJS 改写
    assert_eq!(
        sanitize_candidate("https://journal.com/article/view/100/200"),
        Some("https://journal.com/article/download/100/200".to_string())
    );
}

#[test]
fn combine_error_includes_original_and_attempt() {
    let msg = combine_failure_error(
        "解析论文链接失败: status code 429",
        "OpenAlex 无开放获取",
        &["https://a/pdf".to_string(), "https://b/pdf".to_string()],
        "MinerU 拒绝非 PDF",
    );
    assert!(msg.contains("429"), "应含原始错误");
    assert!(msg.contains("OpenAlex 无开放获取"), "应含 agent notes");
    assert!(msg.contains("2"), "应含候选数量");
    assert!(msg.contains("MinerU 拒绝非 PDF"), "应含最后尝试错误");
}

#[test]
fn combine_error_no_candidates() {
    let msg = combine_failure_error("URL 不支持", "期刊闭源，无 OA 版本", &[], "");
    assert!(msg.contains("URL 不支持"));
    assert!(msg.contains("期刊闭源"));
    assert!(msg.contains("补救"), "应体现补救语义");
}
