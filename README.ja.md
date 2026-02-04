# PathSearch

**[English](README.md)** | 日本語

ファイルパスをカスタマイズ可能なパターンで検索クエリに変換し、結果をPeekビューで即座に表示します。

![デモ](assets/demo.gif)
![ツールバーボタン](assets/demo-button.png)

**なぜPathSearchが必要か？** 標準のLSPベースの「すべての参照を検索」は、コードシンボルに対しては優れていますが、テンプレートパス、翻訳キー、動的インポートなどのファイルパスベースの参照には対応できません。PathSearchは、物理的なファイルパスを論理的な検索クエリに自動変換することで、このギャップを埋めます。

## 機能

- **パターンベースのファイル変換**: 正規表現パターンを定義してファイルパスを検索クエリに変換
- **インラインPeek結果**: 現在のファイルを離れずにPeekビューで検索結果を表示
- **ripgrepで検索**: ripgrepで動作（PATH または VS Code 同梱を利用）
- **.gitignore を尊重**: ripgrep により除外設定を反映
- **自動検出**: ファイルタイプに基づいて適切なパターンを自動選択
- **1つのファイルタイプに複数のパターン**: 同じファイルに対して異なる検索戦略をサポート
- **セキュア**: コマンドインジェクション、パストラバーサル、その他のセキュリティ脆弱性から保護

## ripgrep の解決順

PathSearch は ripgrep を次の順で解決します:

1. `pathsearch.ripgrepPath`（設定時はフォールバックなし）
2. PATH の `rg`
3. VS Code 同梱の `app/node_modules/@vscode/ripgrep/bin`（VS Code のバージョンでパスが変わる可能性があります）

