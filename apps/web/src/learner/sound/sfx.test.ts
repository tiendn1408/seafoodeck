import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pilot/Media', () => ({ isClipPlaying: vi.fn(() => false) }));

type Call = { op: string; at?: number; seq: number };
interface FakeOsc {
  type: string;
  frequency: { value: number };
  calls: Call[];
}
interface Auto {
  op: string;
  v?: number;
  t: number;
  tc?: number;
}
interface FakeGain {
  peak: number | null;
  auto: Auto[];
}

let seq = 0;
let contexts: FakeContext[] = [];
let ctorCalls = 0;

class FakeContext {
  currentTime = 1;
  state = 'suspended';
  destination = {};
  oscillators: FakeOsc[] = [];
  gains: FakeGain[] = [];
  // refuse: resume() settles but the context stays suspended (no user activation).
  static refuse = false;
  resume = vi.fn(() => {
    if (!FakeContext.refuse) this.state = 'running';
    return Promise.resolve();
  });
  close = vi.fn(() => Promise.resolve());
  constructor() {
    ctorCalls++;
    contexts.push(this);
  }
  createOscillator() {
    const osc: FakeOsc & Record<string, unknown> = {
      type: 'sine',
      frequency: { value: 0 },
      calls: [],
      connect: () => {},
      disconnect: () => {},
      start: (at?: number) => osc.calls.push({ op: 'start', at, seq: seq++ }),
      stop: (at?: number) => osc.calls.push({ op: 'stop', at, seq: seq++ }),
    };
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    const g: FakeGain = { peak: null, auto: [] };
    this.gains.push(g);
    return {
      gain: {
        setValueAtTime: (v: number, t: number) => g.auto.push({ op: 'set', v, t }),
        linearRampToValueAtTime: (v: number, t: number) => {
          g.peak = v;
          g.auto.push({ op: 'linear', v, t });
        },
        exponentialRampToValueAtTime: (v: number, t: number) => g.auto.push({ op: 'exp', v, t }),
        cancelScheduledValues: (t: number) => g.auto.push({ op: 'cancel', t }),
        setTargetAtTime: (v: number, t: number, tc: number) =>
          g.auto.push({ op: 'target', v, t, tc }),
      },
      connect: () => {},
      disconnect: () => {},
    };
  }
}

// Removers are collected so a failing assertion cannot leak document listeners into later tests.
const removers: (() => void)[] = [];
async function load() {
  vi.resetModules();
  const settings = await import('./soundSettings');
  const real = await import('./sfx');
  const media = await import('../../pilot/Media');
  const sfx = {
    ...real,
    installSoundUnlock: () => {
      const remove = real.installSoundUnlock();
      removers.push(remove);
      return remove;
    },
  };
  return { settings, sfx, media };
}

const gesture = (type = 'pointerdown') =>
  document.dispatchEvent(new Event(type, { bubbles: true }));
const startOf = (o: FakeOsc) => o.calls.find((c) => c.op === 'start')!.at!;
const endOf = (o: FakeOsc) => o.calls.filter((c) => c.op === 'stop')[0].at!;

beforeEach(() => {
  seq = 0;
  contexts = [];
  ctorCalls = 0;
  FakeContext.refuse = false;
  localStorage.clear();
  vi.stubGlobal('AudioContext', FakeContext);
});
afterEach(() => {
  for (const r of removers.splice(0)) r();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sfxPeak', () => {
  it('is volume * 0.3, clamped', async () => {
    const { sfx } = await load();
    expect(sfx.sfxPeak(0.25)).toBeCloseTo(0.075, 10);
    expect(sfx.sfxPeak(1)).toBe(0.3);
    expect(sfx.sfxPeak(2)).toBe(0.3);
    expect(sfx.sfxPeak(-1)).toBe(0);
    expect(sfx.sfxPeak(Number.NaN)).toBe(0);
  });
});

