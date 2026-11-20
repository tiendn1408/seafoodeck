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
beforeEach(() => {
  clearMe();
  setAuthRequiredHandler(null);
  location.hash = '#home';
  calls = [];
  routes = {};
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
      return json({ ok: true });
    };
    const host = mount(<PilotApp />);
    await tick();
    setValue(field(host, 'Mật khẩu hiện tại'), 'dummy-old-pass');
    setValue(field(host, 'Mật khẩu mới'), 'dummy-new-pass1');
    setValue(field(host, 'Nhập lại mật khẩu mới'), 'dummy-new-pass1');
    await submit(host);
    await tick();
    expect(calls.filter((c) => c === 'GET /auth/me').length).toBe(2);
    expect(host.textContent).not.toContain('Quản trị viên yêu cầu');
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
