// lib/helpers.js - v1.2.0 拡張版
// 共通ユーティリティ関数集（popup.js, background.js, content-script.js で使用）

// ============================================================
// HTML エスケープ
// ============================================================

/**
 * HTML 特殊文字をエスケープ
 * @param {string} s - 入力文字列
 * @returns {string} エスケープ済み文字列
 */
export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// ============================================================
// URL・テキスト正規化
// ============================================================

/**
 * タイトルを正規化（重複検出用）
 * @param {string} title - タイトル
 * @returns {string} 正規化済みタイトル
 */
export function normalizeTitle(title) {
  if (!title) return '';
  let s = title.trim().toLowerCase();
  // 全角記号を半角に変換
  s = s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // 全角スペースを半角に
  s = s.replace(/[\u3000]/g, ' ');
  // 連続スペースを統一
  s = s.replace(/[\s　]+/g, ' ');
  // 記号・特殊文字を削除
  s = s.replace(/[^\p{L}\p{N}\s\-]/gu, '');
  return s;
}

/**
 * URL を正規化（重複検出用）
 * @param {string} url - URL
 * @returns {string} 正規化済み URL
 */
export function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    // デフォルトポート削除
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
      u.port = '';
    }
    // パス末尾の / 削除
    u.pathname = u.pathname.replace(/\/+$/, '');
    // フラグメント削除
    u.hash = '';
    return u.toString();
  } catch (e) {
    return url.trim();
  }
}

// ============================================================
// 非同期ユーティリティ
// ============================================================

/**
 * タイムアウト付き fetch
 * @param {string} url - リクエスト URL
 * @param {Object} options - fetch オプション
 * @param {number} timeout - タイムアウト（ミリ秒）
 * @returns {Promise<Response>} Response オブジェクト
 */
export async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw new Error(`fetch timeout after ${timeout}ms`);
    }
    throw err;
  }
}

/**
 * SHA-1 ハッシュ計算
 * @param {string} text - 入力テキスト
 * @returns {Promise<string>} 'sha1:' プレフィックス付きハッシュ値
 */
export async function sha1Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hash = await crypto.subtle.digest('SHA-1', data);
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return 'sha1:' + hex;
}

// ============================================================
// 検証・チェック
// ============================================================

/**
 * OAuth が設定されているか確認
 * @returns {boolean} OAuth 設定の有無
 */
export function isOAuthConfigured() {
  try {
    const manifest = chrome.runtime.getManifest();
    const oauth2 = manifest.oauth2 || {};
    const clientId = oauth2.client_id || '';
    if (!clientId || clientId === '<YOUR_OAUTH_CLIENT_ID>' || clientId.length === 0) {
      console.warn('[HELPERS] OAuth2 not configured properly');
      return false;
    }
    return true;
  } catch (e) {
    console.error('[HELPERS] Error checking OAuth config:', e);
    return false;
  }
}

/**
 * 有効な URL か確認
 * @param {string} url - URL
 * @returns {boolean} 有効な URL か
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 相対 URL を絶対 URL に変換
 * @param {string} url - 相対 URL または絶対 URL
 * @param {string} baseUrl - ベース URL（デフォルト: window.location.href）
 * @returns {string} 絶対 URL
 */
export function toAbsoluteUrl(url, baseUrl = window.location.href) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return window.location.protocol + ':' + url;
  if (url.startsWith('/')) return new URL(url, new URL(baseUrl).origin).href;
  return new URL(url, baseUrl).href;
}

// ============================================================
// ストレージ
// ============================================================

/**
 * Chrome Storage から値を取得
 * @param {string} key - キー名
 * @param {string} area - ストレージ領域（'local' または 'sync'）
 * @returns {Promise<any>} 取得した値
 */
export function getStorageValue(key, area = 'local') {
  return new Promise(resolve => {
    chrome.storage[area].get([key], res => {
      resolve(res[key]);
    });
  });
}

/**
 * Chrome Storage に値を設定
 * @param {Object} obj - キー・バリューペアのオブジェクト
 * @param {string} area - ストレージ領域（'local' または 'sync'）
 * @returns {Promise<void>}
 */
