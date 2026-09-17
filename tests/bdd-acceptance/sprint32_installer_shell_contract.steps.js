#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for Sprint 32: 安装期 Windows Shell 契约
 *
 * 真实文件系统：直接读构建产物（不碰 dist/，因为这几项是安装期契约）——
 *  - src-tauri/tauri.conf.json      installerHooks 接线
 *  - src-tauri/nsis/hooks.nsh       POSTINSTALL 钩子内容
 *  - src-tauri/icons/icon.ico       ICO 目录条目编码
 *
 * 为什么这些要上锁：2026-09-17 用户实机装完出现「快捷方式白图标」。
 * 根因是重装窗口期把 Windows 图标缓存污染了，而 NSIS 生成的 .lnk 不带显式
 * IconLocation → 缓存一旦坏掉没有任何东西把它顶回来。这里守住两个不再复发的条件：
 * 钩子必须写显式图标 + 收尾强制 shell 刷新；小尺寸图标必须是 BMP 编码。
 */

const fs = require('fs');
const path = require('path');
const { StepRegistry } = require('../shared/runner');

const ROOT = path.join(__dirname, '../..');
const ICO_PATH = path.join(ROOT, 'src-tauri/icons/icon.ico');
const CONF_PATH = path.join(ROOT, 'src-tauri/tauri.conf.json');
const HOOKS_PATH = path.join(ROOT, 'src-tauri/nsis/hooks.nsh');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const steps = new StepRegistry();

/**
 * 解析 ICO 目录条目（只读元数据，不解码像素）。
 * 编码判定：条目数据以 PNG magic 开头 = PNG，否则 = BMP(DIB)。
 */
function parseIco(buf) {
  if (buf.length < 6) throw new Error('icon.ico 太小，不是合法 ICO');
  const reserved = buf.readUInt16LE(0);
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  if (reserved !== 0 || type !== 1) {
    throw new Error(`icon.ico 头部非法（reserved=${reserved}, type=${type}）`);
  }
  const entries = [];
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    const w = buf.readUInt8(off) || 256;
    const h = buf.readUInt8(off + 1) || 256;
    const bpp = buf.readUInt16LE(off + 6);
    const size = buf.readUInt32LE(off + 8);
    const offset = buf.readUInt32LE(off + 12);
    const blob = buf.slice(offset, offset + size);
    entries.push({ w, h, bpp, size, isPng: blob.slice(0, 8).equals(PNG_MAGIC) });
  }
  return entries;
}

/** 取 NSIS_HOOK_POSTINSTALL 宏体（钩子真正的执行内容） */
function postInstallHookBody(hooks) {
  const start = hooks.indexOf('!macro NSIS_HOOK_POSTINSTALL');
  if (start < 0) return '';
  const end = hooks.indexOf('!macroend', start);
  return end < 0 ? '' : hooks.slice(start, end);
}

// ============================================
// Given
// ============================================
steps.given('the real installer artifacts', function() {
  if (!fs.existsSync(ICO_PATH)) throw new Error(`缺少图标文件: ${ICO_PATH}`);
  if (!fs.existsSync(CONF_PATH)) throw new Error(`缺少配置: ${CONF_PATH}`);
  this.icoEntries = parseIco(fs.readFileSync(ICO_PATH));
  this.conf = JSON.parse(fs.readFileSync(CONF_PATH, 'utf-8'));
  this.hooks = fs.existsSync(HOOKS_PATH) ? fs.readFileSync(HOOKS_PATH, 'utf-8') : '';
  this.hookBody = postInstallHookBody(this.hooks);
});

// ============================================
// Then
// ============================================
steps.then('the installer hooks should set an explicit icon location on shortcuts', function() {
  if (!this.hooks) {
    throw new Error('src-tauri/nsis/hooks.nsh 不存在——快捷方式图标不会被显式指定');
  }
  if (!this.hooks.includes('IShellLink::SetIconLocation')) {
    throw new Error(
      'hooks.nsh 未调用 IShellLink::SetIconLocation：快捷方式 IconLocation 仍为空，' +
      '图标只能靠系统回退读 exe，缓存被污染后无法自愈'
    );
  }
  const iconTarget = '$INSTDIR\\${MAINBINARYNAME}.exe';
  if (!this.hooks.includes(iconTarget)) {
    throw new Error(`hooks.nsh 未把图标指向安装目录内的 exe（期望出现 ${iconTarget}）`);
  }
  if (!this.hooks.includes('IPersistFile::Save')) {
    throw new Error('hooks.nsh 改了图标却没 IPersistFile::Save——修改不会落盘');
  }
});

