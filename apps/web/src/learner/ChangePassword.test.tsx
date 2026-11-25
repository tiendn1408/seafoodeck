import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePassword } from './ChangePassword';
import { button, click, field, mount, setValue, submit, unmountAll } from './testDom';

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});
function fill(host: HTMLElement, current: string, next: string, again = next) {
  setValue(field(host, 'Mật khẩu hiện tại'), current);
  setValue(field(host, 'Mật khẩu mới'), next);
  setValue(field(host, 'Nhập lại mật khẩu mới'), again);
}
const alertText = (h: HTMLElement) => h.querySelector('[role="alert"]')?.textContent ?? '';
const props = { onDone: () => {}, onLogout: () => {} };

describe('ChangePassword', () => {
  it('rejects a new password equal to the current one', async () => {
    const host = mount(<ChangePassword forced={false} role="student" {...props} />);
    fill(host, 'dummy-old-pass', 'dummy-old-pass');
    await submit(host);
    expect(alertText(host)).toContain('khác');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects too short per role: student 8, others 16', async () => {
    const s = mount(<ChangePassword forced={false} role="student" {...props} />);
    expect(s.textContent).toContain('Ít nhất 8 ký tự');
    fill(s, 'dummy-old-pass', 'short');
    await submit(s);
    expect(alertText(s)).toContain('8');
    const a = mount(<ChangePassword forced={false} role="admin" {...props} />);
    expect(a.textContent).toContain('Ít nhất 16 ký tự');
    fill(a, 'dummy-old-pass', 'only-twelve-ch');
    await submit(a);
    expect(alertText(a)).toContain('16');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a mismatched confirmation', async () => {
    const host = mount(<ChangePassword forced={false} role="student" {...props} />);
    fill(host, 'dummy-old-pass', 'dummy-new-pass1', 'dummy-new-pass2');
    await submit(host);
    expect(alertText(host)).toContain('khớp');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('posts to /me/password and calls onDone on success', async () => {
    fetchMock.mockReturnValue(reply({ ok: true }));
    const onDone = vi.fn();
    const host = mount(
      <ChangePassword forced role="student" onDone={onDone} onLogout={() => {}} />,
    );
    fill(host, 'dummy-old-pass', 'dummy-new-pass1');
    await submit(host);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/me/password');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      current: 'dummy-old-pass',
      next: 'dummy-new-pass1',
    });
    expect(onDone).toHaveBeenCalled();
  });
  it('shows the server message on 400 and does not call onDone', async () => {
    fetchMock.mockReturnValue(reply({ message: 'Mật khẩu hiện tại không đúng.' }, 400));
    const onDone = vi.fn();
    const host = mount(
      <ChangePassword forced role="student" onDone={onDone} onLogout={() => {}} />,
    );
    fill(host, 'dummy-old-pass', 'dummy-new-pass1');
    await submit(host);
    expect(alertText(host)).toContain('Mật khẩu hiện tại không đúng.');
    expect(onDone).not.toHaveBeenCalled();
  });
  it('forced: explanation and logout, no cancel or links', async () => {
    const onLogout = vi.fn();
    const host = mount(
      <ChangePassword forced role="student" onDone={() => {}} onLogout={onLogout} />,
    );
    expect(host.textContent).toContain('Bạn cần đặt mật khẩu mới trước khi tiếp tục.');
    expect(host.textContent).not.toContain('Hủy');
    expect(host.querySelector('a')).toBeNull();
    await click(button(host, 'Đăng xuất'));
    expect(onLogout).toHaveBeenCalled();
  });
  it('not forced: has a cancel action and no forced explanation', async () => {
    const onCancel = vi.fn();
    const host = mount(
      <ChangePassword
        forced={false}
        role="student"
        onDone={() => {}}
        onCancel={onCancel}
        onLogout={() => {}}
      />,
    );
    expect(host.textContent).not.toContain('Bạn cần đặt mật khẩu mới');
    await click(button(host, 'Hủy'));
    expect(onCancel).toHaveBeenCalled();
  });
  it('not forced: "Hủy" is disabled while the change is being saved', async () => {
    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (answer = r)));
    const onCancel = vi.fn();
    const host = mount(
      <ChangePassword
        forced={false}
        role="student"
        onDone={() => {}}
        onCancel={onCancel}
        onLogout={() => {}}
      />,
    );
    fill(host, 'old-secret', 'new-secret-1');
    await submit(host);
    const cancel = button(host, 'Hủy') as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    await click(cancel);
    expect(onCancel).not.toHaveBeenCalled();
    answer(new Response(JSON.stringify({ message: 'Sai.' }), { status: 400 }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect((button(host, 'Hủy') as HTMLButtonElement).disabled).toBe(false);
  });
});
