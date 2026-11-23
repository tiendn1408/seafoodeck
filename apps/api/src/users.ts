import { randomInt } from 'node:crypto';
import type { Db } from './db';

/** Lowercased, trimmed form used for comparisons; stored usernames keep their typed case. */
export const normalizeUsername = (name: string): string => name.trim().toLowerCase();

// Without visually ambiguous characters: 0 O o 1 l I.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Random temporary password: 12 characters for students, 20 for every other role. */
export function generateTempPassword(role: string): string {
  const length = role === 'student' ? 12 : 20;
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Case-insensitive username lookup (backed by the lower("username") unique index). */
export const findUserByUsername = (db: Pick<Db, 'user'>, name: string) =>
  db.user.findFirst({ where: { username: { equals: name, mode: 'insensitive' } } });

/**
 * Idempotent administrator creation for bootstrap/seed: matches the username case-insensitively
 * and treats a unique-index race (P2002) as "already exists". Never overwrites credentials.
 */
export async function ensureAdmin(
  db: Pick<Db, 'user'>,
  username: string,
  passwordHash: string,
): Promise<'created' | 'exists'> {
  if (await findUserByUsername(db, username)) return 'exists';
  try {
    await db.user.create({ data: { username, passwordHash, role: 'admin' } });
    return 'created';
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'P2002') return 'exists';
    throw e;
  }
}
