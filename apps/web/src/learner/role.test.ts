import { describe, expect, it } from 'vitest';
import type { AuthView } from '../pilot/api';
import { kindOf, routeAllowed, routesFor, type Kind } from './role';

const auth = (role: string): AuthView => ({ role, internal: false, csrf: 'c', expiresAt: '' });

describe('kindOf', () => {
  it('maps every role to a kind', () => {
    expect(kindOf(null)).toBe('guest');
    expect(kindOf(auth('guest'))).toBe('guest');
    expect(kindOf(auth('learner'))).toBe('trial');
    expect(kindOf(auth('student'))).toBe('student');
    expect(kindOf(auth('manager'))).toBe('manager');
    expect(kindOf(auth('admin'))).toBe('admin');
    for (const r of ['editor', 'reviewer', 'publisher']) expect(kindOf(auth(r))).toBe('staff');
    expect(kindOf(auth('wizard'))).toBe('guest');
    expect(kindOf(auth(''))).toBe('guest');
  });
});

describe('routeAllowed', () => {
  it('students get learning routes and their account, never admin', () => {
    for (const r of ['home', 'library', 'review', 'progress', 'study', 'profile/x', 'account'])
      expect(routeAllowed('student', r)).toBe(true);
    expect(routeAllowed('student', 'admin')).toBe(false);
  });
  it('trial learners only get Học and Thư viện (with study and profiles)', () => {
    for (const r of ['home', 'library', 'study', 'profile/x'])
      expect(routeAllowed('trial', r)).toBe(true);
    for (const r of ['review', 'progress', 'account', 'admin'])
      expect(routeAllowed('trial', r)).toBe(false);
  });
  it('managers get the learner table, learner details and the library; no study, /me pages or account', () => {
    for (const r of ['home', 'manager', 'manager/learner/x', 'library', 'profile/x'])
      expect(routeAllowed('manager', r), r).toBe(true);
    for (const r of ['study', 'review', 'progress', 'account', 'admin', 'admin/users', 'manager/x'])
      expect(routeAllowed('manager', r), r).toBe(false);
  });
  it('only managers and admins may open the manager routes', () => {
    for (const kind of ['student', 'trial', 'staff'] as Kind[])
      for (const r of ['manager', 'manager/learner/x'])
        expect(routeAllowed(kind, r), `${kind} ${r}`).toBe(false);
    for (const kind of ['manager', 'admin'] as Kind[])
      for (const r of ['manager', 'manager/learner/x'])
        expect(routeAllowed(kind, r), `${kind} ${r}`).toBe(true);
  });
  it('staff get Học, Thư viện (with study and profiles) and admin; no /me-backed pages', () => {
    for (const r of ['home', 'library', 'study', 'profile/x', 'admin'])
      expect(routeAllowed('staff', r)).toBe(true);
    // Review and progress read /me/*, which admits account students only (403 for staff).
    for (const r of ['review', 'progress', 'account']) expect(routeAllowed('staff', r)).toBe(false);
  });
  it('admins get what staff get plus the users screen; still no /me-backed pages', () => {
    for (const r of ['home', 'library', 'study', 'profile/x', 'admin', 'admin/users', 'manager'])
      expect(routeAllowed('admin', r)).toBe(true);
    for (const r of ['review', 'progress', 'account']) expect(routeAllowed('admin', r)).toBe(false);
  });
  it('only admins may open admin/users', () => {
    const table: [Kind, boolean][] = [
      ['admin', true],
      ['staff', false],
      ['manager', false],
      ['student', false],
      ['trial', false],
    ];
    for (const [kind, allowed] of table) {
      expect(routeAllowed(kind, 'admin/users'), kind).toBe(allowed);
      expect(routesFor(kind).includes('admin/users'), kind).toBe(allowed);
    }
  });
  it('routesFor lists the fixed routes per kind', () => {
    expect(routesFor('admin')).toEqual([
      'home',
      'library',
      'study',
      'admin',
      'admin/users',
      'manager',
    ]);
    expect(routesFor('manager')).toEqual(['home', 'manager', 'library']);
    expect(routesFor('staff')).toEqual(['home', 'library', 'study', 'admin']);
    expect(routesFor('guest')).toEqual([]);
  });
});
