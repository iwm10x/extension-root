// popup.js — 完全差し替え版
// 機能: タグ管理・本棚/お気に入り・ページメタ取得(scripting)・ホスト権限管理
//      storage.sync 判定・チャンク化・saveHybridWithFallback（再試行・フォールバック）
//      エクスポート / インポート（JSON）
// ver 1.0.0

/* ---------------------------
   定数とキー
   --------------------------- */
const KEY_SHELF = 'mangaBookshelf';
const KEY_FAV = 'mangaFavorites';
const KEY_TAGS = 'mangaTagHistory';
const KEY_AUTO_FETCH = 'mangaAutoFetchHosts';
const KEY_ERROR_LOGS = 'mangaErrorLogs';
const EXT_VERSION = '1.0.0';

// 同期判定パラメータ
const SYNC_SAFE_BYTES = 80 * 1024; // 80 KB safe threshold
const SYNC_CHUNK_PREFIX = 'sync_chunk_';
const SYNC_CHUNK_SIZE = 48 * 1024; // 48 KB per chunk to be safe

// デフォルトタグ
const DEFAULT_TAGS = ['恋愛','日常','ファンタジー','SF','青年','少女','ギャグ','サスペンス','ホラー','アクション','異世界','歴史'];

/* ---------------------------
   DOM 要素
   --------------------------- */
const titleInput = document.getElementById('title');
const coverInput = document.getElementById('cover');
const linkInput = document.getElementById('link');
const siteInput = document.getElementById('site');
const tagInput = document.getElementById('tagInput');
const tagChips = document.getElementById('tagChips');
const defaultTagsRow = document.getElementById('defaultTagsRow');
const tagSuggestions = document.getElementById('tagSuggestions');
const tagHistoryList = document.getElementById('tagHistoryList');
const clearTagHistoryBtn = document.getElementById('clearTagHistory');

const addShelfBtn = document.getElementById('addShelf');
const addFavBtn = document.getElementById('addFav');
const prefillBtn = document.getElementById('prefill');

const tagFilter = document.getElementById('tagFilter');
const sortBy = document.getElementById('sortBy');
const toggleOrder = document.getElementById('toggleOrder');
const clearFilter = document.getElementById('clearFilter');
const favFirstCheckbox = document.getElementById('favFirst');

const tabShelf = document.getElementById('tabShelf');
const tabFav = document.getElementById('tabFav');
const bookshelfPanel = document.getElementById('bookshelfPanel');
const favoritesPanel = document.getElementById('favoritesPanel');

const bookshelfList = document.getElementById('bookshelfList');
const favoritesList = document.getElementById('favoritesList');
const itemTpl = document.getElementById('itemTpl');

const requestHostPermBtn = document.getElementById('requestHostPerm');
const removeHostPermBtn = document.getElementById('removeHostPerm');
const hostPermStatus = document.getElementById('hostPermStatus');
const grantedHostsList = document.getElementById('grantedHostsList');
const refreshHostsBtn = document.getElementById('refreshHosts');

const exportBtn = document.getElementById('exportData');
const importBtn = document.getElementById('importDataBtn');
const importFileInput = document.getElementById('importFile');
const dataIOStatus = document.getElementById('dataIOStatus');

/* ---------------------------
   状態
   --------------------------- */
let bookshelf = [];
let favorites = [];
let currentTags = [];
let tagHistory = [];
let autoFetchHosts = [];
let orderAsc = true;
let activeTab = 'shelf';

document.querySelector('.ver').textContent = `ver.${EXT_VERSION}`;

/* ---------------------------
   初期化
   --------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  await init();
});

async function init() {
  await loadAll(); // local 本体データ
  await loadTagHistoryHybrid(); // sync 優先の小さなメタ
  await loadAutoFetchHostsHybrid();
  renderDefaultTagButtons();
  renderTagHistoryPanel();
  populateTagFilter();
  renderAll();
  await initHostPermModule();
  bindDataIOEvents();
}

/* ---------------------------
   ユーティリティ: サイズ推定 / チャンク化 / 判定
   --------------------------- */
function estimateSize(obj) {
  try {
    const s = JSON.stringify(obj);
    return new Blob([s]).size;
  } catch (e) {
    return Infinity;
  }
}

function shouldUseSync(obj, threshold = SYNC_SAFE_BYTES) {
  const size = estimateSize(obj);
  return size > 0 && size <= threshold;
}

