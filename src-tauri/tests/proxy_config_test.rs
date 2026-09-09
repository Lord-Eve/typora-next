// -*- coding: utf-8 -*-
//! proxy_config 纯逻辑测试（Sprint 27）
//!
//! 更新检查代理探测契约：
//! - 优先级：HTTPS_PROXY → https_proxy → HTTP_PROXY → http_proxy → Windows 注册表
//! - 注册表：ProxyEnable=0 → None；ProxyServer 纯 host:port → 补 http:// 前缀；
//!   分协议格式 "http=h:p;https=h:p" 优先取 https= 条目
//! - 全部为空 → None（直连，维持原行为）
//!
//! 注：app_lib 集成测试 exe 本机起不来（0xc0000139），故用 #[path] include 纯逻辑模块。

#[path = "../src/proxy_config.rs"]
mod proxy_config;

use proxy_config::{normalize_proxy_server, resolve_proxy};

fn no_env(_: &str) -> Option<String> {
    None
}

fn no_reg() -> Option<(bool, String)> {
    None
}

#[test]
fn env_https_proxy_wins() {
    let r = resolve_proxy(
        |k| {
            if k == "HTTPS_PROXY" {
                Some("http://127.0.0.1:7890".into())
            } else {
                None
            }
        },
        no_reg,
    );
    assert_eq!(r.as_deref(), Some("http://127.0.0.1:7890"));
}

#[test]
fn env_priority_order() {
    // HTTPS_PROXY 优先于小写与 HTTP_PROXY
    let r = resolve_proxy(
        |k| match k {
            "HTTPS_PROXY" => Some("http://a:1".into()),
            "https_proxy" => Some("http://b:2".into()),
            "HTTP_PROXY" => Some("http://c:3".into()),
            _ => None,
        },
        no_reg,
    );
    assert_eq!(r.as_deref(), Some("http://a:1"));

    let r = resolve_proxy(
        |k| match k {
            "https_proxy" => Some("http://b:2".into()),
            "HTTP_PROXY" => Some("http://c:3".into()),
            _ => None,
        },
        no_reg,
    );
    assert_eq!(r.as_deref(), Some("http://b:2"));

    let r = resolve_proxy(
        |k| match k {
            "http_proxy" => Some("http://d:4".into()),
            _ => None,
        },
        no_reg,
    );
    assert_eq!(r.as_deref(), Some("http://d:4"));
}

#[test]
fn env_empty_string_is_ignored() {
    let r = resolve_proxy(|_| Some("".into()), no_reg);
    assert_eq!(r, None);
}

#[test]
fn registry_fallback_when_no_env() {
    let r = resolve_proxy(no_env, || Some((true, "127.0.0.1:7890".into())));
    assert_eq!(r.as_deref(), Some("http://127.0.0.1:7890"));
}

#[test]
fn registry_disabled_returns_none() {
    let r = resolve_proxy(no_env, || Some((false, "127.0.0.1:7890".into())));
    assert_eq!(r, None);
}

#[test]
fn no_env_no_registry_returns_none() {
    assert_eq!(resolve_proxy(no_env, no_reg), None);
}

#[test]
fn normalize_plain_host_port() {
    assert_eq!(
        normalize_proxy_server("127.0.0.1:7890").as_deref(),
        Some("http://127.0.0.1:7890")
    );
}

#[test]
fn normalize_per_protocol_prefers_https() {
    assert_eq!(
        normalize_proxy_server("http=1.2.3.4:8080;https=5.6.7.8:8443").as_deref(),
        Some("http://5.6.7.8:8443")
    );
}

#[test]
fn normalize_per_protocol_fallback_first_entry() {
    assert_eq!(
        normalize_proxy_server("ftp=1.2.3.4:21;http=1.2.3.4:8080").as_deref(),
        Some("http://1.2.3.4:8080")
    );
}

#[test]
fn normalize_keeps_existing_scheme() {
    assert_eq!(
        normalize_proxy_server("socks5://127.0.0.1:1080").as_deref(),
        Some("socks5://127.0.0.1:1080")
    );
}

#[test]
fn normalize_empty_returns_none() {
    assert_eq!(normalize_proxy_server(""), None);
    assert_eq!(normalize_proxy_server("   "), None);
}
