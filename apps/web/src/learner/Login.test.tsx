import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Login, StaffLogin } from './Login';

describe('Login screens', () => {
  it('learner login has only the invite form and never mentions admin', () => {
    const html = renderToString(<Login onLogin={() => {}} />);
    expect(html).toContain('Mã mời');
    expect(html).not.toMatch(/quản trị|admin|<label>Tài khoản|Mật khẩu|<a |pilot-text-button/i);
  });
  it('staff login has username and password', () => {
    const html = renderToString(<StaffLogin onLogin={() => {}} />);
    expect(html).toContain('Đăng nhập quản trị');
    expect(html).toContain('Tài khoản');
    expect(html).toContain('Mật khẩu');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('Mã mời');
  });
});
