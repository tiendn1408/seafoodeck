import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { CatalogItem } from '../pilot/api';
import { GroupChips, LibraryResults } from './Library';

const groups = ['fish', 'crustacean', 'mollusc', 'other', null] as const;
const items: CatalogItem[] = Array.from({ length: 120 }, (_, i) => ({
  revisionId: 'rev' + i,
  externalId: 'sp-' + i,
  sku: 'SKU' + i,
  group: '',
  names: [
    { kind: 'vi', label: 'Loài ' + i, source: '', pronunciation: null },
    { kind: 'en', label: 'Species ' + i, source: '', pronunciation: null },
    { kind: 'ja', label: 'サカナ' + i, source: '', pronunciation: null },
    { kind: 'scientific', label: 'Genus species' + i, source: '', pronunciation: null },
  ],
  forms: [],
  identification: '',
  note: '',
  media: [],
  taxonomicGroup: groups[i % 5],
}));
const levelOf = (rev: string) => (Number(rev.slice(3)) % 5) as 0 | 1 | 2 | 3 | 4;

function render(node: React.ReactElement) {
  const host = document.createElement('div');
  host.innerHTML = renderToString(node);
  return host;
}

describe('LibraryResults', () => {
  it('groups 120 species into coloured sections of rows on a phone', () => {
    const host = render(<LibraryResults items={items} wide={false} levelOf={levelOf} />);
    const heads = [...host.querySelectorAll('.library-section-head')].map((h) =>
      h.textContent!.replace('Mức nhớ', '').trim(),
    );
    expect(heads).toEqual(['Cá24', 'Giáp xác24', 'Nhuyễn thể24', 'Khác24', 'Chưa phân nhóm24']);
    expect(host.querySelectorAll('.library-card')).toHaveLength(120);
    expect(host.querySelectorAll('.species-card--row')).toHaveLength(120);
    const first = host.querySelector('.library-card')!;
    expect(first.querySelector('a')!.getAttribute('href')).toBe('#profile/sp-0');
    expect(first.textContent).toContain('Species 0 · サカナ0');
    expect(first.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Chưa học');
    expect(host.querySelectorAll('[aria-label="Mức nhớ 3/4"]')).toHaveLength(24);
  });

  it('renders a flat tile grid on desktop', () => {
    const host = render(<LibraryResults items={items.slice(0, 12)} wide levelOf={levelOf} />);
    expect(host.querySelector('.library-section')).toBeNull();
    expect(host.querySelectorAll('.library-grid > .library-card .species-card--tile')).toHaveLength(
      12,
    );
  });
});

describe('GroupChips', () => {
  const chips = (host: HTMLElement) =>
    [...host.querySelectorAll('.library-chip')].map((b) => b.textContent);

  it('shows no counts before the first list response', () => {
    const host = render(<GroupChips taxon="" groups={undefined} onChoose={() => {}} />);
    expect(chips(host)).toEqual(['Tất cả', 'Cá', 'Giáp xác', 'Nhuyễn thể', 'Khác']);
    expect(host.querySelector('.library-chip-count')).toBeNull();
  });

  it('counts each chip from the list response; Tất cả is the sum of all five groups', () => {
    const host = render(
      <GroupChips
        taxon="fish"
        groups={{ fish: 31, crustacean: 19, mollusc: 12, other: 4, none: 934 }}
        onChoose={() => {}}
      />,
    );
    expect(chips(host)).toEqual(['Tất cả1000', 'Cá31', 'Giáp xác19', 'Nhuyễn thể12', 'Khác4']);
    expect(host.querySelector('[aria-pressed="true"]')!.textContent).toBe('Cá31');
  });
});
