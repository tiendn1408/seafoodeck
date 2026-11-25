import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StaffLogin } from './StaffLogin';
import { field, mount, setValue, submit, unmountAll } from '@web/learner/testDom';

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const auth = { role: 'admin', internal: false, csrf: 'c', expiresAt: 'x' };
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

describe('StaffLogin', () => {
  it('staff login has username and password', () => {
    const html = renderToString(<StaffLogin onLogin={() => {}} />);
    expect(html).toContain('Đăng nhập quản trị');
    expect(html).toContain('Tài khoản');
    expect(html).toContain('Mật khẩu');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('Mã mời');
    expect(html).not.toContain('Học thử');
  });
  it('staff login trims the username too', async () => {
    fetchMock.mockReturnValue(reply(auth));
    const html = renderToString(<StaffLogin onLogin={() => {}} />);
    expect(html).toMatch(/autoCapitalize="none"|autocapitalize="none"/);
    const onLogin = vi.fn();
    const host = mount(<StaffLogin onLogin={onLogin} />);
    setValue(field(host, 'Tài khoản'), ' admin ');
    setValue(field(host, 'Mật khẩu'), 'dummy-pass-123');
    await submit(host);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/login');
    expect(sent()).toEqual({ username: 'admin', credential: 'dummy-pass-123' });
    expect(onLogin).toHaveBeenCalledWith(auth);
  });
  it('a 401 shows the same generic message as the learner login, never server detail', async () => {
    fetchMock.mockReturnValue(reply({ message: 'Tài khoản bị khóa đến 10:00 (5 lần sai)' }, 401));
    const host = mount(<StaffLogin onLogin={() => {}} />);
    setValue(field(host, 'Tài khoản'), 'hoa');
    setValue(field(host, 'Mật khẩu'), 'dummy-wrong');
    await submit(host);
    const alert = host.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Tên đăng nhập hoặc mật khẩu chưa đúng');
    expect(alert.textContent).not.toMatch(/khóa|5 lần/);
  });
});
