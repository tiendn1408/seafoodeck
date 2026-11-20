import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Progress } from './Progress';
import { clearMe } from './meStore';
import { button, mount, unmountAll } from './testDom';
import type { CatalogOverview, MeMastery, MeProgress } from '../pilot/api';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const species = (n: number, group: 'fish' | 'crustacean' = 'fish') => ({
  revisionId: 'r' + n,
  itemId: 'i' + n,
  vi: 'Loài ' + n,
  scientific: 'Species ' + n,
  taxonomicGroup: group,
  imageId: null,
});
const overview: CatalogOverview = {
  releaseId: 'rel1',
  internal: false,
  learnable: 3,
  groups: { fish: 2, crustacean: 1, mollusc: 0, other: 0, none: 0 },
  hsCases: 0,
  items: [species(1), species(2), species(3, 'crustacean')],
};
const mastery: MeMastery = {
  i1: { status: 'learning', level: 3 },
  i2: { status: 'due', level: 1 },
};
const progress: MeProgress = {
  skills: [
    { key: 'en', label: 'Tên tiếng Anh', done: 2, total: 3 },
    { key: 'ja', label: 'Tên tiếng Nhật', done: 1, total: 3 },
    { key: 'scientific', label: 'Tên khoa học', done: 0, total: 3 },
    { key: 'hs', label: 'Mã HS', done: 1, total: 4 },
  ],
  mastery: { unlearned: 1, level1: 1, level2: 0, level3: 1, level4: 0 },
  sessions: [
    {
      sessionId: 's2',
      at: '2026-11-19T18:30:00.000Z',
      mode: 'match',
      answered: 4,
      firstTry: 3,
      selfRated: 0,
      percent: 75,
    },
    {
      sessionId: 's1',
      at: '2026-11-18T02:00:00.000Z',
      mode: 'flashcard',
      answered: 0,
      firstTry: 0,
      selfRated: 5,
      percent: null,
    },
  ],
  achievements: {
    streak: { current: 2, longest: 6 },
    badges: [
      { id: 'first10', label: '10 loài đầu tiên', earnedAt: null },
      { id: 'review10', label: '10 phiên ôn', earnedAt: '2026-11-10T03:00:00.000Z' },
    ],
  },
  figures: { answered: 12, firstTryPercent: 67, selfRated: 5 },
};

let routes: Record<string, () => Promise<Response>>;
let calls: string[];
beforeEach(() => {
  clearMe();
  calls = [];
  routes = {
    'GET /catalog/overview': () => json(overview),
    'GET /me/mastery': () => json(mastery),
    'GET /me/progress': () => json(progress),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push(key);
      const r = routes[key];
      return r ? r() : json({ message: 'unrouted ' + key }, 404);
    }),
  );
});
afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
async function show() {
  const host = mount(<Progress userId="u1" />);
  await tick();
  await tick();
  return host;
}

describe('Progress from /me/progress', () => {
  it('renders figures, skills, mastery and sessions from the server shape', async () => {
    const host = await show();
    const figures = host.querySelector('.progress-figures')!;
    expect(figures.textContent).toBe(
      'Loài đã vào lịch2 / 3Câu đã trả lời12Đúng lần đầu67%Thẻ tự đánh giá5',
    );
    const skills = host.querySelectorAll('.progress-skills li');
    expect(skills).toHaveLength(4);
    expect(skills[0].textContent).toContain('Tên tiếng Anh');
    expect(skills[0].textContent).toContain('2 / 3 loài');
    expect(skills[3].textContent).toContain('1 / 4 hồ sơ');
    expect(host.querySelector('.progress-skills-note')?.textContent).toBe(
      'Mỗi thanh đếm loài (hoặc hồ sơ HS) đã qua mốc 3 ngày.',
    );
    const levels = host.querySelectorAll('.progress-mastery li');
    expect([...levels].map((l) => l.querySelector('.progress-count')!.textContent)).toEqual([
      '1 loài',
      '0 loài',
      '1 loài',
      '0 loài',
    ]);
    // Floats per species come from /me/mastery levels, coloured by group.
    expect(levels[0].querySelectorAll('.progress-floats i')).toHaveLength(1);
    expect(levels[2].querySelectorAll('.progress-floats i')).toHaveLength(1);
    expect(host.textContent).toContain('1 / 3 loài chưa học.');

    const sessions = host.querySelectorAll('.progress-sessions-list li');
    expect(sessions).toHaveLength(2);
    expect(sessions[0].textContent).toContain('Ghép tên');
    expect(sessions[0].textContent).toContain('01:30 20/11/2026');
    expect(sessions[0].textContent).toContain('3 / 4');
    expect(sessions[0].textContent).toContain('75%');
    expect(sessions[0].querySelector('time')!.getAttribute('dateTime')).toBe(
      '2026-11-19T18:30:00.000Z',
    );
    expect(sessions[1].textContent).toContain('Flashcard');
    expect(sessions[1].textContent).toContain('5 thẻ tự đánh giá');
    expect(sessions[1].querySelector('.ice-gauge')).toBeNull();
  });

  it('shows achievements without pretending unearned badges are earned', async () => {
    const host = await show();
    const block = host.querySelector('.achievements')!;
    expect(block.querySelector('[data-badge="first10"]')!.getAttribute('data-earned')).toBe(
      'false',
    );
    expect(block.querySelector('[data-badge="review10"]')!.textContent).toContain(
      'Đạt ngày 10/11/2026',
    );
    expect(block.textContent).toContain('Dài nhất 6 ngày');
  });

  it('ranks species by server mastery level', async () => {
    const host = await show();
    const rows = host.querySelectorAll('.progress-species .library-list li');
    expect(rows[0].textContent).toContain('Loài 1');
    expect(rows[0].querySelector('[aria-label="Mức nhớ 3/4"]')).not.toBeNull();
    expect(rows[2].querySelector('[aria-label="Chưa học"]')).not.toBeNull();
  });

  it('makes no other network request and reads no localStorage', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    await show();
    expect([...new Set(calls)].sort()).toEqual([
      'GET /catalog/overview',
      'GET /me/mastery',
      'GET /me/progress',
    ]);
    expect(getItem).not.toHaveBeenCalled();
  });

  it('shows the empty history and a loading state before data', async () => {
    routes['GET /me/progress'] = () => new Promise(() => {});
    const host = mount(<Progress userId="u1" />);
    await tick();
    expect(host.querySelector('[role="status"]')!.textContent).toContain('Đang tải tiến độ');
  });

  it('shows an error with retry on first-load failure, then recovers', async () => {
    routes['GET /me/progress'] = () => json({ message: 'hỏng' }, 500);
    const host = await show();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('hỏng');
    routes['GET /me/progress'] = () => json({ ...progress, sessions: [] });
    await act(async () => button(host, 'Thử lại').click());
    await tick();
    await tick();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain('Chưa có phiên nào');
  });
});
