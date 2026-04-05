// background.js - 修正版（sendMessage の安全化、storage 優先通知）
// version: 1.1.1 (patched safe messaging)

const BG_VERSION = '1.1.1';
const INDEX_KEY = 'index';
const CURSOR_KEY = 'updateCursor';
const SETTINGS_KEY = 'updateSettings';

const DEFAULT_SETTINGS = {
  periodMinutes: 15,
  batchSize: 10,
  maxConcurrentFetch: 3,
  fetchTimeoutMs: 15000,
  headTimeoutMs: 8000,
  userAgent: null
};

// -------------------- ユーティリティ --------------------

// 安全な sendMessage ラッパー（受信側がいない場合は例外にせずログに落とす）
function safeSendMessage(message) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('safeSendMessage: sendMessage failed:', chrome.runtime.lastError.message, message);
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp);
        }
      });
    } catch (e) {
      console.warn('safeSendMessage: unexpected error', e, message);
      resolve({ ok: false, error: String(e) });
    }
  });
}

// fetch にタイムアウトを付与
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
    if (err && err.name === 'AbortError') throw new Error('fetch timeout');
    throw err;
  }
}

// SHA-1 ハッシュ（テキスト -> 'sha1:...'）
async function sha1Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hash = await crypto.subtle.digest('SHA-1', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  return 'sha1:' + hex;
}

// ストレージヘルパ
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
  } catch (e) {
    console.warn('updateBadgeFromIndex failed', e);
  }
}

// -------------------- ページチェック関連 --------------------

// HEAD を試みて ETag/Last-Modified を確認（タイムアウト付き）
async function tryHead(url, headers = {}, timeoutMs = DEFAULT_SETTINGS.headTimeoutMs) {
  try {
    const res = await fetchWithTimeout(url, { method: 'HEAD', cache: 'no-store', headers }, timeoutMs);
    if (!res.ok) return null;
    return {
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified')
    };
  } catch (e) {
    console.warn('HEAD failed for', url, e && e.message ? e.message : e);
    return null;
  }
}

// GET 本文を取得してハッシュを返す（タイムアウト付き）
async function fetchBodyAndHash(url, headers = {}, timeoutMs = DEFAULT_SETTINGS.fetchTimeoutMs) {
  try {
    const res = await fetchWithTimeout(url, { method: 'GET', cache: 'no-store', headers }, timeoutMs);
    if (!res.ok) return { ok: false, status: res.status };
    const text = await res.text();
    const hash = await sha1Hex(text);
    return { ok: true, text, hash, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') };
  } catch (e) {
    console.warn('GET failed for', url, e && e.message ? e.message : e);
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
    return { changed: true, hash: getRes.hash, etag: getRes.etag, lastMod: getRes.lastModified, text: getRes.text };
  } else {
    return { changed: false, etag: getRes.etag, lastMod: getRes.lastModified };
  }
}

// -------------------- バッチ処理 --------------------

// 1 バッチを処理（startIndex から batchSize 件）
async function processBatch(startIndex, batchSize, settings) {
  const idx = await getStorage(INDEX_KEY) || { items: [] };
  const items = idx.items || [];
  const total = items.length;
  if (total === 0) return { nextCursor: 0, updatedIndex: idx, processed: 0, errors: [] };

  let cursor = startIndex || 0;
  const end = Math.min(total, cursor + batchSize);
  const errors = [];
  let processed = 0;
  const concurrency = Math.max(1, Math.min(settings.maxConcurrentFetch || 3, batchSize));
  const queue = [];

  for (let i = cursor; i < end; i++) {
    const it = items[i];
    if (!it || !it.link) { processed++; continue; }

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
        } else {
          it.pageEtag = res.etag || it.pageEtag;
          it.pageLastModified = res.lastMod || it.pageLastModified;
          it.lastCheckedAt = new Date().toISOString();
        }
      } catch (e) {
        errors.push({ id: it.id, error: e && e.message ? e.message : String(e) });
      }
    })());

    processed++;
    if (queue.length >= concurrency) {
      await Promise.all(queue.splice(0, queue.length));
    }
  }

  if (queue.length) await Promise.all(queue.splice(0, queue.length));

  idx.updatedAt = new Date().toISOString();
  // まずストレージに保存（確実な永続化）
  await setStorage({ [INDEX_KEY]: idx });

  const nextCursor = (end >= total) ? 0 : end;
  return { nextCursor, updatedIndex: idx, processed, errors };
}