async function saveSyncChunks(baseKey, obj, chunkSize = SYNC_CHUNK_SIZE) {
  const s = JSON.stringify(obj);
  const total = s.length;
  const chunks = [];
  for (let i = 0; i < total; i += chunkSize) {
    chunks.push(s.slice(i, i + chunkSize));
  }
  const toSet = {};
  toSet[`${baseKey}_meta`] = { chunks: chunks.length, lastModified: new Date().toISOString() };
  chunks.forEach((c, idx) => {
    toSet[`${SYNC_CHUNK_PREFIX}${baseKey}_${idx}`] = c;
  });
  try {
    await chrome.storage.sync.set(toSet);
    return { storage: 'sync', chunks: chunks.length };
  } catch (err) {
    // 失敗したら local に丸ごと保存
    await chrome.storage.local.set({ [baseKey]: { data: obj, __meta: { lastModified: new Date().toISOString(), note: 'sync_chunk_failed' } } });
    return { storage: 'local', fallback: true };
  }
}

async function loadSyncChunks(baseKey) {
  return new Promise(resolve => {
    chrome.storage.sync.get([`${baseKey}_meta`], async metaRes => {
      const meta = metaRes[`${baseKey}_meta`];
      if (!meta || !meta.chunks) return resolve(null);
      const keys = [];
      for (let i = 0; i < meta.chunks; i++) keys.push(`${SYNC_CHUNK_PREFIX}${baseKey}_${i}`);
      chrome.storage.sync.get(keys, res => {
        const parts = keys.map(k => res[k] || '');
        try {
          const s = parts.join('');
          const obj = JSON.parse(s);
          resolve(obj);
        } catch (e) {
          resolve(null);
        }
      });
    });
  });
}

/* ---------------------------
   トースト / エラーログ
   --------------------------- */
function showToast(message, type = 'info', timeout = 4000) {
  try {
    let el = document.getElementById('toastMessage');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toastMessage';
      el.style.position = 'fixed';
      el.style.bottom = '16px';
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%)';
      el.style.padding = '8px 12px';
      el.style.borderRadius = '8px';
      el.style.zIndex = 9999;
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.background = type === 'error' ? '#ef4444' : (type === 'warn' ? '#f59e0b' : '#111827');
    el.style.color = '#fff';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, timeout);
  } catch (e) {
    console.log('toast:', message);
  }
}

async function appendErrorLog(entry) {
  const key = KEY_ERROR_LOGS;
  const logs = await new Promise(resolve => chrome.storage.local.get([key], res => resolve(res[key] || [])));
  logs.unshift({ time: new Date().toISOString(), entry });
  if (logs.length > 200) logs.length = 200;
  await new Promise(resolve => chrome.storage.local.set({ [key]: logs }, () => resolve()));
}

/* ---------------------------
   saveHybridWithFallback（完全実装）
   - sync 優先、再試行（指数バックオフ）、quota や最終失敗時は local に退避
   --------------------------- */
async function saveHybridWithFallback(key, obj, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelay = options.baseDelay ?? 500; // ms
  const payload = { data: obj, __meta: { lastModified: new Date().toISOString() } };
  const size = estimateSize(payload);

  if (shouldUseSync(payload)) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          chrome.storage.sync.set({ [key]: payload }, () => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            resolve();
          });
        });
        showToast('データを同期しました', 'info', 2500);
        return { storage: 'sync', attempt };
      } catch (err) {
        console.warn('sync set error', err);
        await appendErrorLog({ key, error: err.message, attempt });
        const msg = (err && err.message) ? err.message.toLowerCase() : '';
        const isQuota = msg.includes('quota') || msg.includes('exceeded') || msg.includes('quota_exceeded');
        if (isQuota) {
          showToast('同期容量を超えたためローカルに保存しました', 'warn', 5000);
          await new Promise(resolve => chrome.storage.local.set({ [key]: payload }, () => resolve()));
          return { storage: 'local', reason: 'quota', attempt };
        }
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        } else {
          showToast('同期に失敗したためローカルに保存しました', 'warn', 5000);
          await new Promise(resolve => chrome.storage.local.set({ [key]: payload }, () => resolve()));
          return { storage: 'local', reason: 'retry_failed', attempt };
        }
      }
    }
  } else {
    await new Promise(resolve => chrome.storage.local.set({ [key]: payload }, () => resolve()));
    showToast('データが大きいためローカルに保存しました', 'info', 3000);
    return { storage: 'local', reason: 'too_large' };
  }
}

