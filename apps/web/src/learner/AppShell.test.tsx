import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AppShell, tabFor } from './AppShell';
import type { Kind } from './role';
import { mount, unmountAll } from './testDom';

function shell(tone: 'deep' | 'ice', kind: Kind = 'student', route = 'home') {
  const host = document.createElement('div');
  host.innerHTML = renderToString(
    <AppShell route={route} tone={tone} kind={kind} internal={false} onLogout={() => {}}>
      <p>nội dung</p>
    </AppShell>,
  );
  return host;
}
const toggle = (host: HTMLElement) => host.querySelector('[aria-label^="Chuyển sang giao diện"]');
const navLabels = (host: HTMLElement) =>
  [...host.querySelectorAll('nav a')].map((a) => a.textContent?.trim());

function desktop(kind: Kind, route = 'home', userName?: string) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q === '(min-width: 900px)',
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  return mount(
    <AppShell
      route={route}
      tone="ice"
      kind={kind}
      userName={userName}
      internal={false}
      signedIn={kind !== 'guest'}
      onLogout={() => {}}
    >
      <p>nội dung</p>
    </AppShell>,
  );
}
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});

describe('AppShell theme toggle', () => {
  it('shows on ice screens, where the theme applies', () => {
    expect(toggle(shell('ice'))).not.toBeNull();
  });
  it('is hidden on deep screens, which never change with the theme', () => {
    const host = shell('deep');
    expect(toggle(host)).toBeNull();
    expect(host.querySelector('[aria-label="Đăng xuất"]')).not.toBeNull();
  });
});

describe('AppShell navigation by kind (phone)', () => {
  it('student: four tabs in the bottom bar, account as a header icon, not a fifth tab', () => {
    const host = shell('deep', 'student');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Học', 'Thư viện', 'Ôn tập', 'Tiến độ']);
    const account = host.querySelector('.shell-actions a[href="#account"]');
    expect(account?.getAttribute('aria-label')).toBe('Tài khoản');
    expect(host.querySelector('nav a[href="#account"]')).toBeNull();
  });
  it('trial: Học and Thư viện only, no account entry', () => {
    const host = shell('deep', 'trial');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Học', 'Thư viện']);
    expect(host.querySelector('a[href="#account"]')).toBeNull();
  });
  it('manager: Thư viện only', () => {
    const host = shell('deep', 'manager');
    expect(navLabels(host)).toEqual(['Thư viện']);
    expect(host.querySelector('a[href="#account"]')).toBeNull();
    expect(host.querySelector('a[href="#admin"]')).toBeNull();
  });
  it('staff: today’s four tabs plus the admin shield icon', () => {
    const host = shell('ice', 'staff');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Học', 'Thư viện', 'Ôn tập', 'Tiến độ']);
    expect(host.querySelector('.shell-actions a[href="#admin"]')).not.toBeNull();
    expect(host.querySelector('a[href="#account"]')).toBeNull();
  });
  it('guest: no navigation and no logout', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(
      <AppShell route="home" tone="deep" kind="guest" internal={false} onLogout={() => {}}>
        <p />
      </AppShell>,
    );
    expect(host.querySelectorAll('nav')).toHaveLength(0);
    expect(host.querySelector('[aria-label="Đăng xuất"]')).toBeNull();
  });
});

describe('AppShell navigation by kind (desktop)', () => {
  it('student: one top nav, account shown as icon + name beside logout', () => {
    const host = desktop('student', 'home', 'Lan');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(host.querySelector('.shell-tabbar')).toBeNull();
    expect(navLabels(host)).toEqual(['Học', 'Thư viện', 'Ôn tập', 'Tiến độ']);
    const account = host.querySelector('.shell-actions a[href="#account"]');
    expect(account?.textContent).toContain('Lan');
    expect(account?.nextElementSibling?.getAttribute('aria-label')).toBe('Đăng xuất');
  });
  it('student without a display name falls back to "Tài khoản"', () => {
    const host = desktop('student');
    expect(host.querySelector('a[href="#account"]')?.textContent).toContain('Tài khoản');
  });
  it('trial / manager / staff tabs', () => {
    expect(navLabels(desktop('trial'))).toEqual(['Học', 'Thư viện']);
    unmountAll();
    expect(navLabels(desktop('manager'))).toEqual(['Thư viện']);
    unmountAll();
    expect(navLabels(desktop('staff'))).toEqual([
      'Học',
      'Thư viện',
      'Ôn tập',
      'Tiến độ',
      'Quản trị',
    ]);
  });
  it('on #account no tab is current; the account entry is', () => {
    expect(tabFor('account')).toBe('account');
    const host = desktop('student', 'account', 'Lan');
    expect(host.querySelectorAll('nav [aria-current]')).toHaveLength(0);
    expect(host.querySelector('a[href="#account"]')?.getAttribute('aria-current')).toBe('page');
  });
});
