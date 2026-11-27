import { isClipPlaying } from '../../pilot/Media';
import { getSoundSettings } from './soundSettings';

export type SfxKind = 'correct' | 'wrong' | 'neutral' | 'done';

interface Note {
  /** Frequency in Hz. */
  f: number;
  /** Start offset in ms. */
  at: number;
  /** Length in ms. */
  len: number;
  wave: OscillatorType;
}

// The four sounds the owner auditioned and accepted on 27/11/2026; each ends under 0.5 s.
const NOTES: Record<SfxKind, Note[]> = {
  correct: [
    { f: 660, at: 0, len: 110, wave: 'sine' },
    { f: 880, at: 90, len: 170, wave: 'sine' },
  ],
  wrong: [{ f: 220, at: 0, len: 260, wave: 'triangle' }],
  neutral: [{ f: 1200, at: 0, len: 45, wave: 'sine' }],
  done: [
    { f: 523, at: 0, len: 120, wave: 'sine' },
    { f: 659, at: 110, len: 120, wave: 'sine' },
    { f: 784, at: 220, len: 220, wave: 'sine' },
  ],
};

const ATTACK_S = 0.008;
const FLOOR = 0.0001;
const LEAD_S = 0.02;

/** Peak output for a volume in [0, 1]: 0.075 at the default 25%, 0.3 at 100%. */
export function sfxPeak(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.min(1, Math.max(0, volume)) * 0.3;
}

let ctx: AudioContext | null = null;
let stopPrevious: (() => void) | null = null;

/**
 * Build-time switch, OFF by default: only the exact value `on` of VITE_SOUND_EFFECTS enables the
 * feature. Read at call time so tests can stub it.
 */
export function soundFeatureEnabled(): boolean {
  return import.meta.env.VITE_SOUND_EFFECTS === 'on';
}

/**
 * True only when the feature is switched on and the browser has the unprefixed `AudioContext`. Older iPhones (before Safari 14.5) only have
 * `webkitAudioContext`; there is no prefixed fallback, so the sound feature is off there.
 */
export function soundSupported(): boolean {
  return (
    soundFeatureEnabled() &&
    typeof window !== 'undefined' &&
    typeof window.AudioContext === 'function'
  );
}

// Created only inside a user gesture (iOS/Safari), and only while sound is on.
function unlock(): boolean {
  if (ctx) return true;
  if (!getSoundSettings().on) return false;
  try {
    if (!soundSupported()) return false;
    ctx = new window.AudioContext();
    return true;
  } catch {
    ctx = null;
    return false;
  }
}

/**
 * Listens on the document for the gestures iOS counts as user activation (pointerdown alone is
 * not one for touch: pointerup, touchend and click are). Each gesture creates the context when
 * sound is on and none exists (or it closed), and resumes it unless it is running. The
 * listeners stay until the context is actually running; the remover detaches them earlier.
 */
export function installSoundUnlock(): () => void {
  if (!soundSupported()) return () => {};
  const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
  const remove = () => {
    for (const e of events) document.removeEventListener(e, onGesture, true);
  };
  function onGesture() {
    if (ctx?.state === 'closed') {
      ctx = null;
      stopPrevious = null;
    }
    if (!unlock()) return;
    const c = ctx as AudioContext;
    if (c.state === 'running') return remove();
    try {
      void Promise.resolve(c.resume())
        .then(() => {
          if (ctx === c && c.state === 'running') remove();
        })
        .catch(() => {});
    } catch {
      /* resume is best effort; the next gesture tries again */
    }
  }
  for (const e of events) document.addEventListener(e, onGesture, true);
  return remove;
}

function voiceBusy(): boolean {
  try {
    if (isClipPlaying()) return true;
    return typeof window !== 'undefined' && window.speechSynthesis?.speaking === true;
  } catch {
    return false;
  }
}

/** Plays one effect. True only when a sound was actually scheduled. */
export function playSfx(kind: SfxKind): boolean {
  const { on, volume } = getSoundSettings();
  const peak = sfxPeak(volume);
  if (!ctx || !on || peak <= 0 || voiceBusy()) return false;
  if (ctx.state === 'closed') {
    // A closed context can never sound again: drop it and build a fresh one (sound is on here).
    ctx = null;
    stopPrevious = null;
    if (!unlock()) return false;
  }
  const c = ctx as AudioContext;
  try {
    stopPrevious?.();
    stopPrevious = null;
    if (c.state !== 'running') void Promise.resolve(c.resume()).catch(() => {});
    const t0 = c.currentTime + LEAD_S;
    const nodes: { osc: OscillatorNode; gain: GainNode }[] = [];
    const stopAll = () => {
      for (const { osc, gain } of nodes) {
        try {
          // Fade over a few ms instead of cutting a sounding note (a cut clicks).
          const now = c.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setTargetAtTime(FLOOR, now, 0.005);
          osc.stop(now + 0.03);
        } catch {
          /* already stopped */
        }
      }
    };
    stopPrevious = stopAll;
    for (const n of NOTES[kind]) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      nodes.push({ osc, gain });
      const start = t0 + n.at / 1000;
      const end = start + n.len / 1000;
      osc.type = n.wave;
      osc.frequency.value = n.f;
      gain.gain.setValueAtTime(FLOOR, start);
      gain.gain.linearRampToValueAtTime(peak, start + ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(FLOOR, end);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(start);
      osc.stop(end + LEAD_S);
    }
    return true;
  } catch {
    stopPrevious?.();
    stopPrevious = null;
    return false;
  }
}
