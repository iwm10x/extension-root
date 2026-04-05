// content-script.js - v1.2.0 ページメタデータ抽出
// ページ上のメタ情報（タイトル・URL・画像）を抽出して popup に提供

// ============================================================
// ユーティリティ関数
// ============================================================

/**
 * OGP タグからメタデータを取得
 * Open Graph Protocol (og:title, og:image など) に対応
 */
function extractOGMetadata() {
  const metadata = {};

  // og:title
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) metadata.title = ogTitle.getAttribute('content');

  // og:image
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) metadata.image = ogImage.getAttribute('content');

  // og:description
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription) metadata.description = ogDescription.getAttribute('content');

  return metadata;
}

/**
 * Twitter Card からメタデータを取得
 * Twitter Card (twitter:title, twitter:image など) に対応
 */
function extractTwitterMetadata() {
  const metadata = {};

  // twitter:title
  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  if (twitterTitle) metadata.title = twitterTitle.getAttribute('content');

  // twitter:image
  const twitterImage = document.querySelector('meta[name="twitter:image"]');
  if (twitterImage) metadata.image = twitterImage.getAttribute('content');

  // twitter:description
  const twitterDescription = document.querySelector('meta[name="twitter:description"]');
  if (twitterDescription) metadata.description = twitterDescription.getAttribute('content');

  return metadata;
}

/**
 * 標準メタタグからメタデータを取得
 * description, keywords, viewport など
 */
function extractStandardMetadata() {
  const metadata = {};

  // title
  const titleTag = document.querySelector('title');
  if (titleTag) metadata.title = titleTag.textContent.trim();

  // description
  const description = document.querySelector('meta[name="description"]');
  if (description) metadata.description = description.getAttribute('content');

  // image: first img tag
  const firstImg = document.querySelector('img');
  if (firstImg) {
    const src = firstImg.getAttribute('src');
    if (src) {
      // 相対URLを絶対URLに変換
      metadata.image = new URL(src, window.location.href).href;
    }
  }

  return metadata;
}

/**
 * ページの最初のメイン画像を取得
 * hero image や大きな画像を優先
 */
function extractLargeImage() {
  const images = document.querySelectorAll('img');
  let largestImg = null;
  let largestArea = 0;

  for (const img of images) {
    if (!img.src || img.src.includes('data:')) continue;
    if (img.naturalWidth === 0 || img.naturalHeight === 0) continue;

    const area = img.naturalWidth * img.naturalHeight;
    if (area > largestArea) {
      largestArea = area;
      largestImg = img;
    }
  }

  if (largestImg) {
    try {
      return new URL(largestImg.src, window.location.href).href;
    } catch (e) {
      console.warn('[CS] Invalid image URL:', largestImg.src);
      return null;
    }
  }

  return null;
}

/**
 * メタデータを統合（優先順位: OGP > Twitter > Standard）
 */
function mergeMetadata(ogData, twitterData, standardData) {
  const merged = {
    title: ogData.title || twitterData.title || standardData.title || '',
    image: ogData.image || twitterData.image || standardData.image || '',
    description: ogData.description || twitterData.description || standardData.description || '',
    url: window.location.href
  };

  // 画像がない場合、大きな画像を探す
  if (!merged.image) {
    merged.image = extractLargeImage() || '';
  }

  return merged;
}

/**
 * 絶対URLに変換
 */
function toAbsoluteUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return window.location.protocol + ':' + url;
  if (url.startsWith('/')) return new URL(url, window.location.origin).href;
  return new URL(url, window.location.href).href;
}

/**
 * ページメタデータを取得（メイン処理）
 */
function getPageMetadata() {
  try {
    console.log('[CS] Extracting page metadata...');

    const ogData = extractOGMetadata();
    const twitterData = extractTwitterMetadata();
    const standardData = extractStandardMetadata();

    const metadata = mergeMetadata(ogData, twitterData, standardData);

    // URL確保
    if (!metadata.url) {
      metadata.url = window.location.href;
    }

    // 相対URLを絶対URLに変換
    if (metadata.image) {
      metadata.image = toAbsoluteUrl(metadata.image);
    }

    console.log('[CS] Extracted metadata:', metadata);
    return metadata;
  } catch (e) {
    console.error('[CS] Error extracting metadata:', e);
    return {
      title: document.title || '',
      url: window.location.href,
      image: '',
      description: ''
    };
  }
}

// ============================================================
// Runtime Message Handler
// ============================================================

/**
 * popup.js からのメッセージを処理
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message || !message.type) {
      console.warn('[CS] Invalid message received');
      sendResponse({ ok: false, error: 'Invalid message' });
      return;
    }

    console.log('[CS] Message received:', message.type);

    if (message.type === 'GET_PAGE_METADATA') {
      const metadata = getPageMetadata();
      sendResponse({ ok: true, ...metadata });
      return true; // async
    }

    sendResponse({ ok: false, error: 'Unknown message type' });
  } catch (e) {
    console.error('[CS] Message handler error:', e);
    sendResponse({ ok: false, error: e.message });
  }
});

// ============================================================
// ページロード検出（将来の拡張用）
// ============================================================

/**
 * ページが読み込まれたときにメタデータをキャッシュ
 * 将来的に background.js でのみ使用される可能性あり
 */
let cachedMetadata = null;

document.addEventListener('DOMContentLoaded', () => {
  console.log('[CS] DOMContentLoaded, caching metadata');
  cachedMetadata = getPageMetadata();
});

// ページが完全に読み込まれた後にもキャッシュを更新
window.addEventListener('load', () => {
  console.log('[CS] Page fully loaded, updating cached metadata');
  cachedMetadata = getPageMetadata();
});

// ============================================================
// ユーティリティ（グローバル公開・デバッグ用）
// ============================================================

/**
 * デバッグ用グローバルオブジェクト
 */
window.debugContentScript = {
  getPageMetadata,
  extractOGMetadata,
  extractTwitterMetadata,
  extractStandardMetadata,
  extractLargeImage,
  getCachedMetadata: () => cachedMetadata
};

console.log('[CS] content-script.js v1.2.0 loaded');