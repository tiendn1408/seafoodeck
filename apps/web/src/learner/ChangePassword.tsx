import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { api } from '../pilot/api';
import { ErrorNote } from './ErrorNote';

type Props = { forced: boolean; role: string; onDone: () => void; onLogout: () => void };

export const minPasswordLength = (role: string) => (role === 'student' ? 8 : 16);

export function ChangePassword({ forced, role, onDone, onLogout }: Props) {
  const min = minPasswordLength(role);
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [again, setAgain] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  function submit() {
    if (next.length < min) return setError(`Mật khẩu mới cần ít nhất ${min} ký tự.`);
    if (next === current) return setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
    if (next !== again) return setError('Hai lần nhập mật khẩu mới chưa khớp.');
    setBusy(true);
    setError('');
    api<unknown>('/me/password', { current, next })
      .then(onDone)
      .catch((e: Error) => {
        setError(e.message);
        setBusy(false);
      });
  }
  return (
    <section className="pilot-login change-password">
      <div>
        <h1>Đổi mật khẩu</h1>
        {forced && <p>Quản trị viên yêu cầu bạn đặt mật khẩu mới trước khi tiếp tục.</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label>
            Mật khẩu hiện tại
            <input
              ref={first}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              maxLength={150}
            />
          </label>
          <label>
            Mật khẩu mới
            <input
              type="password"
              autoComplete="new-password"
              aria-describedby="pw-hint"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              maxLength={150}
            />
            <small id="pw-hint">Ít nhất {min} ký tự, khác mật khẩu hiện tại.</small>
          </label>
          <label>
            Nhập lại mật khẩu mới
            <input
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              required
              maxLength={150}
            />
          </label>
          {error && <ErrorNote message={error} />}
          <div className="login-actions">
            <button className="btn primary" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
            </button>
            {!forced && (
              <button type="button" className="btn secondary" onClick={onDone}>
                Hủy
              </button>
            )}
          </div>
        </form>
        {forced && (
          <button type="button" className="login-switch" onClick={onLogout}>
            <LogOut size={16} aria-hidden="true" /> Đăng xuất
          </button>
        )}
      </div>
    </section>
  );
}
