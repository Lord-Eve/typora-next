/**
 * Typora Next - Auto Updater
 * Uses tauri-plugin-updater for GitHub Release based updates
 */

(function() {
  'use strict';

  // ============================================
  // Update Checker
  // ============================================
  const Updater = {
    /**
     * Check for available updates.
     * @returns {Promise<{available: boolean, version?: string, date?: string, body?: string, downloadAndInstall?: Function}>}
     */
    async check() {
      if (!window.__TAURI__) {
        console.log('[Updater] Not in Tauri environment, skipping update check');
        return { available: false };
      }

      try {
        const { invoke } = window.__TAURI__.core;
        // Sprint 27：插件的 reqwest 未启用 system-proxy，GUI 进程也继承不到
        // 终端的 HTTPS_PROXY——由 Rust 侧探测（env → Windows 注册表）后显式传入。
        // Update 资源在 check 时固化代理配置，download_and_install 自动沿用。
        let proxy = null;
        try {
          proxy = await invoke('get_proxy_config');
        } catch (e) {
          console.warn('[Updater] Proxy probe failed, using direct connection:', e);
        }
        // IPC command registered by tauri-plugin-updater
        const result = await invoke('plugin:updater|check', proxy ? { proxy } : {});

        if (!result) {
          return { available: false };
        }

        // result is an Update resource — extract its fields
        return {
          available: true,
          version: result.version,
          date: result.date,
          body: result.body,
          currentVersion: result.currentVersion,
          rawJson: result.rawJson,
          rid: result.rid,
          async downloadAndInstall(onEvent) {
            // onEvent 是插件命令的必填 key：不传回调也要给 no-op Channel——
            // 否则 JSON 序列化丢弃 undefined，Rust 报 missing required key
            // onEvent（v0.4.3 即因此无法应用内升级，Sprint 27 补牢）
            const channel = createChannel(typeof onEvent === 'function' ? onEvent : () => {});
            if (!channel) {
              throw new Error('下载通道初始化失败：Tauri Channel 不可用');
            }
            await invoke('plugin:updater|download_and_install', {
              rid: this.rid,
              onEvent: channel
            });
          }
        };
      } catch (err) {
        // Updater not configured (missing pubkey, no endpoint) — not an error, just no updates
        if (err && typeof err === 'string' && err.includes('updater')) {
          console.log('[Updater] Not configured:', err);
          return { available: false, error: '未配置更新服务', notConfigured: true };
        }
        // Sprint 27：网络等其他失败必须透出真实错误，不能误诊为「未配置」
        console.warn('[Updater] Check failed:', err);
        return { available: false, error: String(err) };
      }
    },

    /**
     * Restart the application (call after install).
     */
    async restart() {
      if (!window.__TAURI__) return;
      try {
        const { invoke } = window.__TAURI__.core;
        await invoke('plugin:process|restart');
      } catch (err) {
        console.error('[Updater] Restart failed:', err);
      }
    }
  };

  // Helper: create a Tauri Channel from a callback
  function createChannel(callback) {
    try {
      // Channel is available via window.__TAURI__
      if (window.__TAURI__ && window.__TAURI__.core) {
        // Use the Channel API if available (Tauri 2)
        if (typeof window.__TAURI__.core.Channel === 'function') {
          const channel = new window.__TAURI__.core.Channel();
          channel.onmessage = callback;
          return channel;
        }
      }
    } catch (e) {
      console.warn('[Updater] Channel creation failed:', e);
    }
    return undefined;
  }

  // Expose globally
  window.Updater = Updater;
})();
