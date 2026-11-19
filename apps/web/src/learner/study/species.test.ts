import { describe, expect, it } from 'vitest';
import type { CatalogOverview } from '../../pilot/api';
import { findSpecies, indexOverview, lightItem } from './species';

const overview = {
  releaseId: 'rel-1',
  internal: true,
  learnable: 3,
  groups: { fish: 1, crustacean: 1, mollusc: 0, other: 0, none: 1 },
  hsCases: 0,
  items: [
    { revisionId: 'r1', itemId: 'a', vi: 'Tôm sú', scientific: '', taxonomicGroup: 'crustacean' },
    { revisionId: 'r2', itemId: 'b', vi: 'Cá ngừ', scientific: '', taxonomicGroup: 'fish' },
    { revisionId: 'r3', itemId: 'c', vi: 'Cá ngừ', scientific: '', taxonomicGroup: null },
    { revisionId: 'r4', itemId: 'd', vi: 'Hải sâm', scientific: '', taxonomicGroup: null },
  ],
} as CatalogOverview;

describe('species index', () => {
  const index = indexOverview(overview);
  it('resolves an exact, unique Vietnamese name with its group', () => {
    expect(findSpecies(index, 'rel-1', 'Tôm sú')).toEqual({
      revisionId: 'r1',
      group: 'crustacean',
    });
    expect(findSpecies(index, 'rel-1', 'Hải sâm')).toEqual({ revisionId: 'r4', group: 'none' });
  });
  it('never guesses: ambiguous names, other releases and unknown names stay unresolved', () => {
    expect(findSpecies(index, 'rel-1', 'Cá ngừ')).toBeNull();
    expect(findSpecies(index, 'rel-2', 'Tôm sú')).toBeNull();
    expect(findSpecies(index, 'rel-1', 'Tôm')).toBeNull();
    expect(findSpecies(null, 'rel-1', 'Tôm sú')).toBeNull();
  });
  it('builds a photo-less stand-in from the question data', () => {
    const item = lightItem('Tôm sú', 'crustacean');
    expect(item.names).toHaveLength(1);
    expect(item.media).toEqual([]);
    expect(item.taxonomicGroup).toBe('crustacean');
    expect(lightItem('X').taxonomicGroup).toBeNull();
  });
});
