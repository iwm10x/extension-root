// background.js - v1.2.0 統合・UI改善版
// Drive API タイムアウト対応、OAuth確認、improved error logging

const BG_VERSION = '1.2.0';
const INDEX_KEY = 'index';
const CURSOR_KEY = 'updateCursor';
const SETTINGS_KEY = 'updateSettings';
const AUTO_FETCH_ENABLED_KEY = 'autoFetchEnabled';

const DEFAULT_SETTINGS = {
  periodMinutes: 15,
  batchSize: 10,
  maxConcurrentFetch: 3,
  fetchTimeoutMs: 15000,
  headTimeoutMs: 8000,
  userAgent: null,
  autoFetch: false
};

const DRIVE_API_TIMEOUT = 30000; // ✨ Drive API用タイムアウト

// ============================================================
// ユーティリティ関数
// ============================================================

// 安全な sendMessage ラッパー
function safeSendMessage(message) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('[BG] safeSendMessage failed:', chrome.runtime.lastError.message, message);
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp || { ok: true });
        }
      });
    } catch (e) {
      console.warn('[BG] safeSendMessage unexpected error', e, message);
      resolve({ ok: false, error: String(e) });
    }
  });
}

// ✨ OAuth 設定確認
function isOAuthConfigured() {
  const manifest = chrome.runtime.getManifest();
  const oauth2 = manifest.oauth2 || {};
  const clientId = oauth2.client_id || '';
  if (!clientId || clientId === '<YOUR_OAUTH_CLIENT_ID>' || clientId.length === 0) {
    console.warn('[BG] OAuth2 not configured properly');
    return false;
  }
  return true;
}

// fetch にタイムアウト付与
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
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

// SHA-1 ハッシュ（テキスト -> 'sha1:...'）
async function sha1Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hash = await crypto.subtle.digest('SHA-1', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return 'sha1:' + hex;
}

// ストレージ���ルパー
function getStorage(key) {
  return new Promise(resolve => chrome.storage.local.get([key], res => resolve(res[key])));
}

function setStorage(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, () => resolve()));
}

