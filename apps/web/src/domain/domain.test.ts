import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoPack } from '../data/demo';
import { PUBLIC_CONTENT_ENABLED, publicPack } from '../data/public';
import type { AppState, Attempt, ContentPack, MediaAsset } from './models';
import { buildPairs, canUseMedia, primaryName, validateContent } from './content';
import { gradeHs, gradeName, normalizeHs, normalizeName } from './scoring';
import { DAY, reviewKey, scheduleReview } from './review';
import { advanceSession, createSession, emptyState, retryMistakes, submitAttempt } from './session';
import { loadState, saveState, STORAGE_KEY, validState } from './storage';
import { AudioPlayer } from './media';

const now = '2026-11-17T03:00:00.000Z';
const attempt = (extra: Partial<Attempt> = {}): Attempt => ({
  id: 'submission-1',
  sessionId: 'session-1',
  questionId: 'hs-a',
  targetId: 'hs-a',
  skill: 'hs',
  contentVersion: 'demo-1',
  attemptNumber: 1,
  correct: true,
  selfRated: false,
  isReview: false,
  answer: '03061711',
  at: now,
  ...extra,
});
const clonePack = (): ContentPack => structuredClone(demoPack);

describe('HS normalization and fixture grading', () => {
  it.each(['0306.17.11', '03061711', ' 0306.17.11 ', '0306 17 11'])(
    'preserves the leading zero in %s',
    (value) => expect(normalizeHs(value)).toBe('03061711'),
  );
  it.each(['3061711', '0306-17-11', '03.06.17.11', '0306..17.11', '03061711abc', '', '3.061711e6'])(
    'rejects unsupported format %s',
    (value) => expect(normalizeHs(value)).toBeNull(),
  );
  it('accepts an exact 8-digit fixture A answer and rejects its 6-digit parent', () => {
    expect(gradeHs(demoPack.scenarios[0], demoPack.tariffs[0], '0306.17.11')).toEqual({
      correct: true,
      needsFollowUp: false,
    });
    expect(gradeHs(demoPack.scenarios[0], demoPack.tariffs[0], '030617').correct).toBe(false);
  });
  it('requires both steps for insufficient fixture B', () => {
    const s = demoPack.scenarios[1],
      t = demoPack.tariffs[0];
    expect(gradeHs(s, t, 'insufficient')).toEqual({ correct: false, needsFollowUp: true });
    expect(gradeHs(s, t, 'insufficient', 'packaging').correct).toBe(false);
    expect(gradeHs(s, t, 'insufficient', 'headRemoved').correct).toBe(true);
    expect(gradeHs(s, t, '03061711').correct).toBe(false);
  });
  it('does not turn unknown into false', () => {
    expect(demoPack.scenarios[1].facts.headRemoved).toBe('unknown');
    expect(demoPack.scenarios[1].facts.headRemoved).not.toBe(false);
    expect(demoPack.scenarios[0].facts.cooked).toBe(false);
  });
  it('rejects insufficient on A even if the follow-up is plausible', () => {
    expect(
      gradeHs(demoPack.scenarios[0], demoPack.tariffs[0], 'insufficient', 'headRemoved').correct,
    ).toBe(false);
  });
});

