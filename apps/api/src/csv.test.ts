import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from './csv';

test('csvCell: formula starters get a leading quote', () => {
  for (const v of ['=SUM(A1)', '+1', '-1', '@x', '\tx', '\rx', '\nx'])
    assert.ok(csvCell(v).replace(/^"/, '').startsWith("'"), JSON.stringify(v));
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('\tx'), "'\tx");
});
test('csvCell: quoting, nulls, numbers, unicode', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('a\nb'), '"a\nb"');
  assert.equal(csvCell('x\r\ny'), '"x\r\ny"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(3.5), '3.5');
  assert.equal(csvCell(-2), '-2');
  assert.equal(csvCell('Nguyễn Văn Á ひらがな'), 'Nguyễn Văn Á ひらがな');
});
test('toCsv: BOM and CRLF', () => {
  const out = toCsv(
    ['a', 'b'],
    [
      ['1', null],
      ['x,y', 2],
    ],
  );
  assert.equal(out, '﻿a,b\r\n1,\r\n"x,y",2\r\n');
});
