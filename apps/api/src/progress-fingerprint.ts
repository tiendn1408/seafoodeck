import { createHash } from 'node:crypto';

interface Labeled {
  label: string;
  correct: boolean;
}

function norm(s: string): string {
  return s.normalize('NFC').trim();
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeChoices(choices: Labeled[] | undefined): [string, boolean][] {
  return (choices ?? [])
    .map((c): [string, boolean] => [norm(c.label), c.correct === true])
    .sort((a, b) => compare(a[0], b[0]) || Number(a[1]) - Number(b[1]));
}

export function itemFingerprint(names: { kind: string; label: string }[]): string {
  const normalized = names
    .map((n): [string, string] => [norm(n.kind), norm(n.label)])
    .sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1]));
  return sha256(normalized);
}

export function scenarioFingerprint(data: {
  prompt?: string;
  options?: Labeled[];
  followUps?: Labeled[];
}): string {
  return sha256({
    prompt: norm(data.prompt ?? ''),
    options: normalizeChoices(data.options),
    followUps: normalizeChoices(data.followUps),
  });
}
