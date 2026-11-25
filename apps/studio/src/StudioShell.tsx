import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useMedia } from '@web/learner/useMedia';
import { ScaleMark, ThemeToggle } from '@web/learner/AppShell';
import { tabFor, tabsFor, type StudioKind } from './role';

/**
 * The Studio frame: the learner shell's look (same classes and tokens) with the Studio's own
 * brand and tabs per kind — a top nav on desktop, a bottom bar on phones.
 */
export function StudioShell({
  route,
  tone,
  kind,
  onLogout,
  signedIn = kind !== 'guest',
  children,
}: {
  route: string;
  tone: 'deep' | 'ice';
  kind: StudioKind;
  onLogout: () => void;
  /** False on the sign-in and forced password screens: no tabs, no logout. */
  signedIn?: boolean;
  children: ReactNode;
}) {
  const desktop = useMedia('(min-width: 900px)');
  const current = tabFor(route);
  const bar = signedIn ? tabsFor(kind) : [];
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
        <div className="shell-brand" data-wordmark="">
          <a className="shell-logo" href={'#' + (bar[0]?.id ?? 'home')}>
            <ScaleMark />
            <span className="shell-wordmark">Seafood Deck Studio</span>
          </a>
        </div>
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
          {tone === 'ice' && <ThemeToggle />}
          {signedIn && (
            <button
              type="button"
              className="shell-logout"
              aria-label="Đăng xuất"
              onClick={onLogout}
            >
              <LogOut size={19} aria-hidden="true" />
              <span className="shell-logout-text">Đăng xuất</span>
            </button>
          )}
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
