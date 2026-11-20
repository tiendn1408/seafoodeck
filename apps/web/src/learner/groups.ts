export type GroupKey = 'fish' | 'crustacean' | 'mollusc' | 'other' | 'none';
const TONES: Record<GroupKey, string> = {
  fish: 'Cá',
  crustacean: 'Giáp xác',
  mollusc: 'Nhuyễn thể',
  other: 'Khác',
  none: 'Chưa phân nhóm',
};
export function groupTone(g: string | null | undefined): {
  key: GroupKey;
  label: string;
  css: string;
} {
  const key: GroupKey = g && g !== 'none' && Object.hasOwn(TONES, g) ? (g as GroupKey) : 'none';
  return { key, label: TONES[key], css: `var(--group-${key})` };
}
