// virtual-list.js - v1.2.0 仮想スクロール実装
// 大量のアイテムをスムーズに表示するための高性能リスト

// ============================================================
// VirtualList クラス
// ============================================================

class VirtualList {
  /**
   * VirtualList コンストラクタ
   * @param {Object} options - 設定オブジェクト
   * @param {HTMLElement} options.container - コンテナ要素
   * @param {HTMLElement} options.listElement - ul/ol 要素
   * @param {Array} options.items - 表示するアイテム配列
   * @param {Function} options.renderItem - アイテム描画関数
   * @param {number} options.itemHeight - 各アイテムの高さ（px）
   * @param {number} options.bufferSize - バッファサイズ（デフォルト: 5）
   * @param {number} options.throttleMs - スクロール節流時間（デフォルト: 16ms）
   */
  constructor(options) {
    this.container = options.container;
    this.listElement = options.listElement;
    this.items = options.items || [];
    this.renderItem = options.renderItem;
    this.itemHeight = options.itemHeight || 80;
    this.bufferSize = options.bufferSize || 5;
    this.throttleMs = options.throttleMs || 16;

    // 内部状態
    this.visibleStart = 0;
    this.visibleEnd = 0;
    this.containerHeight = 0;
    this.scrollTop = 0;
    this.renderedStart = -1;
    this.renderedEnd = -1;
    this.lastScrollTime = 0;
    this.scrollScheduled = false;

    // パフォーマンス計測用
    this.stats = {
      totalRenders: 0,
      lastRenderMs: 0,
      visibleCount: 0
    };

    this.init();
  }

  /**
   * 初期化処理
   */
  init() {
    console.log('[VL] VirtualList initialized:', {
      itemCount: this.items.length,
      itemHeight: this.itemHeight,
      bufferSize: this.bufferSize
    });

    // コンテナの高さ取得
    this.updateContainerHeight();

    // イベントリスナー登録
    this.attachEventListeners();

    // 初期レンダリング
    this.render();
  }

  /**
   * コンテナ高さを更新
   */
  updateContainerHeight() {
    const rect = this.container.getBoundingClientRect();
    this.containerHeight = rect.height || this.container.clientHeight;
    console.log('[VL] Container height:', this.containerHeight);
  }

  /**
   * イベントリスナー登録
   */
  attachEventListeners() {
    // スクロールイベント（節流）
    this.container.addEventListener('scroll', () => this.onScroll());

    // リサイズイベント
    window.addEventListener('resize', () => this.onResize());

    // Intersection Observer でビューポート内の要素を監視（オプション）
    // this.setupIntersectionObserver();
  }

  /**
   * スクロールイベントハンドラ
   */
  onScroll() {
    const now = Date.now();
    if (now - this.lastScrollTime < this.throttleMs) {
      if (!this.scrollScheduled) {
        this.scrollScheduled = true;
        requestAnimationFrame(() => {
          this.handleScroll();
          this.scrollScheduled = false;
        });
      }
      return;
    }

    this.handleScroll();
    this.lastScrollTime = now;
  }

  /**
   * スクロール処理（実際の計算）
   */
  handleScroll() {
    this.scrollTop = this.container.scrollTop;
    this.updateVisibleRange();
    this.render();
  }

  /**
   * リサイズイベントハンドラ
   */
  onResize() {
    this.updateContainerHeight();
    this.updateVisibleRange();
    this.render();
  }

  /**
   * 表示範囲を計算
   */
  updateVisibleRange() {
    const scrollTop = this.scrollTop;
    const containerHeight = this.containerHeight;

    // ビューポート内に表示される最初と最後のアイテムインデックス
    this.visibleStart = Math.max(0, Math.floor(scrollTop / this.itemHeight));
    this.visibleEnd = Math.min(
      this.items.length,
      Math.ceil((scrollTop + containerHeight) / this.itemHeight)
    );

    this.stats.visibleCount = this.visibleEnd - this.visibleStart;
  }

  /**
   * レンダリング（メイン処理）
   */
  render() {
    const renderStart = Date.now();

    // バッファを含めた範囲を計算
    const bufferStart = Math.max(0, this.visibleStart - this.bufferSize);
    const bufferEnd = Math.min(this.items.length, this.visibleEnd + this.bufferSize);

    // 既にレンダリング済みのアイテムが重なっている場合はスキップ
    if (this.renderedStart === bufferStart && this.renderedEnd === bufferEnd) {
      return;
    }

    console.log('[VL] Rendering range:', {
      bufferStart,
      bufferEnd,
      visibleStart: this.visibleStart,
      visibleEnd: this.visibleEnd
    });

    // オフセット計算（スクロール位置に応じた padding）
    const offsetY = bufferStart * this.itemHeight;

    // リスト内部を更新
    this.listElement.innerHTML = '';

    // spacer: 最初のオフセット
    if (offsetY > 0) {
      const spacerTop = document.createElement('li');
      spacerTop.style.height = offsetY + 'px';
      spacerTop.setAttribute('aria-hidden', 'true');
      this.listElement.appendChild(spacerTop);
    }

    // 各アイテムをレンダリング
    for (let i = bufferStart; i < bufferEnd; i++) {
      const item = this.items[i];
      if (!item) continue;

      const li = this.renderItem(item, i);
      if (li) {
        this.listElement.appendChild(li);
      }
    }

    // spacer: 最後のオフセット
    const remainingHeight = Math.max(0, (this.items.length - bufferEnd) * this.itemHeight);
    if (remainingHeight > 0) {
      const spacerBottom = document.createElement('li');
      spacerBottom.style.height = remainingHeight + 'px';
      spacerBottom.setAttribute('aria-hidden', 'true');
      this.listElement.appendChild(spacerBottom);
    }

    // 状態更新
    this.renderedStart = bufferStart;
    this.renderedEnd = bufferEnd;

    // パフォーマンス計測
    const renderTime = Date.now() - renderStart;
    this.stats.totalRenders++;
    this.stats.lastRenderMs = renderTime;

    console.log('[VL] Render completed:', {
      renderTime: renderTime + 'ms',
      itemsRendered: bufferEnd - bufferStart,
      totalRenders: this.stats.totalRenders
    });
  }

