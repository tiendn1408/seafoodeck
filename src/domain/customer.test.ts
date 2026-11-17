import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { customerPack as pack } from '../data/customer';
import { demoPack as legacy } from '../data/demo';
import { imageQuestions, validateContent, canUseMedia, buildPairs } from './content';
import { gradeHs } from './scoring';
import { stateForPack } from './packState';
import { createSession, emptyState, submitAttempt } from './session';
import type { AppState, Attempt } from './models';
import { scheduleReview } from './review';
import { validState } from './storage';

describe('customer trade demo evidence and scope', () => {
  it('has six non-shrimp species, four sourced primary names each, with commercial facets separate from groups', () => {
    expect(pack.species).toHaveLength(6);
    expect(pack.names).toHaveLength(24);
    expect(validateContent(pack)).toEqual([]);
    expect(pack.species.some((s) => legacy.species.some((old) => old.id === s.id))).toBe(false);
    expect(new Set(pack.species.map((s) => s.group)).size).toBe(3);
    expect(
      pack.species
        .filter((s) => s.group === 'Cá')
        .every((s) => s.tradeCategory?.startsWith('Cá thịt')),
    ).toBe(true);
    for (const s of pack.species) {
      expect(new Set(pack.names.filter((n) => n.speciesId === s.id).map((n) => n.kind)).size).toBe(
        4,
      );
    }
  });
  it('does not fake audio or public approvals, and distinguishes provisional Vietnamese names', () => {
    expect(pack.media.filter((m) => m.type === 'audio')).toHaveLength(0);
    expect(pack.names.filter((n) => n.pronunciation)).toHaveLength(6);
    expect(pack.species.find((s) => s.id === 'east-asian-octopus')?.notes).toContain(
      'tên Việt mô tả',
    );
    expect(pack.names.some((n) => n.status === 'approved' || n.reviewer)).toBe(false);
    expect(
      validateContent({ ...pack, audience: 'public' }, true).some((e) => e.includes('audio')),
    ).toBe(true);
  });
  it('packs real photos with hashes and provenance, preserving original-image identity for thumbnails', () => {
    expect(pack.media).toHaveLength(5);
    for (const m of pack.media) {
      expect(
        createHash('sha256')
          .update(readFileSync(`public${m.path}`))
          .digest('hex'),
      ).toBe(m.sha256);
      expect(m.aiGenerated).toBe(false);
      expect(m.credit).toBeTruthy();
      expect(m.sourceUrl).toMatch(/^https:\/\/commons.wikimedia.org/);
      expect(m.originalImageId).toBeTruthy();
      expect(m.path).not.toMatch(/cod|tuna|mussel|octopus|clam/);
      expect(canUseMedia(m, 'identification')).toBe(false);
    }
  });
});

describe('species-independent question selection', () => {
  it('skips the species without a photo and builds three different original photos', () => {
    const order = [
      'mitre-squid',
      'green-mussel',
      'lyrate-clam',
      'atlantic-cod',
      'yellowfin-tuna',
      'east-asian-octopus',
    ];
    const qs = imageQuestions(pack, order);
    expect(qs).toHaveLength(3);
    expect(qs.map((q) => q.type === 'image' && q.speciesId)).toEqual([
      'green-mussel',
      'lyrate-clam',
      'atlantic-cod',
    ]);
    expect(new Set(qs.map((q) => q.type === 'image' && q.assetId)).size).toBe(3);
  });
  it('will not substitute AI or repeat the same original photo to fill a round', () => {
    const changed = structuredClone(pack);
    changed.media = changed.media.slice(0, 3).map((m, i) => ({
      ...m,
      aiGenerated: i === 1,
      originalImageId: i === 2 ? changed.media[0].originalImageId : m.originalImageId,
    }));
    expect(imageQuestions(changed)).toHaveLength(0);
  });
  it('includes the selected sixth species when building a three-pair board and keeps three unique pairs', () => {
    for (const kind of ['en', 'ja', 'scientific'] as const) {
      expect(buildPairs(pack, kind)).not.toBeNull();
      const s = createSession(pack, 'match', {}, kind, new Date().toISOString(), 'green-mussel');
      const q = s.questions[0];
      if (q.type !== 'match') throw Error('unexpected type');
      expect(q.pairs.map((p) => p.speciesId)).toContain('green-mussel');
      expect(new Set(q.pairs.map((p) => p.speciesId)).size).toBe(3);
      expect(validState({ ...emptyState(), session: s })).toBe(true);
    }
  });
});

