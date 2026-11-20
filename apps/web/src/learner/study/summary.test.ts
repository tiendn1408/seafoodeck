import { describe, expect, it } from 'vitest';
import type { ApiQuestion, Game, ProgressEntry, Score } from '../../pilot/api';
import { summarizeHaul, withServerDays } from './summary';

const AT = '2026-11-19T08:00:00.000Z';
const DAY = 86_400_000;
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
const due = (targetId: string, skill: string, days: number, stage = 0): ProgressEntry => ({
  targetId,
  skill,
  stage,
  dueAt: new Date(Date.parse(AT) + days * DAY).toISOString(),
  level: 1,
});

describe('summarizeHaul', () => {
  it('3 correct + 1 wrong: "3 / 4 loài vào lưới", the wrong one slips the net', () => {
    const g = game([
      question('q1', { targetId: 'a', targetLabel: 'Tôm sú' }),
      question('q2', { targetId: 'b', targetLabel: 'Mực ống', correct: false }),
      question('q3', { targetId: 'c', targetLabel: 'Hải sâm' }),
      question('q4', { targetId: 'd', targetLabel: 'Vẹm xanh' }),
    ]);
    const s = summarizeHaul(g, [due('a', 'image', 1), due('b', 'image', 1)]);
    expect(s.title).toBe('3 / 4 loài vào lưới');
    expect(s.caught.map((c) => c.label)).toEqual(['Tôm sú', 'Hải sâm', 'Vẹm xanh']);
    expect(s.missed).toHaveLength(1);
    expect(s.missed[0].label).toBe('Mực ống');
    expect(s.missed[0].note).toBe('Sổng lưới · ôn lại ngày mai');
  });

  it('reads "ôn lại sau X ngày" from the progress dueAt relative to the answer', () => {
    const g = game([question('q1', { targetId: 'a', targetLabel: 'Tôm sú' })]);
    expect(summarizeHaul(g, [due('a', 'image', 1)]).caught[0].note).toBe('ôn lại sau 1 ngày');
    const s = summarizeHaul(g, [due('a', 'image', 7, 2)]);
    expect(s.caught[0].note).toBe('ôn lại sau 7 ngày');
    expect(s.caught[0].days).toBe(7);
  });

  it('takes the earliest dueAt among the skills of one target, rounded, at least 1 day', () => {
    const g = game(
      ['name:en', 'name:ja'].map((skill, i) =>
        question(
          'f' + i,
          { targetId: 'cod', targetLabel: 'Cá tuyết', skill, selfRated: true },
          { type: 'flashcard', front: 'Cá tuyết' },
        ),
      ),
      'flashcard',
    );
    expect(
      summarizeHaul(g, [due('cod', 'name:en', 6.6), due('cod', 'name:ja', 3.2)]).caught[0].days,
    ).toBe(3);
    expect(summarizeHaul(g, [due('cod', 'name:en', 0.1)]).caught[0].days).toBe(1);
    // A progress row for a skill this session did not touch does not count.
    expect(
      summarizeHaul(g, [due('cod', 'name:scientific', 1), due('cod', 'name:en', 14)]).caught[0]
        .days,
    ).toBe(14);
  });

  it('without progress (trial) days are null and a caught entry says "Đã vào lưới"', () => {
    const g = game([question('q1', { targetId: 'a', targetLabel: 'Tôm sú' })]);
    const s = summarizeHaul(g, []);
    expect(s.caught[0].days).toBeNull();
    expect(s.caught[0].note).toBe('Đã vào lưới');
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
    const s = summarizeHaul(g, []);
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
    const s = summarizeHaul(g, [due('cod', 'name:ja', 1)]);
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
    const s = summarizeHaul(g, [due('a', 'match:en', 3)]);
    expect(s.title).toBe('2 / 3 loài vào lưới');
    expect(s.missed.map((m) => m.label)).toEqual(['Mực ống']);
    expect(s.caught.find((c) => c.targetId === 'a')?.days).toBe(3);
  });

  it('a skipped match is one neutral "Ghép tên · bỏ qua" line, not a species', () => {
    const g = game(
      [
        question('q1', { targetId: 'a', targetLabel: 'Tôm sú' }),
        question(
          'm',
          {
            targetId: 'matching',
            targetLabel: 'Ghép tên thương mại',
            skill: 'match:en',
            skipped: true,
            answered: false,
            correct: false,
          },
          { type: 'match' },
        ),
      ],
      'review',
    );
    const s = summarizeHaul(g, []);
    expect(s.title).toBe('1 / 1 loài vào lưới');
    expect(s.total).toBe(1);
    expect(s.missed).toHaveLength(1);
    expect(s.missed[0]).toMatchObject({
      targetId: 'matching',
      kind: 'matching',
      label: 'Ghép tên · bỏ qua',
      skipped: true,
      days: null,
    });
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
    const s = summarizeHaul(g, []);
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
    const s = summarizeHaul(g, [due('case-1', 'hs', 1)]);
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
    expect(summarizeHaul(g, []).title).toBe('1 / 2 mục vào lưới');
  });

  it('a provisional rating joins the real target of another card of the same species', () => {
    const g = game(
      [
        question(
          'f0',
          { targetId: 'cod', targetLabel: 'Cá tuyết', skill: 'name:en', selfRated: true },
          { type: 'flashcard', front: 'Cá tuyết' },
        ),
        question(
          'f1',
          {
            targetId: 'front:Cá tuyết',
            targetLabel: 'Cá tuyết',
            skill: 'name:ja',
            selfRated: true,
            provisional: true,
          },
          { type: 'flashcard', front: 'Cá tuyết' },
        ),
      ],
      'flashcard',
    );
    const s = summarizeHaul(g, []);
    expect(s.title).toBe('1 / 1 loài vào lưới');
    expect(s.caught[0]).toMatchObject({ targetId: 'cod', skills: ['name:en', 'name:ja'] });
  });

  it('ignores questions without a result', () => {
    const g = game([question('q1', { targetId: 'a', targetLabel: 'Tôm sú' }), question('q2')]);
    expect(summarizeHaul(g, []).title).toBe('1 / 1 loài vào lưới');
  });
});

describe('withServerDays', () => {
  it('fills missing days of caught entries from the session summary, never overriding', () => {
    const g = game([
      question('q1', { targetId: 'a', targetLabel: 'Tôm sú' }),
      question('q2', { targetId: 'b', targetLabel: 'Mực ống' }),
      question('q3', { targetId: 'c', targetLabel: 'Hải sâm', correct: false }),
    ]);
    const haul = summarizeHaul(g, [due('b', 'image', 3)]);
    const filled = withServerDays(haul, {
      total: 3,
      caught: 2,
      entries: [
        { targetId: 'a', label: 'Tôm sú', correct: true, skipped: false, nextReviewInDays: 7 },
        { targetId: 'b', label: 'Mực ống', correct: true, skipped: false, nextReviewInDays: 9 },
        { targetId: 'c', label: 'Hải sâm', correct: false, skipped: false, nextReviewInDays: 1 },
      ],
    });
    expect(filled.caught.map((c) => [c.targetId, c.days, c.note])).toEqual([
      ['a', 7, 'ôn lại sau 7 ngày'],
      ['b', 3, 'ôn lại sau 3 ngày'],
    ]);
    expect(filled.missed[0].note).toBe('Sổng lưới · ôn lại ngày mai');
    expect(withServerDays(haul, null)).toBe(haul);
  });
});
