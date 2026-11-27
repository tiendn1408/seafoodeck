export type VoiceKind = 'en' | 'ja' | 'scientific';

export interface SpeakHandlers {
  start(): void;
  end(): void;
  error(fatal: boolean): void;
  /** Another sound took over (or speech was cancelled): drop any "speaking" status. */
  reset?(): void;
}

export function speechText(kind: VoiceKind, label: string): string {
  return label
    .replace(/\s*\/\s*/g, kind === 'ja' ? '、' : ', ')
    .replace(/\s+sp\.\s*$/, ' species')
    .replace(/\s+/g, ' ')
    .trim();
}

// Android Chrome and Firefox report tags such as ja_JP and en_US.
const normalTag = (v: SpeechSynthesisVoice) => v.lang.replace(/_/g, '-');

const NOVELTY = [
  'Albert',
  'Bad News',
  'Bahh',
  'Bells',
  'Boing',
  'Bubbles',
  'Cellos',
  'Good News',
  'Jester',
  'Organ',
  'Superstar',
  'Trinoids',
  'Whisper',
  'Wobble',
  'Zarvox',
];

export function pickVoice(
  kind: VoiceKind,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const pool = voices.filter((v) => normalTag(v) === (kind === 'ja' ? 'ja-JP' : 'en-US'));
  // At each step an on-device voice wins; a remote voice is only the last resort.
  const first = (ok: (v: SpeechSynthesisVoice) => boolean) =>
    pool.find((v) => v.localService !== false && ok(v)) ?? pool.find((v) => ok(v));
  if (kind === 'ja') return first((v) => v.name.includes('Kyoko')) ?? first(() => true);
  return (
    first((v) => v.name.includes('Samantha')) ??
    first((v) => v.default === true) ??
    first((v) => !NOVELTY.some((n) => v.name.includes(n))) ??
    first(() => true)
  );
}

export function speechRate(kind: VoiceKind, slow: boolean): number {
  if (kind === 'ja') return slow ? 0.65 : 0.85;
  return slow ? 0.75 : 1;
}

export function speechAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      !!window.speechSynthesis &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  } catch {
    return false;
  }
}

export function availableVoices(): SpeechSynthesisVoice[] {
  try {
    return speechAvailable() ? Array.from(window.speechSynthesis.getVoices()) : [];
  } catch {
    return [];
  }
}

// Browsers may garbage-collect an utterance that is still speaking; keep a reference.
const held: SpeechSynthesisUtterance[] = [];
// The handlers of whoever is speaking now, so a takeover can reset the previous status even
// when the browser reports `end` instead of `error: interrupted`.
let owner: Entry | null = null;

// The engine may never report back (no TTS engine, a stalled remote voice): without `start` in
// 3 s it is a failure, and without `end` 15 s after `start` the status is dropped.
const START_WATCHDOG_MS = 3000;
const END_WATCHDOG_MS = 15000;

interface Entry {
  on: SpeakHandlers;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}

function disarm(entry: Entry): void {
  clearTimeout(entry.timer);
  entry.timer = undefined;
}

function arm(entry: Entry, ms: number, fire: () => void): void {
  disarm(entry);
  entry.timer = setTimeout(() => {
    entry.timer = undefined;
    if (entry.active) fire();
  }, ms);
}

function releaseOwner(): void {
  const previous = owner;
  owner = null;
  if (!previous) return;
  previous.active = false;
  disarm(previous);
  previous.on.reset?.();
}

export function speak(kind: VoiceKind, label: string, slow: boolean, on: SpeakHandlers): boolean {
  const text = speechText(kind, label);
  if (!text || !speechAvailable()) return false;
  const voice = pickVoice(kind, availableVoices());
  if (!voice) return false;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = normalTag(voice);
    utterance.rate = speechRate(kind, slow);
    const entry: Entry = { on, active: true, timer: undefined };
    utterance.onstart = () => {
      if (!entry.active) return;
      // A late `end` after this reset intentionally shows "Đã đọc xong": the entry stays active.
      arm(entry, END_WATCHDOG_MS, () => on.reset?.());
      on.start();
    };
    utterance.onend = () => {
      if (!entry.active) return;
      disarm(entry);
      on.end();
    };
    utterance.onerror = (e) => {
      const code = (e as { error?: string }).error;
      // After a takeover or cancel, an error without a code is the browser's echo of our stop.
      if (!entry.active) return;
      disarm(entry);
      on.error(!(code === 'interrupted' || code === 'canceled'));
    };
    window.speechSynthesis.cancel();
    releaseOwner();
    owner = entry;
    held.splice(0, held.length, utterance);
    arm(entry, START_WATCHDOG_MS, () => {
      entry.active = false;
      if (owner === entry) owner = null;
      held.length = 0;
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* nothing to cancel */
      }
      on.error(true);
    });
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function cancelSpeech(): void {
  held.length = 0;
  releaseOwner();
  try {
    if (speechAvailable()) window.speechSynthesis.cancel();
  } catch {
    /* nothing to cancel */
  }
}