steps.then('the hooks should only touch shortcuts that already exist', function() {
  // 每次调用前都必须有 ${FileExists} 守卫：尊重「不创建桌面快捷方式」的选择
  const invocations = (this.hookBody.match(/TNSetShortcutIconLocation\s+"/g) || []).length;
  const guards = (this.hookBody.match(/\$\{FileExists\}/g) || []).length;
  if (invocations === 0) {
    throw new Error('POSTINSTALL 钩子没有修改任何快捷方式的图标');
  }
  if (guards < invocations) {
    throw new Error(
      `有 ${invocations} 次快捷方式改写但只有 ${guards} 个 \${FileExists} 守卫：` +
      '可能凭空创建用户没有的快捷方式'
    );
  }
});

steps.then('the post-install hook should force a shell icon refresh', function() {
  if (!this.hookBody.includes('shell32::SHChangeNotify')) {
    throw new Error('POSTINSTALL 钩子未调 SHChangeNotify：已污染的图标缓存不会被作废，白图标会一直留着');
  }
  if (!this.hookBody.includes('0x08000000')) {
    throw new Error('SHChangeNotify 未使用 SHCNE_ASSOCCHANGED (0x08000000)，不会触发图标缓存重建');
  }
});

steps.then('the nsis installer hooks file should be wired in the bundle config', function() {
  const nsis = (this.conf.bundle && this.conf.bundle.windows && this.conf.bundle.windows.nsis) || null;
  if (!nsis || !nsis.installerHooks) {
    throw new Error('tauri.conf.json 未配置 bundle.windows.nsis.installerHooks——钩子文件不会被包含');
  }
  const hookPath = path.join(ROOT, 'src-tauri', nsis.installerHooks);
  if (!fs.existsSync(hookPath)) {
    throw new Error(`installerHooks 指向的文件不存在: ${hookPath}`);
  }
  if (!this.conf.bundle.icon.includes('icons/icon.ico')) {
    throw new Error('bundle.icon 未包含 icons/icon.ico，exe/安装器将没有图标');
  }
});

steps.then('the icon should carry the standard shell sizes', function() {
  const sizes = new Set(this.icoEntries.map(e => e.w));
  for (const need of [16, 32, 48, 256]) {
    if (!sizes.has(need)) {
      throw new Error(`icon.ico 缺少 ${need}px 条目（shell 各视图会调用这些尺寸）`);
    }
  }
  const bad = this.icoEntries.filter(e => e.bpp !== 32);
  if (bad.length) {
    throw new Error(`icon.ico 存在非 32bpp 条目: ${bad.map(e => `${e.w}x${e.h}/${e.bpp}bpp`).join(', ')}`);
  }
});

steps.then('the small icon entries should use bmp encoding', function() {
  const small = this.icoEntries.filter(e => e.w < 256);
  if (small.length === 0) throw new Error('icon.ico 没有小尺寸条目');
  const pngSmall = small.filter(e => e.isPng);
  if (pngSmall.length) {
    throw new Error(
      `小尺寸条目仍在使用 PNG 编码: ${pngSmall.map(e => `${e.w}x${e.h}`).join(', ')}——` +
      'Windows 对小尺寸 PNG 条目支持不完整，是快捷方式白图标的常见成因'
    );
  }
});

steps.then('the large icon entry should keep png encoding', function() {
  const large = this.icoEntries.find(e => e.w === 256);
  if (!large) throw new Error('icon.ico 缺少 256px 条目');
  if (!large.isPng) {
    throw new Error('256px 条目应为 PNG 编码（BMP 会让体积膨胀到约 256KB）');
  }
});

module.exports = steps;
