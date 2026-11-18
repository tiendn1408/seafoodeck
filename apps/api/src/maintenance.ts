import { Db } from './db';
import { Catalog } from './catalog';
import { Media } from './media';
async function main() {
  const db = new Db();
  try {
    const now = new Date();
    const games = await db.gameSession.deleteMany({ where: { expiresAt: { lt: now } } });
    const sessions = await db.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
    const objects = await new Media(db, new Catalog(db)).cleanup(process.argv[2] !== 'apply');
    console.log(
      JSON.stringify({ expiredGames: games.count, expiredAuth: sessions.count, ...objects }),
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Maintenance failed; no volume reset was attempted.');
  process.exit(1);
});
