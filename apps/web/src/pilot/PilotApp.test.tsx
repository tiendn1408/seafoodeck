import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PilotApp, { TRIAL_SESSION_KEY } from './PilotApp';
import { setAuthRequiredHandler } from './api';
import { clearMe } from '../learner/meStore';
import { kindOf, routeAllowed, routesFor } from '../learner/role';
import { disposeAll, pendingTotal, sessionQueue } from '../learner/study/submitQueues';
import { button, click, field, mount, setValue, submit, unmountAll } from '../learner/testDom';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const view = (role: string, extra: object = {}) => ({
  role,
  internal: false,
  csrf: 'c-' + role,
  expiresAt: 'x',
  userId: 'u-' + role,
  ...extra,
});
// POST /auth/login answers exactly like GET /auth/me for an account session.
const realLogin = (role: string) => view(role, { displayName: 'An', mustChangePassword: false });
const profileItem = {
  revisionId: 'r1',
  externalId: 'blue-mussel',
  sku: 'MUS-01',
  group: 'Nhuyễn thể',
  names: [{ kind: 'vi', label: 'Vẹm xanh', source: 'src', pronunciation: null }],
  forms: [],
  identification: '',
  note: '',
  media: [],
  taxonomicGroup: 'mollusc',
};
const MUST = { message: 'Cần đổi mật khẩu trước.', code: 'MUST_CHANGE_PASSWORD' };
const meHome = (activeSessionId: string | null) => ({
  releaseId: 'rel1',
  internal: false,
  learnable: 1,
  haul: [],
  cast: { kind: 'done' },
  due: 0,
  skills: [],
  activeSessionId,
});
const studyGame = (id: string) => ({
  id,
  releaseId: 'rel1',
  internal: false,
  mode: 'flashcard',
  expiresAt: '2026-11-20T10:00:00.000Z',
  questions: [
    { id: 'q1', type: 'flashcard', prompt: 'Tên tiếng Anh', front: 'Vẹm xanh', unavailable: false },
  ],
});
const overview = {
  releaseId: 'rel1',
  internal: false,
  learnable: 1,
  groups: { fish: 0, crustacean: 0, mollusc: 1, other: 0, none: 0 },
  hsCases: 0,
  items: [
    {
      revisionId: 'r1',
      itemId: 'i1',
      vi: 'Vẹm xanh',
      scientific: 'Perna viridis',
      taxonomicGroup: 'mollusc',
      imageId: null,
    },
  ],
};
let routes: Record<string, () => Promise<Response>>;
let calls: string[];
let inits: (RequestInit | undefined)[];
beforeEach(() => {
  clearMe();
  setAuthRequiredHandler(null);
  location.hash = '#home';
  calls = [];
  inits = [];
  routes = {};
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push(key);
      inits.push(init);
      const r = routes[key];
      return r ? r() : json({ message: 'unrouted ' + key }, 404);
    }),
  );
});
afterEach(() => {
  disposeAll();
  localStorage.clear();
  sessionStorage.clear();
  unmountAll();
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
const tone = (h: HTMLElement) => h.querySelector('.shell')?.getAttribute('data-tone');
const navCount = (h: HTMLElement) => h.querySelectorAll('nav a, .shell-tabs a').length;

describe('PilotApp forced password flow', () => {
  it('guest login screens use deep tone even on ice routes', async () => {
    routes['GET /auth/me'] = () => json(view('guest'));
    for (const hash of ['#library', '#progress', '#home']) {
      location.hash = hash;
      const host = mount(<PilotApp />);
      await tick();
      expect(host.textContent).toContain('Học thử bằng mã mời');
      expect(tone(host)).toBe('deep');
      unmountAll();
    }
  });

  it('mustChangePassword shows the forced screen only, deep tone, no nav', async () => {
    location.hash = '#progress';
    routes['GET /auth/me'] = () => json(view('student', { mustChangePassword: true }));
    const host = mount(<PilotApp />);
    await tick();
    expect(host.textContent).toContain('Quản trị viên yêu cầu bạn đặt mật khẩu mới');
    expect(tone(host)).toBe('deep');
    expect(navCount(host)).toBe(0);
    expect(host.textContent).not.toContain('Hủy');
  });

  it('the forced screen sits in the plain content wrapper on every route, never a stage', async () => {
    routes['GET /auth/me'] = () => json(view('student', { mustChangePassword: true }));
    for (const hash of ['#progress', '#library', '#home', '#review']) {
      location.hash = hash;
      const host = mount(<PilotApp />);
      await tick();
      const screen = host.querySelector('.change-password');
      expect(screen, hash).not.toBeNull();
      expect(screen!.parentElement!.className, hash).toBe('content home-content');
      expect(
        host.querySelector('.ice-stage, .home-stage, .profile-stage, .study-stage'),
      ).toBeNull();
      expect(tone(host), hash).toBe('deep');
      unmountAll();
    }
  });

  it('the plain content wrapper keeps a side gutter of at least 16px at 390px', () => {
    // Walk every `.content` rule in source order; the last padding that applies at 390px wins.
    const css = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    let gutter = 0;
    const re = /(@media \(max-width: (\d+)px\) \{)|\n\s*\.content \{([^}]*)\}/g;
    let max: number | null = null;
    for (const m of css.matchAll(re)) {
      if (m[1]) {
        max = Number(m[2]);
        continue;
      }
      const indented = m[0].startsWith('\n  ');
      if (indented && max !== null && max < 390) continue;
      const pad = m[3]
        .match(/padding:\s*([^;]+);/)?.[1]
        .trim()
        .split(/\s+/);
      if (pad) gutter = parseFloat(pad.length === 1 ? pad[0] : pad[1]);
      const left = m[3].match(/padding-left:\s*(\d+)px/);
      if (left) gutter = Number(left[1]);
    }
    expect(gutter).toBeGreaterThanOrEqual(16);
  });

  it('a MUST_CHANGE_PASSWORD 403 flips to forced; no restore fetch while forced', async () => {
    location.hash = '#study';
    routes['GET /auth/me'] = () => json(view('student'));
    routes['GET /me/home'] = () => json(meHome('s1'));
    routes['GET /learning/sessions/s1'] = () => json(MUST, 403);
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    expect(host.textContent).toContain('Quản trị viên yêu cầu');
    expect(host.querySelector('.pilot-error')).toBeNull();
    const n = calls.filter((c) => c.includes('/learning/')).length;
    await tick();
    expect(calls.filter((c) => c.includes('/learning/')).length).toBe(n);
  });

  it('forced user on #study with an active session never requests /learning/', async () => {
    location.hash = '#study';
    sessionStorage.setItem(TRIAL_SESSION_KEY, JSON.stringify('s1'));
    routes['GET /auth/me'] = () => json(view('student', { mustChangePassword: true }));
    routes['GET /me/home'] = () => json(meHome('s1'));
    routes['GET /learning/sessions/s1'] = () => json(MUST, 403);
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    expect(host.textContent).toContain('Quản trị viên yêu cầu');
    expect(host.querySelector('.pilot-error')).toBeNull();
    expect(calls.filter((c) => c.includes('/learning/'))).toEqual([]);
  });

  it('after a successful change it refetches /auth/me and shows normal content', async () => {
    let me = view('student', { mustChangePassword: true });
    routes['GET /auth/me'] = () => json(me);
    routes['POST /me/password'] = () => {
      me = view('student');
      return json({
        ...view('student', { mustChangePassword: false }),
        csrf: 'c-new',
        changed: true,
      });
    };
    const host = mount(<PilotApp />);
    await tick();
    setValue(field(host, 'Mật khẩu hiện tại'), 'dummy-old-pass');
    setValue(field(host, 'Mật khẩu mới'), 'dummy-new-pass1');
    setValue(field(host, 'Nhập lại mật khẩu mới'), 'dummy-new-pass1');
    await submit(host);
    await tick();
    // The response is the new session view: no second /auth/me round trip.
    expect(calls.filter((c) => c === 'GET /auth/me').length).toBe(1);
    expect(host.textContent).not.toContain('Quản trị viên yêu cầu');
  });

  const headerOf = (key: string) =>
    (inits[calls.lastIndexOf(key)]?.headers as Record<string, string>)['X-CSRF-Token'];

  it('forced change adopts the new csrf: the next mutating request sends it', async () => {
    routes['GET /auth/me'] = () => json(view('student', { mustChangePassword: true }));
    routes['POST /me/password'] = () =>
      json({ ...view('student'), csrf: 'c-new', displayName: 'Lan', mustChangePassword: false });
    routes['POST /auth/logout'] = () => json(view('guest'));
    const host = mount(<PilotApp />);
    await tick();
    setValue(field(host, 'Mật khẩu hiện tại'), 'dummy-old-pass');
    setValue(field(host, 'Mật khẩu mới'), 'dummy-new-pass1');
    setValue(field(host, 'Nhập lại mật khẩu mới'), 'dummy-new-pass1');
    await submit(host);
    await tick();
    expect(headerOf('POST /me/password')).toBe('c-student');
    await click(button(host, 'Đăng xuất'));
    await tick();
    expect(headerOf('POST /auth/logout')).toBe('c-new');
  });

  it('voluntary change from the account page adopts csrf and display name too', async () => {
    location.hash = '#account';
    routes['GET /auth/me'] = () => json(view('student', { displayName: 'An' }));
    routes['GET /me'] = () =>
      json({ username: 'an', displayName: 'An', role: 'student', mustChangePassword: false });
    routes['POST /me/password'] = () =>
      json({ ...view('student'), csrf: 'c-new2', displayName: 'An', mustChangePassword: false });
    routes['PATCH /me'] = () =>
      json({ username: 'an', displayName: 'Bình', role: 'student', mustChangePassword: false });
    const host = mount(<PilotApp />);
    await tick();
    await click(button(host, 'Đổi mật khẩu'));
    setValue(field(host, 'Mật khẩu hiện tại'), 'dummy-old-pass');
    setValue(field(host, 'Mật khẩu mới'), 'dummy-new-pass1');
    setValue(field(host, 'Nhập lại mật khẩu mới'), 'dummy-new-pass1');
    await submit(host);
    await tick();
    expect(host.textContent).toContain('Đã đổi mật khẩu');
    setValue(field(host, 'Tên hiển thị'), 'Bình');
    await submit(host);
    await tick();
    expect(headerOf('PATCH /me')).toBe('c-new2');
  });

  it('forced screen: logout waits for queued saves, says so, and ignores a second click', async () => {
    routes['GET /auth/me'] = () => json(view('student', { mustChangePassword: true }));
    routes['POST /auth/logout'] = () => json(view('guest'));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    routes['POST /learning/sessions/g1/questions/q1/attempts'] = () =>
      gate.then(() => json({ answered: true, questionId: 'q1' }));
    const host = mount(<PilotApp />);
    await tick();
    sessionQueue('g1', () => {}).enqueue({
      gameId: 'g1',
      questionId: 'q1',
      key: 'k',
      answer: { rating: 'known' },
    });
    await click(button(host, 'Đăng xuất'));
    expect(host.textContent).toContain('Đang lưu tiến độ…');
    expect(button(host, 'Đăng xuất').disabled).toBe(true);
    release();
    await tick();
    await tick();
    expect(calls.filter((c) => c === 'POST /auth/logout')).toHaveLength(1);
  });

  it('logout then login as another user leaves no forced state behind', async () => {
    routes['GET /auth/me'] = () => json(view('student', { mustChangePassword: true }));
    routes['POST /auth/logout'] = () => json(view('guest'));
    routes['POST /auth/login'] = () => json(realLogin('student'));
    const host = mount(<PilotApp />);
    await tick();
    await click(button(host, 'Đăng xuất'));
    await tick();
    expect(host.textContent).toContain('Học thử bằng mã mời');
    setValue(field(host, 'Tên đăng nhập'), 'khac');
    setValue(field(host, 'Mật khẩu'), 'dummy-pass-123');
    await submit(host);
    await tick();
    expect(host.textContent).not.toContain('Quản trị viên yêu cầu');
    expect(host.textContent).not.toContain('Đổi mật khẩu');
  });

  it('a flag raised while guest does not stick to the next login', async () => {
    routes['GET /auth/me'] = () => json(view('guest'));
    routes['POST /auth/login'] = () => json(realLogin('student'));
    const host = mount(<PilotApp />);
    await tick();
    const { api } = await import('./api');
    routes['GET /x'] = () => json(MUST, 403);
    await act(async () => void (await api('/x').catch(() => null)));
    expect(host.textContent).toContain('Học thử bằng mã mời');
    setValue(field(host, 'Tên đăng nhập'), 'a');
    setValue(field(host, 'Mật khẩu'), 'dummy-pass-123');
    await submit(host);
    await tick();
    expect(host.textContent).not.toContain('Quản trị viên yêu cầu');
  });
});

describe('PilotApp role-aware routes', () => {
  it('trial, manager, staff and admin never request /me or /me/* on any route their kind allows', async () => {
    // Every allowed route comes from the route table, so new routes are covered automatically.
    const views = [
      view('learner'),
      { ...view('learner'), userId: undefined }, // real invite sessions carry no userId
      view('manager'),
      view('editor'), // staff sessions carry a userId, but /me/* admits students only
      view('admin'), // admin kind, with a userId, including #admin/users
    ];
    const visited: string[] = [];
    for (const v of views) {
      const kind = kindOf(v);
      const hashes = [...routesFor(kind), 'profile/x'].filter((r) => routeAllowed(kind, r));
      expect(hashes.length).toBeGreaterThan(1);
      routes['GET /auth/me'] = () => json(v);
      routes['GET /catalog/items/x'] = () => json(profileItem);
      for (const hash of hashes) {
        location.hash = '#' + hash;
        const host = mount(<PilotApp />);
        await tick();
        await tick();
        expect(location.hash, `${v.role} ${hash}`).toBe('#' + hash);
        expect(host.querySelector('.shell')).not.toBeNull();
        visited.push(`${v.role} ${hash}`);
        unmountAll();
      }
    }
    expect(visited).toContain('admin admin/users');
    expect(visited).not.toContain('editor admin/users');
    expect(calls).toContain('GET /admin/users?page=1&limit=20');
    const me = calls.filter((c) => {
      const p = c.split(' ')[1].split('?')[0];
      return p === '/me' || p.startsWith('/me/');
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(me).toEqual([]);
  });

  it('a manager on a species profile has no study start and never opens a session', async () => {
    location.hash = '#profile/x';
    routes['GET /auth/me'] = () => json(view('manager'));
    routes['GET /catalog/items/x'] = () => json(profileItem);
    routes['POST /learning/sessions'] = () => json({ id: 'g1' });
    const host = mount(<PilotApp />);
    await tick();
    expect(host.textContent).toContain('Vẹm xanh');
    const startButton = host.querySelector<HTMLButtonElement>('.profile-primary');
    if (startButton) await click(startButton);
    await tick();
    expect(calls.filter((c) => c.startsWith('POST /learning/'))).toEqual([]);
    expect(startButton).toBeNull();
  });

  it('routes not allowed for the kind go back to home', async () => {
    const cases: [string, string][] = [
      ['learner', '#review'],
      ['learner', '#progress'],
      ['learner', '#account'],
      ['manager', '#review'],
      ['manager', '#study'],
      ['student', '#admin'],
      ['student', '#admin/users'],
      ['learner', '#admin/users'],
      ['manager', '#admin/users'],
      ['editor', '#admin/users'],
      ['publisher', '#admin/users'],
      ['admin', '#account'],
      ['admin', '#review'],
      ['admin', '#progress'],
    ];
    for (const [role, hash] of cases) {
      routes['GET /auth/me'] = () => json(view(role));
      location.hash = hash;
      const host = mount(<PilotApp />);
      await tick();
      await tick();
      expect(location.hash, `${role} ${hash}`).toBe('#home');
      // The home stage renders; the forbidden page never did.
      expect(host.querySelector('.home-stage')).not.toBeNull();
      expect(host.querySelector('#account-title, .ice-stage')).toBeNull();
      unmountAll();
    }
  });

  it('an admin on #admin/users sees the users screen under the Nội dung | Người dùng tabs', async () => {
    location.hash = '#admin/users';
    routes['GET /auth/me'] = () => json(view('admin'));
    routes['GET /admin/users?page=1&limit=20'] = () =>
      json({ items: [], total: 0, page: 1, limit: 20 });
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    expect(location.hash).toBe('#admin/users');
    const tabs = host.querySelector('nav[aria-label="Khu quản trị"]');
    expect([...tabs!.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'Nội dung',
      'Người dùng',
    ]);
    expect(tabs!.querySelector('[aria-current="page"]')?.textContent).toBe('Người dùng');
    expect(host.querySelector('h1')?.textContent).toBe('Người dùng');
  });

  it('an admin resetting their own password keeps the one-time password until closing it', async () => {
    location.hash = '#admin/users';
    routes['GET /auth/me'] = () => json(view('admin'));
    let mustChange = false;
    routes['GET /admin/users?page=1&limit=20'] = () =>
      mustChange
        ? json(MUST, 403)
        : json({
            items: [
              {
                id: 'u-admin',
                username: 'owner',
                displayName: null,
                role: 'admin',
                disabled: false,
                mustChangePassword: false,
                createdAt: '2026-11-01T00:00:00.000Z',
                lastLoginAt: null,
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          });
    routes['POST /admin/users/u-admin/reset-password'] = () => {
      mustChange = true; // the server now answers MUST_CHANGE_PASSWORD on guarded routes
      return json({ temporaryPassword: 'OwnTmp7xKq9Rz2aBcDeF' });
    };
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    const row = host.querySelector<HTMLElement>('[data-user="u-admin"]')!;
    await click(button(row, 'Đặt lại mật khẩu'));
    await click(button(host.querySelector<HTMLElement>('[role="dialog"]')!, 'Đặt lại'));
    await tick();
    await tick();
    expect(host.textContent).toContain('OwnTmp7xKq9Rz2aBcDeF');
    expect(host.textContent).not.toContain('Quản trị viên yêu cầu');
    expect(calls.filter((c) => c === 'GET /admin/users?page=1&limit=20')).toHaveLength(1);
    await click(button(host.querySelector<HTMLElement>('.users-reveal')!, 'Đóng'));
    await tick();
    await tick();
    expect(calls.filter((c) => c === 'GET /admin/users?page=1&limit=20')).toHaveLength(2);
    expect(host.textContent).toContain('Quản trị viên yêu cầu');
    expect(host.textContent).not.toContain('OwnTmp7xKq9Rz2aBcDeF');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('OwnTmp');
    expect(location.href).not.toContain('OwnTmp');
  });

  it('an editor on #admin gets the content page without the users tab', async () => {
    location.hash = '#admin';
    routes['GET /auth/me'] = () => json(view('editor'));
    const host = mount(<PilotApp />);
    await tick();
    expect(host.textContent).toContain('Biên tập và xuất bản');
    expect(host.querySelector('a[href="#admin/users"]')).toBeNull();
  });

  it('an admin on #admin gets the content page with both tabs', async () => {
    location.hash = '#admin';
    routes['GET /auth/me'] = () => json(view('admin'));
    const host = mount(<PilotApp />);
    await tick();
    expect(host.textContent).toContain('Biên tập và xuất bản');
    const tabs = host.querySelector('nav[aria-label="Khu quản trị"]');
    expect(tabs?.querySelector('[aria-current="page"]')?.textContent).toBe('Nội dung');
    expect(tabs?.querySelector('a[href="#admin/users"]')).not.toBeNull();
  });

  it('student home resumes the server session id; a legacy local key is ignored', async () => {
    localStorage.setItem(
      'seafood-deck:pilot:v1',
      JSON.stringify({ sessionId: 'poisoned', attempts: [], reviews: {} }),
    );
    routes['GET /auth/me'] = () => json(view('student'));
    routes['GET /me/home'] = () => json(meHome('s9'));
    routes['GET /learning/sessions/s9'] = () => json(studyGame('s9'));
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    expect(calls).toContain('GET /me/home');
    await click(button(host, 'Tiếp tục'));
    await tick();
    expect(location.hash).toBe('#study');
    expect(calls).toContain('GET /learning/sessions/s9');
    expect(calls.filter((c) => c.includes('poisoned'))).toEqual([]);
    // A student's session id is never kept in browser storage.
    expect(sessionStorage.getItem(TRIAL_SESSION_KEY)).toBeNull();
    expect(host.querySelector('.study, .haul')).not.toBeNull();
    expect(host.textContent).not.toContain('Trình duyệt không lưu được tiến độ');
  });

  it('a form login as a student opens Home from /me/home at once, without a reload', async () => {
    routes['GET /auth/me'] = () => json(view('guest', { userId: undefined }));
    routes['POST /auth/login'] = () => json(realLogin('student'));
    routes['GET /me/home'] = () => json(meHome(null));
    const host = mount(<PilotApp />);
    await tick();
    setValue(field(host, 'Tên đăng nhập'), 'an');
    setValue(field(host, 'Mật khẩu'), 'dummy-pass-123');
    await submit(host);
    await tick();
    await tick();
    expect(calls).toContain('GET /me/home');
    expect(calls.filter((c) => c === 'GET /auth/me')).toHaveLength(1);
  });

  it('a student reload on #study reopens the session from /me/home, not local storage', async () => {
    location.hash = '#study';
    localStorage.setItem(
      'seafood-deck:pilot:v1',
      JSON.stringify({ sessionId: 'poisoned', attempts: [], reviews: {} }),
    );
    sessionStorage.setItem(TRIAL_SESSION_KEY, JSON.stringify('poisoned'));
    routes['GET /auth/me'] = () => json(view('student'));
    routes['GET /me/home'] = () => json(meHome('s9'));
    routes['GET /learning/sessions/s9'] = () => json(studyGame('s9'));
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    await tick();
    expect(calls.filter((c) => c === 'GET /me/home')).toHaveLength(1);
    expect(calls).toContain('GET /learning/sessions/s9');
    expect(calls.filter((c) => c.includes('poisoned'))).toEqual([]);
    expect(host.querySelector('.study')).not.toBeNull();
  });

  it('a student reload on #study without an active session asks to start one', async () => {
    location.hash = '#study';
    routes['GET /auth/me'] = () => json(view('student'));
    routes['GET /me/home'] = () => json(meHome(null));
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    expect(calls.filter((c) => c.startsWith('GET /learning/'))).toEqual([]);
    expect(host.textContent).toContain('Mở lượt mới từ trang Học.');
  });

  it('a trial reload on #study reopens the tab session and never calls /me', async () => {
    location.hash = '#study';
    sessionStorage.setItem(TRIAL_SESSION_KEY, JSON.stringify('t5'));
    routes['GET /auth/me'] = () => json(view('learner', { userId: undefined }));
    routes['GET /learning/sessions/t5'] = () => json(studyGame('t5'));
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    expect(calls).toContain('GET /learning/sessions/t5');
    expect(calls.filter((c) => c.includes(' /me'))).toEqual([]);
    expect(host.querySelector('.study')).not.toBeNull();
  });

  it('a trial session start keeps its id in sessionStorage; logout clears it', async () => {
    routes['GET /auth/me'] = () => json(view('learner', { userId: undefined }));
    routes['GET /catalog/overview'] = () => json(overview);
    routes['POST /learning/sessions'] = () => json(studyGame('t7'));
    routes['POST /auth/logout'] = () => json(view('guest'));
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    const cast = host.querySelector<HTMLButtonElement>('.home-mode');
    expect(cast).not.toBeNull();
    await click(cast!);
    await tick();
    expect(location.hash).toBe('#study');
    expect(JSON.parse(sessionStorage.getItem(TRIAL_SESSION_KEY)!)).toBe('t7');
    expect(localStorage.getItem('seafood-deck:pilot:v1')).toBeNull();
    await click(button(host, 'Đăng xuất'));
    await tick();
    expect(sessionStorage.getItem(TRIAL_SESSION_KEY)).toBeNull();
  });

  it('manager on home sees the notice, not the learner home', async () => {
    routes['GET /auth/me'] = () => json(view('manager'));
    const host = mount(<PilotApp />);
    await tick();
    expect(host.textContent).toContain('Trang quản lý sẽ có ở bản sau');
    expect(calls.some((c) => c.includes('/catalog/items?learnable'))).toBe(false);
  });

  it('student reaches the account page; shell gets the display name', async () => {
    location.hash = '#account';
    routes['GET /auth/me'] = () => json(view('student', { displayName: 'Lan' }));
    routes['GET /me'] = () =>
      json({ username: 'lan', displayName: 'Lan', role: 'student', mustChangePassword: false });
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    expect(location.hash).toBe('#account');
    expect(host.querySelector('.account h1')?.textContent).toBe('Tài khoản');
    expect(tone(host)).toBe('deep');
    expect(host.querySelector('.shell-actions a[href="#account"]')).not.toBeNull();
  });
});

describe('PilotApp logout keeps unsaved self-ratings in mind', () => {
  const attempt = 'POST /learning/sessions/g1/questions/q1/attempts';
  const rating = { gameId: 'g1', questionId: 'q1', key: 'k1', answer: { rating: 'known' } };
  const score = {
    answered: true,
    skipped: false,
    correct: true,
    selfRated: true,
    questionId: 'q1',
  };
  async function signedIn() {
    location.hash = '#library';
    routes['GET /auth/me'] = () => json(view('learner', { userId: undefined }));
    routes['GET /catalog/overview'] = () => json(overview);
    routes['POST /auth/logout'] = () => json(view('guest', { userId: undefined }));
    const host = mount(<PilotApp />);
    await tick();
    return host;
  }
  const loggedOut = () => calls.filter((c) => c === 'POST /auth/logout').length;

  it('waits for pending saves, saying so, then logs out', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    routes[attempt] = () => gate.then(() => new Response(JSON.stringify(score)));
    const host = await signedIn();
    sessionQueue('g1', () => {}).enqueue(rating);
    await click(button(host, 'Đăng xuất'));
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Đang lưu tiến độ…');
    expect(loggedOut()).toBe(0);
    release();
    await tick();
    await tick();
    expect(calls).toContain(attempt);
    expect(loggedOut()).toBe(1);
    expect(host.textContent).toContain('Học thử bằng mã mời');
    expect(host.textContent).not.toContain('Đang lưu tiến độ…');
  });

  it('a save that failed for good asks first; cancel keeps the session', async () => {
    routes[attempt] = () => json({ message: 'hỏng' }, 400);
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const host = await signedIn();
    const q = sessionQueue('g1', () => {}, { retryMs: [] });
    q.enqueue(rating);
    await q.flush();
    await click(button(host, 'Đăng xuất'));
    await tick();
    expect(confirm).toHaveBeenCalledWith(
      'Còn câu chưa lưu được. Đăng xuất sẽ mất các câu này. Vẫn đăng xuất?',
    );
    expect(loggedOut()).toBe(0);
    expect(pendingTotal()).toBe(1);
    expect(host.textContent).not.toContain('Học thử bằng mã mời');
  });

  it('confirming logs out and drops the unsaved answers', async () => {
    routes[attempt] = () => json({ message: 'hỏng' }, 400);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const host = await signedIn();
    const q = sessionQueue('g1', () => {}, { retryMs: [] });
    q.enqueue(rating);
    await q.flush();
    await click(button(host, 'Đăng xuất'));
    await tick();
    expect(loggedOut()).toBe(1);
    expect(pendingTotal()).toBe(0);
    expect(host.textContent).toContain('Học thử bằng mã mời');
  });

  it('a normal logout disposes every queue: nothing is sent or guarded afterwards', async () => {
    routes[attempt] = () => json(score);
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const host = await signedIn();
    const q = sessionQueue('g1', () => {});
    await click(button(host, 'Đăng xuất'));
    await tick();
    expect(loggedOut()).toBe(1);
    expect(confirm).not.toHaveBeenCalled();
    q.enqueue(rating);
    await tick();
    expect(calls).not.toContain(attempt);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(sessionQueue('g1', () => {})).not.toBe(q);
  });
});

describe('PilotApp sign-out edge cases', () => {
  const attempt = 'POST /learning/sessions/g1/questions/q1/attempts';
  const rating = { gameId: 'g1', questionId: 'q1', key: 'k1', answer: { rating: 'known' } };
  async function signedIn() {
    location.hash = '#library';
    routes['GET /auth/me'] = () => json(view('learner', { userId: undefined }));
    routes['GET /catalog/overview'] = () => json(overview);
    const host = mount(<PilotApp />);
    await tick();
    return host;
  }
  const loggedOut = () => calls.filter((c) => c === 'POST /auth/logout').length;

  it('a second click while the logout request is in flight sends nothing more', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    routes['POST /auth/logout'] = () => gate.then(() => json(view('guest', { userId: undefined })));
    const host = await signedIn();
    await click(button(host, 'Đăng xuất'));
    await click(button(host, 'Đăng xuất'));
    await click(button(host, 'Đăng xuất'));
    expect(loggedOut()).toBe(1);
    release();
    await tick();
    expect(loggedOut()).toBe(1);
    expect(host.textContent).toContain('Học thử bằng mã mời');
  });

  it('the guard drops after a failed logout request, so it can be tried again', async () => {
    routes['POST /auth/logout'] = () => json({ message: 'hỏng' }, 500);
    const host = await signedIn();
    await click(button(host, 'Đăng xuất'));
    await tick();
    await click(button(host, 'Đăng xuất'));
    expect(loggedOut()).toBe(2);
  });

  it('a final 409 whose server result is being adopted shows no confirm box', async () => {
    routes['POST /auth/logout'] = () => json(view('guest', { userId: undefined }));
    routes[attempt] = () => json({ message: 'Câu đã nộp.' }, 409);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    routes['GET /learning/sessions/g1'] = () =>
      gate.then(() =>
        json({
          ...studyGame('g1'),
          questions: [
            {
              ...studyGame('g1').questions[0],
              result: { answered: true, questionId: 'q1', targetId: 't' },
            },
          ],
        }),
      );
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const host = await signedIn();
    sessionQueue('g1', () => {}).enqueue(rating);
    await tick();
    await click(button(host, 'Đăng xuất'));
    expect(confirm).not.toHaveBeenCalled();
    expect(loggedOut()).toBe(0);
    release();
    await tick();
    await tick();
    expect(confirm).not.toHaveBeenCalled();
    expect(loggedOut()).toBe(1);
  });
});

describe('PilotApp 401 on a signed-in route', () => {
  const attempt = 'POST /learning/sessions/g1/questions/q1/attempts';
  const lockedOut = () => json({ message: 'Phiên không hợp lệ.' }, 401);
  const reviewEntry = {
    targetId: 'i1',
    itemId: 'i1',
    label: 'Vẹm xanh',
    skill: 'name:en',
    stage: 0,
    dueAt: '2026-11-20T00:00:00.000Z',
  };
  async function lockedStudent() {
    location.hash = '#review';
    let locked = false;
    routes['GET /auth/me'] = () => json(locked ? view('guest') : view('student'));
    routes['GET /catalog/overview'] = () => json(overview);
    routes['GET /me/mastery'] = () => json({});
    routes['GET /me/review'] = () => json({ due: [reviewEntry], scheduled: [] });
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    locked = true; // the manager locked the account: the server deleted the session
    return host;
  }

  it('a request answered 401 returns to the login screen with no generic error', async () => {
    routes['POST /learning/sessions'] = lockedOut;
    const host = await lockedStudent();
    await click(button(host, 'Ôn 1 mục đến hạn'));
    await tick();
    await tick();
    expect(host.textContent).toContain('Học thử bằng mã mời');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).not.toContain('Phiên không hợp lệ');
    expect(calls.filter((c) => c === 'GET /auth/me')).toHaveLength(2);
  });

  it('a queued answer answered 401 is not retried and the queues are disposed', async () => {
    routes[attempt] = lockedOut;
    const host = await lockedStudent();
    const q = sessionQueue('g1', () => {}, { retryMs: [5, 5] });
    q.enqueue({ gameId: 'g1', questionId: 'q1', key: 'k', answer: { rating: 'known' } });
    await tick();
    await tick();
    await tick();
    expect(calls.filter((c) => c === attempt)).toHaveLength(1);
    expect(pendingTotal()).toBe(0);
    expect(host.textContent).toContain('Học thử bằng mã mời');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('a wrong-password 401 on the login form is not a session loss', async () => {
    routes['GET /auth/me'] = () => json(view('guest'));
    routes['POST /auth/login'] = () => json({ message: 'Sai thông tin.' }, 401);
    const host = mount(<PilotApp />);
    await tick();
    const before = calls.filter((c) => c === 'GET /auth/me').length;
    const [user, secret] = host.querySelectorAll<HTMLInputElement>('input');
    setValue(user, 'lan');
    setValue(secret, 'xxxxxxxxxx');
    await submit(host);
    await tick();
    expect(calls).toContain('POST /auth/login');
    expect(calls.filter((c) => c === 'GET /auth/me').length).toBe(before);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('chưa đúng');
  });

  it('a review start sends limit only when set, other bodies unchanged', async () => {
    routes['POST /learning/sessions'] = () => json(studyGame('g2'));
    const host = await lockedStudent();
    await click(button(host, 'Ôn 1 mục đến hạn'));
    await tick();
    const body = JSON.parse(String(inits[calls.indexOf('POST /learning/sessions')]!.body));
    expect(body).toEqual({ mode: 'review', kind: 'en', limit: 1 });
  });
});

describe('PilotApp admin one-time password guard', () => {
  async function selfReset() {
    location.hash = '#admin/users';
    routes['GET /auth/me'] = () => json(view('admin'));
    routes['POST /auth/logout'] = () => json(view('guest'));
    routes['GET /admin/users?page=1&limit=20'] = () =>
      json({
        items: [
          {
            id: 'u-admin',
            username: 'owner',
            displayName: null,
            role: 'admin',
            disabled: false,
            mustChangePassword: false,
            createdAt: '2026-11-01T00:00:00.000Z',
            lastLoginAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    routes['POST /admin/users/u-admin/reset-password'] = () =>
      json({ temporaryPassword: 'OwnTmp7xKq9Rz2aBcDeF' });
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    const row = host.querySelector<HTMLElement>('[data-user="u-admin"]')!;
    await click(button(row, 'Đặt lại mật khẩu'));
    await click(button(host.querySelector<HTMLElement>('[role="dialog"]')!, 'Đặt lại'));
    await tick();
    expect(host.textContent).toContain('OwnTmp7xKq9Rz2aBcDeF');
    return host;
  }
  const loggedOut = () => calls.filter((c) => c === 'POST /auth/logout').length;

  it('logout asks first; declining keeps the password on screen', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const host = await selfReset();
    await click(button(host.querySelector('.shell-header')!, 'Đăng xuất'));
    await tick();
    expect(confirm).toHaveBeenCalledOnce();
    expect(loggedOut()).toBe(0);
    expect(host.textContent).toContain('OwnTmp7xKq9Rz2aBcDeF');
  });

  it('confirming the logout discards the password and signs out', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const host = await selfReset();
    await click(button(host.querySelector('.shell-header')!, 'Đăng xuất'));
    await tick();
    expect(loggedOut()).toBe(1);
    expect(host.textContent).not.toContain('OwnTmp7xKq9Rz2aBcDeF');
  });

  it('navigating to another route asks first; declining stays on the users screen', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const host = await selfReset();
    location.hash = '#library';
    await tick();
    await tick();
    expect(confirm).toHaveBeenCalledOnce();
    expect(location.hash).toBe('#admin/users');
    expect(host.textContent).toContain('OwnTmp7xKq9Rz2aBcDeF');
  });

  it('confirming the navigation leaves the screen and drops the password', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const host = await selfReset();
    location.hash = '#library';
    await tick();
    await tick();
    expect(location.hash).toBe('#library');
    expect(host.textContent).not.toContain('OwnTmp7xKq9Rz2aBcDeF');
  });

  it('once the panel is closed nothing asks any more', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const host = await selfReset();
    await click(button(host.querySelector<HTMLElement>('.users-reveal')!, 'Đóng'));
    await tick();
    location.hash = '#library';
    await tick();
    expect(confirm).not.toHaveBeenCalled();
    expect(location.hash).toBe('#library');
  });
});
