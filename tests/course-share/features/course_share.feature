# 课程分享：只分享课程内容，不分享学习上下文
# 对应产物: src-tauri/src/share_course.rs（净化 + 白名单打包 + zip 读写）
#           src-tauri/src/lib.rs（share_course / import_course 命令）
#           dist/scripts/learning/learning-hub.js（卡片分享按钮 + 导入课程包按钮）
#
# 核心保证：
#   1) 分享包是白名单打包——净化后的 project.json + 章节文件/侧车 + 引用图片，
#      学习上下文（进度、成绩、知识图谱、会话、论文库）在构造上不可能入包；
#   2) 净化后的清单状态重置为 ready / not_generated，接收方导入后显示零进度；
#   3) 行为级验证（导出→导入 roundtrip 不泄漏、zip-slip 防护）由
#      src-tauri/tests/share_course_test.rs 覆盖，本层守接线与导入侧读法。
#
# 注意：本仓库的 feature 解析器只认英文关键字（Feature/Scenario/Given/When/Then/And），
# 中文关键字行会被静默忽略导致场景空跑。

Feature: 课程分享（内容打包与应用内导入）

  As a course author
  I want to share my course content as a zip package
  So that recipients get the full content without any of my learning progress

  Scenario: 分享与导入命令已注册且打包模块为白名单净化
    Given the course share source files
    Then the share_course module should sanitize the manifest before packing
    And the tauri commands share_course and import_course should be registered

  Scenario: 前端入口接线完整
    Given the course share source files
    Then the learning hub should expose the import zip button
    And the learning hub cards should have a visible share button

  Scenario: 导入的课程显示为零进度
    Given an imported course folder with a sanitized manifest
    Then the hub should detect the course with zero completed chapters
