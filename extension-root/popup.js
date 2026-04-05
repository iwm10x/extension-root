// popup.js - 統合・UI改善版（編集モーダル、タグUX、favorite、検索、トースト、Undo、設定）
// 前提: background.js が SYNC_INDEX/TRIGGER_UPDATE_CHECK/REQUEST_BADGE_UPDATE を受け取る実装を持つこと

const INDEX_KEY = 'index';
const SORT_KEY = 'shelfSort';
const TAG_HISTORY_KEY = 'mangaTagHistory';
const FAVORITE_ONLY_KEY = 'favoriteOnly';
const SETTINGS_KEY = 'updateSettings';

// DOM
const shelfList = document.getElementById('shelfList');
const sortSelect = document.getElementById('sortSelect');
const notifyPanel = document.getElementById('notifyPanel');
const triggerCheckBtn = document.getElementById('triggerCheckBtn');
const addForm = document.getElementById('addForm');
const titleInput = document.getElementById('titleInput');
const urlInput = document.getElementById('urlInput');
const coverInput = document.getElementById('coverInput');
const tagsInput = document.getElementById('tagsInput');
const tagsChips = document.getElementById('tagsChips');
const tagSuggestions = document.getElementById('tagSuggestions');

const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

const tagFilterInput = document.getElementById('tagFilterInput');
const tagFilter = document.getElementById('tagFilter');
const tagFilterChips = document.getElementById('tagFilterChips');
const tagFilterSuggestions = document.getElementById('tagFilterSuggestions');
const clearFilterBtn = document.getElementById('clearFilterBtn');

const searchInput = document.getElementById('searchInput');
const favToggleBtn = document.getElementById('favToggleBtn');
const addToggleBtn = document.getElementById('addToggleBtn');
const densityToggle = document.getElementById('densityToggle');
const themeToggle = document.getElementById('themeToggle');

const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsForm = document.getElementById('settingsForm');
const settingBatchSize = document.getElementById('settingBatchSize');
const settingFetchTimeout = document.getElementById('settingFetchTimeout');
const settingUiCompact = document.getElementById('settingUiCompact');
const settingUiDark = document.getElementById('settingUiDark');
const settingsCancel = document.getElementById('settingsCancel');

const emptyState = document.getElementById('emptyState');
const emptyAddBtn = document.getElementById('emptyAddBtn');

const dupModal = document.getElementById('dupModal');
const dupList = document.getElementById('dupList');
const dupCancel = document.getElementById('dupCancel');
const dupProceed = document.getElementById('dupProceed');

const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editTitle = document.getElementById('editTitle');
const editUrl = document.getElementById('editUrl');
const editCover = document.getElementById('editCover');
const editTags = document.getElementById('editTags');
const editCancel = document.getElementById('editCancel');
const editCoverPreview = document.getElementById('editCoverPreview');
const editCoverPreviewFallback = document.getElementById('editCoverPreviewFallback');

const toastEl = document.querySelector('.toast');

// accessibility-safe show/hide
function safeHideElement(el) {
  if (!el) return;
  const active = document.activeElement;
  if (active && el.contains(active)) {
    const fallback = document.getElementById('addForm') || document.body;
    try { fallback.focus(); } catch (e) { document.body.focus(); }
  }
  if ('inert' in HTMLElement.prototype) {
    el.inert = true;
  } else {
    el.querySelectorAll('a,button,input,textarea,select,[tabindex]').forEach(node => {
      if (!node.hasAttribute('data-old-tabindex')) {
        const old = node.getAttribute('tabindex');
        node.setAttribute('data-old-tabindex', old === null ? 'none' : old);
      }
      node.setAttribute('tabindex', '-1');
      node.setAttribute('aria-hidden', 'true');
    });
  }
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'none';
}

function safeShowElement(el) {
  if (!el) return;
  if ('inert' in HTMLElement.prototype) {
    el.inert = false;
  } else {
    el.querySelectorAll('[data-old-tabindex]').forEach(node => {
      const old = node.getAttribute('data-old-tabindex');
      if (old === 'none') node.removeAttribute('tabindex'); else node.setAttribute('tabindex', old);
      node.removeAttribute('data-old-tabindex');
      node.removeAttribute('aria-hidden');
    });
  }
  el.removeAttribute('aria-hidden');
  el.style.display = '';
}

let _editingItemId = null;
let favoriteOnly = false;
window.__shelfSearchQuery = '';

// ---------------- utilities ----------------
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function normalizeTitle(title) {
  if (!title) return '';
  let s = title.trim().toLowerCase();
  s = s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  s = s.replace(/[\u3000]/g, ' ');
  s = s.replace(/[\s　]+/g, ' ');
  s = s.replace(/[^\p{L}\p{N}\s\-]/gu, '');
  return s;
}
function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
    u.pathname = u.pathname.replace(/\/+$/, '');
    u.hash = '';
    return u.toString();
  } catch (e) {
    return url.trim();
  }
}

// ---------------- storage helpers ----------------
function getIndex() {
  return new Promise(resolve => chrome.storage.local.get([INDEX_KEY], r => resolve(r[INDEX_KEY] || { items: [] })));
}
// function setIndex(idx) {
//   return new Promise(resolve => chrome.storage.local.set({ [INDEX_KEY]: idx }, () => resolve()));
// }
function setIndex(idx) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [INDEX_KEY]: idx }, () => {
      if (chrome.runtime.lastError) {
        console.error('chrome.storage.set error', chrome.runtime.lastError);
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve();
    });
  });
}
function getTagHistory() {
  return new Promise(resolve => chrome.storage.local.get([TAG_HISTORY_KEY], r => resolve(r[TAG_HISTORY_KEY] || {})));
}
function setTagHistory(obj) {
  return new Promise(resolve => chrome.storage.local.set({ [TAG_HISTORY_KEY]: obj }, () => resolve()));
}
async function addTagToHistory(tag) {
  if (!tag) return;
  const hist = await getTagHistory();
  const key = tag.toLowerCase();
  hist[key] = (hist[key] || 0) + 1;
  await setTagHistory(hist);
}

