import { Db } from './db';
import { rebuildProgress } from './progress-record';
// Usage: node dist/rebuild-progress.js [userId]  (reads DATABASE_URL; prints counts only)
async function main() {
  const db = new Db();
  try {
    const userId = process.argv[2] || undefined;
    console.log(JSON.stringify(await rebuildProgress(db, userId)));
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Rebuilding review progress failed; nothing was changed.');
  process.exit(1);
});
