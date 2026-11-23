import { Db } from './db';
import { passwordHash } from './security';
import { ensureAdmin } from './users';
async function main() {
  const db = new Db();
  try {
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16)
      throw Error('Set a strong ADMIN_PASSWORD first.');
    const username = process.env.ADMIN_USERNAME ?? 'owner';
    const result = await ensureAdmin(db, username, passwordHash(process.env.ADMIN_PASSWORD));
    console.log(
      result === 'exists'
        ? 'Administrator exists; credentials were not overwritten.'
        : 'Administrator created. No catalogue, media or release was seeded.',
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
