import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import PilotApp from './PilotApp';
import { setAuthRequiredHandler } from './api';
import { clearMe } from '../learner/meStore';
import { disposeAll } from '../learner/study/submitQueues';
import { mount, unmountAll } from '../learner/testDom';

// The learner app must not reveal that a staff area exists: no route, tab, label, link or
// request of it, whoever is signed in. A staff session (which the API never issues on the
// learner host) is treated exactly like a signed-out visitor.
const MARKUP = /admin|manager|staff|studio/i;
// "học viên" alone is ordinary learner copy ("tài khoản học viên"); as a tab it is not.
const COPY = /quản trị|người dùng|quản lý|biên tập/i;
const LEARNER_TABS = ['Học', 'Thư viện', 'Ôn tập', 'Tiến độ'];
const tabLabels = (h: HTMLElement) =>
  [...h.querySelectorAll('nav a')].map((a) => a.textContent?.trim() ?? '');
const ROUTES = [
  'home',
  'library',
  'review',
  'progress',
  'study',
  'account',
  'profile/x',
  'admin',
  'admin/users',
  'manager',
  'manager/learner/x',
];
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const view = (role: string) => ({
  role,
  internal: false,
  csrf: 'c-' + role,
  expiresAt: 'x',
  ...(role === 'guest' ? {} : { userId: 'u-' + role, displayName: 'An' }),
});
let calls: string[];
let me: object;
beforeEach(() => {
  clearMe();
  setAuthRequiredHandler(null);
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push(key);
      if (key === 'GET /auth/me') return json(me);
      return json({ message: 'unrouted ' + key }, 404);
    }),
  );
});
afterEach(() => {
  disposeAll();
  sessionStorage.clear();
  unmountAll();
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
async function render(role: string, hash: string, extra: object = {}) {
  me = { ...view(role), ...extra };
  location.hash = '#' + hash;
  const host = mount(<PilotApp />);
  await tick();
  await tick();
  return host;
}

describe('PilotApp carries no staff-area marker', () => {
  it.each(['guest', 'learner', 'student'])(
    '%s: no rendered route, tab, label or link names a staff area',
    async (role) => {
      for (const hash of ROUTES) {
        const host = await render(role, hash);
        const where = `${role} #${hash}`;
        expect(host.innerHTML, where).not.toMatch(MARKUP);
        expect(host.textContent, where).not.toMatch(COPY);
        // A signed-in learner on an unknown route is sent home; a guest keeps the sign-in.
        if (role !== 'guest') expect(location.hash, where).not.toMatch(MARKUP);
        for (const label of tabLabels(host)) expect(LEARNER_TABS, where).toContain(label);
        unmountAll();
      }
      expect(calls.filter((c) => MARKUP.test(c))).toEqual([]);
    },
  );

  it.each(['editor', 'reviewer', 'publisher', 'manager', 'admin', 'wizard'])(
    'a %s session is treated as a signed-out visitor and reveals nothing',
    async (role) => {
      for (const hash of ROUTES) {
        const host = await render(role, hash);
        const where = `${role} #${hash}`;
        // Exactly the learner sign-in a guest sees: no tabs, no account entry, no logout.
        expect(host.textContent, where).toContain('Học thử bằng mã mời');
        expect(host.querySelectorAll('nav'), where).toHaveLength(0);
        expect(host.querySelector('[aria-label="Đăng xuất"]'), where).toBeNull();
        expect(host.innerHTML, where).not.toMatch(MARKUP);
        expect(host.textContent, where).not.toMatch(COPY);
        unmountAll();
      }
      // No learner-only or staff request is made for such a session either.
      expect(calls.filter((c) => c !== 'GET /auth/me' && !c.startsWith('GET /catalog/'))).toEqual(
        [],
      );
    },
  );

  // The forced password screen is what a learner sees after their password was reset: it must
  // be as neutral as every other screen.
  it.each(['learner', 'student'])(
    '%s with mustChangePassword: the forced screen names no staff area',
    async (role) => {
      for (const hash of ROUTES) {
        const host = await render(role, hash, { mustChangePassword: true });
        const where = `${role} forced #${hash}`;
        expect(host.querySelector('.change-password'), where).not.toBeNull();
        expect(host.innerHTML, where).not.toMatch(MARKUP);
        expect(host.textContent, where).not.toMatch(COPY);
        unmountAll();
      }
      expect(calls.filter((c) => MARKUP.test(c))).toEqual([]);
    },
  );

  it('a MUST_CHANGE_PASSWORD 403 flips to a forced screen that names no staff area', async () => {
    me = view('student');
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
        calls.push(key);
        if (key === 'GET /auth/me') return json(me);
        if (key === 'GET /me/home') {
          return json({ message: 'Cần đổi mật khẩu trước.', code: 'MUST_CHANGE_PASSWORD' }, 403);
        }
        return json({ message: 'unrouted ' + key }, 404);
      }),
    );
    location.hash = '#home';
    const host = mount(<PilotApp />);
    await tick();
    await tick();
    expect(calls).toContain('GET /me/home');
    expect(host.querySelector('.change-password')).not.toBeNull();
    expect(host.innerHTML).not.toMatch(MARKUP);
    expect(host.textContent).not.toMatch(COPY);
  });
});
