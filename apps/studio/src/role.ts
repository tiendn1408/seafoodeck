import type { ComponentType } from 'react';
import { Library, ShieldCheck, UserCog, UserRound, Users } from 'lucide-react';
import type { AuthView } from '@web/pilot/api';

/**
 * Who is signed in to the Studio app. Learner roles never belong here (the API refuses their
 * login on this host); if such a session shows up anyway it is treated as signed out.
 */
export type StudioKind = 'guest' | 'staff' | 'manager' | 'admin';

export function kindOf(auth: AuthView | null): StudioKind {
  switch (auth?.role) {
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

/** Fixed routes per kind, home first. There is no study route: staff train on the learner site. */
const ROUTES: Record<Exclude<StudioKind, 'guest'>, string[]> = {
  // Content editing and the library (read-only; /me/* admits account students only).
  staff: ['admin', 'library'],
  // Learner table and details, the library and the manager's own account (GET/PATCH /me and
  // the password change only).
  manager: ['manager', 'library', 'account'],
  // Content, accounts and learners, plus the library.
  admin: ['admin', 'admin/users', 'manager', 'library'],
};

export function routesFor(kind: StudioKind): string[] {
  return kind === 'guest' ? [] : [...ROUTES[kind]];
}

/** Where a kind lands, and where a route it may not open sends it back to. */
export function homeOf(kind: Exclude<StudioKind, 'guest'>): string {
  return ROUTES[kind][0];
}

/** Whether a signed-in kind may open a hash route; profiles follow the library and learner
 * details follow the manager table. */
export function routeAllowed(kind: StudioKind, route: string): boolean {
  if (kind === 'guest') return false;
  const list = ROUTES[kind];
  if (route.startsWith('profile/')) return list.includes('library');
  if (route.startsWith('manager/learner/')) return list.includes('manager');
  return list.includes(route);
}

export interface Tab {
  id: string;
  label: string;
  Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>;
}
const TAB: Record<string, Tab> = {
  admin: { id: 'admin', label: 'Quản trị', Icon: ShieldCheck },
  users: { id: 'admin/users', label: 'Người dùng', Icon: UserCog },
  learners: { id: 'manager', label: 'Học viên', Icon: Users },
  library: { id: 'library', label: 'Thư viện', Icon: Library },
  account: { id: 'account', label: 'Tài khoản', Icon: UserRound },
};
const TABS: Record<StudioKind, readonly Tab[]> = {
  staff: [TAB.admin, TAB.library],
  manager: [TAB.learners, TAB.library, TAB.account],
  admin: [TAB.admin, TAB.users, TAB.learners, TAB.library],
  guest: [],
};

export function tabsFor(kind: StudioKind): readonly Tab[] {
  return TABS[kind];
}

/** Which tab owns a hash route: species profiles belong to "Thư viện", learner details to
 * "Học viên"; every other route is its own tab. */
export function tabFor(route: string): string {
  if (route.startsWith('profile/')) return 'library';
  if (route.startsWith('manager/')) return 'manager';
  return route;
}
