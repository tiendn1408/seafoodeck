import { useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, type AuthView } from '../pilot/api';
import { ErrorNote } from './ErrorNote';

type Props = { onLogin: (a: AuthView) => void };

function LoginScreen({
  title,
  intro,
  submit,
  onLogin,
  staff,
}: Props & { title: string; intro: ReactNode; submit: string; staff: boolean }) {
  const [credential, setCredential] = useState(''),
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
        <h1>{title}</h1>
        <p>{intro}</p>
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
            {busy ? 'Đang kiểm tra…' : submit}
            <ArrowRight size={17} />
          </button>
        </form>
      </div>
    </section>
  );
}

export function Login(props: Props) {
  return (
    <LoginScreen
      {...props}
      staff={false}
      title="Vào bộ học của bạn."
      intro="Học tên gọi thủy hải sản thương mại. Nhập mã mời từ người phụ trách, bạn không cần tạo tài khoản."
      submit="Vào bộ học"
    />
  );
}

export function StaffLogin(props: Props) {
  return (
    <LoginScreen
      {...props}
      staff
      title="Đăng nhập quản trị"
      intro="Đăng nhập bằng tài khoản được cấp."
      submit="Đăng nhập"
    />
  );
}
