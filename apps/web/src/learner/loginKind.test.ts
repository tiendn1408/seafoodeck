import { describe, expect, it } from 'vitest';
import { loginKind } from './loginKind';

describe('loginKind', () => {
  it('shows the learner login to guests on any route but admin', () => {
    for (const r of ['home', 'library', 'study', 'profile/x', 'administrator'])
      expect(loginKind(r, 'guest')).toBe('learner');
  });
  it('shows the staff login to guests on #admin and the admin sub-pages', () => {
    expect(loginKind('admin', 'guest')).toBe('staff');
    expect(loginKind('admin/users', 'guest')).toBe('staff');
  });
  it('shows no login once signed in', () => {
    for (const role of ['learner', 'admin', 'editor']) expect(loginKind('admin', role)).toBeNull();
  });
});
