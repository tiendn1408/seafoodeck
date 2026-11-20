import { afterEach, describe, expect, it } from 'vitest';
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
    expect(later.textContent).toContain('Học 7 ngày liên tiếp');
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

  it('goals fall back to the server label for unknown ids', () => {
    expect(badgeGoal({ id: 'review10', label: 'x', earnedAt: null })).toBe(
      'Hoàn thành 10 phiên ôn',
    );
    expect(badgeGoal({ id: 'nope', label: 'Nhãn', earnedAt: null })).toBe('Nhãn');
  });

  it('formats instants in Asia/Ho_Chi_Minh', () => {
    expect(vnDate('2026-11-19T18:30:00.000Z')).toBe('20/11/2026');
    expect(vnDateTime('2026-11-19T18:30:00.000Z')).toBe('01:30 20/11/2026');
  });
});
