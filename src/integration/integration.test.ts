import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRelativeSearchQuery, isRelativeReferenceMatch } from '../lib/relativeSearch.ts';
import { buildRipgrepArgs } from '../lib/ripgrepArgs.ts';
import { parseRipgrepMatches } from '../lib/ripgrepParse.ts';
import { transformPath } from '../lib/transformPath.ts';

type RipgrepMatch = {
  filePath: string;
  matchText: string;
};

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const fixturesRoot = path.join(testDir, 'fixtures');

const rgPath = 'rg';
const rgCheck = spawnSync(rgPath, ['--version'], { encoding: 'utf8' });
const rgAvailable = !rgCheck.error && rgCheck.status === 0;
if (!rgAvailable) {
  // 統合テストはrg実行に依存し、Codex(特にWindowsネイティブ)では起動制限でスキップされる場合がある
  console.warn('[integration] rg check failed', {
    rgPath,
    error: rgCheck.error?.message,
    status: rgCheck.status,
    stderr: rgCheck.stderr?.toString()
  });
  console.warn('[integration] rg が見つからない場合は、ユーザー側で test:bridge を起動してください。');
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function runRipgrep(options: {
  query: string;
  isRegex: boolean;
  searchScope: string | string[];
  filePattern?: string | string[];
  maxResults?: number;
}): RipgrepMatch[] {
  const patterns = options.filePattern
    ? Array.isArray(options.filePattern)
      ? options.filePattern
      : [options.filePattern]
    : [];
  const searchPaths = Array.isArray(options.searchScope) ? options.searchScope : [options.searchScope];
  const args = buildRipgrepArgs({
    searchQuery: options.query,
    isRegex: options.isRegex,
    maxResults: options.maxResults ?? 200,
    searchScope: searchPaths,
    filePattern: patterns,
    maxFileSize: '1M'
  });

  const result = spawnSync(rgPath, args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`rg failed: ${result.stderr}`);
  }
  if (result.status === 1) {
    return [];
  }

  return parseRipgrepMatches(result.stdout).map(match => ({
    filePath: path.resolve(repoRoot, match.relativePath),
    matchText: match.matchText
  }));
}

test('transform: コンポーネント参照を拾える', t => {
  if (!rgAvailable) {
    t.skip('rg が見つからないためスキップ');
    return;
  }

  const componentPath = path.join(fixturesRoot, 'components', 'Button.tsx');
  const relativePath = toPosix(path.relative(repoRoot, componentPath));
  const query = transformPath(
    {
      extractFrom: '.*/components/(.*)\\.tsx$',
      searchFor: '$1',
      searchScope: 'src/integration/fixtures/app',
      filePattern: '**/*.tsx'
    },
    relativePath
  );

  const matches = runRipgrep({
    query,
    isRegex: false,
    searchScope: 'src/integration/fixtures/app',
    filePattern: '**/*.tsx'
  });

  const matchFiles = Array.from(new Set(matches.map(match => toPosix(path.relative(repoRoot, match.filePath)))));
  assert.deepEqual(matchFiles, ['src/integration/fixtures/app/App.tsx']);
});

test('relative: fileStem で正しい参照のみ残る', t => {
  if (!rgAvailable) {
    t.skip('rg が見つからないためスキップ');
    return;
  }

  const targetPath = path.join(fixturesRoot, 'styles', 'button.scss');
  const relativePath = toPosix(path.relative(repoRoot, targetPath));
  const query = buildRelativeSearchQuery(relativePath, { matchTarget: 'fileStem', maxDepth: 3 });

  const candidates = runRipgrep({
    query,
    isRegex: true,
    searchScope: 'src/integration/fixtures',
    filePattern: '**/*.scss'
  });

  const filtered = candidates.filter(match =>
    isRelativeReferenceMatch(match.matchText, match.filePath, targetPath, { matchTarget: 'fileStem', maxDepth: 3 })
  );

  const matchFiles = filtered.map(match => toPosix(path.relative(repoRoot, match.filePath))).sort();
  assert.deepEqual(matchFiles, [
    'src/integration/fixtures/pages/home.scss',
    'src/integration/fixtures/styles/theme.scss'
  ]);
});