describe('unlock', () => {
  it('plays nothing before any gesture and creates no context', async () => {
    const { sfx } = await load();
    expect(sfx.playSfx('correct')).toBe(false);
    expect(ctorCalls).toBe(0);
  });

  it('creates and resumes one context on the first gesture only', async () => {
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    gesture();
    expect(ctorCalls).toBe(1);
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    gesture();
    gesture('keydown');
    expect(ctorCalls).toBe(1);
    remove();
  });

  it('unlocks on keydown as well', async () => {
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    gesture('keydown');
    expect(ctorCalls).toBe(1);
    remove();
  });

  it('keeps listening while sound is off, then unlocks after it is switched on', async () => {
    const { sfx, settings } = await load();
    settings.updateSoundSettings({ on: false });
    const remove = sfx.installSoundUnlock();
    gesture();
    expect(ctorCalls).toBe(0);
    expect(sfx.playSfx('correct')).toBe(false);
    settings.updateSoundSettings({ on: true });
    gesture();
    expect(ctorCalls).toBe(1);
    expect(sfx.playSfx('correct')).toBe(true);
    remove();
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('keeps listening while the context stays suspended; a later click or pointerup resumes it', async () => {
    FakeContext.refuse = true;
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    gesture('pointerdown');
    await flush();
    expect(contexts[0].state).toBe('suspended');
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    FakeContext.refuse = false;
    gesture('pointerup');
    expect(contexts[0].resume).toHaveBeenCalledTimes(2);
    expect(contexts[0].state).toBe('running');
    expect(ctorCalls).toBe(1);
    remove();
  });

  it.each(['pointerup', 'touchend', 'click'])('unlocks on %s', async (type) => {
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    gesture(type);
    expect(ctorCalls).toBe(1);
    remove();
  });

  it('detaches its listeners once the context is running', async () => {
    const { sfx } = await load();
    sfx.installSoundUnlock();
    gesture();
    await flush();
    expect(contexts[0].state).toBe('running');
    contexts[0].state = 'suspended';
    gesture('click');
    gesture('keydown');
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
  });

  it('a context that closed is rebuilt and resumed on the next gesture', async () => {
    FakeContext.refuse = true;
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    gesture();
    await flush();
    contexts[0].state = 'closed';
    gesture('click');
    expect(ctorCalls).toBe(2);
    expect(contexts[1].resume).toHaveBeenCalledTimes(1);
    remove();
  });

  it('the remover detaches both listeners', async () => {
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    remove();
    gesture();
    gesture('keydown');
    expect(ctorCalls).toBe(0);
  });

  it('is a silent no-op without AudioContext', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    expect(() => gesture()).not.toThrow();
    expect(sfx.playSfx('done')).toBe(false);
    remove();
  });

  it('survives a constructor that throws', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('nope');
        }
      },
    );
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    expect(() => gesture()).not.toThrow();
    expect(sfx.playSfx('done')).toBe(false);
    remove();
  });
});

describe('unsupported (no unprefixed AudioContext)', () => {
  class Prefixed extends FakeContext {}
  it('soundSupported is false with only webkitAudioContext; true with AudioContext', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', Prefixed);
    const { sfx } = await load();
    expect(sfx.soundSupported()).toBe(false);
    vi.stubGlobal('AudioContext', FakeContext);
    expect(sfx.soundSupported()).toBe(true);
  });
  it('installs no listeners and the remover is a safe no-op', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', Prefixed);
    const { sfx } = await load();
    const add = vi.spyOn(document, 'addEventListener');
    const remove = sfx.installSoundUnlock();
    expect(add).not.toHaveBeenCalled();
    expect(() => remove()).not.toThrow();
    gesture();
    expect(ctorCalls).toBe(0);
    expect(sfx.playSfx('correct')).toBe(false);
  });
});

describe('context state', () => {
  it.each(['suspended', 'interrupted'])('resumes a %s context at play time', async (state) => {
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    gesture();
    contexts[0].state = state;
    contexts[0].resume.mockClear();
    expect(sfx.playSfx('neutral')).toBe(true);
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    remove();
  });
  it('does not resume a running context', async () => {
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    gesture();
    contexts[0].state = 'running';
    contexts[0].resume.mockClear();
    sfx.playSfx('neutral');
    expect(contexts[0].resume).not.toHaveBeenCalled();
    remove();
  });
  it('drops a closed context and builds a new one at the next play', async () => {
    const { sfx } = await load();
    const remove = sfx.installSoundUnlock();
    gesture();
    contexts[0].state = 'closed';
    expect(sfx.playSfx('neutral')).toBe(true);
    expect(ctorCalls).toBe(2);
    expect(contexts[0].oscillators).toHaveLength(0);
    expect(contexts[1].oscillators).toHaveLength(1);
    remove();
  });
  it('a closed context is not rebuilt when sound is off', async () => {
    const { sfx, settings } = await load();
    const remove = sfx.installSoundUnlock();
    gesture();
    contexts[0].state = 'closed';
    settings.updateSoundSettings({ on: false });
    expect(sfx.playSfx('neutral')).toBe(false);
    expect(ctorCalls).toBe(1);
    remove();
  });
});

