// background.js
// service worker for extension-wide tasks: optional message routing, permission handling, and long-running tasks.

const BG_VERSION = '1.0.0';

// Simple message router for popup/background communication
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case 'GET_ERROR_LOGS':
      chrome.storage.local.get(['mangaErrorLogs'], res => {
        sendResponse({ logs: res.mangaErrorLogs || [] });
      });
      return true; // async
    case 'CLEAR_ERROR_LOGS':
      chrome.storage.local.remove(['mangaErrorLogs'], () => sendResponse({ ok: true }));
      return true;
    case 'REQUEST_HOST_PERMISSION':
      // forward to permissions API if needed (popup normally handles)
      chrome.permissions.request({ origins: msg.origins || [] }, granted => {
        sendResponse({ granted });
      });
      return true;
    default:
      // unknown message
      sendResponse({ ok: false, reason: 'unknown_type' });
      return false;
  }
});

// Optional: react to installed/updated events
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // initialize default values
    chrome.storage.local.get(['mangaTagHistory', 'mangaAutoFetchHosts'], res => {
      if (!res.mangaTagHistory) chrome.storage.local.set({ mangaTagHistory: [] });
      if (!res.mangaAutoFetchHosts) chrome.storage.local.set({ mangaAutoFetchHosts: [] });
    });
  }
});

// Optional alarm example for periodic backup reminder (disabled by default)
// chrome.alarms.create('backupReminder', { periodInMinutes: 24 * 60 }); // daily

try {
  // 安全に存在確認（ブラウザや環境によって chrome や alarms が未定義になることがある）
  if (typeof chrome !== 'undefined' && chrome && chrome.alarms && chrome.alarms.onAlarm && typeof chrome.alarms.onAlarm.addListener === 'function') {
    chrome.alarms.onAlarm.addListener(alarm => {
      try {
        if (alarm && alarm.name === 'backupReminder') {
          // 通知など（必要なら notifications 権限を追加）
          // chrome.notifications.create({ type: 'basic', title: 'バックアップの確認', message: 'データのエクスポートを検討してください。' });
        }
      } catch (innerErr) {
        console.warn('alarms handler error', innerErr);
      }
    });
  } else {
    console.info('chrome.alarms API is not available in this environment; alarms will be disabled.');
  }
} catch (err) {
  // ここで例外が出ても service worker の初期化を止めない
  console.warn('Failed to initialize alarms listener safely', err);
}