import { useState, type ReactNode } from 'react';
import { BookOpen, Library, LogOut, Moon, RotateCcw, ShieldCheck, Sun, Target } from 'lucide-react';
import { useMedia } from './useMedia';
import { getTheme, setTheme, type Theme } from './theme';

const tabs = [
  { id: 'home', label: 'Học', Icon: BookOpen },
  { id: 'library', label: 'Thư viện', Icon: Library },
  { id: 'review', label: 'Ôn tập', Icon: RotateCcw },
  { id: 'progress', label: 'Tiến độ', Icon: Target },
] as const;
const adminTab = { id: 'admin', label: 'Quản trị', Icon: ShieldCheck } as const;

/** Which tab owns a hash route: study belongs to "Học", species profiles to "Thư viện". */
export function tabFor(route: string): string {
  if (route === 'study') return 'home';
  if (route.startsWith('profile/')) return 'library';
  return route;
}

function ScaleMark() {
  return (
    <svg className="shell-mark" viewBox="0 0 30 22" width="30" height="22" aria-hidden="true">
      <path d="M8 13a7 7 0 0 1 14 0" />
      <path d="M1.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M15.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function ThemeToggle() {
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
  staff,
  internal,
  onLogout,
  signedIn = true,
  children,
}: {
  route: string;
  tone: 'deep' | 'ice';
  staff: boolean;
  internal: boolean;
  onLogout: () => void;
  /** False on the sign-in screen: no tabs, no logout. */
  signedIn?: boolean;
  children: ReactNode;
}) {
  const desktop = useMedia('(min-width: 900px)');
  const current = tabFor(route);
  const links = signedIn ? [...tabs, ...(staff ? [adminTab] : [])] : [];
  const brand = (
    <div className="shell-brand">
      <a className="shell-logo" href="#home">
        <ScaleMark />
        <span>Seafood Deck</span>
      </a>
      {signedIn && internal && (
        <span className="shell-chip">Bản kỹ thuật nội bộ · Nội dung chưa duyệt</span>
      )}
    </div>
  );
  const logout = signedIn && (
    <button type="button" className="shell-logout" aria-label="Đăng xuất" onClick={onLogout}>
      <LogOut size={19} aria-hidden="true" />
      <span className="shell-logout-text">Đăng xuất</span>
    </button>
  );
  return (
    <div
      className="shell"
      data-tone={tone}
      data-layout={desktop ? 'desktop' : 'phone'}
      data-tabbar={!desktop && signedIn ? '' : undefined}
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
        {desktop && links.length > 0 && (
          <nav className="shell-tabs" aria-label="Điều hướng chính">
            {links.map(({ id, label }) => (
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
          {!desktop && signedIn && staff && (
            <a className="shell-icon-button" href="#admin" aria-label="Quản trị" title="Quản trị">
              <ShieldCheck size={20} aria-hidden="true" />
            </a>
          )}
          <ThemeToggle />
          {logout}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="shell-main">
        {children}
      </main>
      {!desktop && signedIn && (
        <nav className="shell-tabbar" aria-label="Điều hướng chính">
          {tabs.map(({ id, label, Icon }) => (
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
