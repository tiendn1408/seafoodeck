import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { renderToString } from 'react-dom/server';
import type { ApiQuestion, Game, Score } from '../../pilot/api';
import { QuestionView, draftStorageKey } from './QuestionView';
import type { SpeciesRef } from './species';
import { button, click, mount, unmountAll } from '../testDom';

function render(q: ApiQuestion, species: SpeciesRef | null) {
  const game: Game = {
    id: 'g-image',
    releaseId: 'rel-1',
    internal: true,
    mode: 'image',
    expiresAt: '2026-11-19T10:00:00.000Z',
    questions: [q],
  };
  const host = document.createElement('div');
  host.innerHTML = renderToString(
    <QuestionView
      game={game}
      q={q}
      index={0}
      species={species}
      speciesSettled
      onScore={() => {}}
      onNext={() => {}}
      onRefresh={async () => undefined}
    />,
  );
  return host;
}

const question: ApiQuestion = {
  id: 'q-image',
  type: 'image',
  prompt: 'Nhìn hình, chọn đúng loài',
  options: [
    { id: 'o1', label: 'Mực ống' },
    { id: 'o2', label: 'Hải sâm' },
    { id: 'o3', label: 'Vẹm xanh' },
  ],
  image: { url: 'https://example.invalid/opaque.jpg', expiresIn: 300 },
  unavailable: false,
};

describe('QuestionView in image mode before the answer', () => {
  it.each([
    ['no species resolved', null],
    ['a species ref leaked in', { revisionId: 'rev-squid', group: 'mollusc' } as SpeciesRef],
  ])('shows no species name, group tag or photo credit (%s)', (_, species) => {
    const host = render(question, species);
    expect(host.querySelector('img')?.getAttribute('src')).toBe(question.image!.url);
    expect(host.querySelector('.cover-title')).toBeNull();
    expect(host.querySelector('.cover-names')).toBeNull();
    expect(host.querySelector('.cover-tags, .cover-group, .cover-family')).toBeNull();
    expect(host.querySelector('.cover-credit, .pilot-media-credit')).toBeNull();
    expect(host.textContent).not.toMatch(/Nhuyễn thể|Giáp xác|Chưa phân nhóm|Cá\b/);
    // Only the prompt is a heading; the options are the only names on screen.
    expect([...host.querySelectorAll('h1')].map((h) => h.textContent)).toEqual([
      'Nhìn hình, chọn đúng loài',
    ]);
  });
});

class FakeUtterance {
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  rate = 1;
  constructor(public text: string) {}
}

function installSpeech() {
  const synth = {
    getVoices: () =>
      [
        { name: 'Samantha', lang: 'en-US' },
        { name: 'Kyoko', lang: 'ja-JP' },
      ] as SpeechSynthesisVoice[],
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return synth;
}

function stubReveal(audio: { url: string; expiresIn: number } | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            label: 'Blue mussel',
            pronunciation: null,
            source: 's',
            audioAssetId: null,
            audio,
          }),
          { status: 200 },
        ),
      ),
    ),
  );
}

const flashcard = (id: string, prompt: string): ApiQuestion => ({
  id,
  type: 'flashcard',
  prompt,
  front: 'Vẹm xanh',
  unavailable: false,
});
const sessionOf = (questions: ApiQuestion[]): Game => ({
  id: 'g-fc',
  releaseId: 'rel-1',
  internal: true,
  mode: 'flashcard',
  expiresAt: '2026-11-19T10:00:00.000Z',
  questions,
});
function view(q: ApiQuestion) {
  return (
    <QuestionView
      game={sessionOf([q])}
      q={q}
      index={0}
      species={null}
      speciesSettled
      onScore={() => {}}
      onNext={() => {}}
      onRefresh={async () => undefined}
    />
  );
}

