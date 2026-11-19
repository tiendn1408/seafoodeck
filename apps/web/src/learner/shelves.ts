import { groupTone, type GroupKey } from './haul';

export const PAGE_SIZE = 12;
const ORDER: GroupKey[] = ['fish', 'crustacean', 'mollusc', 'other', 'none'];

/** Split a page of species into group sections (fish, crustacean, mollusc, other, no group). */
export function groupSections<T extends { taxonomicGroup?: string | null }>(
  items: T[],
): { key: GroupKey; label: string; items: T[] }[] {
  const buckets = new Map<GroupKey, T[]>();
  for (const item of items) {
    const key = groupTone(item.taxonomicGroup).key;
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return ORDER.filter((k) => buckets.has(k)).map((key) => ({
    key,
    label: groupTone(key).label,
    items: buckets.get(key)!,
  }));
}

/** The paged catalogue request: every name kind is searched by the API, taxon is optional. */
export function libraryPath(page: number, query: string, taxon: string) {
  return (
    `/catalog/items?page=${page}&limit=${PAGE_SIZE}&learnable=false&q=${encodeURIComponent(query)}` +
    (taxon ? `&taxon=${encodeURIComponent(taxon)}` : '')
  );
}
