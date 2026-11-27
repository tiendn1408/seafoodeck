import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import type { ApiQuestion, Game, Score } from '../../pilot/api';
import { mount, unmountAll } from '../testDom';
import { QuestionView } from './QuestionView';
import { Summary } from './HaulSummary';
import { Study } from './Study';
import { disposeAll } from './submitQueues';

const remove = vi.hoisted(() => vi.fn());
vi.mock('../sound/sfx', () => ({
  playSfx: vi.fn(() => true),
  installSoundUnlock: vi.fn(() => remove),
}));
import { installSoundUnlock, playSfx } from '../sound/sfx';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(playSfx).mockClear();
  vi.mocked(installSoundUnlock).mockClear();
  remove.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ message: 'none' }), { status: 404 })),
    ),
  );
});
afterEach(() => {
  unmountAll();
  disposeAll();
  vi.unstubAllGlobals();
});

const score = (questionId: string, extra: Partial<Score> = {}): Score => ({
  answered: true,
  skipped: false,
  correct: true,
  selfRated: false,
  questionId,
  targetId: 'cod',
  targetLabel: 'Cá tuyết',
  skill: 'name',
  contentVersion: 'rel-1',
  explanation: 'ok',
  at: '2026-11-19T08:00:00.000Z',
  ...extra,
});
const flashcard = (id: string, result?: Score): ApiQuestion => ({
  id,
  type: 'flashcard',
  prompt: 'Tên tiếng Anh',
  front: 'Cá tuyết',
  unavailable: false,
  ...(result ? { result } : {}),
});
const image = (id: string, result?: Score): ApiQuestion => ({
  id,
  type: 'image',
  prompt: 'Nhìn hình, chọn đúng loài',
  options: [
    { id: 'o1', label: 'Mực ống' },
    { id: 'o2', label: 'Hải sâm' },
  ],
  image: { url: 'https://example.invalid/a.jpg', expiresIn: 300 },
  unavailable: false,
  ...(result ? { result } : {}),
});
const gameOf = (questions: ApiQuestion[]): Game => ({
  id: 'g1',
  releaseId: 'rel-1',
  internal: true,
  mode: 'flashcard',
  expiresAt: '2026-11-19T10:00:00.000Z',
  questions,
});
const view = (q: ApiQuestion) => (
  <QuestionView
    game={gameOf([q])}
    q={q}
    index={0}
    species={null}
    speciesSettled
    onScore={() => {}}
    onNext={() => {}}
    onRefresh={async () => undefined}
  />
);

describe('Feedback sounds', () => {
  it.each([
    ['correct', {}, 'correct'],
    ['wrong', { correct: false }, 'wrong'],
    ['skipped', { skipped: true, answered: false, correct: false }, 'neutral'],
    ['self-rated', { selfRated: true }, 'neutral'],
  ] as const)('a %s result plays its sound once', (_, extra, kind) => {
    mount(view(image('q1', score('q1', extra))));
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith(kind);
  });

  it('plays nothing while the question has no result', () => {
    mount(view(image('q1')));
    expect(playSfx).not.toHaveBeenCalled();
  });

  it.each([
    ['flashcard', flashcard('q1', score('q1', { selfRated: true }))],
    ['image', image('q1', score('q1'))],
  ])('plays once in the %s layout, also under StrictMode and re-renders', (_, q) => {
    mount(<StrictMode>{view(q)}</StrictMode>);
    expect(playSfx).toHaveBeenCalledTimes(1);
  });
});

describe('Feedback sound keyed by question', () => {
  it('replacing the score for the same question does not replay; a new question does', async () => {
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = (q: ApiQuestion) => act(() => root.render(<StrictMode>{view(q)}</StrictMode>));
    render(image('q1', score('q1', { provisional: true })));
    render(image('q1', score('q1', { provisional: true })));
    render(image('q1', score('q1')));
    expect(playSfx).toHaveBeenCalledTimes(1);
    render(image('q2', score('q2', { correct: false })));
    expect(playSfx).toHaveBeenCalledTimes(2);
    expect(vi.mocked(playSfx).mock.calls[1]).toEqual(['wrong']);
    act(() => root.unmount());
  });
});

describe('Summary and Study', () => {
  const summary = (
    <Summary
      game={gameOf([flashcard('q1', score('q1'))])}
      progress={[]}
      server={null}
      saving={false}
      saveError={null}
      rope={null}
      lookup={() => null}
      onRetry={() => {}}
      pending={false}
    />
  );

  it('Summary plays done once on mount, not on re-render', async () => {
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<StrictMode>{summary}</StrictMode>));
    act(() => root.render(<StrictMode>{summary}</StrictMode>));
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith('done');
    act(() => root.unmount());
  });

  it('Study mounts the sound control in the bar and unlocks once, removing on unmount', () => {
    const host = mount(
      <Study
        game={gameOf([flashcard('f1'), flashcard('f2')])}
        userKind="trial"
        onChange={() => {}}
        onRetry={() => {}}
        pending={false}
      />,
    );
    expect(host.querySelector('.study-bar button.sound-toggle')).not.toBeNull();
    expect(installSoundUnlock).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    unmountAll();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
