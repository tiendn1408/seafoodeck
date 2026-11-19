import { useEffect, useState } from 'react';
import { api, type CatalogItem, type CatalogOverview } from '../../pilot/api';
import type { GroupKey } from '../haul';

/**
 * Study questions carry the Vietnamese name of their species (`front`, the image options,
 * the score's `targetLabel`) but no catalogue id. The species cover and the haul summary
 * resolve that name against the release overview: only an exact, unique match in the same
 * release counts, anything else stays neutral (no guessed group, no guessed photo).
 */
export type SpeciesRef = { revisionId: string; group: GroupKey };
export type SpeciesIndex = { releaseId: string; byVi: Map<string, SpeciesRef> };

export function indexOverview(o: CatalogOverview): SpeciesIndex {
  const byVi = new Map<string, SpeciesRef>();
  const seen = new Set<string>();
  for (const item of o.items) {
    const key = item.vi.trim();
    if (!key) continue;
    if (seen.has(key)) {
      byVi.delete(key);
      continue;
    }
    seen.add(key);
    byVi.set(key, { revisionId: item.revisionId, group: item.taxonomicGroup ?? 'none' });
  }
  return { releaseId: o.releaseId, byVi };
}

export function findSpecies(
  index: SpeciesIndex | null,
  releaseId: string,
  vi: string | undefined,
): SpeciesRef | null {
  if (!index || !vi || index.releaseId !== releaseId) return null;
  return index.byVi.get(vi.trim()) ?? null;
}

let overview: Promise<SpeciesIndex> | null = null;
function loadIndex(): Promise<SpeciesIndex> {
  overview ??= api<CatalogOverview>('/catalog/overview')
    .then(indexOverview)
    .catch((e) => {
      overview = null;
      throw e;
    });
  return overview;
}

/** The release index for this game; refetched once if the cached one is for another release. */
export function useSpeciesIndex(releaseId: string): {
  index: SpeciesIndex | null;
  settled: boolean;
} {
  const [state, setState] = useState<{ index: SpeciesIndex | null; settled: boolean }>({
    index: null,
    settled: false,
  });
  useEffect(() => {
    let alive = true;
    loadIndex()
      .then((i) => {
        if (i.releaseId === releaseId) return i;
        overview = null;
        return loadIndex();
      })
      .then((index) => {
        if (alive) setState({ index, settled: true });
      })
      .catch(() => {
        if (alive) setState({ index: null, settled: true });
      });
    return () => {
      alive = false;
    };
  }, [releaseId]);
  return state;
}

const items = new Map<string, Promise<CatalogItem>>();
export function loadItem(revisionId: string): Promise<CatalogItem> {
  let p = items.get(revisionId);
  if (!p) {
    p = api<CatalogItem>('/catalog/items/' + encodeURIComponent(revisionId));
    p.catch(() => items.delete(revisionId));
    items.set(revisionId, p);
  }
  return p;
}

export type ItemState =
  | { status: 'loading'; item: null }
  | { status: 'ready'; item: CatalogItem }
  | { status: 'none'; item: null };

/** Full catalogue entry for a resolved species; `none` when it cannot be resolved or loaded. */
export function useCatalogItem(ref: SpeciesRef | null, indexSettled: boolean): ItemState {
  const revisionId = ref?.revisionId;
  const [state, setState] = useState<{ id: string; item: CatalogItem | null } | null>(null);
  useEffect(() => {
    if (!revisionId) return;
    let alive = true;
    loadItem(revisionId)
      .then((item) => {
        if (alive) setState({ id: revisionId, item });
      })
      .catch(() => {
        if (alive) setState({ id: revisionId, item: null });
      });
    return () => {
      alive = false;
    };
  }, [revisionId]);
  if (!revisionId) return indexSettled ? { status: 'none', item: null } : loading;
  if (!state || state.id !== revisionId) return loading;
  return state.item ? { status: 'ready', item: state.item } : { status: 'none', item: null };
}
const loading = { status: 'loading', item: null } as const;

/** A cover-sized stand-in when only the question's own data is known. */
export function lightItem(vi: string, group: GroupKey = 'none'): CatalogItem {
  return {
    revisionId: '',
    externalId: '',
    sku: vi,
    group: '',
    names: [{ kind: 'vi', label: vi, source: '', pronunciation: null }],
    forms: [],
    identification: '',
    note: '',
    media: [],
    taxonomicGroup: group === 'none' ? null : group,
  };
}
