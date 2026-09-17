//! 课程分享包：净化清单、收集内容文件、ZIP 读写。
//!
//! 纯模块（仅 std + serde_json + zip + walkdir + crate::share_images），
//! 不引用 Tauri —— 集成测试通过 #[path] include 直接测试（链接完整
//! app_lib 会引入 WebView2，测试 exe 在部分 Windows 环境无法启动，
//! 与 share_images.rs / learning_paths.rs 同一模式）。
//!
//! 安全设计：白名单打包。暂存目录只写入「净化后的 project.json + 磁盘上
//! 存在的章节文件/侧车 + 章节引用的本地图片」，学习上下文（quiz-history、
//! knowledge-graph、agent-session、papers、.pi 等）在构造上不可能入包。

use crate::share_images;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

/// 分享包格式版本（导入端据此做前向兼容判断）
pub const SHARE_VERSION: u32 = 1;

/// 暂存结果摘要（供前端提示「N/M 章已就绪」与 zip 命名）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StageSummary {
    pub chapters_total: usize,
    pub chapters_ready: usize,
    pub course_name: String,
}

/// 净化 project.json 用于分享：剥离学习上下文，保留课程内容。
/// - 删除 `course_status`（完成标记是进度，读侧从 chapters_status 推导）
/// - 重建 `chapters_status`：包内存在的章节文件 → "ready"（可读未学），
///   缺失 → "not_generated"（接收方可重新生成）；不对应章节文件的孤儿键丢弃
/// - 剥离章节遗留学习字段（status / last_quiz_rating / last_quiz_at）
/// - 盖 `share_version` 版本戳
pub fn sanitize_project_json(project: &mut Value, present_files: &HashSet<String>) {
    let obj = match project.as_object_mut() {
        Some(o) => o,
        None => return,
    };
    obj.remove("course_status");

    let mut chapter_files: Vec<String> = Vec::new();
    if let Some(chapters) = obj.get_mut("chapters").and_then(|c| c.as_array_mut()) {
        for ch in chapters {
            if let Some(ch_obj) = ch.as_object_mut() {
                ch_obj.remove("status");
                ch_obj.remove("last_quiz_rating");
                ch_obj.remove("last_quiz_at");
                if let Some(f) = ch_obj.get("file").and_then(|f| f.as_str()) {
                    chapter_files.push(f.to_string());
                }
            }
        }
    }

    let mut status = serde_json::Map::new();
    for f in chapter_files {
        let s = if present_files.contains(&f) {
            "ready"
        } else {
            "not_generated"
        };
        status.insert(f, Value::String(s.to_string()));
    }
    obj.insert("chapters_status".to_string(), Value::Object(status));
    obj.insert("share_version".to_string(), Value::from(SHARE_VERSION));
}

/// 收集课程内容文件的相对路径（正斜杠，排序保证打包确定性）：
/// 磁盘上存在的章节 md + 其存在的 {stem}.quiz.json / {stem}.concepts.json 侧车。
pub fn collect_course_files(project_dir: &Path, project: &Value) -> Vec<String> {
    let mut files = Vec::new();
    if let Some(chapters) = project.get("chapters").and_then(|c| c.as_array()) {
        for ch in chapters {
            let file = match ch.get("file").and_then(|f| f.as_str()) {
                Some(f) => f,
                None => continue,
            };
            if !project_dir.join(file).is_file() {
                continue;
            }
            files.push(file.to_string());
            let stem = file.strip_suffix(".md").unwrap_or(file);
            for sidecar in [
                format!("{stem}.quiz.json"),
                format!("{stem}.concepts.json"),
            ] {
                if project_dir.join(&sidecar).is_file() {
                    files.push(sidecar);
                }
            }
        }
    }
    files.sort();
    files
}

/// 清单校验（导出/导入共用）：chapters 非空，每章有非空 title 和 file。
pub fn validate_course_manifest(project: &Value) -> Result<(), String> {
    let chapters = project
        .get("chapters")
        .and_then(|c| c.as_array())
        .filter(|c| !c.is_empty())
        .ok_or_else(|| "缺少 chapters 清单".to_string())?;
    for ch in chapters {
        let has_title = ch
            .get("title")
            .and_then(|t| t.as_str())
            .map(|s| !s.is_empty())
            .unwrap_or(false);
        let has_file = ch
            .get("file")
            .and_then(|f| f.as_str())
            .map(|s| !s.is_empty())
            .unwrap_or(false);
        if !has_title || !has_file {
            return Err("章节缺少 title 或 file 字段".to_string());
        }
    }
    Ok(())
}

