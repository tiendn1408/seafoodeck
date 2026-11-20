import type { AuthView } from '../pilot/api';

/** `admin` is staff-like (content area, no /me/*) and also manages accounts. */
export type Kind = 'guest' | 'trial' | 'student' | 'manager' | 'staff' | 'admin';

export function kindOf(auth: AuthView | null): Kind {
  switch (auth?.role) {
    case 'learner':
      return 'trial';
    case 'student':
      return 'student';
    case 'manager':
      return 'manager';
    case 'admin':
      return 'admin';
    case 'editor':
    case 'reviewer':
    case 'publisher':
      return 'staff';
    default:
      return 'guest';
  }
}

const LEARNING = ['home', 'library', 'review', 'progress', 'study'];
const ALLOWED: Record<Exclude<Kind, 'guest'>, string[]> = {
  student: [...LEARNING, 'account'],
  trial: ['home', 'library', 'study'],
  // Managers see a notice on home (never the learner Home) and can browse the library.
  manager: ['home', 'library'],
  // Staff browse and try the deck like a trial (no /me/*: it admits account students only).
  staff: ['home', 'library', 'study', 'admin'],
  // Admins get the staff routes plus account management.
  admin: ['home', 'library', 'study', 'admin', 'admin/users'],
};

/** Every fixed route a signed-in kind may open (species profiles follow "library"). */
export function routesFor(kind: Kind): string[] {
  return kind === 'guest' ? [] : [...ALLOWED[kind]];
}

/** Whether a signed-in kind may open a hash route; profiles follow the library. Guests are handled by the login screens. */
export function routeAllowed(kind: Kind, route: string): boolean {
  if (kind === 'guest') return true;
  const list = ALLOWED[kind];
  if (route.startsWith('profile/')) return list.includes('library');
  return list.includes(route);
}
