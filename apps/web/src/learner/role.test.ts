import { describe, expect, it } from 'vitest';
import type { AuthView } from '../pilot/api';
import { kindOf, routeAllowed } from './role';

const auth = (role: string): AuthView => ({ role, internal: false, csrf: 'c', expiresAt: '' });

describe('kindOf', () => {
  it('maps every role to a kind', () => {
    expect(kindOf(null)).toBe('guest');
    expect(kindOf(auth('guest'))).toBe('guest');
    expect(kindOf(auth('learner'))).toBe('trial');
    expect(kindOf(auth('student'))).toBe('student');
    expect(kindOf(auth('manager'))).toBe('manager');
    for (const r of ['admin', 'editor', 'reviewer', 'publisher'])
      expect(kindOf(auth(r))).toBe('staff');
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
  it('managers get the notice on home and the library only', () => {
    for (const r of ['home', 'library', 'profile/x']) expect(routeAllowed('manager', r)).toBe(true);
    for (const r of ['study', 'review', 'progress', 'account', 'admin'])
      expect(routeAllowed('manager', r)).toBe(false);
  });
  it('staff get Học, Thư viện (with study and profiles) and admin; no /me-backed pages', () => {
    for (const r of ['home', 'library', 'study', 'profile/x', 'admin'])
      expect(routeAllowed('staff', r)).toBe(true);
    // Review and progress read /me/*, which admits account students only (403 for staff).
    for (const r of ['review', 'progress', 'account']) expect(routeAllowed('staff', r)).toBe(false);
  });
});
