import type { AuthView } from '../pilot/api';

/** Who uses the learner app. Any other session is treated as signed out. */
export type Kind = 'guest' | 'trial' | 'student';

export function kindOf(auth: AuthView | null): Kind {
  switch (auth?.role) {
    case 'learner':
      return 'trial';
    case 'student':
      return 'student';
    default:
      return 'guest';
  }
}

const LEARNING = ['home', 'library', 'review', 'progress', 'study'];
const ALLOWED: Record<Exclude<Kind, 'guest'>, string[]> = {
  student: [...LEARNING, 'account'],
  trial: ['home', 'library', 'study'],
};

/** Every fixed route a signed-in kind may open (species profiles follow "library"). */
export function routesFor(kind: Kind): string[] {
  return kind === 'guest' ? [] : [...ALLOWED[kind]];
}

/** Whether a signed-in kind may open a hash route; profiles follow the library.
 * Guests are handled by the login screen. */
export function routeAllowed(kind: Kind, route: string): boolean {
  if (kind === 'guest') return true;
  const list = ALLOWED[kind];
  if (route.startsWith('profile/')) return list.includes('library');
  return list.includes(route);
}
