import { describe, expect, it } from 'vitest';
import type { ApiQuestion, Game, Score } from '../../pilot/api';
import { empty, mergeGame } from '../ledger';
import { summarizeHaul } from './summary';

const AT = '2026-11-19T08:00:00.000Z';
function score(extra: Partial<Score>): Score {
  return {
    answered: true,
    skipped: false,
    correct: true,
    selfRated: false,
    questionId: 'q',
    targetId: 't',
    skill: 'image',
    contentVersion: 'rel-1',
    explanation: '',
    at: AT,
    ...extra,
  };
}
function question(id: string, result?: Partial<Score>, extra: Partial<ApiQuestion> = {}) {
  return {
    id,
    type: 'image',
    prompt: 'Nhìn hình, chọn đúng loài',
    unavailable: false,
    ...extra,
    ...(result ? { result: score({ questionId: id, ...result }) } : {}),
  } as ApiQuestion;
}
function game(questions: ApiQuestion[], mode = 'image'): Game {
  return {
    id: 'g1',
    releaseId: 'rel-1',
    internal: true,
    mode,
    expiresAt: '2026-11-19T10:00:00.000Z',
    questions,
  };
}
const withLedger = (g: Game) => summarizeHaul(g, mergeGame(empty, g));

describe('summarizeHaul', () => {
  it('3 correct + 1 wrong: "3 / 4 loài vào lưới", the wrong one slips the net', () => {
    const g = game([
      question('q1', { targetId: 'a', targetLabel: 'Tôm sú' }),
      question('q2', { targetId: 'b', targetLabel: 'Mực ống', correct: false }),
      question('q3', { targetId: 'c', targetLabel: 'Hải sâm' }),
      question('q4', { targetId: 'd', targetLabel: 'Vẹm xanh' }),
    ]);
    const s = withLedger(g);
    expect(s.title).toBe('3 / 4 loài vào lưới');
    expect(s.caught.map((c) => c.label)).toEqual(['Tôm sú', 'Hải sâm', 'Vẹm xanh']);
    expect(s.missed).toHaveLength(1);
    expect(s.missed[0].label).toBe('Mực ống');
    expect(s.missed[0].note).toBe('Sổng lưới · ôn lại ngày mai');
  });

  it('reads "ôn lại sau X ngày" from the latest review state of the item', () => {
    const g = game([question('q1', { targetId: 'a', targetLabel: 'Tôm sú' })]);
    const ledger = mergeGame(empty, g);
    expect(summarizeHaul(g, ledger).caught[0].note).toBe('ôn lại sau 1 ngày');
    const key = Object.keys(ledger.reviews)[0];
    const later = {
      ...ledger,
      reviews: {
        [key]: { ...ledger.reviews[key], stage: 2, dueAt: '2026-11-26T08:00:00.000Z' },
      },
    };
    const s = summarizeHaul(g, later);
    expect(s.caught[0].note).toBe('ôn lại sau 7 ngày');
    expect(s.caught[0].days).toBe(7);
  });

  it('groups the three flashcards of one species into one entry', () => {
    const g = game(
      ['name:en', 'name:ja', 'name:scientific'].map((skill, i) =>
        question(
          'f' + i,
          { targetId: 'cod', targetLabel: 'Cá tuyết', skill, selfRated: true },
          { type: 'flashcard', front: 'Cá tuyết' },
        ),
      ),
      'flashcard',
    );
    const s = withLedger(g);
    expect(s.title).toBe('1 / 1 loài vào lưới');
    expect(s.caught[0]).toMatchObject({ targetId: 'cod', label: 'Cá tuyết', kind: 'species' });
  });

  it('a species with one wrong skill slips the net', () => {
    const g = game(
      [
        question('f0', { targetId: 'cod', targetLabel: 'Cá tuyết', skill: 'name:en' }),
        question('f1', {
          targetId: 'cod',
          targetLabel: 'Cá tuyết',
          skill: 'name:ja',
          correct: false,
        }),
      ],
      'flashcard',
    );
    const s = withLedger(g);
    expect(s.title).toBe('0 / 1 loài vào lưới');
    expect(s.missed[0].note).toBe('Sổng lưới · ôn lại ngày mai');
  });

  it('expands a match into one entry per pair', () => {
    const g = game(
      [
        question(
          'm',
          {
            targetId: 'matching',
            targetLabel: 'Ghép tên thương mại',
            skill: 'match:en',
            correct: false,
            items: [
              { targetId: 'a', correct: true, label: 'Tôm sú' },
              { targetId: 'b', correct: false, label: 'Mực ống' },
              { targetId: 'c', correct: true, label: 'Hải sâm' },
            ],
          },
          { type: 'match' },
        ),
      ],
      'match',
    );
    const s = withLedger(g);
    expect(s.title).toBe('2 / 3 loài vào lưới');
    expect(s.missed.map((m) => m.label)).toEqual(['Mực ống']);
  });

  it('a skipped question is not called a miss with a review it does not have', () => {
    const g = game([
      question('q1', {
        targetId: 'a',
        targetLabel: 'Tôm sú',
        skipped: true,
        answered: false,
        correct: false,
      }),
    ]);
    const s = withLedger(g);
    expect(s.title).toBe('0 / 1 loài vào lưới');
    expect(s.missed[0].note).toBe('Bỏ qua · không lên lịch ôn');
    expect(s.missed[0].skipped).toBe(true);
  });

  it('labels an HS case with its scenario title, not the tariff code', () => {
    const g = game(
      [
        question(
          'h',
          { targetId: 'case-1', targetLabel: '0306.17', skill: 'hs' },
          { type: 'hs', prompt: 'Tôm sú đông lạnh nguyên con\nMô tả lô hàng…' },
        ),
      ],
      'hs',
    );
    const s = withLedger(g);
    expect(s.caught[0]).toMatchObject({ label: 'Tôm sú đông lạnh nguyên con', kind: 'hs' });
    expect(s.title).toBe('1 / 1 hồ sơ vào lưới');
  });

  it('says "mục" when species and HS cases share one haul', () => {
    const g = game(
      [
        question('q1', { targetId: 'a', targetLabel: 'Tôm sú' }),
        question(
          'h',
          { targetId: 'case-1', targetLabel: '0306.17', skill: 'hs', correct: false },
          { type: 'hs', prompt: 'Tôm sú đông lạnh nguyên con\nMô tả lô hàng…' },
        ),
      ],
      'review',
    );
    expect(withLedger(g).title).toBe('1 / 2 mục vào lưới');
  });

  it('counts days to the effective due date when a practice cannot move the stored one', () => {
    const g = game([question('q1', { targetId: 'a', targetLabel: 'Tôm sú' })]);
    const ledger = mergeGame(empty, g);
    const key = Object.keys(ledger.reviews)[0];
    // Stage 2 (7 days) whose stored date sits one day after this practice: the learner UI
    // treats it as due a full interval after the practice, so the summary says 7, not 1.
    const practised = {
      ...ledger,
      reviews: {
        [key]: { ...ledger.reviews[key], stage: 2, dueAt: '2026-11-20T08:00:00.000Z' },
      },
    };
    expect(summarizeHaul(g, practised).caught[0].note).toBe('ôn lại sau 7 ngày');
  });

  it('ignores questions without a result', () => {
    const g = game([question('q1', { targetId: 'a', targetLabel: 'Tôm sú' }), question('q2')]);
    expect(withLedger(g).title).toBe('1 / 1 loài vào lưới');
  });
});