// ---------------- Levenshtein 最適化 ----------------
function levenshteinEarly(a, b, maxDist = Infinity) {
  if (a === b) return 0;
  let la = a.length, lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (la > lb) { [a, b] = [b, a];[la, lb] = [lb, la]; }
  const prev = new Array(la + 1);
  for (let i = 0; i <= la; i++) prev[i] = i;
  for (let j = 1; j <= lb; j++) {
    const cur = [j];
    const bj = b.charCodeAt(j - 1);
    let rowMin = cur[0];
    for (let i = 1; i <= la; i++) {
      const cost = a.charCodeAt(i - 1) === bj ? 0 : 1;
      const v = Math.min(cur[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
      cur[i] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let k = 0; k <= la; k++) prev[k] = cur[k];
  }
  return prev[la];
}
function isSimilarByLevenshteinOptimized(normA, normB) {
  const L = Math.max(normA.length, normB.length);
  if (L === 0) return false;
  const fixedThreshold = 2;
  const relativeThreshold = Math.max(1, Math.floor(0.2 * L));
  const threshold = Math.max(fixedThreshold, relativeThreshold);
  if (Math.abs(normA.length - normB.length) > threshold) return false;
  const d = levenshteinEarly(normA, normB, threshold);
  return d <= threshold;
}

// ---------------- normalized index cache ----------------
let _normalizedIndexCache = null;
let _normalizedIndexCacheTs = 0;
const NORMALIZED_INDEX_TTL_MS = 5 * 60 * 1000;
function invalidateNormalizedIndex() { _normalizedIndexCache = null; _normalizedIndexCacheTs = 0; }
async function getNormalizedIndexCached() {
  if (_normalizedIndexCache && (Date.now() - _normalizedIndexCacheTs) < NORMALIZED_INDEX_TTL_MS) return _normalizedIndexCache;
  const idx = await getIndex();
  const items = idx.items || [];
  const titleMap = new Map();
  const urlMap = new Map();
  for (const it of items) {
    const nt = normalizeTitle(it.title || '');
    const nu = normalizeUrl(it.link || it.url || '');
    if (nt) { if (!titleMap.has(nt)) titleMap.set(nt, []); titleMap.get(nt).push(it); }
    if (nu) { if (!urlMap.has(nu)) urlMap.set(nu, []); urlMap.get(nu).push(it); }
  }
  _normalizedIndexCache = { items, titleMap, urlMap };
  _normalizedIndexCacheTs = Date.now();
  return _normalizedIndexCache;
}

// ---------------- duplicates (optimized) ----------------
async function findDuplicatesOptimized({ title, url }) {
  const normTitle = normalizeTitle(title || '');
  const normUrl = normalizeUrl(url || '');
  const { items, titleMap, urlMap } = await getNormalizedIndexCached();

  const urlMatches = [];
  const exactTitleMatches = [];
  const levenshteinMatches = [];
  const partialMatches = [];

  if (normUrl && urlMap.has(normUrl)) urlMatches.push(...urlMap.get(normUrl));
  if (normTitle.length >= 6 && titleMap.has(normTitle)) exactTitleMatches.push(...titleMap.get(normTitle));

  if (normTitle.length >= 6) {
    const maxLenDiff = Math.max(3, Math.floor(0.3 * Math.max(normTitle.length, 6)));
    for (const it of items) {
      const itTitleNorm = normalizeTitle(it.title || '');
      if (!itTitleNorm) continue;
      if (itTitleNorm === normTitle) continue;
      const lenDiff = Math.abs(itTitleNorm.length - normTitle.length);
      if (lenDiff > maxLenDiff) continue;
      if (itTitleNorm.includes(normTitle) || normTitle.includes(itTitleNorm)) { partialMatches.push(it); continue; }
      if (isSimilarByLevenshteinOptimized(normTitle, itTitleNorm)) levenshteinMatches.push(it);
    }
  } else {
    for (const it of items) {
      const itTitleNorm = normalizeTitle(it.title || '');
      if (!itTitleNorm) continue;
      if (itTitleNorm.includes(normTitle) || normTitle.includes(itTitleNorm)) partialMatches.push(it);
    }
  }

  return { urlMatches, exactTitleMatches, levenshteinMatches, partialMatches };
}

// ---------------- tag UI helpers ----------------
function createTagChipElement(tag, removable = true) {
  const span = document.createElement('span');
  span.className = 'tag-chip';
  span.textContent = tag;
  if (removable) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', `タグ ${tag} を削除`);
    btn.textContent = '×';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      span.remove();
    });
    span.appendChild(btn);
  }
  return span;
}
function getChipsFromContainer(container) {
  return Array.from(container.querySelectorAll('.tag-chip')).map(ch => {
    const txt = ch.childNodes[0].nodeValue || ch.textContent || '';
    return txt.trim();
  });
}
function clearChips(container) { container.innerHTML = ''; }

// ---------------- tag suggestions ----------------
let _tagSuggestionState = { items: [], activeIndex: -1, visibleFor: null };