/* ---------------------------
   ハイブリッドラッパー（タグ履歴・autoFetch）
   - load: sync 優先で local をフォールバック
   - save: saveHybridWithFallback を使用
   --------------------------- */
async function loadHybrid(key) {
  return new Promise(resolve => {
    chrome.storage.sync.get([key], syncRes => {
      if (syncRes && syncRes[key]) return resolve(syncRes[key]);
      chrome.storage.local.get([key], localRes => {
        resolve(localRes[key] || null);
      });
    });
  });
}

async function loadTagHistoryHybrid() {
  const stored = await loadHybrid(KEY_TAGS);
  if (stored && stored.data) tagHistory = stored.data;
  else tagHistory = [];
}
async function saveTagHistoryHybrid() {
  return saveHybridWithFallback(KEY_TAGS, tagHistory);
}

async function loadAutoFetchHostsHybrid() {
  const stored = await loadHybrid(KEY_AUTO_FETCH);
  if (stored && stored.data) autoFetchHosts = stored.data;
  else autoFetchHosts = [];
}
async function saveAutoFetchHostsHybrid() {
  return saveHybridWithFallback(KEY_AUTO_FETCH, autoFetchHosts);
}

/* ---------------------------
   ページメタ取得（scripting.executeScript）
   --------------------------- */
async function getPageMetaViaScripting() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return resolve(null);
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            try {
              const title = document.querySelector('meta[property="og:title"]')?.content
                || document.querySelector('meta[name="twitter:title"]')?.content
                || document.title || '';
              const image = document.querySelector('meta[property="og:image"]')?.content
                || document.querySelector('meta[name="twitter:image"]')?.content
                || '';
              const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
              const site = document.querySelector('meta[property="og:site_name"]')?.content
                || location.hostname.replace(/^www\./, '');
              return { title: title.trim(), image: image.trim(), url: canonical, site: site.trim() };
            } catch (e) {
              return null;
            }
          }
        });
        const resultObj = Array.isArray(results) && results[0] ? results[0].result : null;
        resolve(resultObj || null);
      } catch (err) {
        resolve(null);
      }
    });
  });
}

/* ---------------------------
   タグ履歴・デフォルトタグ UI
   --------------------------- */
function renderDefaultTagButtons() {
  defaultTagsRow.innerHTML = '';
  DEFAULT_TAGS.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'defaultTagBtn';
    btn.type = 'button';
    btn.textContent = t;
    btn.addEventListener('click', () => {
      addTagToForm(t);
      addTagToHistory(t);
    });
    defaultTagsRow.appendChild(btn);
  });
}

function saveTagHistory() {
  return saveTagHistoryHybrid();
}
function addTagToHistory(tag) {
  const t = tag.trim();
  if (!t) return;
  const exists = tagHistory.find(x => x.toLowerCase() === t.toLowerCase());
  if (!exists) {
    tagHistory.unshift(t);
    if (tagHistory.length > 200) tagHistory.length = 200;
    saveTagHistory().then(renderTagHistoryPanel).then(populateTagFilter);
  }
}
function removeTagFromHistory(tag) {
  tagHistory = tagHistory.filter(t => t !== tag);
  saveTagHistory().then(renderTagHistoryPanel).then(populateTagFilter);
}
function clearTagHistory() {
  if (!confirm('タグ履歴を全て削除しますか？')) return;
  tagHistory = [];
  saveTagHistory().then(renderTagHistoryPanel).then(populateTagFilter);
}
function renderTagHistoryPanel() {
  tagHistoryList.innerHTML = '';
  if (!tagHistory || tagHistory.length === 0) {
    tagHistoryList.textContent = '履歴はありません';
    return;
  }
  tagHistory.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tagHistoryItem';
    el.textContent = t;
    el.addEventListener('click', () => {
      addTagToForm(t);
    });
    const rem = document.createElement('button');
    rem.className = 'remove';
    rem.textContent = '×';
    rem.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTagFromHistory(t);
    });
    el.appendChild(rem);
    tagHistoryList.appendChild(el);
  });
}
clearTagHistoryBtn.addEventListener('click', clearTagHistory);

/* ---------------------------
   タグ入力と候補表示
   --------------------------- */
