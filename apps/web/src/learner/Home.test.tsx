import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { Home } from './Home';
import { clearMe } from './meStore';
import { button, click, mount, unmountAll } from './testDom';
import type { CatalogOverview, MeHome } from '../pilot/api';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const species = (n: number) => ({
  revisionId: 'r' + n,
  itemId: 'i' + n,
  vi: 'Loài ' + n,
  scientific: 'Species ' + n,
  taxonomicGroup: 'fish',
  imageId: null,
});
const overview: CatalogOverview = {
  releaseId: 'rel1',
  internal: false,
  learnable: 4,
  groups: { fish: 4, crustacean: 0, mollusc: 0, other: 0, none: 0 },
  hsCases: 0,
  items: [1, 2, 3, 4].map((n) => ({ ...species(n), taxonomicGroup: 'fish' as const })),
};
const meHome = (extra: Partial<MeHome> = {}): MeHome => ({
  releaseId: 'rel1',
  internal: false,
  learnable: 4,
  haul: [species(1), species(2), species(3)],
  cast: {
    kind: 'review',
    targets: [
      { targetId: 'i1', skill: 'en' },
      { targetId: 'i2', skill: 'ja' },
    ],
  },
  due: 2,
  skills: [
    { key: 'en', label: 'Tên Anh', done: 1, total: 4 },
    { key: 'ja', label: 'Tên Nhật', done: 0, total: 4 },
    { key: 'scientific', label: 'Tên khoa học', done: 0, total: 4 },
    { key: 'hs', label: 'Mã HS', done: 0, total: 0 },
  ],
  activeSessionId: null,
  ...extra,
});