async function buildTagCandidates() {
  const hist = await getTagHistory();
  const idx = await getIndex();
  const counts = { ...hist };
  for (const it of (idx.items || [])) {
    for (const t of (it.tags || [])) {
      const k = t.toLowerCase();
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  const arr = Object.keys(counts).map(k => ({ tag: k, count: counts[k] })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return arr;
}

async function showTagSuggestionsForInput(inputEl, suggestionsEl, containerChipsEl, query) {
  const candidates = await buildTagCandidates();
  const q = (query || '').trim().toLowerCase();
  const filtered = candidates.filter(c => !getChipsFromContainer(containerChipsEl).map(x => x.toLowerCase()).includes(c.tag) && (q === '' || c.tag.includes(q)));
  _tagSuggestionState.items = filtered;
  _tagSuggestionState.activeIndex = -1;
  _tagSuggestionState.visibleFor = suggestionsEl;
  renderTagSuggestions(suggestionsEl, filtered);
}

function renderTagSuggestions(suggestionsEl, items) {
  suggestionsEl.innerHTML = '';
  if (!items || items.length === 0) {
    suggestionsEl.setAttribute('aria-hidden', 'true');
    return;
  }
  suggestionsEl.setAttribute('aria-hidden', 'false');
  items.forEach((it, idx) => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.setAttribute('role', 'option');
    div.dataset.index = idx;
    div.innerHTML = `<span class="suggestion-text">${escapeHtml(it.tag)}</span><span class="suggestion-count">${it.count}</span>`;
    div.addEventListener('click', () => {
      addTagChipFromSuggestion(it.tag, suggestionsEl);
    });
    suggestionsEl.appendChild(div);
  });
}

function hideTagSuggestions(suggestionsEl) {
  suggestionsEl.innerHTML = '';
  suggestionsEl.setAttribute('aria-hidden', 'true');
  _tagSuggestionState.items = [];
  _tagSuggestionState.activeIndex = -1;
  _tagSuggestionState.visibleFor = null;
}

function highlightSuggestion(suggestionsEl, idx) {
  const children = Array.from(suggestionsEl.children);
  children.forEach((c, i) => c.classList.toggle('active', i === idx));
  _tagSuggestionState.activeIndex = idx;
}

async function addTagChipFromSuggestion(tag, suggestionsEl) {
  const chip = createTagChipElement(tag, true);
  tagsChips.appendChild(chip);
  await addTagToHistory(tag);
  hideTagSuggestions(suggestionsEl);
  tagsInput.value = '';
  tagsInput.focus();
}

// tags input interactions
tagsInput?.addEventListener('input', async (e) => {
  const q = tagsInput.value.trim();
  await showTagSuggestionsForInput(tagsInput, tagSuggestions, tagsChips, q);
});
tagsInput?.addEventListener('keydown', async (e) => {
  const visible = tagSuggestions.getAttribute('aria-hidden') === 'false';
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = tagsInput.value.trim();
    if (val) {
      const parts = val.split(',').map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        const chip = createTagChipElement(p, true);
        tagsChips.appendChild(chip);
        await addTagToHistory(p);
      }
      tagsInput.value = '';
      hideTagSuggestions(tagSuggestions);
    } else if (visible && _tagSuggestionState.activeIndex >= 0) {
      const item = _tagSuggestionState.items[_tagSuggestionState.activeIndex];
      if (item) await addTagChipFromSuggestion(item.tag, tagSuggestions);
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!visible) {
      await showTagSuggestionsForInput(tagsInput, tagSuggestions, tagsChips, tagsInput.value.trim());
    } else {
      const next = Math.min((_tagSuggestionState.items.length - 1), (_tagSuggestionState.activeIndex + 1));
      highlightSuggestion(tagSuggestions, next);
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (visible) {
      const prev = Math.max(0, (_tagSuggestionState.activeIndex - 1));
      highlightSuggestion(tagSuggestions, prev);
    }
  } else if (e.key === 'Escape') {
    hideTagSuggestions(tagSuggestions);
  }
});
document.addEventListener('click', (e) => {
  if (!e.composedPath().includes(tagsInput) && !e.composedPath().includes(tagSuggestions)) {
    hideTagSuggestions(tagSuggestions);
  }
});

// tag filter interactions
async function showTagFilterSuggestions(q) {
  const candidates = await buildTagCandidates();
  const query = (q || '').trim().toLowerCase();
  const filtered = candidates.filter(c => !getChipsFromContainer(tagFilterChips).map(x => x.toLowerCase()).includes(c.tag) && (query === '' || c.tag.includes(query)));
  _tagSuggestionState.items = filtered;
  _tagSuggestionState.activeIndex = -1;
  _tagSuggestionState.visibleFor = tagFilterSuggestions;
  renderTagSuggestions(tagFilterSuggestions, filtered);
}
tagFilterInput?.addEventListener('input', async (e) => { await showTagFilterSuggestions(tagFilterInput.value); });
tagFilterInput?.addEventListener('keydown', async (e) => {
  const visible = tagFilterSuggestions.getAttribute('aria-hidden') === 'false';
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = tagFilterInput.value.trim();
    if (val) {
      const chip = createTagChipElement(val, true);
      tagFilterChips.appendChild(chip);
      tagFilterInput.value = '';
      await renderShelf();
    } else if (visible && _tagSuggestionState.activeIndex >= 0) {
      const item = _tagSuggestionState.items[_tagSuggestionState.activeIndex];
      if (item) {
        const chip = createTagChipElement(item.tag, true);
        tagFilterChips.appendChild(chip);
        tagFilterInput.value = '';
        hideTagSuggestions(tagFilterSuggestions);
        await renderShelf();
      }
    }
  } else if (e.key === 'Escape') {
    hideTagSuggestions(tagFilterSuggestions);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!visible) await showTagFilterSuggestions(tagFilterInput.value);
    else {
      const next = Math.min((_tagSuggestionState.items.length - 1), (_tagSuggestionState.activeIndex + 1));
      highlightSuggestion(tagFilterSuggestions, next);
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (visible) {
      const prev = Math.max(0, (_tagSuggestionState.activeIndex - 1));
      highlightSuggestion(tagFilterSuggestions, prev);
    }
  }
});
clearFilterBtn?.addEventListener('click', async () => {
  clearChips(tagFilterChips);
  tagFilterInput.value = '';
  await renderShelf();
});
document.addEventListener('click', (e) => {
  if (!e.composedPath().includes(tagFilter) && !e.composedPath().includes(tagFilterSuggestions)) {
    hideTagSuggestions(tagFilterSuggestions);
  }
});

