import { useState, type ReactNode } from 'react';
import { BookOpen, Library, LogOut, Moon, RotateCcw, Sun, Target, UserRound } from 'lucide-react';
import { useMedia } from './useMedia';
import { getTheme, setTheme, type Theme } from './theme';
import type { Kind } from './role';

const tabs = [
  { id: 'home', label: 'Học', Icon: BookOpen },
  { id: 'library', label: 'Thư viện', Icon: Library },
  { id: 'review', label: 'Ôn tập', Icon: RotateCcw },
  { id: 'progress', label: 'Tiến độ', Icon: Target },
] as const;
type Tab = (typeof tabs)[number];
/** Tabs per kind. */
const tabsFor: Record<Kind, readonly Tab[]> = {
  student: tabs,
  // Ôn tập / Tiến độ read /me/*, which admits account students only.
  trial: tabs.slice(0, 2),
  guest: [],
};
/** Honest label for an internal release; phones show a shorter one, never a second line. */
const internalLabel = 'Bản kỹ thuật nội bộ · Nội dung chưa duyệt';

/** Which tab owns a hash route: study belongs to "Học", species profiles to "Thư viện".
 * "account" is owned by no tab: the header's account entry is marked current instead. */
export function tabFor(route: string): string {
  if (route === 'study') return 'home';
  if (route.startsWith('profile/')) return 'library';
  return route;
}

export function ScaleMark() {
  return (
    <svg className="shell-mark" viewBox="0 0 30 22" width="30" height="22" aria-hidden="true">
      <path d="M8 13a7 7 0 0 1 14 0" />
      <path d="M1.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M15.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function ThemeToggle() {
  const systemDark = useMedia('(prefers-color-scheme: dark)');
  const [choice, setChoice] = useState<Theme | null>(getTheme);
  const dark = (choice ?? (systemDark ? 'dark' : 'light')) === 'dark';
  return (
    <button
      type="button"
      className="shell-icon-button"
      aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={dark ? 'Giao diện sáng' : 'Giao diện tối'}
      onClick={() => {
        const next: Theme = dark ? 'light' : 'dark';
        setTheme(next);
        setChoice(next);
      }}
    >
      {dark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}

export function AppShell({
  route,
  tone,
  kind,
  userName,
  internal,
  onLogout,
  logoutBusy = false,
  signedIn = kind !== 'guest',
  children,
}: {
  route: string;
  tone: 'deep' | 'ice';
  kind: Kind;
  /** Display name for the student's account entry; falls back to "Tài khoản". */
  userName?: string;
  internal: boolean;
  onLogout: () => void;
  /** Logout is waiting for answers still being saved: the button is disabled and says so. */
  logoutBusy?: boolean;
  /** False on the sign-in and forced password screens: no tabs, no logout. */
  signedIn?: boolean;
  children: ReactNode;
}) {
  const desktop = useMedia('(min-width: 900px)');
  const current = tabFor(route);
  const bar = signedIn ? tabsFor[kind] : [];
  const accountLabel = userName?.trim() || 'Tài khoản';
  const account = signedIn && kind === 'student' && (
    <a
      className={desktop ? 'shell-account' : 'shell-icon-button'}
      href="#account"
      aria-current={route === 'account' ? 'page' : undefined}
      aria-label={desktop ? `Tài khoản: ${accountLabel}` : 'Tài khoản'}
      title={desktop ? undefined : 'Tài khoản'}
    >
      <UserRound size={20} aria-hidden="true" />
      {desktop && <span className="shell-account-name">{accountLabel}</span>}
    </a>
  );
  // Phone: the wordmark stays on Home and Profiles (the chip moves to a second line there);
  // elsewhere an internal release shows the mark and the chip on one compact row.
  const wordmark = route === 'home' || route.startsWith('profile/');
  const brand = (
    <div className="shell-brand" data-wordmark={wordmark ? '' : undefined}>
      <a className="shell-logo" href="#home">
        <ScaleMark />
        <span className="shell-wordmark">Seafood Deck</span>
      </a>
      {signedIn && internal && (
        <span className="shell-chip" title={internalLabel}>
          {desktop ? (
            internalLabel
          ) : (
            <>
              <span className="shell-chip-short" aria-hidden="true">
                Nội bộ · chưa duyệt
              </span>
              <span className="shell-chip-full">{internalLabel}</span>
            </>
          )}
        </span>
      )}
    </div>
  );
  const logout = signedIn && (
    <>
      {logoutBusy && (
        <span className="shell-saving" role="status">
          Đang lưu tiến độ…
        </span>
      )}
      <button
        type="button"
        className="shell-logout"
        aria-label="Đăng xuất"
        disabled={logoutBusy}
        onClick={onLogout}
      >
        <LogOut size={19} aria-hidden="true" />
        <span className="shell-logout-text">Đăng xuất</span>
      </button>
    </>
  );
  return (
    <div
      className="shell"
      data-tone={tone}
      data-layout={desktop ? 'desktop' : 'phone'}
      data-tabbar={!desktop && bar.length > 0 ? '' : undefined}
    >
      <a
        className="shell-skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Đến nội dung
      </a>
      <header className="shell-header">
        {brand}
        {desktop && bar.length > 0 && (
          <nav className="shell-tabs" aria-label="Điều hướng chính">
            {bar.map(({ id, label }) => (
              <a
                key={id}
                href={'#' + id}
                aria-current={current === id ? 'page' : undefined}
                className="shell-tab"
              >
                {label}
              </a>
            ))}
          </nav>
        )}
        <div className="shell-actions">
          {/* Deep screens never change with the theme, so the toggle only lives on ice. */}
          {tone === 'ice' && <ThemeToggle />}
          {account}
          {logout}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="shell-main">
        {children}
      </main>
      {!desktop && bar.length > 0 && (
        <nav className="shell-tabbar" aria-label="Điều hướng chính">
          {bar.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={'#' + id}
              aria-current={current === id ? 'page' : undefined}
              className="shell-tabbar-item"
            >
              <Icon size={22} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
