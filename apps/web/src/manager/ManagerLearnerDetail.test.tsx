import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { ManagerLearnerDetail } from './ManagerLearnerDetail';
import { clearMe } from '../learner/meStore';
import { mount, unmountAll } from '../learner/testDom';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const species = (n: number) => ({
  revisionId: 'r' + n,
  itemId: 'i' + n,
  vi: 'Loài ' + n,
  scientific: 'Species ' + n,
  taxonomicGroup: 'fish' as const,
  imageId: null,
});
const overview = {
  releaseId: 'rel1',
  internal: false,
  learnable: 2,
  groups: { fish: 2, crustacean: 0, mollusc: 0, other: 0, none: 0 },
  hsCases: 0,
  items: [species(1), species(2)],
};
const progress = (answered: number) => ({
  skills: [
    { key: 'en', label: 'Tên tiếng Anh', done: 1, total: 2 },
    { key: 'ja', label: 'Tên tiếng Nhật', done: 0, total: 2 },
    { key: 'scientific', label: 'Tên khoa học', done: 0, total: 2 },
    { key: 'hs', label: 'Mã HS', done: 0, total: 1 },
  ],
  mastery: { unlearned: 1, level1: 1, level2: 0, level3: 0, level4: 0 },
  sessions: [],
  achievements: {
    streak: { current: 1, longest: 3 },
    badges: [{ id: 'first10', label: '10 loài đầu tiên', earnedAt: '2026-11-10T03:00:00.000Z' }],
  },
  figures: { answered, firstTryPercent: 50, selfRated: 0 },
});
const review = {
  due: [
    {
      targetId: 'i1',
      itemId: 'i1',
      label: 'Loài 1',
      skill: 'name:en',
      stage: 1,
      dueAt: '2026-11-20T00:00:00.000Z',
    },
  ],
  scheduled: [],
};
const summary = (id: string, extra: object = {}) => ({
  id,
  username: id,
  displayName: null,
  disabled: false,
  createdAt: '2026-10-01T17:30:00.000Z',
  lastLoginAt: '2026-11-19T18:30:00.000Z',
  ...extra,
});

let calls: string[];
let routes: Record<string, () => Promise<Response>>;
beforeEach(() => {
  clearMe();
  calls = [];
  routes = {
    'GET /catalog/overview': () => json(overview),
    'GET /manager/learners/lan': () => json(summary('lan', { displayName: 'Lan Nguyễn' })),
    'GET /manager/learners/lan/progress': () => json(progress(11)),
    'GET /manager/learners/lan/mastery': () => json({ i1: { status: 'due', level: 1 } }),
    'GET /manager/learners/lan/review': () => json(review),
    'GET /manager/learners/binh': () =>
      json(summary('binh', { disabled: true, lastLoginAt: null })),
    'GET /manager/learners/binh/progress': () => json(progress(77)),
    'GET /manager/learners/binh/mastery': () => json({}),
    'GET /manager/learners/binh/review': () => json({ due: [], scheduled: [] }),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push(key);
      const r = routes[key];
      return r ? r() : json({ message: 'Không tìm thấy học viên.' }, 404);
    }),
  );
});
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
async function open(id = 'lan') {
  const host = mount(<ManagerLearnerDetail id={id} userId="mgr" />);
  await tick();
  await tick();
  return host;
}

describe('ManagerLearnerDetail', () => {
  it('shows the header: name, back button, last login and created date in Ho Chi Minh time', async () => {
    const host = await open();
    expect(host.querySelector('h1')?.textContent).toBe('Học viên: Lan Nguyễn');
    expect(host.querySelector('a[href="#manager"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Đã khóa');
    // 2026-11-19T18:30Z is 20/11 01:30 in Asia/Ho_Chi_Minh; 2026-10-01T17:30Z is 02/10.
    const text = host.querySelector('.manager-meta')!.textContent!;
    expect(text).toContain('20/11/2026');
    expect(text).toContain('02/10/2026');
  });

  it('uses the username when there is no display name, marks a locked learner, no last login', async () => {
    const host = await open('binh');
    expect(host.querySelector('h1')?.textContent).toBe('Học viên: binh');
    expect(host.textContent).toContain('Đã khóa');
    expect(host.textContent).toContain('Chưa đăng nhập');
  });

  it('renders progress with achievements and the review list, read-only', async () => {
    const host = await open();
    expect(host.textContent).toContain('Thành tích');
    expect(host.textContent).toContain('10 loài đầu tiên');
    expect(host.textContent).toContain('Bốn kỹ năng');
    expect(host.textContent).toContain('Đến hạn');
    expect(host.textContent).toContain('Loài 1');
    expect(host.textContent).not.toMatch(/Ôn \d+ mục/);
    expect(host.textContent).not.toContain('Thả lưới');
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelector('.review-action button')).toBeNull();
    expect(host.querySelector('a[href="#library"]')).toBeNull();
    expect(host.querySelector('a[href="#home"]')).toBeNull();
  });

  it('only reads /manager/learners/<id>... and the catalogue: no /me, no writes', async () => {
    await open();
    expect(calls.every((c) => c.startsWith('GET '))).toBe(true);
    expect(calls.some((c) => c.includes('/me'))).toBe(false);
    const manager = [...new Set(calls)].filter((c) => c !== 'GET /catalog/overview').sort();
    expect(manager).toEqual([
      'GET /manager/learners/lan',
      'GET /manager/learners/lan/mastery',
      'GET /manager/learners/lan/progress',
      'GET /manager/learners/lan/review',
    ]);
  });

  it('an unknown learner shows "Không tìm thấy học viên" with a way back, no progress calls', async () => {
    const host = await open('nope');
    expect(host.textContent).toContain('Không tìm thấy học viên');
    expect(host.querySelector('a[href="#manager"]')).not.toBeNull();
    expect(calls.some((c) => c.includes('/progress'))).toBe(false);
  });

  it('a non-404 failure keeps the error with retry', async () => {
    routes['GET /manager/learners/lan'] = () => json({ message: 'Máy chủ lỗi' }, 500);
    const host = await open();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Máy chủ lỗi');
    expect(host.textContent).not.toContain('Không tìm thấy học viên');
  });

  it('switching to another learner never shows the previous learner data', async () => {
    let go: (id: string) => void = () => {};
    function Route() {
      const [id, setId] = useState('lan');
      go = setId;
      return <ManagerLearnerDetail key={id} id={id} userId="mgr" />;
    }
    const host = mount(<Route />);
    await tick();
    await tick();
    expect(host.querySelector('h1')?.textContent).toBe('Học viên: Lan Nguyễn');
    expect(host.textContent).toContain('Câu đã trả lời11');
    let release: () => void = () => {};
    routes['GET /manager/learners/binh/progress'] = () =>
      new Promise<Response>((res) => {
        release = () => res(new Response(JSON.stringify(progress(77))));
      });
    act(() => go('binh'));
    await tick();
    expect(host.textContent).not.toContain('Lan Nguyễn');
    expect(host.textContent).not.toContain('Câu đã trả lời11');
    expect(host.textContent).not.toContain('10 loài đầu tiên');
    release();
    await tick();
    expect(host.querySelector('h1')?.textContent).toBe('Học viên: binh');
    expect(host.textContent).toContain('Câu đã trả lời77');
    // Back to the first learner: its own cache entry, not the second one's.
    act(() => go('lan'));
    await tick();
    await tick();
    expect(host.textContent).toContain('Câu đã trả lời11');
    expect(host.textContent).not.toContain('Câu đã trả lời77');
  });
});
