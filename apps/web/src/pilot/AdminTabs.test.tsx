import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AdminTabs } from './AdminTabs';
import { mount, unmountAll } from '../learner/testDom';

afterEach(unmountAll);
const links = (host: HTMLElement) =>
  [...host.querySelectorAll('nav a')].map((a) => [a.textContent, a.getAttribute('href')]);

describe('AdminTabs', () => {
  it('has Nội dung, Người dùng and Học viên (the manager table)', () => {
    const host = mount(<AdminTabs current="content" />);
    expect(links(host)).toEqual([
      ['Nội dung', '#admin'],
      ['Người dùng', '#admin/users'],
      ['Học viên', '#manager'],
    ]);
    expect(host.querySelector('a[aria-current="page"]')?.textContent).toBe('Nội dung');
  });
  it('marks Học viên current on the manager table', () => {
    const host = mount(<AdminTabs current="learners" />);
    expect(host.querySelector('a[aria-current="page"]')?.textContent).toBe('Học viên');
  });
  it('turns every tab into an inert span while disabled', () => {
    const host = mount(<AdminTabs current="users" disabled />);
    expect(host.querySelectorAll('nav a')).toHaveLength(0);
    expect(host.querySelectorAll('nav span[aria-disabled="true"]')).toHaveLength(3);
  });
  it('marks the current tab in ink: salmon on ice is under 3:1', () => {
    const css = readFileSync(resolve(__dirname, 'users.css'), 'utf8');
    const rule = css.match(/\.admin-tabs a\[aria-current='page'\],[^{]*\{[^}]*\}/)![0];
    expect(rule).toMatch(/border-bottom-color:\s*var\(--ice-ink\)/);
  });
});