// バッジ更新（未読件数）
async function updateBadgeFromIndex(idx) {
  const items = (idx && idx.items) ? idx.items : [];
  const unread = items.filter(i => i.hasUpdate).length;
  try {
    chrome.action.setBadgeText({ text: unread ? String(unread) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#d9534f' });
    console.log('[BG] Badge updated:', unread);
  } catch (e) {
    console.warn('[BG] updateBadgeFromIndex failed', e);
  }
}

// ✨ エラーログ向上
function logError(context, error) {
  const msg = error && error.message ? error.message : String(error);
  const stack = error && error.stack ? error.stack : '';
  console.error(`[BG] ${context}:`, msg, stack);
}

// ============================================================
// ページチェック関連
// ============================================================

// HEAD リクエスト（タイムアウト付き）
async function tryHead(url, headers = {}, timeoutMs = DEFAULT_SETTINGS.headTimeoutMs) {
  try {
    const res = await fetchWithTimeout(url, { method: 'HEAD', cache: 'no-store', headers }, timeoutMs);
    if (!res.ok) {
      console.warn(`[BG] HEAD ${url}: status ${res.status}`);
      return null;
    }
    return {
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified')
    };
  } catch (e) {
    console.warn(`[BG] HEAD failed for ${url}:`, e && e.message ? e.message : e);
    return null;
  }
}

// GET 本文取得とハッシュ計算（タイムアウト付き）
async function fetchBodyAndHash(url, headers = {}, timeoutMs = DEFAULT_SETTINGS.fetchTimeoutMs) {
  try {
    const res = await fetchWithTimeout(url, { method: 'GET', cache: 'no-store', headers }, timeoutMs);
    if (!res.ok) {
      console.warn(`[BG] GET ${url}: status ${res.status}`);
      return { ok: false, status: res.status };
    }
    const text = await res.text();
    const hash = await sha1Hex(text);
    return {
      ok: true,
      text,
      hash,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified')
    };
  } catch (e) {
    logError(`GET ${url}`, e);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// 1 アイテムのチェック（HEAD→必要なら GET、ハッシュ比較）
async function checkItemForUpdate(it, settings) {
  if (!it || !it.link) return { changed: false };

  const headers = {};
  if (settings.userAgent) headers['User-Agent'] = settings.userAgent;

  const knownEtag = it.pageEtag || null;
  const knownLastMod = it.pageLastModified || null;
  const knownHash = it.pageHash || null;

  // 1) HEAD
  const head = await tryHead(it.link, headers, settings.headTimeoutMs);
  if (head) {
    const etag = head.etag;
    const lastMod = head.lastModified;
    if ((etag && knownEtag && etag === knownEtag) || (lastMod && knownLastMod && lastMod === knownLastMod)) {
      return { changed: false, etag, lastMod };
    }
  }

  // 2) GET
  const getRes = await fetchBodyAndHash(it.link, headers, settings.fetchTimeoutMs);
  if (!getRes.ok) {
    return { changed: false, error: getRes.error || getRes.status };
  }

  if (getRes.hash && getRes.hash !== knownHash) {
    return {
      changed: true,
      hash: getRes.hash,
      etag: getRes.etag,
      lastMod: getRes.lastModified,
      text: getRes.text
    };
  } else {
    return { changed: false, etag: getRes.etag, lastMod: getRes.lastModified };
  }
}

// ============================================================
// バッチ処理
// ============================================================

// 1 バッチを処理（startIndex から batchSize 件）
async function processBatch(startIndex, batchSize, settings) {
  const idx = await getStorage(INDEX_KEY) || { items: [] };
  const items = idx.items || [];
  const total = items.length;
  if (total === 0) {
    console.log('[BG] No items to check');
    return { nextCursor: 0, updatedIndex: idx, processed: 0, errors: [] };
  }

  let cursor = startIndex || 0;
  const end = Math.min(total, cursor + batchSize);
  const errors = [];
  let processed = 0;
  const concurrency = Math.max(1, Math.min(settings.maxConcurrentFetch || 3, batchSize));
  const queue = [];

  console.log(`[BG] Processing batch: cursor=${cursor}, end=${end}, concurrency=${concurrency}`);

  for (let i = cursor; i < end; i++) {
    const it = items[i];
    if (!it || !it.link) {
      processed++;
      continue;
    }

    queue.push((async () => {
      try {
        const res = await checkItemForUpdate(it, settings);
        if (res.changed) {
          it.pageHash = res.hash || it.pageHash;
          it.pageEtag = res.etag || it.pageEtag;
          it.pageLastModified = res.lastMod || it.pageLastModified;
          it.lastCheckedAt = new Date().toISOString();
          const lastSeen = it.lastSeenAt ? new Date(it.lastSeenAt).getTime() : 0;
          it.hasUpdate = (new Date(it.lastCheckedAt).getTime() > lastSeen);
          console.log(`[BG] Update detected: ${it.title}`);
        } else {
          it.pageEtag = res.etag || it.pageEtag;
          it.pageLastModified = res.lastMod || it.pageLastModified;
          it.lastCheckedAt = new Date().toISOString();
        }
      } catch (e) {
        errors.push({ id: it.id, title: it.title, error: e && e.message ? e.message : String(e) });
        logError(`checkItemForUpdate: ${it.title}`, e);
      }
    })());

    processed++;
    if (queue.length >= concurrency) {
      await Promise.all(queue.splice(0, queue.length));
    }
  }

  if (queue.length) {
    await Promise.all(queue.splice(0, queue.length));
  }

  idx.updatedAt = new Date().toISOString();
  // まずストレージに保存（確実な永続化）
  await setStorage({ [INDEX_KEY]: idx });

  const nextCursor = (end >= total) ? 0 : end;
  console.log(`[BG] Batch processed: nextCursor=${nextCursor}, errors=${errors.length}`);
  return { nextCursor, updatedIndex: idx, processed, errors };
}

// ============================================================
// アラームと継続処理
// ============================================================

// アラームハンドラ
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === 'checkUpdates') {
      console.log('[BG] Periodic check alarm triggered');
      const settings = await getStorage(SETTINGS_KEY) || DEFAULT_SETTINGS;
      await setStorage({ [CURSOR_KEY]: 0 });
      chrome.alarms.create('checkUpdatesBatch', { when: Date.now() + 1000 });
    } else if (alarm.name === 'checkUpdatesBatch') {
      console.log('[BG] Batch check alarm triggered');
      const settings = await getStorage(SETTINGS_KEY) || DEFAULT_SETTINGS;
      const cursor = await getStorage(CURSOR_KEY) || 0;
      const batchSize = settings.batchSize || DEFAULT_SETTINGS.batchSize;
      const result = await processBatch(cursor, batchSize, settings);

      // ストレージは processBatch 内で保存済み
      await updateBadgeFromIndex(result.updatedIndex);

      // 通知（popup が開いていなくても安全）
      await safeSendMessage({ type: 'UPDATE_DETECTED', index: result.updatedIndex });

      if (result.nextCursor && result.nextCursor > 0) {
        await setStorage({ [CURSOR_KEY]: result.nextCursor });
        chrome.alarms.create('checkUpdatesBatch', { when: Date.now() + 2000 });
      } else {
        await setStorage({ [CURSOR_KEY]: 0 });
        console.log('[BG] Batch check completed');
      }
    }
  } catch (e) {
    logError('alarm handler', e);
  }
});

