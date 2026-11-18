import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCsv, validateItem, csvHeader, Catalog, publicRowProblem } from './catalog';
import { canonical, grade, distinctNames, selectHsCases, type PrivateQuestion } from './learning';
import { normalizeCode, validateHs } from './hs';
import { passwordHash, passwordMatches } from './security';
const item = {
  externalId: 'cod-test',
  sku: 'SKU-1',
  group: 'Cá',
  vi: 'Cá mẫu nội bộ',
  en: 'Test fish',
  ja: 'テスト',
  scientific: 'Gadus morhua',
  source: 'Internal test source',
  aliases: [],
  forms: [],
  identification: 'Test only',
  note: 'Not customer material',
  pronunciation: {},
};
test('catalog accepts shrimp and keeps unknown species as a draft', () => {
  assert.equal(validateItem({ ...item, scientific: '' }).scientific, '');
  assert.equal(validateItem({ ...item, vi: 'Tôm sú', en: 'Black tiger shrimp' }).vi, 'Tôm sú');
});
const extended = {
  taxonomicGroup: 'crustacean',
  family: 'Penaeidae',
  familyVi: 'Họ Tôm he',
  enAliases: ['Giant tiger prawn'],
  jaKanji: '牛海老',
  jaTrade: 'ブラックタイガー',
  rarity: 'common',
  tradeRestriction: null,
  marketPrice: {
    rangeUsd: '8.50 - 13.50 USD/kg',
    rangeVnd: '180.000 - 320.000 đ/kg',
    specRef: 'HOSO',
    note: 'n',
    sourced: false,
  },
  hsHints: [{ state: 'frozen', labelVi: 'Đông lạnh', hs6: '0306.17' }],
  provenance: {
    origin: 'prototype:seafood-master-2',
    prototypeId: 'black_tiger_shrimp',
    digest: 'abc',
    verified: false,
  },
};
test('extended prototype fields survive validation round-trip', () => {
  assert.deepEqual(validateItem({ ...item, ...extended }), { ...item, ...extended });
  assert.deepEqual(Object.keys(validateItem(item)).sort(), Object.keys(item).sort());
});
test('extended fields are type-checked', () => {
  assert.throws(() => validateItem({ ...item, rarity: 'mythic' }));
  assert.throws(() => validateItem({ ...item, taxonomicGroup: 'bird' }));
  assert.throws(() => validateItem({ ...item, enAliases: [1] }));
  assert.throws(() =>
    validateItem({ ...item, marketPrice: { ...extended.marketPrice, sourced: true } }),
  );
  assert.throws(() =>
    validateItem({ ...item, hsHints: [{ state: 'x', labelVi: 'y', hs6: '306' }] }),
  );
  assert.throws(() =>
    validateItem({ ...item, provenance: { ...extended.provenance, verified: true } }),
  );
});
test('CSV detects every invalid/duplicate row without accepting a partial import', () => {
  const line =
    'sample,S-1,Cá,Cá mẫu,Sample,テスト,Gadus morhua,Test source,,,Test only,Internal fixture,,,\n';
  const result = readCsv(csvHeader + '\n' + line + line);
  assert.equal(result.count, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].row, 3);
});
test('CSV supports UTF-8 BOM and rejects excessive rows/bytes', () => {
  const line =
    'sample,S-1,Cá,Cá mẫu,Sample,テスト,Gadus morhua,Test source,,,Test only,Internal fixture,,,\n';
  assert.equal(readCsv('\ufeff' + csvHeader + '\n' + line).errors.length, 0);
  assert.throws(() => readCsv('a'.repeat(2097153)));
});
test('HS preserves leading zeroes and refuses cross-level codes', () => {
  assert.equal(normalizeCode('0303.42', 6), '030342');
  assert.throws(() => normalizeCode('030342', 8));
  assert.throws(() => normalizeCode('03034211', 6));
});
test('HS unknown is distinct from false and a case must name its actual missing fact', () => {
  const data = {
    prompt: 'Test',
    explanation: 'Internal fixture',
    kind: 'insufficient' as const,
    facts: { filleted: 'unknown' as const },
    requiredFact: 'filleted',
    options: [{ label: 'Chưa đủ thông tin', correct: true }],
    followUps: [{ label: 'Nguyên con hay phi lê?', correct: true, fact: 'filleted' }],
  };
  validateHs(data, null);
  assert.throws(() => validateHs({ ...data, facts: { filleted: false } }, null));
});
test('server grades opaque options, follow-up and skip without exposing a key', () => {
  const q: PrivateQuestion = {
    type: 'hs',
    targetId: 'case',
    skill: 'hs',
    prompt: 'Question',
    options: [
      { id: 'opaque-1', label: 'Code' },
      { id: 'opaque-2', label: 'Unknown' },
    ],
    correct: 'opaque-2',
    followUps: [{ id: 'opaque-f', label: 'Ask form' }],
    correctFollowUp: 'opaque-f',
    explanation: 'After submit only',
  };
  assert.throws(() => grade(q, { optionId: 'Code' }));
  assert.throws(() => grade(q, { optionId: 'opaque-2' }));
  assert.equal(grade(q, { optionId: 'opaque-2', followUpId: 'opaque-f' }).correct, true);
  assert.deepEqual(grade(q, { skip: true }), {
    answered: false,
    skipped: true,
    correct: false,
    selfRated: false,
  });
});
test('match refuses duplicate right options and checks every pair', () => {
  const q: PrivateQuestion = {
    type: 'match',
    targetId: 'board',
    skill: 'match:en',
    prompt: 'Match',
    pairs: { a: 'x', b: 'y', c: 'z' },
    explanation: '',
  };
  assert.throws(() => grade(q, { pairs: { a: 'x', b: 'x', c: 'z' } }));
  assert.equal(grade(q, { pairs: { a: 'x', b: 'y', c: 'z' } }).correct, true);
  assert.equal(grade(q, { pairs: { a: 'y', b: 'x', c: 'z' } }).correct, false);
});
test('idempotency canonical form ignores property order and includes actual payload', () => {
  assert.equal(canonical({ a: 1, b: { c: 2 } }), canonical({ b: { c: 2 }, a: 1 }));
  assert.notEqual(canonical({ a: 1 }), canonical({ a: 2 }));
});
test('administrator credentials are salted and compared with a memory-hard hash', () => {
  const a = passwordHash('long-test-password'),
    b = passwordHash('long-test-password');
  assert.notEqual(a, b);
  assert.equal(passwordMatches('long-test-password', a), true);
  assert.equal(passwordMatches('wrong', a), false);
});

