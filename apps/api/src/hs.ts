import { BadRequestException } from '@nestjs/common';
export interface HsData {
  prompt: string;
  explanation: string;
  kind: 'code' | 'insufficient';
  facts: Record<string, boolean | 'unknown'>;
  requiredFact?: string;
  options: { label: string; correct: boolean }[];
  followUps?: { label: string; correct: boolean; fact?: string }[];
}
export function normalizeCode(input: string, level: number) {
  const value = input.replace(/[.\s]/g, '');
  if (![6, 8].includes(level) || !/^\d+$/.test(value) || value.length !== level)
    throw new BadRequestException(`Cần đúng mã ${level} số; không tự nối hoặc cắt mã.`);
  return value;
}
export function validateHs(
  data: HsData,
  tariff: { code: string; level: number; source: string; reviewedBy: string | null } | null,
) {
  if (
    !data ||
    !data.prompt ||
    !data.explanation ||
    !['code', 'insufficient'].includes(data.kind) ||
    !data.facts ||
    Object.values(data.facts).some((v) => typeof v !== 'boolean' && v !== 'unknown') ||
    !Array.isArray(data.options) ||
    data.options.filter((o) => o.correct).length !== 1
  )
    throw new BadRequestException('Hồ sơ HS thiếu đề, dữ kiện hoặc đúng một đáp án.');
  if (data.kind === 'insufficient') {
    if (
      !data.requiredFact ||
      data.facts[data.requiredFact] !== 'unknown' ||
      !data.followUps ||
      data.followUps.filter((o) => o.correct && o.fact === data.requiredFact).length !== 1
    )
      throw new BadRequestException(
        'Case thiếu dữ kiện phải chỉ rõ unknown và đúng câu hỏi cần bổ sung.',
      );
  } else {
    if (!tariff?.source || !tariff.reviewedBy)
      throw new BadRequestException('Nguồn/mã HS chưa được duyệt.');
    if (
      normalizeCode(data.options.find((o) => o.correct)!.label, tariff.level) !==
      normalizeCode(tariff.code, tariff.level)
    )
      throw new BadRequestException('Đáp án không khớp dòng mã đã duyệt.');
  }
}
export function validateTariffScope(market: string, level: number) {
  if (market === 'WCO' && level !== 6)
    throw new BadRequestException('Danh mục WCO chỉ có cấp 6 số.');
}
