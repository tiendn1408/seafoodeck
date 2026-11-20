import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect, useState } from 'react';
import type { ApiQuestion, Game, ProgressEntry, Score } from '../../pilot/api';
import { button, click, mount, unmountAll } from '../testDom';
import { Study } from './Study';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const AT = '2026-11-19T08:00:00.000Z';
const DAY = 86_400_000;

type Reply = { resolve: (r: Response) => void; key: string; body: { key: string } };
let calls: string[];
let attempts: Reply[];
beforeEach(() => {
  calls = [];
  attempts = [];
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push(key);
      if (key === 'GET /catalog/overview')
        return Promise.resolve(
          json({
            releaseId: 'rel-1',
            internal: true,
            learnable: 0,
            groups: {},
            hsCases: 0,
            items: [],
          }),
        );
      if (key.endsWith('/reveal'))
        return Promise.resolve(
          json({ label: 'Cod', pronunciation: null, source: '', audioAssetId: null, audio: null }),
        );
      if (key === 'GET /learning/sessions/g1/summary')
        return Promise.resolve(
          json({
            total: 1,
            caught: 1,
            entries: [
              {
                targetId: 'cod',
                label: 'Cá tuyết',
                correct: true,
                skipped: false,
                nextReviewInDays: 9,
              },
            ],
          }),
        );
      if (key.endsWith('/attempts'))
        return new Promise<Response>((resolve) =>
          attempts.push({ resolve, key, body: JSON.parse(String(init?.body)) }),
        );
      return Promise.resolve(json({ message: 'unrouted ' + key }, 404));
    }),
  );
});
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
  localStorage.clear();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 5))));

const card = (id: string, prompt = 'Tên tiếng Anh', result?: Score): ApiQuestion => ({
  id,
  type: 'flashcard',
  prompt,
  front: 'Cá tuyết',
  unavailable: false,
  ...(result ? { result } : {}),
});
const game = (questions: ApiQuestion[]): Game => ({
  id: 'g1',
  releaseId: 'rel-1',
  internal: true,
  mode: 'flashcard',
  expiresAt: '2026-11-19T10:00:00.000Z',
  questions,
});
const progress = (skill: string, days: number): ProgressEntry => ({
  targetId: 'cod',
  skill,
  stage: 1,
  dueAt: new Date(Date.parse(AT) + days * DAY).toISOString(),
  level: 2,
});
const serverScore = (questionId: string, skill: string, extra: Partial<Score> = {}): Score => ({
  answered: true,
  skipped: false,
  correct: true,
  selfRated: true,
  questionId,
  targetId: 'cod',
  targetLabel: 'Cá tuyết',
  skill,
  contentVersion: 'rel-1',
  explanation: '',
  at: AT,
  ...extra,
});

let latest: Game;
const seen = (g: Game) => void (latest = g);
function Host({ initial, userKind }: { initial: Game; userKind: 'student' | 'trial' | 'staff' }) {
  const [g, setG] = useState(initial);
  useEffect(() => seen(g), [g]);
  return <Study game={g} userKind={userKind} onChange={setG} onRetry={() => {}} pending={false} />;
}
async function rate(host: HTMLElement, label: 'Đã nhớ' | 'Chưa nhớ') {
  await click(button(host, 'Chạm để lật thẻ'));
  await tick();
  await click(button(host, label));
}
const saving = (host: HTMLElement) => host.textContent?.includes('Đang lưu…') ?? false;

