import assert from 'node:assert/strict';
import test from 'node:test';
import { itemFingerprint, scenarioFingerprint } from './progress-fingerprint';

const names = [
  { kind: 'vi', label: 'Cá hồi' },
  { kind: 'en', label: 'Salmon' },
  { kind: 'ja', label: 'サーモン' },
  { kind: 'scientific', label: 'Salmo salar' },
];

test('itemFingerprint ignores input order and whitespace', () => {
  const base = itemFingerprint(names);
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(itemFingerprint([...names].reverse()), base);
  assert.equal(itemFingerprint(names.map((n) => ({ ...n, label: ` ${n.label} ` }))), base);
});

test('itemFingerprint changes when a label changes', () => {
  const changed = names.map((n) => (n.kind === 'en' ? { ...n, label: 'Atlantic salmon' } : n));
  assert.notEqual(itemFingerprint(changed), itemFingerprint(names));
});

test('itemFingerprint ignores unknown extra fields', () => {
  const extra = names.map((n) => ({
    ...n,
    note: 'x',
    sku: 'SKU1',
    imageId: 'img',
  }));
  assert.equal(itemFingerprint(extra), itemFingerprint(names));
});

const scenario = {
  prompt: 'Which is it?',
  options: [
    { label: 'A', correct: true },
    { label: 'B', correct: false },
  ],
  followUps: [{ label: 'F', correct: true }],
};

test('scenarioFingerprint ignores option order and extra fields', () => {
  const base = scenarioFingerprint(scenario);
  assert.equal(
    scenarioFingerprint({
      ...scenario,
      options: [...scenario.options].reverse(),
    }),
    base,
  );
  assert.equal(
    scenarioFingerprint({
      ...scenario,
      options: scenario.options.map((o) => ({ ...o, id: 'q' })),
    }),
    base,
  );
});

test('scenarioFingerprint changes on prompt, label or correct change', () => {
  const base = scenarioFingerprint(scenario);
  assert.notEqual(scenarioFingerprint({ ...scenario, prompt: 'Other?' }), base);
  assert.notEqual(
    scenarioFingerprint({
      ...scenario,
      options: [
        { label: 'A', correct: false },
        { label: 'B', correct: false },
      ],
    }),
    base,
  );
  assert.notEqual(
    scenarioFingerprint({
      ...scenario,
      followUps: [{ label: 'G', correct: true }],
    }),
    base,
  );
});

test('itemFingerprint is stable across NFC and NFD forms', () => {
  for (const label of ['Cá hồi', 'ブリ']) {
    const a = [{ kind: 'vi', label: label.normalize('NFC') }];
    const b = [{ kind: 'vi', label: label.normalize('NFD') }];
    assert.notEqual(a[0].label, b[0].label);
    assert.equal(itemFingerprint(a), itemFingerprint(b));
  }
});

test('itemFingerprint has no delimiter collisions', () => {
  assert.notEqual(
    itemFingerprint([
      { kind: 'vi', label: 'a|b' },
      { kind: 'vi', label: 'c' },
    ]),
    itemFingerprint([
      { kind: 'vi', label: 'a' },
      { kind: 'vi', label: 'b|c' },
    ]),
  );
});

test('scenarioFingerprint changes when a followUp correct flips', () => {
  assert.notEqual(
    scenarioFingerprint({ followUps: [{ label: 'F', correct: true }] }),
    scenarioFingerprint({ followUps: [{ label: 'F', correct: false }] }),
  );
});