export function setStorageValue(obj, area = 'local') {
  return new Promise((resolve, reject) => {
    chrome.storage[area].set(obj, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Chrome Storage から値を削除
 * @param {string|Array<string>} keys - 削除するキー
 * @param {string} area - ストレージ領域
 * @returns {Promise<void>}
 */
export function removeStorageValue(keys, area = 'local') {
  return new Promise((resolve, reject) => {
    chrome.storage[area].remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// ============================================================
// ログ・エラーハンドリング
// ============================================================

/**
 * エラーログ関数
 * @param {string} context - コンテキスト（関数名���ど）
 * @param {Error} error - エラーオブジェクト
 * @param {Object} metadata - 追加情報
 */
export function logError(context, error, metadata = {}) {
  const msg = error && error.message ? error.message : String(error);
  const stack = error && error.stack ? error.stack : '';
  const timestamp = new Date().toISOString();
  
  const logEntry = {
    timestamp,
    context,
    message: msg,
    stack,
    metadata,
    userAgent: navigator.userAgent
  };

  console.error(`[ERROR] ${context}:`, msg, stack);
  
  // エラーログをストレージに保存（最大100件）
  getStorageValue('mangaErrorLogs', 'local').then(logs => {
    const errorLogs = logs || [];
    errorLogs.unshift(logEntry);
    if (errorLogs.length > 100) {
      errorLogs.pop();
    }
    setStorageValue({ mangaErrorLogs: errorLogs }, 'local');
  });
}

/**
 * ログ出力（デバッグ）
 * @param {string} context - コンテキスト
 * @param {string} message - メッセージ
 * @param {any} data - データ
 */
export function logDebug(context, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[DEBUG] [${timestamp}] ${context}: ${message}`, data || '');
}

// ============================================================
// 時間・日時
// ============================================================

/**
 * ISO 8601 形式で現在時刻を取得
 * @returns {string} ISO 8601 形式の時刻
 */
export function getCurrentISOTime() {
  return new Date().toISOString();
}

/**
 * Unix タイムスタンプを ISO 8601 に変換
 * @param {number} timestamp - Unix タイムスタンプ（ミリ秒）
 * @returns {string} ISO 8601 形式
 */
export function timestampToISO(timestamp) {
  return new Date(timestamp).toISOString();
}

/**
 * ISO 8601 をローカル時刻文字列に変換
 * @param {string} isoString - ISO 8601 形式
 * @returns {string} ローカル時刻文字列
 */
export function isoToLocaleString(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString();
  } catch (e) {
    return '';
  }
}

// ============================================================
// 配列・オブジェクト操作
// ============================================================

/**
 * 配列から重複を除去（ID ベース）
 * @param {Array} items - アイテム配列
 * @param {string} idKey - ID キー（デフォルト: 'id'）
 * @returns {Array} 重複除去済み配列
 */
export function deduplicateById(items, idKey = 'id') {
  const map = new Map();
  items.forEach(item => {
    const id = item[idKey];
    if (!map.has(id)) {
      map.set(id, item);
    }
  });
  return Array.from(map.values());
}

/**
 * 配列をソート（複数キー対応）
 * @param {Array} items - ソート対象配列
 * @param {string|Array<string>} keys - ソートキー
 * @param {boolean} ascending - 昇順か（デフォルト: true）
 * @returns {Array} ソート済み配列
 */
export function sortBy(items, keys, ascending = true) {
  const sortKeys = Array.isArray(keys) ? keys : [keys];
  return items.slice().sort((a, b) => {
    for (const key of sortKeys) {
      const aVal = a[key];
      const bVal = b[key];
      if (aVal < bVal) return ascending ? -1 : 1;
      if (aVal > bVal) return ascending ? 1 : -1;
    }
    return 0;
  });
}

/**
 * オブジェクトをマージ（深くない）
 * @param {Object} target - マージ先
 * @param {Object} source - マージ元
 * @returns {Object} マージ済みオブジェクト
 */
export function mergeObjects(target, source) {
  return { ...target, ...source };
}

// ============================================================
// デバッグ用グロー��ル公開
// ============================================================

window.debugHelpers = {
  escapeHtml,
  normalizeTitle,
  normalizeUrl,
  fetchWithTimeout,
  sha1Hex,
  isOAuthConfigured,
  isValidUrl,
  toAbsoluteUrl,
  getStorageValue,
  setStorageValue,
  logError,
  logDebug,
  getCurrentISOTime
};

console.log('[HELPERS] lib/helpers.js v1.2.0 loaded');