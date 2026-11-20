import { describe, expect, it } from 'vitest';
import type { AuthView } from '../pilot/api';
import { kindOf } from './role';

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
