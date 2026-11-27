import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect, useState } from 'react';
import type { ApiQuestion, Game, Score } from '../../pilot/api';
import { button, mount, unmountAll } from '../testDom';
import { sessionCombo } from './combo';
import { Study } from './Study';
import { disposeAll } from './submitQueues';
import { resetTimerSettingForTests } from './timerSetting';

// The clock (setInterval + Date) is fake; setTimeout stays real so promises and React settle.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const AT = '2026-11-27T08:00:00.000Z';
const NOTICE = 'Hết giờ: các câu chưa làm tính là chưa chính xác.';

type Post = { qid: string; key: string; answer: Record<string, unknown> };
let posts: Post[];
let calls: string[];
let serverGame: Game | null;
/** Per question: how the next attempt answers ('network' rejects like a dropped connection). */
let plan: Record<string, Array<'network' | 'conflict' | 'skip' | 'hold'>>;
let held: Array<() => void>;
let warnings: string[];

const score = (qid: string, answer: Record<string, unknown>): Score => {
  const timeout = answer.timeout === true;
  return {
    answered: true,
    skipped: false,
    correct: !timeout && answer.optionId === 'o1',
    selfRated: false,
    questionId: qid,
    targetId: 'species-' + qid,
    targetLabel: 'Mực ống',
    skill: 'name',
    contentVersion: 'rel-1',
    explanation: timeout ? 'Hết giờ, tính là chưa chính xác. Vây dài.' : 'Vây dài.',
    at: AT,
    correctOption: 'o1',
  };
};
const skipped = (qid: string): Score => ({
  answered: false,
  skipped: true,
  correct: false,
  selfRated: false,
  questionId: qid,
  targetId: 'species-' + qid,
  targetLabel: 'Mực ống',
  skill: 'name',
  contentVersion: 'rel-1',
  explanation: 'Câu bỏ qua không tính đúng/sai hoặc tạo lịch ôn.',
  at: AT,
});

beforeEach(() => {
  posts = [];
  calls = [];
  serverGame = null;
  plan = {};
  held = [];
  warnings = [];
  localStorage.clear();
  resetTimerSettingForTests();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date(AT));
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('scrollTo', () => {});
  const error = console.error;
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
    error(...args);
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const path = String(url).replace('/api/v1', '');
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/catalog/overview')
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
      if (path === '/learning/sessions/g1' && serverGame) return Promise.resolve(json(serverGame));
      const m = /^\/learning\/sessions\/g1\/questions\/(\w+)\/attempts$/.exec(path);
      if (m) {
        const body = JSON.parse(String(init?.body));
        posts.push({ qid: m[1], key: body.key, answer: body.answer });
        const how = plan[m[1]]?.shift();
        if (how === 'network') return Promise.reject(new TypeError('Failed to fetch'));
        if (how === 'conflict')
          return Promise.resolve(json({ message: 'Câu đã nộp; dùng lượt ôn riêng.' }, 409));
        if (how === 'skip') return Promise.resolve(json(skipped(m[1])));
        if (how === 'hold')
          return new Promise<Response>((resolve) =>
            held.push(() => resolve(json(score(m[1], body.answer)))),
          );
        return Promise.resolve(json(score(m[1], body.answer)));
      }
      return Promise.resolve(json({ message: 'unrouted ' + path }, 404));
    }),
  );
});
afterEach(() => {
  unmountAll();
  disposeAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  resetTimerSettingForTests();
  expect(warnings.filter((w) => /not wrapped in act/.test(w))).toEqual([]);
});

const flush = async (times = 3) => {
  for (let i = 0; i < times; i++)
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
};
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const press = async (el: HTMLElement) => {
  await act(async () => {
    el.click();
    await new Promise((r) => setTimeout(r, 0));
  });
};

const result = (qid: string, extra: Partial<Score> = {}): Score => ({
  ...score(qid, { optionId: 'o1' }),
  ...extra,
});
const image = (id: string, extra: Partial<ApiQuestion> = {}): ApiQuestion => ({
  id,
  type: 'image',
  prompt: 'Nhìn hình, chọn đúng loài',
  options: [
    { id: 'o1', label: 'Mực ống' },
    { id: 'o2', label: 'Hải sâm' },
  ],
  image: { url: `https://example.invalid/${id}.jpg`, expiresIn: 120 },
  unavailable: false,
  ...extra,
});
const imageGame = (questions: ApiQuestion[]): Game => ({
  id: 'g1',
  releaseId: 'rel-1',
  internal: true,
  mode: 'image',
  expiresAt: '2026-11-27T10:00:00.000Z',
  questions,
});