test('matching excludes case and Unicode variants in both name directions', () => {
  const rows = [
    { vi: 'Cá tuyết', en: 'Cod' },
    { vi: 'Cá khác', en: 'ＣＯＤ' },
    { vi: ' cá tuyết ', en: 'Other fish' },
    { vi: 'Cá ngừ', en: 'Tuna' },
    { vi: 'Vẹm xanh', en: 'Mussel' },
  ];
  assert.deepEqual(
    distinctNames(rows, (r) => [r.vi, r.en]),
    [rows[0], rows[3], rows[4]],
  );
});
test('HS round includes its paired forms and missing facts; due review can target a later case', () => {
  const rows = [
    { id: '1', revisionId: 'other', tariffId: 'ref-other', data: { kind: 'code' } },
    { id: '2', revisionId: 'tuna', tariffId: 'whole', data: { kind: 'code' } },
    { id: '3', revisionId: 'tuna', tariffId: 'fillet', data: { kind: 'code' } },
    { id: '4', revisionId: 'tuna', tariffId: null, data: { kind: 'insufficient' } },
    { id: '5', revisionId: 'later-item', tariffId: 'late', data: { kind: 'code' } },
  ];
  assert.deepEqual(
    selectHsCases(rows).map((r) => r.id),
    ['2', '3', '4'],
  );
  assert.equal(selectHsCases(rows, '5')[0].id, '5');
  assert.throws(() => selectHsCases(rows, 'missing'));
});
test('learner DTO exposes names/taxonomy but never unsourced fields', () => {
  const dto = new Catalog(null as never).dto({
    id: 'r1',
    data: { ...item, ...extended },
    names: [],
    media: [],
  });
  assert.equal(dto.family, 'Penaeidae');
  assert.equal(dto.jaTrade, 'ブラックタイガー');
  assert.deepEqual(dto.enAliases, ['Giant tiger prawn']);
  for (const k of ['rarity', 'marketPrice', 'hsHints', 'provenance', 'tradeRestriction'])
    assert.ok(!(k in dto), k);
  assert.ok(!/USD|đ\/kg|0306\.17/.test(JSON.stringify(dto)));
});
test('legacy item DTO has empty extended fields', () => {
  const dto = new Catalog(null as never).dto({ id: 'r1', data: item, names: [], media: [] });
  assert.equal(dto.family, null);
  assert.deepEqual(dto.enAliases, []);
});

const publicNames = ['vi', 'en', 'ja', 'scientific'].map((kind) => ({ kind, source: 'src' }));
test('public publish no longer requires approved audio', () => {
  assert.equal(
    publicRowProblem({ status: 'approved', reviewedBy: 'u1', names: publicNames }),
    null,
  );
  assert.match(
    publicRowProblem({ status: 'draft', reviewedBy: null, names: publicNames })!,
    /duyệt/,
  );
  assert.match(
    publicRowProblem({ status: 'approved', reviewedBy: 'u1', names: publicNames.slice(1) })!,
    /tên/,
  );
});
