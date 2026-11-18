import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, type AuthView } from '../pilot/api';
import { ErrorNote } from './ErrorNote';

export function Login({ onLogin }: { onLogin: (a: AuthView) => void }) {
  const [staff, setStaff] = useState(false),
    [credential, setCredential] = useState(''),
    [username, setUsername] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="pilot-login">
      <img
        src="/media/illustrations/seafood-notebook-2d-v2.png"
        alt=""
        width="1536"
        height="1024"
      />
      <div>
        <p>Thủy hải sản thương mại</p>
        <h1>Vào bộ học của bạn.</h1>
        <p>
          {staff
            ? 'Đăng nhập bằng tài khoản quản trị được cấp.'
            : 'Nhập mã mời từ người phụ trách. Bạn không cần tạo tài khoản.'}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            void api<AuthView>('/auth/login', { credential, ...(staff ? { username } : {}) })
              .then(onLogin)
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          {staff && (
            <label>
              Tài khoản
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            {staff ? 'Mật khẩu' : 'Mã mời'}
            <input
              type="password"
              autoComplete={staff ? 'current-password' : 'off'}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              required
              maxLength={150}
            />
          </label>
          {error && <ErrorNote message={error} />}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Đang kiểm tra…' : 'Vào bộ học'}
            <ArrowRight size={17} />
          </button>
        </form>
        <button
          className="pilot-text-button"
          onClick={() => {
            setStaff(!staff);
            setError('');
            setCredential('');
          }}
        >
          {staff ? 'Dùng mã mời người học' : 'Dành cho quản trị'}
        </button>
      </div>
    </section>
  );
}
