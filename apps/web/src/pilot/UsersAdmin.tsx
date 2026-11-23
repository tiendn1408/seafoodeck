import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api, type AdminUserPage, type AdminUserRow } from './api';
import { AdminTabs } from './AdminTabs';
import { setLeaveGuard } from './leaveGuard';
import { Dialog } from './Dialog';
import { BulkDialog } from './BulkUsers';
import { ErrorNote } from '../learner/ErrorNote';
import { minPasswordLength } from '../learner/ChangePassword';
import './users.css';

const LIMIT = 20;
const SEARCH_DELAY = 300;
const USERNAME = /^[a-zA-Z0-9_-]{3,50}$/;
/** Roles an admin can create (admin itself is not creatable). */
const CREATABLE = ['student', 'manager', 'editor', 'reviewer', 'publisher'] as const;
export const ROLE_LABEL: Record<string, string> = {
  student: 'Học viên',
  manager: 'Quản lý',
  editor: 'Biên tập',
  reviewer: 'Duyệt',
  publisher: 'Xuất bản',
  admin: 'Quản trị',
};
const SELF_REASON = 'Không thể khóa hoặc xóa tài khoản bạn đang dùng.';
const PAUSED_REASON = 'Đóng khung mật khẩu tạm trước.';
const ONCE = 'Mật khẩu chỉ hiện lúc này. Đưa cho người dùng và yêu cầu họ đổi ngay.';
const ONCE_SELF =
  'Khi đóng khung này bạn sẽ phải đổi mật khẩu; dùng mật khẩu tạm này ở ô "Mật khẩu hiện tại". ' +
  'Đừng rời trang này trước khi ghi lại mật khẩu.';

/** Same alphabet as the server's temporary passwords: no 0 O o 1 l I. */
export const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
/** Strong random password (12 characters for students, 20 otherwise), unbiased. */
export function generatePassword(role: string): string {
  const length = role === 'student' ? 12 : 20;
  const n = PASSWORD_ALPHABET.length;
  const ceiling = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  let out = '';
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0] < ceiling) out += PASSWORD_ALPHABET[buf[0] % n];
  }
  return out;
}

const fullTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'medium',
  timeStyle: 'short',
});
const shortDate = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
function relative(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return shortDate.format(new Date(iso));
}

type Pending =
  | { kind: 'create' }
  | { kind: 'bulk' }
  | { kind: 'lock' | 'reset' | 'delete'; user: AdminUserRow }
  | null;
interface Secret {
  /** Per-reveal counter, so a new password remounts the panel (never the password itself). */
  seq: number;
  username: string;
  password: string;
  /**
   * The acting admin's own password: the server now answers MUST_CHANGE_PASSWORD on every
   * guarded route, so any request would swap this screen for the forced password screen and lose
   * the password. The list stays paused until the panel is closed.
   */
  self: boolean;
}
let secretSeq = 0;
const LEAVE_QUESTION =
  'Mật khẩu tạm của bạn chỉ hiện một lần. Rời trang sẽ mất mật khẩu này. Vẫn rời đi?';

