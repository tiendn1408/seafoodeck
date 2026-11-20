import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, generateTempPassword, findUserByUsername } from './users';
import type { Db } from './db';

test('normalizeUsername trims and lowercases', () => {
  assert.equal(normalizeUsername(' An '), 'an');
  assert.equal(normalizeUsername('LAN_01'), 'lan_01');
});

test('generateTempPassword: 12 for student, 20 otherwise, no ambiguous characters', () => {
  for (let i = 0; i < 200; i++) {
    const s = generateTempPassword('student');
    assert.equal(s.length, 12);
    assert.doesNotMatch(s, /[0Oo1lI]/);
    assert.match(s, /^[A-Za-z0-9]+$/);
  }
  for (const role of ['manager', 'editor', 'reviewer', 'publisher', 'admin']) {
    const s = generateTempPassword(role);
    assert.equal(s.length, 20);
    assert.doesNotMatch(s, /[0Oo1lI]/);
  }
  assert.notEqual(generateTempPassword('student'), generateTempPassword('student'));
  assert.notEqual(generateTempPassword('manager'), generateTempPassword('manager'));
});

test('generateTempPassword draws every alphabet character eventually', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) for (const c of generateTempPassword('manager')) seen.add(c);
  assert.ok(seen.size >= 50, `only ${seen.size} distinct characters`);
});

test('findUserByUsername asks for a case-insensitive match', async () => {
  let args: unknown;
  const db = {
    user: {
      findFirst: async (a: unknown) => ((args = a), null),
    },
  } as unknown as Db;
  await findUserByUsername(db, 'aN');
  assert.deepEqual(args, { where: { username: { equals: 'aN', mode: 'insensitive' } } });
});