test('transform: searchAsRegex=true で正規表現として検索できる', t => {
  if (!rgAvailable) {
    t.skip('rg が見つからないためスキップ');
    return;
  }

  const matches = runRipgrep({
    query: 'from [\'"].*/Button',
    isRegex: true,
    searchScope: 'src/integration/fixtures/app',
    filePattern: '**/*.tsx'
  });

  const matchFiles = Array.from(new Set(matches.map(match => toPosix(path.relative(repoRoot, match.filePath)))));
  assert.deepEqual(matchFiles, ['src/integration/fixtures/app/App.tsx']);
});

test('transform: searchScope と filePattern の複数指定で絞り込みできる', t => {
  if (!rgAvailable) {
    t.skip('rg が見つからないためスキップ');
    return;
  }

  const matches = runRipgrep({
    query: '@import',
    isRegex: false,
    searchScope: [
      'src/integration/fixtures/styles',
      'src/integration/fixtures/pages',
      'src/integration/fixtures/other'
    ],
    filePattern: ['**/*.scss', '!**/other/**']
  });

  const matchFiles = Array.from(new Set(matches.map(match => toPosix(path.relative(repoRoot, match.filePath))))).sort();
  assert.deepEqual(matchFiles, [
    'src/integration/fixtures/pages/home.scss',
    'src/integration/fixtures/styles/theme.scss'
  ]);
});

test('transform: maxResults は rg 側でファイルごとの上限として効く', t => {
  if (!rgAvailable) {
    t.skip('rg が見つからないためスキップ');
    return;
  }

  const matches = runRipgrep({
    query: '.button',
    isRegex: false,
    searchScope: ['src/integration/fixtures/styles', 'src/integration/fixtures/other'],
    filePattern: '**/*.scss',
    maxResults: 1
  });

  assert.equal(matches.length, 2);
});

test('relative: maxDepth=0 と >0 で結果が変わる', t => {
  if (!rgAvailable) {
    t.skip('rg が見つからないためスキップ');
    return;
  }

  const targetPath = path.join(fixturesRoot, 'styles', 'button.scss');
  const relativePath = toPosix(path.relative(repoRoot, targetPath));
  const candidates = runRipgrep({
    query: buildRelativeSearchQuery(relativePath, { matchTarget: 'fileStem', maxDepth: 3 }),
    isRegex: true,
    searchScope: 'src/integration/fixtures',
    filePattern: '**/*.scss'
  });

  const filteredDepth0 = candidates.filter(match =>
    isRelativeReferenceMatch(match.matchText, match.filePath, targetPath, { matchTarget: 'fileStem', maxDepth: 0 })
  );
  const filteredDepth1 = candidates.filter(match =>
    isRelativeReferenceMatch(match.matchText, match.filePath, targetPath, { matchTarget: 'fileStem', maxDepth: 1 })
  );

  const filesDepth0 = filteredDepth0.map(match => toPosix(path.relative(repoRoot, match.filePath))).sort();
  const filesDepth1 = filteredDepth1.map(match => toPosix(path.relative(repoRoot, match.filePath))).sort();

  assert.deepEqual(filesDepth0, ['src/integration/fixtures/styles/theme.scss']);
  assert.deepEqual(filesDepth1, [
    'src/integration/fixtures/pages/home.scss',
    'src/integration/fixtures/styles/theme.scss'
  ]);
});

test('transform: 変換結果が空文字でも検索が実行される', t => {
  if (!rgAvailable) {
    t.skip('rg が見つからないためスキップ');
    return;
  }

  const componentPath = path.join(fixturesRoot, 'components', 'Button.tsx');
  const relativePath = toPosix(path.relative(repoRoot, componentPath));
  const query = transformPath(
    {
      extractFrom: '.*/components/(.*)\\.tsx$',
      searchFor: ''
    },
    relativePath
  );

  const matches = runRipgrep({
    query,
    isRegex: false,
    searchScope: 'src/integration/fixtures/app',
    filePattern: '**/*.tsx',
    maxResults: 1
  });

  assert.equal(query, '');
  assert.equal(matches.length, 1);
});
