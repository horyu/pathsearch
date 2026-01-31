import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRelativeSearchQuery, isRelativeMatchTarget, isRelativeReferenceMatch } from './relativeSearch.ts';
import type { RelativeSearchConfig } from './types.ts';

test('buildRelativeSearchQuery: fileStem を使う', () => {
  const query = buildRelativeSearchQuery('src/styles/button.scss', { matchTarget: 'fileStem' });
  assert.match(query, /button/);
});

test('buildRelativeSearchQuery: parentDir が空なら例外', () => {
  assert.throws(() => buildRelativeSearchQuery('root.ts', { matchTarget: 'parentDir' }), /Relative match target/);
});

test('isRelativeMatchTarget: 値の検証', () => {
  assert.equal(isRelativeMatchTarget('fileName'), true);
  assert.equal(isRelativeMatchTarget('unknown'), false);
});

test('isRelativeReferenceMatch: maxDepth を尊重', () => {
  const config: RelativeSearchConfig = { matchTarget: 'fileName', maxDepth: 1 };
  const ok = isRelativeReferenceMatch('../target.ts', 'src/a/b/c.ts', 'src/a/target.ts', config);
  const ng = isRelativeReferenceMatch('../../target.ts', 'src/a/b/c.ts', 'src/target.ts', config);
  assert.equal(ok, true);
  assert.equal(ng, false);
});

test('isRelativeReferenceMatch: fileStem は拡張子なし一致', () => {
  const config: RelativeSearchConfig = { matchTarget: 'fileStem' };
  const ok = isRelativeReferenceMatch('./target', 'src/a/b/c.ts', 'src/a/b/target.ts', config);
  assert.equal(ok, true);
});

test('buildRelativeSearchQuery: 正規表現メタ文字をエスケープ', () => {
  const query = buildRelativeSearchQuery('src/foo/bar.baz.ts', { matchTarget: 'fileStem' });
  assert.ok(query.includes('bar\\.baz'));
});

test('isRelativeReferenceMatch: parentDir を判定', () => {
  const config: RelativeSearchConfig = { matchTarget: 'parentDir' };
  const ok = isRelativeReferenceMatch('../lib', 'src/app/main.ts', 'src/lib/index.ts', config);
  const ng = isRelativeReferenceMatch('../utils', 'src/app/main.ts', 'src/lib/index.ts', config);
  assert.equal(ok, true);
  assert.equal(ng, false);
});

test('isRelativeReferenceMatch: maxDepth 0 は ./ を許可し ../ を拒否', () => {
  const config: RelativeSearchConfig = { matchTarget: 'fileName', maxDepth: 0 };
  const ok = isRelativeReferenceMatch('./target.ts', 'src/a/b/c.ts', 'src/a/b/target.ts', config);
  const ng = isRelativeReferenceMatch('../target.ts', 'src/a/b/c.ts', 'src/a/target.ts', config);
  assert.equal(ok, true);
  assert.equal(ng, false);
});

test('isRelativeReferenceMatch: fileName は拡張子必須', () => {
  const config: RelativeSearchConfig = { matchTarget: 'fileName' };
  const ok = isRelativeReferenceMatch('./target.ts', 'src/a/b/c.ts', 'src/a/b/target.ts', config);
  const ng = isRelativeReferenceMatch('./target', 'src/a/b/c.ts', 'src/a/b/target.ts', config);
  assert.equal(ok, true);
  assert.equal(ng, false);
});

test('buildRelativeSearchQuery: トークン部の空白を除外', () => {
  const query = buildRelativeSearchQuery('src/foo/bar.ts', { matchTarget: 'fileStem' });
  const regex = new RegExp(`^${query}$`);
  assert.equal(regex.test('./bar'), true);
  assert.equal(regex.test('./bar baz'), false);
});
