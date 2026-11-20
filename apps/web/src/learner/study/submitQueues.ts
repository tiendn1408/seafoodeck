import { api, ApiError, type Game, type Score } from '../../pilot/api';
import { createSubmitQueue, isNetworkError, type Job, type SubmitQueue } from './submitQueue';

/**
 * A change to the parent's latest game. It must be safe to call at any time: background saves
 * apply it whether or not the study screen is mounted.
 */
export type GameUpdate = (update: (g: Game) => Game) => void;

/** A request with no answer after this long is aborted and treated as a network error. */
export const SUBMIT_TIMEOUT_MS = 15_000;

/** The game with one question's result replaced (a no-op for another session's game). */
export function withResult(g: Game, gameId: string, questionId: string, result: Score): Game {
  if (g.id !== gameId) return g;
  return {
    ...g,
    questions: g.questions.map((x) => (x.id === questionId ? { ...x, result } : x)),
  };
}

async function sendAnswer(job: Job): Promise<Score> {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), SUBMIT_TIMEOUT_MS);
  try {
    return await api<Score>(
      `/learning/sessions/${job.gameId}/questions/${job.questionId}/attempts`,
      { key: job.key, answer: job.answer },
      c.signal,
    );
  } catch (e) {
    if (c.signal.aborted)
      throw new ApiError('Máy chủ không phản hồi kịp. Kiểm tra mạng và thử lại.', 0);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

type Entry = { queue: SubmitQueue; apply: GameUpdate; stop: () => void };
const queues = new Map<string, Entry>();

/**
 * The background queue of one session, shared by every mount of its study screen so a
 * learner who pauses and comes back sees the same pending saves and failures. Results are
 * applied through the most recent `onChange`.
 */
export function sessionQueue(
  gameId: string,
  onChange: GameUpdate,
  opts?: { retryMs?: number[] },
): SubmitQueue {
  const known = queues.get(gameId);
  if (known) {
    known.apply = onChange;
    return known.queue;
  }
  const queue = createSubmitQueue(sendAnswer, opts);
  const entry: Entry = { queue, apply: onChange, stop: () => {} };
  queue.subscribe((e) => {
    if (e.kind === 'done') entry.apply((g) => withResult(g, gameId, e.job.questionId, e.score));
    else if (e.kind === 'failed' && (e.error as ApiError).status === 409) adopt(entry, e.job);
  });

  // Warn before closing the tab while an answer has not reached the server.
  const warn = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = '';
  };
  let guarded = false;
  queue.subscribe(() => {
    const need = queue.pendingCount() > 0;
    if (need === guarded) return;
    guarded = need;
    if (need) window.addEventListener('beforeunload', warn);
    else window.removeEventListener('beforeunload', warn);
  });
  // A save that failed for lack of network goes again once the browser is back online.
  const online = () => {
    for (const f of queue.failures()) if (isNetworkError(f.error)) queue.enqueue(f.job);
  };
  window.addEventListener('online', online);
  entry.stop = () => {
    queue.dispose();
    window.removeEventListener('beforeunload', warn);
    window.removeEventListener('online', online);
  };
  queues.set(gameId, entry);
  return queue;
}

/**
 * A final 409 means the server already holds an answer for this question (or refuses this
 * payload): take the server's result instead of leaving the provisional one in place.
 */
function adopt(entry: Entry, job: Job) {
  api<Game>(`/learning/sessions/${job.gameId}`)
    .then((fresh) => {
      if (queues.get(job.gameId) !== entry) return;
      const result = fresh.questions.find((q) => q.id === job.questionId)?.result;
      if (!result) return;
      entry.apply((g) => withResult(g, job.gameId, job.questionId, result));
      entry.queue.forget(job.questionId);
    })
    .catch(() => {});
}

/** Stops every session queue (on logout): no more sends, timers or tab-close warnings. */
export function disposeAll(): void {
  for (const e of queues.values()) e.stop();
  queues.clear();
}

/** Answers not saved yet across every session: still queued, or failed for good. */
export function pendingTotal(): number {
  let n = 0;
  for (const { queue } of queues.values()) n += queue.pendingCount() + queue.failures().length;
  return n;
}

/**
 * Waits for every session queue to finish sending (before logout). True when every answer
 * reached the server; false when the wait timed out or a save failed for good.
 */
export async function flushAll(timeoutMs = 5000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => (timer = setTimeout(r, timeoutMs)));
  try {
    await Promise.race([Promise.all([...queues.values()].map((e) => e.queue.flush())), timeout]);
  } finally {
    clearTimeout(timer);
  }
  return pendingTotal() === 0;
}
