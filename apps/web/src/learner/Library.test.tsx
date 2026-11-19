import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { CatalogItem } from '../pilot/api';
import { LibraryResults } from './Library';

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
