import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ApiClient,
  ApiError,
  SUPPORTED_IMAGE_FORMATS,
  detectImageFormat,
  NetworkError,
  withRetry,
} from './client.mjs';

const fail = (status) => Object.assign(new ApiError(`HTTP ${status}`, status), {});

test('withRetry retries 429 and succeeds on third try', async () => {
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw fail(429);
      return 'ok';
    },
    { baseMs: 1 },
  );
  assert.equal(value, 'ok');
  assert.equal(calls, 3);
});

test('withRetry retries network errors', async () => {
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls < 2) throw new TypeError('fetch failed');
      return 1;
    },
    { baseMs: 1 },
  );
  assert.equal(value, 1);
});

test('withRetry POST does not retry network errors', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new NetworkError('x');
      },
      { baseMs: 1, method: 'POST' },
    ),
    (e) => e instanceof NetworkError,
  );
  assert.equal(calls, 1);
});

test('withRetry POST retries 429', async () => {
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls < 2) throw fail(429);
      return 'ok';
    },
    { baseMs: 1, method: 'POST' },
  );
  assert.equal(value, 'ok');
  assert.equal(calls, 2);
});

test('withRetry GET retries NetworkError', async () => {
  let calls = 0;
  await withRetry(
    async () => {
      calls += 1;
      if (calls < 2) throw new NetworkError('x');
    },
    { baseMs: 1 },
  );
  assert.equal(calls, 2);
});

test('withRetry never retries programming errors', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new TypeError('x is not a function');
      },
      { baseMs: 1 },
    ),
    TypeError,
  );
  assert.equal(calls, 1);
});

test('withRetry does not retry 400', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw fail(400);
      },
      { baseMs: 1 },
    ),
    (e) => e.status === 400,
  );
  assert.equal(calls, 1);
});

test('withRetry throws after tries exhausted', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw fail(429);
      },
      { tries: 3, baseMs: 1 },
    ),
    (e) => e.status === 429,
  );
  assert.equal(calls, 3);
});

function fakeFetch(log) {
  return async (url, init) => {
    log.push({ url, init });
    const path = new URL(url).pathname;
    if (path === '/api/v1/auth/me')
      return new Response(JSON.stringify({ csrf: 'tok1' }), {
        status: 200,
        headers: { 'set-cookie': 'seafoodeck_session=abc; Path=/; HttpOnly' },
      });
    if (path === '/api/v1/missing') return new Response('{"message":"nope"}', { status: 404 });
    return new Response(JSON.stringify({ id: 'x' }), { status: 201 });
  };
}

test('ApiClient keeps cookie and csrf, prefixes /api/v1', async () => {
  const log = [];
  const client = new ApiClient('http://h:1/', fakeFetch(log));
  await client.get('/auth/me');
  const created = await client.post('/admin/items', { item: 1 });
  assert.deepEqual(created, { id: 'x' });
  const second = log[1];
  assert.equal(second.url, 'http://h:1/api/v1/admin/items');
  assert.equal(second.init.headers.Cookie, 'seafoodeck_session=abc');
  assert.equal(second.init.headers['X-CSRF-Token'], 'tok1');
  assert.equal(second.init.headers['Content-Type'], 'application/json');
  assert.equal(second.init.headers.Origin, undefined);
  assert.equal(second.init.body, '{"item":1}');
});

test('ApiClient sends FormData without content-type and throws ApiError', async () => {
  const log = [];
  const client = new ApiClient('http://h:1', fakeFetch(log));
  await client.get('/auth/me');
  const form = new FormData();
  form.append('a', 'b');
  await client.post('/admin/revisions/1/media', form);
  assert.equal(log[1].init.headers['Content-Type'], undefined);
  assert.equal(log[1].init.body, form);
  await assert.rejects(client.get('/missing'), (e) => e instanceof ApiError && e.status === 404);
  assert.equal(await client.getOptional('/missing'), null);
});

test('detectImageFormat recognises formats by magic bytes', () => {
  assert.equal(detectImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])), 'jpeg');
  assert.equal(
    detectImageFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    'png',
  );
  assert.equal(detectImageFormat(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'webp');
  assert.equal(detectImageFormat(Buffer.from('GIF87a\0\0')), 'gif');
  assert.equal(detectImageFormat(Buffer.from('GIF89a\0\0')), 'gif');
  assert.equal(detectImageFormat(Buffer.from('hello')), 'unknown');
  assert.equal(detectImageFormat(Buffer.alloc(0)), 'unknown');
  assert.ok(!SUPPORTED_IMAGE_FORMATS.includes('gif'));
});
