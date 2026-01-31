import test from 'node:test';
import assert from 'node:assert/strict';
import { transformPath } from './transformPath.ts';

test('transformPath: キャプチャを置換できる', () => {
  const result = transformPath(
    {
      extractFrom: '.*/components/(.*)\\.tsx$',
      searchFor: 'import.*from "$1"'
    },
    'src/components/Button.tsx'
  );
  assert.equal(result, 'import.*from "Button"');
});

test('transformPath: マッチしない場合は例外', () => {
  assert.throws(
    () =>
      transformPath(
        {
          extractFrom: '.*/pages/(.*)\\.tsx$',
          searchFor: '$1'
        },
        'src/components/Button.tsx'
      ),
    /Transform failed: Pattern/
  );
});

test('transformPath: $0 置換に対応', () => {
  const result = transformPath(
    {
      extractFrom: '.*/(.*)\\.ts$',
      searchFor: '$0:$1'
    },
    'src/utils/math.ts'
  );
  assert.equal(result, 'src/utils/math.ts:math');
});

test('transformPath: $10 が $1 に部分一致しない', () => {
  const result = transformPath(
    {
      extractFrom: '^(.)(.)(.)(.)(.)(.)(.)(.)(.)(.).*$',
      searchFor: '$10-$1'
    },
    'abcdefghij'
  );
  assert.equal(result, 'j-a');
});

test('transformPath: $11 と欠番グループは空', () => {
  const result = transformPath(
    {
      extractFrom: '^(.)(.)(.)(.)(.)(.)(.)(.)(.)(.).*$',
      searchFor: '$11-$9-$1'
    },
    'abcdefghij'
  );
  assert.equal(result, '-i-a');
});

test('transformPath: 不正な正規表現は例外', () => {
  assert.throws(
    () =>
      transformPath(
        {
          extractFrom: '(**',
          searchFor: '$1'
        },
        'src/index.ts'
      ),
    /Transform failed/
  );
});
