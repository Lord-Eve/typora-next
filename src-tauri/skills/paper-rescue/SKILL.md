---
name: paper-rescue
description: 论文导入（缓存）失败后的批量补救。接收全部失败条目的 url/title/错误全文，先找错误共性（系统性限流 vs 单篇无开放获取），再用内置白名单脚本换源/搜替代来源，产出每篇的候选下载地址。Use when paper imports failed and automatic resolution failed (Semantic Scholar 429, no open-access PDF, unsupported URL).
---

# 论文导入批量补救

输入：**全部**失败条目（url、标题、错误全文）。错误本身就是上下文——先诊断，再规划，不要逐篇盲目重试。

## 工具（白名单脚本，仅这两个）

```bash
# 元数据换源（Semantic Scholar 429 的平替；参数：裸 DOI / doi.org URL / 论文标题）
node .pi/skills/paper-rescue/scripts/openalex-lookup.mjs "<doi|title>"

# 学术搜索找替代来源（参数：query 字符串；key 已注入环境变量，不要打听）
node .pi/skills/paper-rescue/scripts/anysearch-lookup.mjs "<query>"
```

（若项目里不存在 `.pi/skills/` 路径，试 `.claude/skills/` 前缀。）

两个脚本都输出一行 JSON：`{"ok":true,"status":200,"body":"..."}` 或 `{"ok":false,"error":"..."}`，body 截断 32KB。

## 决策流程（先共性，后逐篇）

### 1. 找错误共性（系统性问题优先统一处理）

- **全部/多数是限流**（错误含 429、rate limit、请求失败）→ 数据源额度问题。**逐篇用 OpenAlex 换源**：DOI 已知时直接 `openalex-lookup.mjs "<doi>"`；只有标题时 `openalex-lookup.mjs "<标题>"` 走 search 端点
- **全部/多数是「未找到开放获取 PDF」**→ 每篇都要单独找替代源，跳第 2 步
- 错误混杂 → 按错误类型把条目分组，各组分别处理

### 2. 逐篇特例处理

- **无开放获取**（中文期刊、闭源会议常见）：
  1. `openalex-lookup.mjs "<标题>"` — 从返回 JSON 的 `open_access.oa_url` 或 `best_oa_location.pdf_url` 取候选
  2. 仍无 → `anysearch-lookup.mjs "<标题> pdf"`，从结果 URL 里挑**以 .pdf 结尾**或指向 arXiv/机构库/预印本服务器的链接
- **落地页不是 PDF**（期刊 OJS 页面、摘要页）→ 优先 OpenAlex 换源拿 pdf_url
- 候选 URL 必须是 **http/https 的 PDF 直链或可解析落地页**；每篇最多 3 个候选，按可信度排序

### 3. 预算约束

- 每篇最多调用脚本 **3 次**；找不到就认，不要反复重试同一个脚本
- 两篇之间不要互相干扰：某篇无救不影响其他篇的补救

## 输出契约（必须）

用 Write 工具把结果写到 prompt 指定的输出文件（`.paper-rescue-result.json`），结构：

```json
{
  "attempts": [
    {
      "url": "<原始失败条目的 url，原样回写>",
      "candidates": ["https://...pdf", "..."],
      "notes": "一句话说明：怎么找的 / 为什么无救"
    }
  ]
}
```

- **每个失败条目都要有一条 attempt**（按原 url 对应），无救的篇目 `candidates` 为空数组、`notes` 写明理由（这句话会透出给用户）
- candidates 最多 3 个，只放 http/https URL，不要放 file:// 或 javascript: 等
- 只写这一个文件；写完回复一行总结（n 篇有候选 / m 篇无救）
