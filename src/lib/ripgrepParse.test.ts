import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRipgrepMatches } from './ripgrepParse.ts';

test('parseRipgrepMatches: match 行のみを抽出する', () => {
  const matchLine = JSON.stringify({
    type: 'match',
    data: {
      path: { text: 'src/a.ts' },
      line_number: 2,
      lines: { text: 'hello world\n' },
      submatches: [{ start: 6, end: 11 }]
    }
  });
  const ignoreLine = JSON.stringify({ type: 'begin' });

  const matches = parseRipgrepMatches(`${ignoreLine}\n${matchLine}\n`);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0], {
    relativePath: 'src/a.ts',
    lineNumber: 1,
    column: 6,
    endColumn: 11,
    matchText: 'world'
  });
});

test('parseRipgrepMatches: 空文字や壊れた JSON は無視する', () => {
  const output = '\n{invalid}\n';
  const matches = parseRipgrepMatches(output);
  assert.equal(matches.length, 0);
});

test('parseRipgrepMatches: submatches が無い場合は無視する', () => {
  const line = JSON.stringify({
    type: 'match',
    data: {
      path: { text: 'src/b.ts' },
      line_number: 1,
      lines: { text: 'hello\n' },
      submatches: []
    }
  });

  const matches = parseRipgrepMatches(`${line}\n`);
  assert.equal(matches.length, 0);
});
