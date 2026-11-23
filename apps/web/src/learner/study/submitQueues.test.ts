import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Score } from '../../pilot/api';
import {
  adoptingTotal,
  disposeAll,
  flushAll,
  pendingTotal,
  sessionQueue,
  SUBMIT_TIMEOUT_MS,
} from './submitQueues';

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

  describe('final 409 while the server result is being adopted', () => {
    const conflict = () => Promise.resolve(json({ message: 'Câu đã nộp.' }, 409));
    it('is not counted as unsaved while adopt runs, and flushAll waits for adopt', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      replies[attempts('q1')] = conflict;
      replies['GET /learning/sessions/g1'] = () =>
        gate.then(() =>
          json({ ...game(), questions: [{ ...game().questions[0], result: score('q1') }] }),
        );
      const q = sessionQueue('g1', apply);
      q.enqueue(job('q1'));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      expect(q.failures()).toHaveLength(1);
      expect(pendingTotal()).toBe(0);
      expect(adoptingTotal()).toBe(1);
      let done: boolean | null = null;
      void flushAll(2000).then((v) => (done = v));
      await new Promise((r) => setTimeout(r, 20));
      expect(done).toBeNull();
      release();
      await new Promise((r) => setTimeout(r, 20));
      expect(done).toBe(true);
      expect(q.failures()).toEqual([]);
      expect(adoptingTotal()).toBe(0);
    });

    it('counts again when adopt fails', async () => {
      replies[attempts('q1')] = conflict;
      replies['GET /learning/sessions/g1'] = () => Promise.resolve(json({ message: 'x' }, 500));
      const q = sessionQueue('g1', apply);
      q.enqueue(job('q1'));
      expect(await flushAll(2000)).toBe(false);
      expect(pendingTotal()).toBe(1);
      expect(adoptingTotal()).toBe(0);
    });
  });

  describe('one shared online listener', () => {
    it('adds a single listener for many queues and removes it with the last one', () => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      const onlineAdds = () => add.mock.calls.filter((c) => c[0] === 'online').length;
      const onlineRemoves = () => remove.mock.calls.filter((c) => c[0] === 'online').length;
      sessionQueue('g1', apply);
      sessionQueue('g2', apply);
      sessionQueue('g3', apply);
      expect(onlineAdds()).toBe(1);
      disposeAll();
      expect(onlineRemoves()).toBe(1);
      sessionQueue('g1', apply);
      expect(onlineAdds()).toBe(2);
      add.mockRestore();
      remove.mockRestore();
    });

    it('the shared listener resends failed network jobs of every queue', async () => {
      let online = false;
      replies[attempts('q1')] = () =>
        online ? Promise.resolve(json(score('q1'))) : Promise.reject(new TypeError('offline'));
      replies['POST /learning/sessions/g2/questions/q1/attempts'] = () =>
        online ? Promise.resolve(json(score('q1'))) : Promise.reject(new TypeError('offline'));
      const a = sessionQueue('g1', apply, { retryMs: [] });
      const b = sessionQueue('g2', () => {}, { retryMs: [] });
      a.enqueue(job('q1'));
      b.enqueue({ ...job('q1'), gameId: 'g2' });
      await a.flush();
      await b.flush();
      online = true;
      window.dispatchEvent(new Event('online'));
      await a.flush();
      await b.flush();
      expect(a.failures()).toEqual([]);
      expect(b.failures()).toEqual([]);
    });
  });

  describe('pendingTotal and flushAll', () => {
    it('is zero and flushes at once with no queue', async () => {
      expect(pendingTotal()).toBe(0);
      await expect(flushAll(50)).resolves.toBe(true);
    });

    it('counts unsaved answers across sessions and resolves true once all are saved', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      replies[attempts('q1')] = () => gate.then(() => json(score('q1')));
      replies['POST /learning/sessions/g2/questions/q9/attempts'] = () =>
        gate.then(() => json(score('q9')));
      sessionQueue('g1', apply).enqueue(job('q1'));
      sessionQueue('g2', apply).enqueue({ ...job('q9'), gameId: 'g2' });
      expect(pendingTotal()).toBe(2);
      const done = flushAll(1000);
      release();
      await expect(done).resolves.toBe(true);
      expect(pendingTotal()).toBe(0);
    });

    it('resolves false on timeout while a save is still pending', async () => {
      vi.useFakeTimers();
      replies[attempts('q1')] = () => new Promise(() => {});
      sessionQueue('g1', apply).enqueue(job('q1'));
      const done = flushAll(5000);
      await vi.advanceTimersByTimeAsync(5000);
      await expect(done).resolves.toBe(false);
      expect(pendingTotal()).toBe(1);
    });

    it('a permanently failed save counts as unsaved and makes flushAll false', async () => {
      replies[attempts('q1')] = () => Promise.resolve(json({ message: 'hỏng' }, 400));
      const q = sessionQueue('g1', apply, { retryMs: [] });
      q.enqueue(job('q1'));
      await expect(flushAll(1000)).resolves.toBe(false);
      expect(q.pendingCount()).toBe(0);
      expect(pendingTotal()).toBe(1);
    });
  });
});
