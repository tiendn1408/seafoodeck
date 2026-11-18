import { describe, expect, it } from 'vitest';
import { extraRows } from './itemExtras';

const proto = {
  vi: 'Cá hồi',
  taxonomicGroup: 'fish',
  family: 'Salmonidae',
  familyVi: 'Họ cá hồi',
  enAliases: ['Atlantic salmon', 'Salmon'],
  jaKanji: '鮭',
  jaTrade: null,
  rarity: 'uncommon',
  tradeRestriction: null,
  marketPrice: {
    rangeUsd: '8.50 - 13.50 USD/kg',
    rangeVnd: '210.000 - 340.000 VND/kg',
    specRef: 'fillet',
    note: '',
    sourced: false,
  },
  hsHints: [
    { state: 'fresh', labelVi: 'Tươi', hs6: '0302.14' },
    { state: 'frozen', labelVi: 'Đông lạnh', hs6: '0303.13' },
  ],
  provenance: {
    origin: 'prototype:seafood-master-2',
    prototypeId: 'p-1',
    digest: 'abc',
    verified: false,
  },
};

describe('extraRows', () => {
  it('formats prototype fields and flags unsourced ones', () => {
    const rows = extraRows(proto);
    const price = rows.find((r) => r.label === 'Giá tham khảo');
    expect(price?.value).toContain('8.50 - 13.50 USD/kg');
    expect(price?.unsourced).toBe(true);
    expect(rows.find((r) => r.label === 'Nhóm phân loại')?.value).toBe('Cá');
    expect(rows.find((r) => r.label === 'Họ')?.value).toBe('Salmonidae (Họ cá hồi)');
    expect(rows.find((r) => r.label === 'Độ hiếm')).toMatchObject({
      value: 'Khá hiếm',
      unsourced: true,
    });
    expect(rows.find((r) => r.label === 'Gợi ý HS')).toMatchObject({
      value: 'Tươi: 0302.14; Đông lạnh: 0303.13',
      unsourced: true,
    });
    expect(rows.find((r) => r.label === 'Nguồn gốc')?.value).toBe(
      'prototype:seafood-master-2 · p-1 · chưa kiểm chứng',
    );
    expect(rows.find((r) => r.label === 'Kanji')?.value).toBe('鮭');
    expect(rows.find((r) => r.label === 'Tên Anh khác')?.value).toBe('Atlantic salmon, Salmon');
    expect(rows.some((r) => r.label === 'Tên thương mại Nhật')).toBe(false);
    expect(rows.some((r) => r.label === 'Hạn chế thương mại')).toBe(false);
  });

  it('returns nothing for non-object data', () => {
    for (const bad of [null, undefined, [], ['x'], 'text', 5]) expect(extraRows(bad)).toEqual([]);
  });

  it('returns nothing for legacy items', () => {
    expect(extraRows({ vi: 'Tôm', en: 'Shrimp' })).toEqual([]);
  });
});