tagInput.addEventListener('input', () => {
  const q = tagInput.value.trim().toLowerCase();
  if (!q) { tagSuggestions.style.display = 'none'; return; }
  const candidates = tagHistory.filter(t => t.toLowerCase().includes(q) && !currentTags.some(ct => ct.toLowerCase() === t.toLowerCase()));
  renderTagSuggestions(candidates);
});
tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const raw = tagInput.value.trim();
    if (raw) {
      const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
      parts.forEach(t => { addTagToForm(t); addTagToHistory(t); });
      tagInput.value = '';
      tagSuggestions.style.display = 'none';
    }
  } else if (e.key === 'Backspace' && tagInput.value === '') {
    currentTags.pop();
    renderTagChips();
  }
});
function renderTagSuggestions(list) {
  if (!list || list.length === 0) { tagSuggestions.style.display = 'none'; return; }
  tagSuggestions.innerHTML = '<div class="list"></div>';
  const container = tagSuggestions.querySelector('.list');
  list.forEach(t => {
    const it = document.createElement('div');
    it.className = 'item';
    it.textContent = t;
    it.addEventListener('click', () => {
      addTagToForm(t);
      addTagToHistory(t);
      tagInput.value = '';
      tagSuggestions.style.display = 'none';
    });
    container.appendChild(it);
  });
  tagSuggestions.style.display = '';
}

/* ---------------------------
   タグチップ操作
   --------------------------- */
function renderTagChips() {
  tagChips.innerHTML = '';
  currentTags.forEach((t, idx) => {
    const chip = document.createElement('div');
    chip.className = 'tagChip';
    chip.textContent = t;
    const rem = document.createElement('button');
    rem.className = 'remove';
    rem.textContent = '×';
    rem.addEventListener('click', () => {
      currentTags.splice(idx,1);
      renderTagChips();
    });
    chip.appendChild(rem);
    tagChips.appendChild(chip);
  });
}
function addTagToForm(tag) {
  const t = tag.trim();
  if (!t) return;
  if (currentTags.find(x => x.toLowerCase() === t.toLowerCase())) return;
  currentTags.push(t);
  renderTagChips();
}

/* ---------------------------
   storage helpers for main data (local)
   --------------------------- */
function save(key, arr) {
  return new Promise(resolve => {
    const obj = {}; obj[key] = arr;
    chrome.storage.local.set(obj, () => resolve());
  });
}
function load(key) {
  return new Promise(resolve => {
    chrome.storage.local.get([key], res => resolve(res[key] || []));
  });
}
async function loadAll() {
  bookshelf = await load(KEY_SHELF);
  favorites = await load(KEY_FAV);
}

/* ---------------------------
   ボタンイベント（追加）
   --------------------------- */
addShelfBtn.addEventListener('click', () => {
  const item = readForm();
  if (!item) return;
  bookshelf.unshift(item);
  (item.tags || []).forEach(addTagToHistory);
  save(KEY_SHELF, bookshelf).then(() => { populateTagFilter(); renderAll(); clearForm(); });
});
addFavBtn.addEventListener('click', () => {
  const item = readForm();
  if (!item) return;
  item.isFav = true;
  favorites.unshift(item);
  (item.tags || []).forEach(addTagToHistory);
  save(KEY_FAV, favorites).then(() => { populateTagFilter(); renderAll(); clearForm(); });
});

// prefill ボタンは getPageMetaViaScripting を使う
prefillBtn.addEventListener('click', async () => {
  prefillBtn.disabled = true;
  prefillBtn.textContent = '取得中...';
  try {
    const meta = await getPageMetaViaScripting();
    if (meta) {
      if (meta.title) titleInput.value = meta.title;
      if (meta.image) coverInput.value = meta.image;
      if (meta.url) linkInput.value = meta.url;
      if (meta.site) siteInput.value = meta.site;
    } else {
      alert('ページ情報を取得できませんでした。ページの構成や制限により取得できない場合があります。');
    }
  } finally {
    prefillBtn.disabled = false;
    prefillBtn.textContent = 'ページ情報を取得';
  }
});

/* ---------------------------
   タブ切替・フィルタ等
   --------------------------- */
tabShelf.addEventListener('click', () => { setActiveTab('shelf'); });
tabFav.addEventListener('click', () => { setActiveTab('fav'); });
function setActiveTab(tab) {
  activeTab = tab;
  if (tab === 'shelf') {
    tabShelf.classList.add('active'); tabFav.classList.remove('active');
    bookshelfPanel.style.display = ''; favoritesPanel.style.display = 'none';
  } else {
    tabFav.classList.add('active'); tabShelf.classList.remove('active');
    favoritesPanel.style.display = ''; bookshelfPanel.style.display = 'none';
  }
}
clearFilter.addEventListener('click', () => { tagFilter.value = ''; renderAll(); });
toggleOrder.addEventListener('click', () => { orderAsc = !orderAsc; toggleOrder.textContent = orderAsc ? '昇順' : '降順'; renderAll(); });
tagFilter.addEventListener('change', renderAll);
sortBy.addEventListener('change', renderAll);
favFirstCheckbox.addEventListener('change', renderAll);

