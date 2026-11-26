import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diff, MATRIX, keyOf } from './web-tier-headers.mjs';

const base = () => ({ a: { status: 200, headers: { 'cache-control': 'no-store' } } });

test('identical captures give no difference', () => {
  assert.deepEqual(diff(base(), base()), []);
});

test('a changed header value gives exactly one message naming key and header', () => {
  const actual = base();
  actual.a.headers['cache-control'] = 'no-store, public, max-age=31536000, immutable';
  const out = diff(base(), actual);
  assert.equal(out.length, 1);
  assert.match(out[0], /\ba\b/);
  assert.match(out[0], /cache-control/);
});

test('a missing key gives one message', () => {
  const out = diff(base(), {});
  assert.equal(out.length, 1);
  assert.match(out[0], /\ba\b/);
});

test('an extra key, an extra header, a missing header and a status change are each reported', () => {
  const actual = { a: { status: 502, headers: { 'content-encoding': 'gzip' } }, b: { status: 200, headers: {} } };
  const out = diff(base(), actual);
  assert.equal(out.length, 4, out.join('\n'));
  assert.ok(out.some((m) => /\bb\b/.test(m)));
  assert.ok(out.some((m) => /status/.test(m)));
  assert.ok(out.some((m) => /content-encoding/.test(m)));
  assert.ok(out.some((m) => /cache-control/.test(m)));
});

test('the matrix covers both hosts and gives unique keys', () => {
  const keys = MATRIX.map(keyOf);
  assert.equal(new Set(keys).size, keys.length);
  for (const host of ['learner', 'studio']) assert.ok(MATRIX.some((e) => e.host === host));
});