// ---------------- add item (with tags) ----------------
async function addMangaWrapper({ title, url, cover, tags = [] }) {
  const idx = await getIndex();
  const newId = 'm_' + Date.now();
  const maxOrder = (idx.items && idx.items.length) ? Math.max(...idx.items.map(i => i.order || 0)) : 0;
  const newItem = {
    id: newId,
    title: title || '(無題)',
    link: url || '',
    cover: cover || '',
    pageTitle: '',
    pageDescription: '',
    pageHash: '',
    tags: Array.isArray(tags) ? tags.filter(Boolean).map(t => t.trim()) : [],
    favorite: false,
    order: maxOrder + 10,
    addedAt: new Date().toISOString(),
    lastCheckedAt: null,
    lastSeenAt: null,
    hasUpdate: false,
    updatedAt: new Date().toISOString()
  };
  idx.items = idx.items || [];
  idx.items.push(newItem);
  idx.updatedAt = new Date().toISOString();
  await setIndex(idx);
  for (const t of newItem.tags) await addTagToHistory(t);
  invalidateNormalizedIndex();
  chrome.runtime.sendMessage({ type: 'SYNC_INDEX', index: idx }, () => { });
  return { ok: true, item: newItem };
}

// ---------------- rendering (with skeleton & empty state) ----------------
function showSkeleton(count = 4) {
  shelfList.innerHTML = '';
  const ul = document.createElement('ul');
  ul.className = 'skeleton-list';
  for (let i = 0; i < count; i++) {
    const li = document.createElement('li');
    li.className = 'skeleton-item';
    li.innerHTML = `<div class="skeleton-thumb" aria-hidden="true"></div>
                    <div class="skeleton-body">
                      <div class="skeleton-line" aria-hidden="true"></div>
                      <div class="skeleton-line short" aria-hidden="true"></div>
                    </div>`;
    ul.appendChild(li);
  }
  shelfList.appendChild(ul);
}
function showEmptyState(show) {
  if (!emptyState) return;
  if (show) {
    emptyState.setAttribute('aria-hidden', 'false');
    shelfList.style.display = 'none';
  } else {
    emptyState.setAttribute('aria-hidden', 'true');
    shelfList.style.display = '';
  }
}

async function renderShelf() {
  showEmptyState(false);
  showSkeleton(4);
  await new Promise(r => setTimeout(r, 120));

  const idx = await getIndex();
  const sortMode = await new Promise(r => chrome.storage.local.get([SORT_KEY], res => r(res[SORT_KEY] || 'manual')));
  let items = (idx.items || []).slice();

  if (!items || items.length === 0) {
    shelfList.innerHTML = '';
    showEmptyState(true);
    return;
  } else {
    showEmptyState(false);
  }

  const filterTags = getChipsFromContainer(tagFilterChips).map(t => t.toLowerCase());
  const searchQ = (window.__shelfSearchQuery || '').trim().toLowerCase();

  if (sortMode === 'updated') {
    items.sort((a, b) => {
      const ta = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0;
      const tb = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0;
      return tb - ta;
    });
  } else if (sortMode === 'favorite') {
    items.sort((a, b) => {
      const fa = a.favorite ? 0 : 1;
      const fb = b.favorite ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return (a.order || 0) - (b.order || 0);
    });
  } else {
    items.sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  if (filterTags.length) {
    items = items.filter(it => {
      const its = (it.tags || []).map(t => t.toLowerCase());
      return filterTags.every(ft => its.includes(ft));
    });
  }

  if (favoriteOnly) {
    items = items.filter(it => !!it.favorite);
  }

  if (searchQ) {
    items = items.filter(it => {
      const inTitle = (it.title || '').toLowerCase().includes(searchQ);
      const inTags = (it.tags || []).some(t => t.toLowerCase().includes(searchQ));
      return inTitle || inTags;
    });
  }

  shelfList.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'shelf-item' + (it.hasUpdate ? ' updated' : '');
    li.dataset.id = it.id;

    const thumbHtml = it.cover ? `<img class="thumb" src="${escapeHtml(it.cover)}" alt="">` : `<div class="thumb" aria-hidden="true"></div>`;
    const tagsHtml = (it.tags || []).slice(0, 5).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const favHtml = `<div class="fav"><button class="favBtn ${it.favorite ? 'fav-on' : 'fav-off'}" data-id="${it.id}" aria-pressed="${it.favorite ? 'true' : 'false'}">${it.favorite ? '★' : '☆'}</button></div>`;

    li.innerHTML = `
      <span class="handle" aria-hidden="true">≡</span>
      ${thumbHtml}
      <div class="title-wrap">
        <div class="title" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>
        <div class="meta">${it.pageTitle ? escapeHtml(it.pageTitle) : ''}${it.lastCheckedAt ? ' • ' + new Date(it.lastCheckedAt).toLocaleString() : ''}</div>
        <div class="tag-list">${tagsHtml}</div>
      </div>
      ${favHtml}
      <div class="actions" aria-hidden="true">
        <button class="openBtn" data-id="${it.id}" aria-label="開く">開く</button>
        <button class="editBtn" data-id="${it.id}" aria-label="編集">編集</button>
        <button class="delBtn" data-id="${it.id}" aria-label="削除">削除</button>
      </div>`;
    attachDnD(li);
    attachActions(li);
    shelfList.appendChild(li);
  }
}

