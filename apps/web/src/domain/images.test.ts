import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { demoPack } from '../data/demo';
import { imageQuestions, usableImage, validateContent } from './content';
import {
  createSession,
  emptyState,
  submitAttempt,
  advanceSession,
  retryCandidates,
  retryMistakes,
} from './session';
import { validState } from './storage';
import { gradeHs } from './scoring';
import type { AppState, Attempt } from './models';

function record(state: AppState, correct: boolean, skipped = false): AppState {
  const s = state.session!,
    q = s.questions[s.cursor];
  if (q.type !== 'image') throw Error('expected image');
  const a: Attempt = {
    id: `${s.id}/${q.id}`,
    questionId: q.id,
    sessionId: s.id,
    targetId: q.speciesId,
    skill: 'image',
    contentVersion: s.contentVersion,
    attemptNumber: 1,
    correct,
    skipped,
    selfRated: false,
    isReview: false,
    answer: skipped ? 'skipped' : q.speciesId,
    at: new Date().toISOString(),
  };
  return submitAttempt(state, a);
}
describe('packaged photo sessions', () => {
  it('retains three historical fixture JPEGs, byte-for-byte matching their provenance', () => {
    expect(demoPack.media).toHaveLength(3);
    for (const m of demoPack.media) {
      const bytes = readFileSync(`../../test-fixtures/legacy-shrimp${m.path}`);
      expect(bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(m.sha256);
      expect(m.path).not.toMatch(/black-tiger|whiteleg|giant-river|FDA/iu);
      expect(m.status).toBe('draft');
    }
  });
  it('has three unique species, original sources and unique answer choices', () => {
    const qs = imageQuestions(demoPack);
    expect(qs).toHaveLength(3);
    expect(new Set(qs.map((q) => q.type === 'image' && q.speciesId)).size).toBe(3);
    expect(createSession(demoPack, 'image').questions).toEqual(qs);
    expect(validateContent(demoPack)).toEqual([]);
  });
  it('blocks AI, missing photos, duplicated sources and draft-public bypass', () => {
    const p = structuredClone(demoPack);
    p.media[0].aiGenerated = true;
    expect(imageQuestions(p)).toHaveLength(0);
    p.media[0].aiGenerated = false;
    p.media[1].originalImageId = p.media[0].originalImageId;
    expect(imageQuestions(p)).toHaveLength(0);
    expect(imageQuestions({ ...demoPack, media: [] })).toHaveLength(0);
    expect(usableImage({ ...demoPack, audience: 'public' }, demoPack.media[0])).toBe(false);
  });
  it('skip is terminal but does not create a review, count as an answer or accept a later submission', () => {
    const state = { ...emptyState(), session: createSession(demoPack, 'image') };
    const skipped = record(state, false, true);
    expect(Object.keys(skipped.reviews)).toHaveLength(0);
    expect(skipped.attempts.filter((a) => !a.skipped)).toHaveLength(0);
    expect(record(skipped, true)).toBe(skipped);
    expect(advanceSession(skipped).session?.cursor).toBe(1);
    expect(validState(JSON.parse(JSON.stringify(skipped)))).toBe(true);
  });
  it('rejects corrupt persisted photo choices and supports new session modes', () => {
    const state = { ...emptyState(), session: createSession(demoPack, 'image') };
    expect(validState(state)).toBe(true);
    const q = state.session.questions[0];
    if (q.type === 'image') q.options = [q.speciesId, q.speciesId, q.speciesId];
    expect(validState(state)).toBe(false);
  });
  it('retries only the latest error once and stops offering solved errors; retains session identity', () => {
    let state: AppState = { ...emptyState(), session: createSession(demoPack, 'image') };
    state = advanceSession(record(state, false));
    state = advanceSession(record(state, true));
    state = advanceSession(record(state, true));
    expect(retryCandidates(state)).toHaveLength(1);
    const id = state.session!.id;
    state = retryMistakes(state);
    expect(state.session!.id).toBe(id);
    state = advanceSession(record(state, true));
    expect(retryCandidates(state)).toHaveLength(0);
    expect(Object.values(state.reviews).every((r) => r.stage === 0)).toBe(true);
  });
  it('keeps skips separate from errors and can retry skipped questions', () => {
    let state: AppState = { ...emptyState(), session: createSession(demoPack, 'image') };
    for (let i = 0; i < 3; i++) state = advanceSession(record(state, false, true));
    expect(retryCandidates(state)).toHaveLength(0);
    expect(retryCandidates(state, true)).toHaveLength(3);
    expect(retryMistakes(state, true).session!.id).toBe(state.session!.id);
    expect(Object.keys(state.reviews)).toHaveLength(0);
  });
  it('creates flashcards for all three species without inventing missing pronunciation', () => {
    for (const sp of demoPack.species) {
      const s = createSession(demoPack, 'flashcard', {}, 'ja', new Date().toISOString(), sp.id);
      expect(s.questions).toHaveLength(3);
      expect(s.questions.every((q) => q.type === 'flashcard' && q.speciesId === sp.id)).toBe(true);
    }
    expect(demoPack.names.filter((n) => n.pronunciation)).toHaveLength(3);
    expect(demoPack.media.filter((m) => m.type === 'audio')).toHaveLength(0);
  });
  it('contrasts head-on with headless and keeps the new historical case draft', () => {
    const c = demoPack.scenarios.find((s) => s.id === 'hs-c')!;
    const t = demoPack.tariffs.find((t) => t.id === c.tariffId)!;
    expect(c.facts.headRemoved).toBe(false);
    expect(demoPack.scenarios[0].facts.headRemoved).toBe(true);
    expect(gradeHs(c, t, '0306.17.19').correct).toBe(true);
    expect(gradeHs(c, t, '0306.17.11').correct).toBe(false);
    expect(c.status).toBe('draft');
    expect(t.status).toBe('draft');
  });
});
