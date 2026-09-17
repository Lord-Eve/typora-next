//! Integration tests for share_course (pure module, #[path] include —
//! linking the full app_lib pulls in WebView2 and the test exe fails to start
//! on some Windows environments).
//!
//! 可执行规格：tests/course-share/features/course_share.feature
//! 核心保证：分享包只含课程内容，学习上下文（进度/成绩/会话/论文）不泄漏。

#[path = "../src/share_images.rs"]
mod share_images;
#[path = "../src/share_course.rs"]
mod share_course;

use share_course::{
    collect_course_files, extract_zip_to, read_manifest_from_zip, sanitize_project_json,
    stage_course_bundle, validate_course_manifest, write_zip_from_dir, SHARE_VERSION,
};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// 每个测试独立的临时根目录（进程 pid + 名称），结束清理。
fn temp_root(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("share-course-test-{}-{}", std::process::id(), name));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn dirty_manifest() -> serde_json::Value {
    serde_json::json!({
        "name": "Rust 入门",
        "created": 1700000000,
        "total_duration": 120,
        "course_type": "technical",
        "course_status": "completed",
        "chapters": [
            {
                "title": "第一章 变量",
                "duration_minutes": 30,
                "concepts": ["变量", "绑定"],
                "file": "01-variables.md",
                "status": "已完成",
                "last_quiz_rating": "good",
                "last_quiz_at": 1700001000
            },
            {
                "title": "第二章 所有权",
                "duration_minutes": 45,
                "concepts": ["所有权"],
                "file": "02-ownership.md"
            },
            {
                "title": "第三章 生命周期",
                "duration_minutes": 45,
                "concepts": ["生命周期"],
                "file": "03-lifetimes.md"
            }
        ],
        "chapters_status": {
            "01-variables.md": "completed",
            "02-ownership.md": "generating",
            "03-lifetimes.md": "failed",
            "ghost-chapter.md": "completed"
        }
    })
}

/// 场景：净化剥离学习上下文、重置章节状态
#[test]
fn sanitize_strips_context_and_resets_status() {
    let mut project = dirty_manifest();
    let present: HashSet<String> = ["01-variables.md".to_string(), "02-ownership.md".to_string()]
        .into_iter()
        .collect();

    sanitize_project_json(&mut project, &present);

    // course_status 删除
    assert!(project.get("course_status").is_none());
    // 存在的章节 → ready（可读未学），缺失 → not_generated（可重新生成）
    let status = project["chapters_status"].as_object().unwrap();
    assert_eq!(status["01-variables.md"], "ready");
    assert_eq!(status["02-ownership.md"], "ready");
    assert_eq!(status["03-lifetimes.md"], "not_generated");
    // 孤儿状态键（不对应任何章节文件）被丢弃
    assert!(status.get("ghost-chapter.md").is_none());
    // 章节遗留的学习字段被剥离
    let ch = &project["chapters"][0];
    assert!(ch.get("status").is_none());
    assert!(ch.get("last_quiz_rating").is_none());
    assert!(ch.get("last_quiz_at").is_none());
    // 盖版本戳
    assert_eq!(project["share_version"], SHARE_VERSION);
}

/// 场景：净化保留内容字段
#[test]
fn sanitize_preserves_content_fields() {
    let mut project = dirty_manifest();
    let present: HashSet<String> = HashSet::new();

    sanitize_project_json(&mut project, &present);

    assert_eq!(project["name"], "Rust 入门");
    assert_eq!(project["created"], 1700000000);
    assert_eq!(project["total_duration"], 120);
    assert_eq!(project["course_type"], "technical");
    assert_eq!(project["chapters"][0]["concepts"][0], "变量");
    assert_eq!(project["chapters"][0]["title"], "第一章 变量");
    assert_eq!(project["chapters"].as_array().unwrap().len(), 3);
}

/// 场景：清单校验拒绝非课程内容
#[test]
fn validate_rejects_invalid_manifest() {
    // 缺 chapters
    assert!(validate_course_manifest(&serde_json::json!({"name": "x"})).is_err());
    // chapters 为空
    assert!(validate_course_manifest(&serde_json::json!({"chapters": []})).is_err());
    // 章节缺 file
    assert!(validate_course_manifest(&serde_json::json!({
        "chapters": [{"title": "a"}]
    }))
    .is_err());
    // 章节缺 title
    assert!(validate_course_manifest(&serde_json::json!({
        "chapters": [{"file": "01-a.md"}]
    }))
    .is_err());
    // 合法清单通过
    assert!(validate_course_manifest(&serde_json::json!({
        "chapters": [{"title": "a", "file": "01-a.md"}]
    }))
    .is_ok());
}

/// 场景：收集只包含磁盘上存在的章节文件与侧车
#[test]
fn collect_includes_existing_files_only() {
    let root = temp_root("collect");
    let course = root.join("course");
    fs::create_dir_all(&course).unwrap();
    // 第一章：md + quiz + concepts 齐全
    fs::write(course.join("01-variables.md"), "# 第一章").unwrap();
    fs::write(course.join("01-variables.quiz.json"), "{}").unwrap();
    fs::write(course.join("01-variables.concepts.json"), "{}").unwrap();
    // 第二章：只有 md
    fs::write(course.join("02-ownership.md"), "# 第二章").unwrap();
    // 第三章：文件未生成

    let files = collect_course_files(&course, &dirty_manifest());

    assert_eq!(
        files,
        vec![
            "01-variables.concepts.json",
            "01-variables.md",
            "01-variables.quiz.json",
            "02-ownership.md",
        ]
    );

    let _ = fs::remove_dir_all(&root);
}