// ---------------- actions (open/edit/delete/favorite) ----------------
function attachActions(li) {
  const openBtn = li.querySelector('.openBtn');
  const editBtn = li.querySelector('.editBtn');
  const delBtn = li.querySelector('.delBtn');
  const favBtn = li.querySelector('.favBtn');
  const actionsEl = li.querySelector('.actions');

  li.addEventListener('focusin', () => {
    if (actionsEl) actionsEl.removeAttribute('aria-hidden');
  });
  li.addEventListener('focusout', () => {
    if (actionsEl) actionsEl.setAttribute('aria-hidden', 'true');
  });

  if (openBtn) openBtn.addEventListener('click', async (e) => {
    const id = e.currentTarget.dataset.id;
    const idx = await getIndex();
    const it = (idx.items || []).find(x => x.id === id);
    if (it && it.link) window.open(it.link, '_blank');
  });

  if (editBtn) editBtn.addEventListener('click', async (e) => {
    const id = e.currentTarget.dataset.id;
    openEditModalById(id);
  });

  if (delBtn) delBtn.addEventListener('click', async (e) => {
    const id = e.currentTarget.dataset.id;
    if (!confirm('本当に削除しますか？')) return;
    await removeItemByIdWithUndo(id);
    await renderShelf();
    const idx = await getIndex();
    chrome.runtime.sendMessage({ type: 'SYNC_INDEX', index: idx }, () => { });
  });

  if (favBtn) {
    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      const idx = await getIndex();
      const it = (idx.items || []).find(x => x.id === id);
      if (!it) return;
      it.favorite = !it.favorite;
      idx.updatedAt = new Date().toISOString();
      await setIndex(idx);
      invalidateNormalizedIndex();
      favBtn.textContent = it.favorite ? '★' : '☆';
      favBtn.classList.toggle('fav-on', it.favorite);
      favBtn.classList.toggle('fav-off', !it.favorite);
      favBtn.setAttribute('aria-pressed', it.favorite ? 'true' : 'false');
      chrome.runtime.sendMessage({ type: 'SYNC_INDEX', index: idx }, () => { });
    });
  }
}

// ---------------- DnD ----------------
let dragSrcEl = null;
function handleDragStart(e) {
  dragSrcEl = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
  this.classList.add('dragging');
}
function handleDragOver(e) {
  e.preventDefault();
  const target = e.target.closest('.shelf-item');
  if (!target || target === dragSrcEl) return;
  const rect = target.getBoundingClientRect();
  const after = (e.clientY - rect.top) > (rect.height / 2);
  if (after) target.parentNode.insertBefore(dragSrcEl, target.nextSibling);
  else target.parentNode.insertBefore(dragSrcEl, target);
}
function handleDragEnd() {
  this.classList.remove('dragging');
  saveOrderFromDOM();
}
function attachDnD(itemEl) {
  itemEl.setAttribute('draggable', 'true');
  itemEl.addEventListener('dragstart', handleDragStart);
  itemEl.addEventListener('dragover', handleDragOver);
  itemEl.addEventListener('dragend', handleDragEnd);
}

// ---------------- order save / remove / mark seen ----------------
async function saveOrderFromDOM() {
  const ids = Array.from(shelfList.querySelectorAll('.shelf-item')).map(el => el.dataset.id);
  let base = 10;
  const newOrders = {};
  ids.forEach(id => { newOrders[id] = base; base += 10; });

  const idx = await getIndex();
  idx.items = (idx.items || []).map(it => ({ ...it, order: newOrders[it.id] ?? it.order }));
  idx.updatedAt = new Date().toISOString();
  await setIndex(idx);
  invalidateNormalizedIndex();
  chrome.runtime.sendMessage({ type: 'SYNC_INDEX', index: idx }, () => { });
}

async function removeItemById(id) {
  const idx = await getIndex();
  idx.items = (idx.items || []).filter(it => it.id !== id);
  idx.updatedAt = new Date().toISOString();
  await setIndex(idx);
  invalidateNormalizedIndex();
}

// Undo-enabled delete
let _lastDeleted = null;
async function removeItemByIdWithUndo(id) {
  const idx = await getIndex();
  const it = (idx.items || []).find(x => x.id === id);
  if (!it) return;
  idx.items = (idx.items || []).filter(x => x.id !== id);
  idx.updatedAt = new Date().toISOString();
  await setIndex(idx);
  invalidateNormalizedIndex();
  _lastDeleted = { item: it, time: Date.now() };
  chrome.runtime.sendMessage({ type: 'SYNC_INDEX', index: idx }, () => { });
  showToastWithUndo('削除しました', async () => {
    if (_lastDeleted && _lastDeleted.item) {
      const idx2 = await getIndex();
      idx2.items = idx2.items || [];
      idx2.items.push(_lastDeleted.item);
      idx2.updatedAt = new Date().toISOString();
      await setIndex(idx2);
      invalidateNormalizedIndex();
      chrome.runtime.sendMessage({ type: 'SYNC_INDEX', index: idx2 }, () => { });
      _lastDeleted = null;
      await renderShelf();
      showToast('復元しました', 2000);
    }
  });
}

async function markItemAsSeen(id) {
  const idx = await getIndex();
  const it = (idx.items || []).find(x => x.id === id);
  if (!it) return;
  it.lastSeenAt = new Date().toISOString();
  it.hasUpdate = false;
  idx.updatedAt = new Date().toISOString();
  await setIndex(idx);
  invalidateNormalizedIndex();
  chrome.runtime.sendMessage({ type: 'SYNC_INDEX', index: idx }, () => { });
  chrome.runtime.sendMessage({ type: 'REQUEST_BADGE_UPDATE' });
}

