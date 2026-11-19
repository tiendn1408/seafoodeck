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
main().catch((e: unknown) => {
  const code = (e as { code?: unknown } | null)?.code;
  console.error(
    'Rebuilding review progress failed; nothing was changed.' +
      (typeof code === 'string' ? ` (${code})` : ''),
  );
  process.exit(1);
});
