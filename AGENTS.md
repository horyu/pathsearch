# このプロジェクト向けの指示

## 実行・環境の前提

- ユーザー環境では `pnpm` / `node` / `rg` が PATH に通っている前提で進める
- `lint` / `format` / `test` / `typecheck` は作業が一段落するたびに、ユーザー許可を待たずに実行する
- Codex からは `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` を使って直列実行し、ユーザー環境では `pnpm check`（run-p）を使う

## プロジェクト構成メモ

- エントリポイントは `src/extension.ts`。主要ロジックは `src/lib/*` に分割されている

## テスト

- 単体: `pnpm test`（node:test）
- 統合: ユーザー側で `pnpm test:bridge` を常駐起動し、Codex は `pnpm run test:bridge:codex` で request更新〜結果待ちまで自動化する
  - 統合テスト（`src/integration/**`）変更時は `pnpm run test:bridge:codex` を実行

## 仕様・運用の注意

- README と実装の整合を維持（rules / transforms / relative の挙動が一致しているか確認）
- `pathsearch.rules` は `name` と `match` が必須。`transforms`（パス→検索クエリ変換）か `relative`（相対参照検出）のどちらか一方以上が必須
- `relative` は相対パス参照の検出向け、`transforms` は正規表現で任意の検索クエリを作る用途
- パス/グロブのバリデーションと出力サイズ制限はセキュリティ/性能の要なので維持する
- `src/integration/fixtures/**` はテスト用の疑似データ。型チェックや LSP 警告の対象から外す
