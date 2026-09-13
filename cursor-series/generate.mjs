#!/usr/bin/env node
/**
 * 精修光标系列生成器 · cursor-series/generate.mjs
 *
 * 一条命令重建三份产物：
 *   cursor-series/svg/*.svg   12 款 32×32 光标
 *   ../cursor-series.html     总览画廊
 *   README.md                 本目录说明（表格由元数据生成）
 *
 * 结构与内置光标（dist/cursors/）保持一致：统一画布 32×32、统一压线色 #1a1a2e、
 * 主体占满 3~29 格四周留白。每个光标拆成四段，段落标题固定：
 *   <defs> … 渐变与材质定义
 *   并集形状 … 外缘压线（ink-outline）+ 逐面填充（ink-fill）
 *   分面 / 材质 … 不压线的内部面块
 *   高光 / 缝隙 / 环境光遮蔽 … 细节笔触
 *
 * 元数据（id / 中文名 / 分组 / 锚点 / 热点说明 / 画法要点）是唯一真源，
 * 画廊与 README 表格都由它派生，不会出现三处不同步。
 *
 * 用法：
 *   node cursor-series/generate.mjs          生成
 *   node cursor-series/generate.mjs --check  只校验，不写盘
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/**
 * 产物出场顺序（画格、画廊分组、README 表格共用）。
 * 与 CURSORS 的书写顺序解耦：改定义顺序不会打乱文档，反之亦然。
 */
const ORDER = [
  'magnifier', 'brush', 'scissors', 'ruler', 'pushpin', 'bookmark',
  'flame', 'lightning',
  'arrow', 'hand', 'ibeam', 'move',
];

/** 按 ORDER 排好的光标列表。 */
const ordered = () => ORDER.map((id) => CURSORS.find((c) => c.id === id));

// ─────────────────────────────────────────────────────────────────────────────
// 光标定义：anchor 必须落在「指点部位」上，而不是包围盒中心。
// 热点错位是光标最常见的毛病——差 2 格就会让用户点不准。
// ─────────────────────────────────────────────────────────────────────────────

