import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { api, setCsrf, type AuthView } from '../pilot/api';
import { flushAll, pendingTotal } from './study/submitQueues';
import { ErrorNote } from './ErrorNote';

type Props = {
  forced: boolean;
  role: string;
  /** Called with the new session view the server answered with (its csrf is already adopted). */
  onDone: (session: AuthView) => void;
  onCancel?: () => void;
  onLogout: () => void;
  /** Sign-out is waiting for answers still being saved (forced screen only). */
  saving?: boolean;
};

export const minPasswordLength = (role: string) => (role === 'student' ? 8 : 16);

export function ChangePassword({
  forced,
  role,
  onDone,
  onCancel,
  onLogout,
  saving = false,
}: Props) {
  const min = minPasswordLength(role);
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [again, setAgain] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  async function submit() {
    if (next.length < min) return setError(`Mật khẩu mới cần ít nhất ${min} ký tự.`);
    if (next === current) return setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
    if (next !== again) return setError('Hai lần nhập mật khẩu mới chưa khớp.');
    setBusy(true);
    setError('');
    try {
      // The change replaces the session: answers still on their way would be sent to a dead one.
      if (!forced && pendingTotal() > 0) {
        const saved = await flushAll(5000);
        if (
          !saved &&
          !window.confirm(
            'Còn câu chưa lưu được. Đổi mật khẩu có thể làm mất các câu này. Vẫn đổi?',
          )
        ) {
          setBusy(false);
          return;
        }
      }
      const session = await api<AuthView>('/me/password', { current, next });
      // The server rotated the session: only its new CSRF token is valid from now on.
      if (typeof session?.csrf === 'string') setCsrf(session.csrf);
      onDone(session);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="pilot-login change-password">
      <div>
        <h1>Đổi mật khẩu</h1>
        {forced && <p>Bạn cần đặt mật khẩu mới trước khi tiếp tục.</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
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
              <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>
                Hủy
              </button>
            )}
          </div>
        </form>
        {forced && saving && (
          <p className="login-saving" role="status">
            Đang lưu tiến độ…
          </p>
        )}
        {forced && (
          <button type="button" className="login-switch" disabled={saving} onClick={onLogout}>
            <LogOut size={16} aria-hidden="true" /> Đăng xuất
          </button>
        )}
      </div>
    </section>
  );
}
