export interface ExtraRow {
  label: string;
  value: string;
  unsourced: boolean;
}

const GROUPS: Record<string, string> = {
  fish: 'Cá',
  crustacean: 'Giáp xác',
  mollusc: 'Nhuyễn thể',
  other: 'Khác',
};
const RARITY: Record<string, string> = {
  common: 'Phổ biến',
  uncommon: 'Khá hiếm',
  rare: 'Hiếm',
  legendary: 'Rất hiếm',
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function extraRows(data: Record<string, unknown>): ExtraRow[] {
  const rows: ExtraRow[] = [];
  const add = (label: string, value: string, unsourced = false) => {
    if (value) rows.push({ label, value, unsourced });
  };

  const group = text(data.taxonomicGroup);
  add('Nhóm phân loại', GROUPS[group] ?? group);

  const family = text(data.family);
  const familyVi = text(data.familyVi);
  add('Họ', family && familyVi ? `${family} (${familyVi})` : family || familyVi);

  const aliases = Array.isArray(data.enAliases) ? data.enAliases.map(text).filter(Boolean) : [];
  add('Tên Anh khác', aliases.join(', '));
  add('Kanji', text(data.jaKanji));
  add('Tên thương mại Nhật', text(data.jaTrade));

  const rarity = text(data.rarity);
  add('Độ hiếm', RARITY[rarity] ?? rarity, true);
  add('Hạn chế thương mại', text(data.tradeRestriction));

  if (isRecord(data.marketPrice)) {
    const p = data.marketPrice;
    add(
      'Giá tham khảo',
      [text(p.rangeUsd), text(p.rangeVnd), text(p.specRef)].filter(Boolean).join(' · '),
      true,
    );
  }

  if (Array.isArray(data.hsHints)) {
    const hints = data.hsHints
      .filter(isRecord)
      .map((h) => (text(h.labelVi) && text(h.hs6) ? `${text(h.labelVi)}: ${text(h.hs6)}` : ''))
      .filter(Boolean);
    add('Gợi ý HS', hints.join('; '), true);
  }

  if (isRecord(data.provenance)) {
    const o = data.provenance;
    const parts = [text(o.origin), text(o.prototypeId)].filter(Boolean);
    if (parts.length) add('Nguồn gốc', [...parts, 'chưa kiểm chứng'].join(' · '));
  }
  return rows;
}