いずれも利用できない場合は、[公式インストールガイド](https://github.com/BurntSushi/ripgrep#installation)でインストールし、PATH に通すか `pathsearch.ripgrepPath` で実行ファイルのパスを指定してください。

## 使い方

### 1. 検索ルールの設定

`.vscode/settings.json` に検索ルールを追加します:

```json
{
  "pathsearch.rules": [
    {
      "name": "Template File",
      "match": "**/*.{twig,blade.php,ejs,hbs}",
      "transforms": [
        {
          "extractFrom": ".*views/(.*)",
          "searchFor": "@YourNamespace/$1"
        }
      ]
    },
    {
      "name": "React Component - Import",
      "match": "**/*.tsx",
      "transforms": [
        {
          "extractFrom": ".*/components/(.*)\\.tsx$",
          "searchFor": "import.*from ['\"].*/$1['\"]",
          "searchAsRegex": true
        }
      ]
    },
    {
      "name": "SCSS Relative Imports",
      "match": "**/*.scss",
      "relative": {
        "matchTarget": "fileStem",
        "maxDepth": 3,
        "searchScope": "src/",
        "filePattern": "**/*.scss"
      }
    }
  ]
}
```

### 2. 使用箇所の検索

#### インライン結果（Peek）

- **キーボードショートカット**: `Ctrl+Shift+U`（Windows/Linux）または `Cmd+Shift+U`（Mac）
- **コマンドパレット**: `PathSearch: Find References`
- 現在のカーソル位置にインラインPeekビューで結果を表示

#### その他のコマンド

- **`PathSearch: Find References`**: ルールに従ってPeekビューで結果を表示
- **`PathSearch: Find References (Always Picker)`**: 検索前に必ずルールピッカーを表示

## 設定

### `pathsearch.rules`

検索ルールの配列。各ルールには以下が含まれます（`transforms` または `relative` のいずれかは必須）:

- **`name`**（必須）: ルールの表示名
- **`match`**（必須）: 対象ファイルのGlobパターン（空文字は何にもマッチしません）
- **`matchWorkspace`**（オプション）: ルールを特定のワークスペース名に限定
- **`maxResults`**（オプション）: ルール単位の最大結果数（`pathsearch.maxResults` を上書き）
- **`transforms`**（オプション）: 変換定義の配列
- **`relative`**（オプション）: 相対パス検索の設定

#### `matchWorkspace`

特定のワークスペース名だけでルールを有効化します:

```json
{
  "name": "Monorepo only",
  "match": "**/*.ts",
  "matchWorkspace": ["my-monorepo", "client-app"],
  "transforms": []
}
```

ワークスペース名に対して glob / 正規表現でも指定できます:

```json
{
  "name": "App workspaces",
  "match": "**/*.ts",
  "matchWorkspace": { "type": "glob", "values": ["*-app"] },
  "transforms": []
}
```

```json
{
  "name": "Corp workspaces",
  "match": "**/*.ts",
  "matchWorkspace": { "type": "regex", "values": ["^corp-"] },
  "transforms": []
}
```

#### `transforms`（配列）

各変換には以下が含まれます:

- **`extractFrom`**（必須）: ワークスペース相対ファイルパスに対してマッチする正規表現
- **`searchFor`**（必須）: 置換パターン（`$1`, `$2`でキャプチャグループを使用）
- **`searchAsRegex`**（オプション）: 結果をripgrep検索で正規表現パターンとして使用
- **`searchScope`**（オプション）: 特定のディレクトリに検索を制限（例: `"src/"` または `["src/", "app/"]`）
- **`filePattern`**（オプション）: 対象ファイルを絞り込み（例: `"**/*.twig"` や `"**/*.{scss,css}"`、または `["**/*.twig", "**/*.html"]`）

#### `relative`（オブジェクト）

相対パス検索の設定:

- **`matchTarget`**（必須）: `parentDir` / `fileName` / `fileStem`
- **`maxDepth`**（オプション）: `../` の上限。`0` の場合は同じ階層以下のみ許可
- **`searchScope`**（オプション）: 特定のディレクトリに検索を制限（例: `"src/"` または `["src/", "app/"]`）
- **`filePattern`**（オプション）: 対象ファイルを絞り込み（例: `"**/*.scss"` や `"**/*.{scss,css}"`、または `["**/*.scss", "**/*.css"]`）

### `pathsearch.showPickerOnMultiple`

デフォルト: `false`

複数のルールがマッチした場合にピッカーを表示するかどうかを切り替えます。`true` でピッカー表示、`false` で先に記述されたルールを自動選択します。

### `pathsearch.maxResults`

デフォルト: `100`

Peekビューで表示する検索結果の最大数。範囲: 1-10000。

非常に大きな結果セットでのパフォーマンス問題を防ぐために結果数を制限します。

### `pathsearch.ripgrepPath`

デフォルト: `""`（空 - PATHまたはVS Code同梱のripgrepを使用）

ripgrep実行ファイルへのカスタムパス。解決順は「[ripgrep の解決順](#ripgrep-の解決順)」を参照してください。

例:

- macOS/Linux: `/usr/local/bin/rg`
- Windows: `C:\\Program Files\\ripgrep\\rg.exe`

### 検索の制限事項

PathSearchは、パフォーマンスとセキュリティを確保するため、以下の制限があります:

- **ファイルサイズ制限**: 10MBを超えるファイルは自動的に検索対象外
- **ファイルごとのマッチ数**: ファイルあたり最大100マッチ
- **総出力サイズ制限**: ripgrep出力が5MBを超えると検索を終了
- **パスの制限**: `searchScope` は相対パスのみ受け付けます（`..` や絶対パス（`/`含む）は不可）

## 例

### テンプレートファイル（Twig/Blade/EJS）

```json
{
  "name": "Template File",
  "match": "**/*.{twig,blade.php,ejs,hbs}",
  "transforms": [
    {
      "extractFrom": ".*views/(.*)",
      "searchFor": "@YourNamespace/$1"
    }
  ]
}
```

**ファイル**: `src/views/book/detail.twig`
**検索クエリ**: `@YourNamespace/book/detail.twig`

> **注意**: `@YourNamespace`をプロジェクトの実際のネームスペース（例: `@BookwalkerMain`, `@App`, `@Templates`）に置き換えてください。

### React/TypeScriptコンポーネント

```json
{
  "name": "React Component",
  "match": "**/{components,hooks}/**/*.{tsx,ts}",
  "transforms": [
    {
      "extractFrom": ".*/(?:components|hooks)/(.*)\\.tsx?$",
      "searchFor": "from ['\"].*/$1",
      "searchAsRegex": true
    }
  ]
}
```

**ファイル**: `src/components/Button/Button.tsx`
**検索クエリ（正規表現）**: `from ['"].*Button/Button`

### Pythonモジュール

```json
{
  "name": "Python Module",
  "match": "**/*.py",
  "transforms": [
    {
      "extractFrom": ".*/([^/]+)/([^/]+)\\.py$",
      "searchFor": "from $1.$2 import|from $1 import $2",
      "searchAsRegex": true
    }
  ]
}
```

**ファイル**: `myapp/models/user.py`
**検索クエリ（正規表現）**: `from models.user import|from models import user`

### i18n翻訳キー

```json
{
  "name": "Translation Key",
  "match": "**/{locales,i18n,translations}/**/*.{json,yaml,yml}",
  "transforms": [
    {
      "extractFrom": ".*/([^/]+)/([^/]+)\\.(json|yaml|yml)$",
      "searchFor": "$1:$2\\.|['\"]$1:$2\\.",
      "searchAsRegex": true
    }
  ]
}
```

**ファイル**: `locales/en/common.json`
**検索クエリ（正規表現）**: `en:common\.|['"]en:common\.`
**検索結果**: `t('en:common.welcome')`, `i18n.t("en:common.button")`

### 相対インポート（SCSS）

```json
{
  "name": "SCSS Relative Imports",
  "match": "**/*.scss",
  "relative": {
    "matchTarget": "fileStem",
    "maxDepth": 3,
    "searchScope": "src/",
    "filePattern": "**/*.scss"
  }
}
```

**ファイル**: `src/styles/button.scss`
**検索**: `@use "./button"` や `@import "../styles/button"` のような相対参照を検索

### 検索範囲の制限

より高速な結果を得るために、特定のディレクトリに検索を制限します:

```json
{
  "name": "Frontend Component",
  "match": "**/*.tsx",
  "transforms": [
    {
      "extractFrom": ".*/components/(.*)\\.tsx$",
      "searchFor": "import.*from ['\"].*/$1['\"]",
      "searchAsRegex": true,
      "searchScope": "src/frontend/" // フロントエンドディレクトリのみを検索
    }
  ]
}
```

**メリット**:

- より高速な検索（スキャンするファイルが少ない）
- より関連性の高い結果（バックエンドコードを除外）
- モノレポでの整理が改善

**複数ディレクトリ**:

```json
{
  "searchScope": ["src/", "app/", "lib/"]
}
```

※ `searchScope` はワイルドカードをサポートしません。ファイルの絞り込みは `filePattern` を使ってください。

**ファイルパターンの絞り込み**:

```json
{
  "filePattern": "**/*.twig"
}
```

対象ファイルを絞り込んで検索できます。

### 設定例

すべてのオプションを含む完全な設定例:

```json
{
  "pathsearch.rules": [
    {
      "name": "React Component",
      "match": "**/*.tsx",
      "transforms": [
        {
          "extractFrom": ".*/components/(.*)\\.tsx$",
          "searchFor": "import.*from ['\"].*/$1['\"]",
          "searchAsRegex": true,
          "searchScope": "src/" // src/ディレクトリのみを検索
        }
      ]
    },
    {
      "name": "Backend API",
      "match": "**/*.ts",
      "transforms": [
        {
          "extractFrom": ".*/api/(.*)\\.ts$",
          "searchFor": "...",
          "searchScope": ["src/backend/", "src/api/"] // 複数ディレクトリ
        }
      ]
    }
  ],
  "pathsearch.showPickerOnMultiple": false,
  "pathsearch.maxResults": 100,
  "pathsearch.ripgrepPath": ""
}
```

## 高度な使い方

### Peekワークフロー

Peek機能は、作業位置を失わずにファイルの使用箇所を素早く確認するのに最適です:

1. プロジェクト内の任意のファイルを開く
2. `Cmd+Shift+U`（Mac）または`Ctrl+Shift+U`（Windows/Linux）を押す
3. 結果がカーソル位置にインラインで表示される
4. 矢印キーで結果間を移動
5. `Escape`を押して閉じ、コードに戻る

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

すべての検索ルールはワークスペース設定またはユーザー設定で定義でき、完全な制御と可視性を提供します。

## ライセンス

WTFPL (Do What The Fuck You Want To Public License)

Copyright (C) 2026 horyu

詳細は[LICENSE](LICENSE)ファイルを参照してください。