// -------------------- アラームと継続処理 --------------------

// アラームハンドラ
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === 'checkUpdates') {
      const settings = await getStorage(SETTINGS_KEY) || DEFAULT_SETTINGS;
      await setStorage({ [CURSOR_KEY]: 0 });
      chrome.alarms.create('checkUpdatesBatch', { when: Date.now() + 1000 });
    } else if (alarm.name === 'checkUpdatesBatch') {
      const settings = await getStorage(SETTINGS_KEY) || DEFAULT_SETTINGS;
      const cursor = await getStorage(CURSOR_KEY) || 0;
      const batchSize = settings.batchSize || DEFAULT_SETTINGS.batchSize;
      const result = await processBatch(cursor, batchSize, settings);

      // ストレージは processBatch 内で保存済み。バッジ更新と通知は safeSendMessage を使う
      await updateBadgeFromIndex(result.updatedIndex);

      // 通知（popup が開いていなくても安全）
      await safeSendMessage({ type: 'UPDATE_DETECTED', index: result.updatedIndex });

      if (result.nextCursor && result.nextCursor > 0) {
        await setStorage({ [CURSOR_KEY]: result.nextCursor });
        chrome.alarms.create('checkUpdatesBatch', { when: Date.now() + 2000 });
      } else {
        await setStorage({ [CURSOR_KEY]: 0 });
      }
    }
  } catch (e) {
    console.warn('alarm handler error', e && e.message ? e.message : e);
  }
});

// 初回アラーム作成
(async function ensureAlarms() {
  const settings = await getStorage(SETTINGS_KEY) || DEFAULT_SETTINGS;
  chrome.alarms.clear('checkUpdates', () => {
    chrome.alarms.create('checkUpdates', { periodInMinutes: settings.periodMinutes || DEFAULT_SETTINGS.periodMinutes });
  });
})();

// -------------------- Drive 同期（SYNC_INDEX） --------------------

// トークン取得ラッパー
function getDriveToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, token => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(token);
    });
  });
}

// Drive appDataFolder 内の index.json を探す
async function findIndexFile(token) {
  const q = "name = 'index.json' and trashed = false";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=appDataFolder&fields=files(id,name,etag,modifiedTime)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error('Drive list failed: ' + res.status + ' ' + text);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return (data.files && data.files[0]) || null;
}

// ファイルのメタだけ取得
async function getFileMeta(token, fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,etag,modifiedTime`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error('Drive get meta failed: ' + res.status + ' ' + text);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

// ファイル作成（appDataFolder）
async function createIndexFile(token, content) {
  const metadata = { name: 'index.json', parents: ['appDataFolder'] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,etag,modifiedTime', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Drive create failed: ' + res.status + ' ' + text);
  }
  return await res.json();
}

// ファイル更新（media upload）
async function updateIndexFile(token, fileId, content) {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,etag,modifiedTime`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(content)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Drive update failed: ' + res.status + ' ' + text);
  }
  return await res.json();
}

// 簡易マージ戦略
function mergeIndex(localIndex, remoteIndexContent) {
  const map = new Map();
  (remoteIndexContent.items || []).forEach(it => map.set(it.id, it));
  (localIndex.items || []).forEach(it => {
    const r = map.get(it.id);
    if (!r) map.set(it.id, it);
    else {
      const localT = new Date(localIndex.updatedAt || 0).getTime();
      const remoteT = new Date(r.updatedAt || r.modifiedTime || 0).getTime();
      map.set(it.id, remoteT > localT ? r : it);
    }
  });
  const merged = { items: Array.from(map.values()), updatedAt: new Date().toISOString() };
  return merged;
}

