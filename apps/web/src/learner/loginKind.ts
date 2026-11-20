export type LoginKind = 'learner' | 'staff';

// Hiding the #admin route is obscurity only; real protection is the server's role checks and login limiter.
export function loginKind(route: string, role: string): LoginKind | null {
  if (role !== 'guest') return null;
  return route === 'admin' || route.startsWith('admin/') ? 'staff' : 'learner';
}
