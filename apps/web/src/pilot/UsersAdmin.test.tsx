import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { UsersAdmin, generatePassword, PASSWORD_ALPHABET } from './UsersAdmin';
import { button, click, field, mount, setValue, submit, unmountAll } from '../learner/testDom';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const row = (id: string, username: string, extra: object = {}) => ({
  id,
  username,
  displayName: null,
  role: 'student',
  disabled: false,
  mustChangePassword: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  lastLoginAt: null,
  ...extra,
});
const rows = [
  row('me', 'root', { role: 'admin', displayName: 'Quản trị gốc' }),
  row('u2', 'lan', {
    displayName: 'Lan Nguyễn',
    mustChangePassword: true,
    lastLoginAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  }),
  row('u3', 'binh', { role: 'manager', disabled: true }),
];
const page = (items = rows, total = items.length) => json({ items, total, page: 1, limit: 20 });

let routes: Record<string, (init?: RequestInit) => Promise<Response>>;
let calls: { key: string; body?: string }[];
beforeEach(() => {
  location.hash = '#admin/users';
  calls = [];
  routes = {};
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push({ key, body: init?.body as string | undefined });
      const r = routes[key] ?? (key.startsWith('GET /admin/users?') ? () => page() : undefined);
      return r ? r(init) : json({ message: 'unrouted ' + key }, 404);
    }),
  );
});
afterEach(() => {
  unmountAll();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
const tick = (ms = 10) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const lists = () => calls.filter((c) => c.key.startsWith('GET /admin/users')).map((c) => c.key);
const writes = () => calls.filter((c) => !c.key.startsWith('GET '));
const rowOf = (host: HTMLElement, id: string) =>
  host.querySelector<HTMLElement>(`[data-user="${id}"]`)!;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
function select(scope: HTMLElement, label: string, value: string) {
  const l = [...scope.querySelectorAll('label')].find((x) => x.textContent?.startsWith(label));
  const s = l!.querySelector('select')!;
  act(() => {
    s.value = value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function screen(selfId = 'me') {
  const host = mount(<UsersAdmin selfId={selfId} />);
  await tick();
  return host;
}

describe('UsersAdmin list', () => {
  it('asks for page 1 and shows each row with text badges', async () => {
    const host = await screen();
    expect(lists()).toEqual(['GET /admin/users?page=1&limit=20']);
    const lan = rowOf(host, 'u2');
    expect(lan.textContent).toContain('lan');
    expect(lan.textContent).toContain('Lan Nguyễn');
    expect(lan.textContent).toContain('Học viên');
    expect(lan.textContent).toContain('Hoạt động');
    expect(lan.textContent).toContain('Phải đổi mật khẩu');
    expect(lan.textContent).toContain('5 phút trước');
    expect(lan.querySelector('time')?.getAttribute('title')).toMatch(/\d{2}:\d{2}/);
    const binh = rowOf(host, 'u3');
    expect(binh.textContent).toContain('Quản lý');
    expect(binh.textContent).toContain('Đã khóa');
    expect(binh.textContent).toContain('Chưa đăng nhập');
    expect(binh.textContent).not.toContain('Phải đổi mật khẩu');
    expect(rowOf(host, 'me').textContent).toContain('Quản trị');
    // Actions sit in a wrapper, so the cell itself keeps table-cell layout.
    expect(lan.querySelector('td > div.users-actions')?.querySelectorAll('button')).toHaveLength(3);
  });

  it('student rows link to the learner progress screen; other roles do not', async () => {
    const host = await screen();
    const link = rowOf(host, 'u2').querySelector('a');
    expect(link?.getAttribute('href')).toBe('#manager/learner/u2');
    expect(link?.textContent).toContain('Xem tiến độ');
    expect(rowOf(host, 'u3').querySelector('a')).toBeNull();
    expect(rowOf(host, 'me').querySelector('a')).toBeNull();
  });

  it('every action sits in its own named slot, so rows line up whatever is missing', async () => {
    const host = await screen();
    const slots = (id: string) =>
      [...rowOf(host, id).querySelectorAll('.users-actions > *')].map((el) => el.className);
    expect(slots('u2')).toEqual([
      'users-secondary users-act-view',
      'users-secondary users-act-lock',
      'users-secondary users-act-reset',
      'users-secondary users-act-delete',
    ]);
    // A locked manager: no "Xem tiến độ", "Mở khóa" in the lock slot.
    expect(slots('u3')).toEqual([
      'users-secondary users-act-lock',
      'users-secondary users-act-reset',
      'users-secondary users-act-delete',
    ]);
  });

  it('ignores a slower, older list response that arrives after a newer one', async () => {
    let releaseOld: () => void = () => {};
    routes['GET /admin/users?role=manager&page=1&limit=20'] = () =>
      new Promise<Response>((r) => {
        releaseOld = () =>
          void r(new Response(JSON.stringify({ items: [rows[2]], total: 1, page: 1, limit: 20 })));
      });
    routes['GET /admin/users?role=editor&page=1&limit=20'] = () =>
      page([row('e1', 'editor_an', { role: 'editor' })], 1);
    const host = await screen();
    select(host, 'Vai trò', 'manager');
    await tick();
    select(host, 'Vai trò', 'editor');
    await tick();
    expect(host.textContent).toContain('editor_an');
    await act(async () => releaseOld());
    await tick();
    expect(host.textContent).toContain('editor_an');
    expect(rowOf(host, 'u3')).toBeNull();
  });

  it('a 401 (locked or signed-out admin) shows the message with a retry', async () => {
    routes['GET /admin/users?page=1&limit=20'] = () => json({ message: 'Cần đăng nhập lại.' }, 401);
    const host = await screen();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Cần đăng nhập lại.');
    expect(button(host, 'Thử lại')).toBeTruthy();
  });

  it('sends role, status, a trimmed debounced search and the page', async () => {
    const host = await screen();
    select(host, 'Vai trò', 'manager');
    await tick();
    select(host, 'Trạng thái', 'disabled');
    await tick();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      setValue(field(host, 'Tìm'), '  la');
      act(() => void vi.advanceTimersByTime(200));
      setValue(field(host, 'Tìm'), '  lan ');
      act(() => void vi.advanceTimersByTime(299));
      expect(lists()).toEqual([
        'GET /admin/users?page=1&limit=20',
        'GET /admin/users?role=manager&page=1&limit=20',
        'GET /admin/users?role=manager&status=disabled&page=1&limit=20',
      ]);
      act(() => void vi.advanceTimersByTime(1));
    } finally {
      vi.useRealTimers();
    }
    await tick();
    expect(lists().at(-1)).toBe(
      'GET /admin/users?role=manager&status=disabled&q=lan&page=1&limit=20',
    );
    expect(lists()).toHaveLength(4);
    select(host, 'Vai trò', '');
    await tick();
    expect(lists().at(-1)).toBe('GET /admin/users?status=disabled&q=lan&page=1&limit=20');
  });

  it('pages through the total', async () => {
    routes['GET /admin/users?page=1&limit=20'] = () => page(rows, 45);
    routes['GET /admin/users?page=2&limit=20'] = () =>
      json({ items: rows, total: 45, page: 2, limit: 20 });
    const host = await screen();
    expect(host.textContent).toContain('45 người dùng');
    expect(host.textContent).toContain('Trang 1/3');
    expect(button(host, 'Trang trước').disabled).toBe(true);
    await click(button(host, 'Trang sau'));
    await tick();
    expect(lists().at(-1)).toBe('GET /admin/users?page=2&limit=20');
    expect(host.textContent).toContain('Trang 2/3');
  });

  it('shows an empty state and a retryable load error', async () => {
    routes['GET /admin/users?page=1&limit=20'] = () => json({ message: 'Lỗi máy chủ.' }, 500);
    const host = await screen();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Lỗi máy chủ.');
    routes['GET /admin/users?page=1&limit=20'] = () => page([], 0);
    await click(button(host, 'Thử lại'));
    await tick();
    expect(host.textContent).toContain('Không có người dùng nào khớp bộ lọc.');
  });
});

describe('UsersAdmin create', () => {
  it('sends the typed account and refreshes the list', async () => {
    routes['POST /admin/users'] = () => json({ id: 'u9' });
    const host = await screen();
    await click(button(host, 'Tạo người dùng'));
    const d = dialog()!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    const user = field(d, 'Tên đăng nhập');
    expect(user.getAttribute('autocapitalize')).toBe('none');
    expect(user.getAttribute('autocorrect')).toBe('off');
    expect(user.getAttribute('spellcheck')).toBe('false');
    expect(d.textContent).toContain('Ít nhất 8 ký tự');
    setValue(user, ' lan_01 ');
    setValue(field(d, 'Tên hiển thị'), ' Lan ');
    setValue(field(d, 'Mật khẩu'), 'abcdefgh');
    await submit(d);
    await tick();
    const post = writes();
    expect(post.map((c) => c.key)).toEqual(['POST /admin/users']);
    expect(JSON.parse(post[0].body!)).toEqual({
      role: 'student',
      username: 'lan_01',
      displayName: 'Lan',
      password: 'abcdefgh',
      mustChangePassword: true,
    });
    expect(dialog()).toBeNull();
    expect(lists()).toHaveLength(2);
    expect(host.querySelector('.users-reveal')).toBeNull();
  });

  it('checks the username and the role-dependent length before sending', async () => {
    const host = await screen();
    await click(button(host, 'Tạo người dùng'));
    const d = dialog()!;
    select(d, 'Vai trò', 'editor');
    expect(d.textContent).toContain('Ít nhất 16 ký tự');
    setValue(field(d, 'Tên đăng nhập'), 'a b');
    setValue(field(d, 'Mật khẩu'), 'abcdefgh');
    await submit(d);
    expect(writes()).toEqual([]);
    expect(d.textContent).toContain('3–50 ký tự');
    expect(d.textContent).toContain('Mật khẩu cần ít nhất 16 ký tự.');
    expect(field(d, 'Mật khẩu').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows a 409 from the server inside the dialog', async () => {
    routes['POST /admin/users'] = () => json({ message: 'Tên đăng nhập đã tồn tại.' }, 409);
    const host = await screen();
    await click(button(host, 'Tạo người dùng'));
    const d = dialog()!;
    setValue(field(d, 'Tên đăng nhập'), 'lan');
    setValue(field(d, 'Mật khẩu'), 'abcdefgh');
    await submit(d);
    await tick();
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain(
      'Tên đăng nhập đã tồn tại.',
    );
  });

  it('auto-generates a strong password, sends it and shows it once', async () => {
    routes['POST /admin/users'] = () => json({ id: 'u9' });
    const host = await screen();
    await click(button(host, 'Tạo người dùng'));
    const d = dialog()!;
    select(d, 'Vai trò', 'manager');
    setValue(field(d, 'Tên đăng nhập'), 'quanly');
    await click(button(d, 'Tạo tự động'));
    expect(d.querySelector('input[type="password"]')).toBeNull();
    await submit(d);
    await tick();
    const body = JSON.parse(writes()[0].body!);
    expect(body.password).toHaveLength(20);
    expect(body.password).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]+$/);
    expect(body.mustChangePassword).toBe(true);
    const reveal = host.querySelector<HTMLElement>('.users-reveal')!;
    expect(reveal.textContent).toContain(body.password);
    expect(reveal.textContent).toContain('quanly');
    expect(host.textContent!.split(body.password)).toHaveLength(2);
    await click(button(reveal, 'Đóng'));
    expect(host.textContent).not.toContain(body.password);
  });

  it('generatePassword follows the server rules', () => {
    expect(PASSWORD_ALPHABET).not.toMatch(/[0Oo1lI]/);
    for (let i = 0; i < 50; i++) {
      const s = generatePassword('student');
      expect(s).toHaveLength(12);
      expect([...s].every((c) => PASSWORD_ALPHABET.includes(c))).toBe(true);
      expect(generatePassword('publisher')).toHaveLength(20);
    }
    expect(generatePassword('student')).not.toBe(generatePassword('student'));
  });
});

describe('UsersAdmin row actions', () => {
  it('locks after confirming, and unlocks straight away', async () => {
    routes['PATCH /admin/users/u2'] = () => json(rows[1]);
    routes['PATCH /admin/users/u3'] = () => json(rows[2]);
    const host = await screen();
    await click(button(rowOf(host, 'u2'), 'Khóa'));
    expect(dialog()?.textContent).toContain('Khóa sẽ đăng xuất người này ngay.');
    await click(button(dialog()!, 'Khóa tài khoản'));
    await tick();
    expect(writes()).toEqual([
      { key: 'PATCH /admin/users/u2', body: JSON.stringify({ disabled: true }) },
    ]);
    expect(dialog()).toBeNull();
    await click(button(rowOf(host, 'u3'), 'Mở khóa'));
    await tick();
    expect(writes()[1]).toEqual({
      key: 'PATCH /admin/users/u3',
      body: JSON.stringify({ disabled: false }),
    });
    expect(host.querySelector('[aria-live]')?.textContent).toContain('Đã mở khóa binh.');
  });

  it('Escape closes a dialog and returns focus to the button that opened it', async () => {
    const host = await screen();
    const opener = button(rowOf(host, 'u2'), 'Khóa');
    opener.focus();
    await click(opener);
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    act(() => {
      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(writes()).toEqual([]);
  });

  it('shows a server 400 next to the action', async () => {
    routes['PATCH /admin/users/u2'] = () =>
      json({ message: 'Không thể khóa quản trị viên cuối cùng.' }, 400);
    const host = await screen();
    await click(button(rowOf(host, 'u2'), 'Khóa'));
    await click(button(dialog()!, 'Khóa tài khoản'));
    await tick();
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain(
      'Không thể khóa quản trị viên cuối cùng.',
    );
  });

  it('reset shows the temporary password once, copies it, and forgets it when closed', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const log = vi.spyOn(console, 'log');
    routes['POST /admin/users/u2/reset-password'] = () =>
      json({ temporaryPassword: 'Tmp7xKq9Rz2a' });
    const host = await screen();
    expect(host.textContent).not.toContain('Tmp7xKq9Rz2a');
    await click(button(rowOf(host, 'u2'), 'Đặt lại mật khẩu'));
    expect(writes()).toEqual([]);
    await click(button(dialog()!, 'Đặt lại'));
    await tick();
    expect(writes().map((c) => c.key)).toEqual(['POST /admin/users/u2/reset-password']);
    const reveal = host.querySelector<HTMLElement>('.users-reveal')!;
    expect(reveal.textContent).toContain('Tmp7xKq9Rz2a');
    expect(reveal.textContent).toContain(
      'Mật khẩu chỉ hiện lúc này. Đưa cho người dùng và yêu cầu họ đổi ngay.',
    );
    await click(button(reveal, 'Sao chép'));
    expect(writeText).toHaveBeenCalledWith('Tmp7xKq9Rz2a');
    expect(reveal.textContent).toContain('Đã sao chép.');
    await click(button(reveal, 'Đóng'));
    expect(host.textContent).not.toContain('Tmp7xKq9Rz2a');
    expect(host.querySelector('.users-reveal')).toBeNull();
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('Tmp7xKq9');
    expect(location.href).not.toContain('Tmp7xKq9');
    expect(JSON.stringify(log.mock.calls)).not.toContain('Tmp7xKq9');
  });

  it('copy falls back to selecting the password when the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    routes['POST /admin/users/u2/reset-password'] = () =>
      json({ temporaryPassword: 'Tmp7xKq9Rz2a' });
    const host = await screen();
    await click(button(rowOf(host, 'u2'), 'Đặt lại mật khẩu'));
    await click(button(dialog()!, 'Đặt lại'));
    await tick();
    await click(button(host.querySelector<HTMLElement>('.users-reveal')!, 'Sao chép'));
    expect(String(window.getSelection())).toBe('Tmp7xKq9Rz2a');
  });

  it('delete stays disabled until the exact username is typed, then sends it', async () => {
    routes['DELETE /admin/users/u2'] = () => json({ deleted: true });
    const host = await screen();
    await click(button(rowOf(host, 'u2'), 'Xóa'));
    const d = dialog()!;
    expect(d.textContent).toContain(
      'Khóa thường tốt hơn xóa; xóa sẽ mất tiến độ học của người này.',
    );
    const go = button(d, 'Xóa vĩnh viễn');
    expect(go.disabled).toBe(true);
    setValue(field(d, 'Gõ lại tên đăng nhập'), 'la');
    expect(go.disabled).toBe(true);
    setValue(field(d, 'Gõ lại tên đăng nhập'), 'LAN');
    expect(go.disabled).toBe(false);
    await click(go);
    await tick();
    expect(writes()).toEqual([
      { key: 'DELETE /admin/users/u2', body: JSON.stringify({ confirmUsername: 'LAN' }) },
    ]);
    expect(dialog()).toBeNull();
    expect(lists()).toHaveLength(2);
  });

  it('unlock ignores a second click while the first is in flight', async () => {
    let release: () => void = () => {};
    routes['PATCH /admin/users/u3'] = () =>
      new Promise<Response>((r) => {
        release = () => void r(new Response(JSON.stringify(rows[2])));
      });
    const host = await screen();
    const b = button(rowOf(host, 'u3'), 'Mở khóa');
    await click(b);
    await click(b);
    expect(writes()).toHaveLength(1);
    await act(async () => release());
    await tick();
  });

  it('after a delete, focus moves to the page heading instead of falling to the body', async () => {
    routes['DELETE /admin/users/u2'] = () => json({ deleted: true });
    const host = await screen();
    const opener = button(rowOf(host, 'u2'), 'Xóa');
    opener.focus();
    await click(opener);
    setValue(field(dialog()!, 'Gõ lại tên đăng nhập'), 'lan');
    routes['GET /admin/users?page=1&limit=20'] = () => page([rows[0], rows[2]]);
    await click(button(dialog()!, 'Xóa vĩnh viễn'));
    await tick();
    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('removing the last row of the last page steps back to the new last page', async () => {
    routes['GET /admin/users?page=1&limit=20'] = () => page(rows, 21);
    routes['GET /admin/users?page=2&limit=20'] = () =>
      json({ items: [rows[1]], total: 21, page: 2, limit: 20 });
    routes['DELETE /admin/users/u2'] = () => json({ deleted: true });
    const host = await screen();
    await click(button(host, 'Trang sau'));
    await tick();
    routes['GET /admin/users?page=2&limit=20'] = () =>
      json({ items: [], total: 20, page: 2, limit: 20 });
    routes['GET /admin/users?page=1&limit=20'] = () => page(rows, 20);
    await click(button(rowOf(host, 'u2'), 'Xóa'));
    setValue(field(dialog()!, 'Gõ lại tên đăng nhập'), 'lan');
    await click(button(dialog()!, 'Xóa vĩnh viễn'));
    await tick();
    await tick();
    expect(lists().slice(-2)).toEqual([
      'GET /admin/users?page=2&limit=20',
      'GET /admin/users?page=1&limit=20',
    ]);
    expect(host.textContent).toContain('Trang 1/1');
    expect(host.textContent).not.toContain('Không có người dùng nào khớp bộ lọc.');
  });

  it('locking the last active row of a later page under "Đang hoạt động" steps back too', async () => {
    routes['GET /admin/users?status=active&page=1&limit=20'] = () => page(rows.slice(0, 2), 21);
    routes['GET /admin/users?status=active&page=2&limit=20'] = () =>
      json({ items: [rows[1]], total: 21, page: 2, limit: 20 });
    routes['PATCH /admin/users/u2'] = () => json(rows[1]);
    const host = await screen();
    select(host, 'Trạng thái', 'active');
    await tick();
    await click(button(host, 'Trang sau'));
    await tick();
    routes['GET /admin/users?status=active&page=2&limit=20'] = () =>
      json({ items: [], total: 20, page: 2, limit: 20 });
    routes['GET /admin/users?status=active&page=1&limit=20'] = () => page(rows.slice(0, 2), 20);
    await click(button(rowOf(host, 'u2'), 'Khóa'));
    await click(button(dialog()!, 'Khóa tài khoản'));
    await tick();
    await tick();
    expect(lists().at(-1)).toBe('GET /admin/users?status=active&page=1&limit=20');
    expect(host.textContent).toContain('Trang 1/1');
  });

  it('self reset: only the reset call, every mutation and the list stay paused until close', async () => {
    // 21 users, so "Trang sau" would be enabled if the list were not paused.
    routes['GET /admin/users?page=1&limit=20'] = () => page(rows, 21);
    routes['POST /admin/users/me/reset-password'] = () =>
      json({ temporaryPassword: 'SelfTmp7xKq9Rz2aBcDe' });
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const host = await screen('me');
    expect(button(host, 'Trang sau').disabled).toBe(false);
    const before = calls.length;
    await click(button(rowOf(host, 'me'), 'Đặt lại mật khẩu'));
    await click(button(dialog()!, 'Đặt lại'));
    await tick();
    expect(calls.slice(before).map((c) => c.key)).toEqual(['POST /admin/users/me/reset-password']);
    const reveal = host.querySelector<HTMLElement>('.users-reveal')!;
    expect(reveal.textContent).toContain('SelfTmp7xKq9Rz2aBcDe');
    expect(reveal.textContent).toContain(
      'Khi đóng khung này bạn sẽ phải đổi mật khẩu; dùng mật khẩu tạm này ở ô "Mật khẩu hiện tại".',
    );
    expect(reveal.textContent).toContain('Đừng rời trang này trước khi ghi lại mật khẩu.');
    // Leaving the page asks first; the admin tabs are off.
    const unload = added.mock.calls.find(([t]) => t === 'beforeunload')?.[1];
    expect(unload).toBeTypeOf('function');
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // Disabled tabs are inert spans, not anchors without an href.
    expect(host.querySelectorAll('nav[aria-label="Khu quản trị"] a[aria-disabled]')).toHaveLength(
      0,
    );
    const tabs = host.querySelectorAll('nav[aria-label="Khu quản trị"] > *');
    expect(tabs).toHaveLength(3);
    for (const a of tabs) {
      expect(a.tagName, a.textContent!).toBe('SPAN');
      expect(a.getAttribute('aria-disabled'), a.textContent!).toBe('true');
    }
    // Typing, filtering and paging are off.
    const search = field(host, 'Tìm');
    expect(search.disabled).toBe(true);
    setValue(search, 'abc');
    await tick(350);
    for (const s of host.querySelectorAll<HTMLSelectElement>('.users-filters select'))
      expect(s.disabled).toBe(true);
    expect(button(host, 'Trang sau').disabled).toBe(true);
    expect(button(host, 'Trang trước').disabled).toBe(true);
    // Every mutation is off too, on every row (each would hit MUST_CHANGE_PASSWORD).
    const mutations = [
      button(host, 'Tạo người dùng'),
      button(host, 'Tạo hàng loạt'),
      ...host.querySelectorAll<HTMLButtonElement>('.users-actions button'),
    ];
    expect(mutations.length).toBe(2 + 3 * rows.length);
    for (const b of mutations) {
      expect(b.disabled, b.textContent!).toBe(true);
      await click(b);
    }
    expect(button(rowOf(host, 'u2'), 'Khóa').title).toBe('Đóng khung mật khẩu tạm trước.');
    expect(dialog()).toBeNull();
    expect(calls.slice(before).map((c) => c.key)).toEqual(['POST /admin/users/me/reset-password']);
    expect(host.textContent).toContain('SelfTmp7xKq9Rz2aBcDe');
    await click(button(reveal, 'Đóng'));
    await tick(350);
    expect(host.textContent).not.toContain('SelfTmp7xKq9Rz2aBcDe');
    // Only the plain refresh: the value typed while disabled never became a search.
    expect(calls.slice(before).map((c) => c.key)).toEqual([
      'POST /admin/users/me/reset-password',
      'GET /admin/users?page=1&limit=20',
    ]);
    expect(removed.mock.calls.some(([t, f]) => t === 'beforeunload' && f === unload)).toBe(true);
    expect(host.querySelector('nav[aria-label="Khu quản trị"] [aria-disabled]')).toBeNull();
    expect(host.querySelectorAll('nav[aria-label="Khu quản trị"] a')).toHaveLength(3);
  });

  it('the reset confirm waits while the list is loading', async () => {
    let release: () => void = () => {};
    const host = await screen();
    routes['GET /admin/users?role=manager&page=1&limit=20'] = () =>
      new Promise<Response>((r) => {
        release = () =>
          void r(new Response(JSON.stringify({ items: rows, total: 3, page: 1, limit: 20 })));
      });
    select(host, 'Vai trò', 'manager');
    await tick();
    await click(button(rowOf(host, 'me'), 'Đặt lại mật khẩu'));
    expect(button(dialog()!, 'Đặt lại').disabled).toBe(true);
    await act(async () => release());
    await tick();
    expect(button(dialog()!, 'Đặt lại').disabled).toBe(false);
  });

  it('clamps when the server sends an empty later page whose page equals the computed last', async () => {
    routes['GET /admin/users?page=1&limit=20'] = () => page(rows, 21);
    routes['GET /admin/users?page=2&limit=20'] = () =>
      json({ items: [], total: 21, page: 2, limit: 20 });
    const host = await screen();
    await click(button(host, 'Trang sau'));
    await tick();
    await tick();
    // Page 2 of 2 is the last page; an empty answer must not leave the list loading forever.
    expect(host.textContent).not.toContain('Đang tải');
    expect(host.textContent).toContain('Trang 2/2');
  });

  it('clamps to page 1 when everything went away (total 0 on a later page)', async () => {
    routes['GET /admin/users?page=1&limit=20'] = () => page(rows, 21);
    routes['GET /admin/users?page=2&limit=20'] = () =>
      json({ items: [], total: 0, page: 2, limit: 20 });
    const host = await screen();
    routes['GET /admin/users?page=1&limit=20'] = () => page([], 0);
    await click(button(host, 'Trang sau'));
    await tick();
    await tick();
    expect(lists().at(-1)).toBe('GET /admin/users?page=1&limit=20');
    expect(host.textContent).toContain('Trang 1/1');
    expect(host.textContent).not.toContain('Trang 2/1');
  });

  it("disables the acting admin's own Khóa and Xóa, with a reason", async () => {
    const host = await screen('me');
    for (const label of ['Khóa', 'Xóa']) {
      const b = button(rowOf(host, 'me'), label);
      expect(b.disabled, label).toBe(true);
      expect(b.title).toContain('tài khoản bạn đang dùng');
    }
    expect(button(rowOf(host, 'me'), 'Đặt lại mật khẩu').disabled).toBe(false);
    expect(button(rowOf(host, 'u2'), 'Khóa').disabled).toBe(false);
  });
});

describe('bulk entry point', () => {
  it('opens the bulk dialog and is disabled while the own secret is shown', async () => {
    const host = await screen();
    await click(button(host, 'Tạo hàng loạt'));
    expect(dialog()?.textContent).toContain('Dán hoặc chọn file CSV');
    await click(button(dialog()!, 'Hủy'));
    expect(dialog()).toBeNull();
    routes['POST /admin/users/me/reset-password'] = () =>
      json({ temporaryPassword: 'SelfTemp123' });
    await click(button(rowOf(host, 'me'), 'Đặt lại mật khẩu'));
    await click(button(dialog()!, 'Đặt lại mật khẩu'));
    expect(button(host, 'Tạo hàng loạt').disabled).toBe(true);
  });
});
