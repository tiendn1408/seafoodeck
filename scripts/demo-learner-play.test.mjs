import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_ORIGIN, hostConfirmed, originGate, parseArgs, ratingPlan } from './demo-learner-play.mjs';

test('parseArgs defaults and values', () => {
  const a = parseArgs(['--username', 'an']);
  assert.deepEqual([a.origin, a.sessions, a.allowNonlocal], [DEFAULT_ORIGIN, 3, false]);
  const b = parseArgs(['--username', 'an', '--sessions', '5', '--origin', 'http://localhost:1/', '--allow-nonlocal']);
  assert.deepEqual([b.sessions, b.origin, b.allowNonlocal], [5, 'http://localhost:1', true]);
});

test('parseArgs rejects bad input and any password flag', () => {
  assert.throws(() => parseArgs([]), /--username/);
  assert.throws(() => parseArgs(['--username', 'an', '--password', 'x']), /prompt ẩn/);
  assert.throws(() => parseArgs(['--username', 'an', '--sessions', '0']), /không hợp lệ/);
  assert.throws(() => parseArgs(['--username', 'an', '--sessions']), /Thiếu/);
  assert.throws(() => parseArgs(['--username', 'an', '--origin', 'nope']), /URL/);
});

test('originGate: loopback ok, remote refused, remote with flag needs host retyped', () => {
  assert.equal(originGate('http://127.0.0.1:18089', false), null);
  assert.match(originGate('https://demo.example.com', false).refuse, /không phải máy local/);
  assert.deepEqual(originGate('https://demo.example.com', true), { confirmHost: 'demo.example.com' });
  assert.equal(hostConfirmed('https://demo.example.com', 'demo.example.com'), true);
  assert.equal(hostConfirmed('https://demo.example.com', 'demo.example.co'), false);
  assert.equal(hostConfirmed('https://demo.example.com', ''), false);
});

test('ratingPlan is deterministic with a fixed known ratio', () => {
  assert.deepEqual(ratingPlan(10, 7), ratingPlan(10, 7));
  for (const n of [2, 3, 10, 40]) assert.equal(ratingPlan(n, 1).filter(r => r === 'known').length, Math.round(n / 2));
  assert.notDeepEqual(ratingPlan(40, 1), ratingPlan(40, 2));
  assert.ok(ratingPlan(6, 3).every(r => r === 'known' || r === 'again'));
});
