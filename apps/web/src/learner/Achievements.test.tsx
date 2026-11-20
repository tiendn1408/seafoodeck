import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Achievements, badgeGoal, modeLabel, vnDate, vnDateTime } from './Achievements';
import { mount, unmountAll } from './testDom';
import type { MeBadge } from '../pilot/api';

afterEach(unmountAll);

const badges: MeBadge[] = [
  { id: 'first10', label: '10 loài đầu tiên', earnedAt: '2026-11-19T18:30:00.000Z' },
  { id: 'streak7', label: '7 ngày liên tiếp', earnedAt: null },
  { id: 'mystery', label: 'Huy hiệu lạ', earnedAt: null },
];

describe('Achievements', () => {
  it('shows a badge with earnedAt as earned, dated in Vietnam time', () => {
    const host = mount(<Achievements streak={{ current: 3, longest: 5 }} badges={badges} />);
    const earned = host.querySelector('[data-badge="first10"]')!;
    expect(earned.getAttribute('data-earned')).toBe('true');
    expect(earned.textContent).toContain('10 loài đầu tiên');
    // 18:30Z on the 19th is already the 20th in Asia/Ho_Chi_Minh.
    expect(earned.textContent).toContain('Đạt ngày 20/11/2026');
    expect(host.querySelector('#achievements-earned')!.textContent).toContain('1 / 3');
  });

  it('never shows earnedAt: null as earned; shows the goal in words instead', () => {
    const host = mount(<Achievements streak={{ current: 3, longest: 5 }} badges={badges} />);
    const later = host.querySelector('[data-badge="streak7"]')!;
    expect(later.getAttribute('data-earned')).toBe('false');
    expect(later.textContent).toContain('Chưa đạt');
    expect(later.textContent).toContain('Học 7 ngày liên tiếp (tính chuỗi dài nhất)');
    expect(later.textContent).not.toContain('Đạt ngày');
    const unknown = host.querySelector('[data-badge="mystery"]')!;
    expect(unknown.getAttribute('data-earned')).toBe('false');
    expect(unknown.textContent).toContain('Huy hiệu lạ');
  });

  it('shows the current and longest streak with a seven-float rope', () => {
    const host = mount(<Achievements streak={{ current: 3, longest: 5 }} badges={[]} />);
    const streak = host.querySelector('.achievements-streak')!;
    expect(streak.textContent).toContain('3 ngày');
    expect(streak.textContent).toContain('Dài nhất 5 ngày');
    expect(streak.querySelectorAll('.achievements-days i')).toHaveLength(7);
    expect(streak.querySelectorAll('.achievements-days i.on')).toHaveLength(3);
    expect(streak.textContent).not.toContain('Học hôm nay để bắt đầu chuỗi ngày');
  });

  it('invites the learner to study today when the streak is 0', () => {
    const host = mount(<Achievements streak={{ current: 0, longest: 4 }} badges={[]} />);
    const streak = host.querySelector('.achievements-streak')!;
    expect(streak.textContent).toContain('Học hôm nay để bắt đầu chuỗi ngày');
    expect(streak.querySelectorAll('.achievements-days i.on')).toHaveLength(0);
    expect(streak.textContent).toContain('Dài nhất 4 ngày');
  });

  it('caps the rope at seven filled floats for long streaks', () => {
    const host = mount(<Achievements streak={{ current: 12, longest: 12 }} badges={[]} />);
    expect(host.querySelectorAll('.achievements-days i.on')).toHaveLength(7);
    expect(host.textContent).toContain('12 ngày');
  });
});

describe('labels and dates', () => {
  it('maps session mode codes to Vietnamese labels', () => {
    expect(modeLabel('review')).toBe('Ôn tập');
    expect(modeLabel('flashcard')).toBe('Flashcard');
    expect(modeLabel('match')).toBe('Ghép tên');
    expect(modeLabel('image')).toBe('Đoán hình');
    expect(modeLabel('hs')).toBe('HS');
    expect(modeLabel('listening')).toBe('Nghe tên');
    expect(modeLabel('other')).toBe('other');
  });

  // Pinned against the server rules in apps/api: progress-achievements.ts badges() and
  // progress.service.ts (speciesSeen, solidSpecies = level >= 3, review sessions, longest streak).
  it.each([
    ['first10', 'Học 10 loài khác nhau'],
    ['streak7', 'Học 7 ngày liên tiếp (tính chuỗi dài nhất)'],
    ['solid50', 'Đưa 50 loài lên mốc 7 ngày'],
    ['species100', 'Học 100 loài khác nhau'],
    ['review10', 'Ôn tập trong 10 phiên khác nhau'],
  ])('goal text of %s matches the server rule', (id, goal) => {
    expect(badgeGoal({ id, label: 'x', earnedAt: null })).toBe(goal);
  });

  it('goals fall back to the server label for unknown ids', () => {
    expect(badgeGoal({ id: 'nope', label: 'Nhãn', earnedAt: null })).toBe('Nhãn');
  });

  it('formats instants in Asia/Ho_Chi_Minh', () => {
    expect(vnDate('2026-11-19T18:30:00.000Z')).toBe('20/11/2026');
    expect(vnDateTime('2026-11-19T18:30:00.000Z')).toBe('01:30 20/11/2026');
  });

  it('shows a dash for a malformed instant, never "Invalid Date"', () => {
    for (const bad of ['', 'not-a-date', '2026-13-45T99:00:00Z']) {
      expect(vnDate(bad)).toBe('—');
      expect(vnDateTime(bad)).toBe('—');
    }
  });
});

describe('achievements colours', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const tokens = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');
  const css = readFileSync(resolve(__dirname, 'achievements.css'), 'utf8');
  const light = tokens.slice(0, tokens.indexOf('@media (prefers-color-scheme: dark)'));
  const dark = tokens.slice(tokens.indexOf(":root[data-theme='dark']"));
  const pick = (block: string, n: string) =>
    block.match(new RegExp(`--${n}:\\s*(#[0-9a-f]{6})`, 'i'))![1];
  const themes = { light: (n: string) => pick(light, n), dark: (n: string) => pick(dark, n) };
  // The cap is a fixed light buoy cap: the same in both themes.
  const cap = () => pick(light, 'ice-cap');
  const buoy = () => pick(light, 'ice-buoy');

  it.each(Object.entries(themes))('badge text is at least 4.5:1 on the %s surface', (_, t) => {
    for (const fg of ['ice-ink', 'ice-muted'])
      expect(ratio(t(fg), t('ice-surface')), fg).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(themes))(
    'medal and float strokes are at least 3:1 on the %s surface',
    (_, t) => {
      // Earned hull/ring and filled floats, not-yet dashed ring and empty floats.
      for (const fg of ['ice-focus', 'ice-muted'])
        expect(ratio(t(fg), t('ice-surface')), fg).toBeGreaterThanOrEqual(3);
      // The fixed buoy: hull against its light cap, and the cap-coloured scales on the hull.
      // On the surface the hull is outlined by --ice-focus (checked above).
      expect(ratio(cap(), buoy())).toBeGreaterThanOrEqual(3);
    },
  );

  it('uses only tokens: no raw colours in achievements.css', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rules).not.toMatch(/rgba?\(/);
    expect(rules).toMatch(/var\(--ice-cap\)/);
    expect(rules).toMatch(/var\(--ice-buoy\)/);
    expect(rules).toMatch(/var\(--shadow-buoy\)/);
  });
});
