//! Resolve paper landing pages to open-access PDFs (Sprint 29b).
//!
//! AnySearch academic search returns Semantic Scholar / publisher landing
//! pages, but the MinerU pipeline only consumes direct PDF URLs. This module
//! bridges the gap via the Semantic Scholar Graph API (no key needed at low
//! volume): DOI or S2 paper pages → `openAccessPdf.url` when the paper is
//! open access. Paywalled papers stay a clear error, not a silent failure.
//!
//! Module is self-contained (no `crate::` refs) so integration tests can
//! #[path]-include it, same pattern as search.rs / file_assoc.rs.

use regex::Regex;

const S2_API_BASE: &str = "https://api.semanticscholar.org/graph/v1/paper";
const CROSSREF_API_BASE: &str = "https://api.crossref.org/works";
const REQUEST_TIMEOUT_SECS: u64 = 15;

/// A paper identifier extractable from a landing-page URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PaperRef {
    /// DOI without resolver prefix, e.g. `10.1145/3630106.3658952`.
    Doi(String),
    /// Semantic Scholar paper id (40-char hex hash).
    S2PaperId(String),
}

/// Extract a resolvable paper reference from a landing-page URL.
/// Returns None for URLs we don't know how to resolve.
pub fn parse_paper_ref(url: &str) -> Option<PaperRef> {
    let trimmed = url.trim();

    // doi.org/10.xxx/... → DOI（query/hash 截掉）
    let doi_re = Regex::new(r"doi\.org/(10\.\d{4,9}/[^?\s#]+)").ok()?;
    if let Some(caps) = doi_re.captures(trimmed) {
        let mut doi = caps.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
        while doi.ends_with('/') || doi.ends_with('.') {
            doi.pop();
        }
        if !doi.is_empty() {
            return Some(PaperRef::Doi(doi));
        }
    }

    // semanticscholar.org/paper/<slug>/<40位hash> 或 /paper/<hash>
    let s2_re = Regex::new(r"semanticscholar\.org/paper/(?:[\w-]+/)?([0-9a-f]{40})").ok()?;
    if let Some(caps) = s2_re.captures(trimmed) {
        let id = caps.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
        if !id.is_empty() {
            return Some(PaperRef::S2PaperId(id));
        }
    }

    // 兜底：任意 URL 中内嵌的 DOI（中文期刊站常见，如
    // jproeng.com/EN/10.12034/j.issn.1009-606X.217140 直接以 DOI 作路径）
    let any_doi_re = Regex::new(r"(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)").ok()?;
    if let Some(caps) = any_doi_re.captures(trimmed) {
        let mut doi = caps.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
        while doi.ends_with('.') || doi.ends_with(',') || doi.ends_with(';') {
            doi.pop();
        }
        if !doi.is_empty() {
            return Some(PaperRef::Doi(doi));
        }
    }

    None
}

/// Parse the S2 Graph API response: Some(pdf_url) when open access,
/// None when the paper is known but has no OA PDF, Err on API errors.
pub fn parse_s2_response(json: &serde_json::Value) -> Result<Option<String>, String> {
    if let Some(err) = json
        .get("error")
        .or_else(|| json.get("message"))
        .and_then(|v| v.as_str())
    {
        return Err(format!("Semantic Scholar: {}", err));
    }
    Ok(json
        .get("openAccessPdf")
        .and_then(|p| p.get("url"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string()))
}

/// Parse a Crossref works response: a PDF link when present.
/// Crossref answers 404 with "Resource not found." for DOIs it doesn't host —
/// treated as Ok(None) so the caller can fall back to S2.
///
/// Preference: `application/pdf` links first; some publishers deposit links
/// with content-type "unspecified" that do serve PDF (e.g. OJS galley URLs
/// like /article/view/123/456), so accept those as a fallback.
pub fn parse_crossref_response(json: &serde_json::Value) -> Result<Option<String>, String> {
    // Crossref "Resource not found." 等——字符串 message 意味着查无此 DOI，
    // 归一为 Ok(None) 交由上层回落 S2
    if json.get("message").and_then(|v| v.as_str()).is_some() {
        return Ok(None);
    }
    let links = json
        .get("message")
        .and_then(|m| m.get("link"))
        .and_then(|l| l.as_array());
    let mut unspecified: Option<&str> = None;
    if let Some(links) = links {
        for link in links {
            let url = link.get("URL").and_then(|u| u.as_str()).filter(|u| !u.is_empty());
            let ctype = link
                .get("content-type")
                .and_then(|c| c.as_str())
                .unwrap_or("");
            match (ctype.eq_ignore_ascii_case("application/pdf"), url) {
                (true, Some(u)) => return Ok(Some(u.to_string())),
                (false, Some(u)) => {
                    if ctype.eq_ignore_ascii_case("unspecified") && unspecified.is_none() {
                        unspecified = Some(u);
                    }
                }
                _ => {}
            }
        }
    }
    Ok(unspecified.map(|u| u.to_string()))
}

/// Resolve a DOI to a PDF URL via Crossref (no key, generous limits).
pub fn resolve_doi_via_crossref(doi: &str) -> Result<Option<String>, String> {
    let url = format!("{}/{}", CROSSREF_API_BASE, urlencoding::encode(doi));
    let req = ureq::get(&url).timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS));
    let resp = match req.call() {
        Ok(r) => r,
        Err(ureq::Error::Status(404, _)) => return Ok(None), // 非 Crossref 注册 DOI
        Err(e) => return Err(format!("Crossref 请求失败: {}", e)),
    };
    let json: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("解析 Crossref 响应失败: {}", e))?;
    parse_crossref_response(&json)
}

