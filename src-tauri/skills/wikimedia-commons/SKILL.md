---
name: wikimedia-commons
description: 为人文课章节中的具体作品实例（乐曲/乐章）查找 Wikimedia Commons 上的公共领域录音，并嵌入内联 <audio> 播放器。Use when generating humanities/hybrid course chapters that cite concrete musical works. 提供白名单脚本 scripts/wiki-fetch.mjs 执行 HTTP GET。
---

# Wikimedia Commons 试听嵌入

为人文课章节引用的具体作品实例配**可播放的公共领域录音**。

## 工具

本 skill 自带白名单 GET 脚本（只能访问 Wikimedia 域名）：

```bash
node .pi/skills/wikimedia-commons/scripts/wiki-fetch.mjs "<https-url>"
```

（若项目里不存在该路径，试 `.claude/skills/` 前缀。）

- 仅允许 `commons.wikimedia.org`（API）与 `upload.wikimedia.org`（文件直链）
- 输出为一行 JSON：`{"ok":true,"status":200,"body":"..."}` 或 `{"ok":false,"error":"..."}`
- 响应截断 32KB——**用 limit 参数控制结果数**，不要拉全文

## 查找流程（三步）

### 1. 搜索 File 命名空间

```
https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=<关键词>
```

- `gsrnamespace=6` = File 命名空间（必须）
- 关键词用**作品原名 + 编号**效果最好：`Bach Brandenburg Concerto 2 BWV 1047`，不要只搜中文名
- `gsrlimit=10` 足够，不要更大

### 2. 过滤音频并取直链

对上一步返回的 pageids 查文件信息：

```
https://commons.wikimedia.org/w/api.php?action=query&format=json&pageids=<id1|id2|...>&prop=videoinfo&viprop=url|mime|size|derivatives
```

- 只保留 mime 为 `audio/ogg`、`audio/flac`、`audio/mpeg` 的文件
- 直链取 `url` 字段（`upload.wikimedia.org` 开头）；有 `derivatives` 时优先选码率合理的转码版

### 3. 选段判断

- **单乐章完整录音 > 全曲 > 片段**：章节引用具体乐章时，优先标题/描述里带对应乐章号（III. Allegro、3rd movement 等）的文件
- 知名乐团/厂牌（Musopen、各国广播乐团 PD 录音）优先于无名上传
- 只有全曲录音时：嵌全曲，署名行标注「全曲录音，本章关注第 X 乐章」

## 嵌入格式

查到时写入章节正文（紧接作品实例段落之后）：

```html
<div class="audio-embed">
  <audio controls preload="none" src="https://upload.wikimedia.org/..."></audio>
  <div class="audio-credit">🎧 《作品名》乐章 · 演奏者/来源 · Wikimedia Commons（公共领域）</div>
</div>
```

`preload="none"` 必须保留（避免打开章节就下载整段音频）。

## 降级（不阻塞章节）

以下任一情况发生，**不要重试超过 1 次**，直接写链接卡片并继续正文：

- 搜索无结果 / 结果里没有音频 mime
- wiki-fetch 返回 `"ok": false`（超时、网络不可用、HTTP 错误）

```html
<div class="audio-embed audio-fallback">
  🔎 试听：在 Wikimedia Commons 搜索「<作品关键词>」→ https://commons.wikimedia.org/w/index.php?search=<url编码关键词>&title=Special:Search&ns6=1
</div>
```

章节正文的完整性永远优先于试听——找不到就降级，**不阻塞章节生成**。
