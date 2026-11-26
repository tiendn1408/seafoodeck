/**
 * On the learner host Caddy sets `X-Edge: learner` on every proxied API request. The API then
 * answers staff paths (admin, manager, docs, openapi) exactly like a path that does not exist:
 * same status, body, headers and body-parser behaviour, because the request is turned into an
 * unknown route after the body parser and before routing. Raw requests (node:http) are used so
 * dot segments and percent-encodings reach the API unnormalised, as Caddy forwards them.
 */
import 'reflect-metadata';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { createApp } from './main';
import { EDGE_HEADER, EDGE_LEARNER, isStaffPath } from './learner-edge';

type Res = { status: number; headers: Record<string, string>; body: string };
let app: INestApplication;
let port = 0;

function send(
  method: string,
  path: string,
  opts: { edge?: string; body?: string | Buffer; type?: string } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts.edge !== undefined) headers[EDGE_HEADER] = opts.edge;
    if (opts.body !== undefined) {
      headers['content-type'] = opts.type ?? 'application/json';
      headers['content-length'] = String(Buffer.byteLength(opts.body));
    }
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string>,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

/** Header names minus per-response values; Connection/Keep-Alive differ by method only. */
const headerShape = (r: Res) =>
  Object.keys(r.headers)
    .filter((k) => k !== 'date')
    .sort();
const withoutRequestId = (body: string) =>
  body ? { ...JSON.parse(body), requestId: undefined } : body;

/** What the API answers for a path that does not exist, as a function of method and raw path. */
function assertLikeUnknown(r: Res, method: string, path: string, unknown: Res, label: string) {
  assert.equal(r.status, 404, label);
  assert.deepEqual(headerShape(r), headerShape(unknown), label + ' headers');
  assert.equal(r.headers['content-type'], 'application/json; charset=utf-8', label);
  assert.equal(r.headers['cache-control'], 'no-store', label);
  if (method === 'HEAD') {
    assert.equal(r.body, '', label);
    return;
  }
  const body = JSON.parse(r.body);
  assert.deepEqual(
    body,
    {
      message: `Cannot ${method} ${path}`,
      error: 'Not Found',
      statusCode: 404,
      requestId: r.headers['x-request-id'],
    },
    label + ' body',
  );
  assert.deepEqual(
    { ...JSON.parse(unknown.body), message: undefined, requestId: undefined },
    { ...body, message: undefined, requestId: undefined },
    label + ' same shape as unknown',
  );
}

before(async () => {
  // Docs on: the learner edge must hide them even when the flag is (wrongly) set.
  app = await createApp({ EXPOSE_API_DOCS: 'true' });
  await app.listen(0, '127.0.0.1');
  port = Number(new URL((await app.getUrl()).replace('[::1]', '127.0.0.1')).port);
});
after(() => app.close());

const BLOCKED: Array<[string, string]> = [
  ['GET', '/api/v1/admin/users'],
  ['POST', '/api/v1/admin/users'],
  ['GET', '/api/v1/admin/overview'],
  ['PATCH', '/api/v1/admin/users/..%2F..%2Fx'],
  ['DELETE', '/api/v1/admin/users/..%2F..%2Fx'],
  ['GET', '/api/v1/manager/learners'],
  ['GET', '/api/v1/manager/learners/..%2F..%2Fx'],
  ['GET', '/api/v1/manager/learners/..%2F..%2Fx/review'],
  ['GET', '/api/v1/manager/learners/..%2F..%2Fx/progress'],
  ['GET', '/api/v1/manager/learners/..%2F..%2Fx/mastery'],
  ['GET', '/api/v1/manager/learners/%2E%2E%2F..%2Fx'],
  ['GET', '/API/V1/ADMIN/users'],
  ['GET', '/api/v1/Manager/learners?q=1'],
  ['GET', '/api/v1/admin/users/'],
  ['GET', '/api/v1//admin/users'],
  ['GET', '/api/v1/./admin/users'],
  ['GET', '/api/v1/x/../admin/users'],
  ['GET', '/api/v1/%61dmin/users'],
  ['GET', '/api/v1/%2e%2e/v1/admin/users'],
  ['HEAD', '/api/v1/manager/learners'],
  ['OPTIONS', '/api/v1/admin/users'],
  ['GET', '/api/v1/docs'],
  ['GET', '/api/v1/docs/'],
  ['GET', '/api/v1/docs-json'],
  ['GET', '/api/v1/docs-yaml'],
  ['GET', '/api/v1/openapi.json'],
];

