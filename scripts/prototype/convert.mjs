import { createHash } from 'node:crypto';
import JSON5 from 'json5';

export const DUPLICATE_SCIENTIFIC = [
  'Gadus morhua',
  'Thunnus albacares',
  'Meretrix lyrata',
  'Perna viridis',
];

const ORIGIN = 'prototype:seafood-master-2';
const GROUP_VI = { fish: 'Cá', crustacean: 'Giáp xác', mollusc: 'Nhuyễn thể', other: 'Khác' };
const HS6 = /^\d{4}\.\d{2}$/;
const BARE_CODE = /^\d{4}\.\d{2}/;

export function parsePrototypeArray(source, globalName) {
  const marker = new RegExp(`window\\.${globalName}\\s*=`);
  const match = marker.exec(source);
  if (!match) throw new Error(`Không thấy window.${globalName} trong dữ liệu prototype.`);
  let body = source.slice(match.index + match[0].length).trim();
  body = body.replace(/;\s*$/, '');
  const value = JSON5.parse(body);
  if (!Array.isArray(value)) throw new Error(`window.${globalName} không phải mảng.`);
  return value;
}

export function toItem(species) {
  const names = species.name_en ?? [];
  const ja = species.name_ja ?? {};
  const std = ja.standard ?? {};
  const rules = species.hs_rules ?? [];
  const pronunciation = {};
  if (std.romaji) pronunciation.ja = std.romaji;
  const item = {
    externalId: species.id,
    group: GROUP_VI[species.group] ?? 'Khác',
    sku: `proto-${species.id}`,
    vi: species.name_vi,
    en: names[0] ?? '',
    ja: std.kana ?? '',
    scientific: species.scientific_name ?? '',
    source: 'Prototype seafood-master-2 — chưa kiểm chứng',
    aliases: [],
    forms: rules.map((r) => r.label_vi),
    identification: species.notes_vi ?? '',
    note: 'Nhập từ prototype; tên, ảnh, HS và giá chưa kiểm chứng.',
    pronunciation,
    taxonomicGroup: GROUP_VI[species.group] ? species.group : 'other',
    enAliases: names.slice(1),
    jaKanji: std.kanji ?? null,
    jaTrade: ja.trade ?? null,
    tradeRestriction: null,
    hsHints: rules
      .filter((r) => HS6.test(r.hs6 ?? ''))
      .map((r) => ({ state: r.state, labelVi: r.label_vi, hs6: r.hs6 })),
    provenance: {
      origin: ORIGIN,
      prototypeId: species.id,
      digest: createHash('sha256').update(JSON.stringify(species)).digest('hex'),
      verified: false,
    },
  };
  if (species.family) item.family = species.family;
  if (species.family_vi) item.familyVi = species.family_vi;
  if (species.rarity) item.rarity = species.rarity;
  if (species.market_price) {
    const m = species.market_price;
    item.marketPrice = {
      rangeUsd: m.range_usd ?? '',
      rangeVnd: m.range_vnd ?? '',
      specRef: m.spec_ref ?? '',
      note: m.note ?? '',
      sourced: false,
    };
  }
  return item;
}

export function toScenario(hsCase) {
  const steps = hsCase.steps ?? [];
  const last = steps[steps.length - 1];
  if (!last) throw new Error(`Hồ sơ ${hsCase.id} không có bước nào.`);
  const options = last.options.map((label, i) => {
    const m = BARE_CODE.exec(label);
    if (!m) throw new Error(`Hồ sơ ${hsCase.id}: lựa chọn "${label}" không bắt đầu bằng mã HS.`);
    return { label: m[0], correct: i === last.answer };
  });
  const correct = options.find((o) => o.correct);
  if (!correct || correct.label !== hsCase.final_hs6)
    throw new Error(
      `Hồ sơ ${hsCase.id}: đáp án bước cuối (${correct?.label}) khác final_hs6 (${hsCase.final_hs6}).`,
    );
  return {
    speciesId: hsCase.species_id,
    code: hsCase.final_hs6,
    data: {
      prompt: hsCase.scenario_vi,
      explanation: steps.map((s) => s.explain_vi).join('\n\n'),
      kind: 'code',
      facts: {},
      options,
      steps: steps.map((s) => ({
        question: s.question_vi,
        options: s.options.map((label, i) => ({ label, correct: i === s.answer })),
        explanation: s.explain_vi,
      })),
      trapTag: hsCase.trap_tag,
      provenance: { origin: ORIGIN, prototypeCaseId: hsCase.id, verified: false },
    },
  };
}

export function mediaInfo(species) {
  if (!species.image) return null;
  const credit = species.image_credit ?? '';
  const paren = /\(([^)]*)\)/.exec(credit);
  const license = paren ? paren[1].trim() : credit.trim();
  return {
    role: 'profile',
    source: `Prototype seafood-master-2 assets/images/${species.id}.jpg — chưa có link file gốc`,
    credit,
    rights: `${license} — thiếu tác giả/link, chưa đủ ghi công`,
    aiGenerated: 'false',
  };
}

export function planItem(state, _item) {
  if (!state) return 'create';
  const { fromImporter, status, released } = state.latest;
  if (fromImporter && status === 'draft' && !released) return 'resume';
  return 'skip-existing';
}