describe('playSfx', () => {
  async function unlocked() {
    const l = await load();
    const remove = l.sfx.installSoundUnlock();
    gesture();
    return { ...l, remove, ctx: contexts[0] };
  }

  it.each([
    [
      'correct',
      [
        [660, 'sine', 0, 110],
        [880, 'sine', 90, 170],
      ],
    ],
    ['wrong', [[220, 'triangle', 0, 260]]],
    ['neutral', [[1200, 'sine', 0, 45]]],
    [
      'done',
      [
        [523, 'sine', 0, 120],
        [659, 'sine', 110, 120],
        [784, 'sine', 220, 220],
      ],
    ],
  ] as const)('%s schedules the accepted notes', async (kind, notes) => {
    const { sfx, ctx, remove } = await unlocked();
    expect(sfx.playSfx(kind)).toBe(true);
    expect(ctx.oscillators).toHaveLength(notes.length);
    const t0 = startOf(ctx.oscillators[0]);
    notes.forEach(([f, type, at, len], i) => {
      const o = ctx.oscillators[i];
      expect(o.frequency.value).toBe(f);
      expect(o.type).toBe(type);
      expect(startOf(o) - t0).toBeCloseTo(at / 1000, 6);
      expect(endOf(o) - startOf(o)).toBeGreaterThanOrEqual(len / 1000);
      expect(endOf(o) - ctx.currentTime).toBeLessThan(0.5);
      expect(ctx.gains[i].peak).toBeCloseTo(sfx.sfxPeak(0.25), 10);
    });
    remove();
  });

  it('shapes each note: start 0.0001, linear ramp to the peak in 8 ms, exponential to 0.0001 (never 0)', async () => {
    const { sfx, ctx, remove } = await unlocked();
    sfx.playSfx('correct');
    const peak = sfx.sfxPeak(0.25);
    [
      [0, 110],
      [90, 170],
    ].forEach(([at, len], i) => {
      const t0 = startOf(ctx.oscillators[0]);
      const start = t0 + at / 1000;
      const [set, lin, exp] = ctx.gains[i].auto;
      expect(set).toMatchObject({ op: 'set', v: 0.0001 });
      expect(set.t).toBeCloseTo(start, 9);
      expect(lin.op).toBe('linear');
      expect(lin.v).toBeCloseTo(peak, 10);
      expect(lin.t).toBeCloseTo(start + 0.008, 9);
      expect(exp.op).toBe('exp');
      expect(exp.v).toBe(0.0001);
      expect(exp.t).toBeCloseTo(start + len / 1000, 9);
    });
    remove();
  });

  it('uses the volume setting for the peak', async () => {
    const { sfx, settings, ctx, remove } = await unlocked();
    settings.updateSoundSettings({ volume: 1 });
    sfx.playSfx('neutral');
    expect(ctx.gains[0].peak).toBe(0.3);
    remove();
  });

  it('returns false at volume 0 and when sound is off', async () => {
    const { sfx, settings, ctx, remove } = await unlocked();
    settings.updateSoundSettings({ volume: 0 });
    expect(sfx.playSfx('correct')).toBe(false);
    settings.updateSoundSettings({ volume: 0.5, on: false });
    expect(sfx.playSfx('correct')).toBe(false);
    expect(ctx.oscillators).toHaveLength(0);
    remove();
  });

  it('is skipped while machine voice is speaking', async () => {
    const { sfx, ctx, remove } = await unlocked();
    vi.stubGlobal('speechSynthesis', { speaking: true });
    expect(sfx.playSfx('correct')).toBe(false);
    vi.stubGlobal('speechSynthesis', { speaking: false });
    expect(sfx.playSfx('correct')).toBe(true);
    expect(ctx.oscillators).toHaveLength(2);
    remove();
  });

  it('is skipped while a clip is playing', async () => {
    const { sfx, media, ctx, remove } = await unlocked();
    vi.mocked(media.isClipPlaying).mockReturnValue(true);
    expect(sfx.playSfx('wrong')).toBe(false);
    expect(ctx.oscillators).toHaveLength(0);
    vi.mocked(media.isClipPlaying).mockReturnValue(false);
    remove();
  });

  it('a new effect stops the previous one before it starts', async () => {
    const { sfx, ctx, remove } = await unlocked();
    sfx.playSfx('correct');
    sfx.playSfx('neutral');
    const [a, b, c] = ctx.oscillators;
    const cut = (o: FakeOsc) => o.calls.filter((x) => x.op === 'stop').at(-1)!;
    expect(cut(a).seq).toBeLessThan(c.calls[0].seq);
    expect(cut(b).seq).toBeLessThan(c.calls[0].seq);
    // Faded out over a few ms, then stopped: no click.
    for (const [o, g] of [
      [a, ctx.gains[0]],
      [b, ctx.gains[1]],
    ] as const) {
      const tail = g.auto.slice(-2);
      expect(tail[0]).toMatchObject({ op: 'cancel', t: ctx.currentTime });
      expect(tail[1]).toMatchObject({ op: 'target', v: 0.0001, t: ctx.currentTime, tc: 0.005 });
      expect(cut(o).at).toBeCloseTo(ctx.currentTime + 0.03, 9);
    }
    remove();
  });

  it('returns false instead of throwing when Web Audio fails', async () => {
    const { sfx, ctx, remove } = await unlocked();
    ctx.createOscillator = () => {
      throw new Error('broken');
    };
    expect(() => sfx.playSfx('correct')).not.toThrow();
    expect(sfx.playSfx('correct')).toBe(false);
    remove();
  });
});
