# マンガ本棚（Chrome 拡張）

## 概要
この拡張は、マンガやウェブページを「本棚」として保存し、定期的に更新チェックを行い、更新があれば通知するツールです。タグ管理、編集モーダル、バックアップ（JSON）、Google Drive 同期（appDataFolder）などの機能を備えています。

## 主な機能
- 本棚の追加・編集・削除
- タグ管理（履歴・オートコンプリート）
- 重複検出（URL / タイトル / Levenshtein）
- 更新チェック（HEAD→GET→ハッシュ比較、分割バッチ）
- Google Drive 同期（appDataFolder、ETag ベース）
- バックアップ（JSON エクスポート/インポート）
- UI: スケルトン、Empty State、カード化、トースト、検索、ソート、お気に入り
- 設定画面（batchSize / fetchTimeoutMs / uiCompact / uiDark）

## インストール（開発）
1. `manifest.json` の `oauth2.client_id` を設定する（Drive 同期を使う場合）。
2. Chrome の拡張機能ページ（`chrome://extensions`）で「デベロッパーモード」を有効化。
3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択。

## 開発用ファイル構成（抜粋）
- `popup.html`, `popup.css`, `popup.js` — ポップアップ UI とロジック
- `background.js` — service worker（更新チェック・Drive 同期）
- `lib/levenshtein.js` — Levenshtein 補助（必要に応じて）
- `icons/` — アイコン画像

## 注意点
- Drive 同期を利用する場合は OAuth クライアント ID の設定が必要です。
- 一部のサイトは CORS によりページ情報取得が失敗することがあります。
- 大量のアイテムを扱う場合は `batchSize` / `maxConcurrentFetch` を調整してください。

## ライセンス
（プロジェクトに合わせて記載してください）