# PathSearch

English | **[日本語](README.ja.md)**

Transform file paths to search queries with customizable patterns and view results instantly in a Peek view.

**Why PathSearch?** Standard LSP-based "Find All References" works great for code symbols, but fails for file path-based references like template paths, translation keys, or dynamic imports. PathSearch bridges this gap by converting physical file paths into logical search queries automatically.

## Features

- **Pattern-based file transformation**: Define regex patterns to transform file paths into search queries
- **Inline Peek Results**: View search results in a Peek view without leaving your current file
- **Ultra-fast search with ripgrep**: Powered by blazing-fast ripgrep (required)
- **Auto-detection**: Automatically selects the right pattern based on file type
- **Multiple patterns per file type**: Support different search strategies for the same file
- **Secure**: Protected against command injection, path traversal, and other security vulnerabilities

## Requirements

**ripgrep** is required for PathSearch to function. Install ripgrep using the [official installation guide](https://github.com/BurntSushi/ripgrep#installation).

If you have ripgrep installed in a custom location, configure the path in settings: `pathsearch.ripgrepPath`

## Usage

### 1. Configure Search Rules

Add search rules to your `.vscode/settings.json`:

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
    }
  ]
}
```

### 2. Find References

#### Inline Results (Peek)

- **Keyboard Shortcut**: `Ctrl+Shift+U` (Windows/Linux) or `Cmd+Shift+U` (Mac)
- **Command Palette**: `PathSearch: Find References`
- Shows results in an inline Peek view at your current cursor position

#### Other Commands

- **`PathSearch: Find References`**: Shows results in a Peek view (uses rule selection rules)
- **`PathSearch: Find References...`**: Always show the rule picker before searching

## Configuration

### `pathsearch.rules`

Array of search rules. Each rule includes the following (`transforms` is required):

- **`name`** (required): Rule display name
- **`match`** (required): Glob pattern to match files (empty string matches nothing)
- **`maxResults`** (optional): Override `pathsearch.maxResults` for this rule
- **`transforms`** (required): Array of transform definitions

#### `transforms` (array)

Each transform includes:

- **`extractFrom`** (required): Regular expression to match against workspace-relative file path
- **`searchFor`** (required): Replacement pattern (use `$1`, `$2` for capture groups)
- **`searchAsRegex`** (optional): Use the result as a regex pattern in VS Code search
- **`searchScope`** (optional): Limit search to specific directories (e.g., `"src/"` or `["src/", "app/"]`)
- **`filePattern`** (optional): Limit search to matching files (e.g., `"**/*.twig"` or `["**/*.twig", "**/*.html"]`)

#### Glob support quick guide

- **`rules[].match`** (minimatch): supports `*` and `{a,b}`.
- **`transforms[].filePattern`** (rg `--glob`): supports `*` and `{a,b}`.
- **`transforms[].searchScope`**: does **not** support `*` or `{}` (paths only).

### `pathsearch.showPickerOnMultiple`

Default: `false`

Controls whether to show the picker when multiple rules match. `true` shows the picker; `false` auto-selects the first rule.

### `pathsearch.maxResults`

Default: `100`

Maximum number of search results to display in the Peek view. Range: 1-10000.

Limits the number of results to prevent performance issues with very large result sets.

### `pathsearch.ripgrepPath`

Default: `""` (empty - use ripgrep from PATH)

Custom path to the ripgrep executable. If ripgrep is not in your system PATH, specify the full path to the `rg` executable here.

Example:

- macOS/Linux: `/usr/local/bin/rg`
- Windows: `C:\\Program Files\\ripgrep\\rg.exe`

### Search Limitations

PathSearch has the following built-in limitations to ensure performance and security:

- **File size limit**: Files larger than 10MB are automatically excluded from search
- **Matches per file**: Maximum 100 matches per file
- **Total output limit**: Search terminates if ripgrep output exceeds 5MB
- **Path restrictions**: `searchScope` only accepts relative paths (no `..` or absolute paths, including `/`)
- **Automatic ripgrep check**: On startup, PathSearch verifies ripgrep availability and shows a warning if not found

## Examples

### Template Files (Twig/Blade/EJS)

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

**File**: `src/views/book/detail.twig`
**Search query**: `@YourNamespace/book/detail.twig`

> **Note**: Replace `@YourNamespace` with your project's actual namespace (e.g., `@BookwalkerMain`, `@App`, `@Templates`).

### React/TypeScript Components

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

**File**: `src/components/Button/Button.tsx`
**Search query (regex)**: `from ['"].*Button/Button`

### Python Modules

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

**File**: `myapp/models/user.py`
**Search query (regex)**: `from models.user import|from models import user`

### i18n Translation Keys

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

**File**: `locales/en/common.json`
**Search query (regex)**: `en:common\.|['"]en:common\.`
**Finds**: `t('en:common.welcome')`, `i18n.t("en:common.button")`

### Limiting Search Scope

Limit search to specific directories for faster results:

```json
{
  "name": "Frontend Component",
  "match": "**/*.tsx",
  "transforms": [
    {
      "extractFrom": ".*/components/(.*)\\.tsx$",
      "searchFor": "import.*from ['\"].*/$1['\"]",
      "searchAsRegex": true,
      "searchScope": "src/frontend/" // Only search in frontend directory
    }
  ]
}
```

**Benefits**:

- Faster search (fewer files to scan)
- More relevant results (excludes backend code)
- Better organization for monorepos

**Multiple directories**:

```json
{
  "searchScope": ["src/", "app/", "lib/"]
}
```

Note: `searchScope` does not support wildcards. Use `filePattern` to filter files instead.

**File pattern filter**:

```json
{
  "filePattern": "**/*.twig"
}
```

This limits searches to matching files while keeping the same scope.

### Configuration Example

Complete configuration example with all options:

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
          "searchScope": "src/" // Search only in src/ directory
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
          "searchScope": ["src/backend/", "src/api/"] // Multiple directories
        }
      ]
    }
  ],
  "pathsearch.showPickerOnMultiple": false,
  "pathsearch.maxResults": 100,
  "pathsearch.ripgrepPath": ""
}
```

## Advanced Usage

### Peek Workflow

Peek results are perfect for quickly checking where a file is used without losing your place:

1. Open any file in your project
2. Press `Cmd+Shift+U` (Mac) or `Ctrl+Shift+U` (Windows/Linux)
3. Results appear inline at your cursor position
4. Navigate through results with arrow keys
5. Press `Escape` to close and return to your code

### Pattern Optimization

To get the best performance:

1. **Use specific file patterns**: `**/*.tsx` instead of `**/*`
2. **Limit results**: Adjust `pathsearch.maxResults` based on your needs
3. **Install ripgrep**: Provides 10-100x speedup for large projects

## Performance

PathSearch is powered by **ripgrep**, a lightning-fast search tool written in Rust:

- Automatically respects `.gitignore`
- 10-100x faster than traditional search methods
- Handles large codebases efficiently
- Parallel search across multiple files

## Security

PathSearch is designed with security in mind:

### Protected Against

- **Command injection**: Uses secure `spawn` API instead of shell execution
- **Path traversal**: Validates all file paths to prevent access outside workspace
- **Resource exhaustion**: Limits output size and result count
- **Information disclosure**: Sanitizes error messages shown to users

### Security Features

- No arbitrary code execution
- Input validation on all user-provided patterns
- Workspace boundary enforcement
- Secure handling of external commands

All search rules are defined in your workspace settings, giving you full control and visibility.

## License

WTFPL (Do What The Fuck You Want To Public License)

Copyright (C) 2026 horyu

See [LICENSE](LICENSE) file for details.
