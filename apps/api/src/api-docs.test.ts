/**
 * The Swagger UI and the OpenAPI JSON list every /admin/* and /manager/* route, so the running API
 * only serves them when EXPOSE_API_DOCS=true. The contract export builds the same document
 * without registering any HTTP route.
 */
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { apiDocsEnabled, buildOpenApiDocument, createApp } from './main';

const DOC_PATHS = [
  '/api/v1/docs',
  '/api/v1/docs/',
  '/api/v1/docs-json',
  '/api/v1/docs-yaml',
  '/api/v1/openapi.json',
];

async function statuses(env: NodeJS.ProcessEnv): Promise<Record<string, number>> {
  const app: INestApplication = await createApp(env);
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const out: Record<string, number> = {};
    for (const path of DOC_PATHS) {
      const res = await fetch(url.replace('[::1]', '127.0.0.1') + path, { redirect: 'manual' });
      await res.arrayBuffer();
      out[path] = res.status;
    }
    return out;
  } finally {
    await app.close();
  }
}

test('EXPOSE_API_DOCS is off unless it is exactly "true"', () => {
  assert.equal(apiDocsEnabled({}), false);
  for (const v of ['', '0', 'false', 'TRUE', '1', 'yes'])
    assert.equal(apiDocsEnabled({ EXPOSE_API_DOCS: v }), false, v);
  assert.equal(apiDocsEnabled({ EXPOSE_API_DOCS: 'true' }), true);
});

test('without EXPOSE_API_DOCS the docs UI and the OpenAPI JSON are not served', async () => {
  const got = await statuses({});
  for (const path of DOC_PATHS) assert.equal(got[path], 404, path);
});

test('with EXPOSE_API_DOCS=false they are not served either', async () => {
  const got = await statuses({ EXPOSE_API_DOCS: 'false' });
  for (const path of DOC_PATHS) assert.equal(got[path], 404, path);
});

test('with EXPOSE_API_DOCS=true the docs UI and the OpenAPI JSON are served', async () => {
  const got = await statuses({ EXPOSE_API_DOCS: 'true' });
  assert.equal(got['/api/v1/openapi.json'], 200);
  assert.equal(got['/api/v1/docs'], 200);
  assert.equal(got['/api/v1/docs-yaml'], 200);
});

test('the contract document is built without exposing it over HTTP', async () => {
  const app = await createApp({});
  try {
    const doc = buildOpenApiDocument(app);
    assert.equal(doc.info.title, 'Seafood Deck API');
    assert.ok(doc.paths['/api/v1/admin/users'], 'admin routes are in the contract');
    assert.ok(doc.paths['/api/v1/manager/learners'], 'manager routes are in the contract');
  } finally {
    await app.close();
  }
});
