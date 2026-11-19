import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { CatalogItem } from '../pilot/api';
import { SpeciesCover } from './SpeciesCover';

function render(node: React.ReactElement) {
  const host = document.createElement('div');
  host.innerHTML = renderToString(node);
  return host;
}

function item(extra: Partial<CatalogItem> = {}): CatalogItem {
  return {
    revisionId: 'r1',
    externalId: 'blue-mussel',
    sku: 'MUS-01',
    group: 'Nhuyễn thể hai mảnh vỏ',
    names: [
      { kind: 'vi', label: 'Vẹm xanh', source: 'src', pronunciation: null },
      { kind: 'en', label: 'Blue mussel', source: 'src', pronunciation: null },
      { kind: 'ja', label: 'ムラサキイガイ', source: 'src', pronunciation: 'murasaki-igai' },
      { kind: 'scientific', label: 'Mytilus edulis', source: 'src', pronunciation: null },
    ],
    forms: [],
    identification: '',
    note: '',
    media: [],
    taxonomicGroup: 'mollusc',
    family: 'Mytilidae',
    familyVi: 'họ Vẹm',
    ...extra,
  };
}

describe('SpeciesCover', () => {
  it('shows the missing-photo fallback when the species has no photo', () => {
    const host = render(<SpeciesCover item={item()} reveal={{ names: true }} mode="profile" />);
    expect(host.textContent).toContain('Ảnh đang bổ sung');
    expect(host.querySelector('img')).toBeNull();
  });

  it('puts the Vietnamese name in the h1 with the group tag, family and the three rows', () => {
    const host = render(<SpeciesCover item={item()} reveal={{ names: true }} mode="profile" />);
    expect(host.querySelector('h1')!.textContent).toBe('Vẹm xanh');
    expect(host.textContent).toContain('Nhuyễn thể');
    expect(host.textContent).toContain('Mytilidae (họ Vẹm)');
    const codes = [...host.querySelectorAll('.cover-code')].map((c) => c.textContent);
    expect(codes).toEqual(['EN', 'JP', 'LAT']);
    expect(host.querySelector('i[lang="la"]')!.textContent).toBe('Mytilus edulis');
  });

  it('hides the Vietnamese name and all three rows in image mode before the reveal', () => {
    const host = render(<SpeciesCover item={item()} reveal={{ names: false }} mode="image" />);
    expect(host.textContent).not.toContain('Vẹm xanh');
    expect(host.textContent).not.toContain('Blue mussel');
    expect(host.textContent).not.toContain('ムラサキイガイ');
    expect(host.textContent).not.toContain('Mytilus edulis');
    expect(host.textContent).not.toContain('Mytilidae');
    expect(host.querySelector('h1')).toBeNull();
  });

  it('shows the Japanese trade name and kanji when present', () => {
    const host = render(
      <SpeciesCover
        item={item({ jaKanji: '紫貽貝', jaTrade: 'ムール貝' })}
        reveal={{ names: true }}
        mode="profile"
      />,
    );
    expect(host.textContent).toContain('紫貽貝');
    expect(host.textContent).toContain('tên thương mại');
    expect(host.textContent).toContain('ムール貝');
  });

  it('renders the rope and the answer area', () => {
    const host = render(
      <SpeciesCover
        item={item()}
        reveal={{ names: false }}
        mode="flashcard"
        rope={<p>rope-here</p>}
      >
        <button>Chạm để lật thẻ</button>
      </SpeciesCover>,
    );
    expect(host.textContent).toContain('rope-here');
    expect(host.querySelector('h1')!.textContent).toBe('Vẹm xanh');
    expect(host.textContent).not.toContain('Blue mussel');
    expect(host.querySelector('button')!.textContent).toBe('Chạm để lật thẻ');
  });
});