describe('name grading and unique matching', () => {
  it('normalizes NFC, whitespace and case without stripping accents', () => {
    expect(normalizeName('  TÔM   SÚ ')).toBe('tôm sú');
    const name = primaryName(demoPack, 'black-tiger', 'vi')!;
    expect(gradeName('  TÔM SÚ ', name)).toBe(true);
    expect(gradeName('tom su', name)).toBe(false);
  });
  it('does not accept Japanese romaji or an unapproved alias as a written answer', () => {
    const entry = primaryName(demoPack, 'black-tiger', 'ja')!;
    expect(gradeName('ushiebi', entry)).toBe(false);
    expect(gradeName('ブラックタイガー', entry)).toBe(false);
  });
  it('only uses approved accepted forms', () => {
    const entry = {
      ...primaryName(demoPack, 'black-tiger', 'en')!,
      acceptedForms: ['Giant tiger prawn'],
    };
    expect(gradeName('Giant tiger prawn', entry)).toBe(false);
    expect(gradeName('Giant tiger prawn', { ...entry, status: 'approved' })).toBe(true);
  });
  it.each(['en', 'ja', 'scientific'] as const)(
    'builds exactly three unambiguous %s pairs',
    (kind) => {
      const pairs = buildPairs(demoPack, kind)!;
      expect(pairs).toHaveLength(3);
      expect(new Set(pairs.map((p) => p.right)).size).toBe(3);
    },
  );
  it('blocks an approved alias that collides with another species primary name', () => {
    const pack = clonePack();
    pack.names.push({
      ...primaryName(pack, 'whiteleg', 'en')!,
      id: 'collision',
      role: 'alias',
      status: 'approved',
      label: 'Black tiger shrimp',
      acceptedForms: [],
    });
    expect(buildPairs(pack, 'en')).toBeNull();
  });
  it('blocks collisions from approved accepted forms and too few species', () => {
    const pack = clonePack();
    const name = primaryName(pack, 'whiteleg', 'en')!;
    name.status = 'approved';
    name.acceptedForms.push('Black tiger shrimp');
    expect(buildPairs(pack, 'en')).toBeNull();
    expect(buildPairs(demoPack, 'en', ['black-tiger', 'whiteleg'])).toBeNull();
  });
});

describe('content publication gate', () => {
  it('allows the demo schema and keeps draft fixtures out of the public pack', () => {
    expect(validateContent(demoPack)).toEqual([]);
    expect(PUBLIC_CONTENT_ENABLED).toBe(false);
    expect(publicPack.species).toHaveLength(0);
    expect(publicPack.scenarios).toHaveLength(0);
    expect(validateContent(publicPack, true)).toContain('pack: bộ public chưa sẵn sàng');
    expect(validateContent(demoPack, true).length).toBeGreaterThan(0);
  });
  it('rejects a wrong-level parent even if its digits prefix the code', () => {
    const pack = clonePack();
    pack.tariffs[0].parentCode = '0306';
    expect(validateContent(pack)).toContain('vn-2022-fixture: mã cha sai cấp');
  });
  it('supports a six-digit code with a four-digit parent', () => {
    const pack = clonePack();
    pack.tariffs[0].code = '0306.17';
    pack.tariffs[0].level = 6;
    pack.tariffs[0].parentCode = '0306';
    pack.scenarios = [];
    expect(validateContent(pack)).toEqual([]);
  });
  it('rejects dangling references, changed versions, duplicate answers and false missing facts', () => {
    const pack = clonePack();
    pack.names[0].sourceId = 'missing';
    pack.scenarios[0].version = 'new';
    pack.scenarios[0].options.push({ ...pack.scenarios[0].options[0] });
    pack.scenarios[1].facts.headRemoved = false;
    const errors = validateContent(pack);
    expect(errors).toContain('black-tiger:vi: nguồn không tồn tại');
    expect(errors).toContain('hs-a: phiên bản không khớp');
    expect(errors).toContain('hs-a: cần đúng một đáp án');
    expect(errors).toContain('hs-b: dữ kiện thiếu không hợp lệ');
  });
});