/// 场景（核心）：导出→导入 roundtrip 不泄漏任何学习上下文
#[test]
fn export_import_roundtrip_leaks_no_context() {
    let root = temp_root("roundtrip");
    let course = root.join("course");
    let staging = root.join("staging");
    let import_dest = root.join("imported");

    // 脏课程目录：内容 + 大量学习上下文
    fs::create_dir_all(course.join(".learning/papers/2026-09")).unwrap();
    fs::create_dir_all(course.join(".learning/case-studies")).unwrap();
    fs::create_dir_all(course.join(".pi/skills/chapter-generation")).unwrap();
    fs::create_dir_all(course.join("assets")).unwrap();
    fs::write(course.join(".learning/project.json"), dirty_manifest().to_string()).unwrap();
    fs::write(course.join(".learning/quiz-history.json"), "{}").unwrap();
    fs::write(course.join(".learning/knowledge-graph.json"), "{}").unwrap();
    fs::write(course.join(".learning/review-cards.json"), "{}").unwrap();
    fs::write(course.join(".learning/agent-session.json"), "{}").unwrap();
    fs::write(course.join(".learning/case-studies/s1.json"), "{}").unwrap();
    fs::write(course.join(".learning/papers/2026-09/p.pdf"), "pdf").unwrap();
    fs::write(course.join(".pi/skills/chapter-generation/SKILL.md"), "skill").unwrap();
    fs::write(course.join("assets/pic.png"), "png-bytes").unwrap();
    fs::write(
        course.join("01-variables.md"),
        "# 第一章\n\n![示意图](assets/pic.png)\n",
    )
    .unwrap();
    fs::write(course.join("01-variables.quiz.json"), "{\"questions\":[]}").unwrap();
    fs::write(course.join("01-variables.concepts.json"), "{}").unwrap();
    fs::write(course.join("02-ownership.md"), "# 第二章（无图）").unwrap();

    // 导出：暂存 → zip
    let summary = stage_course_bundle(&course, &staging).unwrap();
    assert_eq!(summary.chapters_total, 3);
    assert_eq!(summary.chapters_ready, 2);
    let zip_path = root.join("bundle.zip");
    write_zip_from_dir(&staging, &zip_path).unwrap();

    // 导入：读清单 → 解压
    let manifest = read_manifest_from_zip(&zip_path).unwrap();
    validate_course_manifest(&manifest).unwrap();
    extract_zip_to(&zip_path, &import_dest).unwrap();

    // 断言 1：上下文文件不存在于解压树的任何位置
    let mut all_files: Vec<String> = Vec::new();
    for entry in walkdir::WalkDir::new(&import_dest) {
        let entry = entry.unwrap();
        if entry.path().is_file() {
            all_files.push(
                entry
                    .path()
                    .strip_prefix(&import_dest)
                    .unwrap()
                    .to_string_lossy()
                    .replace("\\", "/"),
            );
        }
    }
    for leaked in [
        "quiz-history.json",
        "knowledge-graph.json",
        "review-cards.json",
        "agent-session.json",
        "case-studies",
        "papers",
        ".pi",
    ] {
        assert!(
            !all_files.iter().any(|f| f.contains(leaked)),
            "上下文泄漏: {leaked} 出现于 {all_files:?}"
        );
    }

    // 断言 2：内容齐全
    for wanted in [
        ".learning/project.json",
        "01-variables.md",
        "01-variables.quiz.json",
        "01-variables.concepts.json",
        "02-ownership.md",
        "assets/pic.png",
    ] {
        assert!(
            all_files.iter().any(|f| f == wanted),
            "缺少内容文件: {wanted}（实际 {all_files:?}）"
        );
    }

    // 断言 3：解压后的 manifest 状态已重置
    let imported: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(import_dest.join(".learning/project.json")).unwrap(),
    )
    .unwrap();
    assert!(imported.get("course_status").is_none());
    assert_eq!(imported["chapters_status"]["01-variables.md"], "ready");
    assert_eq!(imported["chapters_status"]["03-lifetimes.md"], "not_generated");

    // 断言 4：章节 md 的图片引用重写为相对路径且图片可用
    let md = fs::read_to_string(import_dest.join("01-variables.md")).unwrap();
    assert!(md.contains("](assets/pic.png)"), "图片引用应重写: {md}");

    let _ = fs::remove_dir_all(&root);
}

/// 场景：解压拒绝 zip-slip 条目
#[test]
fn extract_zip_rejects_zip_slip() {
    let root = temp_root("zipslip");
    let zip_path = root.join("evil.zip");
    let dest = root.join("dest");
    fs::create_dir_all(&dest).unwrap();

    // 手工构造带 ../ 条目的 zip
    let file = fs::File::create(&zip_path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("../evil.txt", options).unwrap();
    use std::io::Write;
    zip.write_all(b"evil").unwrap();
    zip.finish().unwrap();

    let result = extract_zip_to(&zip_path, &dest);
    assert!(result.is_err(), "zip-slip 必须被拒绝");
    assert!(!root.join("evil.txt").exists(), "逃逸文件不得落地");

    let _ = fs::remove_dir_all(&root);
}

/// 场景：read_manifest_from_zip 拒绝非课程 zip
#[test]
fn read_manifest_rejects_non_course_zip() {
    let root = temp_root("badzip");
    let zip_path = root.join("random.zip");
    let file = fs::File::create(&zip_path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("readme.txt", options).unwrap();
    use std::io::Write;
    zip.write_all(b"hello").unwrap();
    zip.finish().unwrap();

    assert!(read_manifest_from_zip(&zip_path).is_err());

    let _ = fs::remove_dir_all(&root);
}

/// 辅助：断言 Path 下相对路径存在（供调试输出用）
#[allow(dead_code)]
fn exists_rel(base: &Path, rel: &str) -> bool {
    base.join(rel).exists()
}