// ---------------- edit modal logic ----------------
function openEditModal(item) {
  _editingItemId = item.id;
  editTitle.value = item.title || '';
  editUrl.value = item.link || '';
  editCover.value = item.cover || '';
  editTags.value = (item.tags || []).join(', ');
  updateCoverPreview(editCover.value);
  editModal.style.display = 'flex';
  editModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => editTitle.focus(), 50);
  document.addEventListener('keydown', _editModalKeyHandler);
}
function closeEditModal() {
  _editingItemId = null;
  editModal.style.display = 'none';
  editModal.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', _editModalKeyHandler);
}
function _editModalKeyHandler(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeEditModal();
  }
}
function updateCoverPreview(url) {
  if (!url) {
    editCoverPreview.style.display = 'none';
    editCoverPreviewFallback.style.display = 'block';
    editCoverPreview.src = '';
    return;
  }
  editCoverPreviewFallback.style.display = 'none';
  editCoverPreview.style.display = 'block';
  editCoverPreview.src = url;
  editCoverPreview.onerror = () => {
    editCoverPreview.style.display = 'none';
    editCoverPreviewFallback.style.display = 'block';
    editCoverPreview.src = '';
  };
}
editCover.addEventListener('input', () => updateCoverPreview(editCover.value.trim()));
editCancel.addEventListener('click', (e) => { e.preventDefault(); closeEditModal(); });

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!_editingItemId) { closeEditModal(); return; }
  const title = editTitle.value.trim();
  const link = editUrl.value.trim();
  const cover = editCover.value.trim();
  const tags = (editTags.value || '').split(',').map(s => s.trim()).filter(Boolean);
  try {
    const idx = await getIndex();
    const items = idx.items || [];
    const it = items.find(x => x.id === _editingItemId);
    if (!it) { alert('編集対象が見つかりませんでした。'); closeEditModal(); return; }
    it.title = title || it.title || '(無題)';
    it.link = link || it.link || '';
    it.cover = cover || it.cover || '';
    it.tags = tags;
    it.updatedAt = new Date().toISOString();
    idx.items = items;
    idx.updatedAt = new Date().toISOString();
    await setIndex(idx);
    for (const t of tags) await addTagToHistory(t);
    invalidateNormalizedIndex();
    chrome.runtime.sendMessage({ type: 'SYNC_INDEX', index: idx }, () => { });
    await renderShelf();
    await renderNotifyPanel();
    closeEditModal();
    showToast('保存しました', 1500);
  } catch (err) {
    console.error('edit save error', err);
    alert('保存に失敗しました: ' + (err && err.message ? err.message : String(err)));
  }
});

async function openEditModalById(id) {
  const idx = await getIndex();
  const it = (idx.items || []).find(x => x.id === id);
  if (!it) { alert('アイテムが見つかりません'); return; }
  openEditModal(it);
}

