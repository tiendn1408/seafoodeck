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
  subscribe(fn: (e: QueueEvent) => void): () => void;
  flush(): Promise<void>;
};

/** Delays between retries; after the last one the job is reported as failed. */
export const RETRY_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * Worth sending again with the same key: no response at all (offline, timeout), a 409 (the
 * server's serialization conflict, "Hệ thống đang bận") or a 5xx. Any other 4xx is final.
 */
function retriable(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  if (typeof status !== 'number' || status === 0) return true;
  return status === 409 || status >= 500;
}

/**
 * Background sending of answers that need no grading to continue (self-rated cards): one job
 * per question (a second enqueue while pending or after success is ignored), sent one at a
 * time in order, retried with growing delays on network errors, 409 and 5xx.
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
  const emit = (e: QueueEvent) => [...listeners].forEach((fn) => fn(e));
  const settle = () => {
    if (queue.length) return;
    const w = waiters;
    waiters = [];
    w.forEach((r) => r());
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function run() {
    if (running) return;
    running = true;
    while (queue.length) {
      const job = queue[0];
      for (let attempt = 0; ; attempt++) {
        try {
          const score = await send(job);
          sent.add(job.questionId);
          queue.shift();
          emit({ kind: 'done', job, score });
          break;
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          if (retriable(e) && attempt < retryMs.length) {
            await wait(retryMs[attempt]);
            continue;
          }
          queue.shift();
          failed.set(job.questionId, { job, error });
          emit({ kind: 'failed', job, error });
          break;
        }
      }
    }
    running = false;
    emit({ kind: 'pending' });
    settle();
  }

  return {
    enqueue(job) {
      if (sent.has(job.questionId) || queue.some((j) => j.questionId === job.questionId)) return;
      failed.delete(job.questionId);
      queue.push(job);
      emit({ kind: 'pending' });
      void run();
    },
    pendingCount: () => queue.length,
    failures: () => [...failed.values()],
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    flush() {
      return queue.length ? new Promise<void>((r) => waiters.push(r)) : Promise.resolve();
    },
  };
}