describe('QuestionView machine voice', () => {
  afterEach(() => {
    unmountAll();
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  const flip = async (host: HTMLElement) => {
    await click(button(host, 'Chạm để lật thẻ'));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
  };
  it.each(['Tên tiếng Anh', 'Tên tiếng Nhật', 'Tên khoa học'])(
    'offers the machine voice on a revealed %s card without approved audio',
    async (prompt) => {
      installSpeech();
      stubReveal(null);
      const host = mount(view(flashcard('q-' + prompt, prompt)));
      await flip(host);
      expect(host.textContent).toContain('Giọng máy, tham khảo');
      expect(host.textContent).toContain('Chưa có bản thu');
    },
  );
  it('shows only the approved player when the reveal has audio', async () => {
    installSpeech();
    stubReveal({ url: 'https://example.invalid/a.mp3', expiresIn: 300 });
    const host = mount(view(flashcard('q-audio', 'Tên tiếng Anh')));
    await flip(host);
    expect(host.textContent).not.toContain('Giọng máy, tham khảo');
    expect(host.textContent).not.toContain('Chưa có bản thu');
  });
  it('never shows the machine voice on a listening question', () => {
    installSpeech();
    const q: ApiQuestion = {
      id: 'q-listen',
      type: 'listening',
      prompt: 'Nghe và chọn',
      options: [{ id: 'o1', label: 'Vẹm xanh' }],
      unavailable: false,
    };
    const host = mount(view(q));
    expect(host.textContent).not.toContain('Giọng máy, tham khảo');
  });
  it('cancels speech when the card changes', async () => {
    const synth = installSpeech();
    stubReveal(null);
    function Host() {
      const [q, setQ] = useState(flashcard('q-1', 'Tên tiếng Anh'));
      return (
        <>
          <button data-testid="next" onClick={() => setQ(flashcard('q-2', 'Tên tiếng Anh'))} />
          {view(q)}
        </>
      );
    }
    const host = mount(<Host />);
    await flip(host);
    expect(host.textContent).toContain('Giọng máy, tham khảo');
    synth.cancel.mockClear();
    await click(host.querySelector('[data-testid=next]') as HTMLElement);
    expect(synth.cancel).toHaveBeenCalled();
  });
});

describe('QuestionView pair combo badges in matching', () => {
  afterEach(() => {
    unmountAll();
    localStorage.clear();
  });
  // Left options are displayed in this (shuffled) order: l3, l1, l2.
  const left = [
    { id: 'l3', label: 'Tôm sú' },
    { id: 'l1', label: 'Mực ống' },
    { id: 'l2', label: 'Hải sâm' },
  ];
  const right = [
    { id: 'r1', label: 'Squid' },
    { id: 'r2', label: 'Sea cucumber' },
    { id: 'r3', label: 'Tiger prawn' },
  ];
  const correct = { l1: 'r1', l2: 'r2', l3: 'r3' };
  /** `verdicts` follow the displayed order; false picks a wrong partner, null leaves it unpaired. */
  function matching(verdicts: (boolean | null)[], result: Partial<Score> | null, draft = true) {
    const q: ApiQuestion = {
      id: 'q-match',
      type: 'match',
      prompt: 'Ghép tên\nTên',
      left,
      right,
      unavailable: false,
    };
    const pairs: Record<string, string> = {};
    left.forEach((o, i) => {
      const v = verdicts[i];
      if (v === null) return;
      pairs[o.id] = v ? correct[o.id as keyof typeof correct] : 'r-wrong';
    });
    if (draft)
      localStorage.setItem(draftStorageKey(sessionOf([]).id, 'q-match'), JSON.stringify({ pairs }));
    if (result) {
      q.result = {
        answered: true,
        skipped: false,
        correct: false,
        selfRated: false,
        questionId: 'q-match',
        targetId: 't',
        skill: 's',
        contentVersion: 'v',
        explanation: '',
        correctPairs: correct,
        ...result,
      };
    }
    return mount(view(q));
  }
  /** The visible text of a badge: its text without the visually hidden part. */
  const visible = (b: Element | null) => {
    if (!b) return '';
    const copy = b.cloneNode(true) as Element;
    copy.querySelector('.study-visually-hidden')?.remove();
    return copy.textContent ?? '';
  };
  const badges = (host: HTMLElement) =>
    [...host.querySelectorAll('.pair-combo')].map((b) => visible(b));
  /** The badge text per displayed pair row, '' when none. */
  const perRow = (host: HTMLElement) =>
    [...host.querySelectorAll('[aria-label="Tên tiếng Việt"] > button')].map((b) =>
      visible(b.querySelector('.pair-combo')),
    );

  it('shows ×2 and ×3 on the second and third of three right pairs', () => {
    expect(perRow(matching([true, true, true], {}))).toEqual(['', '×2', '×3']);
  });
  it('shows nothing when the middle pair is wrong', () => {
    expect(perRow(matching([true, false, true], {}))).toEqual(['', '', '']);
  });
  it('shows ×2 on the second only when the third is wrong', () => {
    expect(perRow(matching([true, true, false], {}))).toEqual(['', '×2', '']);
  });
  it('shows ×2 on the third after a wrong first', () => {
    expect(perRow(matching([false, true, true], {}))).toEqual(['', '', '×2']);
  });
  it('counts an unpaired option as wrong', () => {
    expect(perRow(matching([true, null, true], {}))).toEqual(['', '', '']);
  });
  it('follows the displayed order of the left options', () => {
    const host = matching([true, true, true], {});
    const rows = [...host.querySelectorAll('[aria-label="Tên tiếng Việt"] > button')];
    expect(rows.map((r) => r.textContent?.slice(0, 6))).toEqual(['Tôm sú', 'Mực ốn', 'Hải sâ']);
    expect(badges(host)).toEqual(['×2', '×3']);
  });
  it('names the button with combo N exactly once and keeps the visible ×N', () => {
    const host = matching([true, true, true], {});
    const rows = [...host.querySelectorAll('[aria-label="Tên tiếng Việt"] > button')];
    const badge = rows[1]!.querySelector('.pair-combo')!;
    expect(badge.getAttribute('role')).toBeNull();
    expect(badge.getAttribute('aria-label')).toBeNull();
    expect(visible(badge)).toBe('×2');
    expect(badge.querySelector('.study-visually-hidden')?.textContent).toBe(' combo 2');
    expect(rows[1]!.textContent?.match(/combo 2/g)).toHaveLength(1);
    const times = [...badge.querySelectorAll('span')].find((n) => n.textContent === '×2');
    expect(times?.getAttribute('aria-hidden')).toBe('true');
    expect(
      badge.querySelector('.study-visually-hidden')?.closest('[aria-hidden="true"]'),
    ).toBeNull();
    expect(rows[2]!.textContent?.match(/combo 3/g)).toHaveLength(1);
  });
  it('staggers the reveal with a per-pair delay', () => {
    const host = matching([true, true, true], {});
    const delays = [...host.querySelectorAll('.pair-combo')].map((b) =>
      (b as HTMLElement).style.getPropertyValue('--pair-delay'),
    );
    expect(delays).toEqual(['100ms', '200ms']);
  });
  it('renders no badge before the result exists', () => {
    expect(badges(matching([true, true, true], null))).toEqual([]);
  });
  it('renders no badge for a skipped result', () => {
    expect(badges(matching([true, true, true], { skipped: true, answered: false }))).toEqual([]);
  });
  it('a restored session without a draft shows no badge and no verdict, but the correct pairs', () => {
    const host = matching([true, true, true], {}, false);
    expect(badges(host)).toEqual([]);
    expect(host.querySelector('.is-right, .is-wrong')).toBeNull();
    expect(host.textContent).not.toContain('combo');
    expect([...host.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Mực ống — Squid',
      'Hải sâm — Sea cucumber',
      'Tôm sú — Tiger prawn',
    ]);
  });
});

describe('QuestionView image readiness and the time-up close', () => {
  const imageGame: Game = {
    id: 'g-image',
    releaseId: 'rel-1',
    internal: true,
    mode: 'image',
    expiresAt: '2026-11-27T10:00:00.000Z',
    questions: [question],
  };
  let bodies: { url: string; body: { key: string; answer: unknown } }[];
  afterEach(() => {
    unmountAll();
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  function stubAttempts() {
    bodies = [];
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        bodies.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              answered: true,
              skipped: false,
              correct: false,
              selfRated: false,
              questionId: question.id,
              targetId: 't',
              skill: 'name',
              contentVersion: 'rel-1',
              explanation: 'Hết giờ, tính là chưa chính xác.',
              at: '2026-11-27T08:00:00.000Z',
              correctOption: 'o1',
            }),
            { status: 200 },
          ),
        );
      }),
    );
  }
  function show(q: ApiQuestion, extra: Partial<Parameters<typeof QuestionView>[0]> = {}) {
    return mount(
      <QuestionView
        game={{ ...imageGame, questions: [q] }}
        q={q}
        index={0}
        species={null}
        speciesSettled
        onScore={() => {}}
        onNext={() => {}}
        onRefresh={async () => undefined}
        {...extra}
      />,
    );
  }

  it('reports the image ready once it loads, not before', () => {
    const settled = vi.fn();
    const host = show(question, { onImageSettled: settled });
    expect(settled).not.toHaveBeenCalled();
    act(() => void host.querySelector('img')!.dispatchEvent(new Event('load')));
    expect(settled).toHaveBeenCalled();
  });

  it('reports ready when the image fails', () => {
    const settled = vi.fn();
    const host = show(question, { onImageSettled: settled });
    act(() => void host.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(settled).toHaveBeenCalled();
  });

  it('reports ready at once for an unavailable question', () => {
    const settled = vi.fn();
    show({ ...question, unavailable: true, image: undefined }, { onImageSettled: settled });
    expect(settled).toHaveBeenCalled();
  });

  it('closeOut sends the selected option with the question token', async () => {
    stubAttempts();
    localStorage.setItem(
      draftStorageKey('g-image', question.id),
      JSON.stringify({ optionId: 'o2' }),
    );
    const handle = { current: null as null | { closeOut: () => Promise<void> } };
    show(question, { ref: handle });
    await act(async () => handle.current!.closeOut());
    const token = JSON.parse(
      localStorage.getItem(draftStorageKey('g-image', question.id) + ':key')!,
    );
    expect(bodies).toEqual([
      {
        url: '/api/v1/learning/sessions/g-image/questions/q-image/attempts',
        body: { key: token, answer: { optionId: 'o2' } },
      },
    ]);
  });

  it('closeOut keeps the answer of its first call for every retry', async () => {
    stubAttempts();
    const fetchOk = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        bodies.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Promise.reject(new TypeError('Failed to fetch'));
      }),
    );
    localStorage.setItem(
      draftStorageKey('g-image', question.id),
      JSON.stringify({ optionId: 'o2' }),
    );
    const handle = { current: null as null | { closeOut: () => Promise<void> } };
    const host = show(question, { ref: handle });
    await act(async () => handle.current!.closeOut().catch(() => {}));
    await click(button(host, 'Mực ống'));
    vi.stubGlobal('fetch', fetchOk);
    await act(async () => handle.current!.closeOut());
    expect(bodies.map((b) => b.body.answer)).toEqual([{ optionId: 'o2' }, { optionId: 'o2' }]);
    expect(bodies[0].body.key).toBe(bodies[1].body.key);
  });

  it('closeOut without a selection sends a timeout with the deterministic key', async () => {
    stubAttempts();
    const handle = { current: null as null | { closeOut: () => Promise<void> } };
    show(question, { ref: handle });
    await act(async () => handle.current!.closeOut());
    expect(bodies.map((b) => b.body)).toEqual([
      { key: 'timeout-g-image-q-image', answer: { timeout: true } },
    ]);
  });
});