/* ---------------------------
   フォーム読み取り・クリア
   --------------------------- */
function readForm() {
  const title = titleInput.value.trim();
  const cover = coverInput.value.trim();
  const link = linkInput.value.trim();
  const site = siteInput.value.trim();
  if (!title || !link) { alert('タイトルと作品ページURLは必須です。'); return null; }
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,8),
    title, cover, link, site,
    tags: [...currentTags],
    addedAt: new Date().toISOString(),
    isFav: false
  };
}
function clearForm() { titleInput.value=''; coverInput.value=''; linkInput.value=''; siteInput.value=''; currentTags=[]; renderTagChips(); }

/* ---------------------------
   タグフィルタ用に全タグを収集してセレクトを更新
   --------------------------- */
function populateTagFilter() {
  const all = new Set();
  [...bookshelf, ...favorites, ...tagHistory].forEach(itemOrTag => {
    if (typeof itemOrTag === 'string') all.add(itemOrTag);
    else (itemOrTag.tags || []).forEach(t => all.add(t));
  });
  const tags = Array.from(all).sort((a,b)=> a.localeCompare(b, 'ja'));
  tagFilter.innerHTML = '<option value="">すべてのタグ</option>';
  tags.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    tagFilter.appendChild(opt);
  });
}

/* ---------------------------
   ソート・フィルタ適用・描画
   --------------------------- */
function applySortAndFilter(items) {
  let arr = Array.isArray(items) ? [...items] : [];
  const filterTag = tagFilter.value;
  if (filterTag) arr = arr.filter(i => (i.tags || []).includes(filterTag));
  if (favFirstCheckbox.checked) {
    arr.sort((a,b) => (b.isFav?1:0) - (a.isFav?1:0));
  }
  const sortKey = sortBy.value;
  arr.sort((a,b) => {
    let va = a[sortKey] || '';
    let vb = b[sortKey] || '';
    if (sortKey === 'addedAt') { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return orderAsc ? -1 : 1;
    if (va > vb) return orderAsc ? 1 : -1;
    return 0;
  });
  return arr;
}

function renderAll() {
  populateTagFilter();
  // 仮想リストを使う場合は renderListVirtual を呼ぶ（存在しない場合は従来 renderList を想定）
  if (typeof renderListVirtual === 'function') {
    renderListVirtual(bookshelfList, applySortAndFilter(bookshelf), true);
    renderListVirtual(favoritesList, applySortAndFilter(favorites), false);
  } else {
    renderList(bookshelfList, applySortAndFilter(bookshelf), true);
    renderList(favoritesList, applySortAndFilter(favorites), false);
  }
}

/* ---------------------------
   既存のフルレンダリング（フォールバック）
   --------------------------- */
function renderList(container, items, isShelf) {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    const empty = document.createElement('div'); empty.className='empty'; empty.textContent = isShelf ? '本棚は空です' : 'お気に入りは空です';
    container.appendChild(empty); return;
  }
  items.forEach(item => {
    const node = itemTpl.content.cloneNode(true);
    const img = node.querySelector('.thumb');
    const a = node.querySelector('.title');
    const siteEl = node.querySelector('.site');
    const tagsEl = node.querySelector('.tags');
    const heartBtn = node.querySelector('.heart');
    const editBtn = node.querySelector('.edit');
    const moveBtn = node.querySelector('.move');
    const copyBtn = node.querySelector('.copy');
    const delBtn = node.querySelector('.del');

    img.src = item.cover || '';
    img.onerror = () => { img.src = ''; };
    a.textContent = item.title;
    a.href = item.link;
    siteEl.textContent = item.site || '';

    tagsEl.innerHTML = '';
    (item.tags || []).forEach(t => {
      const tspan = document.createElement('span'); tspan.className='tagSmall'; tspan.textContent = t;
      tspan.addEventListener('click', () => { tagFilter.value = t; renderAll(); });
      tagsEl.appendChild(tspan);
    });

    if (item.isFav) heartBtn.classList.add('filled'); else heartBtn.classList.remove('filled');
    heartBtn.addEventListener('click', () => {
      item.isFav = !item.isFav;
      [bookshelf, favorites].forEach(arr => {
        const idx = arr.findIndex(i => i.id === item.id);
        if (idx >= 0) arr[idx].isFav = item.isFav;
      });
      if (item.isFav) {
        if (!favorites.find(i => i.id === item.id)) favorites.unshift({...item});
      } else {
        favorites = favorites.filter(i => i.id !== item.id);
      }
      save(KEY_SHELF, bookshelf).then(() => save(KEY_FAV, favorites)).then(renderAll);
    });

    editBtn.addEventListener('click', () => {
      titleInput.value = item.title; coverInput.value = item.cover; linkInput.value = item.link; siteInput.value = item.site;
      currentTags = Array.isArray(item.tags) ? [...item.tags] : []; renderTagChips();
      if (isShelf) { bookshelf = bookshelf.filter(i => i.id !== item.id); save(KEY_SHELF, bookshelf).then(renderAll); }
      else { favorites = favorites.filter(i => i.id !== item.id); save(KEY_FAV, favorites).then(renderAll); }
    });

    moveBtn.addEventListener('click', () => {
      if (isShelf) { bookshelf = bookshelf.filter(i => i.id !== item.id); favorites.unshift(item); }
      else { favorites = favorites.filter(i => i.id !== item.id); bookshelf.unshift(item); }
      save(KEY_SHELF, bookshelf).then(() => save(KEY_FAV, favorites)).then(() => { populateTagFilter(); renderAll(); });
    });

    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(item.link); copyBtn.textContent='コピー済み'; setTimeout(()=>copyBtn.textContent='リンクコピー',1200); }
      catch(e){ alert('クリップボードにコピーできませんでした。'); }
    });

    delBtn.addEventListener('click', () => {
      if (!confirm('本当に削除しますか？')) return;
      if (isShelf) { bookshelf = bookshelf.filter(i => i.id !== item.id); save(KEY_SHELF, bookshelf).then(() => { populateTagFilter(); renderAll(); }); }
      else { favorites = favorites.filter(i => i.id !== item.id); save(KEY_FAV, favorites).then(() => { populateTagFilter(); renderAll(); }); }
    });

    container.appendChild(node);
  });
}

