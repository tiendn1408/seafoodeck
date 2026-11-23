import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, localMinute, toCsv } from './csv';

test('csvCell: formula starters get a leading quote', () => {
  for (const v of ['=SUM(A1)', '+1', '-1', '@x', '\tx', '\rx', '\nx'])
    assert.ok(csvCell(v).replace(/^"/, '').startsWith("'"), JSON.stringify(v));
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('\tx'), "'\tx");
});
test('csvCell: every C0 control character at the start is neutralised', () => {
  for (let c = 0; c < 0x20; c++) {
    const v = String.fromCharCode(c) + 'x';
    assert.ok(csvCell(v).replace(/^"/, '').startsWith("'"), `U+${c.toString(16)}`);
  }
  assert.equal(csvCell('\u0000=1'), "'\u0000=1");
  assert.equal(csvCell('\u001fx'), "'\u001fx");
  // A control character later in the cell is left alone; a space or letter start is plain.
  assert.equal(csvCell('a\u0001'), 'a\u0001');
  assert.equal(csvCell(' =1'), ' =1');
});
test('localMinute: Ho Chi Minh wall time to the minute, null stays empty', () => {
  assert.equal(localMinute('2026-06-09T03:01:00.000Z'), '2026-06-09 10:01');
  assert.equal(localMinute('2026-12-31T17:30:59.999Z'), '2027-01-01 00:30');
  assert.equal(localMinute('2026-01-05T00:00:00.000Z'), '2026-01-05 07:00');
  assert.equal(localMinute(null), null);
  assert.equal(localMinute('not-a-date'), null);
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
