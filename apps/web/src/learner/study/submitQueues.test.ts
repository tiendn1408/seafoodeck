import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Score } from '../../pilot/api';
import { disposeAll, sessionQueue, SUBMIT_TIMEOUT_MS } from './submitQueues';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const score = (questionId: string, extra: Partial<Score> = {}): Score => ({
  answered: true,
  skipped: false,
  correct: true,
  selfRated: true,
  questionId,
  targetId: 'cod',
  skill: 'name:en',
  contentVersion: 'rel-1',
  explanation: '',
  ...extra,
});
const provisional = (questionId: string) => score(questionId, { provisional: true });
const game = (): Game => ({
  id: 'g1',
  releaseId: 'rel-1',
  internal: true,
  mode: 'flashcard',
  expiresAt: 'x',
  questions: ['q1', 'q2'].map((id) => ({
    id,
    type: 'flashcard',
    prompt: 'Tên tiếng Anh',
    front: 'Cá tuyết',
    unavailable: false,
    result: provisional(id),
  })),
});
const job = (questionId: string) => ({
  gameId: 'g1',
  questionId,
  key: 'key-' + questionId,
  answer: { rating: 'known' },
});

let replies: Record<string, (init?: RequestInit) => Promise<Response>>;
let calls: string[];
let state: Game;
const apply = (u: (g: Game) => Game) => void (state = u(state));
beforeEach(() => {
  state = game();
  calls = [];
  replies = {};
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push(key);
      const r = replies[key];
      return r ? r(init) : Promise.resolve(json({ message: 'unrouted' }, 404));
    }),
  );
});
afterEach(() => {
  disposeAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const attempts = (qid: string) => `POST /learning/sessions/g1/questions/${qid}/attempts`;

describe('sessionQueue', () => {
  it('is one queue per session; a result is applied through the latest onChange', async () => {
    const first = sessionQueue('g1', () => {});
    const q = sessionQueue('g1', apply);
    expect(q).toBe(first);
    replies[attempts('q1')] = () => Promise.resolve(json(score('q1', { progress: [] })));
    q.enqueue(job('q1'));
    await q.flush();
    expect(state.questions[0].result).toEqual(score('q1', { progress: [] }));
    expect(sessionQueue('g2', apply)).not.toBe(q);
  });

  it('a final 409 adopts the result the server already holds for that question', async () => {
    replies[attempts('q1')] = () =>
      Promise.resolve(json({ message: 'Câu đã nộp; dùng lượt ôn riêng.' }, 409));
    replies['GET /learning/sessions/g1'] = () =>
      Promise.resolve(
        json({ ...game(), questions: [{ ...game().questions[0], result: score('q1') }] }),
      );
    replies[attempts('q2')] = () => Promise.resolve(json(score('q2')));
    const q = sessionQueue('g1', apply);
    q.enqueue(job('q1'));
    q.enqueue(job('q2'));
    await q.flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.filter((c) => c === attempts('q1'))).toHaveLength(1);
    expect(calls).toContain(attempts('q2'));
    expect(state.questions.map((x) => x.result)).toEqual([score('q1'), score('q2')]);
    expect(q.failures()).toEqual([]);
  });

  it('network failures are sent again when the browser comes back online', async () => {
    let online = false;
    replies[attempts('q1')] = () =>
      online ? Promise.resolve(json(score('q1'))) : Promise.reject(new TypeError('offline'));
    const q = sessionQueue('g1', apply, { retryMs: [] });
    q.enqueue(job('q1'));
    await q.flush();
    expect(q.failures()).toHaveLength(1);
    online = true;
    window.dispatchEvent(new Event('online'));
    await q.flush();
    expect(q.failures()).toEqual([]);
    expect(state.questions[0].result).toEqual(score('q1'));
  });

  it('a request with no answer is aborted after the timeout and retried', async () => {
    vi.useFakeTimers();
    let n = 0;
    replies[attempts('q1')] = (init) =>
      n++ === 0
        ? new Promise((_, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            ),
          )
        : Promise.resolve(json(score('q1')));
    const q = sessionQueue('g1', apply, { retryMs: [10] });
    q.enqueue(job('q1'));
    await vi.advanceTimersByTimeAsync(SUBMIT_TIMEOUT_MS - 1);
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(n).toBe(2);
    expect(q.pendingCount()).toBe(0);
    expect(state.questions[0].result).toEqual(score('q1'));
  });

  it('disposeAll stops every queue and its tab-close guard', async () => {
    replies[attempts('q1')] = () => new Promise(() => {});
    const q = sessionQueue('g1', apply);
    q.enqueue(job('q1'));
    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(true);
    disposeAll();
    expect(leave()).toBe(false);
    expect(q.pendingCount()).toBe(0);
    expect(sessionQueue('g1', apply)).not.toBe(q);
  });
});
