import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { ApiQuestion, Game } from '../../pilot/api';
import { QuestionView } from './QuestionView';
import type { SpeciesRef } from './species';

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
