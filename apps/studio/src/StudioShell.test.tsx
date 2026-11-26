import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StudioShell } from './StudioShell';
import type { StudioKind } from './role';
import { mount, unmountAll } from '@web/learner/testDom';

function shell(tone: 'deep' | 'ice', kind: StudioKind, route = 'library') {
  const host = document.createElement('div');
  host.innerHTML = renderToString(
    <StudioShell route={route} tone={tone} kind={kind} onLogout={() => {}}>
      <p>nội dung</p>
    </StudioShell>,
  );
  return host;
}
const toggle = (host: HTMLElement) => host.querySelector('[aria-label^="Chuyển sang giao diện"]');
const navLabels = (host: HTMLElement) =>
  [...host.querySelectorAll('nav a')].map((a) => a.textContent?.trim());

function desktop(kind: StudioKind, route = 'library') {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q === '(min-width: 900px)',
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  return mount(
    <StudioShell route={route} tone="ice" kind={kind} onLogout={() => {}}>
      <p>nội dung</p>
    </StudioShell>,
  );
}
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});

describe('StudioShell brand and theme', () => {
  it('names the app Seafood Deck Studio', () => {
    expect(shell('ice', 'staff').querySelector('.shell-wordmark')?.textContent).toBe(
      'Seafood Deck Studio',
    );
  });
  it('shows the theme toggle on ice screens only', () => {
    expect(toggle(shell('ice', 'staff'))).not.toBeNull();
    const host = shell('deep', 'staff');
    expect(toggle(host)).toBeNull();
    expect(host.querySelector('[aria-label="Đăng xuất"]')).not.toBeNull();
  });
});

describe('StudioShell navigation by kind (phone)', () => {
  it('staff: Quản trị and Thư viện in one bottom bar; no account, no learner tabs', () => {
    const host = shell('ice', 'staff', 'admin');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Quản trị', 'Thư viện']);
    expect(host.querySelector('nav a[href="#admin"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('a[href="#account"], a[href="#home"], a[href="#study"]')).toBeNull();
  });
  it('manager: Học viên, Thư viện and Tài khoản; learner details keep Học viên current', () => {
    const host = shell('ice', 'manager', 'manager/learner/x');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Học viên', 'Thư viện', 'Tài khoản']);
    expect(host.querySelector('nav a[href="#manager"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('a[href="#admin"]')).toBeNull();
  });
  it('manager: on #account the Tài khoản tab is current', () => {
    const host = shell('deep', 'manager', 'account');
    expect(host.querySelector('nav a[href="#account"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelectorAll('nav [aria-current]')).toHaveLength(1);
  });
  it('admin: Quản trị, Người dùng, Học viên and Thư viện; the users screen marks Người dùng', () => {
    const host = shell('ice', 'admin', 'admin/users');
    expect(navLabels(host)).toEqual(['Quản trị', 'Người dùng', 'Học viên', 'Thư viện']);
    expect(host.querySelector('nav a[href="#admin/users"]')?.getAttribute('aria-current')).toBe(
      'page',
    );
    expect(host.querySelector('a[href="#account"]')).toBeNull();
  });
  it('a species profile keeps Thư viện current', () => {
    const host = shell('deep', 'staff', 'profile/x');
    expect(host.querySelector('nav a[href="#library"]')?.getAttribute('aria-current')).toBe('page');
  });
  it('guest: no navigation and no logout', () => {
    const host = shell('deep', 'guest', 'home');
    expect(host.querySelectorAll('nav')).toHaveLength(0);
    expect(host.querySelector('[aria-label="Đăng xuất"]')).toBeNull();
  });
  it('signed in but on the forced password screen: no navigation and no tabs', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(
      <StudioShell route="admin" tone="deep" kind="admin" signedIn={false} onLogout={() => {}}>
        <p />
      </StudioShell>,
    );
    expect(host.querySelectorAll('nav')).toHaveLength(0);
    expect(host.querySelector('[aria-label="Đăng xuất"]')).toBeNull();
  });
});

describe('StudioShell navigation by kind (desktop)', () => {
  it('staff: one top nav with Quản trị and Thư viện', () => {
    const host = desktop('staff');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(host.querySelector('.shell-tabbar')).toBeNull();
    expect(navLabels(host)).toEqual(['Quản trị', 'Thư viện']);
  });
  it('manager: Học viên, Thư viện and Tài khoản in one top nav', () => {
    const host = desktop('manager', 'manager');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Học viên', 'Thư viện', 'Tài khoản']);
    expect(host.querySelector('nav a[href="#manager"]')?.getAttribute('aria-current')).toBe('page');
  });
  it('admin: Quản trị, Người dùng, Học viên, Thư viện; Quản trị current on the content page', () => {
    const host = desktop('admin', 'admin');
    expect(navLabels(host)).toEqual(['Quản trị', 'Người dùng', 'Học viên', 'Thư viện']);
    expect(host.querySelector('nav a[href="#admin"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelectorAll('nav [aria-current]')).toHaveLength(1);
  });
});
