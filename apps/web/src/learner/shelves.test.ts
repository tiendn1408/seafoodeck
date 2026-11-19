import { describe, expect, it } from 'vitest';
import { groupSections, libraryPath } from './shelves';

const item = (id: string, g: string | null | undefined) => ({ id, taxonomicGroup: g });

describe('groupSections', () => {
  it('orders sections fish, crustacean, mollusc, other, then no group, keeping item order', () => {
    const s = groupSections([
      item('a', 'mollusc'),
      item('b', null),
      item('c', 'fish'),
      item('d', 'mollusc'),
      item('e', 'crustacean'),
      item('f', undefined),
    ]);
    expect(s.map((x) => x.key)).toEqual(['fish', 'crustacean', 'mollusc', 'none']);
    expect(s.find((x) => x.key === 'mollusc')!.items.map((i) => i.id)).toEqual(['a', 'd']);
    expect(s.find((x) => x.key === 'none')!.label).toBe('Chưa phân nhóm');
  });

  it('never guesses a group from an unknown value', () => {
    expect(groupSections([item('x', 'whale')])[0].key).toBe('none');
  });

  it('keeps every one of 120 items exactly once', () => {
    const groups = ['fish', 'crustacean', 'mollusc', 'other', null];
    const many = Array.from({ length: 120 }, (_, i) => item(String(i), groups[i % 5]));
    const s = groupSections(many);
    expect(s).toHaveLength(5);
    expect(s.flatMap((x) => x.items)).toHaveLength(120);
    expect(s.every((x) => x.items.length === 24)).toBe(true);
  });
});

describe('libraryPath', () => {
  it('builds the paged catalogue query with search and taxon', () => {
    expect(libraryPath(2, 'ミドリ', 'mollusc')).toBe(
      '/catalog/items?page=2&limit=12&learnable=false&q=%E3%83%9F%E3%83%89%E3%83%AA&taxon=mollusc',
    );
    expect(libraryPath(1, '', '')).toBe('/catalog/items?page=1&limit=12&learnable=false&q=');
  });
});
