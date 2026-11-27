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

  // Declared first so its cleanup runs first on unmount: later cleanups must not set state then.
  const unmounting = useRef(false);
  const expiredFired = useRef(false);
  useEffect(() => {
    unmounting.current = false;
    return () => {
      unmounting.current = true;
    };
  }, []);

  useEffect(() => {
    if (loadedKey.current !== key) {
      loadedKey.current = key;
      remaining.current = loadRemainingMs(gameId, totalMs);
      // A restored 0 means the expiry already ran in an earlier mount.
      expiredFired.current = remaining.current <= 0;
    }
    if (!enabled || !running || remaining.current <= 0) return;
    let last = Date.now();
    let lastSave = last;
    const advance = () => {
      const now = Date.now();
      remaining.current = Math.max(0, remaining.current - Math.max(0, now - last));
      last = now;
      return now;
    };
    const expire = () => {
      saveRemainingMs(gameId, 0);
      if (expiredFired.current) return;
      expiredFired.current = true;
      if (!unmounting.current) {
        setView({ key, v: viewOf(0) });
        onExpireRef.current();
      }
    };
    const id = setInterval(() => {
      const now = advance();
      if (remaining.current <= 0) {
        clearInterval(id);
        expire();
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
      if (expiredFired.current) return;
      advance();
      if (remaining.current <= 0) {
        expire();
        return;
      }
      saveRemainingMs(gameId, remaining.current);
      // Show the precise frozen value (not on unmount: no state set then).
      if (!unmounting.current) setView({ key, v: viewOf(remaining.current) });
    };
  }, [gameId, totalMs, key, enabled, running]);

  return view.v;
}

/**
 * The idempotency key of a question's timeout attempt: the same for every retry, so the server
 * returns the stored result. Hyphens only (the API key rule rejects a colon).
 */
export function timeoutKey(gameId: string, questionId: string): string {
  return `timeout-${gameId}-${questionId}`;
}
