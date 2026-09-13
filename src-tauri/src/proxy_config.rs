// -*- coding: utf-8 -*-
//! 更新检查代理探测
//!
//! 背景：tauri-plugin-updater 的 reqwest 未启用 system-proxy feature，
//! GUI 进程又继承不到终端的 HTTPS_PROXY，导致 GitHub 直连失败环境
//! 更新检查报 error sending request。本模块按优先级探测代理：
//!   HTTPS_PROXY → https_proxy → HTTP_PROXY → http_proxy → Windows 注册表系统代理
//! 探测结果由前端 updater.js 传给 plugin:updater|check 的 proxy 参数；
//! Update 资源在 check 时固化代理配置，download_and_install 自动沿用。

/// 从 env / 注册表两个来源解析代理 URL。全部为空返回 None（直连）。
///
/// `env_get`: 读环境变量；`reg_get`: 读注册表，返回 Some((ProxyEnable, ProxyServer))
pub fn resolve_proxy<E, R>(env_get: E, reg_get: R) -> Option<String>
where
    E: Fn(&str) -> Option<String>,
    R: Fn() -> Option<(bool, String)>,
{
    for key in ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] {
        if let Some(v) = env_get(key) {
            let v = v.trim();
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    if let Some((enabled, server)) = reg_get() {
        if enabled {
            return normalize_proxy_server(&server);
        }
    }
    None
}

/// 注册表 ProxyServer 归一化为带 scheme 的 URL。
/// 支持纯 "host:port"（补 http://）与分协议 "http=h:p;https=h:p"（https 优先，
/// 其次 http，再次首个条目）；已有 scheme 的原样保留。
pub fn normalize_proxy_server(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    if !raw.contains('=') {
        return with_scheme(raw);
    }
    let mut first: Option<String> = None;
    let mut http: Option<String> = None;
    for entry in raw.split(';') {
        let entry = entry.trim();
        if let Some((k, v)) = entry.split_once('=') {
            let url = with_scheme(v);
            if first.is_none() {
                first = url.clone();
            }
            if k.eq_ignore_ascii_case("https") {
                return url;
            }
            if k.eq_ignore_ascii_case("http") {
                http = url;
            }
        }
    }
    http.or(first)
}

fn with_scheme(v: &str) -> Option<String> {
    let v = v.trim();
    if v.is_empty() {
        return None;
    }
    if v.contains("://") {
        Some(v.to_string())
    } else {
        Some(format!("http://{v}"))
    }
}

/// Windows 注册表读系统代理（ProxyEnable + ProxyServer）。
#[cfg(windows)]
fn read_registry_proxy() -> Option<(bool, String)> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    let enabled: u32 = key.get_value("ProxyEnable").unwrap_or(0);
    let server: String = key.get_value("ProxyServer").unwrap_or_default();
    Some((enabled != 0, server))
}

#[cfg(not(windows))]
fn read_registry_proxy() -> Option<(bool, String)> {
    None
}

/// Tauri 命令入口：探测当前进程可用的代理 URL。
pub fn get_proxy_config() -> Option<String> {
    resolve_proxy(|k| std::env::var(k).ok(), read_registry_proxy)
}
