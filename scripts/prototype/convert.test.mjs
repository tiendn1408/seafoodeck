import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  DUPLICATE_SCIENTIFIC,
  mediaInfo,
  parsePrototypeArray,
  planItem,
  toItem,
  toScenario,
} from './convert.mjs';

const speciesSource = `/** header comment */
window.SPECIES = [
  { "id": "black_tiger_shrimp", "group": "crustacean", "name_vi": "Tôm sú",
    "name_en": ["Black tiger shrimp","Giant tiger prawn"],
    "name_ja": { "standard": { "kanji": "牛海老", "kana": "ウシエビ", "romaji": "ushiebi" }, "trade": "ブラックタイガー" },
    "scientific_name": "Penaeus monodon", "family": "Penaeidae", "family_vi": "Họ Tôm he",
    "image": "assets/images/black_tiger_shrimp.jpg", "image_credit": "Wikimedia Commons (CC BY-SA 3.0)",
    "market_price": { "range_vnd": "180.000 - 320.000 đ/kg", "range_usd": "8.50 - 13.50 USD/kg", "spec_ref": "HOSO", "note": "n" },
    "hs_rules": [
      { "state": "frozen", "label_vi": "Đông lạnh", "hs6": "0306.17" },
      { "state": "other", "label_vi": "Khác", "hs6": "n/a" }
    ],
    "verified": false, "notes_vi": "Vỏ có sọc", "rarity": "common" },
  { "id": "plain_fish", "group": "fish", "name_vi": "Cá trơn", "name_en": ["Plain fish"],
    "name_ja": { "standard": { "kanji": null, "kana": "プレーン", "romaji": "puren" }, "trade": null },
    "scientific_name": "Piscis simplex", "image": null, "image_credit": null,
    "hs_rules": [], "verified": false, "notes_vi": "" }
];`;

const caseSource = `window.HS_CASES = [
  { id: "case_001", species_id: "black_tiger_shrimp", scenario_vi: "Tình huống", trap_tag: "bẫy",
    steps: [
      { question_vi: "Chương?", options: ["Chương 03 Tôm", "Chương 16 Chế biến"], answer: 1, explain_vi: "Vì chế biến." },
      { question_vi: "Mã?", options: ["1605.21 (Chưa đóng hộp kín khí)", "1605.29 (Loại khác / Đóng hộp kín khí)"], answer: 0, explain_vi: "Không hộp." }
    ],
    final_hs6: "1605.21", difficulty: 2, verified: false }
];`;

const [full, nullJa] = parsePrototypeArray(speciesSource, 'SPECIES');
const [hsCase] = parsePrototypeArray(caseSource, 'HS_CASES');

test('parsePrototypeArray reads quoted and unquoted keys', () => {
  assert.equal(full.id, 'black_tiger_shrimp');
  assert.equal(hsCase.id, 'case_001');
  assert.equal(parsePrototypeArray(speciesSource, 'SPECIES').length, 2);
});

test('parsePrototypeArray throws when window.X is missing', () => {
  assert.throws(() => parsePrototypeArray(speciesSource, 'HS_CASES'), /window\.HS_CASES/);
});

test('toItem maps fields', () => {
  const item = toItem(full);
  assert.equal(item.externalId, 'black_tiger_shrimp');
  assert.equal(item.sku, 'proto-black_tiger_shrimp');
  assert.equal(item.group, 'Giáp xác');
  assert.equal(item.taxonomicGroup, 'crustacean');
  assert.deepEqual(item.enAliases, ['Giant tiger prawn']);
  assert.deepEqual(item.forms, ['Đông lạnh', 'Khác']);
  assert.deepEqual(item.hsHints, [{ state: 'frozen', labelVi: 'Đông lạnh', hs6: '0306.17' }]);
  assert.equal(item.marketPrice.sourced, false);
  assert.equal(item.rarity, 'common');
  assert.equal(item.provenance.verified, false);
  assert.match(item.provenance.digest, /^[0-9a-f]{64}$/);
});

test('toItem handles missing Japanese names', () => {
  const item = toItem(nullJa);
  assert.equal(item.jaKanji, null);
  assert.equal(item.jaTrade, null);
  assert.deepEqual(item.enAliases, []);
  assert.equal(item.ja, 'プレーン');
  assert.equal(item.pronunciation.ja, 'puren');
  assert.equal(item.group, 'Cá');
  assert.equal('marketPrice' in item, false);
  assert.equal('rarity' in item, false);
});

const require = createRequire(import.meta.url);
let validateItem = null;
try {
  ({ validateItem } = require('../../apps/api/dist/catalog.js'));
} catch {
  /* dist missing */
}
test(
  'toItem passes validateItem',
  { skip: validateItem ? false : 'apps/api/dist chưa build: chạy npm run build:api' },
  () => {
    for (const s of [full, nullJa]) {
      assert.doesNotThrow(() => validateItem(toItem(s)));
    }
  },
);

test('toScenario maps case', () => {
  const sc = toScenario(hsCase);
  assert.equal(sc.code, '1605.21');
  assert.equal(sc.speciesId, 'black_tiger_shrimp');
  assert.deepEqual(sc.data.options, [
    { label: '1605.21', correct: true },
    { label: '1605.29', correct: false },
  ]);
  assert.equal(sc.data.explanation, 'Vì chế biến.\n\nKhông hộp.');
  assert.equal(sc.data.kind, 'code');
  assert.equal(sc.data.steps[1].options[0].label, '1605.21 (Chưa đóng hộp kín khí)');
  assert.equal(sc.data.provenance.prototypeCaseId, 'case_001');
});

test('toScenario throws when final_hs6 mismatches', () => {
  assert.throws(() => toScenario({ ...hsCase, final_hs6: '1605.29' }));
});

test('mediaInfo', () => {
  const m = mediaInfo(full);
  assert.equal(m.role, 'profile');
  assert.equal(m.aiGenerated, 'false');
  assert.ok(m.rights.startsWith('CC BY-SA 3.0'));
  assert.match(m.source, /black_tiger_shrimp\.jpg/);
  assert.equal(mediaInfo(nullJa), null);
});

test('planItem', () => {
  const st = (o) => ({
    externalId: 'x',
    latest: { fromImporter: true, status: 'draft', released: false, version: 1, ...o },
  });
  assert.equal(planItem(null, full), 'create');
  assert.equal(planItem(st({}), full), 'resume');
  assert.equal(planItem(st({ released: true }), full), 'skip-existing');
  assert.equal(planItem(st({ fromImporter: false }), full), 'skip-existing');
  assert.equal(planItem(st({ version: 2 }), full), 'skip-existing');
  assert.equal(planItem(st({ status: 'revoked' }), full), 'skip-existing');
  assert.equal(DUPLICATE_SCIENTIFIC.length, 4);
});
