import { describe, expect, it } from 'vitest';
import { LIBRARY_START, openGroup, withPage, withQuery, withTaxon } from './libraryView';

describe('library view state', () => {
  const browsed = withPage(withTaxon(withQuery(LIBRARY_START, 'tôm'), 'crustacean'), 3);

  it('a new search or group goes back to page 1; turning pages keeps both', () => {
    expect(browsed).toEqual({ query: 'tôm', taxon: 'crustacean', page: 3 });
    expect(withQuery(browsed, 'mực')).toEqual({ query: 'mực', taxon: 'crustacean', page: 1 });
    expect(withTaxon(browsed, '')).toEqual({ query: 'tôm', taxon: '', page: 1 });
  });

  it('a group opened from Home starts a fresh view of that group', () => {
    expect(openGroup('mollusc')).toEqual({ query: '', taxon: 'mollusc', page: 1 });
  });
});