describe('review scheduling', () => {
  it('starts at one day, advances in due review sessions through 3/7/14 days, then caps', () => {
    let r = scheduleReview(undefined, attempt());
    expect(r.stage).toBe(0);
    expect(Date.parse(r.dueAt) - Date.parse(now)).toBe(DAY);
    for (const [i, days] of [3, 7, 14, 14].entries()) {
      const at = r.dueAt;
      r = scheduleReview(r, attempt({ sessionId: `review-${i}`, at, isReview: true }));
      expect(Date.parse(r.dueAt) - Date.parse(at)).toBe(days * DAY);
    }
    expect(r.stage).toBe(3);
  });
  it('resets a failure to one day and never promotes same-session retries', () => {
    let r = scheduleReview(undefined, attempt());
    r = scheduleReview(r, attempt({ sessionId: 'review-1', at: r.dueAt, isReview: true }));
    expect(r.stage).toBe(1);
    r = scheduleReview(
      r,
      attempt({ sessionId: 'review-2', at: r.dueAt, correct: false, isReview: true }),
    );
    expect(r.stage).toBe(0);
    const previousDue = r.dueAt;
    r = scheduleReview(r, attempt({ sessionId: 'review-2', attemptNumber: 2, isReview: true }));
    expect(r.stage).toBe(0);
    expect(r.dueAt).toBe(previousDue);
  });
  it('does not promote self ratings, early practice, a different skill or changed content', () => {
    const r = scheduleReview(undefined, attempt());
    expect(
      scheduleReview(r, attempt({ sessionId: 'new', at: r.dueAt, selfRated: true, isReview: true }))
        .stage,
    ).toBe(0);
    expect(scheduleReview(r, attempt({ sessionId: 'new', at: now, isReview: true })).stage).toBe(0);
    expect(scheduleReview(r, attempt({ sessionId: 'new', at: r.dueAt })).stage).toBe(0);
    expect(
      scheduleReview(
        r,
        attempt({ sessionId: 'new', at: r.dueAt, isReview: true, contentVersion: 'demo-2' }),
      ).stage,
    ).toBe(0);
    const ja = scheduleReview(
      undefined,
      attempt({ targetId: 'black-tiger', skill: 'name:ja', selfRated: true }),
    );
    expect(ja.key).not.toBe(r.key);
    expect(ja.stage).toBe(0);
    expect(reviewKey('black-tiger', 'match:en')).not.toBe(reviewKey('black-tiger', 'name:en'));
  });
  it('preserves an established stage and deadline when practicing early in a new session', () => {
    const initial = scheduleReview(undefined, attempt());
    const established = scheduleReview(
      initial,
      attempt({ sessionId: 'review', at: initial.dueAt, isReview: true }),
    );
    const practice = scheduleReview(
      established,
      attempt({ sessionId: 'practice', at: initial.dueAt }),
    );
    expect(practice.stage).toBe(1);
    expect(practice.dueAt).toBe(established.dueAt);
  });
});