/// OJS（Open Journal Systems）galley 页面 `/article/view/<a>/<g>` 返回的是
/// HTML 包装页（内嵌 PDF viewer），MinerU 无法直接消费；同路径把 view 段换成
/// download 才是真 PDF 响应。仅这一处已知形态做改写，其他 URL 原样透传。
pub fn upgrade_candidate_url(url: &str) -> String {
    if url.contains("/article/view/") {
        return url.replacen("/article/view/", "/article/download/", 1);
    }
    url.to_string()
}

/// Resolve a paper reference to an open-access PDF URL.
///
/// DOI 优先走 Crossref（无私钥、额度宽松）；查不到或解析失败再回落
/// Semantic Scholar（匿名额度紧，429 时等待后重试一次）。
/// Ok(Some) = OA PDF found; Ok(None) = known paper, no OA PDF;
/// Err = both sources failed (caller surfaces the message).
pub fn resolve_open_access_pdf(paper_ref: &PaperRef) -> Result<Option<String>, String> {
    let found = if let PaperRef::Doi(doi) = paper_ref {
        match resolve_doi_via_crossref(doi) {
            Ok(Some(pdf)) => Some(pdf),
            Ok(None) => None, // Crossref 无记录或无 PDF 链接 → 回落 S2
            Err(e) => {
                log::warn!("[paper_resolve] crossref failed for {}: {}", doi, e);
                None
            }
        }
    } else {
        None
    };
    let found = match found {
        Some(pdf) => Some(pdf),
        None => resolve_via_s2(paper_ref)?,
    };
    Ok(found.map(|u| upgrade_candidate_url(&u)))
}

fn resolve_via_s2(paper_ref: &PaperRef) -> Result<Option<String>, String> {
    let attempt = |paper_ref: &PaperRef| {
        let id_param = match paper_ref {
            PaperRef::Doi(doi) => format!("DOI:{}", doi),
            PaperRef::S2PaperId(id) => id.clone(),
        };
        let url = format!(
            "{}/{}?fields=title,openAccessPdf",
            S2_API_BASE,
            urlencoding::encode(&id_param)
        );
        let resp = match ureq::get(&url)
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .call()
        {
            Ok(r) => r,
            Err(ureq::Error::Status(404, _)) => return Ok(None), // S2 无此论文
            Err(e) => return Err(format!("Semantic Scholar 请求失败: {}", e)),
        };
        let json: serde_json::Value = resp
            .into_json()
            .map_err(|e| format!("解析 Semantic Scholar 响应失败: {}", e))?;
        parse_s2_response(&json)
    };

    match attempt(paper_ref) {
        Err(e) if e.contains("status code 429") => {
            // 匿名额度紧张，等待 3s 重试一次（重试必须带上次失败原因）
            log::warn!("[paper_resolve] S2 rate-limited, retrying in 3s: {}", e);
            std::thread::sleep(std::time::Duration::from_secs(3));
            attempt(paper_ref).map_err(|e2| format!("{}；重试仍失败: {}", e, e2))
        }
        other => other,
    }
}

/// One-shot helper: landing page URL → direct PDF URL.
/// Ok(Some) = resolved; Ok(None) = unsupported/paywalled; Err = call failed.
pub fn resolve_url_to_pdf(url: &str) -> Result<Option<String>, String> {
    match parse_paper_ref(url) {
        Some(r) => resolve_open_access_pdf(&r),
        None => Ok(None),
    }
}
