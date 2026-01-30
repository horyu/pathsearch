# PathSearch

**[English](README.md)** | 日本語

ファイルパスをカスタマイズ可能なパターンで検索クエリに変換し、結果をPeekビューで即座に表示します。

**なぜPathSearchが必要か？** 標準のLSPベースの「すべての参照を検索」は、コードシンボルに対しては優れていますが、テンプレートパス、翻訳キー、動的インポートなどのファイルパスベースの参照には対応できません。PathSearchは、物理的なファイルパスを論理的な検索クエリに自動変換することで、このギャップを埋めます。

## 機能

- **パターンベースのファイル変換**: 正規表現パターンを定義してファイルパスを検索クエリに変換
- **Peek Usages**: 現在のファイルを離れずにインラインPeekビューで検索結果を表示
- **ripgrepによる超高速検索**: 超高速ripgrepで動作（必須）
- **自動検出**: ファイルタイプに基づいて適切なパターンを自動選択
- **1つのファイルタイプに複数のパターン**: 同じファイルに対して異なる検索戦略をサポート
- **セキュア**: コマンドインジェクション、パストラバーサル、その他のセキュリティ脆弱性から保護

## 要件

**ripgrep**がPathSearchの動作に必要です。[公式インストールガイド](https://github.com/BurntSushi/ripgrep#installation)を使用してripgrepをインストールしてください。

ripgrepがカスタムの場所にインストールされている場合は、設定でパスを指定してください: `pathsearch.ripgrepPath`

## 使い方

### 1. 変換パターンの設定

`.vscode/settings.json` に変換パターンを追加します:

```json
{
  "pathsearch.transforms": [
    {
      "name": "Example: Template File",
      "applyTo": "**/*.{twig,blade.php,ejs,hbs}",
      "extractFrom": ".*views/(.*)",
      "searchFor": "@YourNamespace/$1",
      "description": "テンプレートファイルの使用箇所を検索（@YourNamespaceをカスタマイズ）"
    },
    {
      "name": "React Component - Import",
      "applyTo": "**/*.tsx",
      "extractFrom": ".*/components/(.*)\\.tsx$",
      "searchFor": "import.*from ['\"].*/$1['\"]",
      "searchAsRegex": true,
      "description": "Reactコンポーネントのインポートを検索"
    }
  ]
}
```

### 2. 使用箇所の検索

#### Peek Usages（インライン結果）

- **キーボードショートカット**: `Ctrl+Shift+U`（Windows/Linux）または `Cmd+Shift+U`（Mac）
- **コマンドパレット**: `PathSearch: Peek Usages`
- 現在のカーソル位置にインラインPeekビューで結果を表示

#### その他のコマンド

- **`PathSearch: Find Usages`**: 変換したクエリでVS Codeの検索パネルを開く
- **`PathSearch: Find Usages...`**: 検索前に必ずパターンピッカーを表示

## 設定

### `pathsearch.transforms`

変換設定の配列。各変換には以下が含まれます:

- **`name`**（必須）: 表示名
- **`extractFrom`**（必須）: ワークスペース相対ファイルパスに対してマッチする正規表現
- **`searchFor`**（必須）: 置換パターン（`$1`, `$2`でキャプチャグループを使用）
- **`applyTo`**（オプション）: 適用するファイルを絞り込むGlobパターン（例: `**/*.tsx`）
- **`description`**（オプション）: ピッカーに表示される説明
- **`searchAsRegex`**（オプション）: 結果をVS Code検索で正規表現パターンとして使用
- **`searchIn`**（オプション）: 特定のディレクトリに検索を制限（例: `"src/"` または `["src/", "app/"]`）

### `pathsearch.autoDetect`

デフォルト: `true`

1つのパターンのみがマッチした場合、自動的にその変換を選択します。`false`に設定すると常にピッカーを表示します。

### `pathsearch.maxResults`

デフォルト: `100`

Peek Usagesで表示する検索結果の最大数。範囲: 1-10000。

非常に大きな結果セットでのパフォーマンス問題を防ぐために結果数を制限します。

### `pathsearch.ripgrepPath`

デフォルト: `""`（空 - PATHからripgrepを使用）

ripgrep実行ファイルへのカスタムパス。ripgrepがシステムのPATHにない場合は、ここで`rg`実行ファイルへのフルパスを指定してください。

例:

- macOS/Linux: `/usr/local/bin/rg`
- Windows: `C:\\Program Files\\ripgrep\\rg.exe`

### 検索の制限事項

PathSearchは、パフォーマンスとセキュリティを確保するため、以下の制限があります:

- **ファイルサイズ制限**: 10MBを超えるファイルは自動的に検索対象外
- **ファイルごとのマッチ数**: ファイルあたり最大100マッチ
- **総出力サイズ制限**: ripgrep出力が5MBを超えると検索を終了
- **パスの制限**: `searchIn` は相対パスのみ受け付けます（`..` や絶対パスは不可）
- **ripgrep自動チェック**: 起動時にripgrepの可用性を確認し、見つからない場合は警告を表示

## 例

### テンプレートファイル（Twig/Blade/EJS）

```json
{
  "name": "Template File",
  "applyTo": "**/*.{twig,blade.php,ejs,hbs}",
  "extractFrom": ".*views/(.*)",
  "searchFor": "@YourNamespace/$1"
}
```

**ファイル**: `src/views/book/detail.twig`
**検索クエリ**: `@YourNamespace/book/detail.twig`

> **注意**: `@YourNamespace`をプロジェクトの実際のネームスペース（例: `@BookwalkerMain`, `@App`, `@Templates`）に置き換えてください。

### React/TypeScriptコンポーネント

```json
{
  "name": "React Component",
  "applyTo": "**/{components,hooks}/**/*.{tsx,ts}",
  "extractFrom": ".*/(?:components|hooks)/(.*)\\.tsx?$",
  "searchFor": "from ['\"].*/$1",
  "searchAsRegex": true
}
```

**ファイル**: `src/components/Button/Button.tsx`
**検索クエリ（正規表現）**: `from ['"].*Button/Button`

### Pythonモジュール

```json
{
  "name": "Python Module",
  "applyTo": "**/*.py",
  "extractFrom": ".*/([^/]+)/([^/]+)\\.py$",
  "searchFor": "from $1.$2 import|from $1 import $2",
  "searchAsRegex": true
}
```

**ファイル**: `myapp/models/user.py`
**検索クエリ（正規表現）**: `from models.user import|from models import user`

### i18n翻訳キー

```json
{
  "name": "Translation Key",
  "applyTo": "**/{locales,i18n,translations}/**/*.{json,yaml,yml}",
  "extractFrom": ".*/([^/]+)/([^/]+)\\.(json|yaml|yml)$",
  "searchFor": "$1:$2\\.|['\"]$1:$2\\.",
  "searchAsRegex": true
}
```

**ファイル**: `locales/en/common.json`
**検索クエリ（正規表現）**: `en:common\.|['"]en:common\.`
**検索結果**: `t('en:common.welcome')`, `i18n.t("en:common.button")`

### 検索範囲の制限

より高速な結果を得るために、特定のディレクトリに検索を制限します:

```json
{
  "name": "Frontend Component",
  "applyTo": "**/*.tsx",
  "extractFrom": ".*/components/(.*)\\.tsx$",
  "searchFor": "import.*from ['\"].*/$1['\"]",
  "searchAsRegex": true,
  "searchIn": "src/frontend/" // フロントエンドディレクトリのみを検索
}
```

**メリット**:

- より高速な検索（スキャンするファイルが少ない）
- より関連性の高い結果（バックエンドコードを除外）
- モノレポでの整理が改善

**複数ディレクトリ**:

```json
{
  "searchIn": ["src/", "app/", "lib/"]
}
```

**ワイルドカードパターン**（高度）:

```json
{
  "searchIn": "src/module-*/components/"
}
```

これにより、`src/module-a/components/`、`src/module-b/components/` などを検索します。PathSearchは `searchIn` のワイルドカードパターンを自動的に展開します。

### 設定例

すべてのオプションを含む完全な設定例:

```json
{
  "pathsearch.transforms": [
    {
      "name": "React Component",
      "applyTo": "**/*.tsx",
      "extractFrom": ".*/components/(.*)\\.tsx$",
      "searchFor": "import.*from ['\"].*/$1['\"]",
      "searchAsRegex": true,
      "description": "Reactコンポーネントのインポートを検索",
      "searchIn": "src/" // src/ディレクトリのみを検索
    },
    {
      "name": "Backend API",
      "applyTo": "**/*.ts",
      "extractFrom": ".*/api/(.*)\\.ts$",
      "searchFor": "...",
      "searchIn": ["src/backend/", "src/api/"] // 複数ディレクトリ
    }
  ],
  "pathsearch.autoDetect": true,
  "pathsearch.maxResults": 100,
  "pathsearch.ripgrepPath": ""
}
```

## 高度な使い方

### Peek Usagesワークフロー

Peek Usages機能は、作業位置を失わずにファイルの使用箇所を素早く確認するのに最適です:

1. プロジェクト内の任意のファイルを開く
2. `Cmd+Shift+U`（Mac）または`Ctrl+Shift+U`（Windows/Linux）を押す
3. 結果がカーソル位置にインラインで表示される
4. 矢印キーで結果間を移動
5. `Escape`を押して閉じ、コードに戻る

### パターンの最適化

最高のパフォーマンスを得るために:

1. **特定のファイルパターンを使用**: `**/*`ではなく`**/*.tsx`
2. **結果を制限**: 必要に応じて`pathsearch.maxResults`を調整
3. **ripgrepをインストール**: 大規模プロジェクトで10-100倍の高速化

## パフォーマンス

PathSearchは、Rust製の超高速検索ツール**ripgrep**で動作します:

- `.gitignore`を自動的に尊重
- 従来の検索方法より10-100倍高速
- 大規模なコードベースを効率的に処理
- 複数ファイル間の並列検索

## セキュリティ

PathSearchはセキュリティを考慮して設計されています:

### 保護対象

- **コマンドインジェクション**: シェル実行の代わりに安全な`spawn` APIを使用
- **パストラバーサル**: すべてのファイルパスを検証してワークスペース外へのアクセスを防止
- **リソース枯渇**: 出力サイズと結果数を制限
- **情報漏洩**: ユーザーに表示されるエラーメッセージをサニタイズ

### セキュリティ機能

- 任意のコード実行なし
- すべてのユーザー提供パターンに対する入力検証
- ワークスペース境界の強制
- 外部コマンドの安全な処理

すべての変換はワークスペース設定で定義されており、完全な制御と可視性を提供します。

## ライセンス

WTFPL (Do What The Fuck You Want To Public License)

Copyright (C) 2026 horyu

詳細は[LICENSE](LICENSE)ファイルを参照してください。