describe('Study self-rated cards', () => {
  it('a rating advances at once, shows "Đang lưu…", then takes the server score', async () => {
    const host = mount(
      <Host initial={game([card('f1'), card('f2', 'Tên tiếng Nhật')])} userKind="student" />,
    );
    await tick();
    await rate(host, 'Đã nhớ');
    // The request is still in flight: the card already shows its feedback and "Tiếp tục".
    expect(attempts).toHaveLength(1);
    expect(host.textContent).toContain('Đã ghi tự đánh giá');
    expect(button(host, 'Tiếp tục')).toBeTruthy();
    expect(saving(host)).toBe(true);
    expect(latest.questions[0].result).toMatchObject({ correct: true, selfRated: true });
    expect(latest.questions[0].result?.progress).toBeUndefined();
    expect(attempts[0].body).toMatchObject({ answer: { rating: 'known' } });
    expect(attempts[0].body.key).toBe(
      JSON.parse(localStorage.getItem('seafood-deck:draft:g1:f1:key')!),
    );
    await act(async () =>
      attempts[0].resolve(
        json(serverScore('f1', 'name:en', { progress: [progress('name:en', 3)] })),
      ),
    );
    await tick();
    expect(saving(host)).toBe(false);
    expect(latest.questions[0].result?.progress).toEqual([progress('name:en', 3)]);
    expect(latest.questions[0].result?.provisional).toBeUndefined();
    expect(host.textContent).toContain('Đã lưu tự đánh giá');
  });

  it('the summary waits for the queue, then reads days from the progress rows', async () => {
    const host = mount(
      <Host initial={game([card('f1'), card('f2', 'Tên tiếng Nhật')])} userKind="student" />,
    );
    await tick();
    await rate(host, 'Đã nhớ');
    await click(button(host, 'Tiếp tục'));
    await rate(host, 'Đã nhớ');
    await click(button(host, 'Xem tổng kết'));
    expect(host.querySelector('#haul-title')).not.toBeNull();
    expect(saving(host)).toBe(true);
    // Jobs are sent one at a time.
    expect(attempts).toHaveLength(1);
    await act(async () =>
      attempts[0].resolve(
        json(serverScore('f1', 'name:en', { progress: [progress('name:en', 7)] })),
      ),
    );
    await tick();
    expect(attempts).toHaveLength(2);
    expect(saving(host)).toBe(true);
    await act(async () =>
      attempts[1].resolve(
        json(serverScore('f2', 'name:ja', { progress: [progress('name:ja', 3)] })),
      ),
    );
    await tick();
    expect(saving(host)).toBe(false);
    expect(host.querySelector('#haul-title')?.textContent).toBe('1 / 1 loài vào lưới');
    expect(host.querySelector('.haul-note')?.textContent).toContain('ôn lại sau 3 ngày');
    expect(calls.filter((c) => c.includes('/summary') || c.includes('/me'))).toEqual([]);
  });

  it('a trial haul says "Đã vào lưới" and never asks for /summary or /me', async () => {
    const host = mount(<Host initial={game([card('f1')])} userKind="trial" />);
    await tick();
    await rate(host, 'Chưa nhớ');
    await act(async () =>
      attempts[0].resolve(json(serverScore('f1', 'name:en', { correct: false }))),
    );
    await tick();
    await click(button(host, 'Xem tổng kết'));
    await tick();
    expect(host.querySelector('.haul-note')?.textContent).toContain('Sổng lưới');
    expect(calls.filter((c) => c.includes('/summary') || c.includes('/me'))).toEqual([]);
  });

  it('a permanently failed save shows "Thử gửi lại" and resends with the same key', async () => {
    const host = mount(<Host initial={game([card('f1')])} userKind="student" />);
    await tick();
    await rate(host, 'Đã nhớ');
    await act(async () =>
      attempts[0].resolve(json({ message: 'Payload/idempotency key không hợp lệ.' }, 400)),
    );
    await tick();
    expect(host.querySelector('.pilot-error')?.textContent).toContain(
      'Payload/idempotency key không hợp lệ.',
    );
    expect(saving(host)).toBe(false);
    await click(button(host, 'Thử gửi lại'));
    expect(attempts).toHaveLength(2);
    expect(attempts[1].body.key).toBe(attempts[0].body.key);
    expect(host.querySelector('.pilot-error')).toBeNull();
    await act(async () => attempts[1].resolve(json(serverScore('f1', 'name:en'))));
    await tick();
    expect(host.querySelector('.pilot-error')).toBeNull();
  });

  it('warns on tab close only while a save is pending', async () => {
    const host = mount(<Host initial={game([card('f1')])} userKind="student" />);
    await tick();
    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(false);
    await rate(host, 'Đã nhớ');
    expect(leave()).toBe(true);
    await act(async () => attempts[0].resolve(json(serverScore('f1', 'name:en'))));
    await tick();
    expect(leave()).toBe(false);
  });
});

describe('Study session summary after a reload', () => {
  const answered = game([card('f1', 'Tên tiếng Anh', serverScore('f1', 'name:en'))]);
  it('a re-opened student session reads days from GET /summary once', async () => {
    const host = mount(<Host initial={answered} userKind="student" />);
    await tick();
    await tick();
    expect(calls.filter((c) => c === 'GET /learning/sessions/g1/summary')).toHaveLength(1);
    expect(host.querySelector('.haul-note')?.textContent).toContain('ôn lại sau 9 ngày');
  });
  it.each(['trial', 'staff'] as const)('a re-opened %s session never asks for it', async (k) => {
    const host = mount(<Host initial={answered} userKind={k} />);
    await tick();
    await tick();
    expect(calls.filter((c) => c.includes('/summary') || c.includes('/me'))).toEqual([]);
    expect(host.querySelector('.haul-note')?.textContent).toContain('Đã vào lưới');
  });
});

describe('Study prefetch', () => {
  it('preloads only the next question image, skipping unavailable ones', async () => {
    const loaded: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        set src(v: string) {
          loaded.push(v);
        }
      },
    );
    const image = (id: string, url: string, unavailable = false): ApiQuestion => ({
      id,
      type: 'image',
      prompt: 'Nhìn hình, chọn đúng loài',
      options: [{ id: 'o1', label: 'Mực ống' }],
      image: { url, expiresIn: 120 },
      unavailable,
    });
    const g = {
      ...game([image('i1', 'u1'), image('i2', 'u2'), image('i3', 'u3', true)]),
      mode: 'image',
    };
    mount(<Host initial={g} userKind="trial" />);
    await tick();
    expect(loaded).toEqual(['u2']);
  });
});
