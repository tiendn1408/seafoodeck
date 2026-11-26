/** Studio-only API types: admin and manager endpoints. The client itself is `@web/pilot/api`. */
/** One row of GET /admin/users (admin only). */
export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}
export interface AdminUserPage {
  items: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
}
/** One row of GET /manager/learners. */
export interface LearnerRow {
  id: string;
  username: string;
  displayName: string | null;
  disabled: boolean;
  learning: number;
  solid: number;
  avgLevel: number | null;
  lastStudyAt: string | null;
  overdue: number;
  sessions7d: number;
}
export interface LearnerPage {
  items: LearnerRow[];
  total: number;
  page: number;
  limit: number;
}
/** GET /manager/learners/:id. */
export interface LearnerSummary {
  id: string;
  username: string;
  displayName: string | null;
  disabled: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
}