const CURSORS = [
  {
    id: 'arrow', cn: '经典箭头', group: '标准',
    anchor: [3, 2], hotspotNote: '箭头尖端',
    gist: '银灰箭身 + 尾翼分面 + 左缘高光',
    body: `  <defs>
    <linearGradient id="arBody" gradientUnits="userSpaceOnUse" x1="3" y1="2" x2="22" y2="30">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.34" stop-color="#e2e8f0"/>
      <stop offset="0.7" stop-color="#a8b6c8"/>
      <stop offset="1" stop-color="#7d8b9e"/>
    </linearGradient>
    <linearGradient id="arTail" gradientUnits="userSpaceOnUse" x1="9" y1="20" x2="19" y2="29">
      <stop offset="0" stop-color="#b9c6d6"/>
      <stop offset="1" stop-color="#63738a"/>
    </linearGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <path d="M3.2 2.2 L3.2 24.6 L9.64 22.08 L14.32 29.18 L19.29 27.24 L14.61 20.14 L21.6 17.4 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <path d="M3.2 2.2 L3.2 24.6 L9.64 22.08 L14.32 29.18 L19.29 27.24 L14.61 20.14 L21.6 17.4 Z" fill="url(#arBody)"/>
  </g>

  <!-- ═══ 分面 / 材质 ═══ -->
  <path d="M9.64 22.08 L14.32 29.18 L19.29 27.24 L14.61 20.14 Z" fill="url(#arTail)"/>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M9.64 22.08 L14.61 20.14" stroke="#334155" stroke-width="0.55" opacity="0.7" fill="none"/>
  <path d="M4.5 4.6 L4.5 21.4 L5.9 20.7 L5.9 5.2 Z" opacity="0.35" fill="#ffffff"/>
  <path d="M10.3 22.9 L14.6 29.4" stroke="#e2e8f0" stroke-width="0.5" opacity="0.5" fill="none"/>
  <path d="M5.0 21.4 L5.0 4.2" stroke="#64748b" stroke-width="0.5" opacity="0.5" fill="none"/>`,
  },

  {
    id: 'ibeam', cn: '文本 I 形', group: '标准',
    anchor: [16, 4], hotspotNote: '竖杆顶端',
    gist: '银白工字杆 + 中轴高光与暗边',
    body: `  <defs>
    <linearGradient id="ibMetal" gradientUnits="userSpaceOnUse" x1="8" y1="3" x2="24" y2="29">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.3" stop-color="#e6edf5"/>
      <stop offset="0.62" stop-color="#a9b9cb"/>
      <stop offset="1" stop-color="#6f8098"/>
    </linearGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <path d="M8.6 3.6 h14.8 v2.8 h-4.4 v19.2 h4.4 v2.8 h-14.8 v-2.8 h4.4 v-19.2 h-4.4 z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <path d="M8.6 3.6 h14.8 v2.8 h-4.4 v19.2 h4.4 v2.8 h-14.8 v-2.8 h4.4 v-19.2 h-4.4 z" fill="url(#ibMetal)"/>
  </g>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M13.6 7.0 v18.4" stroke="#ffffff" stroke-width="0.8" opacity="0.7" fill="none"/>
  <path d="M18.4 7.0 v18.4" stroke="#4a5a70" stroke-width="0.7" opacity="0.5" fill="none"/>
  <path d="M8.9 6.4 h14.2" stroke="#475569" stroke-width="0.5" opacity="0.45" fill="none"/>
  <path d="M8.9 25.6 h14.2" stroke="#475569" stroke-width="0.5" opacity="0.45" fill="none"/>`,
  },

  {
    id: 'hand', cn: '手型', group: '标准',
    anchor: [14, 3], hotspotNote: '食指指尖',
    gist: '五指分节 + 指节缝 + 掌心受光',
    body: `  <defs>
    <linearGradient id="hdSkinLit" gradientUnits="userSpaceOnUse" x1="10" y1="3" x2="16.5" y2="18">
      <stop offset="0" stop-color="#ffeed8"/>
      <stop offset="0.5" stop-color="#f8d2ab"/>
      <stop offset="1" stop-color="#e8b184"/>
    </linearGradient>
    <linearGradient id="hdSkin" gradientUnits="userSpaceOnUse" x1="10" y1="9" x2="29" y2="27">
      <stop offset="0" stop-color="#fbd9b4"/>
      <stop offset="0.52" stop-color="#efb98c"/>
      <stop offset="1" stop-color="#d99e6f"/>
    </linearGradient>
    <linearGradient id="hdSkinMid" gradientUnits="userSpaceOnUse" x1="4" y1="12" x2="12" y2="24">
      <stop offset="0" stop-color="#f7caa0"/>
      <stop offset="1" stop-color="#dca173"/>
    </linearGradient>
    <linearGradient id="hdSkinDeep" gradientUnits="userSpaceOnUse" x1="12" y1="22" x2="23" y2="30">
      <stop offset="0" stop-color="#e3ad7e"/>
      <stop offset="1" stop-color="#c1875a"/>
    </linearGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <rect x="24" y="11.6" width="4.6" height="9" rx="2.3" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="19.8" y="10.2" width="4.6" height="10.5" rx="2.3" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="15.4" y="9.4" width="4.6" height="11" rx="2.3" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="10.6" y="3.2" width="4.6" height="14" rx="2.3" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="5.2" y="11.8" width="4.8" height="12.4" rx="2.4" transform="rotate(-22 7.6 18)" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="11.4" y="14.2" width="17.2" height="10.4" rx="4.4" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="12.6" y="21.5" width="10.2" height="7.6" rx="3.2" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <rect x="24" y="11.6" width="4.6" height="9" rx="2.3" fill="url(#hdSkin)"/>
    <rect x="19.8" y="10.2" width="4.6" height="10.5" rx="2.3" fill="url(#hdSkin)"/>
    <rect x="15.4" y="9.4" width="4.6" height="11" rx="2.3" fill="url(#hdSkin)"/>
    <rect x="10.6" y="3.2" width="4.6" height="14" rx="2.3" fill="url(#hdSkinLit)"/>
    <rect x="5.2" y="11.8" width="4.8" height="12.4" rx="2.4" transform="rotate(-22 7.6 18)" fill="url(#hdSkinMid)"/>
    <rect x="11.4" y="14.2" width="17.2" height="10.4" rx="4.4" fill="url(#hdSkin)"/>
    <rect x="12.6" y="21.5" width="10.2" height="7.6" rx="3.2" fill="url(#hdSkinDeep)"/>
  </g>

  <!-- ═══ 分面 / 材质 ═══ -->
  <ellipse cx="13.6" cy="17.8" rx="2.2" ry="3.6" opacity="0.22" transform="rotate(-18 13.6 17.8)" fill="#ffffff"/>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M11.7 6.4 L11.7 14.8" stroke="#fff3e2" stroke-width="0.85" opacity="0.6" stroke-linecap="round" fill="none"/>
  <path d="M15.55 15.0 C15.45 16.4 15.55 17.6 15.75 18.8" stroke="#b5764a" stroke-width="0.6" opacity="0.5" fill="none"/>
  <path d="M19.95 15.4 C19.85 16.6 19.95 17.7 20.15 18.8" stroke="#b5764a" stroke-width="0.6" opacity="0.5" fill="none"/>
  <path d="M24.15 16.2 C24.05 17.2 24.15 18.2 24.35 19.2" stroke="#b5764a" stroke-width="0.6" opacity="0.5" fill="none"/>
  <path d="M9.2 17.6 C10.4 19.2 11.6 20.4 13.0 21.4" stroke="#c98a5e" stroke-width="0.7" opacity="0.5" fill="none"/>
  <path d="M12.9 25.6 C15.5 26.5 19.9 26.4 22.6 25.5" stroke="#c08a5f" stroke-width="0.75" opacity="0.6" fill="none"/>`,
  },

  {
    id: 'move', cn: '四向移动', group: '标准',
    anchor: [16, 16], hotspotNote: '图形中心',
    gist: '四向箭头 + 中心握点 + 对角明暗',
    body: `  <defs>
    <linearGradient id="mvSteel" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="30" y2="30">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.32" stop-color="#dbe4ee"/>
      <stop offset="0.66" stop-color="#94a3b8"/>
      <stop offset="1" stop-color="#64748b"/>
    </linearGradient>
    <radialGradient id="mvGrip" gradientUnits="userSpaceOnUse" cx="15.2" cy="15.2" r="3.0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#cbd5e1"/>
      <stop offset="1" stop-color="#7c8ba0"/>
    </radialGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <path d="M16 2 L21 7 L18.6 7 L18.6 13.4 L25 13.4 L25 11 L30 16 L25 21 L25 18.6 L18.6 18.6 L18.6 25 L21 25 L16 30 L11 25 L13.4 25 L13.4 18.6 L7 18.6 L7 21 L2 16 L7 11 L7 13.4 L13.4 13.4 L13.4 7 L11 7 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <path d="M16 2 L21 7 L18.6 7 L18.6 13.4 L25 13.4 L25 11 L30 16 L25 21 L25 18.6 L18.6 18.6 L18.6 25 L21 25 L16 30 L11 25 L13.4 25 L13.4 18.6 L7 18.6 L7 21 L2 16 L7 11 L7 13.4 L13.4 13.4 L13.4 7 L11 7 Z" fill="url(#mvSteel)"/>
  </g>

  <!-- ═══ 分面 / 材质 ═══ -->
  <circle cx="16" cy="16" r="2.7" fill="url(#mvGrip)"/>
  <circle cx="16" cy="16" r="2.7" stroke="#1a1a2e" stroke-width="0.9" fill="none"/>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M16 3.6 L20.2 7.8 L18.6 7.8 L18.6 13.4" stroke="#ffffff" stroke-width="0.7" opacity="0.7" fill="none"/>
  <path d="M16 28.4 L11.8 24.2 L13.4 24.2 L13.4 18.6" stroke="#3b4a5e" stroke-width="0.7" opacity="0.5" fill="none"/>
  <path d="M3.6 16 L7.8 11.8 L7.8 13.4 L13.4 13.4" stroke="#ffffff" stroke-width="0.6" opacity="0.55" fill="none"/>
  <path d="M28.4 16 L24.2 20.2 L24.2 18.6 L18.6 18.6" stroke="#3b4a5e" stroke-width="0.6" opacity="0.45" fill="none"/>
  <circle cx="16" cy="16" r="1.2" stroke="#475569" stroke-width="0.5" opacity="0.55" fill="none"/>`,
  },

  {
    id: 'magnifier', cn: '放大镜', group: '工具',
    anchor: [13, 13], hotspotNote: '镜片中心',
    gist: '金属镜圈多段反射 + 玻璃径向反光 + 手柄压线',
    // 镜圈与手柄用 stroke 描边成形，不走 ink-outline/ink-fill 两段式
    body: `  <defs>
    <linearGradient id="mgMetal" gradientUnits="userSpaceOnUse" x1="5.0" y1="5.0" x2="21.8" y2="21.8">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="0.22" stop-color="#94a3b8"/>
      <stop offset="0.44" stop-color="#e2e8f0"/>
      <stop offset="0.68" stop-color="#64748b"/>
      <stop offset="0.88" stop-color="#cbd5e1"/>
      <stop offset="1" stop-color="#475569"/>
    </linearGradient>
    <linearGradient id="mgHandle" gradientUnits="userSpaceOnUse" x1="19.4" y1="19.4" x2="27.8" y2="27.8">
      <stop offset="0" stop-color="#64748b"/>
      <stop offset="0.3" stop-color="#cbd5e1"/>
      <stop offset="0.62" stop-color="#475569"/>
      <stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
    <radialGradient id="mgGlass" gradientUnits="userSpaceOnUse" cx="10.4" cy="10.2" r="9.6">
      <stop offset="0" stop-color="#f0f9ff" stop-opacity="0.95"/>
      <stop offset="0.45" stop-color="#bae6fd" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0.62"/>
    </radialGradient>
  </defs>

  <!-- ═══ 分面 / 材质 ═══ -->
  <path d="M19.4 19.4 L27.0 27.0" stroke="#1a1a2e" stroke-width="5.6" stroke-linecap="round" fill="none"/>
  <path d="M19.4 19.4 L27.0 27.0" stroke="url(#mgHandle)" stroke-width="3.8" stroke-linecap="round" fill="none"/>
  <circle cx="13.4" cy="13.4" r="8.4" stroke="#1a1a2e" stroke-width="3.5" fill="none"/>
  <circle cx="13.4" cy="13.4" r="8.4" stroke="url(#mgMetal)" stroke-width="2.3" fill="none"/>
  <circle cx="13.4" cy="13.4" r="7.3" fill="url(#mgGlass)"/>
  <ellipse cx="10.3" cy="10.1" rx="3.1" ry="1.5" opacity="0.55" transform="rotate(-42 10.3 10.1)" fill="#ffffff"/>
  <circle cx="9" cy="8.2" r="0.65" opacity="0.85" fill="#ffffff"/>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <circle cx="13.4" cy="13.4" r="7.3" stroke="#1a1a2e" stroke-width="0.7" opacity="0.45" fill="none"/>
  <path d="M6.9 10.4 A8.4 8.4 0 0 1 10.4 6.6" stroke="#ffffff" stroke-width="0.7" opacity="0.5" fill="none"/>
  <path d="M16.0 22.4 A8.4 8.4 0 0 1 12.2 20.8" stroke="#0f172a" stroke-width="0.6" opacity="0.4" fill="none"/>
  <path d="M21.4 21.4 L26.2 26.2" stroke="#e2e8f0" stroke-width="0.7" opacity="0.5" stroke-linecap="round" fill="none"/>`,
  },

  {
    id: 'brush', cn: '板刷', group: '工具',
    anchor: [4, 4], hotspotNote: '刷毛尖端',
    gist: '刷毛成束 + 金属箍反射 + 木杆棱面高光',
    body: `  <defs>
    <linearGradient id="pbBristle" gradientUnits="userSpaceOnUse" x1="4" y1="4" x2="15" y2="15">
      <stop offset="0" stop-color="#7dd3fc"/>
      <stop offset="0.32" stop-color="#38bdf8"/>
      <stop offset="0.72" stop-color="#0ea5e9"/>
      <stop offset="1" stop-color="#075985"/>
    </linearGradient>
    <linearGradient id="pbFerrule" gradientUnits="userSpaceOnUse" x1="9.6" y1="14.8" x2="16.6" y2="11.5">
      <stop offset="0" stop-color="#475569"/>
      <stop offset="0.16" stop-color="#94a3b8"/>
      <stop offset="0.36" stop-color="#f8fafc"/>
      <stop offset="0.54" stop-color="#cbd5e1"/>
      <stop offset="0.72" stop-color="#64748b"/>
      <stop offset="0.9" stop-color="#e2e8f0"/>
      <stop offset="1" stop-color="#334155"/>
    </linearGradient>
    <linearGradient id="pbWood" gradientUnits="userSpaceOnUse" x1="11.6" y1="11.6" x2="28.4" y2="28.4">
      <stop offset="0" stop-color="#c2410c"/>
      <stop offset="0.28" stop-color="#f97316"/>
      <stop offset="0.58" stop-color="#fdba74"/>
      <stop offset="0.82" stop-color="#ea580c"/>
      <stop offset="1" stop-color="#7c2d12"/>
    </linearGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <path d="M5.11 3.69 L15.17 9.23 L9.23 15.17 L3.69 5.11 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M14.75 9.65 L16.59 11.49 L11.49 16.59 L9.65 14.75 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M16.44 11.64 L28.34 24.66 L24.66 28.34 L11.64 16.44 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <path d="M5.11 3.69 L15.17 9.23 L9.23 15.17 L3.69 5.11 Z" fill="url(#pbBristle)"/>
    <path d="M14.75 9.65 L16.59 11.49 L11.49 16.59 L9.65 14.75 Z" fill="url(#pbFerrule)"/>
    <path d="M16.44 11.64 L28.34 24.66 L24.66 28.34 L11.64 16.44 Z" fill="url(#pbWood)"/>
  </g>

  <!-- ═══ 分面 / 材质 ═══ -->
  <path d="M5.8 3.4 L7.8 5.4 L5.4 7.8 L3.4 5.8 Z" opacity="0.55" fill="#e0f2fe"/>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M13.6 10.8 L5.0 3.8" stroke="#075985" stroke-width="0.5" opacity="0.5" fill="none"/>
  <path d="M12.2 12.2 L4.4 4.4" stroke="#075985" stroke-width="0.5" opacity="0.5" fill="none"/>
  <path d="M10.8 13.6 L3.8 5.0" stroke="#075985" stroke-width="0.5" opacity="0.5" fill="none"/>
  <path d="M14.75 9.65 L9.65 14.75" stroke="#f8fafc" stroke-width="0.6" opacity="0.8" fill="none"/>
  <path d="M16.59 11.49 L11.49 16.59" stroke="#334155" stroke-width="0.5" opacity="0.7" fill="none"/>
  <path d="M16.8 12.0 L28.0 24.2" stroke="#fed7aa" stroke-width="0.6" opacity="0.6" fill="none"/>
  <path d="M14.9 13.2 L27.3 25.7" stroke="#7c2d12" stroke-width="0.4" opacity="0.45" fill="none"/>
  <path d="M13.2 14.9 L25.7 27.3" stroke="#7c2d12" stroke-width="0.4" opacity="0.45" fill="none"/>`,
  },

  {
    id: 'scissors', cn: '剪刀', group: '工具',
    anchor: [4, 4], hotspotNote: '上刀刃尖',
    gist: '刀身分面 + 螺丝轴心 + 双环手柄互扣',
    body: `  <defs>
    <linearGradient id="scBlade1" gradientUnits="userSpaceOnUse" x1="3.5" y1="3.5" x2="17.5" y2="17.5">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="0.34" stop-color="#cbd5e1"/>
      <stop offset="0.72" stop-color="#8494a8"/>
      <stop offset="1" stop-color="#64748b"/>
    </linearGradient>
    <linearGradient id="scBlade2" gradientUnits="userSpaceOnUse" x1="3.4" y1="12.4" x2="17.4" y2="15.9">
      <stop offset="0" stop-color="#e2e8f0"/>
      <stop offset="0.4" stop-color="#a9b7c8"/>
      <stop offset="1" stop-color="#5b6b80"/>
    </linearGradient>
    <linearGradient id="scShank" gradientUnits="userSpaceOnUse" x1="15" y1="15" x2="21" y2="21">
      <stop offset="0" stop-color="#475569"/>
      <stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="scHandle" gradientUnits="userSpaceOnUse" x1="18" y1="18" x2="25" y2="25">
      <stop offset="0" stop-color="#fdba74"/>
      <stop offset="0.42" stop-color="#f97316"/>
      <stop offset="1" stop-color="#c2410c"/>
    </linearGradient>
    <linearGradient id="scHandle2" gradientUnits="userSpaceOnUse" x1="20" y1="14" x2="27" y2="21">
      <stop offset="0" stop-color="#fdba74"/>
      <stop offset="0.42" stop-color="#fb923c"/>
      <stop offset="1" stop-color="#b45309"/>
    </linearGradient>
    <radialGradient id="scPivot" gradientUnits="userSpaceOnUse" cx="15.0" cy="15.0" r="2.0">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="0.5" stop-color="#94a3b8"/>
      <stop offset="1" stop-color="#334155"/>
    </radialGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <path d="M6.11 4.91 L15.34 12.66 L12.66 15.34 L4.91 6.11 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M2 13.15 L14 12.1 L14 15.9 L2 14.85 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M15.06 12.94 L19.58 17.46 L17.46 19.58 L12.94 15.06 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M14 12.5 L20.4 12.5 L20.4 15.5 L14 15.5 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <path d="M6.11 4.91 L15.34 12.66 L12.66 15.34 L4.91 6.11 Z" fill="url(#scBlade1)"/>
    <path d="M2 13.15 L14 12.1 L14 15.9 L2 14.85 Z" fill="url(#scBlade2)"/>
    <path d="M15.06 12.94 L19.58 17.46 L17.46 19.58 L12.94 15.06 Z" fill="url(#scShank)"/>
    <path d="M14 12.5 L20.4 12.5 L20.4 15.5 L14 15.5 Z" fill="url(#scShank)"/>
  </g>

  <!-- ═══ 分面 / 材质 ═══ -->
  <circle cx="21.07" cy="21.07" r="3.6" stroke="#1a1a2e" stroke-width="3.4" fill="none"/>
  <circle cx="21.07" cy="21.07" r="3.6" stroke="url(#scHandle)" stroke-width="1.9" fill="none"/>
  <circle cx="24" cy="14" r="3.6" stroke="#1a1a2e" stroke-width="3.4" fill="none"/>
  <circle cx="24" cy="14" r="3.6" stroke="url(#scHandle2)" stroke-width="1.9" fill="none"/>
  <circle cx="14" cy="14" r="1.55" fill="url(#scPivot)"/>
  <circle cx="14" cy="14" r="1.55" stroke="#1a1a2e" stroke-width="0.7" fill="none"/>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M6.4 4.6 L14.9 13.0" stroke="#f1f5f9" stroke-width="0.55" opacity="0.75" fill="none"/>
  <path d="M3.0 13.05 L13.2 12.2" stroke="#f1f5f9" stroke-width="0.5" opacity="0.6" fill="none"/>
  <path d="M13.0 14.0 L15.0 14.0" stroke="#334155" stroke-width="0.5" opacity="0.85" fill="none"/>
  <path d="M22.30 17.69 A3.6 3.6 0 0 1 24.62 20.45" stroke="#fff7ed" stroke-width="0.6" opacity="0.75" fill="none"/>
  <path d="M24.63 10.46 A3.6 3.6 0 0 1 27.38 12.77" stroke="#fff7ed" stroke-width="0.6" opacity="0.7" fill="none"/>
  <path d="M19.55 24.33 A3.6 3.6 0 0 1 17.95 22.87" stroke="#7c2d12" stroke-width="0.6" opacity="0.55" fill="none"/>
  <path d="M22.77 17.38 A3.6 3.6 0 0 1 21.05 16.06" stroke="#7c2d12" stroke-width="0.6" opacity="0.55" fill="none"/>`,
  },

  {
    id: 'ruler', cn: '直尺', group: '工具',
    anchor: [3, 20], hotspotNote: '尺端左角',
    gist: '半透明琥珀尺身 + 长短刻度 + 起点零刻度',
    body: `  <defs>
    <linearGradient id="ruBody" gradientUnits="userSpaceOnUse" x1="3" y1="20" x2="28" y2="8">
      <stop offset="0" stop-color="#fffbeb"/>
      <stop offset="0.34" stop-color="#fef3c7"/>
      <stop offset="0.68" stop-color="#fde68a"/>
      <stop offset="1" stop-color="#fbbf24"/>
    </linearGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <path d="M2.6 19.58 L26.6 5.58 L29.4 10.42 L5.4 24.42 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <path d="M2.6 19.58 L26.6 5.58 L29.4 10.42 L5.4 24.42 Z" fill="url(#ruBody)"/>
  </g>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M2.95 20.19 L26.95 6.19" stroke="#fffbeb" stroke-width="0.7" opacity="0.85" fill="none"/>
  <path d="M5.1 23.90 L29.1 9.90" stroke="#b45309" stroke-width="0.8" opacity="0.5" fill="none"/>
  <path d="M2.6 19.58 L5.4 24.42" stroke="#fff7ed" stroke-width="0.7" opacity="0.7" fill="none"/>
  <path d="M29.4 10.42 L26.6 5.58" stroke="#92400e" stroke-width="0.7" opacity="0.6" fill="none"/>
  <path d="M4.04 18.74 L6.84 23.59" stroke="#1a1a2e" stroke-width="0.75" opacity="0.85" fill="none"/>
  <path d="M5.00 18.18 L6.70 21.12" stroke="#1a1a2e" stroke-width="0.6" opacity="0.8" fill="none"/>
  <path d="M8.12 16.36 L9.07 18.01" stroke="#1a1a2e" stroke-width="0.55" opacity="0.7" fill="none"/>
  <path d="M11.24 14.54 L12.94 17.48" stroke="#1a1a2e" stroke-width="0.6" opacity="0.8" fill="none"/>
  <path d="M14.36 12.72 L15.31 14.37" stroke="#1a1a2e" stroke-width="0.55" opacity="0.7" fill="none"/>
  <path d="M17.48 10.90 L19.18 13.84" stroke="#1a1a2e" stroke-width="0.6" opacity="0.8" fill="none"/>
  <path d="M20.60 9.08 L21.55 10.73" stroke="#1a1a2e" stroke-width="0.55" opacity="0.7" fill="none"/>`,
  },

  {
    id: 'pushpin', cn: '图钉', group: '工具',
    anchor: [4, 4], hotspotNote: '针尖',
    gist: '钢针压线 + 锥形针体 + 宽扁圆盘与背面凸台',
    body: `  <defs>
    <linearGradient id="ppNeedle" gradientUnits="userSpaceOnUse" x1="3.6" y1="3.6" x2="13" y2="13">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="0.5" stop-color="#94a3b8"/>
      <stop offset="1" stop-color="#334155"/>
    </linearGradient>
    <linearGradient id="ppCone" gradientUnits="userSpaceOnUse" x1="11" y1="11" x2="19" y2="19">
      <stop offset="0" stop-color="#fca5a5"/>
      <stop offset="0.45" stop-color="#dc2626"/>
      <stop offset="1" stop-color="#7f1d1d"/>
    </linearGradient>
    <linearGradient id="ppHead" gradientUnits="userSpaceOnUse" x1="13.7" y1="24.3" x2="24.3" y2="13.7">
      <stop offset="0" stop-color="#b91c1c"/>
      <stop offset="0.3" stop-color="#f87171"/>
      <stop offset="0.58" stop-color="#ef4444"/>
      <stop offset="0.82" stop-color="#b91c1c"/>
      <stop offset="1" stop-color="#7f1d1d"/>
    </linearGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <path d="M3.60 3.20 L12.94 11.46 L11.46 12.94 L3.20 3.60 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M12.94 11.46 L21.12 16.88 L16.88 21.12 L11.46 12.94 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="17.3" y="19.8" width="8" height="3" rx="1.5" transform="rotate(-45 21.3 21.3)" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="11.5" y="17" width="15" height="4" rx="1.9" transform="rotate(-45 19 19)" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <path d="M3.60 3.20 L12.94 11.46 L11.46 12.94 L3.20 3.60 Z" fill="url(#ppNeedle)"/>
    <path d="M12.94 11.46 L21.12 16.88 L16.88 21.12 L11.46 12.94 Z" fill="url(#ppCone)"/>
    <rect x="17.3" y="19.8" width="8" height="3" rx="1.5" transform="rotate(-45 21.3 21.3)" fill="url(#ppCone)"/>
    <rect x="11.5" y="17" width="15" height="4" rx="1.9" transform="rotate(-45 19 19)" fill="url(#ppHead)"/>
  </g>

  <!-- ═══ 分面 / 材质 ═══ -->
  <ellipse cx="21.6" cy="16.4" rx="3.6" ry="1" transform="rotate(-45 21.6 16.4)" opacity="0.5" fill="#ffffff"/>
  <path d="M19.42 15.76 L15.76 19.42" stroke="#7f1d1d" stroke-width="0.8" opacity="0.55" fill="none"/>
  <path d="M25.71 15.11 L22.89 12.29" stroke="#fecaca" stroke-width="0.7" opacity="0.7" fill="none"/>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M4.3 4.0 L12.3 11.8" stroke="#ffffff" stroke-width="0.45" opacity="0.7" fill="none"/>
  <path d="M15.11 25.71 L12.29 22.89" stroke="#450a0a" stroke-width="0.7" opacity="0.5" fill="none"/>`,
  },

  {
    id: 'bookmark', cn: '书签', group: '工具',
    anchor: [12, 3], hotspotNote: '缎带左上角',
    gist: '祖母绿缎面 + 暗色顶箍 + 烫金菱形徽记',
    body: `  <defs>
    <linearGradient id="bmBody" gradientUnits="userSpaceOnUse" x1="11.5" y1="3.2" x2="20.5" y2="27">
      <stop offset="0" stop-color="#6ee7b7"/>
      <stop offset="0.3" stop-color="#34d399"/>
      <stop offset="0.68" stop-color="#10b981"/>
      <stop offset="1" stop-color="#047857"/>
    </linearGradient>
    <linearGradient id="bmGold" gradientUnits="userSpaceOnUse" x1="14.1" y1="11.6" x2="17.9" y2="15.4">
      <stop offset="0" stop-color="#fef9c3"/>
      <stop offset="0.45" stop-color="#fbbf24"/>
      <stop offset="1" stop-color="#b45309"/>
    </linearGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <path d="M13.4 3.2 h5.2 a1.9 1.9 0 0 1 1.9 1.9 v21.9 l-4.5 -5.6 l-4.5 5.6 v-21.9 a1.9 1.9 0 0 1 1.9 -1.9 z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <path d="M13.4 3.2 h5.2 a1.9 1.9 0 0 1 1.9 1.9 v21.9 l-4.5 -5.6 l-4.5 5.6 v-21.9 a1.9 1.9 0 0 1 1.9 -1.9 z" fill="url(#bmBody)"/>
  </g>

  <!-- ═══ 分面 / 材质 ═══ -->
  <path d="M11.5 6.7 v-1.6 a1.9 1.9 0 0 1 1.9 -1.9 h5.2 a1.9 1.9 0 0 1 1.9 1.9 v1.6 z" fill="#065f46"/>
  <path d="M16 11.6 L17.9 13.5 L16 15.4 L14.1 13.5 Z" fill="url(#bmGold)"/>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M11.5 7.9 h9" stroke="#a7f3d0" stroke-width="0.5" opacity="0.75" stroke-dasharray="1 1" fill="none"/>
  <path d="M11.5 6.7 h9" stroke="#022c22" stroke-width="0.6" opacity="0.5" fill="none"/>
  <path d="M12.4 8.6 v16.4" stroke="#a7f3d0" stroke-width="0.7" opacity="0.5" fill="none"/>
  <path d="M19.6 8.6 v16.2" stroke="#064e3b" stroke-width="0.7" opacity="0.6" fill="none"/>
  <path d="M12.6 26.2 L16 21.9 L19.4 26.2" stroke="#a7f3d0" stroke-width="0.6" opacity="0.5" fill="none"/>
  <path d="M14.7 12.3 L16.6 14.2" stroke="#fffbeb" stroke-width="0.5" opacity="0.8" fill="none"/>`,
  },

  {
    id: 'flame', cn: '火焰', group: '生活',
    anchor: [16, 3], hotspotNote: '火苗顶端',
    gist: '三层火舌（外焰 / 内焰 / 焰心）+ 侧缘红光',
    body: `  <defs>
    <linearGradient id="flOuter" gradientUnits="userSpaceOnUse" x1="10" y1="27" x2="22" y2="4">
      <stop offset="0" stop-color="#b91c1c"/>
      <stop offset="0.34" stop-color="#ea580c"/>
      <stop offset="0.7" stop-color="#f97316"/>
      <stop offset="1" stop-color="#fb923c"/>
    </linearGradient>
    <linearGradient id="flInner" gradientUnits="userSpaceOnUse" x1="13" y1="25" x2="19" y2="11">
      <stop offset="0" stop-color="#f59e0b"/>
      <stop offset="0.5" stop-color="#fbbf24"/>
      <stop offset="1" stop-color="#fde68a"/>
    </linearGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <path d="M16 2.5 C18.5 7.5 23.5 11 24.5 17.5 C25.3 23.5 21.5 29 16 29 C10.5 29 6.5 24 6.9 18.0 C7.3 13.5 9.5 12.5 10.8 11.6 C11.4 14.9 12.9 16.3 14.6 16.6 C14.5 12.5 15.0 7.5 16 2.5 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <path d="M16 2.5 C18.5 7.5 23.5 11 24.5 17.5 C25.3 23.5 21.5 29 16 29 C10.5 29 6.5 24 6.9 18.0 C7.3 13.5 9.5 12.5 10.8 11.6 C11.4 14.9 12.9 16.3 14.6 16.6 C14.5 12.5 15.0 7.5 16 2.5 Z" fill="url(#flOuter)"/>
  </g>

  <!-- ═══ 分面 / 材质 ═══ -->
  <path d="M16 11.5 C18 14.5 20.5 16.5 20.5 20.5 C20.5 24 18.5 26.5 16 26.5 C13.5 26.5 11.5 24 11.5 20.5 C11.5 16.5 14 14.5 16 11.5 Z" fill="url(#flInner)"/>
  <path d="M16 17 C17 18.6 18.4 19.6 18.4 21.6 C18.4 23.4 17.4 24.8 16 24.8 C14.6 24.8 13.6 23.4 13.6 21.6 C13.6 19.6 15 18.6 16 17 Z" opacity="0.9" fill="#fffbeb"/>
  <circle cx="25.2" cy="7.6" r="0.85" opacity="0.9" fill="#fbbf24"/>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M9.9 14.6 C8.3 17.3 8.2 20.6 9.3 23.4" stroke="#7f1d1d" stroke-width="0.7" opacity="0.55" fill="none"/>
  <path d="M21.5 12.6 C23.2 15.2 24.0 18.2 23.6 21.4" stroke="#fdba74" stroke-width="0.7" opacity="0.6" fill="none"/>
  <path d="M11.6 12.6 C12.4 15.0 13.4 16.0 14.5 16.4" stroke="#9a3412" stroke-width="0.6" opacity="0.55" fill="none"/>
  <path d="M16.4 5.6 C17.4 8.6 18.8 10.6 20.2 12.4" stroke="#fef3c7" stroke-width="0.5" opacity="0.5" fill="none"/>`,
  },

  {
    id: 'lightning', cn: '闪电', group: '生活',
    anchor: [18, 3], hotspotNote: '电芒顶端',
    gist: '鎏金棱面 + 内芯亮带 + 边缘反光',
    body: `  <defs>
    <linearGradient id="lbBody" gradientUnits="userSpaceOnUse" x1="8" y1="28" x2="23" y2="3">
      <stop offset="0" stop-color="#b45309"/>
      <stop offset="0.32" stop-color="#f59e0b"/>
      <stop offset="0.68" stop-color="#fbbf24"/>
      <stop offset="1" stop-color="#fde68a"/>
    </linearGradient>
  </defs>

  <!-- ═══ 并集形状：整体压线（只留外缘）→ 再逐面填充 ═══ -->
  <g class="ink-outline">
    <path d="M17.5 3.2 L7.5 17.5 L14.2 17.5 L12 29.5 L24 14.2 L17 14.2 Z" fill="#1a1a2e" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g class="ink-fill">
    <path d="M17.5 3.2 L7.5 17.5 L14.2 17.5 L12 29.5 L24 14.2 L17 14.2 Z" fill="url(#lbBody)"/>
  </g>

  <!-- ═══ 分面 / 材质 ═══ -->
  <path d="M17.5 3.2 L7.5 17.5 L14.2 17.5 L12 29.5 L24 14.2 L17 14.2 Z" opacity="0.85" transform="translate(15.9 15.6) scale(0.62) translate(-15.9 -15.6)" fill="#fffbeb"/>

  <!-- ═══ 高光 / 缝隙 / 环境光遮蔽 ═══ -->
  <path d="M16.6 4.6 L8.6 16.9" stroke="#fef3c7" stroke-width="0.7" opacity="0.85" fill="none"/>
  <path d="M23.0 15.4 L12.6 28.4" stroke="#92400e" stroke-width="0.7" opacity="0.6" fill="none"/>
  <path d="M17.3 3.9 L17.0 13.6" stroke="#ffffff" stroke-width="0.5" opacity="0.5" fill="none"/>`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 派生：SVG / 画廊 / README 都由 CURSORS 生成
// ─────────────────────────────────────────────────────────────────────────────

function svgFor(c) {
  const [ax, ay] = c.anchor;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <!-- 精修光标系列：${c.cn}（${c.id}）。${c.gist}。锚点 = ${c.hotspotNote} (${ax},${ay}) -->
${c.body}
</svg>
`;
}

function galleryFor() {
  const groups = [...new Set(ordered().map((c) => c.group))];
  const plates = (c, bg) =>
    `<span class="plate ${bg}"><img src="cursor-series/svg/${c.id}.svg" width="32" height="32" alt="${c.cn}"></span>`;

  const cards = ordered().map(
    (c) => `      <figure class="card" id="card-${c.id}">
        <div class="plates">${plates(c, 'light')}${plates(c, 'dark')}</div>
        <figcaption>
          <strong>${c.cn}</strong>
          <code>${c.id}</code>
          <span class="anchor">热点 ${c.anchor[0]} ${c.anchor[1]} · ${c.hotspotNote}</span>
          <span class="gist">${c.gist}</span>
        </figcaption>
      </figure>`
  ).join('\n');

  const nav = groups
    .map((g) => `<a href="#g-${g}">${g}</a>`)
    .join(' · ');

  const sections = groups
    .map((g) => {
      const rows = CURSORS.filter((c) => c.group === g)
        .map(
          (c) => `        <tr><td><img src="cursor-series/svg/${c.id}.svg" width="32" height="32" alt="${c.cn}"></td>
            <td>${c.cn}</td><td><code>${c.id}</code></td><td><b>${c.anchor[0]} ${c.anchor[1]}</b></td>
            <td>${c.hotspotNote}</td><td class="gist">${c.gist}</td></tr>`
        )
        .join('\n');
      return `      <h2 id="g-${g}">${g}</h2>
      <table>
        <thead><tr><th>预览</th><th>中文</th><th>id</th><th>锚点 x y</th><th>热点说明</th><th>画法要点</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>精修光标系列 · 12 款</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0 auto; max-width: 960px; padding: 40px 24px 80px;
         font: 14px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  .lede { color: #6b7280; margin: 0 0 6px; }
  nav { margin: 0 0 32px; font-size: 13px; }
  nav a { color: #2563eb; text-decoration: none; }
  h2 { font-size: 15px; letter-spacing: .04em; margin: 36px 0 12px;
       padding-bottom: 6px; border-bottom: 1px solid #d1d5db; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
  .card { margin: 0; border: 1px solid #d1d5db; border-radius: 10px; overflow: hidden; }
  .plates { display: flex; }
  .plate { flex: 1; display: grid; place-items: center; padding: 18px 0; }
  .plate.light { background: #faf9f7; }
  .plate.dark  { background: #1c1c1e; }
  figcaption { padding: 10px 12px; display: grid; gap: 3px; border-top: 1px solid #d1d5db; }
  figcaption strong { font-size: 13px; }
  code { font: 12px ui-monospace, Consolas, monospace; color: #6b7280; }
  .anchor { font-size: 12px; color: #b45309; }
  .gist { font-size: 12px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
  th { font-weight: 600; color: #374151; }
  td img { display: block; background: #faf9f7; border-radius: 4px; }
  @media (prefers-color-scheme: dark) {
    body { background: #111113; color: #e5e7eb; }
    nav a { color: #7dd3fc; }
    h2 { border-bottom-color: #3f3f46; }
    .card { border-color: #3f3f46; }
    figcaption { border-top-color: #3f3f46; }
    th, td { border-bottom-color: #27272a; }
    th { color: #d4d4d8; }
    td img { background: #27272a; }
  }
</style>
</head>
<body>
  <h1>精修光标系列</h1>
  <p class="lede">12 款 32×32 SVG 光标，沿用应用内精修光标的质感路线：多段渐变、棱面明暗、环境光遮蔽、<code>#1a1a2e</code> 深色压线。</p>
  <p class="lede">本目录与 <code>dist/cursors/</code> 相互独立，<strong>未接入应用</strong>。</p>
  <nav>分组：${nav}</nav>

  <div class="grid">
${cards}
  </div>

${sections}

  <h2>光标示例</h2>
  <p class="lede">下面每一格已挂上对应光标，把鼠标移进去即可试用手感（热点是否落在指点部位）。</p>
  <div class="grid">
${ordered().map(
    (c) => `    <div class="plate light" style="cursor: url('cursor-series/svg/${c.id}.svg') ${c.anchor[0]} ${c.anchor[1]}, auto; background:#faf9f7; border:1px solid #d1d5db; border-radius:8px; min-height:64px; display:grid; place-items:center; font-size:12px; color:#6b7280;">${c.cn}</div>`
  ).join('\n')}
  </div>
</body>
</html>
`;
}

function readmeFor() {
  const rows = ordered()
    .map(
      (c) =>
        `| <img src="svg/${c.id}.svg" width="32" height="32" alt="${c.cn}"> | ${c.cn} | \`${c.id}\` | ${c.group} | **${c.anchor[0]} ${c.anchor[1]}** | ${c.hotspotNote} (${c.anchor[0]},${c.anchor[1]}) | ${c.gist} |`
    )
    .join('\n');
  const sample = CURSORS.find((c) => c.id === 'arrow');

  return `# 精修光标系列 · cursor-series

32×32 SVG 光标 12 款，沿用应用内精修光标（\`dist/cursors/\`）的质感路线：
多段渐变、棱面明暗、环境光遮蔽、\`#1a1a2e\` 深色压线；主体占满 3~29 格，四周留白防止边缘被裁。

本目录与 \`dist/cursors/\` 相互独立，**未接入应用**。总览画廊见仓库根目录 \`cursor-series.html\`。

| 预览 | 中文 | id | 分组 | 锚点 x y | 热点说明 | 画法要点 |
| :--: | --- | --- | --- | :--: | --- | --- |
${rows}

## 用法

自定义光标必须给出热点坐标，否则默认落在图片左上角：

\`\`\`css
body.cursor-arrow,
body.cursor-arrow * {
  cursor: url('../cursors/arrow.svg') ${sample.anchor[0]} ${sample.anchor[1]}, auto !important;
}
\`\`\`

- 浏览器 / Windows 对光标图片有 **32×32 上限**，超出部分会被裁掉，所以统一按 32×32 出图；
- 光标不支持 CSS 动画与滤镜外发光，全部光影靠静态图形表达；
- 路径为相对引用，按实际放置位置调整（放回应用时是 \`../cursors/\`）。

## 重新生成

\`\`\`bash
node cursor-series/generate.mjs
\`\`\`

元数据（id / 中文名 / 分组 / 锚点 / 热点说明 / 画法要点）与各款的图形片段都定义在生成器里；
一条命令会重建 \`cursor-series/svg/*.svg\`、仓库根目录 \`cursor-series.html\` 与本文件。
**不要手改这三处产物**——下次生成会被覆盖。

## 校验

\`\`\`bash
node cursor-series/generate.mjs --check
\`\`\`

只读不写，检查：每款 SVG 是否越出 32×32 画布（会被裁切）、锚点是否落在画布内、
画廊与 README 是否覆盖了全部 12 款、渐变 id 是否重复。
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 校验
// ─────────────────────────────────────────────────────────────────────────────

const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * 解析 path 的 d，返回其控制点外接框。
 * 曲线取控制点而非真实极值（略保守），圆弧只取端点（略激进）——
 * 两者都不足以掩盖「图形越出 32×32」这种数量级的越界。
 */
function pathPoints(d) {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  const pts = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let cmd = 'M';

  const num = () => Number(toks[i++]);
  const add = (x, y) => pts.push([x, y]);
  const abs = (rel, base, v) => (rel ? base + v : v);

  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    if (up === 'Z') {
      cx = startX;
      cy = startY;
      continue;
    }
    if (i >= toks.length) break;

    const a = [];
    for (let k = 0; k < ARITY[up]; k++) a.push(num());

    switch (up) {
      case 'M':
      case 'L':
        cx = abs(rel, cx, a[0]);
        cy = abs(rel, cy, a[1]);
        if (up === 'M') {
          startX = cx;
          startY = cy;
        }
        add(cx, cy);
        break;
      case 'H':
        cx = abs(rel, cx, a[0]);
        add(cx, cy);
        break;
      case 'V':
        cy = abs(rel, cy, a[0]);
        add(cx, cy);
        break;
      case 'C':
        add(abs(rel, cx, a[0]), abs(rel, cy, a[1]));
        add(abs(rel, cx, a[2]), abs(rel, cy, a[3]));
        cx = abs(rel, cx, a[4]);
        cy = abs(rel, cy, a[5]);
        add(cx, cy);
        break;
      case 'S':
      case 'Q':
        add(abs(rel, cx, a[0]), abs(rel, cy, a[1]));
        cx = abs(rel, cx, a[2]);
        cy = abs(rel, cy, a[3]);
        add(cx, cy);
        break;
      case 'T':
        cx = abs(rel, cx, a[0]);
        cy = abs(rel, cy, a[1]);
        add(cx, cy);
        break;
      case 'A':
        // rx ry rot laf sf x y —— 只取端点
        cx = abs(rel, cx, a[5]);
        cy = abs(rel, cy, a[6]);
        add(cx, cy);
        break;
      default:
        i = toks.length;
    }
  }
  return pts;
}

/** 解析 transform 里的 rotate / translate / scale，返回点变换函数。 */
function transformOf(spec) {
  const ops = [];
  for (const m of (spec || '').matchAll(/(rotate|translate|scale)\s*\(([^)]*)\)/g)) {
    ops.push([m[1], m[2].trim().split(/[\s,]+/).map(Number)]);
  }
  // SVG 的 transform="A B C" 等价于 A∘B∘C，最右边的先作用到点上，故倒序应用
  return ([x, y]) => {
    for (const [name, v] of [...ops].reverse()) {
      if (name === 'rotate') {
        const [deg, ox = 0, oy = 0] = v;
        const r = (deg * Math.PI) / 180;
        const dx = x - ox;
        const dy = y - oy;
        x = ox + dx * Math.cos(r) - dy * Math.sin(r);
        y = oy + dx * Math.sin(r) + dy * Math.cos(r);
      } else if (name === 'translate') {
        x += v[0] || 0;
        y += v[1] || 0;
      } else {
        const s = v[0] ?? 1;
        x *= s;
        y *= s;
      }
    }
    return [x, y];
  };
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** 汇总 body 里所有图元的包围盒（含半边描边），用于查越界。 */
function bboxOf(body) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const m of body.matchAll(/<(path|rect|circle|ellipse)\b([^>]*?)\/?>/g)) {
    const [, tag, rest] = m;
    const tf = transformOf(attr(rest, 'transform'));
    let pts = [];

    if (tag === 'path') {
      pts = pathPoints(attr(rest, 'd') || '');
    } else if (tag === 'rect') {
      const x = Number(attr(rest, 'x') || 0);
      const y = Number(attr(rest, 'y') || 0);
      const w = Number(attr(rest, 'width') || 0);
      const h = Number(attr(rest, 'height') || 0);
      pts = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ];
    } else {
      const cx = Number(attr(rest, 'cx') || 0);
      const cy = Number(attr(rest, 'cy') || 0);
      const rx = Number(attr(rest, tag === 'circle' ? 'r' : 'rx') || 0);
      const ry = Number(attr(rest, tag === 'circle' ? 'r' : 'ry') || 0);
      for (let k = 0; k < 8; k++) {
        pts.push([cx + rx * Math.cos((k * Math.PI) / 4), cy + ry * Math.sin((k * Math.PI) / 4)]);
      }
    }

    const stroke = attr(rest, 'stroke');
    const pad = stroke && stroke !== 'none' ? Number(attr(rest, 'stroke-width') || 1) / 2 : 0;

    for (const p of pts) {
      const [x, y] = tf(p);
      minX = Math.min(minX, x - pad);
      minY = Math.min(minY, y - pad);
      maxX = Math.max(maxX, x + pad);
      maxY = Math.max(maxY, y + pad);
    }
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function check() {
  const problems = [];
  const seenGradients = new Map();

  // ORDER 与 CURSORS 必须一一对应，否则 ordered() 会产出 undefined 并让产物静默缺款
  if (new Set(ORDER).size !== ORDER.length) problems.push('ORDER 里有重复 id');
  for (const c of CURSORS) if (!ORDER.includes(c.id)) problems.push(`${c.id} 没有出现在 ORDER 里`);
  for (const id of ORDER) if (!CURSORS.some((c) => c.id === id)) problems.push(`ORDER 里的 "${id}" 没有对应定义`);
  if (problems.length) return problems;

  for (const c of CURSORS) {
    const svg = svgFor(c);
    const [ax, ay] = c.anchor;

    if (ax < 0 || ax > 32 || ay < 0 || ay > 32) {
      problems.push(`${c.id}: 锚点 (${ax},${ay}) 落在 32×32 画布外`);
    }

    for (const g of svg.matchAll(/<(?:linear|radial)Gradient id="([^"]+)"/g)) {
      if (seenGradients.has(g[1])) {
        problems.push(`${c.id}: 渐变 id "${g[1]}" 与 ${seenGradients.get(g[1])} 重复`);
      }
      seenGradients.set(g[1], c.id);
    }

    const box = bboxOf(c.body);
    if (box) {
      if (box.minX < 0 || box.minY < 0 || box.maxX > 32 || box.maxY > 32) {
        problems.push(
          `${c.id}: 图形外接框 [${box.minX.toFixed(1)},${box.minY.toFixed(1)} → ${box.maxX.toFixed(1)},${box.maxY.toFixed(1)}] 越出画布，会被裁切`
        );
      } else if (box.minX < 1 || box.minY < 1 || box.maxX > 31 || box.maxY > 31) {
        problems.push(
          `${c.id}: 图形贴边（外接框 [${box.minX.toFixed(1)},${box.minY.toFixed(1)} → ${box.maxX.toFixed(1)},${box.maxY.toFixed(1)}]），建议四周留 1 格`
        );
      }
    }

    if (!svg.includes('viewBox="0 0 32 32"')) problems.push(`${c.id}: 缺少 32×32 viewBox`);
  }

  const gallery = galleryFor();
  const readme = readmeFor();
  for (const c of CURSORS) {
    if (!gallery.includes(`cursor-series/svg/${c.id}.svg`)) problems.push(`画廊缺少 ${c.id}`);
    if (!readme.includes(`svg/${c.id}.svg`)) problems.push(`README 表格缺少 ${c.id}`);
  }

  return problems;
}

// ─────────────────────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────────────────────

const problems = check();
if (problems.length) {
  console.error('✗ 校验未通过：');
  for (const p of problems) console.error('  · ' + p);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  console.log(`✓ 校验通过：${CURSORS.length} 款光标，画布 / 锚点 / 引用均正常`);
  process.exit(0);
}

for (const c of CURSORS) {
  writeFileSync(join(HERE, 'svg', `${c.id}.svg`), svgFor(c), 'utf8');
}
writeFileSync(join(ROOT, 'cursor-series.html'), galleryFor(), 'utf8');
writeFileSync(join(HERE, 'README.md'), readmeFor(), 'utf8');

console.log(`✓ 已生成 ${CURSORS.length} 款 SVG + cursor-series.html + README.md`);
