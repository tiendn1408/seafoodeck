import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ComponentType } from 'react';
import { button, click, mount, unmountAll } from '../learner/testDom';

// Each test gets fresh modules, so no screen is already loaded from an earlier test and every
// loader call is counted.
type Chunks = typeof import('./roleChunks').roleChunks;
let PilotApp: ComponentType;
let loads: Record<keyof Chunks, ReturnType<typeof vi.fn>>;
let chunks: Chunks;
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const view = (role: string) => ({
  role,
  internal: false,
  csrf: 'c-' + role,
  expiresAt: 'x',
  userId: role === 'guest' ? undefined : 'u-' + role,
});
let me: object;
/** Fresh modules: no screen loaded yet, every loader spied on. */
async function freshApp() {
  vi.resetModules();
  ({ default: PilotApp } = await import('./PilotApp'));
  ({ roleChunks: chunks } = await import('./roleChunks'));
  loads = {} as typeof loads;
  for (const name of Object.keys(chunks) as (keyof Chunks)[])
    loads[name] = vi.spyOn(chunks, name) as unknown as ReturnType<typeof vi.fn>;
}
beforeEach(async () => {
  await freshApp();
  me = view('guest');
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      if (key === 'GET /auth/me') return json(me);
      if (key.startsWith('GET /manager/learners?') || key.startsWith('GET /admin/users?'))
        return json({ items: [], total: 0, page: 1, limit: 20 });
      if (key === 'GET /manager/learners/a1')
        return json({ id: 'a1', username: 'lan', displayName: 'Lan Nguyễn', disabled: false });
      return json({ message: 'unrouted ' + key }, 404);
    }),
  );
});
afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
const called = () =>
  (Object.keys(loads) as (keyof Chunks)[]).filter((n) => loads[n].mock.calls.length > 0);
async function open(role: string, hash: string) {
  me = view(role);
  location.hash = hash;
  const host = mount(<PilotApp />);
  await tick();
  await tick();
  return host;
}

describe('PilotApp role-gated chunks', () => {
  it('a guest on an admin or manager route gets the sign-in and loads no staff chunk', async () => {
    for (const [hash, login] of [
      ['#admin', 'Đăng nhập quản trị'],
      ['#admin/users', 'Đăng nhập quản trị'],
      ['#manager', 'Học thử bằng mã mời'],
      ['#manager/learner/a1', 'Học thử bằng mã mời'],
    ]) {
      const host = await open('guest', hash);
      expect(host.textContent, hash).toContain(login);
      expect(called(), hash).toEqual([]);
      unmountAll();
    }
  });

  it('learner, trial and student screens never load a staff chunk', async () => {
    const cases: [string, string][] = [
      ['student', '#home'],
      ['student', '#library'],
      ['student', '#admin'],
      ['student', '#admin/users'],
      ['student', '#manager'],
      ['student', '#manager/learner/a1'],
      ['learner', '#home'],
      ['learner', '#admin'],
      ['learner', '#manager'],
    ];
    for (const [role, hash] of cases) {
      await open(role, hash);
      expect(called(), `${role} ${hash}`).toEqual([]);
      unmountAll();
    }
  });

  it('a kind only loads the chunks of the routes it may open', async () => {
    const cases: [string, string, (keyof Chunks)[]][] = [
      ['editor', '#admin', ['admin']],
      ['editor', '#admin/users', []], // back to home
      ['editor', '#manager', []],
      ['manager', '#admin', ['learners']], // a manager lands on the learner table
      ['manager', '#admin/users', ['learners']],
      ['manager', '#manager', ['learners']],
      ['manager', '#manager/learner/a1', ['learner']],
      ['admin', '#admin', ['admin']],
      ['admin', '#admin/users', ['users']],
      ['admin', '#manager', ['learners']],
    ];
    for (const [role, hash, expected] of cases) {
      await freshApp();
      const host = await open(role, hash);
      expect(called(), `${role} ${hash}`).toEqual(expected);
      expect(host.textContent, `${role} ${hash}`).not.toContain('Không tải được trang này');
      expect(host.querySelector('[role="status"]')?.textContent).not.toBe('Đang tải…');
      unmountAll();
    }
  });

  it('the loaded screens render: admin users, manager table and learner detail', async () => {
    let host = await open('admin', '#admin/users');
    expect(host.querySelector('h1')?.textContent).toBe('Người dùng');
    unmountAll();
    host = await open('manager', '#manager');
    expect(host.querySelector('h1')?.textContent).toBe('Học viên');
    unmountAll();
    host = await open('manager', '#manager/learner/a1');
    expect(host.querySelector('h1')?.textContent).toBe('Học viên: Lan Nguyễn');
  });

  it('a chunk that fails to load shows the error note; Thử lại loads the screen', async () => {
    loads.admin.mockImplementationOnce(() =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    );
    const host = await open('editor', '#admin');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Không tải được trang này.',
    );
    expect(host.textContent).not.toContain('Biên tập và xuất bản');
    await click(button(host, 'Thử lại'));
    await tick();
    await tick();
    expect(loads.admin).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Biên tập và xuất bản');
  });
});