// 初回アラーム作成
(async function ensureAlarms() {
  const settings = await getStorage(SETTINGS_KEY) || DEFAULT_SETTINGS;
  chrome.alarms.clear('checkUpdates', () => {
    const period = settings.periodMinutes || DEFAULT_SETTINGS.periodMinutes;
    chrome.alarms.create('checkUpdates', { periodInMinutes: period });
    console.log(`[BG] Alarms initialized: periodInMinutes=${period}`);
  });
})();

// ============================================================
// Drive 同期（SYNC_INDEX）
// ============================================================

// トークン取得ラッパー
function getDriveToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, token => {
      if (chrome.runtime.lastError) {
        const err = new Error(chrome.runtime.lastError.message);
        console.warn('[BG] getDriveToken error:', err.message);
        reject(err);
      } else {
        console.log('[BG] getDriveToken success');
        resolve(token);
      }
    });
  });
}

// ✨ Drive appDataFolder 内の index.json を探す（タイムアウト付き）
async function findIndexFile(token) {
  const q = "name = 'index.json' and trashed = false";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=appDataFolder&fields=files(id,name,etag,modifiedTime)`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` }
    }, DRIVE_API_TIMEOUT);
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Drive list failed: ${res.status} ${text}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return (data.files && data.files[0]) || null;
  } catch (e) {
    logError('findIndexFile', e);
    throw e;
  }
}

// ✨ ファイルメタ取得（タイムアウト付き）
async function getFileMeta(token, fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,etag,modifiedTime`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` }
    }, DRIVE_API_TIMEOUT);
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Drive get meta failed: ${res.status} ${text}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } catch (e) {
    logError('getFileMeta', e);
    throw e;
  }
}

// ✨ ファイル作成（appDataFolder、タイムアウト付き）
async function createIndexFile(token, content) {
  const metadata = { name: 'index.json', parents: ['appDataFolder'] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
  try {
    const res = await fetchWithTimeout(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,etag,modifiedTime',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      },
      DRIVE_API_TIMEOUT
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive create failed: ${res.status} ${text}`);
    }
    console.log('[BG] File created in Drive');
    return await res.json();
  } catch (e) {
    logError('createIndexFile', e);
    throw e;
  }
}

// ✨ ファイル更新（media upload、タイムアウト付き）
async function updateIndexFile(token, fileId, content) {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,etag,modifiedTime`;
  try {
    const res = await fetchWithTimeout(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(content)
    }, DRIVE_API_TIMEOUT);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive update failed: ${res.status} ${text}`);
    }
    console.log('[BG] File updated in Drive');
    return await res.json();
  } catch (e) {
    logError('updateIndexFile', e);
    throw e;
  }
}

// ✨ 簡易マージ戦略（null チェック向上）
function mergeIndex(localIndex, remoteIndexContent) {
  const map = new Map();
  (remoteIndexContent.items || []).forEach(it => map.set(it.id, it));
  (localIndex.items || []).forEach(it => {
    const r = map.get(it.id);
    if (!r) {
      map.set(it.id, it);
    } else {
      const localT = (localIndex.updatedAt && new Date(localIndex.updatedAt).getTime()) || 0;
      const remoteT = (r.updatedAt || r.modifiedTime) ? new Date(r.updatedAt || r.modifiedTime).getTime() : 0;
      if (remoteT > localT) {
        map.set(it.id, r);
      } else {
        map.set(it.id, it);
      }
    }
  });
  const merged = { items: Array.from(map.values()), updatedAt: new Date().toISOString() };
  return merged;
}

// ✨ SYNC_INDEX ハンドラ（堅牢化: トークン再取得・401対応・OAuth確認）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || msg.type !== 'SYNC_INDEX') {
        sendResponse({ ok: false, reason: 'unknown_or_missing_type' });
        return;
      }

      // ✨ OAuth 確認
      if (!isOAuthConfigured()) {
        console.warn('[BG] OAuth not configured, skipping sync');
        sendResponse({ ok: false, reason: 'oauth_not_configured' });
        return;
      }

      const localIndex = msg.index;
      let token;
      try {
        token = await getDriveToken(false);
      } catch (e) {
        console.log('[BG] Non-interactive auth failed, trying interactive');
        try {
          token = await getDriveToken(true);
        } catch (innerErr) {
          throw new Error(`Auth failed: ${innerErr.message}`);
        }
      }

      // find index file
      let fileMeta;
      try {
        fileMeta = await findIndexFile(token);
      } catch (err) {
        // 401/unauthorized handling
        if (err && err.status === 401) {
          console.log('[BG] Received 401, removing cached token and retrying');
          try {
            // remove cached token and retry
            await new Promise((resolve) => {
              chrome.identity.removeCachedAuthToken({ token }, () => resolve());
            });
            token = await getDriveToken(true);
            fileMeta = await findIndexFile(token);
          } catch (innerErr) {
            throw innerErr;
          }
        } else {
          throw err;
        }
      }

      if (!fileMeta) {
        console.log('[BG] Creating new index file');
        const created = await createIndexFile(token, localIndex);
        const idxToSave = {
          ...localIndex,
          fileId: created.id,
          etag: created.etag,
          modifiedTime: created.modifiedTime
        };
        await setStorage({ [INDEX_KEY]: idxToSave });
        await safeSendMessage({ type: 'UPDATE_DETECTED', index: idxToSave });
        sendResponse({ ok: true, created: true });
        return;
      }

      const meta = await getFileMeta(token, fileMeta.id);
      const localEtag = localIndex.etag;
      if (localEtag && meta.etag === localEtag) {
        console.log('[BG] Local etag matches remote, updating');
        const updated = await updateIndexFile(token, fileMeta.id, localIndex);
        const idxToSave = {
          ...localIndex,
          fileId: fileMeta.id,
          etag: updated.etag,
          modifiedTime: updated.modifiedTime
        };
        await setStorage({ [INDEX_KEY]: idxToSave });
        await safeSendMessage({ type: 'UPDATE_DETECTED', index: idxToSave });
        sendResponse({ ok: true, updated: true });
        return;
      } else {
        console.log('[BG] Local etag differs from remote, merging');
        const contentRes = await fetchWithTimeout(
          `https://www.googleapis.com/drive/v3/files/${fileMeta.id}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } },
          DRIVE_API_TIMEOUT
        );
        if (!contentRes.ok) {
          const text = await contentRes.text();
          throw new Error(`Drive get content failed: ${contentRes.status} ${text}`);
        }
        const remoteContent = await contentRes.json();
        const merged = mergeIndex(localIndex, remoteContent);
        const updated = await updateIndexFile(token, fileMeta.id, merged);
        const idxToSave = {
          ...merged,
          fileId: fileMeta.id,
          etag: updated.etag,
          modifiedTime: updated.modifiedTime
        };
        await setStorage({ [INDEX_KEY]: idxToSave });
        await safeSendMessage({ type: 'UPDATE_DETECTED', index: idxToSave });
        sendResponse({ ok: true, merged: true });
        return;
      }
    } catch (err) {
      logError('SYNC_INDEX', err);
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
      return;
    }
  })();
  return true; // async sendResponse を使うために true を返す
});