let latest: Game;
function Host({ initial, userKind = 'trial' }: { initial: Game; userKind?: 'student' | 'trial' }) {
  const [g, setG] = useState(initial);
  const [shown, setShown] = useState(true);
  useEffect(() => void (latest = g), [g]);
  return (
    <>
      <button onClick={() => setShown((v) => !v)}>Ẩn hiện</button>
      {shown && (
        <Study game={g} userKind={userKind} onChange={setG} onRetry={() => {}} pending={false} />
      )}
    </>
  );
}
async function start(initial: Game, userKind?: 'student' | 'trial') {
  const host = mount(<Host initial={initial} userKind={userKind} />);
  await flush();
  return host;
}
const clock = (host: HTMLElement) =>
  host.querySelector('.study-bar [aria-label="Thời gian còn lại"]')?.textContent ?? null;
const toggle = (host: HTMLElement) => button(host, 'Tính giờ');
function settleImage(host: HTMLElement, type: 'load' | 'error' = 'load') {
  const img = host.querySelector('.study img')!;
  act(() => void img.dispatchEvent(new Event(type)));
}
const onSummary = (host: HTMLElement) => !!host.querySelector('#haul-title');
const by = (qid: string) => posts.filter((p) => p.qid === qid);

describe('Study timer: the clock', () => {
  it('waits for the first image to load, then counts down', async () => {
    const host = await start(imageGame([image('a'), image('b'), image('c')]));
    expect(clock(host)).toBe('00:45');
    advance(5000);
    expect(clock(host)).toBe('00:45');
    settleImage(host);
    advance(5000);
    expect(clock(host)).toBe('00:40');
  });

  it('starts anyway when the first image fails', async () => {
    serverGame = imageGame([image('a'), image('b'), image('c')]);
    const host = await start(imageGame([image('a'), image('b'), image('c')]));
    settleImage(host, 'error');
    await flush();
    advance(5000);
    expect(clock(host)).toBe('00:40');
  });

  it('starts anyway when the first question is unavailable', async () => {
    const host = await start(
      imageGame([image('a', { unavailable: true, image: undefined }), image('b')]),
    );
    advance(5000);
    expect(clock(host)).toBe('00:25');
  });

  it('a non-image session shows no bar and no toggle', async () => {
    const card: ApiQuestion = {
      id: 'f1',
      type: 'flashcard',
      prompt: 'Tên tiếng Anh',
      front: 'Cá tuyết',
      unavailable: false,
    };
    const host = await start({ ...imageGame([card]), mode: 'flashcard' });
    expect(host.querySelector('.study')).toBeTruthy();
    expect(clock(host)).toBeNull();
    expect(() => toggle(host)).toThrow();
  });

  it('"Tính giờ" toggles aria-pressed, hides the bar and stops the expiry; on again continues', async () => {
    const host = await start(imageGame([image('a'), image('b')]));
    settleImage(host);
    expect(toggle(host).getAttribute('aria-pressed')).toBe('true');
    advance(10000);
    expect(clock(host)).toBe('00:20');
    await press(toggle(host));
    expect(toggle(host).getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('seafoodeck.timer.on.v1')).toBe('false');
    expect(clock(host)).toBeNull();
    advance(60000);
    await flush();
    expect(posts).toEqual([]);
    expect(onSummary(host)).toBe(false);
    await press(toggle(host));
    expect(toggle(host).getAttribute('aria-pressed')).toBe('true');
    expect(clock(host)).toBe('00:20');
    advance(5000);
    expect(clock(host)).toBe('00:15');
  });

  it('pausing (leaving the screen) and coming back continues from the time left', async () => {
    const host = await start(imageGame([image('a'), image('b'), image('c')]));
    settleImage(host);
    advance(5000);
    expect(clock(host)).toBe('00:40');
    await press(button(host, 'Ẩn hiện'));
    advance(30000);
    await press(button(host, 'Ẩn hiện'));
    await flush();
    expect(clock(host)).toBe('00:40');
    settleImage(host);
    advance(5000);
    expect(clock(host)).toBe('00:35');
  });

  it('announces "Còn 10 giây" and "Hết giờ" once each, politely', async () => {
    const host = await start(imageGame([image('a')]));
    const region = host.querySelector('.study-timer-status')!;
    expect(region.getAttribute('role')).toBe('status');
    const said: string[] = [];
    const watch = new MutationObserver(() => {
      const t = region.textContent ?? '';
      if (t && t !== said[said.length - 1]) said.push(t);
    });
    watch.observe(region, { childList: true, characterData: true, subtree: true });
    settleImage(host);
    for (let i = 0; i < 20; i++) {
      advance(1000);
      await flush(1);
    }
    await flush();
    watch.disconnect();
    expect(said).toEqual(['Còn 10 giây', 'Hết giờ']);
    expect(host.querySelector('.study-timer-status')).toBe(region);
  });
});

