import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import StudioApp from './StudioApp';
import { api, setAuthRequiredHandler, setUnauthorizedHandler, type AuthView } from '@web/pilot/api';
import { setLeaveGuard } from '@web/pilot/leaveGuard';
import { clearMe } from '@web/learner/meStore';
import { kindOf, routeAllowed, routesFor } from './role';
import { button, click, field, mount, setValue, submit, unmountAll } from '@web/learner/testDom';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const view = (role: string, extra: object = {}) => ({
  role,
  internal: false,
  csrf: 'c-' + role,
  expiresAt: 'x',
  userId: role === 'guest' ? undefined : 'u-' + role,
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
const LEARNERS = 'GET /manager/learners?sort=lastStudyAt&dir=desc&page=1&limit=20';
const USERS = 'GET /admin/users?page=1&limit=20';
const MUST = { message: 'Cần đổi mật khẩu trước.', code: 'MUST_CHANGE_PASSWORD' };
const ownAdmin = {
  id: 'u-admin',
  username: 'owner',
  displayName: null,
  role: 'admin',
  disabled: false,
  mustChangePassword: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  lastLoginAt: null,
};
let routes: Record<string, () => Promise<Response>>;
let calls: string[];
let inits: (RequestInit | undefined)[];
beforeEach(() => {
  clearMe();
  setAuthRequiredHandler(null);
  setUnauthorizedHandler(null);
  setLeaveGuard(null);
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
  localStorage.clear();
  sessionStorage.clear();
  unmountAll();
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
const tone = (h: HTMLElement) => h.querySelector('.shell')?.getAttribute('data-tone');
const navLabels = (h: HTMLElement) =>
  [...h.querySelectorAll('nav.shell-tabbar a, nav.shell-tabs a')].map((a) => a.textContent);
const headerOf = (key: string) =>
  (inits[calls.lastIndexOf(key)]?.headers as Record<string, string>)['X-CSRF-Token'];
const staffCalls = () => calls.filter((c) => / \/(admin|manager)\b/.test(c));
async function open(role: string, hash: string, extra: object = {}) {
  routes['GET /auth/me'] = () => json(view(role, extra));
  location.hash = hash;
  const host = mount(<StudioApp />);
  await tick();
  await tick();
  return host;
}

describe('StudioApp sign-in', () => {
  it('a guest sees the staff login on every route and no screen loads', async () => {
    for (const hash of ['#home', '#admin', '#admin/users', '#manager', '#manager/learner/a1']) {
      const host = await open('guest', hash);
      expect(host.textContent, hash).toContain('Đăng nhập quản trị');
      expect(host.textContent, hash).not.toContain('Học thử');
      expect(tone(host), hash).toBe('deep');
      expect(host.querySelectorAll('nav')).toHaveLength(0);
      expect(staffCalls(), hash).toEqual([]);
      unmountAll();
    }
  });

  it('a learner or student session is treated as signed out: staff login, nothing else', async () => {
    for (const role of ['learner', 'student']) {
      const host = await open(role, '#admin');
      expect(host.textContent, role).toContain('Đăng nhập quản trị');
      expect(host.querySelectorAll('nav'), role).toHaveLength(0);
      expect(host.querySelector('[aria-label="Đăng xuất"]'), role).toBeNull();
      expect(staffCalls(), role).toEqual([]);
      expect(calls.filter((c) => c.includes(' /me') || c.includes('/learning/'))).toEqual([]);
      unmountAll();
    }
  });

  it('signing in as an editor opens the content page at once', async () => {
    routes['GET /auth/me'] = () => json(view('guest'));
    routes['POST /auth/login'] = () => json(realLogin('editor'));
    location.hash = '#home';
    const host = mount(<StudioApp />);
    await tick();
    setValue(field(host, 'Tài khoản'), 'bien');
    setValue(field(host, 'Mật khẩu'), 'dummy-pass-123');
    await submit(host);
    await tick();
    await tick();
    expect(location.hash).toBe('#admin');
    expect(host.textContent).toContain('Biên tập và xuất bản');
    expect(calls.filter((c) => c === 'GET /auth/me')).toHaveLength(1);
  });

  it('a wrong-password 401 on the login form is not a session loss', async () => {
    routes['GET /auth/me'] = () => json(view('guest'));
    routes['POST /auth/login'] = () => json({ message: 'Sai thông tin.' }, 401);
    const host = mount(<StudioApp />);
    await tick();
    const before = calls.filter((c) => c === 'GET /auth/me').length;
    setValue(field(host, 'Tài khoản'), 'lan');
    setValue(field(host, 'Mật khẩu'), 'xxxxxxxxxx');
    await submit(host);
    await tick();
    expect(calls).toContain('POST /auth/login');
    expect(calls.filter((c) => c === 'GET /auth/me').length).toBe(before);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('chưa đúng');
  });
});

describe('StudioApp tabs per role', () => {
  const cases: [string, string, string[]][] = [
    ['editor', '#admin', ['Quản trị', 'Thư viện']],
    ['reviewer', '#admin', ['Quản trị', 'Thư viện']],
    ['publisher', '#admin', ['Quản trị', 'Thư viện']],
    ['manager', '#manager', ['Học viên', 'Thư viện', 'Tài khoản']],
    ['admin', '#admin', ['Quản trị', 'Người dùng', 'Học viên', 'Thư viện']],
  ];
  it.each(cases)('%s sees exactly its tabs', async (role, hash, tabs) => {
    routes[LEARNERS] = () => json({ items: [], total: 0, page: 1, limit: 20 });
    const host = await open(role, hash);
    expect(location.hash).toBe(hash);
    expect(navLabels(host)).toEqual(tabs);
    for (const other of ['Học', 'Ôn tập', 'Tiến độ', 'Người dùng', 'Học viên', 'Tài khoản'])
      if (!tabs.includes(other)) expect(navLabels(host)).not.toContain(other);
    expect(host.querySelector('a[href="#study"], a[href="#home"], a[href="#review"]')).toBeNull();
    expect(host.querySelector('.shell-wordmark')?.textContent).toBe('Seafood Deck Studio');
  });
});

describe('StudioApp role-aware routes', () => {
  it('staff and admin never request /me*; a manager reads only GET /me, on its account screen', async () => {
    // Every allowed route comes from the route table, so new routes are covered automatically.
    const views: [string, AuthView][] = [
      ['manager', view('manager')],
      ['editor', view('editor')],
      ['reviewer', view('reviewer')],
      ['publisher', view('publisher')],
      ['admin', view('admin')],
    ];
    const isMe = (c: string) => {
      const p = c.split(' ')[1].split('?')[0];
      return p === '/me' || p.startsWith('/me/');
    };
    /** `/me*` calls per session label, then per route visited. */
    const meCalls: Record<string, Record<string, string[]>> = {};
    const visited: string[] = [];
    for (const [label, v] of views) {
      const kind = kindOf(v);
      const hashes = [...routesFor(kind), 'profile/x'].filter((r) => routeAllowed(kind, r));
      expect(hashes.length).toBeGreaterThan(1);
      routes['GET /auth/me'] = () => json(v);
      routes['GET /catalog/items/x'] = () => json(profileItem);
      routes[LEARNERS] = () => json({ items: [], total: 0, page: 1, limit: 20 });
      routes[USERS] = () => json({ items: [], total: 0, page: 1, limit: 20 });
      routes['GET /me'] = () =>
        json({ username: 'hà', displayName: null, role: 'manager', mustChangePassword: false });
      routes['GET /manager/learners/x'] = () =>
        json({ id: 'x', username: 'x', displayName: 'Lan', disabled: false });
      meCalls[label] = {};
      for (const hash of [
        ...hashes,
        ...(kind === 'manager' || kind === 'admin' ? ['manager/learner/x'] : []),
      ]) {
        location.hash = '#' + hash;
        const before = calls.length;
        const host = mount(<StudioApp />);
        await tick();
        await tick();
        expect(location.hash, `${label} ${hash}`).toBe('#' + hash);
        expect(host.querySelector('.shell')).not.toBeNull();
        visited.push(`${v.role} ${hash}`);
        unmountAll();
        meCalls[label][hash] = calls.slice(before).filter(isMe);
      }
    }
    expect(visited).toContain('admin admin/users');
    expect(visited).toContain('admin manager');
    expect(visited).toContain('manager manager');
    expect(visited).toContain('manager manager/learner/x');
    expect(visited).toContain('manager account');
    expect(visited).not.toContain('editor admin/users');
    expect(calls).toContain(USERS);
    expect(calls).toContain(LEARNERS);
    // No Study in the Studio app: nobody ever opens a learning session.
    expect(calls.filter((c) => c.includes('/learning/'))).toEqual([]);
    const flat = (label: string) => Object.values(meCalls[label]).flat();
    for (const label of ['editor', 'reviewer', 'publisher', 'admin'])
      expect(flat(label), label).toEqual([]);
    // A manager's own account screen reads the account itself, never the learner views
    // (/me/home, /me/review, /me/progress, /me/mastery); no other manager screen reads /me*.
    expect(meCalls.manager.account).toEqual(['GET /me']);
    for (const [hash, list] of Object.entries(meCalls.manager))
      if (hash !== 'account') expect(list, `manager ${hash}`).toEqual([]);
  });

  it('a manager on a species profile has no study start and never opens a session', async () => {
    routes['GET /catalog/items/x'] = () => json(profileItem);
    routes['POST /learning/sessions'] = () => json({ id: 'g1' });
    const host = await open('manager', '#profile/x');
    expect(host.textContent).toContain('Vẹm xanh');
    const startButton = host.querySelector<HTMLButtonElement>('.profile-primary');
    if (startButton) await click(startButton);
    await tick();
    expect(calls.filter((c) => c.startsWith('POST /learning/'))).toEqual([]);
    expect(startButton).toBeNull();
  });

  it('staff on a species profile has no study start either', async () => {
    routes['GET /catalog/items/x'] = () => json(profileItem);
    const host = await open('editor', '#profile/x');
    expect(host.textContent).toContain('Vẹm xanh');
    expect(host.querySelector('.profile-primary')).toBeNull();
  });

  it('routes not allowed for the kind go back to its home', async () => {
    const cases: [string, string, string][] = [
      ['manager', '#home', '#manager'],
      ['manager', '#review', '#manager'],
      ['manager', '#study', '#manager'],
      ['manager', '#manager/other', '#manager'],
      ['manager', '#admin', '#manager'],
      ['manager', '#admin/users', '#manager'],
      ['editor', '#home', '#admin'],
      ['editor', '#study', '#admin'],
      ['editor', '#manager', '#admin'],
      ['editor', '#manager/learner/x', '#admin'],
      ['editor', '#admin/users', '#admin'],
      ['editor', '#account', '#admin'],
      ['publisher', '#admin/users', '#admin'],
      ['reviewer', '#progress', '#admin'],
      ['admin', '#home', '#admin'],
      ['admin', '#account', '#admin'],
      ['admin', '#review', '#admin'],
      ['admin', '#progress', '#admin'],
      ['admin', '#study', '#admin'],
    ];
    routes[LEARNERS] = () => json({ items: [], total: 0, page: 1, limit: 20 });
    for (const [role, hash, home] of cases) {
      const host = await open(role, hash);
      expect(location.hash, `${role} ${hash}`).toBe(home);
      expect(host.querySelector('#account-title, .study'), `${role} ${hash}`).toBeNull();
      unmountAll();
    }
    expect(calls.filter((c) => c.includes(' /me') || c.includes('/learning/'))).toEqual([]);
  });

  it('an admin on #admin/users sees the users screen under the shell tabs only', async () => {
    routes[USERS] = () => json({ items: [], total: 0, page: 1, limit: 20 });
    const host = await open('admin', '#admin/users');
    expect(location.hash).toBe('#admin/users');
    const tabs = host.querySelector('nav[aria-label="Điều hướng chính"]');
    expect([...tabs!.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'Quản trị',
      'Người dùng',
      'Học viên',
      'Thư viện',
    ]);
    expect(tabs!.querySelector('[aria-current="page"]')?.textContent).toBe('Người dùng');
    expect(host.querySelector('nav[aria-label="Khu quản trị"]')).toBeNull();
    expect(host.querySelector('h1')?.textContent).toBe('Người dùng');
  });

  it('with the admin own own one-time password on screen, the tabs cannot leave unless confirmed', async () => {
    routes[USERS] = () => json({ items: [ownAdmin], total: 1, page: 1, limit: 20 });
    routes['POST /admin/users/u-admin/reset-password'] = () =>
      json({ temporaryPassword: 'OwnTmp7xKq9Rz2aBcDeF' });
    routes[LEARNERS] = () => json({ items: [], total: 0, page: 1, limit: 20 });
    const host = await open('admin', '#admin/users');
    await click(
      button(host.querySelector<HTMLElement>('[data-user="u-admin"]')!, 'Đặt lại mật khẩu'),
    );
    await click(button(host.querySelector<HTMLElement>('[role="dialog"]')!, 'Đặt lại'));
    await tick();
    expect(host.textContent).toContain('OwnTmp7xKq9Rz2aBcDeF');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const go = async (hash: string) => {
      location.hash = hash;
      await tick();
      await tick();
    };
    await go('#manager');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe('#admin/users');
    expect(host.textContent).toContain('OwnTmp7xKq9Rz2aBcDeF');
    confirm.mockReturnValue(true);
    await go('#manager');
    expect(location.hash).toBe('#manager');
    expect(host.textContent).not.toContain('OwnTmp7xKq9Rz2aBcDeF');
    confirm.mockRestore();
  });

  it('an admin resetting their own password keeps the one-time password until closing it', async () => {
    let mustChange = false;
    routes[USERS] = () =>
      mustChange ? json(MUST, 403) : json({ items: [ownAdmin], total: 1, page: 1, limit: 20 });
    routes['POST /admin/users/u-admin/reset-password'] = () => {
      mustChange = true; // the server now answers MUST_CHANGE_PASSWORD on guarded routes
      return json({ temporaryPassword: 'OwnTmp7xKq9Rz2aBcDeF' });
    };
    const host = await open('admin', '#admin/users');
    const row = host.querySelector<HTMLElement>('[data-user="u-admin"]')!;
    await click(button(row, 'Đặt lại mật khẩu'));
    await click(button(host.querySelector<HTMLElement>('[role="dialog"]')!, 'Đặt lại'));
    await tick();
    await tick();
    expect(host.textContent).toContain('OwnTmp7xKq9Rz2aBcDeF');
    expect(host.textContent).not.toContain('Bạn cần đặt mật khẩu mới');
    expect(calls.filter((c) => c === USERS)).toHaveLength(1);
    await click(button(host.querySelector<HTMLElement>('.users-reveal')!, 'Đóng'));
    await tick();
    await tick();
    expect(calls.filter((c) => c === USERS)).toHaveLength(2);
    expect(host.textContent).toContain('Bạn cần đặt mật khẩu mới');
    expect(host.textContent).not.toContain('OwnTmp7xKq9Rz2aBcDeF');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('OwnTmp');
    expect(location.href).not.toContain('OwnTmp');
  });

  it('an editor on #admin gets the content page without the users tab', async () => {
    const host = await open('editor', '#admin');
    expect(host.textContent).toContain('Biên tập và xuất bản');
    expect(host.querySelector('a[href="#admin/users"]')).toBeNull();
  });

  it('an admin on #admin gets the content page under the shell tabs only', async () => {
    const host = await open('admin', '#admin');
    expect(host.textContent).toContain('Biên tập và xuất bản');
    const tabs = host.querySelector('nav[aria-label="Điều hướng chính"]');
    expect(tabs?.querySelector('[aria-current="page"]')?.textContent).toBe('Quản trị');
    expect(tabs?.querySelector('a[href="#admin/users"]')).not.toBeNull();
    expect(host.querySelector('nav[aria-label="Khu quản trị"]')).toBeNull();
  });

  it('manager on home goes straight to the learner table', async () => {
    routes[LEARNERS] = () =>
      json({
        items: [
          {
            id: 'a1',
            username: 'lan',
            displayName: 'Lan',
            disabled: false,
            learning: 1,
            solid: 0,
            avgLevel: 1,
            lastStudyAt: null,
            overdue: 0,
            sessions7d: 0,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    const host = await open('manager', '#home');
    expect(location.hash).toBe('#manager');
    expect(host.querySelector('h1')?.textContent).toBe('Học viên');
    expect(host.textContent).toContain('Lan');
    expect(tone(host)).toBe('ice');
    expect(calls.some((c) => c.includes('/catalog/items?learnable'))).toBe(false);
    expect(host.querySelector('nav a[href="#manager"]')).not.toBeNull();
  });

  it('manager on #account sees the account screen without learner views', async () => {
    routes['GET /me'] = () =>
      json({ username: 'ha', displayName: 'Hà', role: 'manager', mustChangePassword: false });
    const host = await open('manager', '#account');
    expect(location.hash).toBe('#account');
    expect(host.querySelector('#account-title')?.textContent).toBe('Tài khoản');
    expect(host.querySelector('.account-stage')).not.toBeNull();
    expect(calls).toContain('GET /me');
    expect(calls.filter((c) => /\/me\/(progress|review|mastery|home)/.test(c))).toEqual([]);
    expect(host.textContent).not.toMatch(/tiến độ|theo dõi/i);
    expect(host.querySelector('a[href="#account"][aria-current="page"]')).not.toBeNull();
    expect(tone(host)).toBe('deep');
  });

  it('manager account calls only GET/PATCH /me and POST /me/password; the new csrf is adopted (16+ characters)', async () => {
    routes['GET /me'] = () =>
      json({ username: 'ha', displayName: 'Hà', role: 'manager', mustChangePassword: false });
    routes['POST /me/password'] = () =>
      json({ ...view('manager'), csrf: 'c-new-m', displayName: 'Hà', mustChangePassword: false });
    routes['PATCH /me'] = () =>
      json({ username: 'ha', displayName: 'Hà Nội', role: 'manager', mustChangePassword: false });
    const host = await open('manager', '#account');
    await click(button(host, 'Đổi mật khẩu'));
    setValue(field(host, 'Mật khẩu hiện tại'), 'dummy-old-pass-manager');
    setValue(field(host, 'Mật khẩu mới'), 'short-pass1');
    setValue(field(host, 'Nhập lại mật khẩu mới'), 'short-pass1');
    await submit(host);
    await tick();
    expect(host.textContent).toContain('ít nhất 16');
    expect(calls).not.toContain('POST /me/password');
    setValue(field(host, 'Mật khẩu mới'), 'dummy-new-pass-manager1');
    setValue(field(host, 'Nhập lại mật khẩu mới'), 'dummy-new-pass-manager1');
    await submit(host);
    await tick();
    expect(host.textContent).toContain('Đã đổi mật khẩu');
    setValue(field(host, 'Tên hiển thị'), 'Hà Nội');
    await submit(host);
    await tick();
    expect(headerOf('PATCH /me')).toBe('c-new-m');
    const me = calls.filter((c) => / \/me(\/|\?|$)/.test(c));
    expect([...new Set(me)].sort()).toEqual(['GET /me', 'PATCH /me', 'POST /me/password']);
  });

  it('a manager opening a learner sees the detail with the name and a way back', async () => {
    routes['GET /manager/learners/a1'] = () =>
      json({ id: 'a1', username: 'lan', displayName: 'Lan Nguyễn', disabled: false });
    const host = await open('manager', '#manager/learner/a1');
    expect(host.querySelector('h1')?.textContent).toBe('Học viên: Lan Nguyễn');
    expect(host.querySelector('a[href="#manager"]')).not.toBeNull();
    // The embedded Tiến độ / Lịch ôn tập heroes bleed to the edges: only the ice stage clips
    // them (overflow-x: clip), so the detail must sit in it like the learner's own pages.
    expect(host.querySelector('.manager-detail')?.parentElement?.className).toBe('ice-stage');
    // Read-only: no way to start a review for someone else.
    expect(calls.filter((c) => c.includes('/learning/'))).toEqual([]);
  });

  it('decodes the learner id from the hash once, so reserved characters survive', async () => {
    routes['GET /manager/learners/a%2Fb%20c'] = () =>
      json({ id: 'a/b c', username: 'lan', displayName: 'Lan Nguyễn', disabled: false });
    const host = await open('manager', '#manager/learner/a%2Fb%20c');
    expect(calls).toContain('GET /manager/learners/a%2Fb%20c');
    expect(calls.some((c) => c.includes('%25'))).toBe(false);
    expect(host.querySelector('h1')?.textContent).toBe('Học viên: Lan Nguyễn');
  });

  it('the library is read-only: no mastery read, no learning session', async () => {
    routes['GET /catalog/overview'] = () =>
      json({
        releaseId: 'rel1',
        internal: false,
        learnable: 0,
        groups: { fish: 0, crustacean: 0, mollusc: 0, other: 0, none: 0 },
        hsCases: 0,
        items: [],
      });
    for (const role of ['editor', 'manager', 'admin']) {
      const host = await open(role, '#library');
      expect(location.hash, role).toBe('#library');
      expect(host.querySelector('.ice-stage'), role).not.toBeNull();
      unmountAll();
    }
    expect(calls.filter((c) => c.includes(' /me') || c.includes('/learning/'))).toEqual([]);
  });
});

describe('StudioApp forced password change', () => {
  it('mustChangePassword shows the forced screen only, deep tone, no nav, no staff requests', async () => {
    for (const role of ['editor', 'manager', 'admin']) {
      const host = await open(role, role === 'manager' ? '#manager' : '#admin', {
        mustChangePassword: true,
      });
      expect(host.textContent, role).toContain('Bạn cần đặt mật khẩu mới');
      expect(host.querySelector('.change-password'), role).not.toBeNull();
      expect(tone(host), role).toBe('deep');
      expect(host.querySelectorAll('nav'), role).toHaveLength(0);
      expect(host.textContent, role).not.toContain('Hủy');
      expect(staffCalls(), role).toEqual([]);
      unmountAll();
    }
  });

  it('a MUST_CHANGE_PASSWORD 403 from a screen flips to the forced screen', async () => {
    routes[USERS] = () => json(MUST, 403);
    const host = await open('admin', '#admin/users');
    expect(host.textContent).toContain('Bạn cần đặt mật khẩu mới');
    expect(host.querySelectorAll('nav')).toHaveLength(0);
  });

  it('after the change it adopts the new csrf and shows the screens again', async () => {
    routes['POST /me/password'] = () =>
      json({ ...view('editor'), csrf: 'c-new', displayName: 'Lan', mustChangePassword: false });
    routes['POST /auth/logout'] = () => json(view('guest'));
    const host = await open('editor', '#admin', { mustChangePassword: true });
    setValue(field(host, 'Mật khẩu hiện tại'), 'dummy-old-pass');
    setValue(field(host, 'Mật khẩu mới'), 'dummy-new-pass-editor1');
    setValue(field(host, 'Nhập lại mật khẩu mới'), 'dummy-new-pass-editor1');
    await submit(host);
    await tick();
    expect(headerOf('POST /me/password')).toBe('c-editor');
    // The response is the new session view: no second /auth/me round trip.
    expect(calls.filter((c) => c === 'GET /auth/me')).toHaveLength(1);
    expect(host.textContent).not.toContain('Bạn cần đặt mật khẩu mới');
    expect(host.textContent).toContain('Biên tập và xuất bản');
    await click(button(host.querySelector('.shell-header')!, 'Đăng xuất'));
    await tick();
    expect(headerOf('POST /auth/logout')).toBe('c-new');
  });

  it('logout from the forced screen returns to the staff login; the next login is not forced', async () => {
    routes['POST /auth/logout'] = () => json(view('guest'));
    routes['POST /auth/login'] = () => json(realLogin('editor'));
    const host = await open('editor', '#admin', { mustChangePassword: true });
    await click(button(host, 'Đăng xuất'));
    await tick();
    expect(host.textContent).toContain('Đăng nhập quản trị');
    setValue(field(host, 'Tài khoản'), 'khac');
    setValue(field(host, 'Mật khẩu'), 'dummy-pass-123');
    await submit(host);
    await tick();
    expect(host.textContent).not.toContain('Bạn cần đặt mật khẩu mới');
  });

  it('a flag raised while guest does not stick to the next login', async () => {
    routes['POST /auth/login'] = () => json(realLogin('editor'));
    const host = await open('guest', '#admin');
    routes['GET /x'] = () => json(MUST, 403);
    await act(async () => void (await api('/x').catch(() => null)));
    expect(host.textContent).toContain('Đăng nhập quản trị');
    setValue(field(host, 'Tài khoản'), 'a');
    setValue(field(host, 'Mật khẩu'), 'dummy-pass-123');
    await submit(host);
    await tick();
    expect(host.textContent).not.toContain('Bạn cần đặt mật khẩu mới');
  });
});

describe('StudioApp 401 on a signed-in route', () => {
  it('a request answered 401 returns to the staff login with no error note', async () => {
    let locked = false;
    routes['GET /auth/me'] = () => json(locked ? view('guest') : view('admin'));
    routes[USERS] = () =>
      locked
        ? json({ message: 'Phiên không hợp lệ.' }, 401)
        : json({ items: [], total: 0, page: 1, limit: 20 });
    location.hash = '#admin/users';
    const host = mount(<StudioApp />);
    await tick();
    await tick();
    locked = true; // the account was locked: the server deleted the session
    location.hash = '#manager';
    await tick();
    location.hash = '#admin/users';
    await tick();
    await tick();
    expect(host.textContent).toContain('Đăng nhập quản trị');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).not.toContain('Phiên không hợp lệ');
    expect(calls.filter((c) => c === 'GET /auth/me')).toHaveLength(2);
  });

  it('a stray 401 while the same user is still signed in keeps the screen and adopts the csrf', async () => {
    routes['GET /me/stray'] = () => json({ message: 'Phiên không hợp lệ.' }, 401);
    const host = await open('editor', '#admin');
    // The same user, with a rotated csrf.
    routes['GET /auth/me'] = () => json(view('editor', { csrf: 'c-fresh' }));
    await act(async () => void (await api('/me/stray').catch(() => {})));
    await tick();
    expect(host.textContent).toContain('Biên tập và xuất bản');
    expect(host.textContent).not.toContain('Đăng nhập quản trị');
    routes['POST /probe'] = () => json({});
    await act(async () => void (await api('/probe', {})));
    expect(calls.filter((c) => c === 'GET /auth/me')).toHaveLength(2);
    expect(headerOf('POST /probe')).toBe('c-fresh');
  });

  it('two 401s at once recover once', async () => {
    let locked = false;
    routes['GET /auth/me'] = () => json(locked ? view('guest') : view('editor'));
    routes['GET /me/stray'] = () => json({ message: 'Phiên không hợp lệ.' }, 401);
    location.hash = '#admin';
    const host = mount(<StudioApp />);
    await tick();
    await tick();
    locked = true;
    const stray = () => api('/me/stray').catch(() => {});
    await act(async () => void (await Promise.all([stray(), stray()])));
    await tick();
    expect(calls.filter((c) => c === 'GET /auth/me')).toHaveLength(2);
    expect(host.textContent).toContain('Đăng nhập quản trị');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('StudioApp admin one-time password guard', () => {
  async function selfReset() {
    routes['POST /auth/logout'] = () => json(view('guest'));
    routes[USERS] = () => json({ items: [ownAdmin], total: 1, page: 1, limit: 20 });
    routes['POST /admin/users/u-admin/reset-password'] = () =>
      json({ temporaryPassword: 'OwnTmp7xKq9Rz2aBcDeF' });
    const host = await open('admin', '#admin/users');
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
    expect(host.textContent).toContain('Đăng nhập quản trị');
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