// SYNC_INDEX ハンドラ（堅牢化: トークン再取得・401 対応・sendResponse の確実化）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || msg.type !== 'SYNC_INDEX') {
        sendResponse({ ok: false, reason: 'unknown_or_missing_type' });
        return;
      }
      const localIndex = msg.index;
      let token;
      try {
        token = await getDriveToken(false);
      } catch (e) {
        token = await getDriveToken(true);
      }

      // find index file
      let fileMeta;
      try {
        fileMeta = await findIndexFile(token);
      } catch (err) {
        // 401/unauthorized handling
        if (err && err.status === 401) {
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
        const created = await createIndexFile(token, localIndex);
        const idxToSave = { ...localIndex, fileId: created.id, etag: created.etag, modifiedTime: created.modifiedTime };
        await setStorage({ [INDEX_KEY]: idxToSave });
        await safeSendMessage({ type: 'UPDATE_DETECTED', index: idxToSave });
        sendResponse({ ok: true, created: true });
        return;
      }

      const meta = await getFileMeta(token, fileMeta.id);
      const localEtag = localIndex.etag;
      if (localEtag && meta.etag === localEtag) {
        const updated = await updateIndexFile(token, fileMeta.id, localIndex);
        const idxToSave = { ...localIndex, fileId: fileMeta.id, etag: updated.etag, modifiedTime: updated.modifiedTime };
        await setStorage({ [INDEX_KEY]: idxToSave });
        await safeSendMessage({ type: 'UPDATE_DETECTED', index: idxToSave });
        sendResponse({ ok: true, updated: true });
        return;
      } else {
        const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileMeta.id}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!contentRes.ok) {
          const text = await contentRes.text();
          throw new Error('Drive get content failed: ' + contentRes.status + ' ' + text);
        }
        const remoteContent = await contentRes.json();
        const merged = mergeIndex(localIndex, remoteContent);
        const updated = await updateIndexFile(token, fileMeta.id, merged);
        const idxToSave = { ...merged, fileId: fileMeta.id, etag: updated.etag, modifiedTime: updated.modifiedTime };
        await setStorage({ [INDEX_KEY]: idxToSave });
        await safeSendMessage({ type: 'UPDATE_DETECTED', index: idxToSave });
        sendResponse({ ok: true, merged: true });
        return;
      }
    } catch (err) {
      console.warn('SYNC_INDEX error', err && err.message ? err.message : err);
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
      return;
    }
  })();
  return true; // async sendResponse を使うために true を返す
});

// -------------------- その他メッセージ --------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.type) { sendResponse({ ok: false, reason: 'no_type' }); return; }

      if (msg.type === 'TRIGGER_UPDATE_CHECK') {
        await setStorage({ [CURSOR_KEY]: 0 });
        chrome.alarms.create('checkUpdatesBatch', { when: Date.now() + 500 });
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === 'REQUEST_BADGE_UPDATE') {
        const idx = await getStorage(INDEX_KEY) || { items: [] };
        await updateBadgeFromIndex(idx);
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === 'SETTINGS_UPDATED') {
        const s = msg.settings || {};
        await new Promise(r => chrome.storage.local.set({ [SETTINGS_KEY]: s }, () => r()));
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, reason: 'unknown_type' });
    } catch (e) {
      console.warn('message handler error', e && e.message ? e.message : e);
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();
  return true;
});

// -------------------- インストールイベントと既存の軽量ハンドラ --------------------
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.storage.local.get(['mangaTagHistory', 'mangaAutoFetchHosts'], res => {
      if (!res.mangaTagHistory) chrome.storage.local.set({ mangaTagHistory: [] });
      if (!res.mangaAutoFetchHosts) chrome.storage.local.set({ mangaAutoFetchHosts: [] });
    });
  }
});