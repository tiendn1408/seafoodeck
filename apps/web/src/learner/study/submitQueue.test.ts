import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type Score } from '../../pilot/api';
import { createSubmitQueue, type Job, type QueueEvent } from './submitQueue';

const job = (questionId: string, key = 'key-' + questionId): Job => ({
  gameId: 'g1',
  questionId,
  key,
  answer: { rating: 'known' },
});
const score = (questionId: string) =>
  ({
    answered: true,
    skipped: false,
    correct: true,
    selfRated: true,
    questionId,
    targetId: 't-' + questionId,
    skill: 'name:en',
    contentVersion: 'rel-1',
    explanation: '',
    progress: [],
  }) as Score;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSubmitQueue', () => {
  it('two enqueues of one question send it once', async () => {
    const send = vi.fn(async (j: Job) => score(j.questionId));
    const q = createSubmitQueue(send);
    q.enqueue(job('q1'));
    q.enqueue(job('q1'));
    expect(q.pendingCount()).toBe(1);
    await q.flush();
    q.enqueue(job('q1'));
    await q.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(q.pendingCount()).toBe(0);
  });

  it('a network error is retried after a delay with the same idempotency key', async () => {
    const keys: string[] = [];
    let n = 0;
    const send = vi.fn(async (j: Job) => {
      keys.push(j.key);
      if (n++ === 0) throw new ApiError('Không kết nối được máy chủ.', 0);
      return score(j.questionId);
    });
    const events: QueueEvent[] = [];
    const q = createSubmitQueue(send, { retryMs: [100, 200] });
    q.subscribe((e) => events.push(e));
    q.enqueue(job('q1', 'idem-key-1'));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(q.pendingCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(99);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(keys).toEqual(['idem-key-1', 'idem-key-1']);
    expect(q.pendingCount()).toBe(0);
    expect(events.filter((e) => e.kind === 'done')).toEqual([
      { kind: 'done', job: job('q1', 'idem-key-1'), score: score('q1') },
    ]);
  });

  it('retries 409 and 5xx, but stops on another 4xx and reports the error', async () => {
    const replies: (Error | null)[] = [
      new ApiError('Hệ thống đang bận, vui lòng thử lại.', 409),
      new ApiError('Lỗi máy chủ.', 503),
      null,
      new ApiError('Payload/idempotency key không hợp lệ.', 400),
    ];
    const send = vi.fn(async (j: Job) => {
      const r = replies.shift();
      if (r) throw r;
      return score(j.questionId);
    });
    const events: QueueEvent[] = [];
    const q = createSubmitQueue(send, { retryMs: [10, 10, 10] });
    q.subscribe((e) => events.push(e));
    q.enqueue(job('q1'));
    q.enqueue(job('q2'));
    await vi.advanceTimersByTimeAsync(100);
    expect(send.mock.calls.map(([j]) => j.questionId)).toEqual(['q1', 'q1', 'q1', 'q2']);
    expect(q.pendingCount()).toBe(0);
    const failed = events.filter((e) => e.kind === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      job: { questionId: 'q2' },
      error: { message: 'Payload/idempotency key không hợp lệ.' },
    });
    expect(q.failures().map((f) => f.job.questionId)).toEqual(['q2']);
  });

  it('gives up after the last delay and lets a failed job be enqueued again', async () => {
    let down = true;
    const send = vi.fn(async (j: Job) => {
      if (down) throw new ApiError('offline', 0);
      return score(j.questionId);
    });
    const q = createSubmitQueue(send, { retryMs: [10] });
    q.enqueue(job('q1'));
    await vi.advanceTimersByTimeAsync(50);
    expect(send).toHaveBeenCalledTimes(2);
    expect(q.pendingCount()).toBe(0);
    expect(q.failures()).toHaveLength(1);
    down = false;
    q.enqueue(job('q1'));
    expect(q.failures()).toHaveLength(0);
    await q.flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.every(([j]) => j.key === 'key-q1')).toBe(true);
  });

  it('sends one at a time, in enqueue order', async () => {
    const order: string[] = [];
    let active = 0,
      most = 0;
    const send = vi.fn(async (j: Job) => {
      active++;
      most = Math.max(most, active);
      order.push(j.questionId);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return score(j.questionId);
    });
    const q = createSubmitQueue(send);
    for (const id of ['q1', 'q2', 'q3']) q.enqueue(job(id));
    expect(q.pendingCount()).toBe(3);
    const flushed = q.flush();
    await vi.advanceTimersByTimeAsync(20);
    await flushed;
    expect(order).toEqual(['q1', 'q2', 'q3']);
    expect(most).toBe(1);
  });

  it('flush waits for every job, retries included', async () => {
    let n = 0;
    const send = vi.fn(async (j: Job) => {
      if (n++ < 2) throw new TypeError('Failed to fetch');
      return score(j.questionId);
    });
    const q = createSubmitQueue(send, { retryMs: [30, 30] });
    q.enqueue(job('q1'));
    let done = false;
    void q.flush().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(40);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(40);
    expect(done).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('notifies subscribers of pending changes and stops after unsubscribe', async () => {
    const send = vi.fn(async (j: Job) => score(j.questionId));
    const q = createSubmitQueue(send);
    const seen: number[] = [];
    const off = q.subscribe(() => seen.push(q.pendingCount()));
    q.enqueue(job('q1'));
    await q.flush();
    expect(seen[0]).toBe(1);
    expect(seen.at(-1)).toBe(0);
    off();
    const before = seen.length;
    q.enqueue(job('q2'));
    await q.flush();
    expect(seen.length).toBe(before);
  });
});