describe('Study timer: expiry', () => {
  it('submits the selected option, closes the rest with timeouts, then shows the summary', async () => {
    const host = await start(
      imageGame([image('a', { result: result('a') }), image('b'), image('c')]),
    );
    await press(button(host, 'Hải sâm'));
    settleImage(host);
    advance(45000);
    await flush();
    expect(by('a')).toEqual([]);
    const token = JSON.parse(localStorage.getItem('seafood-deck:draft:g1:b:key')!);
    expect(by('b')).toEqual([{ qid: 'b', key: token, answer: { optionId: 'o2' } }]);
    expect(by('c')).toEqual([{ qid: 'c', key: 'timeout-g1-c', answer: { timeout: true } }]);
    expect(onSummary(host)).toBe(true);
    expect(host.textContent).toContain(NOTICE);
    expect(latest.questions.map((q) => q.result?.correct)).toEqual([true, false, false]);
    advance(60000);
    await flush();
    expect(posts).toHaveLength(2);
  });

  it('with nothing selected the question on screen gets a timeout too', async () => {
    const host = await start(imageGame([image('a'), image('b')]));
    settleImage(host);
    advance(30000);
    await flush();
    expect(posts).toEqual([
      { qid: 'a', key: 'timeout-g1-a', answer: { timeout: true } },
      { qid: 'b', key: 'timeout-g1-b', answer: { timeout: true } },
    ]);
    expect(onSummary(host)).toBe(true);
    expect(host.textContent).toContain(NOTICE);
    // The timeout keys pass the API's key rule.
    for (const p of posts) expect(p.key).toMatch(/^[a-zA-Z0-9_-]{8,100}$/);
  });

  it('answered questions are not posted again at expiry; only the open ones close', async () => {
    const host = await start(imageGame([image('a'), image('b'), image('c')]));
    settleImage(host);
    await press(button(host, 'Mực ống'));
    await press(button(host, 'Nộp câu trả lời'));
    await flush();
    await press(button(host, 'Tiếp tục'));
    settleImage(host);
    advance(45000);
    await flush();
    expect(posts.map((p) => [p.qid, p.answer])).toEqual([
      ['a', { optionId: 'o1' }],
      ['b', { timeout: true }],
      ['c', { timeout: true }],
    ]);
    expect(onSummary(host)).toBe(true);
  });

  it('a press on "Nộp câu trả lời" in flight at expiry is not sent twice', async () => {
    plan.a = ['hold'];
    const host = await start(imageGame([image('a'), image('b')]));
    settleImage(host);
    await press(button(host, 'Mực ống'));
    await press(button(host, 'Nộp câu trả lời'));
    advance(30000);
    await flush();
    expect(by('a')).toHaveLength(1);
    expect(by('b')).toHaveLength(1);
    expect(onSummary(host)).toBe(false);
    await act(async () => held.shift()!());
    await flush();
    expect(by('a')).toHaveLength(1);
    expect(onSummary(host)).toBe(true);
    expect(latest.questions[0].result?.correct).toBe(true);
  });

  it('a failed timeout post shows the retry note and stays off the summary until retried', async () => {
    plan.b = ['network'];
    const host = await start(imageGame([image('a'), image('b'), image('c')]));
    settleImage(host);
    advance(45000);
    await flush();
    expect(onSummary(host)).toBe(false);
    const note = host.querySelector('.pilot-error');
    expect(note?.getAttribute('role')).toBe('alert');
    expect(note?.textContent).toContain('Không kết nối được máy chủ');
    expect(latest.questions.map((q) => !!q.result)).toEqual([true, false, true]);
    expect(host.querySelector('.study-count')?.textContent).toBe('Câu 1 / 3');
    await press(button(host, 'Thử lại'));
    await flush();
    expect(by('b')).toHaveLength(2);
    expect(by('b')[1].key).toBe('timeout-g1-b');
    expect(by('a')).toHaveLength(1);
    expect(by('c')).toHaveLength(1);
    expect(host.querySelector('.pilot-error')).toBeNull();
    expect(onSummary(host)).toBe(true);
    expect(host.textContent).toContain(NOTICE);
  });

  it('a 409 on a timeout post takes the server result instead of failing', async () => {
    plan.b = ['conflict'];
    serverGame = imageGame([image('a'), image('b', { result: result('b') })]);
    const host = await start(imageGame([image('a'), image('b')]));
    settleImage(host);
    advance(30000);
    await flush(5);
    expect(by('b')).toHaveLength(1);
    expect(calls).toContain('GET /learning/sessions/g1');
    expect(host.querySelector('.pilot-error')).toBeNull();
    expect(latest.questions[1].result).toEqual(result('b'));
    expect(onSummary(host)).toBe(true);
  });

  it('a timeout that comes back skipped (revoked image) still closes the question', async () => {
    plan.b = ['skip'];
    const host = await start(imageGame([image('a'), image('b')]));
    settleImage(host);
    advance(30000);
    await flush();
    expect(latest.questions[1].result?.skipped).toBe(true);
    expect(onSummary(host)).toBe(true);
  });

  it('a budget saved as 0 runs the closing on mount without waiting for the image', async () => {
    localStorage.setItem('seafoodeck.timer.v1:g1', '0');
    const host = await start(
      imageGame([image('a', { result: result('a') }), image('b'), image('c')]),
    );
    await flush();
    expect(posts.map((p) => p.key)).toEqual(['timeout-g1-b', 'timeout-g1-c']);
    expect(onSummary(host)).toBe(true);
    expect(host.textContent).toContain(NOTICE);
  });

  it('a budget saved as 0 with the timer off posts nothing', async () => {
    localStorage.setItem('seafoodeck.timer.v1:g1', '0');
    localStorage.setItem('seafoodeck.timer.on.v1', 'false');
    const host = await start(imageGame([image('a'), image('b')]));
    await flush();
    expect(posts).toEqual([]);
    expect(clock(host)).toBeNull();
    expect(onSummary(host)).toBe(false);
  });

  it('a session answered in full never expires', async () => {
    const host = await start(imageGame([image('a'), image('b')]));
    settleImage(host);
    for (let i = 0; i < 2; i++) {
      await press(button(host, 'Mực ống'));
      await press(button(host, 'Nộp câu trả lời'));
      await flush();
      await press(
        button(host, host.textContent?.includes('Xem tổng kết') ? 'Xem tổng kết' : 'Tiếp tục'),
      );
      if (!onSummary(host)) settleImage(host);
    }
    advance(60000);
    await flush();
    expect(posts.map((p) => p.answer)).toEqual([{ optionId: 'o1' }, { optionId: 'o1' }]);
    expect(onSummary(host)).toBe(true);
    expect(host.textContent).not.toContain(NOTICE);
  });

  it('a saved 0 alone (the last answer landed as the time ran out) shows no notice', async () => {
    localStorage.setItem('seafoodeck.timer.v1:g1', '0');
    const host = await start(
      imageGame([image('a', { result: result('a') }), image('b', { result: result('b') })]),
    );
    expect(onSummary(host)).toBe(true);
    expect(posts).toEqual([]);
    expect(host.textContent).not.toContain(NOTICE);
  });

  it('the summary notice also shows for restored results that timed out', async () => {
    const host = await start(
      imageGame([
        image('a', { result: result('a') }),
        image('b', { result: score('b', { timeout: true }) }),
      ]),
    );
    expect(onSummary(host)).toBe(true);
    expect(host.textContent).toContain(NOTICE);
  });

  it('works for a student session as well', async () => {
    const host = await start(imageGame([image('a')]), 'student');
    settleImage(host);
    advance(15000);
    await flush();
    expect(posts).toEqual([{ qid: 'a', key: 'timeout-g1-a', answer: { timeout: true } }]);
    expect(onSummary(host)).toBe(true);
  });
});

