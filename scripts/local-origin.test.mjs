import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLoopbackOrigin, refuseNonLocal } from './local-origin.mjs';

test('loopback origins are accepted', () => {
  for (const o of ['http://127.0.0.1:18089', 'http://localhost:18089', 'https://LOCALHOST', 'http://[::1]:18089'])
    assert.equal(isLoopbackOrigin(o), true, o);
});

test('other hosts and malformed origins are refused', () => {
  for (const o of ['https://seafoodeck.example.com', 'http://10.0.0.5:18089', 'http://127.0.0.1.example.com', 'http://localhost.evil.test', 'ftp://127.0.0.1', 'http://0.0.0.0:18089', 'not a url', ''])
    assert.equal(isLoopbackOrigin(o), false, o);
});

test('refusal unless --allow-nonlocal is given', () => {
  assert.equal(refuseNonLocal('http://127.0.0.1:18089', []), null);
  assert.match(refuseNonLocal('https://pilot.example.com', []), /không phải máy local/);
  assert.equal(refuseNonLocal('https://pilot.example.com', ['--allow-nonlocal']), null);
});

test('userinfo does not hide the host: user@evil.com@127.0.0.1 is loopback per URL.hostname', () => {
  assert.equal(new URL('http://user@evil.com@127.0.0.1:18089').hostname, '127.0.0.1');
  assert.equal(isLoopbackOrigin('http://user@evil.com@127.0.0.1:18089'), true);
  assert.equal(isLoopbackOrigin('http://127.0.0.1@evil.com'), false);
});
