import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { api, type AuthView } from '../pilot/api';
import { ChangePassword } from './ChangePassword';
import { ErrorNote } from './ErrorNote';
import { useMe } from './meStore';
import './account.css';

export const DISPLAY_NAME_MAX = 80;

/** GET/PATCH /me (no trailing segment): the signed-in account itself. */
export interface MeAccount {
  username: string;
  displayName: string | null;
  role: string;
  mustChangePassword: boolean;
}

type Props = {
  /** The signed-in role, which sets the minimum password length (students 8, others 16). */
  role?: string;
  userId: string | undefined;
  onLogout: () => void;
  /** Called with the saved display name (null when cleared) so the shell can update. */
  onSaved: (displayName: string | null) => void;
  /** Called with the new session after a password change, so the shell adopts its fields. */
  onPasswordChanged?: (session: AuthView) => void;
};

/** The signed-in account's own settings: display name, password change and sign-out. Deep, photo-less, short. */
export function Account({ role = 'student', userId, onLogout, onSaved, onPasswordChanged }: Props) {
  const me = useMe<MeAccount>('/me', userId);
  const [draft, setDraft] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [changing, setChanging] = useState(false);
  const value = draft ?? me.data?.displayName ?? '';

  function save() {
    const name = value.trim();
    if (name.length > DISPLAY_NAME_MAX)
      return setError(`Tên hiển thị tối đa ${DISPLAY_NAME_MAX} ký tự.`);
    const displayName = name || null;
    setBusy(true);
    setError('');
    setStatus('');
    api<MeAccount>('/me', { displayName }, undefined, 'PATCH')
      .then(() => {
        setDraft(name);
        setStatus('Đã lưu tên hiển thị.');
        onSaved(displayName);
        me.refresh();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  if (changing)
    return (
      <ChangePassword
        forced={false}
        role={role}
        onCancel={() => setChanging(false)}
        onDone={(session) => {
          onPasswordChanged?.(session);
          setChanging(false);
          setStatus('Đã đổi mật khẩu.');
        }}
        onLogout={onLogout}
      />
    );

  return (
    <section className="account" aria-labelledby="account-title">
      <h1 id="account-title">Tài khoản</h1>
      {me.error && <ErrorNote message={me.error} retry={me.refresh} />}
      <dl className="account-id">
        <dt>Tên đăng nhập</dt>
        <dd>{me.data ? me.data.username : '…'}</dd>
      </dl>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          Tên hiển thị
          <input
            type="text"
            autoComplete="nickname"
            aria-describedby="account-name-hint"
            maxLength={DISPLAY_NAME_MAX}
            value={value}
            onChange={(e) => {
              setDraft(e.target.value);
              setStatus('');
            }}
          />
          <small id="account-name-hint">
            Tối đa {DISPLAY_NAME_MAX} ký tự. Để trống nếu chỉ muốn dùng tên đăng nhập.
          </small>
        </label>
        {error && <ErrorNote message={error} />}
        <button className="account-save" disabled={busy || !me.data}>
          {busy ? 'Đang lưu…' : 'Lưu tên'}
        </button>
      </form>
      <p className="account-status" role="status">
        {status}
      </p>
      <div className="account-actions">
        <button type="button" className="account-link" onClick={() => setChanging(true)}>
          <KeyRound size={18} aria-hidden="true" /> Đổi mật khẩu
        </button>
        <button type="button" className="account-link" onClick={onLogout}>
          <LogOut size={18} aria-hidden="true" /> Đăng xuất
        </button>
      </div>
    </section>
  );
}
