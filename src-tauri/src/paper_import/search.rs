//! Paper search via AnySearch API (https://api.anysearch.com).
//!
//! Thin seam on purpose: a single public entry point so a free fallback
//! provider (e.g. direct arXiv API) can be added behind the same command
//! without touching the frontend.

use serde::{Deserialize, Serialize};

const ANYSEARCH_API_BASE: &str = "https://api.anysearch.com";
const DEFAULT_MAX_RESULTS: u32 = 10;

/// One paper hit, normalized for the frontend result list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperSearchHit {
    pub title: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
}

/// Response envelope returned to the frontend (`{ results: [...] }`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperSearchResponse {
    pub results: Vec<PaperSearchHit>,
}

/// Search papers by keyword. `api_key` may be None — AnySearch supports
/// anonymous access with lower rate limits.
pub fn search_papers(api_key: Option<&str>, query: &str) -> Result<PaperSearchResponse, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("搜索关键词为空".to_string());
    }

    let payload = serde_json::json!({
        "query": query,
        "tag": "academic.search",
        "max_results": DEFAULT_MAX_RESULTS,
    });

    let mut req = ureq::post(&format!("{}/v1/search", ANYSEARCH_API_BASE))
        .set("Content-Type", "application/json");
    if let Some(key) = api_key {
        if !key.is_empty() {
            req = req.set("Authorization", &format!("Bearer {}", key));
        }
    }

    let resp = req
        .send_json(payload)
        .map_err(|e| format!("AnySearch 请求失败: {}", e))?;

    let json: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("解析 AnySearch 响应失败: {}", e))?;

    parse_search_response(&json)
}

/// Pure response parsing — unit-testable without network.
pub fn parse_search_response(json: &serde_json::Value) -> Result<PaperSearchResponse, String> {
    let code = json.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
    if code != 0 {
        let message = json
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("未知错误");
        return Err(format!("AnySearch 返回错误: {}", message));
    }

    let results = json
        .get("data")
        .and_then(|d| d.get("results"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let hits = results
        .iter()
        .map(|item| {
            let title = item
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("(无标题)")
                .to_string();
            let url = item
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let snippet = item
                .get("content")
                .or_else(|| item.get("snippet"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let year = extract_year(item);
            PaperSearchHit {
                title,
                url,
                year,
                snippet,
            }
        })
        .collect();

    Ok(PaperSearchResponse { results: hits })
}

/// Best-effort year extraction: explicit year fields first, then the URL.
fn extract_year(item: &serde_json::Value) -> Option<u32> {
    for key in ["year", "publication_year", "published_year"] {
        if let Some(y) = item.get(key).and_then(|v| v.as_u64()) {
            if (1900..=2100).contains(&y) {
                return Some(y as u32);
            }
        }
    }
    // arXiv URLs embed the year: /abs/2401.10001 → 2024
    if let Some(url) = item.get("url").and_then(|v| v.as_str()) {
        if let Some(y) = year_from_arxiv_url(url) {
            return Some(y);
        }
    }
    None
}

/// Extract the year from an arXiv abs URL: `/abs/2401.10001` → 2024.
/// New-style IDs use YYMM after 2007-04; old-style (pre-2007) YY ≥ 91 means
/// 19xx. Garbage in, None out.
pub fn year_from_arxiv_url(url: &str) -> Option<u32> {
    let rest = url.split("/abs/").nth(1)?;
    let id = rest.trim_end_matches('/').split(['?', '#']).next()?;
    let yy: u32 = id.get(0..2)?.parse().ok()?;
    let third = id.chars().nth(2)?;
    if !third.is_ascii_digit() && third != '.' {
        return None;
    }
    Some(if yy >= 91 { 1900 + yy } else { 2000 + yy })
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let res = parse_search_response(&json).unwrap();
        assert_eq!(res.results.len(), 2);
        assert_eq!(res.results[0].title, "Paper A");
        assert_eq!(res.results[0].year, Some(2024)); // 从 arXiv URL 提取
        assert_eq!(res.results[1].year, Some(2021)); // 显式 year 字段优先
        assert_eq!(res.results[1].snippet.as_deref(), Some("snippet b"));
    }

    #[test]
    fn parse_error_envelope() {
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
}
