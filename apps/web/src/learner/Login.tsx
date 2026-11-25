import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, ApiError, type AuthView } from '../pilot/api';
import { ErrorNote } from './ErrorNote';

type Props = { onLogin: (a: AuthView) => void };
type Mode = 'account' | 'invite';

const LABELS: Record<Mode, { user?: string; secret: string; autoComplete: string }> = {
  account: { user: 'Tên đăng nhập', secret: 'Mật khẩu', autoComplete: 'current-password' },
  invite: { secret: 'Mã mời', autoComplete: 'off' },
};

function failure(e: unknown, mode: Mode): string {
  // 401 stays generic so it never hints at lockouts or which part was wrong.
  if (e instanceof ApiError && e.status === 401) {
    return mode === 'invite'
      ? 'Mã mời chưa đúng hoặc đã hết hạn. Kiểm tra lại với người phụ trách.'
      : 'Tên đăng nhập hoặc mật khẩu chưa đúng. Hãy thử lại.';
  }
  return (e as Error).message;
}

/** One sign-in form (account or invite code); other apps reuse it with their own copy. */
export function LoginScreen({
  title,
  intro,
  submit,
  onLogin,
  mode,
  userLabel,
  footer,
  focusFirst,
}: Props & {
  title: string;
  intro: ReactNode;
  submit: string;
  mode: Mode;
  /** Replaces the account form's username label. */
  userLabel?: string;
  footer?: ReactNode;
  focusFirst?: boolean;
}) {
  const [credential, setCredential] = useState(''),
    [username, setUsername] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const labels =
    mode === 'account' && userLabel ? { ...LABELS[mode], user: userLabel } : LABELS[mode];
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusFirst) first.current?.focus();
  }, [focusFirst]);
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
            void api<AuthView>('/auth/login', {
              credential,
              // Whitespace is never part of a username; phones add it with autocomplete.
              ...(mode !== 'invite' ? { username: username.trim() } : {}),
            })
              .then((a) => onLogin(a))
              .catch((err) => {
                setError(failure(err, mode));
                setBusy(false);
              });
          }}
        >
          {labels.user && (
            <label>
              {labels.user}
              <input
                ref={first}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            {labels.secret}
            <input
              ref={labels.user ? undefined : first}
              type="password"
              autoComplete={labels.autoComplete}
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
        {footer}
      </div>
    </section>
  );
}

export function Login(props: Props) {
  const [mode, setMode] = useState<'account' | 'invite'>('account');
  const [switched, setSwitched] = useState(false);
  const swap = (next: 'account' | 'invite') => {
    setSwitched(true);
    setMode(next);
  };
  return mode === 'account' ? (
    <LoginScreen
      key="account"
      {...props}
      mode="account"
      focusFirst={switched}
      title="Vào bộ học của bạn."
      intro="Đăng nhập để lưu tiến độ học, hoặc học thử bằng mã mời."
      submit="Đăng nhập"
      footer={
        <button type="button" className="login-switch" onClick={() => swap('invite')}>
          Học thử bằng mã mời
        </button>
      }
    />
  ) : (
    <LoginScreen
      key="invite"
      {...props}
      mode="invite"
      focusFirst={switched}
      title="Học thử bằng mã mời."
      intro="Nhập mã mời từ người phụ trách. Tiến độ học thử không được lưu theo tài khoản."
      submit="Vào bộ học"
      footer={
        <button type="button" className="login-switch" onClick={() => swap('account')}>
          Có tài khoản? Đăng nhập
        </button>
      }
    />
  );
}