test('learner edge: staff paths answer like an unknown path (status, body, headers)', async () => {
  for (const [method, path] of BLOCKED) {
    const unknown = await send(method, '/api/v1/zz-unknown/zz', { edge: EDGE_LEARNER });
    const r = await send(method, path, {
      edge: EDGE_LEARNER,
      ...(method === 'POST' ? { body: '{"username":"x"}' } : {}),
    });
    assertLikeUnknown(r, method, path, unknown, `${method} ${path}`);
  }
});

test('learner edge: body-parser errors are the same as for an unknown path', async () => {
  const cases: Array<[string, string | Buffer, string]> = [
    ['malformed JSON', '{"username":', 'application/json'],
    ['oversized body', Buffer.alloc(5 * 1024 * 1024 + 10, 'a'), 'application/json'],
  ];
  for (const [label, body, type] of cases) {
    const unknown = await send('POST', '/api/v1/zz-unknown/users', {
      edge: EDGE_LEARNER,
      body,
      type,
    });
    const blocked = await send('POST', '/api/v1/admin/users', { edge: EDGE_LEARNER, body, type });
    assert.notEqual(unknown.status, 404, label + ': body parser rejects first');
    assert.equal(blocked.status, unknown.status, label);
    assert.deepEqual(headerShape(blocked), headerShape(unknown), label + ' headers');
    assert.deepEqual(withoutRequestId(blocked.body), withoutRequestId(unknown.body), label);
  }
});

test('without the learner edge header staff routes behave as today', async () => {
  for (const [method, path] of [
    ['GET', '/api/v1/admin/users'],
    ['GET', '/api/v1/manager/learners'],
    ['GET', '/API/V1/ADMIN/users'],
  ]) {
    const r = await send(method, path);
    assert.equal(r.status, 401, `${method} ${path}`);
  }
  for (const edge of ['studio', '', 'LEARNER ']) {
    const r = await send('GET', '/api/v1/admin/users', { edge });
    assert.equal(r.status, 401, `edge=${JSON.stringify(edge)}`);
  }
  assert.equal((await send('GET', '/api/v1/openapi.json')).status, 200, 'docs flag honoured');
});

test('learner edge leaves learner routes alone', async () => {
  for (const path of ['/api/v1/me/home', '/api/v1/catalog/items', '/api/v1/auth/me']) {
    const plain = await send('GET', path);
    const edge = await send('GET', path, { edge: EDGE_LEARNER });
    assert.notEqual(edge.status, 404, path);
    assert.equal(edge.status, plain.status, path);
  }
});

test('isStaffPath: raw and decoded forms, segments normalised, case-insensitive', () => {
  for (const p of [
    '/api/v1/admin',
    '/api/v1/admin/users',
    '/api/v1/ADMIN',
    '/api/v1/manager/learners/..%2F..%2Fx',
    '/api/v1//manager',
    '/api/v1/./admin',
    '/api/v1/%61dmin/users',
    '/api/v1/x/..%2Fadmin',
    '/api/v1/docs-json',
    '/api/v1/openapi.json',
    '/api/v1/%E0%A4%A/../admin',
  ])
    assert.equal(isStaffPath(p), true, p);
  for (const p of [
    '/api/v1/me/home',
    '/api/v1/catalog/items',
    '/api/v1/auth/login',
    '/api/v1/health',
    '/api/v1/media/abc/url',
    '/api/v1/%E0%A4%A',
  ])
    assert.equal(isStaffPath(p), false, p);
});
