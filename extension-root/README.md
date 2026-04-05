# マンガ本棚 - Chrome 拡張機能

**v1.2.0** | 最終更新: 2026-04-05

> 好きなマンガサイトを「本棚」に登録し、定期的に更新をチェック。新作を見逃さない、賢いマンガ管理ツール。

## 📚 概要

**マンガ本棚**は、Chrome 拡張機能としてマンガやウェブコンテンツを効率的に管理するためのツールです。

### 主な特徴

- ✨ **ワンクリック自動取得** - ページ情報を自動抽出・入力
- 🔄 **定期更新チェック** - バックグラウンドで自動監視
- ☁️ **Google Drive 同期** - クラウド対応、複数デバイス同期
- 🏷️ **タグ管理** - 履歴ベースのオートコンプリート
- 🔍 **スマート検索** - タイトル・タグで即座に検索
- 📊 **重複検出** - URL・タイトル・類似度で自動判定
- 💾 **バックアップ** - JSON エクスポート/インポート
- 🎨 **ダークモード** - コンパクト表示対応

---

## 🎯 目次

- [機能一覧](#-機能一覧)
- [インストール](#-インストール)
- [セットアップ](#-セットアップ)
- [使い方](#-使い方)
- [ファイル構成](#-ファイル構成)
- [開発ガイド](#-開発ガイド)
- [トラブルシューティング](#-トラブルシューティング)
- [ライセンス](#-ライセンス)

---

## 🚀 機能一覧

### 本棚管理

| 機能 | 説明 | v1.0 | v1.2.0 |
|------|------|------|--------|
| **追加** | マンガを本棚に追加 | ✅ | ✅ |
| **自動取得** | ページ情報自動抽出 | ❌ | ✨ |
| **編集** | アイテム情報を編集 | ✅ | ✅ |
| **削除** | アイテムを削除（Undo対応） | ✅ | ✅ |
| **ドラッグ&ドロップ** | 順序変更 | ✅ | ✅ |

### タグ・検索

| 機能 | 説明 | v1.0 | v1.2.0 |
|------|------|------|--------|
| **タグ追加** | カンマ区切りで複数タグ追加 | ✅ | ✅ |
| **タグサジェスト** | 過去使用タグを提案 | ✅ | ✅ |
| **タグフィルター** | タグで絞り込み | ✅ | ✅ |
| **検索** | タイトル・タグで検索 | ✅ | ✅ |
| **お気に入り** | 星マークで優先表�� | ✅ | ✅ |

### 更新チェック

| 機能 | 説明 | v1.0 | v1.2.0 |
|------|------|------|--------|
| **定期チェック** | 15分ごとに自動チェック | ✅ | ✅ |
| **HEAD リクエスト** | ETag/Last-Modified 確認 | ✅ | ✅ |
| **本文ハッシュ比較** | SHA-1 でコンテンツ変化検出 | ✅ | ✅ |
| **バッチ処理** | 複数同時チェック | ✅ | ✅ |
| **タイムアウト対応** | Network タイムアウト対応 | ✅ | ✨ |

### Google Drive 同期

| 機能 | 説明 | v1.0 | v1.2.0 |
|------|------|------|--------|
| **同期** | Drive に保存・同期 | ✅ | ✅ |
| **appDataFolder** | ユーザーが見えない領域に保存 | ✅ | ✅ |
| **マージ機能** | ローカル・リモート自動マージ | ✅ | ✨ |
| **OAuth 確認** | 設定確認・エラー回避 | ❌ | ✨ |
| **API タイムアウト** | Drive API 無限待機を防止 | ❌ | ✨ |

### バックアップ

| 機能 | 説明 | v1.0 | v1.2.0 |
|------|------|------|--------|
| **エクスポート** | JSON でバックアップ | ✅ | ✅ |
| **インポート** | JSON からリストア | ✅ | ✅ |

### UI・UX

| 機能 | 説明 | v1.0 | v1.2.0 |
|------|------|------|--------|
| **スケルトン** | ローディング表示 | ✅ | ✅ |
| **Empty State** | 空の状態表示 | ✅ | ✅ |
| **トースト通知** | 画面右下に通知 | ✅ | ✅ |
| **ダークモード** | 暗いテーマ | ✅ | ✨ |
| **コンパクト表示** | 小さいサイズ表示 | ✅ | ✨ |
| **ローディング表示** | 自動取得時の状態 | ❌ | ✨ |

### 設定

| 設定項目 | デフォルト | 範囲 | 説明 |
|---------|----------|------|------|
| **チェック周期** | 15分 | - | 定期チェックの間隔 |
| **バッチサイズ** | 10 | 1-200 | 1回のチェックで処理するアイテム数 |
| **タイムアウト** | 15秒 | 1-60秒 | ページ取得のタイムアウト |
| **並列数** | 3 | - | 同時実行チェック数 |
| **コンパクト表示** | OFF | - | 小さいサイズ表示 |
| **ダークモード** | OFF | - | 暗いテーマ |
| **自動取得** | OFF | - | ✨ ページ情報自動取得 |

---

## 📥 インストール

### 環境要件

- Google Chrome 88 以上
- Google アカウント（Drive 同期を使う場合）

### インストール手順

#### 1️⃣ Chrome にロード

```bash
# リポジトリをクローン
git clone https://github.com/iwm10x/extension-root.git
cd extension-root

# Chrome を起動して以下にアクセス
# chrome://extensions

# デベロッパーモードをON（右上）
# → 「パッケージ化されていない拡張機能を読み込む」
# → extension-root/extension-root/ を選択
```

#### 2️⃣ Google Drive 同期を有効化（オプション）

```bash
# manifest.json で OAuth Client ID を設定
{
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/drive.appdata",
      "https://www.googleapis.com/auth/drive.file"
    ]
  }
}

# YOUR_CLIENT_ID は Google Cloud Console で取得
# https://console.cloud.google.com/
```

---

## 🔧 セットアップ

### Google Cloud Console での認証設定

#### ステップ 1: プロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成
3. プロジェクト名: `MangaSelfShelf` など

#### ステップ 2: Google Drive API を有効化

1. 左メニュー → 「API とサービス」
2. 「API を有効化」ボタンをクリック
3. `Google Drive API` を検索・選択
4. 「有効にする」をクリック

#### ステップ 3: OAuth 認証情報を作成

1. 「認証情報を作成」
2. アプリケーションの種類: **Chrome App**
3. リダイレクト URI:
   ```
   https://your-extension-id.chromiumapp.org/
   ```
   ※ 拡張機能ID は Chrome の `chrome://extensions/` で確認可能

#### ステップ 4: Client ID をコピー

1. 作成した認証情報から Client ID をコピー
2. `manifest.json` の `client_id` に貼り付け

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com"
}
```

#### ステップ 5: 拡張機能をリロード

```
chrome://extensions → マンガ本棚 → リロードボタン
```

---

## 📖 使い方

### 基本的な流れ

#### 1️⃣ マンガを追加

```
① ポップアップを開く
② 「マンガを追加」セクションで情報入力
  ✨ 自動取得ボタンでページ情報を自動抽出
③ タグを追加（カンマ区切り）
④ 「追加」をクリック
```

#### 2️⃣ タグで整理

```
① ポップアップを開く
② 「タグで絞り込み」にタグ名を入力
③ 関連マンガが自動フィルター
```

#### 3️⃣ 更新をチェック

```
① 手動チェック: ポップアップの「チェック」ボタン
② 自動チェック: 15分ごとに自動実行
③ バッジに未読件数が表示
```

#### 4️⃣ 更新を確認

```
① ポップアップの「更新あり」セクション
② 「既読にする」または「開く」をクリック
③ 新しい話をチェック
```

### 詳細な機能

#### 🔍 検索

```
① 検索ボックスにキーワードを入力
② タイトル・タグから即座に検索
③ クリアボタンで検索をリセット
```

#### ⭐ お気に入り

```
① アイテムのホバー時に表示される☆ボタンをクリック
② 星が★に変わる
③ 「お気に入り優先」ソートで最上部に表示
```

#### ✏️ 編集

```
① アイテムの「編集」ボタンをクリック
② タイトル・URL・タグを修正
③ 「保存」をクリック
```

#### 🗑️ 削除

```
① アイテムの「削除」ボタン
② 確認ダイアログで「OK」
③ 「元に戻す」トースト表示（5秒以内なら復元可能）
```

#### 📤 エクスポート / インポート

```
エクスポート:
① 「エクスポート」ボタン
② JSON ファイルをダウンロード
③ バックアップ完了

インポート:
① 「インポート」ボタン
② 事前に保存した JSON ファイルを選択
③ 確認ダイアログで「OK」
④ リスト上書き完了
```

#### ⚙️ 設定

```
① ポップアップの「⚙️」ボタン
② バッチサイズ・タイムアウト・UI設定を調整
③ 「保存」をクリック
```

---

## 📁 ファイル構成

```
extension-root/
├── manifest.json              # 拡張機能定義
├── popup.html                 # ✨ v1.2.0 自動取得ボタン・フォーム改善
├── popup.css                  # ✨ v1.2.0 レイアウト・アニメーション向上
├── popup.js                   # ✨ v1.2.0 自動取得・フォームクリア機能
├── background.js              # ✨ v1.2.0 Drive API タイムアウト対応
├── content-script.js          # ✨ v1.2.0 NEW ページメタデータ抽出
├── virtual-list.js            # ✨ v1.2.0 NEW 大量アイテム対応（オプション）
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── assets/                    # 画像・その他リソース
└── README.md                  # このファイル
```

### ファイル説明

| ファイル | 説明 | 行数 | サイズ |
|---------|------|------|--------|
| **manifest.json** | Chrome 拡張定義 | ~60 | 1.2 KB |
| **popup.html** | UI マークアップ | 287 | 13.5 KB |
| **popup.css** | スタイルシート | 1,050 | 19.2 KB |
| **popup.js** | UI ロジック | 1,400+ | 55 KB |
| **background.js** | Service Worker | 570+ | 21.5 KB |
| **content-script.js** | ✨ メタデータ抽出 | 250+ | 6.5 KB |
| **virtual-list.js** | ✨ 仮想スクロール | 350+ | 9.5 KB |

---

## 🛠️ 開発ガイド

### 開発環境セットアップ

```bash
# 1. リポジトリをクローン
git clone https://github.com/iwm10x/extension-root.git
cd extension-root/extension-root

# 2. Chrome でロード（chrome://extensions）
#    デベロッパーモード → パッケージ化されていない拡張機能を読み込む

# 3. コード編集後、拡張機能をリロード
```

### デバッグ方法

#### popup.js のデバッグ

```javascript
// ブラウザコンソール（popup で F12）
window.getIndex();                    // インデックスを取得
window.setIndex(idx);                 // インデックスを保存
window.fetchPageMetadata();           // ページ情報を取得
window.showToast('message', 2000);    // トースト表示
```

#### background.js のデバッグ

```javascript
// Service Worker コンソール
// chrome://extensions → マンガ本棚 → Service Worker をクリック

window.debugBackgroundJs.getStorage('index');           // インデックス取得
window.debugBackgroundJs.processBatch(0, 10, settings); // バッチテスト
window.debugBackgroundJs.isOAuthConfigured();           // OAuth 確認
```

#### content-script.js のデバッグ

```javascript
// ページのコンソール
window.debugContentScript.getPageMetadata();    // メタデータ抽出テスト
window.debugContentScript.getCachedMetadata();  // キャッシュ確認
```

### 主要な関数

#### popup.js

| 関数 | 説明 |
|------|------|
| `renderShelf()` | 本棚を描画 |
| `addMangaWrapper()` | マンガを追加 |
| `fetchPageMetadata()` | ✨ ページ情報を自動取得 |
| `openEditModal()` | 編集モーダルを開く |
| `removeItemByIdWithUndo()` | 削除（Undo対応） |

#### background.js

| 関数 | 説明 |
|------|------|
| `processBatch()` | バッチ更新チェック |
| `checkItemForUpdate()` | 1 アイテムをチェック |
| `findIndexFile()` | Drive から index.json を検索 |
| `mergeIndex()` | ✨ ローカル・リモートをマージ |
| `isOAuthConfigured()` | ✨ OAuth 設定を確認 |

#### content-script.js

| 関数 | 説明 |
|------|------|
| `getPageMetadata()` | ✨ ページメタデータ抽出 |
| `extractOGMetadata()` | OGP タグ抽出 |
| `extractTwitterMetadata()` | Twitter Card 抽出 |
| `extractStandardMetadata()` | 標準タグ抽出 |

### パフォーマンス最適化

#### 大量アイテムの場合

```javascript
// 1. virtual-list.js を使用
import { createShelfVirtualList } from './virtual-list.js';

const virtualList = createShelfVirtualList({
  items: largeItemArray,
  itemHeight: 80
});

// 2. バッチサイズを調整
// 設定 → バッチサイズを 5-20 に変更

// 3. タイムアウトを延長
// 設定 → タイムアウトを 20000ms に変更
```

#### Drive API のタイムアウト

```javascript
// background.js で設定
const DRIVE_API_TIMEOUT = 30000; // 30秒
```

---

## ⚠️ トラブルシューティング

### Q1: 「ページ情報を取得できない」

**原因:**
- CORS エラー（クロスオリジンリクエスト制限）
- ページが AJAX で動的読み込みしている

**対策:**
```
① content-script.js が読み込まれているか確認
   chrome://extensions → マンガ本棚 → 詳細 → コンテンツスクリプト

② マニュアル入力で対応
   「自動取得」がうまくいかない場合は手入力
```

### Q2: 「Drive 同期が失敗する」

**原因:**
- OAuth Client ID が設定されていない
- ネットワークエラー
- 401 Unauthorized

**対策:**
```
① manifest.json の client_id を確認
   <YOUR_OAUTH_CLIENT_ID> のままでないか

② Google Cloud Console で認証情報を再作成
   → リダイレクト URI を確認
   → Client ID をコピーし直す

③ キャッシュをクリア
   chrome://extensions → マンガ本棚 → 詳細 → キャッシュをクリア
```

### Q3: 「更新チェックが遅い」

**原因:**
- バッチサイズが大きい
- ネットワークが遅い
- サイトのレスポンスが遅い

**対策:**
```
① 設定でバッチサイズを減らす
   バッチサイズ: 10 → 5

② タイムアウトを延長
   タイムアウト: 15000ms → 20000ms

③ 並列数を調整
   background.js: maxConcurrentFetch = 2
```

### Q4: 「重複警告が多すぎる」

**原因:**
- タイトルが似ている
- Levenshtein 距離の閾値が低い

**対策:**
```
① 「続けて追加する」で追加完了
② 重複警告は安全機能なので有用
```

### Q5: 「ダークモード表示が崩れている」

**原因:**
- CSS 変数が反映されていない
- ブラウザキャッシュ

**対策:**
```
① 拡張機能をリロード
② キャッシュをクリア
   popup.css で dark mode セレクタを確認
```

### Q6: 「コンパクト表示が反映されない」

**原因:**
- 設定保存に失敗
- Chrome のストレージ制限

**対策:**
```
① ストレージ使用状況を確認
② キャッシュをクリア
③ 再度設定を保存
```

---

## 📊 バージョン履歴

### v1.2.0 (2026-04-05) ✨ 最新

**新機能:**
- ✨ ページ情報自動取得（content-script.js）
- ✨ フォーム内カバープレビュー
- ✨ フォームクリアボタン
- ✨ ローディング表示
- ✨ 仮想スクロール（virtual-list.js オプション）
- ✨ OAuth 設定確認
- ✨ Drive API タイムアウト対応
- ✨ 改善されたエラーログ

**改善:**
- UI/UX の向上（モーダルアニメーション）
- アクセシビリティ強化
- パフォーマンス最適化
- エラーハンドリング向上

### v1.1.1 (2024-11-15)

**修正:**
- sendMessage 安全化
- タイムアウト処理改善

### v1.0.0 (2024-10-01)

**初期リリース:**
- 本棚管理機能
- 更新チェック機能
- Google Drive 同期
- タグ・検索機能

---

## 🤝 貢献

バグ報告・機能リクエスト・プルリクエストを歓迎します。

```bash
# 開発ブランチで作業
git checkout -b feature/your-feature

# コミット
git commit -m "feat: Add your feature"

# プッシュ
git push origin feature/your-feature

# Pull Request を作成
```

### 開発のルール

- `popup.js`, `background.js` は同期テストを実施
- 新機能は `popup.html`, `popup.css` の更新を含める
- コンソールログは `[BG]`, `[CS]`, `[VL]` プレフィックスを使用
- デバッグ用グローバルオブジェクトを公開（`window.debug*`）

---

## 📝 ライセンス

MIT License - 自由に使用・改変・配布可能です。

```
Copyright (c) 2026 iwm10x

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files...
```

詳細は [LICENSE](LICENSE) ファイルを参照してください。

---

## 📮 連絡先

- GitHub: [iwm10x/extension-root](https://github.com/iwm10x/extension-root)
- Issues: [Issue トラッカー](https://github.com/iwm10x/extension-root/issues)

---

## 🙏 謝辞

- Chrome Extensions API ドキュメント
- Google Drive API
- 利用者からのフィードバック

---

## 📚 参考リンク

- [Chrome Extension 開発ガイド](https://developer.chrome.com/docs/extensions/)
- [Google Drive API](https://developers.google.com/drive)
- [Web APIs](https://developer.mozilla.org/en-US/docs/Web/API)

---

## ⭐ よろしければスターを

このプロジェクトが役立ったら、★ をお願いします！

```
https://github.com/iwm10x/extension-root
```

---

**最終更新:** 2026-04-05  
**バージョン:** 1.2.0  
**ステータス:** ✅ アクティブ開発中