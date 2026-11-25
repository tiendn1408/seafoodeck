import { describe, expect, it } from 'vitest';
import type { AuthView } from '../pilot/api';
import { kindOf, routeAllowed, routesFor, type Kind } from './role';

const auth = (role: string): AuthView => ({ role, internal: false, csrf: 'c', expiresAt: '' });

describe('kindOf', () => {
  it('maps the learner roles to a kind; every other role is a guest here', () => {
    expect(kindOf(null)).toBe('guest');
    expect(kindOf(auth('guest'))).toBe('guest');
    expect(kindOf(auth('learner'))).toBe('trial');
    expect(kindOf(auth('student'))).toBe('student');
    for (const r of ['editor', 'reviewer', 'publisher', 'manager', 'admin', 'wizard', ''])
      expect(kindOf(auth(r)), r).toBe('guest');
  });
});

describe('routeAllowed', () => {
  it('students get learning routes and their account', () => {
    for (const r of ['home', 'library', 'review', 'progress', 'study', 'profile/x', 'account'])
      expect(routeAllowed('student', r)).toBe(true);
  });
  it('trial learners only get Học and Thư viện (with study and profiles)', () => {
    for (const r of ['home', 'library', 'study', 'profile/x'])
      expect(routeAllowed('trial', r)).toBe(true);
    for (const r of ['review', 'progress', 'account']) expect(routeAllowed('trial', r)).toBe(false);
  });
  it('no learner kind opens a route outside the learning area', () => {
    for (const kind of ['student', 'trial'] as Kind[])
      for (const r of ['admin', 'admin/users', 'manager', 'manager/learner/x', 'x'])
        expect(routeAllowed(kind, r), `${kind} ${r}`).toBe(false);
  });
  it('routesFor lists the fixed routes per kind', () => {
    expect(routesFor('student')).toEqual([
      'home',
      'library',
      'review',
      'progress',
      'study',
      'account',
    ]);
    expect(routesFor('trial')).toEqual(['home', 'library', 'study']);
    expect(routesFor('guest')).toEqual([]);
  });
});
