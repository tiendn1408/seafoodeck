import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Login, StaffLogin } from './Login';
import { button, click, field, mount, setValue, submit, unmountAll } from './testDom';

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const auth = { role: 'student', internal: false, csrf: 'c', expiresAt: 'x' };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

describe('Login screens', () => {
  it('learner login defaults to the account form and never mentions admin', () => {
    const html = renderToString(<Login onLogin={() => {}} />);
    expect(html).toContain('Tên đăng nhập');
    expect(html).toContain('Mật khẩu');
    expect(html).toContain('Học thử bằng mã mời');
    expect(html).not.toContain('Mã mời</label>');
    expect(html).not.toMatch(/quản trị|admin/i);
  });
  it('staff login has username and password', () => {
    const html = renderToString(<StaffLogin onLogin={() => {}} />);
    expect(html).toContain('Đăng nhập quản trị');
    expect(html).toContain('Tài khoản');
    expect(html).toContain('Mật khẩu');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('Mã mời');
    expect(html).not.toContain('Học thử');
  });
  it('account login sends username and credential', async () => {
    fetchMock.mockReturnValue(reply(auth));
    const onLogin = vi.fn();
    const host = mount(<Login onLogin={onLogin} />);
    setValue(field(host, 'Tên đăng nhập'), 'hoa');
    setValue(field(host, 'Mật khẩu'), 'dummy-pass-123');
    await submit(host);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/login');
    expect(sent()).toEqual({ username: 'hoa', credential: 'dummy-pass-123' });
    expect(onLogin).toHaveBeenCalledWith(auth);
  });
  it('switches to the invite form and back, moving focus to the first field', async () => {
    fetchMock.mockReturnValue(reply({ ...auth, role: 'learner' }));
    const host = mount(<Login onLogin={() => {}} />);
    await click(button(host, 'Học thử bằng mã mời'));
    expect(host.textContent).not.toContain('Tên đăng nhập');
    const code = field(host, 'Mã mời');
    expect(document.activeElement).toBe(code);
    setValue(code, 'dummy-invite');
    await submit(host);
    expect(sent()).toEqual({ credential: 'dummy-invite' });
    await click(button(host, 'Có tài khoản? Đăng nhập'));
    expect(document.activeElement).toBe(field(host, 'Tên đăng nhập'));
    expect(host.textContent).not.toMatch(/quản trị|admin/i);
  });
  it('shows a plain message on 401 without server detail', async () => {
    fetchMock.mockReturnValue(reply({ message: 'Tài khoản bị khóa đến 10:00 (5 lần sai)' }, 401));
    const host = mount(<Login onLogin={() => {}} />);
    setValue(field(host, 'Tên đăng nhập'), 'hoa');
    setValue(field(host, 'Mật khẩu'), 'dummy-wrong');
    await submit(host);
    const alert = host.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('chưa đúng');
    expect(alert.textContent).not.toMatch(/khóa|5 lần/);
  });
  it('shows the server message on 429', async () => {
    fetchMock.mockReturnValue(reply({ message: 'Thử lại sau ít phút.' }, 429));
    const host = mount(<Login onLogin={() => {}} />);
    setValue(field(host, 'Tên đăng nhập'), 'hoa');
    setValue(field(host, 'Mật khẩu'), 'dummy-wrong');
    await submit(host);
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Thử lại sau ít phút.');
  });
});

describe('error contrast on the deep login screen', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const tokens = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../pilot/pilot.css'), 'utf8');
  const token = (n: string) => tokens.match(new RegExp(`--${n}:\\s*(#[0-9a-f]{6})`, 'i'))![1];
  it('uses ice text on a deep panel, at least 4.5:1', () => {
    const rule = css.match(/data-tone='deep'\] \.pilot-error \{([^}]*)\}/)?.[1] ?? '';
    const color = rule.match(/color:\s*var\(--([\w-]+)\)/)?.[1];
    const bg = rule.match(/background:\s*var\(--([\w-]+)\)/)?.[1];
    expect(color && bg).toBeTruthy();
    expect(ratio(token(color!), token(bg!))).toBeGreaterThanOrEqual(4.5);
  });
});
