import { act, createElement, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { unmountAll } from '../testDom';
import {
  SECONDS_PER_QUESTION,
  loadRemainingMs,
  saveRemainingMs,
  timerBudgetMs,
  useSessionTimer,
} from './sessionTimer';

type Opts = Parameters<typeof useSessionTimer>[0];
const KEY = (id: string) => `seafoodeck.timer.v1:${id}`;

let latest: { remainingMs: number; expired: boolean };
function Probe(props: Opts) {
  const r = useSessionTimer(props);
  useEffect(() => {
    latest = r;
  });
  return null;
}
const base = (over: Partial<Opts> = {}): Opts => ({
  gameId: 'g1',
  totalMs: 45000,
  enabled: true,
  running: true,
  onExpire: () => {},
  ...over,
});
let root: Root | null = null;
function render(over: Partial<Opts> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Probe, base(over))));
  return {
    rerender(next: Partial<Opts>) {
      act(() => root!.render(createElement(Probe, base(next))));
    },
    unmount() {
      act(() => root!.unmount());
      root = null;
    },
  };
}
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  unmountAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('budget and storage helpers', () => {
  it('is 15 seconds per question', () => {
    expect(SECONDS_PER_QUESTION).toBe(15);
    expect(timerBudgetMs(3)).toBe(45000);
  });
  it('clamps or ignores bad saved values', () => {
    localStorage.setItem(KEY('a'), '99999');
    expect(loadRemainingMs('a', 45000)).toBe(45000);
    localStorage.setItem(KEY('a'), '-5');
    expect(loadRemainingMs('a', 45000)).toBe(0);
    localStorage.setItem(KEY('a'), 'abc');
    expect(loadRemainingMs('a', 45000)).toBe(45000);
    localStorage.setItem(KEY('a'), 'Infinity');
    expect(loadRemainingMs('a', 45000)).toBe(45000);
    expect(loadRemainingMs('missing', 45000)).toBe(45000);
  });
  it('saves a clamped integer', () => {
    saveRemainingMs('a', 1234.7);
    expect(localStorage.getItem(KEY('a'))).toBe('1235');
  });
  it('survives throwing storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadRemainingMs('a', 100)).toBe(100);
    expect(() => saveRemainingMs('a', 50)).not.toThrow();
  });
});