describe('Study timer: review fixes', () => {
  const option = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('.study-options button')].find((b) =>
      b.textContent?.includes(label),
    )!;

  it('after time-up the question is locked; a retry sends the ORIGINAL option and token', async () => {
    plan.a = ['network'];
    const host = await start(imageGame([image('a'), image('b')]));
    await press(option(host, 'Hải sâm'));
    settleImage(host);
    advance(30000);
    await flush();
    expect(onSummary(host)).toBe(false);
    // One note only: Study's close note, not QuestionView's own.
    expect(host.querySelectorAll('.pilot-error')).toHaveLength(1);
    expect(option(host, 'Mực ống').disabled).toBe(true);
    expect(button(host, 'Nộp câu trả lời').disabled).toBe(true);
    expect(button(host, 'Bỏ qua ảnh').disabled).toBe(true);
    await press(option(host, 'Mực ống'));
    await press(button(host, 'Nộp câu trả lời'));
    await press(button(host, 'Bỏ qua ảnh'));
    expect(by('a')).toHaveLength(1);
    await press(button(host, 'Thử lại'));
    await flush();
    const token = JSON.parse(localStorage.getItem('seafood-deck:draft:g1:a:key')!);
    expect(by('a')).toEqual([
      { qid: 'a', key: token, answer: { optionId: 'o2' } },
      { qid: 'a', key: token, answer: { optionId: 'o2' } },
    ]);
    expect(onSummary(host)).toBe(true);
  });

  it('a 409 on the close-out of the question on screen takes the server result', async () => {
    plan.a = ['conflict'];
    serverGame = imageGame([image('a', { result: result('a') }), image('b')]);
    const host = await start(imageGame([image('a'), image('b')]));
    settleImage(host);
    advance(30000);
    await flush(5);
    expect(by('a')).toEqual([{ qid: 'a', key: 'timeout-g1-a', answer: { timeout: true } }]);
    expect(host.querySelector('.pilot-error')).toBeNull();
    expect(latest.questions[0].result).toEqual(result('a'));
    expect(onSummary(host)).toBe(true);
  });

  it('"Tiếp tục" after a failed close retries with the same keys, then shows the summary', async () => {
    plan.b = ['network', 'hold'];
    const host = await start(imageGame([image('a'), image('b')]));
    settleImage(host);
    advance(30000);
    await flush();
    expect(host.querySelector('.pilot-error')).toBeTruthy();
    await press(button(host, 'Tiếp tục'));
    expect(by('b').map((p) => p.key)).toEqual(['timeout-g1-b', 'timeout-g1-b']);
    expect(host.textContent).toContain('Đang nộp các câu còn lại…');
    await act(async () => held.shift()!());
    await flush();
    expect(onSummary(host)).toBe(true);
    expect(by('a')).toHaveLength(1);
  });

  it('"Tiếp tục" brings the close note into focus when the retry fails again', async () => {
    plan.b = ['network', 'network'];
    const host = await start(imageGame([image('a'), image('b')]));
    settleImage(host);
    advance(30000);
    await flush();
    await press(button(host, 'Tiếp tục'));
    await flush();
    expect(by('b')).toHaveLength(2);
    const note = host.querySelector('.pilot-error')!;
    expect(note.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(note);
    expect(onSummary(host)).toBe(false);
  });

  it('the clock pauses during feedback and until the next image settles', async () => {
    const host = await start(imageGame([image('a'), image('b'), image('c')]));
    settleImage(host);
    advance(5000);
    expect(clock(host)).toBe('00:40');
    await press(button(host, 'Mực ống'));
    await press(button(host, 'Nộp câu trả lời'));
    await flush();
    advance(10000);
    expect(clock(host)).toBe('00:40');
    await press(button(host, 'Tiếp tục'));
    advance(10000);
    expect(clock(host)).toBe('00:40');
    settleImage(host);
    advance(5000);
    expect(clock(host)).toBe('00:35');
  });

  it('a broken next image still lets the clock resume', async () => {
    serverGame = imageGame([image('a'), image('b')]);
    const host = await start(imageGame([image('a'), image('b')]));
    settleImage(host);
    await press(button(host, 'Mực ống'));
    await press(button(host, 'Nộp câu trả lời'));
    await flush();
    await press(button(host, 'Tiếp tục'));
    advance(5000);
    expect(clock(host)).toBe('00:30');
    settleImage(host, 'error');
    await flush();
    advance(5000);
    expect(clock(host)).toBe('00:25');
  });

  it('a non-image session starts no timer and writes no timer keys', async () => {
    const writes: string[] = [];
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      k: string,
      v: string,
    ) {
      writes.push(k);
      setItem.call(this, k, v);
    });
    const card: ApiQuestion = {
      id: 'f1',
      type: 'flashcard',
      prompt: 'Tên tiếng Anh',
      front: 'Cá tuyết',
      unavailable: false,
    };
    const host = await start({ ...imageGame([card]), mode: 'flashcard' });
    advance(60000);
    await press(button(host, 'Ẩn hiện'));
    expect(vi.getTimerCount()).toBe(0);
    expect(writes.filter((k) => k.startsWith('seafoodeck.timer'))).toEqual([]);
  });
});

describe('combo and timeouts', () => {
  it('a timed-out question (graded wrong, not skipped, not self-rated) resets the combo', () => {
    const qs = [
      image('a', { result: result('a') }),
      image('b', { result: result('b') }),
      image('c', { result: score('c', { timeout: true }) }),
    ];
    expect(qs[2].result).toMatchObject({ correct: false, skipped: false, selfRated: false });
    expect(sessionCombo(qs)).toEqual({ current: 0, best: 2 });
  });
});