  /**
   * アイテム配列を更新
   * @param {Array} newItems - 新しいアイテム配列
   */
  updateItems(newItems) {
    this.items = newItems || [];
    this.visibleStart = 0;
    this.visibleEnd = 0;
    this.renderedStart = -1;
    this.renderedEnd = -1;
    this.scrollTop = 0;

    console.log('[VL] Items updated:', this.items.length);

    this.updateVisibleRange();
    this.render();
  }

  /**
   * スクロール位置をリセット
   */
  scrollToTop() {
    this.container.scrollTop = 0;
    this.handleScroll();
  }

  /**
   * 特定のインデックスまでスクロール
   * @param {number} index - スクロール対象のインデックス
   */
  scrollToIndex(index) {
    const targetScrollTop = index * this.itemHeight;
    this.container.scrollTop = targetScrollTop;
    this.handleScroll();
  }

  /**
   * 特定の要素までスクロール（スムーズ）
   * @param {number} index - スクロール対象のインデックス
   */
  scrollToIndexSmooth(index) {
    const targetScrollTop = index * this.itemHeight;
    this.container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    return {
      ...this.stats,
      totalItems: this.items.length,
      memoryUsageMb: this.estimateMemoryUsage()
    };
  }

  /**
   * メモリ使用量を推定（デバッグ用）
   */
  estimateMemoryUsage() {
    // 簡易推定: リスト内 DOM ノード数 * 平均サイズ
    const nodeCount = this.listElement.children.length;
    const estimatedKb = (nodeCount * 2) / 1024; // 大ざっぱな推定値
    return estimatedKb;
  }

  /**
   * デバッグ用：統計をコンソール出力
   */
  printStats() {
    const stats = this.getStats();
    console.table(stats);
  }

  /**
   * クリーンアップ（メモリ解放）
   */
  destroy() {
    this.container.removeEventListener('scroll', () => this.onScroll());
    window.removeEventListener('resize', () => this.onResize());
    this.listElement.innerHTML = '';
    this.items = [];
    console.log('[VL] VirtualList destroyed');
  }
}

// ============================================================
// ファクトリ関数（popup.js との統合用）
// ============================================================

/**
 * 本棚リストに仮想スクロールを適用
 * @param {Object} options - VirtualList オプション
 */
function createShelfVirtualList(options) {
  const defaultOptions = {
    container: document.querySelector('.shelf-list'),
    listElement: document.getElementById('shelfList'),
    items: options.items || [],
    itemHeight: 80, // shelf-item の高さ
    bufferSize: 5,
    throttleMs: 16,
    renderItem: (item, index) => {
      // popup.js の renderShelf() と同等の処理
      const li = document.createElement('li');
      li.className = 'shelf-item' + (item.hasUpdate ? ' updated' : '');
      li.dataset.id = item.id;

      const thumbHtml = item.cover
        ? `<img class="thumb" src="${escapeHtml(item.cover)}" alt="">`
        : `<div class="thumb" aria-hidden="true"></div>`;

      const tagsHtml = (item.tags || [])
        .slice(0, 5)
        .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
        .join('');

      const favHtml = `<div class="fav"><button class="favBtn ${
        item.favorite ? 'fav-on' : 'fav-off'
      }" data-id="${item.id}" aria-pressed="${item.favorite ? 'true' : 'false'}">${
        item.favorite ? '★' : '☆'
      }</button></div>`;

      li.innerHTML = `
        <span class="handle" aria-hidden="true">≡</span>
        ${thumbHtml}
        <div class="title-wrap">
          <div class="title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="meta">${item.pageTitle ? escapeHtml(item.pageTitle) : ''}${
        item.lastCheckedAt ? ' • ' + new Date(item.lastCheckedAt).toLocaleString() : ''
      }</div>
          <div class="tag-list">${tagsHtml}</div>
        </div>
        ${favHtml}
        <div class="actions" aria-hidden="true">
          <button class="openBtn" data-id="${item.id}" aria-label="開く">開く</button>
          <button class="editBtn" data-id="${item.id}" aria-label="編集">編集</button>
          <button class="delBtn" data-id="${item.id}" aria-label="削除">削除</button>
        </div>`;

      return li;
    }
  };

  const mergedOptions = { ...defaultOptions, ...options };
  return new VirtualList(mergedOptions);
}

// ============================================================
// Intersection Observer による最適化（オプション）
// ============================================================

/**
 * Intersection Observer でビューポート内の画像を遅延読み込み
 */
function setupLazyLoadingImages() {
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
          console.log('[VL] Image lazy loaded:', src);
        }
      }
    });
  }, {
    rootMargin: '50px' // ビューポートの50px前に読み込み開始
  });

  return imageObserver;
}

// ============================================================
// グローバル公開（デバッグ用）
// ============================================================

window.VirtualList = VirtualList;
window.createShelfVirtualList = createShelfVirtualList;
window.setupLazyLoadingImages = setupLazyLoadingImages;

console.log('[VL] virtual-list.js v1.2.0 loaded');