let routes: Record<string, () => Promise<Response>>;
let calls: string[];
beforeEach(() => {
  clearMe();
  calls = [];
  routes = {
    'GET /catalog/overview': () => json(overview),
    'GET /catalog/items?learnable=true&limit=50': () =>
      json({ releaseId: 'rel1', internal: false, page: 1, limit: 50, total: 0, items: [] }),
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
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
const meCalls = () =>
  calls.filter((c) => {
    const p = c.split(' ')[1].split('?')[0];
    return p === '/me' || p.startsWith('/me/');
  });

async function student(home: MeHome, props: Partial<Parameters<typeof Home>[0]> = {}) {
  routes['GET /me/home'] = () => json(home);
  const host = mount(
    <Home
      kind="student"
      userId="u1"
      pending={false}
      onStart={async () => {}}
      onSignIn={() => {}}
      onOpenLibrary={() => {}}
      {...props}
    />,
  );
  await tick();
  await tick();
  return host;
}

describe('Home loading state', () => {
  it('names the hero region with a (visually hidden) heading', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(
      <Home
        kind="student"
        userId="u1"
        pending={false}
        onStart={async () => {}}
        onSignIn={() => {}}
        onOpenLibrary={() => {}}
      />,
    );
    const hero = host.querySelector('[aria-labelledby="home-title"]')!;
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Đang tải');
    const title = host.querySelector('#home-title');
    expect(title?.tagName).toBe('H1');
    expect(hero.contains(title)).toBe(true);
  });
});

describe('Home for students (/me/home)', () => {
  it('shows today’s haul from the server with the right species count', async () => {
    const host = await student(meHome());
    expect(calls).toContain('GET /me/home');
    expect(host.querySelector('#home-title')?.textContent).toContain('3 loài');
    expect(host.querySelectorAll('.home-catch > *').length).toBe(2);
    expect(host.textContent).toContain('Bốn kỹ năng của bạn');
    expect(host.textContent).toContain('1 / 4 loài');
  });

  it('a review cast opens a review session without reviewTargets (server chooses)', async () => {
    const onStart = vi.fn(async () => {});
    const host = await student(meHome(), { onStart });
    await click(button(host, 'Thả lưới'));
    expect(onStart).toHaveBeenCalledWith('review', undefined, 'en', undefined, undefined);
  });

  it('a flashcard cast opens the flashcard for its revision', async () => {
    const onStart = vi.fn(async () => {});
    const host = await student(meHome({ cast: { kind: 'flashcard', revisionId: 'r2' } }), {
      onStart,
    });
    expect(host.textContent).toContain('Bắt đầu với Loài 2');
    await click(button(host, 'Thả lưới'));
    expect(onStart).toHaveBeenCalledWith('flashcard', 'r2', 'en');
  });

  it('a done cast shows the finished state', async () => {
    const host = await student(meHome({ haul: [], cast: { kind: 'done' } }));
    expect(host.querySelector('#home-title')?.textContent).toContain('Mẻ hôm nay đã xong');
    const casts = [...host.querySelectorAll('button')].filter((b) =>
      b.textContent?.includes('Thả lưới'),
    );
    expect(casts).toEqual([]);
  });

  it('an active session shows "Tiếp tục" that resumes the server session id', async () => {
    routes['GET /learning/sessions/s9'] = () =>
      json({ id: 's9', mode: 'flashcard', questions: [] });
    const onResume = vi.fn(async () => {});
    const host = await student(meHome({ activeSessionId: 's9' }), { onResume });
    expect(calls).toContain('GET /learning/sessions/s9');
    await click(button(host, 'Tiếp tục'));
    expect(onResume).toHaveBeenCalledWith('s9');
  });

  it('no active session means no "Tiếp tục" button and no session fetch', async () => {
    const host = await student(meHome(), { onResume: async () => {} });
    expect(host.textContent).not.toContain('Tiếp tục');
    expect(calls.some((c) => c.includes('/learning/sessions/'))).toBe(false);
  });

  it('a first-load error offers retry; a later refresh error keeps the content', async () => {
    routes['GET /me/home'] = () => json({ message: 'Mất kết nối' }, 500);
    const host = mount(
      <Home
        kind="student"
        userId="u1"
        pending={false}
        onStart={async () => {}}
        onSignIn={() => {}}
        onOpenLibrary={() => {}}
      />,
    );
    await tick();
    expect(host.querySelector('#home-title')?.textContent).toContain('Chưa kéo được');
    routes['GET /me/home'] = () => json(meHome());
    await click(button(host, 'Thử lại'));
    await tick();
    expect(host.querySelector('#home-title')?.textContent).toContain('3 loài');
    // Refresh fails: content stays, a small alert appears.
    routes['GET /me/home'] = () => json({ message: 'Mất kết nối' }, 500);
    const { refreshMe } = await import('./meStore');
    await act(async () => refreshMe('/me/home'));
    await tick();
    expect(host.querySelector('#home-title')?.textContent).toContain('3 loài');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Mất kết nối');
  });
});

describe('Home for trial (invite-code) learners', () => {
  async function trial(onSignIn = () => {}) {
    const host = mount(
      <Home
        kind="trial"
        pending={false}
        onStart={async () => {}}
        onSignIn={onSignIn}
        onOpenLibrary={() => {}}
      />,
    );
    await tick();
    await tick();
    return host;
  }

  it('never calls /me/*, and shows only the practice picker plus the sign-in nudge', async () => {
    const host = await trial();
    expect(meCalls()).toEqual([]);
    expect(calls).toContain('GET /catalog/overview');
    expect(host.textContent).toContain('Đăng nhập để lưu tiến độ');
    expect(host.textContent).toContain('Luyện nghiệp vụ');
    expect(host.textContent).toContain('Flashcard tên loài');
    expect(host.querySelector('.home-cast')).toBeNull();
    expect(host.querySelector('.home-rope')).toBeNull();
    expect(host.textContent).not.toContain('Bốn kỹ năng của bạn');
    expect(host.textContent).not.toContain('Tiếp tục');
    expect(host.querySelector('.home-catch')).toBeNull();
  });

  it('staff get the same reduced Home without the trial nudge and no /me/* call', async () => {
    const host = mount(
      <Home
        kind="staff"
        userId="u-admin"
        pending={false}
        onStart={async () => {}}
        onSignIn={() => {}}
        onOpenLibrary={() => {}}
      />,
    );
    await tick();
    await tick();
    expect(meCalls()).toEqual([]);
    expect(host.textContent).toContain('Flashcard tên loài');
    expect(host.textContent).not.toContain('Đăng nhập để lưu tiến độ');
  });

  it('the nudge calls onSignIn', async () => {
    const onSignIn = vi.fn();
    const host = await trial(onSignIn);
    await click(button(host, 'Đăng nhập'));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('starts a practice mode for the chosen species', async () => {
    const onStart = vi.fn(async () => {});
    const host = mount(
      <Home
        kind="trial"
        pending={false}
        onStart={onStart}
        onSignIn={() => {}}
        onOpenLibrary={() => {}}
      />,
    );
    await tick();
    await click(button(host, 'Flashcard tên loài'));
    expect(onStart).toHaveBeenCalledWith('flashcard', 'r1', 'en');
  });
});
