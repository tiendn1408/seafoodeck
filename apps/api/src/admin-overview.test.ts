/**
 * The release history in the Studio overview must always show the release learners are served
 * (`current:internal` / `current:public`), even when more than 20 newer releases exist (a publish
 * then a rollback to an older release leaves the live one below the 20 newest). Without it the
 * Studio cannot tell staff which release is live, and the pilot scripts cannot republish it.
 */
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from './db';
import type { Catalog } from './catalog';
import type { Media } from './media';
import type { ActorRequest } from './security';
import { AdminController } from './controllers';

type Release = { id: string; internal: boolean; createdAt: Date; items: { revisionId: string }[] };
const releases: Release[] = Array.from({ length: 30 }, (_, i) => ({
  id: 'rel-' + String(i).padStart(2, '0'),
  internal: i % 2 === 0,
  createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
  items: [{ revisionId: 'rev-' + i }],
}));

function fakeDb(settings: { id: string; value: string }[]) {
  const byNewest = [...releases].sort((a, b) => +b.createdAt - +a.createdAt);
  const empty = { findMany: async () => [], count: async () => 0 };
  return {
    revision: empty,
    tariffReference: empty,
    tradeScenario: empty,
    audit: empty,
    setting: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        settings.filter((s) => args.where.id.in.includes(s.id)),
    },
    contentRelease: {
      findMany: async (args: { where?: { id: { in: string[] } }; take?: number }) => {
        const rows = args.where
          ? byNewest.filter((r) => args.where!.id.in.includes(r.id))
          : byNewest;
        return args.take ? rows.slice(0, args.take) : rows;
      },
    },
  } as unknown as Db;
}
const req = {
  actor: { id: 'a', userId: 'a', role: 'admin', internal: true },
} as unknown as ActorRequest;
const overview = (settings: { id: string; value: string }[]) =>
  new AdminController(fakeDb(settings), {} as Catalog, {} as Media).overview(req, '') as Promise<{
    releases: (Release & { current: boolean })[];
  }>;

test('overview lists the 20 newest releases, newest first, flags the current one', async () => {
  const { releases: list } = await overview([{ id: 'current:internal', value: 'rel-28' }]);
  assert.deepEqual(
    list.map((r) => r.id),
    releases
      .slice(10)
      .reverse()
      .map((r) => r.id),
  );
  assert.deepEqual(
    list.filter((r) => r.current).map((r) => r.id),
    ['rel-28'],
  );
});

test('overview always includes current releases older than the 20 newest', async () => {
  const { releases: list } = await overview([
    { id: 'current:internal', value: 'rel-02' },
    { id: 'current:public', value: 'rel-05' },
  ]);
  assert.equal(list.length, 22);
  assert.deepEqual(
    list.slice(0, 20).map((r) => r.id),
    releases
      .slice(10)
      .reverse()
      .map((r) => r.id),
  );
  assert.deepEqual(
    list.slice(20).map((r) => [r.id, r.current]),
    [
      ['rel-05', true],
      ['rel-02', true],
    ],
  );
  assert.deepEqual(list.find((r) => r.id === 'rel-02')?.items, [{ revisionId: 'rev-2' }]);
  assert.ok(list.slice(0, 20).every((r) => !r.current));
});

test('overview without any current release lists the 20 newest, none flagged', async () => {
  const { releases: list } = await overview([]);
  assert.equal(list.length, 20);
  assert.ok(list.every((r) => r.current === false));
});

test('overview lists an old release once when both current settings point to it', async () => {
  const { releases: list } = await overview([
    { id: 'current:internal', value: 'rel-03' },
    { id: 'current:public', value: 'rel-03' },
  ]);
  assert.equal(list.length, 21);
  assert.deepEqual(
    list.filter((r) => r.id === 'rel-03').map((r) => r.current),
    [true],
  );
});

test('overview ignores a current setting that points to a missing release', async () => {
  const { releases: list } = await overview([{ id: 'current:internal', value: 'no-such-release' }]);
  assert.deepEqual(
    list.map((r) => r.id),
    releases
      .slice(10)
      .reverse()
      .map((r) => r.id),
  );
  assert.ok(list.every((r) => r.current === false));
});
