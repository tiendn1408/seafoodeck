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
  });

  it('sends role, status, a trimmed debounced search and the page', async () => {
    const host = await screen();
    select(host, 'Vai trò', 'manager');
    await tick();
    select(host, 'Trạng thái', 'disabled');
    await tick();
    setValue(field(host, 'Tìm'), '  la');
    setValue(field(host, 'Tìm'), '  lan ');
    await tick(100);
    expect(lists()).toEqual([
      'GET /admin/users?page=1&limit=20',
      'GET /admin/users?role=manager&page=1&limit=20',
      'GET /admin/users?role=manager&status=disabled&page=1&limit=20',
    ]);
    await tick(300);
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
