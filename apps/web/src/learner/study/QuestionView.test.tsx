import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { renderToString } from 'react-dom/server';
import type { ApiQuestion, Game } from '../../pilot/api';
import { QuestionView } from './QuestionView';
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
