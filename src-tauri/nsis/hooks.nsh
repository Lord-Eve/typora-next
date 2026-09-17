; ============================================================================
; TyporaNext — NSIS 安装钩子（bundle.windows.nsis.installerHooks）
;
; 背景（2026-09-17 用户实机事故）：用 NSIS 包重装后，桌面快捷方式变成通用白
; 图标，但点击仍能正常启动。排查结论——.lnk 本身没坏：
;   · target 指向 %LOCALAPPDATA%\TyporaNext\app.exe，文件存在；
;   · 从 .lnk 解析出的图标就是正确的应用图标（Shell API 能拿到）；
;   · exe 的内嵌图标资源也正常。
;
; 真正的链条是：
;   1) NSIS 生成的快捷方式 IconLocation 是**空的**（`,0`），图标完全依赖系统
;      「回退去读 target exe 的内嵌图标资源」；
;   2) 重装时旧卸载器先删掉 $INSTDIR（含 app.exe）。此刻已存在的 .lnk 指向一个
;      不存在的图标源，Windows 就把「这个源没有图标」写进
;      %LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache_*.db；
;   3) 新安装器随后把 exe 放回去，但那条坏缓存没人作废 → 桌面一直显示白图标。
;      能点能启动，因为 target 路径的解析是实时的，不走图标缓存。
;
; 所以这里做两件事，让这类问题不再复发：
;   1) 给已存在的快捷方式补上**显式 IconLocation**（与系统上其他快捷方式一致，
;      不再依赖空路径回退）——用 IShellLink::SetIconLocation 原地修改，只动图标
;      字段，不重建 .lnk，因此保留 AppUserModelId、兼容性旗标、固定状态等；
;   2) 调 SHChangeNotify(SHCNE_ASSOCCHANGED) 强制 Shell 重新读取图标与文件关联
;      （后者同时也是文件关联自愈希望 Shell 立刻生效的地方）。
;
; 说明：安装向导末页「创建桌面快捷方式」勾选框走的是 MUI_FINISHPAGE_SHOWREADME_
; FUNCTION，在安装段之后执行，本钩子管不到；但那条路径是**新建** .lnk，不存在
; 「图标源先消失」的窗口期，因此不会踩到缓存污染。
; ============================================================================

; 原地修改快捷方式的图标位置（保留其余所有属性）
!macro TNSetShortcutIconLocation lnk
  !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r0 ""
  ${If} $0 P<> 0
    ${IUnknown::QueryInterface} $0 '("${IID_IPersistFile}",.r1)'
    ${If} $1 P<> 0
      ${IPersistFile::Load} $1 '("${lnk}", ${STGM_READWRITE})'
      ${IShellLink::SetIconLocation} $0 '("$INSTDIR\${MAINBINARYNAME}.exe",0).r2'
      ${IPersistFile::Save} $1 '("${lnk}",1)'
      ${IUnknown::Release} $1 ""
    ${EndIf}
    ${IUnknown::Release} $0 ""
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 桌面 + 开始菜单：只处理**已存在**的快捷方式
  ; （尊重用户取消勾选桌面图标、以及 NoShortcutMode）
  ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
    !insertmacro TNSetShortcutIconLocation "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}

  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  ${If} ${FileExists} "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
    !insertmacro TNSetShortcutIconLocation "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  ${ElseIf} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    !insertmacro TNSetShortcutIconLocation "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${EndIf}

  ; 强制 Shell 丢弃缓存的图标/关联并重新解析
  ; SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
