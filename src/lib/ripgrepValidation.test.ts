import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFilePatterns,
  normalizeSearchScope,
  validateFilePatterns,
  validateSearchScope
} from './ripgrepValidation.ts';

test('normalizeSearchScope: 空は . に正規化', () => {
  assert.deepEqual(normalizeSearchScope(''), ['.']);
  assert.deepEqual(normalizeSearchScope([]), []);
  assert.deepEqual(normalizeSearchScope(), ['.']);
});

test('validateSearchScope: .. と絶対パスと * を拒否', () => {
  assert.throws(() => validateSearchScope(['../src']));
  assert.throws(() => validateSearchScope(['/abs/path']));
  assert.throws(() => validateSearchScope(['src/*']));
});

test('validateSearchScope: 相対パスは許可し {} は拒否', () => {
  assert.doesNotThrow(() => validateSearchScope(['src/app']));
  assert.throws(() => validateSearchScope(['src/{app,web}']));
});

test('normalizeFilePatterns: 単数と複数', () => {
  assert.deepEqual(normalizeFilePatterns('**/*.ts'), ['**/*.ts']);
  assert.deepEqual(normalizeFilePatterns(['**/*.ts', '!**/*.test.ts']), ['**/*.ts', '!**/*.test.ts']);
  assert.deepEqual(normalizeFilePatterns(), []);
});

test('validateFilePatterns: -- と不正文字を拒否', () => {
  assert.throws(() => validateFilePatterns(['--foo']));
  assert.throws(() => validateFilePatterns(['**/*.ts?']));
});

test('validateFilePatterns: 許可パターン', () => {
  assert.doesNotThrow(() => validateFilePatterns(['**/*.ts', '!**/vendor/**']));
  assert.doesNotThrow(() => validateFilePatterns(['**/*.{ts,tsx}']));
});
