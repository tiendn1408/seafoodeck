import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import PilotApp from './PilotApp';
import { setAuthRequiredHandler } from './api';
import { clearMe } from '../learner/meStore';
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
const MUST = { message: 'Cần đổi mật khẩu trước.', code: 'MUST_CHANGE_PASSWORD' };
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
  localStorage.clear();
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

  it('a MUST_CHANGE_PASSWORD 403 flips to forced; no restore fetch while forced', async () => {
    location.hash = '#study';
    localStorage.setItem(
      'seafood-deck:pilot:v1',
      JSON.stringify({ sessionId: 's1', attempts: [], reviews: {} }),
    );
    routes['GET /auth/me'] = () => json(view('student'));
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

  it('forced user on #study with a stored session never requests /learning/', async () => {
    location.hash = '#study';
    localStorage.setItem(
      'seafood-deck:pilot:v1',
      JSON.stringify({ sessionId: 's1', attempts: [], reviews: {} }),
    );
    routes['GET /auth/me'] = () => json(view('student', { mustChangePassword: true }));
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
    routes['POST /auth/login'] = () => json(view('student'));
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
    routes['POST /auth/login'] = () => json(view('student'));
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
  it('trial and manager never request /me/* on any allowed route', async () => {
    const allowed: Record<string, string[]> = {
      learner: ['#home', '#library', '#study', '#profile/x'],
      manager: ['#home', '#library', '#profile/x'],
    };
    for (const role of ['learner', 'manager']) {
      routes['GET /auth/me'] = () => json(view(role));
      for (const hash of allowed[role]) {
        location.hash = hash;
        mount(<PilotApp />);
        await tick();
        await tick();
        unmountAll();
      }
    }
    // Every request was recorded with the /api/v1 prefix stripped.
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.split(' ')[1].startsWith('/me/'))).toEqual([]);
  });

  it('routes not allowed for the kind go back to home', async () => {
    const cases: [string, string][] = [
      ['learner', '#review'],
      ['learner', '#progress'],
      ['learner', '#account'],
      ['manager', '#review'],
      ['manager', '#study'],
      ['student', '#admin'],
      ['admin', '#account'],
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
