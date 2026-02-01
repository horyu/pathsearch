import test from 'node:test';
import assert from 'node:assert/strict';
import { getMatchingRules } from './rules.ts';
import type { RuleConfig } from './types.ts';

test('getMatchingRules: minimatch に一致', () => {
  const rules: RuleConfig[] = [
    { name: 'tsx', match: '**/*.tsx', transforms: [] },
    { name: 'ts', match: '**/*.ts', transforms: [] }
  ];
  const matches = getMatchingRules(rules, 'src/components/Button.tsx', 'demo');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'tsx');
});

test('getMatchingRules: 空の match は無視', () => {
  const rules: RuleConfig[] = [
    { name: 'empty', match: '', transforms: [] },
    { name: 'tsx', match: '**/*.tsx', transforms: [] }
  ];
  const matches = getMatchingRules(rules, 'src/components/Button.tsx', 'demo');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'tsx');
});

test('getMatchingRules: ルール順を保持', () => {
  const rules: RuleConfig[] = [
    { name: 'first', match: '**/*.ts', transforms: [] },
    { name: 'second', match: '**/*.ts', transforms: [] }
  ];
  const matches = getMatchingRules(rules, 'src/index.ts', 'demo');
  assert.equal(matches.length, 2);
  assert.equal(matches[0].name, 'first');
  assert.equal(matches[1].name, 'second');
});

test('getMatchingRules: Windows パス区切りを正規化', () => {
  const rules: RuleConfig[] = [{ name: 'ts', match: '**/*.ts', transforms: [] }];
  const matches = getMatchingRules(rules, 'src\\index.ts', 'demo');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'ts');
});

test('getMatchingRules: matchWorkspace で絞り込む', () => {
  const rules: RuleConfig[] = [
    { name: 'alpha', match: '**/*.ts', matchWorkspace: 'alpha', transforms: [] },
    { name: 'beta', match: '**/*.ts', matchWorkspace: 'beta', transforms: [] }
  ];
  const matches = getMatchingRules(rules, 'src/index.ts', 'beta');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'beta');
});

test('getMatchingRules: matchWorkspace glob', () => {
  const rules: RuleConfig[] = [
    {
      name: 'apps',
      match: '**/*.ts',
      matchWorkspace: { type: 'glob', values: ['*-app'] },
      transforms: []
    }
  ];
  const matches = getMatchingRules(rules, 'src/index.ts', 'web-app');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'apps');
});

test('getMatchingRules: matchWorkspace regex', () => {
  const rules: RuleConfig[] = [
    {
      name: 'corp',
      match: '**/*.ts',
      matchWorkspace: { type: 'regex', values: ['^corp-'] },
      transforms: []
    }
  ];
  const matches = getMatchingRules(rules, 'src/index.ts', 'corp-tools');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'corp');
});
