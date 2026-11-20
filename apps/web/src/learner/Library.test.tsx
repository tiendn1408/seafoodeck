import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import type { CatalogItem } from '../pilot/api';
import { GroupChips, Library, LibraryResults } from './Library';
import { LIBRARY_START } from './libraryView';
import { mount, unmountAll } from './testDom';

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

describe('LibraryResults without mastery', () => {
  it('draws no scales and no legend when levelOf is null', () => {
    const host = render(<LibraryResults items={items.slice(0, 5)} wide={false} levelOf={null} />);
    expect(host.querySelectorAll('.library-card')).toHaveLength(5);
    expect(host.querySelector('[role="img"][aria-label]')).toBeNull();
    expect(host.querySelector('.library-section-legend')).toBeNull();
  });
});

describe('Library mastery source', () => {
  afterEach(() => {
    unmountAll();
    vi.unstubAllGlobals();
  });
  async function open(mastery: Parameters<typeof Library>[0]['mastery']) {
    const calls: string[] = [];
    const page = {
      releaseId: 'rel1',
      internal: false,
      page: 1,
      limit: 50,
      total: 2,
      items: items.slice(0, 2),
      groups: { fish: 1, crustacean: 1, mollusc: 0, other: 0, none: 0 },
    };
    const overview = {
      releaseId: 'rel1',
      internal: false,
      learnable: 2,
      groups: page.groups,
      hsCases: 0,
      items: items.slice(0, 2).map((i, n) => ({
        revisionId: i.revisionId,
        itemId: 'item' + n,
        vi: 'Loài ' + n,
        scientific: '',
        taxonomicGroup: 'fish',
        imageId: null,
      })),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const path = String(url).replace('/api/v1', '');
        calls.push(path);
        const body = path.startsWith('/catalog/overview')
          ? overview
          : path.startsWith('/catalog/items')
            ? page
            : { message: 'no' };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: body === page || body === overview ? 200 : 404,
          }),
        );
      }),
    );
    const host = mount(
      <Library view={LIBRARY_START} onView={() => {}} mastery={mastery} onVersion={() => {}} />,
    );
    for (let i = 0; i < 3; i++)
      await act(async () => void (await new Promise((r) => setTimeout(r, 250))));
    return { host, calls };
  }

  it('shows each species level from the mastery map', async () => {
    const { host } = await open({
      item0: { status: 'due', level: 3 },
      item1: { status: 'new', level: 0 },
    });
    expect(host.querySelectorAll('[aria-label="Mức nhớ 3/4"]')).toHaveLength(1);
    expect(host.querySelectorAll('[aria-label="Chưa học"]')).toHaveLength(1);
  });

  it('with null shows no chips and requests no /me/mastery', async () => {
    const { host, calls } = await open(null);
    expect(host.querySelectorAll('.library-card')).toHaveLength(2);
    expect(host.querySelector('.mastery')).toBeNull();
    expect(calls.some((c) => c.startsWith('/me'))).toBe(false);
  });
});
