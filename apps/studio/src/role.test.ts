import { describe, expect, it } from 'vitest';
import type { AuthView } from '@web/pilot/api';
import { homeOf, kindOf, routeAllowed, routesFor, tabFor, tabsFor, type StudioKind } from './role';

const auth = (role: string): AuthView => ({ role, internal: false, csrf: 'c', expiresAt: '' });

describe('kindOf', () => {
  it('maps the studio roles to a kind; learner roles and unknown roles are guests here', () => {
    expect(kindOf(null)).toBe('guest');
    expect(kindOf(auth('guest'))).toBe('guest');
    expect(kindOf(auth('manager'))).toBe('manager');
    expect(kindOf(auth('admin'))).toBe('admin');
    for (const r of ['editor', 'reviewer', 'publisher']) expect(kindOf(auth(r))).toBe('staff');
    // A learner session never belongs on the Studio host: it is treated as signed out.
    expect(kindOf(auth('learner'))).toBe('guest');
    expect(kindOf(auth('student'))).toBe('guest');
    expect(kindOf(auth('wizard'))).toBe('guest');
    expect(kindOf(auth(''))).toBe('guest');
  });
});

describe('routeAllowed', () => {
  it('managers get the learner table, details, the library and their account; no study or admin', () => {
    for (const r of ['manager', 'manager/learner/x', 'library', 'profile/x', 'account'])
      expect(routeAllowed('manager', r), r).toBe(true);
    for (const r of ['home', 'study', 'review', 'progress', 'admin', 'admin/users', 'manager/x'])
      expect(routeAllowed('manager', r), r).toBe(false);
  });
  it('only managers and admins may open the manager routes', () => {
    expect(routeAllowed('staff', 'manager')).toBe(false);
    expect(routeAllowed('staff', 'manager/learner/x')).toBe(false);
    for (const kind of ['manager', 'admin'] as StudioKind[])
      for (const r of ['manager', 'manager/learner/x'])
        expect(routeAllowed(kind, r), `${kind} ${r}`).toBe(true);
  });
  it('staff get the content area and the library (with profiles); no /me-backed pages, no study', () => {
    for (const r of ['admin', 'library', 'profile/x']) expect(routeAllowed('staff', r)).toBe(true);
    for (const r of ['home', 'study', 'review', 'progress', 'account', 'admin/users'])
      expect(routeAllowed('staff', r), r).toBe(false);
  });
  it('admins get the content area, users, learners and the library; still no /me-backed pages', () => {
    for (const r of [
      'admin',
      'admin/users',
      'manager',
      'manager/learner/x',
      'library',
      'profile/x',
    ])
      expect(routeAllowed('admin', r), r).toBe(true);
    for (const r of ['home', 'study', 'review', 'progress', 'account'])
      expect(routeAllowed('admin', r), r).toBe(false);
  });
  it('only admins may open admin/users', () => {
    const table: [StudioKind, boolean][] = [
      ['admin', true],
      ['staff', false],
      ['manager', false],
    ];
    for (const [kind, allowed] of table) {
      expect(routeAllowed(kind, 'admin/users'), kind).toBe(allowed);
      expect(routesFor(kind).includes('admin/users'), kind).toBe(allowed);
    }
  });
  it('no kind has a study route in the Studio app', () => {
    for (const kind of ['staff', 'manager', 'admin'] as StudioKind[]) {
      expect(routeAllowed(kind, 'study'), kind).toBe(false);
      expect(routesFor(kind)).not.toContain('study');
    }
  });
  it('routesFor lists the fixed routes per kind; homeOf is the first', () => {
    expect(routesFor('admin')).toEqual(['admin', 'admin/users', 'manager', 'library']);
    expect(routesFor('manager')).toEqual(['manager', 'library', 'account']);
    expect(routesFor('staff')).toEqual(['admin', 'library']);
    expect(routesFor('guest')).toEqual([]);
    expect(homeOf('admin')).toBe('admin');
    expect(homeOf('staff')).toBe('admin');
    expect(homeOf('manager')).toBe('manager');
  });
});

describe('tabs', () => {
  const labels = (kind: StudioKind) => tabsFor(kind).map((t) => t.label);
  it('each kind has exactly its tabs', () => {
    expect(labels('staff')).toEqual(['Quản trị', 'Thư viện']);
    expect(labels('manager')).toEqual(['Học viên', 'Thư viện', 'Tài khoản']);
    expect(labels('admin')).toEqual(['Quản trị', 'Người dùng', 'Học viên', 'Thư viện']);
    expect(labels('guest')).toEqual([]);
  });
  it('every tab opens a route its kind may open', () => {
    for (const kind of ['staff', 'manager', 'admin'] as StudioKind[])
      for (const t of tabsFor(kind)) expect(routeAllowed(kind, t.id), `${kind} ${t.id}`).toBe(true);
  });
  it('sub-pages belong to their tab', () => {
    expect(tabFor('profile/x')).toBe('library');
    expect(tabFor('manager/learner/x')).toBe('manager');
    expect(tabFor('admin/users')).toBe('admin/users');
    expect(tabFor('admin')).toBe('admin');
    expect(tabFor('account')).toBe('account');
  });
});
