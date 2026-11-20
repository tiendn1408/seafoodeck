import type { Score } from '../../pilot/api';

/** One answer to send: the idempotency key travels with the job so every retry reuses it. */
export type Job = { gameId: string; questionId: string; key: string; answer: unknown };
export type QueueEvent =
  | { kind: 'pending' }
  | { kind: 'done'; job: Job; score: Score }
  | { kind: 'failed'; job: Job; error: Error };
export type SubmitQueue = {
  enqueue(job: Job): void;
  pendingCount(): number;
  failures(): { job: Job; error: Error }[];
  /** Settles a failed question another way (the server already holds its answer). */
  forget(questionId: string): void;
  subscribe(fn: (e: QueueEvent) => void): () => void;
  flush(): Promise<void>;
  /** Stops for good: cancels retries, drops listeners and jobs, ignores late results. */
  dispose(): void;
};

/** Delays between retries; after the last one the job is reported as failed. */
export const RETRY_MS = [1000, 2000, 4000, 8000, 15000];
/** The server's transient serialization-conflict reply (409, `code: 'BUSY'`). */
export const BUSY_MESSAGE = 'Hệ thống đang bận, vui lòng thử lại.';

/** No response at all: offline, timeout, DNS. */
export function isNetworkError(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status !== 'number' || status === 0;
}

/**
 * Worth sending again with the same key: a network error, a 5xx, or the server's BUSY 409.
 * Any other 4xx, including the final 409s (same key with another payload, question already
 * answered), is not.
 */
function retriable(e: unknown): boolean {
  if (isNetworkError(e)) return true;
  const { status, code, message } = e as { status: number; code?: string; message?: string };
  if (status >= 500) return true;
  return status === 409 && (code === 'BUSY' || message === BUSY_MESSAGE);
}

/**
 * Background sending of answers that need no grading to continue (self-rated cards): one job
 * per question (a second enqueue while pending or after success is ignored), sent one at a
 * time in order, retried with growing delays on network errors, 5xx and BUSY 409s.
 */
export function createSubmitQueue(
  send: (job: Job) => Promise<Score>,
  opts: { retryMs?: number[] } = {},
): SubmitQueue {
  const retryMs = opts.retryMs ?? RETRY_MS;
  const queue: Job[] = [];
  const sent = new Set<string>();
  const failed = new Map<string, { job: Job; error: Error }>();
  const listeners = new Set<(e: QueueEvent) => void>();
  let waiters: (() => void)[] = [];
  let running = false;
  let disposed = false;
  let sleeping: { timer: ReturnType<typeof setTimeout>; wake: () => void } | null = null;
  const emit = (e: QueueEvent) => {
    for (const fn of [...listeners]) {
      try {
        fn(e);
      } catch (err) {
        // A broken listener must never change what the queue sends.
        console.error('submit queue listener failed', err);
      }
    }
  };
  const settle = () => {
    if (queue.length) return;
    const w = waiters;
    waiters = [];
    w.forEach((r) => r());
  };
  const wait = (ms: number) =>
    new Promise<void>((wake) => {
      sleeping = { timer: setTimeout(wake, ms), wake };
    }).finally(() => (sleeping = null));

  async function run() {
    if (running) return;
    running = true;
    while (queue.length && !disposed) {
      const job = queue[0];
      let outcome: QueueEvent | null = null;
      for (let attempt = 0; !disposed; attempt++) {
        try {
          const score = await send(job);
          outcome = { kind: 'done', job, score };
          break;
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          if (retriable(e) && attempt < retryMs.length) {
            await wait(retryMs[attempt]);
            continue;
          }
          outcome = { kind: 'failed', job, error };
          break;
        }
      }
      if (disposed || !outcome) break;
      queue.shift();
      if (outcome.kind === 'done') sent.add(job.questionId);
      else failed.set(job.questionId, { job, error: outcome.error });
      emit(outcome);
    }
    running = false;
    if (disposed) return;
    emit({ kind: 'pending' });
    settle();
  }

  return {
    enqueue(job) {
      if (disposed) return;
      if (sent.has(job.questionId) || queue.some((j) => j.questionId === job.questionId)) return;
      failed.delete(job.questionId);
      queue.push(job);
      emit({ kind: 'pending' });
      void run();
    },
    pendingCount: () => queue.length,
    failures: () => [...failed.values()],
    forget(questionId) {
      if (!failed.delete(questionId)) return;
      sent.add(questionId);
      emit({ kind: 'pending' });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    flush() {
      return queue.length ? new Promise<void>((r) => waiters.push(r)) : Promise.resolve();
    },
    dispose() {
      disposed = true;
      listeners.clear();
      queue.length = 0;
      failed.clear();
      const s = sleeping as { timer: ReturnType<typeof setTimeout>; wake: () => void } | null;
      if (s) {
        clearTimeout(s.timer);
        s.wake();
      }
      settle();
    },
  };
}
