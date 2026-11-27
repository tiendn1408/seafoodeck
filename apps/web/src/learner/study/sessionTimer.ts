import { useEffect, useRef, useState } from 'react';

export const SECONDS_PER_QUESTION = 15;

const KEY_PREFIX = 'seafoodeck.timer.v1:';
const TICK_MS = 250;
const SAVE_EVERY_MS = 1000;

export function timerBudgetMs(questionCount: number): number {
  return SECONDS_PER_QUESTION * 1000 * questionCount;
}

export function loadRemainingMs(gameId: string, fallbackMs: number): number {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + gameId);
    if (raw === null || raw.trim() === '') return fallbackMs;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallbackMs;
    return Math.min(fallbackMs, Math.max(0, n));
  } catch {
    return fallbackMs;
  }
}

export function saveRemainingMs(gameId: string, ms: number): void {
  try {
    localStorage.setItem(KEY_PREFIX + gameId, String(Math.max(0, Math.round(ms))));
  } catch {
    /* storage unavailable: the clock just is not remembered */
  }
}

type Opts = {
  gameId: string;
  totalMs: number;
  enabled: boolean;
  running: boolean;
  onExpire: () => void;
};
type View = { remainingMs: number; expired: boolean };

const viewOf = (ms: number): View => ({ remainingMs: ms, expired: ms <= 0 });

// Counts a session budget down by wall-clock deltas (so a throttled background tab stays
// accurate) and persists what is left per game id.
export function useSessionTimer({ gameId, totalMs, enabled, running, onExpire }: Opts): View {
  const key = `${gameId}|${totalMs}`;
  const [view, setView] = useState<{ key: string; v: View }>(() => ({
    key,
    v: viewOf(loadRemainingMs(gameId, totalMs)),
  }));
  // A different game (or budget) starts from its own saved time.
  if (view.key !== key) setView({ key, v: viewOf(loadRemainingMs(gameId, totalMs)) });

  // The precise remaining time lives here; `view` is what is rendered (at most one tick behind).
  const remaining = useRef(0);
  const loadedKey = useRef<string | null>(null);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (loadedKey.current !== key) {
      loadedKey.current = key;
      remaining.current = loadRemainingMs(gameId, totalMs);
    }
    if (!enabled || !running || remaining.current <= 0) return;
    let last = Date.now();
    let lastSave = last;
    let done = false;
    const advance = () => {
      const now = Date.now();
      remaining.current = Math.max(0, remaining.current - Math.max(0, now - last));
      last = now;
      return now;
    };
    const id = setInterval(() => {
      const now = advance();
      if (remaining.current <= 0) {
        done = true;
        clearInterval(id);
        saveRemainingMs(gameId, 0);
        setView({ key, v: viewOf(0) });
        onExpireRef.current();
        return;
      }
      setView({ key, v: viewOf(remaining.current) });
      if (now - lastSave >= SAVE_EVERY_MS) {
        lastSave = now;
        saveRemainingMs(gameId, remaining.current);
      }
    }, TICK_MS);
    return () => {
      clearInterval(id);
      if (done) return;
      advance();
      saveRemainingMs(gameId, remaining.current);
    };
  }, [gameId, totalMs, key, enabled, running]);

  return view.v;
}
