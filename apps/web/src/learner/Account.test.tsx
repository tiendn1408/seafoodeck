import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Account } from './Account';
import { TrialNudge } from './TrialNudge';
import { ManagerNotice } from './ManagerNotice';
import { clearMe } from './meStore';
import PilotApp from '../pilot/PilotApp';
import { setAuthRequiredHandler } from '../pilot/api';
import { button, click, field, mount, setValue, submit, unmountAll } from './testDom';

vi.mock('./meStore', async (original) => {
  const actual = await original<typeof import('./meStore')>();
  return { ...actual, clearMe: vi.fn(actual.clearMe) };
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
let routes: Record<string, (init?: RequestInit) => Promise<Response>>;
let calls: { key: string; body?: string }[];
beforeEach(() => {
  clearMe();
  vi.mocked(clearMe).mockClear();
  setAuthRequiredHandler(null);
  location.hash = '#account';
  calls = [];
  routes = {
    'GET /me': () =>
      json({
        username: 'lan.nguyen',
        displayName: 'Lan',
        role: 'student',
        mustChangePassword: false,
      }),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push({ key, body: init?.body as string | undefined });
      const r = routes[key];
      return r ? r(init) : json({ message: 'unrouted ' + key }, 404);
    }),
  );
});
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
const patches = () => calls.filter((c) => c.key === 'PATCH /me');

async function account(props: Partial<Parameters<typeof Account>[0]> = {}) {
  const host = mount(<Account userId="u1" onLogout={() => {}} onSaved={() => {}} {...props} />);
  await tick();
  return host;
}

describe('Account', () => {
  it('shows the username read-only and the display name for editing', async () => {
    const host = await account();
    expect(host.textContent).toContain('lan.nguyen');
    expect(host.querySelectorAll('input:not([readonly])')).toHaveLength(1);
    expect(field(host, 'Tên hiển thị').value).toBe('Lan');
    expect(field(host, 'Tên hiển thị').maxLength).toBe(80);
  });

  it('saving sends PATCH /me with the trimmed name and confirms', async () => {
    routes['PATCH /me'] = () =>
      json({ username: 'lan.nguyen', displayName: 'Lan Anh', role: 'student' });
    const onSaved = vi.fn();
    const host = await account({ onSaved });
    setValue(field(host, 'Tên hiển thị'), '  Lan Anh  ');
    await submit(host);
    expect(patches()).toHaveLength(1);
    expect(JSON.parse(patches()[0].body!)).toEqual({ displayName: 'Lan Anh' });
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Đã lưu');
    expect(onSaved).toHaveBeenCalledWith('Lan Anh');
  });

  it('a cleared name is sent as null', async () => {
    routes['PATCH /me'] = () => json({ username: 'lan.nguyen', displayName: null });
    const onSaved = vi.fn();
    const host = await account({ onSaved });
    setValue(field(host, 'Tên hiển thị'), '   ');
    await submit(host);
    expect(JSON.parse(patches()[0].body!)).toEqual({ displayName: null });
    expect(onSaved).toHaveBeenCalledWith(null);
  });

  it('blocks names longer than 80 characters without calling the API', async () => {
    const host = await account();
    setValue(field(host, 'Tên hiển thị'), 'a'.repeat(81));
    await submit(host);
    expect(patches()).toHaveLength(0);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('80');
  });

  it('never says that managers can see the learner’s progress', async () => {
    const host = await account();
    expect(host.textContent).not.toMatch(/quản lý|manager/i);
  });

  it('opens the optional password change; cancel closes, success confirms', async () => {
    routes['POST /me/password'] = () => json({ ok: true });
    const host = await account();
    await click(button(host, 'Đổi mật khẩu'));
    expect(host.textContent).toContain('Mật khẩu hiện tại');
    expect(host.textContent).not.toContain('Quản trị viên yêu cầu');
    await click(button(host, 'Hủy'));
    expect(host.textContent).not.toContain('Mật khẩu hiện tại');
    await click(button(host, 'Đổi mật khẩu'));
    setValue(field(host, 'Mật khẩu hiện tại'), 'dummy-old-pass');
    setValue(field(host, 'Mật khẩu mới'), 'dummy-new-pass1');
    setValue(field(host, 'Nhập lại mật khẩu mới'), 'dummy-new-pass1');
    await submit(host);
    expect(host.textContent).not.toContain('Mật khẩu hiện tại');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Đã đổi mật khẩu');
  });

  it('Đăng xuất calls onLogout', async () => {
    const onLogout = vi.fn();
    const host = await account({ onLogout });
    await click(button(host, 'Đăng xuất'));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('in the app, logging out from the account page clears the /me cache first', async () => {
    let auth = { role: 'student', internal: false, csrf: 'c', expiresAt: 'x', userId: 'u1' };
    routes['GET /auth/me'] = () => json(auth);
    routes['POST /auth/logout'] = () => {
      auth = { ...auth, role: 'guest', userId: undefined as unknown as string };
      return json(auth);
    };
    const host = mount(<PilotApp />);
    await tick();
    expect(host.textContent).toContain('lan.nguyen');
    vi.mocked(clearMe).mockClear();
    await click(button(host.querySelector('.account')!, 'Đăng xuất'));
    await tick();
    expect(clearMe).toHaveBeenCalled();
    expect(host.textContent).toContain('Học thử bằng mã mời');
  });
});

describe('TrialNudge', () => {
  it('invites the trial learner to sign in and calls onSignIn', async () => {
    const onSignIn = vi.fn();
    const host = mount(<TrialNudge onSignIn={onSignIn} />);
    expect(host.textContent).toContain('Đăng nhập để lưu tiến độ');
    await click(button(host, 'Đăng nhập'));
    expect(onSignIn).toHaveBeenCalledOnce();
  });
});

describe('ManagerNotice', () => {
  it('says the manager page comes later and points to the library', () => {
    const host = mount(<ManagerNotice />);
    expect(host.textContent).toContain('Trang quản lý sẽ có ở bản sau. Bạn có thể xem Thư viện.');
    expect(host.querySelector('a[href="#library"]')).not.toBeNull();
  });
});