describe('useSessionTimer', () => {
  it('counts down to zero, expires exactly once', () => {
    const onExpire = vi.fn();
    render({ onExpire });
    expect(latest).toEqual({ remainingMs: 45000, expired: false });
    advance(20000);
    expect(latest.remainingMs).toBeGreaterThanOrEqual(24500);
    expect(latest.remainingMs).toBeLessThanOrEqual(25000);
    expect(onExpire).not.toHaveBeenCalled();
    advance(30000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(latest).toEqual({ remainingMs: 0, expired: true });
    advance(10000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KEY('g1'))).toBe('0');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('measures wall-clock time, not ticks (a throttled interval)', () => {
    const onExpire = vi.fn();
    render({ onExpire });
    act(() => {
      vi.setSystemTime(Date.now() + 60000);
      vi.advanceTimersByTime(250);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(latest.expired).toBe(true);
  });

  it('updates about four times a second, not every frame', () => {
    let renders = 0;
    function Counting(p: Opts) {
      renders++;
      const r = useSessionTimer(p);
      useEffect(() => {
        latest = r;
      });
      return null;
    }
    const host = document.createElement('div');
    root = createRoot(host);
    act(() => root!.render(createElement(Counting, base())));
    const before = renders;
    for (let i = 0; i < 20; i++) advance(100); // 2 s in small steps
    expect(renders - before).toBeLessThanOrEqual(9);
    expect(renders - before).toBeGreaterThanOrEqual(6);
  });

  it('running false freezes; resuming continues from the frozen value', () => {
    const r = render();
    advance(10000);
    r.rerender({ running: false });
    const frozen = latest.remainingMs;
    expect(frozen).toBeLessThanOrEqual(35000);
    expect(frozen).toBeGreaterThanOrEqual(34500);
    expect(vi.getTimerCount()).toBe(0);
    advance(60000);
    expect(latest.remainingMs).toBe(frozen); // unchanged while paused
    expect(latest.expired).toBe(false);
    r.rerender({ running: true });
    advance(5000);
    expect(latest.remainingMs).toBeGreaterThanOrEqual(frozen - 5000 - 250);
    expect(latest.remainingMs).toBeLessThanOrEqual(frozen - 4750);
  });

  it('saves on unmount and a new mount with the same gameId continues', () => {
    const r = render();
    advance(15000);
    r.unmount();
    expect(vi.getTimerCount()).toBe(0);
    const saved = Number(localStorage.getItem(KEY('g1')));
    expect(saved).toBeLessThanOrEqual(30000);
    expect(saved).toBeGreaterThanOrEqual(29750);
    advance(60000);
    render();
    expect(latest.remainingMs).toBe(saved);
    expect(latest.expired).toBe(false);
  });

  it('persists about once a second while running', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render();
    advance(5000);
    const n = setItem.mock.calls.filter(([k]) => k === KEY('g1')).length;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(6);
  });

  it('a different gameId has its own clock', () => {
    const r = render({ gameId: 'one' });
    advance(10000);
    r.rerender({ gameId: 'two' });
    expect(latest.remainingMs).toBe(45000);
    expect(localStorage.getItem(KEY('one'))).not.toBeNull();
  });

  it('clamps a saved value larger than the budget', () => {
    localStorage.setItem(KEY('g1'), '999999');
    render();
    expect(latest.remainingMs).toBe(45000);
  });

  it('ignores negative and non-numeric saved values sensibly', () => {
    localStorage.setItem(KEY('g1'), 'abc');
    render();
    expect(latest.remainingMs).toBe(45000);
  });

  it('enabled false neither counts nor expires', () => {
    const onExpire = vi.fn();
    render({ enabled: false, onExpire });
    expect(vi.getTimerCount()).toBe(0);
    advance(120000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(latest).toEqual({ remainingMs: 45000, expired: false });
  });

  it('works with throwing storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const onExpire = vi.fn();
    render({ onExpire });
    advance(46000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(latest.expired).toBe(true);
  });

  it('a restored 0 is expired and does not call onExpire again', () => {
    localStorage.setItem(KEY('g1'), '0');
    const onExpire = vi.fn();
    render({ onExpire });
    expect(latest).toEqual({ remainingMs: 0, expired: true });
    advance(10000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('enabled going false then true continues from the saved time', () => {
    const r = render();
    advance(10000);
    r.rerender({ enabled: false });
    const saved = Number(localStorage.getItem(KEY('g1')));
    expect(saved).toBeLessThanOrEqual(35000);
    expect(saved).toBeGreaterThanOrEqual(34750);
    advance(60000);
    r.rerender({ enabled: true });
    expect(latest.remainingMs).toBeGreaterThanOrEqual(saved);
    expect(latest.remainingMs).toBeLessThanOrEqual(saved + 250);
    advance(5000);
    expect(latest.remainingMs).toBeLessThanOrEqual(saved - 4750);
    expect(latest.expired).toBe(false);
  });

  it('a new onExpire each render neither resets the clock nor fires twice', () => {
    const calls: number[] = [];
    const r = render({ onExpire: () => calls.push(1) });
    for (let i = 0; i < 5; i++) {
      advance(1000);
      r.rerender({ onExpire: () => calls.push(1) });
    }
    expect(latest.remainingMs).toBeLessThanOrEqual(40250);
    advance(50000);
    expect(calls).toHaveLength(1);
  });

  it('does not leak intervals after unmount mid-countdown', () => {
    const r = render();
    advance(1000);
    expect(vi.getTimerCount()).toBe(1);
    r.unmount();
    expect(vi.getTimerCount()).toBe(0);
    const err = vi.spyOn(console, 'error');
    advance(60000);
    expect(err).not.toHaveBeenCalled();
  });
});