describe('session idempotency, retry and recovery', () => {
  let state: AppState;
  beforeEach(() => {
    state = {
      ...emptyState(),
      session: {
        ...createSession(
          { ...demoPack, scenarios: demoPack.scenarios.slice(0, 2) },
          'hs',
          {},
          'en',
          now,
        ),
        id: 'session-1',
      },
    };
  });
  it('ignores repeated submission IDs and logical duplicate answers', () => {
    const submitted = submitAttempt(state, attempt());
    expect(submitAttempt(submitted, attempt())).toBe(submitted);
    expect(submitAttempt(submitted, attempt({ id: 'other', attemptNumber: 2 }))).toBe(submitted);
    expect(submitted.attempts).toHaveLength(1);
  });
  it('does not allow skipping unanswered questions or stale submissions', () => {
    expect(advanceSession(state)).toBe(state);
    expect(submitAttempt(state, attempt({ sessionId: 'old' }))).toBe(state);
    expect(submitAttempt(state, attempt({ questionId: 'hs-b' }))).toBe(state);
    expect(submitAttempt(state, attempt({ contentVersion: 'old' }))).toBe(state);
  });
  it('preserves question order, cursor, selections and graded answers after reload', () => {
    state.session!.ui['hs-a'] = { choice: '03061711' };
    state = advanceSession(submitAttempt(state, attempt()), now);
    state.session!.ui['hs-b'] = { choice: 'insufficient', followUp: 'headRemoved' };
    const values = new Map<string, string>();
    const store = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    expect(saveState(store, state)).toBeUndefined();
    const restored = loadState(store);
    expect(restored.warning).toBeUndefined();
    expect(restored.state).toEqual(state);
    expect(restored.state.session?.questions.map((q) => q.id)).toEqual(['hs-a', 'hs-b']);
    expect(restored.state.session?.cursor).toBe(1);
    expect(restored.state.session?.ui['hs-b'].followUp).toBe('headRemoved');
    expect(submitAttempt(restored.state, attempt())).toBe(restored.state);
  });
  it('keeps the session ID for retrying errors and only retries after summary', () => {
    expect(retryMistakes(state)).toBe(state);
    state = advanceSession(submitAttempt(state, attempt({ correct: false })), now);
    state = advanceSession(
      submitAttempt(state, attempt({ id: 'b', questionId: 'hs-b', targetId: 'hs-b' })),
      now,
    );
    expect(state.session?.completedAt).toBe(now);
    const next = retryMistakes(state);
    expect(next.session?.id).toBe('session-1');
    expect(next.session?.cursor).toBe(2);
    expect(next.session?.questions[2]).toMatchObject({ scenarioId: 'hs-a' });
    expect(next.session?.completedAt).toBeUndefined();
  });
  it('stores a stable shuffled match order and waits for all three matches', () => {
    state.session = { ...createSession(demoPack, 'match'), id: 'session-1' };
    const q = state.session.questions[0];
    expect(q.type).toBe('match');
    if (q.type !== 'match') throw Error('wrong fixture');
    expect(q.rightOrder).toEqual(['giant-river', 'black-tiger', 'whiteleg']);
    for (const [i, pair] of q.pairs.entries()) {
      state = submitAttempt(
        state,
        attempt({
          id: pair.speciesId,
          questionId: q.id,
          targetId: pair.speciesId,
          skill: 'match:en',
        }),
      );
      if (i < 2) expect(advanceSession(state)).toBe(state);
    }
    expect(advanceSession(state).session?.completedAt).toBeDefined();
  });
  it('queues only due skills from the current content version, without mixing Japanese and English', () => {
    const r = scheduleReview(undefined, attempt({ targetId: 'black-tiger', skill: 'match:ja' }));
    const reviews = { [r.key]: r };
    expect(createSession(demoPack, 'review', reviews, 'en', now).questions).toHaveLength(0);
    const due = createSession(demoPack, 'review', reviews, 'en', r.dueAt);
    expect(due.questions[0]).toMatchObject({ type: 'match', kind: 'ja' });
    reviews[r.key] = { ...r, contentVersion: 'old' };
    expect(createSession(demoPack, 'review', reviews, 'en', now).questions).toHaveLength(0);
  });
  it('gracefully handles unavailable storage without deleting corrupted originals', () => {
    const blocked = {
      getItem: () => {
        throw Error('blocked');
      },
      setItem: () => {
        throw Error('full');
      },
    };
    expect(loadState(blocked).warning).toContain('Không đọc được');
    expect(saveState(blocked, state)).toContain('Không lưu được');
    const setItem = vi.fn();
    expect(loadState({ getItem: () => '{bad', setItem }).warning).toBeDefined();
    expect(setItem).not.toHaveBeenCalled();
    expect(
      loadState({ getItem: () => JSON.stringify({ ...state, schemaVersion: 2 }), setItem }).warning,
    ).toBeDefined();
  });
  it('rejects valid JSON with a malformed nested session or reviews', () => {
    expect(validState({ ...state, session: { ...state.session, cursor: -1 } })).toBe(false);
    expect(
      validState({ ...state, session: { ...state.session, questions: [{ type: 'match' }] } }),
    ).toBe(false);
    expect(validState({ ...state, reviews: { bad: { stage: 9 } } })).toBe(false);
    expect(validState(state)).toBe(true);
    expect(STORAGE_KEY).toContain('v1');
  });
});

