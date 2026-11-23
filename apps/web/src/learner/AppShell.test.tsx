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
  it('manager: account as a header icon (not a tab) with a 44px-capable icon button', () => {
    const host = shell('ice', 'manager', 'account');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Học viên', 'Thư viện']);
    const account = host.querySelector('.shell-actions a[href="#account"]');
    expect(account?.getAttribute('aria-label')).toBe('Tài khoản');
    expect(account?.className).toBe('shell-icon-button');
    expect(account?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('nav a[href="#account"]')).toBeNull();
    expect(host.querySelector('nav [aria-current]')).toBeNull();
  });
  it('staff and admin: no account entry', () => {
    for (const kind of ['staff', 'admin'] as Kind[])
      expect(shell('ice', kind).querySelector('a[href="#account"]')).toBeNull();
  });
  it('trial: Học and Thư viện only, no account entry', () => {
    const host = shell('deep', 'trial');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Học', 'Thư viện']);
    expect(host.querySelector('a[href="#account"]')).toBeNull();
  });
  it('manager: Học viên and Thư viện in one bottom bar', () => {
    const host = shell('ice', 'manager', 'manager');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Học viên', 'Thư viện']);
    expect(host.querySelector('nav a[href="#manager"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('nav a[href="#account"]')).toBeNull();
    expect(host.querySelector('a[href="#admin"]')).toBeNull();
  });
  it('staff: Học and Thư viện plus the admin shield icon (no Ôn tập / Tiến độ)', () => {
    const host = shell('ice', 'staff');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Học', 'Thư viện']);
    expect(host.querySelector('a[href="#review"], a[href="#progress"]')).toBeNull();
    expect(host.querySelector('.shell-actions a[href="#admin"]')).not.toBeNull();
    expect(host.querySelector('a[href="#account"]')).toBeNull();
  });
  it('admin: same as staff (Học, Thư viện, admin shield icon)', () => {
    const host = shell('ice', 'admin', 'admin/users');
    expect(navLabels(host)).toEqual(['Học', 'Thư viện']);
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
  it('manager: one top nav; account shown as icon + name beside logout', () => {
    const host = desktop('manager', 'account', 'Hà');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(navLabels(host)).toEqual(['Học viên', 'Thư viện']);
    const account = host.querySelector('.shell-actions a[href="#account"]');
    expect(account?.textContent).toContain('Hà');
    expect(account?.nextElementSibling?.getAttribute('aria-label')).toBe('Đăng xuất');
  });
  it('trial: Học and Thư viện', () => {
    expect(navLabels(desktop('trial'))).toEqual(['Học', 'Thư viện']);
  });
  it('manager: Học viên and Thư viện in one top nav; learner details keep Học viên current', () => {
    const host = desktop('manager', 'manager/learner/x');
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(host.querySelector('.shell-tabbar')).toBeNull();
    expect(navLabels(host)).toEqual(['Học viên', 'Thư viện']);
    expect(tabFor('manager/learner/x')).toBe('manager');
    expect(host.querySelector('nav a[href="#manager"]')?.getAttribute('aria-current')).toBe('page');
  });
  it('staff: Học, Thư viện plus Quản trị', () => {
    expect(navLabels(desktop('staff'))).toEqual(['Học', 'Thư viện', 'Quản trị']);
  });
  it('admin: Học, Thư viện plus Quản trị, current on the users screen too', () => {
    expect(tabFor('admin/users')).toBe('admin');
    const host = desktop('admin', 'admin/users');
    expect(navLabels(host)).toEqual(['Học', 'Thư viện', 'Quản trị']);
    expect(host.querySelector('nav a[href="#admin"]')?.getAttribute('aria-current')).toBe('page');
  });
  it('on #account no tab is current; the account entry is', () => {
    expect(tabFor('account')).toBe('account');
    const host = desktop('student', 'account', 'Lan');
    expect(host.querySelectorAll('nav [aria-current]')).toHaveLength(0);
    expect(host.querySelector('a[href="#account"]')?.getAttribute('aria-current')).toBe('page');
  });
});

describe('AppShell saving status on phones', () => {
  it('the status is capped and truncated at phone widths so the header does not crowd', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(__dirname, 'shell.css'), 'utf8');
    const rule = css.match(/\.shell\[data-layout='phone'\] \.shell-saving \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/max-width:\s*[\d.]+rem/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    // 360px minus gutters, mark, theme/account/logout buttons: well under the 7.5rem cap needs.
    expect(parseFloat(rule.match(/max-width:\s*([\d.]+)rem/)![1])).toBeLessThanOrEqual(8);
  });
});
