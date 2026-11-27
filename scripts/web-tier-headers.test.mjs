import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diff, MATRIX, keyOf, viaProblems } from './web-tier-headers.mjs';

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
  const actual = {
    a: { status: 502, headers: { 'content-encoding': 'gzip' } },
    b: { status: 200, headers: {} },
  };
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

const CADDY = '1.1 Caddy';
const goodRows = () => [
  { host: 'learner', path: '/' },
  { host: 'learner', path: '/assets/index-abc.js' },
  { host: 'studio', path: '/some/spa/route' },
  { host: 'learner', path: '/api/v1/auth/me', via: CADDY },
  { host: 'studio', path: '/seafoodeck-private/x', via: CADDY },
];

test('via rules: app files carry none, API and S3 responses carry 1.1 Caddy', () => {
  assert.deepEqual(viaProblems(goodRows()), []);
});

test('an app-served row with a via header is reported by host and path', () => {
  const rows = goodRows();
  rows[1].via = CADDY;
  const out = viaProblems(rows);
  assert.equal(out.length, 1);
  assert.match(out[0], /learner \/assets\/index-abc\.js/);
  assert.match(out[0], /must not have a via header/);
});

test('an API or S3 row without the Caddy via is reported, a different via too', () => {
  const rows = goodRows();
  delete rows[3].via;
  rows[4].via = '1.1 other';
  const out = viaProblems(rows);
  assert.equal(out.length, 2);
  assert.match(out[0], /learner \/api\/v1\/auth\/me.*1\.1 Caddy/);
  assert.match(out[1], /studio \/seafoodeck-private\/x.*"1\.1 other"/);
});
