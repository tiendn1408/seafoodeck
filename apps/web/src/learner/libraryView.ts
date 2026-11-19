import type { Taxon } from './Home';

/** What the library shows: kept by the app so a trip to a profile (or anywhere) and back
 *  returns to the same search, group and page. Only an explicit change resets it. */
export type LibraryView = { query: string; taxon: Taxon | ''; page: number };

export const LIBRARY_START: LibraryView = { query: '', taxon: '', page: 1 };

export const withQuery = (v: LibraryView, query: string): LibraryView => ({ ...v, query, page: 1 });
export const withTaxon = (v: LibraryView, taxon: Taxon | ''): LibraryView => ({
  ...v,
  taxon,
  page: 1,
});
export const withPage = (v: LibraryView, page: number): LibraryView => ({ ...v, page });
/** A group chosen on Home: that group, from the top, with no leftover search. */
export const openGroup = (taxon: Taxon | ''): LibraryView => ({ ...LIBRARY_START, taxon });
