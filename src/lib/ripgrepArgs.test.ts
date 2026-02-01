import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRipgrepArgs } from './ripgrepArgs.ts';

test('buildRipgrepArgs: 固定文字列検索とstatsを含める', () => {
  const args = buildRipgrepArgs({
    searchQuery: 'hello',
    isRegex: false,
    maxResults: 50,
    searchScope: ['src', 'test'],
    filePattern: ['**/*.ts', '!**/dist/**'],
    includeStats: true,
    maxFileSize: '1M'
  });

  assert.deepEqual(args, [
    '--json',
    '--line-number',
    '--column',
    '--max-count',
    '50',
    '--max-filesize',
    '1M',
    '--stats',
    '--fixed-strings',
    '--glob',
    '**/*.ts',
    '--glob',
    '!**/dist/**',
    '--',
    'hello',
    'src',
    'test'
  ]);
});

test('buildRipgrepArgs: 正規表現検索では --fixed-strings を入れない', () => {
  const args = buildRipgrepArgs({
    searchQuery: 'h.*o',
    isRegex: true,
    maxResults: 1,
    searchScope: ['.']
  });

  assert.ok(!args.includes('--fixed-strings'));
});
