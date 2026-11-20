import type { AuthView } from '../pilot/api';

export type Kind = 'guest' | 'trial' | 'student' | 'manager' | 'staff';

export function kindOf(auth: AuthView | null): Kind {
  switch (auth?.role) {
    case 'learner':
      return 'trial';
    case 'student':
      return 'student';
    case 'manager':
      return 'manager';
    case 'admin':
    case 'editor':
    case 'reviewer':
    case 'publisher':
      return 'staff';
    default:
      return 'guest';
  }
}
