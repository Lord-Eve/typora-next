//! Integration tests for the shared OpenAI-compatible request body builder.
//!
//! Pure logic lives in src/llm_body.rs — included via `#[path]` because
//! app_lib-linked test exes fail to start on some machines
//! (STATUS_ENTRYPOINT_NOT_FOUND).
//!
//! Run with: cargo test --test llm_body_test

#[path = "../src/llm_body.rs"]
mod llm_body;

use llm_body::openai_chat_body;

#[test]
fn deepseek_endpoint_disables_thinking() {
    let body = openai_chat_body("deepseek-v4-flash", 4096, "hi", "https://api.deepseek.com");
    assert_eq!(
        body["thinking"]["type"], "disabled",
        "DeepSeek 端点必须关闭思考"
    );
    assert_eq!(body["model"], "deepseek-v4-flash");
    assert_eq!(body["max_tokens"], 4096);
    assert_eq!(body["messages"][0]["content"], "hi");
}

#[test]
fn deepseek_endpoint_with_path_suffix_also_disables() {
    // 用户可能配置带路径的 base_url（如 https://api.deepseek.com/v1 之外的代理形态）
    let body = openai_chat_body("m", 100, "hi", "https://api.deepseek.com/beta");
    assert_eq!(body["thinking"]["type"], "disabled");
}

#[test]
fn openai_official_not_injected() {
    let body = openai_chat_body("gpt-4o-mini", 100, "hi", "https://api.openai.com");
    assert!(
        body.get("thinking").is_none(),
        "非 DeepSeek 端点不得注入 thinking 字段（会因未知字段 400）"
    );
}

#[test]
fn third_party_proxy_not_injected() {
    // 代理服务（如 aliyun proxy）转发到非 DeepSeek 模型时不应注入
    let body = openai_chat_body("qwen-max", 100, "hi", "https://proxy.example.com/v1");
    assert!(body.get("thinking").is_none());
}