/* ---------------------------
   ホスト権限管理モジュール
   --------------------------- */
function getCurrentTabOrigin() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.url) return resolve(null);
      try {
        const u = new URL(tab.url);
        const originPattern = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}/*`;
        resolve(originPattern);
      } catch (e) {
        resolve(null);
      }
    });
  });
}

function containsHostPermission(origin) {
  return new Promise(resolve => {
    chrome.permissions.contains({ origins: [origin] }, granted => resolve(Boolean(granted)));
  });
}

async function requestHostPermissionForCurrentTab() {
  const origin = await getCurrentTabOrigin();
  if (!origin) { alert('現在のタブのURLを取得できませんでした。'); return; }
  chrome.permissions.request({ origins: [origin] }, granted => {
    if (granted) {
      hostPermStatus.textContent = `権限状態: 許可済 (${origin})`;
      renderGrantedHosts();
    } else {
      hostPermStatus.textContent = '権限状態: ユーザーが許可しませんでした';
    }
  });
}

async function removeHostPermissionForCurrentTab() {
  const origin = await getCurrentTabOrigin();
  if (!origin) { alert('現在のタブのURLを取得できませんでした。'); return; }
  if (!confirm(`このサイト (${origin}) の権限を取り消しますか？`)) return;
  chrome.permissions.remove({ origins: [origin] }, removed => {
    if (removed) {
      hostPermStatus.textContent = `権限状態: 取り消し済 (${origin})`;
      autoFetchHosts = autoFetchHosts.filter(o => o !== origin);
      saveAutoFetchHostsHybrid().then(renderGrantedHosts);
    } else {
      hostPermStatus.textContent = '権限状態: 取り消しに失敗しました';
    }
  });
}

function listGrantedOrigins() {
  return new Promise(resolve => {
    chrome.permissions.getAll(perms => {
      const origins = (perms && perms.origins) ? perms.origins.slice() : [];
      resolve(origins);
    });
  });
}

async function renderGrantedHosts() {
  grantedHostsList.innerHTML = '';
  const origins = await listGrantedOrigins();
  if (!origins || origins.length === 0) {
    grantedHostsList.textContent = '許可済みホストはありません';
    return;
  }

  origins.forEach(origin => {
    const item = document.createElement('div');
    item.className = 'grantedHostItem';

    const left = document.createElement('div');
    left.className = 'grantedHostLeft';
    const originEl = document.createElement('div');
    originEl.className = 'grantedHostOrigin';
    originEl.textContent = origin;
    const noteEl = document.createElement('div');
    noteEl.className = 'muted';
    noteEl.style.fontSize = '12px';
    noteEl.textContent = autoFetchHosts.includes(origin) ? '自動取得: 有効' : '自動取得: 無効';
    left.appendChild(originEl);
    left.appendChild(noteEl);

    const controls = document.createElement('div');
    controls.className = 'grantedHostControls';

    const autoWrap = document.createElement('label');
    autoWrap.className = 'autoFetchToggle';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = autoFetchHosts.includes(origin);
    chk.addEventListener('change', async () => {
      if (chk.checked) {
        if (!autoFetchHosts.includes(origin)) autoFetchHosts.unshift(origin);
      } else {
        autoFetchHosts = autoFetchHosts.filter(o => o !== origin);
      }
      await saveAutoFetchHostsHybrid();
      renderGrantedHosts();
    });
    const span = document.createElement('span');
    span.textContent = '自動取得';
    autoWrap.appendChild(chk);
    autoWrap.appendChild(span);

    const remBtn = document.createElement('button');
    remBtn.className = 'small secondary';
    remBtn.textContent = '取り消す';
    remBtn.addEventListener('click', async () => {
      if (!confirm(`このホスト (${origin}) の権限を取り消しますか？`)) return;
      chrome.permissions.remove({ origins: [origin] }, removed => {
        if (removed) {
          autoFetchHosts = autoFetchHosts.filter(o => o !== origin);
          saveAutoFetchHostsHybrid().then(renderGrantedHosts);
        } else {
          alert('権限の取り消しに失敗しました。');
        }
      });
    });

    controls.appendChild(autoWrap);
    controls.appendChild(remBtn);

    item.appendChild(left);
    item.appendChild(controls);
    grantedHostsList.appendChild(item);
  });
}

async function checkCurrentHostPermission() {
  const origin = await getCurrentTabOrigin();
  if (!origin) { hostPermStatus.textContent = '権限状態: タブ情報取得失敗'; return; }
  const granted = await containsHostPermission(origin);
  hostPermStatus.textContent = granted ? `権限状態: 許可済 (${origin})` : `権限状態: 未許可 (${origin})`;
  requestHostPermBtn.disabled = granted;
  removeHostPermBtn.disabled = !granted;
}

requestHostPermBtn.addEventListener('click', requestHostPermissionForCurrentTab);
removeHostPermBtn.addEventListener('click', removeHostPermissionForCurrentTab);
refreshHostsBtn.addEventListener('click', renderGrantedHosts);

/* ---------------------------
   ホストモジュール初期化
   --------------------------- */
