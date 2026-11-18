import { Db } from './db';
import { passwordHash } from './security';
async function main() {
  const db = new Db();
  try {
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16)
      throw Error('Set a strong ADMIN_PASSWORD first.');
    const username = process.env.ADMIN_USERNAME ?? 'owner';
    const existing = await db.user.findUnique({ where: { username } });
    if (existing) {
      console.log('Administrator exists; credentials were not overwritten.');
      return;
    }
    await db.user.create({
      data: { username, passwordHash: passwordHash(process.env.ADMIN_PASSWORD), role: 'admin' },
    });
    console.log('Administrator created. No catalogue, media or release was seeded.');
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