// ============================================================
// その他メッセージ
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.type) {
        sendResponse({ ok: false, reason: 'no_type' });
        return;
      }

      if (msg.type === 'TRIGGER_UPDATE_CHECK') {
        console.log('[BG] Manual trigger update check');
        await setStorage({ [CURSOR_KEY]: 0 });
        chrome.alarms.create('checkUpdatesBatch', { when: Date.now() + 500 });
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === 'REQUEST_BADGE_UPDATE') {
        console.log('[BG] Request badge update');
        const idx = await getStorage(INDEX_KEY) || { items: [] };
        await updateBadgeFromIndex(idx);
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === 'SETTINGS_UPDATED') {
        console.log('[BG] Settings updated');
        const s = msg.settings || {};
        await new Promise(r => chrome.storage.local.set({ [SETTINGS_KEY]: s }, () => r()));
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, reason: 'unknown_type' });
    } catch (e) {
      logError('message handler', e);
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();
  return true;
});

// ============================================================
// インストールイベント
// ============================================================

chrome.runtime.onInstalled.addListener(details => {
  console.log(`[BG] Extension installed/updated: reason=${details.reason}`);
  if (details.reason === 'install') {
    chrome.storage.local.get(['mangaTagHistory', 'mangaAutoFetchHosts'], res => {
      if (!res.mangaTagHistory) {
        chrome.storage.local.set({ mangaTagHistory: {} });
        console.log('[BG] Initialized mangaTagHistory');
      }
      if (!res.mangaAutoFetchHosts) {
        chrome.storage.local.set({ mangaAutoFetchHosts: [] });
        console.log('[BG] Initialized mangaAutoFetchHosts');
      }
    });
  }
});

// ============================================================
// デバッグ用グローバル公開
// ============================================================

window.debugBackgroundJs = {
  getStorage,
  setStorage,
  getDriveToken,
  findIndexFile,
  createIndexFile,
  updateIndexFile,
  processBatch,
  mergeIndex,
  checkItemForUpdate,
  isOAuthConfigured,
  BG_VERSION
};

console.log(`[BG] background.js v${BG_VERSION} loaded`);