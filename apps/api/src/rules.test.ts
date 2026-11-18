import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCsv, validateItem, csvHeader, Catalog, publicRowProblem } from './catalog';
import {
  canonical,
  grade,
  distinctNames,
  selectHsCases,
  pickPool,
  orderPoolIds,
  usableAudio,
  usableImage,
  type PrivateQuestion,
} from './learning';
import { normalizeCode, validateHs, validateTariffScope } from './hs';
import { summarizeImportState } from './import-state';
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

test('pickPool keeps the focus item even beyond the first 100', () => {
  const ids = Array.from({ length: 250 }, (_, i) => `r${i}`);
  const pool = pickPool(ids, 'r240');
  assert.equal(pool[0], 'r240');
  assert.equal(pool.length, 100);
  assert.equal(new Set(pool).size, 100);
  assert.ok(pool.every((id) => ids.includes(id)));
  assert.equal(pickPool(ids.slice(0, 5), undefined).length, 5);
  assert.equal(pickPool(ids, 'missing')[0] === 'missing', false);
});

test('orderPoolIds keeps every media-bearing id plus distractors', () => {
  const ids = Array.from({ length: 250 }, (_, i) => `r${i}`);
  const media = ['r200', 'r221', 'r249'];
  for (let n = 0; n < 20; n += 1) {
    const pool = orderPoolIds(ids, media, undefined);
    assert.equal(pool.length, 100);
    assert.equal(new Set(pool).size, 100);
    assert.ok(media.every((id) => pool.includes(id)));
  }
  assert.equal(orderPoolIds(ids, media, 'r5')[0], 'r5');
  assert.ok(media.every((id) => orderPoolIds(ids, media, 'r5').includes(id)));
  assert.equal(orderPoolIds(ids, [], undefined).length, 100);
});

test('usableAudio requires approved (or internal), unrevoked, matching nameKind', () => {
  const a = (o: Record<string, unknown> = {}) => ({
    role: 'pronunciation',
    nameKind: 'en',
    status: 'approved',
    revokedAt: null,
    ...o,
  });
  for (const internal of [false, true]) {
    assert.equal(usableAudio(a(), 'en', internal), true);
    assert.equal(usableAudio(a({ revokedAt: new Date() }), 'en', internal), false);
    assert.equal(usableAudio(a({ nameKind: 'ja' }), 'en', internal), false);
    assert.equal(usableAudio(a({ role: 'profile' }), 'en', internal), false);
  }
  assert.equal(usableAudio(a({ status: 'draft' }), 'en', false), false);
  assert.equal(usableAudio(a({ status: 'draft' }), 'en', true), true);
  assert.equal(usableImage({ role: 'identification', status: 'draft' }, false), false);
  assert.equal(usableImage({ role: 'identification', status: 'draft' }, true), true);
  assert.equal(
    usableImage({ role: 'identification', status: 'approved', aiGenerated: true }, true),
    false,
  );
  assert.equal(usableImage({ role: 'profile', status: 'approved' }, true), false);
});

test('WCO tariffs are 6-digit only', () => {
  assert.throws(() => validateTariffScope('WCO', 8), /WCO chỉ có cấp 6 số/);
  assert.doesNotThrow(() => validateTariffScope('WCO', 6));
  assert.doesNotThrow(() => validateTariffScope('VN', 8));
});
const rev = (over: Record<string, unknown>) => ({
  id: 'r',
  version: 1,
  status: 'draft',
  data: {},
  releases: [] as unknown[],
  media: [] as { asset: { role: string; revokedAt: Date | null } }[],
  scenarios: [] as { data: unknown }[],
  ...over,
});
test('summarizeImportState uses the latest revision', () => {
  const state = summarizeImportState({
    externalId: 'x',
    revisions: [
      rev({ id: 'a', version: 1, releases: [{}] }),
      rev({
        id: 'b',
        version: 2,
        status: 'approved',
        data: { provenance: { origin: 'prototype:seafood-master-2' } },
        media: [
          { asset: { role: 'profile', revokedAt: new Date() } },
          { asset: { role: 'reference', revokedAt: null } },
        ],
        scenarios: [{ data: { provenance: { prototypeCaseId: 'c1' } } }, { data: {} }],
      }),
    ],
  });
  assert.deepEqual(state, {
    externalId: 'x',
    latest: {
      revisionId: 'b',
      version: 2,
      status: 'approved',
      released: false,
      fromImporter: true,
      hasProfileImage: false,
      scenarioCaseIds: ['c1'],
    },
  });
});
test('summarizeImportState flags released, live profile image, no provenance', () => {
  const { latest } = summarizeImportState({
    externalId: 'x',
    revisions: [
      rev({
        releases: [{}],
        media: [{ asset: { role: 'profile', revokedAt: null } }],
      }),
    ],
  });
  assert.equal(latest.released, true);
  assert.equal(latest.hasProfileImage, true);
  assert.equal(latest.fromImporter, false);
});
