# このプロジェクト向けの指示

## 実行・環境の前提

- ユーザー環境では `pnpm` / `node` / `rg` が PATH に通っている前提で進める
- `lint` / `format` / `test` / `typecheck` は作業が一段落するたびに、ユーザー許可を待たずに実行する
- Codex からは `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` を使って直列実行し、ユーザー環境では `pnpm check`（run-p）を使う

## プロジェクト構成メモ

- エントリポイントは `src/extension.ts`。主要ロジックは `src/lib/*` に分割されている

## テスト

- 単体: `pnpm test` は node:test を使用
- 統合: ripgrep 実行が必要なため、Codex からは `scripts/test-bridge.mjs` 経由でユーザー環境で走らせる前提
  - `scripts/test-bridge.mjs` は常駐起動（request/result は `tmp/`）。Codex は `tmp/test.request.json` を更新して実行をリクエストする
  - `pnpm test` で統合がスキップされる場合は、ユーザー側で `pnpm test:bridge` を起動し、`tmp/test.request.json`（最小 `{}`。削除時は再作成）を更新して実行する
  - 統合テスト（`src/integration/**`）を変更した場合は、Codex が `tmp/test.request.json` を更新して bridge を実行する

## 仕様・運用の注意

- README と実装の整合を維持（rules / transforms / relative の挙動が一致しているか確認）
- `pathsearch.rules` は `name` と `match` が必須。`transforms`（パス→検索クエリ変換）か `relative`（相対参照検出）のどちらか一方以上が必須
- `relative` は相対パス参照の検出向け、`transforms` は正規表現で任意の検索クエリを作る用途
- パス/グロブのバリデーションと出力サイズ制限はセキュリティ/性能の要なので維持する
- `src/integration/fixtures/**` はテスト用の疑似データ。型チェックや LSP 警告の対象から外す
