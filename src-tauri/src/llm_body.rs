//! 构建 OpenAI 兼容 chat completions 请求体的纯函数模块。
//!
//! 独立成模块是为了 `#[path]` 集成测试（app_lib 链接的测试 exe 在本机
//! 起不来，见 plan_prompt_test.rs 注释）。

/// 构建 OpenAI 兼容 chat completion 请求体。
///
/// DeepSeek 思考型模型（如 deepseek-v4-flash）的 reasoning_content 与
/// content **共享 max_tokens 配额**——思考过长会耗尽预算导致 content 为空
/// （finish_reason=length）。2026-09-03 实机双爆：fix_mermaid 空结果卡死
/// 按钮、plan_course_llm 空响应导致"解析大纲 JSON 失败: EOF"。
///
/// 官方 API 用顶层 `thinking: {"type": "disabled"}` 关闭思考（注意不是
/// `reasoning_effort: "none"`，后者在官方端点返回 400）。其他 OpenAI
/// 兼容服务可能因未知字段报 400，所以只在 deepseek.com 端点注入。
pub fn openai_chat_body(
    model: &str,
    max_tokens: u32,
    prompt: &str,
    base_url: &str,
) -> serde_json::Value {
    let mut req = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}]
    });
    if base_url.contains("deepseek.com") {
        req["thinking"] = serde_json::json!({"type": "disabled"});
    }
    req
}