export function UsersAdmin({ selfId }: { selfId?: string }) {
  const [role, setRole] = useState(''),
    [status, setStatus] = useState(''),
    [query, setQuery] = useState(''),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0);
  // The last page received, and which request (path + reload count) has settled.
  const [data, setData] = useState<AdminUserPage | null>(null),
    [settled, setSettled] = useState<{ key: string; error: string } | null>(null);
  const [pending, setPending] = useState<Pending>(null),
    [actionError, setActionError] = useState(''),
    [rowError, setRowError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    // The one-time password lives only here: gone when the panel closes or the screen unmounts.
    [secret, setSecret] = useState<Secret | null>(null);
  const ids = useId();
  const paused = !!secret?.self;
  const unlocking = useRef(false);
  const head = useRef<HTMLHeadingElement>(null);
  const focusHead = useRef(false);

  useEffect(() => {
    if (paused) return;
    const trimmed = query.trim();
    if (trimmed === q) return;
    const t = setTimeout(() => {
      setQ(trimmed);
      setPage(1);
    }, SEARCH_DELAY);
    return () => clearTimeout(t);
  }, [query, q, paused]);
  // Reloading or closing the tab would lose the own temporary password: ask first.
  useEffect(() => {
    if (!paused) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    // The shell asks before sign-out and in-app navigation (hash changes) discard it.
    const release = setLeaveGuard(LEAVE_QUESTION);
    return () => {
      window.removeEventListener('beforeunload', ask);
      release();
    };
  }, [paused]);

  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('limit', String(LIMIT));
  const path = '/admin/users?' + params;
  const key = `${path}#${reload}`;
  const loading = settled?.key !== key;
  const loadError = settled?.key === key ? settled.error : '';
  useEffect(() => {
    if (paused) return;
    const ctrl = new AbortController();
    let current = true;
    api<AdminUserPage>(path, undefined, ctrl.signal)
      .then((d) => {
        if (!current) return;
        // The last row of a later page went away (deleted, or locked under "active"): step back.
        const last = Math.max(1, Math.ceil(d.total / d.limit));
        if (!d.items.length && d.page > last) {
          setPage(last);
          return;
        }
        setData(d);
        setSettled({ key, error: '' });
      })
      .catch((e: Error) => {
        if (current && e.name !== 'AbortError') setSettled({ key, error: e.message });
      });
    return () => {
      current = false;
      ctrl.abort();
    };
  }, [path, key, paused]);
  useEffect(() => {
    if (focusHead.current && !loading) {
      focusHead.current = false;
      head.current?.focus();
    }
  }, [data, loading]);

  const refresh = () => setReload((n) => n + 1);
  const open = (next: Pending) => {
    // Any request now would hit MUST_CHANGE_PASSWORD and lose the own temporary password.
    if (paused) return;
    setActionError('');
    setRowError('');
    setPending(next);
  };
  async function run(work: () => Promise<boolean | void>) {
    setBusy(true);
    setActionError('');
    try {
      // `false` from the work skips the list refresh (own password reset: see Secret.self).
      const again = await work();
      setPending(null);
      if (again !== false) refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function unlock(user: AdminUserRow) {
    if (unlocking.current) return;
    unlocking.current = true;
    setBusy(true);
    setRowError('');
    setNotice('');
    try {
      await api(`/admin/users/${user.id}`, { disabled: false }, undefined, 'PATCH');
      setNotice(`Đã mở khóa ${user.username}.`);
      refresh();
    } catch (e) {
      setRowError((e as Error).message);
    } finally {
      unlocking.current = false;
      setBusy(false);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const user =
    pending && pending.kind !== 'create' && pending.kind !== 'bulk' ? pending.user : null;

  return (
    <div className="users-admin">
      <AdminTabs current="users" disabled={paused} />
      <header className="users-head">
        <div>
          <h1 ref={head} tabIndex={-1}>
            Người dùng
          </h1>
          <p>Tạo tài khoản, khóa, đặt lại mật khẩu hoặc xóa người dùng.</p>
        </div>
        <div className="users-head-actions">
          <button
            type="button"
            className="users-secondary"
            disabled={paused}
            title={paused ? PAUSED_REASON : undefined}
            onClick={() => open({ kind: 'bulk' })}
          >
            Tạo hàng loạt
          </button>
          <button
            type="button"
            className="users-primary"
            disabled={paused}
            title={paused ? PAUSED_REASON : undefined}
            onClick={() => open({ kind: 'create' })}
          >
            Tạo người dùng
          </button>
        </div>
      </header>

      <p className="users-live" role="status" aria-live="polite">
        {notice}
      </p>

      {secret && (
        <SecretPanel
          key={secret.seq}
          secret={secret}
          onClose={() => {
            const self = secret.self;
            setSecret(null);
            // Now the list may load again; for an own reset its 403 starts the forced flow.
            if (self) refresh();
          }}
        />
      )}

      <div className="users-filters">
        <label className="users-field">
          Vai trò
          <select
            value={role}
            disabled={paused}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            {[...CREATABLE, 'admin'].map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="users-field">
          Trạng thái
          <select
            value={status}
            disabled={paused}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            <option value="active">Đang hoạt động</option>
            <option value="disabled">Đã khóa</option>
          </select>
        </label>
        <label className="users-field users-search">
          Tìm theo tên đăng nhập hoặc tên hiển thị
          <input
            type="search"
            value={query}
            disabled={paused}
            maxLength={80}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              if (!paused) setQuery(e.target.value);
            }}
          />
        </label>
      </div>

      {rowError && <ErrorNote message={rowError} />}
      {loadError ? (
        <ErrorNote message={loadError} retry={refresh} />
      ) : !data ? (
        <p role="status" className="users-muted">
          Đang tải danh sách…
        </p>
      ) : (
        <>
          <p className="users-count" id={ids + 'count'}>
            {data.total} người dùng
            {loading && <span role="status"> · Đang tải…</span>}
          </p>
          {data.items.length === 0 ? (
            <p className="users-empty">Không có người dùng nào khớp bộ lọc.</p>
          ) : (
            <table className="users-table" aria-describedby={ids + 'count'}>
              <caption className="users-sr">Danh sách người dùng</caption>
              <thead>
                <tr>
                  <th scope="col">Tên đăng nhập</th>
                  <th scope="col">Tên hiển thị</th>
                  <th scope="col">Vai trò</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Đăng nhập gần nhất</th>
                  <th scope="col">
                    <span className="users-sr">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => {
                  const self = u.id === selfId;
                  return (
                    <tr key={u.id} data-user={u.id}>
                      <th scope="row" className="users-name">
                        {u.username}
                        {self && <span className="users-self"> (bạn)</span>}
                      </th>
                      <td data-label="Tên hiển thị">
                        {u.displayName || <span className="users-muted">Chưa đặt</span>}
                      </td>
                      <td data-label="Vai trò">{ROLE_LABEL[u.role] ?? u.role}</td>
                      <td data-label="Trạng thái">
                        <span className="users-badge" data-state={u.disabled ? 'off' : 'on'}>
                          {u.disabled ? 'Đã khóa' : 'Hoạt động'}
                        </span>
                        {u.mustChangePassword && (
                          <span className="users-badge" data-state="must">
                            Phải đổi mật khẩu
                          </span>
                        )}
                      </td>
                      <td data-label="Đăng nhập gần nhất">
                        {u.lastLoginAt ? (
                          <time
                            dateTime={u.lastLoginAt}
                            title={fullTime.format(new Date(u.lastLoginAt))}
                          >
                            {relative(u.lastLoginAt)}
                          </time>
                        ) : (
                          <span className="users-muted">Chưa đăng nhập</span>
                        )}
                      </td>
                      <td>
                        <div className="users-actions">
                          {u.role === 'student' && (
                            <a
                              className="users-secondary"
                              href={`#manager/learner/${encodeURIComponent(u.id)}`}
                            >
                              Xem tiến độ<span className="users-sr"> {u.username}</span>
                            </a>
                          )}
                          {u.disabled ? (
                            <button
                              type="button"
                              className="users-secondary"
                              disabled={busy || paused}
                              title={paused ? PAUSED_REASON : undefined}
                              onClick={() => void unlock(u)}
                            >
                              Mở khóa<span className="users-sr"> {u.username}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="users-secondary"
                              disabled={self || paused}
                              title={paused ? PAUSED_REASON : self ? SELF_REASON : undefined}
                              onClick={() => open({ kind: 'lock', user: u })}
                            >
                              Khóa<span className="users-sr"> {u.username}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="users-secondary"
                            disabled={paused}
                            title={paused ? PAUSED_REASON : undefined}
                            onClick={() => open({ kind: 'reset', user: u })}
                          >
                            Đặt lại mật khẩu<span className="users-sr"> {u.username}</span>
                          </button>
                          <button
                            type="button"
                            className="users-secondary"
                            disabled={self || paused}
                            title={paused ? PAUSED_REASON : self ? SELF_REASON : undefined}
                            onClick={() => open({ kind: 'delete', user: u })}
                          >
                            Xóa<span className="users-sr"> {u.username}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <nav className="users-pages" aria-label="Phân trang">
            <button
              type="button"
              className="users-secondary"
              disabled={page <= 1 || loading || paused}
              onClick={() => setPage((p) => p - 1)}
            >
              Trang trước
            </button>
            <span>
              Trang {page}/{pages}
            </span>
            <button
              type="button"
              className="users-secondary"
              disabled={page >= pages || loading || paused}
              onClick={() => setPage((p) => p + 1)}
            >
              Trang sau
            </button>
          </nav>
        </>
      )}

      {pending?.kind === 'create' && (
        <CreateDialog
          busy={busy}
          error={actionError}
          onClose={() => setPending(null)}
          onCreate={(body, generated) =>
            run(async () => {
              setNotice('');
              await api('/admin/users', body);
              setNotice(`Đã tạo ${body.username}.`);
              if (generated)
                setSecret({
                  seq: ++secretSeq,
                  username: body.username,
                  password: body.password,
                  self: false,
                });
            })
          }
        />
      )}
      {pending?.kind === 'bulk' && <BulkDialog onClose={() => setPending(null)} onDone={refresh} />}
      {pending?.kind === 'lock' && user && (
        <Dialog title={`Khóa ${user.username}?`} onClose={() => setPending(null)}>
          <p>Khóa sẽ đăng xuất người này ngay. Có thể mở khóa lại bất cứ lúc nào.</p>
          {actionError && <ErrorNote message={actionError} />}
          <div className="users-dialog-actions">
            <button type="button" className="users-secondary" onClick={() => setPending(null)}>
              Hủy
            </button>
            <button
              type="button"
              className="users-primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setNotice('');
                  await api(`/admin/users/${user.id}`, { disabled: true }, undefined, 'PATCH');
                  setNotice(`Đã khóa ${user.username}.`);
                })
              }
            >
              Khóa tài khoản
            </button>
          </div>
        </Dialog>
      )}
      {pending?.kind === 'reset' && user && (
        <Dialog title={`Đặt lại mật khẩu cho ${user.username}?`} onClose={() => setPending(null)}>
          <p>
            Mật khẩu cũ ngừng dùng được ngay. Bạn sẽ nhận một mật khẩu tạm để đưa cho người này; họ
            phải đổi nó ở lần đăng nhập tới.
          </p>
          {actionError && <ErrorNote message={actionError} />}
          <div className="users-dialog-actions">
            <button type="button" className="users-secondary" onClick={() => setPending(null)}>
              Hủy
            </button>
            <button
              type="button"
              className="users-primary"
              // A list request still in flight could reach the server after the reset and, for
              // an own reset, trigger MUST_CHANGE_PASSWORD: wait for it.
              disabled={busy || loading}
              onClick={() =>
                void run(async () => {
                  setNotice('');
                  const r = await api<{ temporaryPassword: string }>(
                    `/admin/users/${user.id}/reset-password`,
                    {},
                  );
                  const self = user.id === selfId;
                  setSecret({
                    seq: ++secretSeq,
                    username: user.username,
                    password: r.temporaryPassword,
                    self,
                  });
                  setNotice(`Đã đặt lại mật khẩu cho ${user.username}.`);
                  return !self;
                })
              }
            >
              Đặt lại mật khẩu
            </button>
          </div>
        </Dialog>
      )}
      {pending?.kind === 'delete' && user && (
        <DeleteDialog
          user={user}
          busy={busy}
          error={actionError}
          onClose={() => setPending(null)}
          onDelete={(confirmUsername) =>
            run(async () => {
              setNotice('');
              await api(`/admin/users/${user.id}`, { confirmUsername }, undefined, 'DELETE');
              setNotice(`Đã xóa ${user.username}.`);
              // The row (and the button that opened the dialog) goes away with the refresh.
              focusHead.current = true;
            })
          }
        />
      )}
    </div>
  );
}

/** Shows a one-time password with a copy button; the caller forgets it on close. */
function SecretPanel({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null),
    code = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState('');
  const titleId = useId();
  useEffect(() => ref.current?.focus(), []);
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(secret.password);
        setCopied('Đã sao chép.');
        return;
      }
    } catch {
      // Clipboard refused (permissions, insecure context): fall back to a selection.
    }
    const selection = window.getSelection();
    if (selection && code.current) selection.selectAllChildren(code.current);
    setCopied('Đã chọn sẵn mật khẩu: nhấn Ctrl+C (trên điện thoại: chạm giữ để sao chép).');
  }
  return (
    <section ref={ref} className="users-reveal" tabIndex={-1} aria-labelledby={titleId}>
      <h2 id={titleId}>Mật khẩu tạm cho {secret.username}</h2>
      <code ref={code} className="users-secret" translate="no">
        {secret.password}
      </code>
      <p className="users-warning">{secret.self ? ONCE_SELF : ONCE}</p>
      <div className="users-dialog-actions">
        <button type="button" className="users-secondary" onClick={() => void copy()}>
          Sao chép
        </button>
        <button
          type="button"
          className="users-secondary"
          onClick={() => {
            window.getSelection()?.removeAllRanges();
            onClose();
          }}
        >
          Đóng
        </button>
      </div>
      <p className="users-copied" role="status">
        {copied}
      </p>
    </section>
  );
}

interface CreateBody {
  role: string;
  username: string;
  displayName?: string;
  password: string;
  mustChangePassword: boolean;
}
function CreateDialog({
  busy,
  error,
  onClose,
  onCreate,
}: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (body: CreateBody, generated: boolean) => Promise<void>;
}) {
  const [role, setRole] = useState<string>('student'),
    [username, setUsername] = useState(''),
    [displayName, setDisplayName] = useState(''),
    [password, setPassword] = useState(''),
    [auto, setAuto] = useState(false),
    [mustChange, setMustChange] = useState(true),
    [errors, setErrors] = useState<{ username?: string; displayName?: string; password?: string }>(
      {},
    );
  const ids = useId();
  const min = minPasswordLength(role);
  function submit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim(),
      display = displayName.trim();
    const next: typeof errors = {};
    if (!USERNAME.test(name))
      next.username =
        'Tên đăng nhập gồm 3–50 ký tự: chữ không dấu, số, dấu gạch dưới (_) hoặc gạch ngang (-).';
    if (display.length > 80) next.displayName = 'Tên hiển thị tối đa 80 ký tự.';
    if (!auto && password.length < min) next.password = `Mật khẩu cần ít nhất ${min} ký tự.`;
    else if (!auto && password.length > 150) next.password = 'Mật khẩu tối đa 150 ký tự.';
    setErrors(next);
    if (Object.keys(next).length) return;
    void onCreate(
      {
        role,
        username: name,
        ...(display ? { displayName: display } : {}),
        password: auto ? generatePassword(role) : password,
        mustChangePassword: auto || mustChange,
      },
      auto,
    );
  }
  const describe = (key: keyof typeof errors, hint?: string) =>
    [errors[key] ? ids + key : '', hint ?? ''].filter(Boolean).join(' ') || undefined;
  return (
    <Dialog title="Tạo người dùng" onClose={onClose}>
      <form className="users-form" onSubmit={submit} noValidate>
        <label className="users-field">
          Vai trò
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {CREATABLE.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="users-field">
          Tên đăng nhập
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={50}
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={describe('username')}
          />
        </label>
        {errors.username && (
          <p className="users-field-error" id={ids + 'username'}>
            {errors.username}
          </p>
        )}
        <label className="users-field">
          Tên hiển thị (không bắt buộc)
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
            maxLength={80}
            aria-invalid={errors.displayName ? true : undefined}
            aria-describedby={describe('displayName')}
          />
        </label>
        {errors.displayName && (
          <p className="users-field-error" id={ids + 'displayName'}>
            {errors.displayName}
          </p>
        )}
        {auto ? (
          <div className="users-auto">
            <p>
              Mật khẩu ({role === 'student' ? 12 : 20} ký tự) sẽ được tạo tự động và hiện một lần
              sau khi tạo. Người dùng phải đổi nó ở lần đăng nhập đầu.
            </p>
            <button type="button" className="users-secondary" onClick={() => setAuto(false)}>
              Tự nhập mật khẩu
            </button>
          </div>
        ) : (
          <>
            <div className="users-password">
              <label className="users-field">
                Mật khẩu
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={describe('password', ids + 'hint')}
                />
              </label>
              <button
                type="button"
                className="users-secondary"
                onClick={() => {
                  setPassword('');
                  setErrors((x) => ({ ...x, password: undefined }));
                  setAuto(true);
                }}
              >
                Tạo tự động
              </button>
            </div>
            <p className="users-hint" id={ids + 'hint'}>
              Ít nhất {min} ký tự cho vai trò {ROLE_LABEL[role]}.
            </p>
            {errors.password && (
              <p className="users-field-error" id={ids + 'password'}>
                {errors.password}
              </p>
            )}
            <label className="users-check">
              <input
                type="checkbox"
                checked={mustChange}
                onChange={(e) => setMustChange(e.target.checked)}
              />
              Yêu cầu đổi mật khẩu ở lần đăng nhập đầu
            </label>
          </>
        )}
        {error && <ErrorNote message={error} />}
        <div className="users-dialog-actions">
          <button type="button" className="users-secondary" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="users-primary" disabled={busy}>
            {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({
  user,
  busy,
  error,
  onClose,
  onDelete,
}: {
  user: AdminUserRow;
  busy: boolean;
  error: string;
  onClose: () => void;
  onDelete: (confirmUsername: string) => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toLowerCase() === user.username.toLowerCase();
  return (
    <Dialog title={`Xóa ${user.username}?`} onClose={onClose}>
      <p className="users-warning">
        Khóa thường tốt hơn xóa; xóa sẽ mất tiến độ học của người này.
      </p>
      <label className="users-field">
        Gõ lại tên đăng nhập “{user.username}” để xác nhận
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      {error && <ErrorNote message={error} />}
      <div className="users-dialog-actions">
        <button type="button" className="users-secondary" onClick={onClose}>
          Hủy
        </button>
        <button
          type="button"
          className="users-primary"
          disabled={!matches || busy}
          onClick={() => void onDelete(typed.trim())}
        >
          Xóa vĩnh viễn
        </button>
      </div>
    </Dialog>
  );
}