describe('form-specific sourced six-digit HS', () => {
  it('grades whole fish and fillets differently for the same species', () => {
    const [a, , c] = pack.scenarios;
    const tariff = (id: string) => pack.tariffs.find((t) => t.id === id)!;
    expect(a.speciesId).toBe(c.speciesId);
    expect(gradeHs(a, tariff(a.tariffId), '0303.42').correct).toBe(true);
    expect(gradeHs(c, tariff(c.tariffId), '0304.87').correct).toBe(true);
    expect(gradeHs(c, tariff(c.tariffId), '0303.42').correct).toBe(false);
    expect(gradeHs(a, tariff(a.tariffId), '0303.42.00').correct).toBe(false);
  });
  it('requires the missing form follow-up rather than treating unknown as whole fish', () => {
    const s = pack.scenarios[1],
      t = pack.tariffs.find((t) => t.id === s.tariffId)!;
    expect(s.facts.filleted).toBe('unknown');
    expect(gradeHs(s, t, 'insufficient').needsFollowUp).toBe(true);
    expect(gradeHs(s, t, 'insufficient', 'filleted').correct).toBe(true);
    expect(gradeHs(s, t, '0303.42').correct).toBe(false);
    expect(gradeHs(s, t, 'insufficient', 'packaging').correct).toBe(false);
  });
});

describe('historical progress isolation', () => {
  const makeAttempt = (version: string, target: string): Attempt => ({
    id: version,
    sessionId: version,
    questionId: 'q',
    targetId: target,
    skill: 'name:en',
    contentVersion: version,
    attemptNumber: 1,
    correct: true,
    selfRated: true,
    isReview: false,
    answer: 'remembered',
    at: '2026-11-17T00:00:00.000Z',
  });
  it('keeps old history in storage while excluding old-pack attempts and reviews from current statistics', () => {
    const old = makeAttempt(legacy.version, 'black-tiger'),
      current = makeAttempt(pack.version, 'atlantic-cod');
    const oldReview = scheduleReview(undefined, old),
      currentReview = scheduleReview(undefined, current);
    const state: AppState = {
      ...emptyState(),
      attempts: [old, current],
      reviews: { [oldReview.key]: oldReview, [currentReview.key]: currentReview },
      session: createSession(legacy, 'full'),
    };
    const scoped = stateForPack(state, pack);
    expect(scoped.attempts).toEqual([current]);
    expect(Object.keys(scoped.reviews)).toEqual([currentReview.key]);
    expect(state.attempts).toHaveLength(2);
    expect(scoped.session?.contentVersion).toBe(legacy.version);
    expect(
      createSession(pack, 'review', state.reviews, 'en', '2026-11-20T00:00:00.000Z').questions,
    ).toHaveLength(1);
  });
  it('does not promote a stale-version review even if the target ID is reused', () => {
    const session = createSession(
      pack,
      'flashcard',
      {},
      'en',
      '2026-11-17T00:00:00.000Z',
      'atlantic-cod',
    );
    session.mode = 'review';
    const attempt = {
      ...makeAttempt(pack.version, 'atlantic-cod'),
      id: 'new',
      sessionId: session.id,
      questionId: session.questions[0].id,
      isReview: true,
      selfRated: false,
    };
    const stale = scheduleReview(undefined, { ...attempt, contentVersion: 'old' });
    const state = {
      ...emptyState(),
      session,
      reviews: { [stale.key]: { ...stale, stage: 2 as const } },
    };
    expect(submitAttempt(state, attempt).reviews[stale.key].stage).toBe(0);
  });
});
