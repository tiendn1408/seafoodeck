import { useCallback, useEffect, useReducer, useState } from 'react';
import { api } from '../pilot/api';

export { setAuthRequiredHandler } from '../pilot/api';

/** In-memory stale-while-revalidate cache for /me/* reads; never persisted. */
const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();
const inflight = new Map<string, number>();
const refetchers = new Set<{ path: string; run: () => void }>();
let epoch = 0;
const notify = () => listeners.forEach((l) => l());

/** Empties the cache. Mounted hooks show no data until their key changes or `refresh()` is called; nothing refetches. */
export function clearMe(): void {
  epoch++;
  cache.clear();
  notify();
}

/** Refetch active `useMe` hooks (all, or those on `path`), e.g. after a study session. */
export function refreshMe(path?: string): void {
  for (const r of [...refetchers]) if (path === undefined || r.path === path) r.run();
}

export function useMe<T>(path: string, userId: string | undefined) {
  const key = userId === undefined ? null : `${userId}:${path}`;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [tick, setTick] = useState(0);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => {
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);
  useEffect(() => {
    if (key === null) return;
    const run = () => setTick((n) => n + 1);
    const entry = { path, run };
    refetchers.add(entry);
    return () => void refetchers.delete(entry);
  }, [key, path]);
  useEffect(() => {
    if (key === null) return;
    const c = new AbortController();
    const started = epoch;
    inflight.set(key, (inflight.get(key) ?? 0) + 1);
    notify();
    api<T>(path, undefined, c.signal)
      .then((data) => {
        if (c.signal.aborted) return;
        if (started !== epoch) return;
        cache.set(key, data);
        setFailure(null);
        notify();
      })
      .catch((e: Error) => {
        if (c.signal.aborted || e.name === 'AbortError' || started !== epoch) return;
        setFailure({ key, message: e.message || 'Không tải được dữ liệu.' });
      })
      .finally(() => {
        const n = (inflight.get(key) ?? 1) - 1;
        if (n > 0) inflight.set(key, n);
        else inflight.delete(key);
        if (!c.signal.aborted) notify();
      });
    return () => c.abort();
  }, [key, path, tick]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  // Read straight from the cache by the current key so another user's data is never returned.
  const data = key === null ? null : ((cache.get(key) as T | undefined) ?? null);
  return {
    data,
    error: failure && failure.key === key ? failure.message : '',
    stale: key !== null && data !== null && inflight.has(key),
    refresh,
  };
}
