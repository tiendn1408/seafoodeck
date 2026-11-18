import type { NameEntry, TradeScenario, TariffReference } from './models';

export function normalizeName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi');
}
export function gradeName(value: string, entry: NameEntry): boolean {
  const forms = [entry.label, ...(entry.status === 'approved' ? entry.acceptedForms : [])];
  return forms.some((form) => normalizeName(form) === normalizeName(value));
}
export function normalizeHs(value: string): string | null {
  if (!/^[\d.\s]+$/u.test(value)) return null;
  const compact = value.replace(/\s/gu, '');
  if (!/^(?:\d{6}|\d{8}|\d{4}\.\d{2}(?:\.\d{2})?)$/u.test(compact)) return null;
  return compact.replace(/\./g, '');
}
export function gradeHs(
  scenario: TradeScenario,
  tariff: TariffReference,
  answer: string,
  followUp?: string,
): { correct: boolean; needsFollowUp: boolean } {
  if (answer === 'insufficient') {
    if (!followUp) return { correct: false, needsFollowUp: true };
    return {
      correct: scenario.answerType === 'insufficient' && followUp === scenario.missingFact,
      needsFollowUp: false,
    };
  }
  const code = normalizeHs(answer);
  return {
    correct:
      scenario.answerType === 'code' &&
      code?.length === scenario.expectedCodeLength &&
      code === normalizeHs(tariff.code),
    needsFollowUp: false,
  };
}
