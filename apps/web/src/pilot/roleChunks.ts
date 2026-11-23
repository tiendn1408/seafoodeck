/**
 * The staff and manager screens, each loaded as its own chunk so learners never download them.
 * Only `lazyScreen` in PilotApp calls these, and only once the route is permitted for the
 * signed-in kind. Kept in one object so tests can count the loads.
 */
export const roleChunks = {
  admin: () => import('./Admin').then((m) => m.Admin),
  users: () => import('./UsersAdmin').then((m) => m.UsersAdmin),
  learners: () => import('../manager/ManagerLearners').then((m) => m.ManagerLearners),
  learner: () => import('../manager/ManagerLearnerDetail').then((m) => m.ManagerLearnerDetail),
};