describe('media gates and the single-clip player', () => {
  const audio: MediaAsset = {
    id: 'audio-test',
    type: 'audio',
    purposes: ['pronunciation'],
    path: '/test.mp3',
    sourceId: 'test',
    rights: 'Test fixture only',
    locale: 'en-US',
    voice: 'test',
    aiGenerated: false,
    version: '1',
    status: 'approved',
    reviewer: 'Test fixture reviewer',
    reviewedAt: now,
  };
  it('does not block name matching when images or audio are missing', () => {
    const withoutMedia = { ...demoPack, media: [] };
    expect(withoutMedia.media).toHaveLength(0);
    expect(buildPairs(withoutMedia, 'en')).not.toBeNull();
    expect(canUseMedia(undefined, 'identification')).toBe(false);
    expect(canUseMedia(undefined, 'pronunciation')).toBe(false);
    expect(canUseMedia({ ...audio, status: 'draft' }, 'pronunciation')).toBe(false);
  });
  it('blocks missing approval, unsafe paths and illustrations for identification', () => {
    expect(canUseMedia({ ...audio, reviewer: undefined }, 'pronunciation')).toBe(false);
    expect(canUseMedia({ ...audio, path: '//untrusted.test/x' }, 'pronunciation')).toBe(false);
    expect(canUseMedia({ ...audio, path: 'javascript:x' }, 'pronunciation')).toBe(false);
    expect(
      canUseMedia(
        { ...audio, type: 'illustration', purposes: ['identification'] },
        'identification',
      ),
    ).toBe(false);
    expect(
      canUseMedia(
        { ...audio, type: 'species_photo', purposes: ['identification'] },
        'identification',
      ),
    ).toBe(true);
  });
  it('reports missing audio without creating or playing a clip', async () => {
    const notify = vi.fn();
    const ctor = vi.fn();
    vi.stubGlobal('Audio', ctor);
    await new AudioPlayer().play(undefined, 1, notify);
    expect(notify).toHaveBeenLastCalledWith('missing');
    expect(ctor).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('stops the prior clip, supports slow playback and reports failures', async () => {
    const clips: {
      pause: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
      playbackRate: number;
      onended: (() => void) | null;
      onerror: (() => void) | null;
    }[] = [];
    class FakeAudio {
      pause = vi.fn();
      play = vi.fn().mockResolvedValue(undefined);
      playbackRate = 1;
      onended = null;
      onerror = null;
      constructor() {
        clips.push(this);
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    const player = new AudioPlayer(),
      first = vi.fn(),
      second = vi.fn();
    await player.play(audio, 1, first);
    await player.play(audio, 0.75, second);
    expect(clips[0].pause).toHaveBeenCalledOnce();
    expect(first).toHaveBeenLastCalledWith('idle');
    expect(clips[1].playbackRate).toBe(0.75);
    expect(second).toHaveBeenLastCalledWith('playing');
    clips[1].onerror?.();
    expect(second).toHaveBeenLastCalledWith('error');
    player.stop();
    expect(clips[1].pause).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
  it('handles a rejected play promise and does not report an old clip as playing', async () => {
    let resolve: () => void = () => {};
    class DelayedAudio {
      pause = vi.fn();
      playbackRate = 1;
      onended = null;
      onerror = null;
      play = () =>
        new Promise<void>((r) => {
          resolve = r;
        });
    }
    vi.stubGlobal('Audio', DelayedAudio);
    const player = new AudioPlayer(),
      notify = vi.fn();
    const pending = player.play(audio, 1, notify);
    player.stop();
    resolve();
    await pending;
    expect(notify).not.toHaveBeenCalledWith('playing');
    class BrokenAudio {
      pause = vi.fn();
      playbackRate = 1;
      onended = null;
      onerror = null;
      play = () => Promise.reject(Error('missing'));
    }
    vi.stubGlobal('Audio', BrokenAudio);
    await player.play(audio, 1, notify);
    expect(notify).toHaveBeenLastCalledWith('error');
    player.stop();
    vi.unstubAllGlobals();
  });
});
