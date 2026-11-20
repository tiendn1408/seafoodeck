import type { AuthView } from '../pilot/api';

export type Kind = 'guest' | 'trial' | 'student' | 'manager' | 'staff';

export function kindOf(auth: AuthView | null): Kind {
  switch (auth?.role) {
    case undefined:
    case 'guest':
      return 'guest';
    case 'learner':
      return 'trial';
    case 'student':
      return 'student';
    case 'manager':
      return 'manager';
    default:
      return 'staff';
  }
}