// ---------------- backup export/import ----------------
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
exportBtn?.addEventListener('click', async () => {
  const idx = await getIndex();
  downloadJSON(`manga-index-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, idx);
});
importBtn?.addEventListener('click', () => importFile.click());
importFile?.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    const text = await f.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid file');
    if (!Array.isArray(parsed.items)) throw new Error('invalid index format');
    if (!confirm('インポートするとローカルの本棚が上書きされます。続行しますか？')) return;
    await setIndex(parsed);
    for (const it of parsed.items || []) {
      for (const t of (it.tags || [])) await addTagToHistory(t);
    }
    invalidateNormalizedIndex();
    chrome.runtime.sendMessage({ type: 'SYNC_INDEX', index: parsed }, () => { });
    await renderShelf();
    await renderNotifyPanel();
    showToast('インポート完了', 2000);
  } catch (err) {
    showToast('インポートに失敗しました', 3000);
    console.error(err);
  } finally {
    importFile.value = '';
  }
});

// ---------------- notify panel ----------------
async function renderNotifyPanel() {
  const idx = await getIndex();
  const updates = (idx.items || []).filter(i => i.hasUpdate).sort((a, b) => {
    const ta = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0;
    const tb = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0;
    return tb - ta;
  });
  notifyPanel.innerHTML = '';
  if (!updates.length) {
    notifyPanel.innerHTML = '<div class="muted">更新はありません</div>';
    return;
  }
  for (const it of updates.slice(0, 50)) {
    const row = document.createElement('div');
    row.className = 'notify-row';
    row.innerHTML = `
      <div>
        <div class="notify-title">${escapeHtml(it.title)}</div>
        <div class="notify-meta">${it.lastCheckedAt ? new Date(it.lastCheckedAt).toLocaleString() : ''}</div>
      </div>
      <div class="notify-actions">
        <button class="markReadBtn" data-id="${it.id}">既読にする</button>
        <button class="openBtn" data-id="${it.id}">開く</button>
      </div>`;
    notifyPanel.appendChild(row);

    row.querySelector('.markReadBtn').addEventListener('click', async () => {
      await markItemAsSeen(it.id);
      await renderNotifyPanel();
      await renderShelf();
    });
    row.querySelector('.openBtn').addEventListener('click', () => {
      if (it.link) window.open(it.link, '_blank');
    });
  }
}

// ---------------- toast helpers ----------------
function showToast(message, timeout = 3000) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  toastEl.style.display = 'block';
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.style.display = 'none', 200);
  }, timeout);
}
function showToastWithUndo(message, undoCallback, timeout = 5000) {
  if (!toastEl) return;
  toastEl.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = message;
  const btn = document.createElement('button');
  btn.textContent = '元に戻す';
  btn.style.marginLeft = '8px';
  btn.addEventListener('click', async () => {
    try { await undoCallback(); } catch (e) { console.error(e); }
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.style.display = 'none', 200);
  });
  toastEl.appendChild(span);
  toastEl.appendChild(btn);
  toastEl.classList.add('show');
  toastEl.style.display = 'block';
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.style.display = 'none', 200);
  }, timeout);
}

// ---------------- settings modal logic ----------------
function openSettingsModal() {
  if (!settingsModal) return;
  settingsModal.style.display = 'flex';
  settingsModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => settingBatchSize.focus(), 50);
  document.addEventListener('keydown', _settingsKeyHandler);
}
function closeSettingsModal() {
  if (!settingsModal) return;
  settingsModal.style.display = 'none';
  settingsModal.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', _settingsKeyHandler);
}
function _settingsKeyHandler(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeSettingsModal(); }
}
async function loadSettingsToForm() {
  const s = await new Promise(r => chrome.storage.local.get([SETTINGS_KEY, 'uiCompact', 'uiDark'], res => r(res)));
  const settings = s[SETTINGS_KEY] || {};
  const defaults = { batchSize: 10, fetchTimeoutMs: 15000, maxConcurrentFetch: 3, headTimeoutMs: 8000 };
  const batchSize = (typeof settings.batchSize === 'number') ? settings.batchSize : defaults.batchSize;
  const fetchTimeoutMs = (typeof settings.fetchTimeoutMs === 'number') ? settings.fetchTimeoutMs : defaults.fetchTimeoutMs;
  settingBatchSize.value = batchSize;
  settingFetchTimeout.value = fetchTimeoutMs;
  const uiCompactVal = (typeof settings.uiCompact === 'boolean') ? settings.uiCompact : !!s.uiCompact;
  const uiDarkVal = (typeof settings.uiDark === 'boolean') ? settings.uiDark : !!s.uiDark;
  settingUiCompact.checked = uiCompactVal;
  settingUiDark.checked = uiDarkVal;
}
settingsForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const batch = parseInt(settingBatchSize.value, 10);
  const fetchTimeout = parseInt(settingFetchTimeout.value, 10);
  if (!Number.isFinite(batch) || batch < 1 || batch > 200) {
    alert('batchSize は 1〜200 の整数で指定してください。');
    settingBatchSize.focus();
    return;
  }
  if (!Number.isFinite(fetchTimeout) || fetchTimeout < 1000 || fetchTimeout > 60000) {
    alert('fetchTimeoutMs は 1000〜60000 の間のミリ秒で指定してください。');
    settingFetchTimeout.focus();
    return;
  }
  const uiCompactVal = !!settingUiCompact.checked;
  const uiDarkVal = !!settingUiDark.checked;
  const newSettings = {
    batchSize: batch,
    fetchTimeoutMs: fetchTimeout,
    uiCompact: uiCompactVal,
    uiDark: uiDarkVal
  };
  await new Promise(r => chrome.storage.local.set({ [SETTINGS_KEY]: newSettings }, () => r()));
  await new Promise(r => chrome.storage.local.set({ uiCompact: uiCompactVal, uiDark: uiDarkVal }, () => r()));
  document.body.classList.toggle('compact', uiCompactVal);
  document.body.classList.toggle('dark', uiDarkVal);
  chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings: newSettings }, () => { });
  closeSettingsModal();
  showToast('設定を保存しました', 1500);
});
settingsCancel?.addEventListener('click', (e) => { e.preventDefault(); closeSettingsModal(); });
settingsBtn?.addEventListener('click', async () => { await loadSettingsToForm(); openSettingsModal(); });

// ---------------- Empty state & mobile add toggle ----------------
function isMobileWidth() { return window.innerWidth <= 420; }
function collapseAddForm(collapse = true) {
  if (!addForm) return;
  if (collapse) addForm.classList.remove('expanded');
  else addForm.classList.add('expanded');
  addForm.setAttribute('aria-hidden', collapse ? 'true' : 'false');
  if (addToggleBtn) addToggleBtn.setAttribute('aria-pressed', collapse ? 'false' : 'true');
}
if (addToggleBtn) {
  addToggleBtn.addEventListener('click', (e) => {
    const expanded = addForm.classList.contains('expanded');
    collapseAddForm(expanded);
    if (!expanded) {
      const t = document.getElementById('titleInput');
      if (t) setTimeout(() => t.focus(), 80);
    }
  });
}
if (emptyAddBtn) {
  emptyAddBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isMobileWidth()) {
      collapseAddForm(false);
      const t = document.getElementById('titleInput');
      if (t) setTimeout(() => t.focus(), 80);
    } else {
      const t = document.getElementById('titleInput');
      if (t) { t.focus(); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  });
}
window.addEventListener('resize', () => {
  if (isMobileWidth()) collapseAddForm(true);
  else collapseAddForm(false);
});

// ---------------- initialization ----------------
document.addEventListener('DOMContentLoaded', async () => {

  const addForm = document.getElementById('addForm');
  if (addForm) {
    if (window.innerWidth > 420) {
      addForm.classList.add('expanded');
      addForm.setAttribute('aria-hidden', 'false');
      addForm.style.display = ''; // CSS の display を復元
    }
  }
  // 既存の初期化処理を続ける...

  const s = await new Promise(r => chrome.storage.local.get([SORT_KEY], res => r(res[SORT_KEY] || 'manual')));
  if (sortSelect) sortSelect.value = s;

  const favState = await new Promise(r => chrome.storage.local.get([FAVORITE_ONLY_KEY], res => r(res[FAVORITE_ONLY_KEY])));
  favoriteOnly = !!favState;
  if (favToggleBtn) {
    favToggleBtn.setAttribute('aria-pressed', favoriteOnly ? 'true' : 'false');
    favToggleBtn.classList.toggle('active', favoriteOnly);
  }

  const uiPrefs = await new Promise(r => chrome.storage.local.get(['uiCompact', 'uiDark'], res => r(res)));
  if (uiPrefs && uiPrefs.uiCompact) document.body.classList.add('compact');
  if (uiPrefs && uiPrefs.uiDark) document.body.classList.add('dark');

  if (isMobileWidth()) collapseAddForm(true);
  else collapseAddForm(false);

  await ensureFavoritesField();
  await renderShelf();
  await renderNotifyPanel();

  await showTagSuggestionsForInput(tagsInput, tagSuggestions, tagsChips, '');
  await showTagFilterSuggestions('');

  // if (addForm) {
  //   addForm.addEventListener('submit', async (e) => {
  //     e.preventDefault();
  //     const title = titleInput.value.trim();
  //     const url = urlInput.value.trim();
  //     const cover = coverInput.value.trim();
  //     const tags = getChipsFromContainer(tagsChips);
  //     if (!title && !url) { showToast('タイトルまたはURLを入力してください。', 2000); return; }

  //     if (typeof findDuplicatesOptimized === 'function') {
  //       const dup = await findDuplicatesOptimized({ title, url });
  //       const hasUrlDup = dup.urlMatches.length > 0;
  //       const hasExactTitleDup = dup.exactTitleMatches.length > 0;
  //       const hasLevenshtein = dup.levenshteinMatches.length > 0;
  //       const hasPartial = dup.partialMatches.length > 0;
  //       if (hasUrlDup || hasExactTitleDup || hasLevenshtein || hasPartial) {
  //         const proceed = await showDuplicateWarningModal({ title, url, dup });
  //         if (!proceed) return;
  //       }
  //     }

  //     const res = await addMangaWrapper({ title, url, cover, tags });
  //     if (res && res.ok) {
  //       titleInput.value = ''; urlInput.value = ''; coverInput.value = '';
  //       clearChips(tagsChips);
  //       await renderShelf();
  //       await renderNotifyPanel();
  //       showToast('追加しました', 1500);
  //     }
  //   });
  // }

  // デバッグ強化版 addForm submit ハンドラ
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('[DEBUG] addForm submit triggered');

      try {
        const title = (titleInput && titleInput.value) ? titleInput.value.trim() : '';
        const url = (urlInput && urlInput.value) ? urlInput.value.trim() : '';
        const cover = (coverInput && coverInput.value) ? coverInput.value.trim() : '';
        const tags = (tagsChips) ? getChipsFromContainer(tagsChips) : [];

        console.log('[DEBUG] form values', { title, url, cover, tags });

        if (!title && !url) {
          showToast('タイトルまたはURLを入力してください。', 2000);
          return;
        }

        // 重複チェックがある場合はログを出す
        if (typeof findDuplicatesOptimized === 'function') {
          const dup = await findDuplicatesOptimized({ title, url });
          console.log('[DEBUG] duplicate check result', dup);
          const hasDup = dup.urlMatches.length || dup.exactTitleMatches.length || dup.levenshteinMatches.length || dup.partialMatches.length;
          if (hasDup) {
            // 既存のモーダルを表示する前にログ
            console.log('[DEBUG] duplicates found, showing modal');
            const proceed = await showDuplicateWarningModal({ title, url, dup });
            console.log('[DEBUG] duplicate modal proceed:', proceed);
            if (!proceed) return;
          }
        }

        const res = await addMangaWrapper({ title, url, cover, tags });
        console.log('[DEBUG] addMangaWrapper result', res);

        if (res && res.ok) {
          titleInput.value = ''; urlInput.value = ''; coverInput.value = '';
          clearChips(tagsChips);
          await renderShelf();
          await renderNotifyPanel();
          showToast('追加しました', 1500);
        } else {
          console.warn('[DEBUG] addMangaWrapper returned not-ok', res);
          showToast('追加に失敗しました', 2500);
        }
      } catch (err) {
        console.error('[DEBUG] addForm submit error', err);
        showToast('エラーが発生しました。コンソールを確認してください。', 3000);
      }
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', async (e) => {
      await new Promise(r => chrome.storage.local.set({ [SORT_KEY]: e.target.value }, () => r()));
      await renderShelf();
    });
  }

  if (triggerCheckBtn) {
    triggerCheckBtn.addEventListener('click', async () => {
      chrome.runtime.sendMessage({ type: 'TRIGGER_UPDATE_CHECK' }, () => {
        triggerCheckBtn.textContent = 'チェック中';
        setTimeout(() => triggerCheckBtn.textContent = 'チェック', 1500);
      });
    });
  }

  if (favToggleBtn) {
    favToggleBtn.addEventListener('click', async () => {
      favoriteOnly = !favoriteOnly;
      favToggleBtn.setAttribute('aria-pressed', favoriteOnly ? 'true' : 'false');
      favToggleBtn.classList.toggle('active', favoriteOnly);
      await new Promise(r => chrome.storage.local.set({ [FAVORITE_ONLY_KEY]: favoriteOnly }, () => r()));
      await renderShelf();
    });
  }

  searchInput?.addEventListener('input', async (e) => {
    window.__shelfSearchQuery = (e.target.value || '').trim().toLowerCase();
    await renderShelf();
  });

  showTagSuggestionsForInput(tagsInput, tagSuggestions, tagsChips, '');
  showTagFilterSuggestions('');

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[INDEX_KEY]) {
      showTagSuggestionsForInput(tagsInput, tagSuggestions, tagsChips, '');
      showTagFilterSuggestions('');
      renderNotifyPanel();
      renderShelf();
    }
    if (area === 'local' && changes[TAG_HISTORY_KEY]) {
      showTagSuggestionsForInput(tagsInput, tagSuggestions, tagsChips, '');
      showTagFilterSuggestions('');
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'UPDATE_DETECTED') {
      if (msg.index) {
        chrome.storage.local.set({ [INDEX_KEY]: msg.index }, async () => {
          await renderNotifyPanel();
          await renderShelf();
        });
      } else {
        renderNotifyPanel();
        renderShelf();
      }
    }
  });
});

// ---------------- helpers ----------------
async function ensureFavoritesField() {
  const idx = await getIndex();
  let changed = false;
  idx.items = (idx.items || []).map(it => {
    if (typeof it.favorite === 'undefined') { it.favorite = false; changed = true; }
    return it;
  });
  if (changed) {
    idx.updatedAt = new Date().toISOString();
    await setIndex(idx);
    invalidateNormalizedIndex();
    chrome.runtime.sendMessage({ type: 'SYNC_INDEX', index: idx }, () => { });
  }
}

// expose helpers for debugging
window.getIndex = getIndex;
window.setIndex = setIndex;
window.addTagToHistory = addTagToHistory;