async function initHostPermModule() {
  await loadAutoFetchHostsHybrid();
  await renderGrantedHosts();
  await checkCurrentHostPermission();

  // 自動取得が有効なホストなら現在タブで自動取得を試みる
  const origin = await getCurrentTabOrigin();
  if (origin && autoFetchHosts.includes(origin)) {
    const meta = await getPageMetaViaScripting();
    if (meta) {
      if (meta.title) titleInput.value = meta.title;
      if (meta.image) coverInput.value = meta.image;
      if (meta.url) linkInput.value = meta.url;
      if (meta.site) siteInput.value = meta.site;
    }
  }
}

/* ---------------------------
   content.js 互換フォールバック
   --------------------------- */
async function getPageMeta() {
  const meta = await getPageMetaViaScripting();
  if (meta) return meta;
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs || !tabs[0]) return resolve(null);
      const tabId = tabs[0].id;
      chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_META' }, response => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response?.meta || null);
      });
    });
  });
}

/* ---------------------------
   エクスポート / インポート機能
   --------------------------- */
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportAllData() {
  if (dataIOStatus) dataIOStatus.textContent = '状態: エクスポート中...';
  try {
    const localData = await new Promise(resolve => chrome.storage.local.get(null, res => resolve(res || {})));
    const syncData = await new Promise(resolve => chrome.storage.sync.get(null, res => resolve(res || {})));
    const payload = {
      exportedAt: new Date().toISOString(),
      local: localData,
      sync: syncData,
      note: 'This JSON contains both chrome.storage.local and chrome.storage.sync data.'
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const filename = `manga_backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    downloadBlob(filename, blob);
    if (dataIOStatus) dataIOStatus.textContent = '状態: エクスポート完了';
    showToast('エクスポートが完了しました', 'info', 3000);
  } catch (e) {
    console.error(e);
    if (dataIOStatus) dataIOStatus.textContent = '状態: エクスポート失敗';
    showToast('エクスポートに失敗しました', 'error', 5000);
  }
}

function bindDataIOEvents() {
  if (exportBtn) exportBtn.addEventListener('click', exportAllData);
  if (importBtn) importBtn.addEventListener('click', () => { if (importFileInput) { importFileInput.value = ''; importFileInput.click(); } });
  if (importFileInput) importFileInput.addEventListener('change', handleImportFile);
}

async function handleImportFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  if (!confirm('インポートすると既存データが上書きされます。本当に続行しますか？')) return;
  if (dataIOStatus) dataIOStatus.textContent = '状態: インポート中...';
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    // 競合解決付きのハンドラが存在すればそちらを使う
    if (typeof handleImportedPayloadWithConflictResolution === 'function') {
      await handleImportedPayloadWithConflictResolution(parsed);
    } else {
      await handleImportedPayload(parsed);
    }
    if (dataIOStatus) dataIOStatus.textContent = '状態: インポート完了';
    await loadAll();
    await loadTagHistoryHybrid();
    await loadAutoFetchHostsHybrid();
    populateTagFilter();
    renderTagHistoryPanel();
    renderGrantedHosts();
    renderAll();
    showToast('インポートが完了しました', 'info', 3000);
  } catch (err) {
    console.error(err);
    if (dataIOStatus) dataIOStatus.textContent = '状態: インポート失敗';
    showToast('インポートに失敗しました。ファイルを確認してください', 'error', 5000);
  }
}

async function handleImportedPayload(payload) {
  const localPart = payload.local || payload;
  const syncPart = payload.sync || {};

  if (typeof localPart !== 'object') throw new Error('local 部分が不正です');
  if (typeof syncPart !== 'object') throw new Error('sync 部分が不正です');

  // 1) local 保存（上書き）
  await new Promise((resolve) => {
    chrome.storage.local.set(localPart, () => resolve());
  });

  // 2) sync 保存（キーごとに判定）
  const syncKeys = Object.keys(syncPart);
  for (const key of syncKeys) {
    const value = syncPart[key];
    try {
      await saveHybridWithFallback(key, value && value.data !== undefined ? value.data : value);
    } catch (e) {
      console.warn('sync 保存失敗', key, e);
      await appendErrorLog({ action: 'import_sync_save_failed', key, error: e.message });
    }
  }

  // 3) 互換: top-level keys を local に保存（既存の known keys）
  const knownLocalKeys = [KEY_SHELF, KEY_FAV, KEY_TAGS, KEY_AUTO_FETCH];
  for (const k of knownLocalKeys) {
    if (payload[k] !== undefined) {
      await new Promise(resolve => chrome.storage.local.set({ [k]: payload[k] }, () => resolve()));
    }
  }
}

/* ---------------------------
   storage 変更監視
   --------------------------- */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[KEY_SHELF] || changes[KEY_FAV] || changes[KEY_TAGS] || changes[KEY_AUTO_FETCH])) {
    loadAll().then(() => loadTagHistoryHybrid()).then(() => loadAutoFetchHostsHybrid()).then(() => { populateTagFilter(); renderTagHistoryPanel(); renderGrantedHosts(); renderAll(); });
  }
  if (area === 'sync' && (changes[KEY_TAGS] || changes[KEY_AUTO_FETCH])) {
    loadTagHistoryHybrid().then(() => renderTagHistoryPanel()).then(populateTagFilter);
    loadAutoFetchHostsHybrid().then(() => renderGrantedHosts());
  }
});

/* ---------------------------
   開発用テストユーティリティ（本番では削除推奨）
   - simulateLargeSyncSave(key, sizeInKB)
   --------------------------- */
async function simulateLargeSyncSave(key, sizeInKB = 200) {
  const kb = 1024;
  const s = 'x'.repeat(sizeInKB * kb);
  const payload = { data: { big: s }, __meta: { lastModified: new Date().toISOString(), test: true } };
  try {
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [key]: payload }, () => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve();
      });
    });
    console.log('simulateLargeSyncSave: success (unexpected)');
  } catch (err) {
    console.warn('simulateLargeSyncSave: expected failure', err.message);
    showToast('同期テストでエラー発生（想定）: ' + err.message, 'warn', 6000);
  }
}

// Expose test util in dev mode (optional)
window.__simulateLargeSyncSave = simulateLargeSyncSave;