/// 把课程内容暂存到 staging_dir：净化清单 + 章节文件（图片入包并重写引用）
/// + 侧车原样拷贝。返回章节摘要供前端提示。
pub fn stage_course_bundle(project_dir: &Path, staging_dir: &Path) -> Result<StageSummary, String> {
    let raw = fs::read_to_string(project_dir.join(".learning/project.json"))
        .map_err(|e| format!("读取 project.json 失败: {e}"))?;
    let mut project: Value =
        serde_json::from_str(&raw).map_err(|e| format!("解析 project.json 失败: {e}"))?;
    validate_course_manifest(&project)?;

    let files = collect_course_files(project_dir, &project);
    let present: HashSet<String> = files
        .iter()
        .filter(|f| f.ends_with(".md"))
        .cloned()
        .collect();
    let summary = StageSummary {
        chapters_total: project["chapters"]
            .as_array()
            .map(|c| c.len())
            .unwrap_or(0),
        chapters_ready: present.len(),
        course_name: project["name"]
            .as_str()
            .unwrap_or("course")
            .to_string(),
    };
    sanitize_project_json(&mut project, &present);

    let learning_dir = staging_dir.join(".learning");
    fs::create_dir_all(&learning_dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let pretty = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("序列化 project.json 失败: {e}"))?;
    fs::write(learning_dir.join("project.json"), pretty)
        .map_err(|e| format!("写入 project.json 失败: {e}"))?;

    let project_dir_str = project_dir.to_string_lossy().to_string();
    for rel in &files {
        let source = project_dir.join(rel);
        let dest = staging_dir.join(rel);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
        if rel.ends_with(".md") {
            let content =
                fs::read_to_string(&source).map_err(|e| format!("读取章节失败 {rel}: {e}"))?;
            let rewritten =
                stage_chapter_images(&content, project_dir, &project_dir_str, staging_dir)?;
            fs::write(&dest, rewritten).map_err(|e| format!("写入章节失败 {rel}: {e}"))?;
        } else {
            fs::copy(&source, &dest).map_err(|e| format!("复制文件失败 {rel}: {e}"))?;
        }
    }

    Ok(summary)
}

/// 章节正文的本地图片拷入暂存目录并重写引用（与 share_document 同套机制，
/// base_dir = md_dir = 课程根目录，保持包内相对结构）。
fn stage_chapter_images(
    content: &str,
    project_dir: &Path,
    project_dir_str: &str,
    staging_dir: &Path,
) -> Result<String, String> {
    let mut rewritten = content.to_string();
    for img_ref in share_images::extract_image_refs(content) {
        if share_images::is_remote(&img_ref.target) {
            continue;
        }
        let decoded = share_images::percent_decode(&img_ref.target);
        let p = PathBuf::from(&decoded);
        // 先 normalize 再算包内相对路径：../ 引用不处理会逃出暂存目录
        let source = share_images::normalize_path(&if p.is_absolute() {
            p
        } else {
            project_dir.join(&decoded)
        });
        if !source.exists() {
            continue;
        }
        let rel = share_images::share_relative_path(&source, project_dir_str, project_dir_str);
        let dest = staging_dir.join(&rel);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
        fs::copy(&source, &dest)
            .map_err(|e| format!("复制图片失败 {}: {e}", source.display()))?;

        let replacement = if img_ref.original.starts_with("![[") {
            let target = &img_ref.original[3..img_ref.original.len() - 2];
            let name = Path::new(target)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "image".to_string());
            format!("![{name}]({rel})")
        } else {
            let alt_end = img_ref.original.find("](").unwrap_or(0);
            let alt = if alt_end > 2 {
                &img_ref.original[2..alt_end]
            } else {
                ""
            };
            format!("![{alt}]({rel})")
        };
        rewritten = rewritten.replace(&img_ref.original, &replacement);
    }
    Ok(rewritten)
}

/// 把 dir 内容打成 ZIP（Deflated）。条目名统一正斜杠（跨平台解压一致）。
pub fn write_zip_from_dir(dir: &Path, zip_path: &Path) -> Result<(), String> {
    let zip_file = fs::File::create(zip_path).map_err(|e| format!("创建zip文件失败: {e}"))?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for entry in walkdir::WalkDir::new(dir) {
        let entry = entry.map_err(|e| format!("遍历目录失败: {e}"))?;
        let path = entry.path();
        if path == dir || path == zip_path {
            continue;
        }
        let name = path
            .strip_prefix(dir)
            .map_err(|e| format!("路径处理失败: {e}"))?
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_file() {
            zip.start_file(name, options)
                .map_err(|e| format!("添加文件到zip失败: {e}"))?;
            let mut file = fs::File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer)
                .map_err(|e| format!("读取文件失败: {e}"))?;
            zip.write_all(&buffer)
                .map_err(|e| format!("写入zip失败: {e}"))?;
        }
    }
    zip.finish().map_err(|e| format!("完成zip失败: {e}"))?;
    Ok(())
}

/// 解压 ZIP 到 dest，逐项 enclosed_name() 防 zip-slip。
pub fn extract_zip_to(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|e| format!("打开zip失败: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取zip失败: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("读取zip条目失败: {e}"))?;
        let rel = entry
            .enclosed_name()
            .ok_or_else(|| format!("zip 包含非法路径: {}", entry.name()))?;
        let out = dest.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| format!("创建目录失败: {e}"))?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
        let mut buf = Vec::with_capacity(entry.size() as usize);
        entry
            .read_to_end(&mut buf)
            .map_err(|e| format!("解压失败: {e}"))?;
        fs::write(&out, &buf).map_err(|e| format!("写入文件失败: {e}"))?;
    }
    Ok(())
}

/// 从 ZIP 中读取 .learning/project.json（条目名统一按正斜杠匹配）。
pub fn read_manifest_from_zip(zip_path: &Path) -> Result<Value, String> {
    let file = fs::File::open(zip_path).map_err(|e| format!("打开zip失败: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取zip失败: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("读取zip条目失败: {e}"))?;
        if entry.name().replace('\\', "/") == ".learning/project.json" {
            let mut buf = String::new();
            entry
                .read_to_string(&mut buf)
                .map_err(|e| format!("读取清单失败: {e}"))?;
            return serde_json::from_str(&buf).map_err(|e| format!("解析清单失败: {e}"));
        }
    }
    Err("包内缺少 .learning/project.json".to_string())
}
