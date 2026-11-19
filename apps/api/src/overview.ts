export type TaxonomicGroup = 'fish' | 'crustacean' | 'mollusc' | 'other';
export interface OverviewRow {
  revisionId: string;
  itemId: string;
  vi: string;
  scientific: string;
  taxonomicGroup: TaxonomicGroup | null;
  media: { id: string; role: string; status: string; revokedAt: Date | null }[];
}
/** Minimal revision shape needed to build an overview row. */
export interface OverviewRevision {
  id: string;
  /** Item row id (uuid): the ledger/learning targetId, NOT the human externalId. */
  itemId: string;
  data: unknown;
  names: { kind: string; label: string }[];
  media: { asset: OverviewRow['media'][number] }[];
}
export function toOverviewRow(r: OverviewRevision): OverviewRow {
  const d = r.data as { taxonomicGroup?: TaxonomicGroup | null };
  const label = (kind: string) => r.names.find((n) => n.kind === kind)?.label ?? '';
  return {
    revisionId: r.id,
    itemId: r.itemId,
    vi: label('vi'),
    scientific: label('scientific'),
    taxonomicGroup: d.taxonomicGroup ?? null,
    media: r.media.map((m) => m.asset),
  };
}
export interface CatalogOverview {
  releaseId: string;
  internal: boolean;
  learnable: number;
  groups: { fish: number; crustacean: number; mollusc: number; other: number; none: number };
  hsCases: number;
  items: {
    revisionId: string;
    itemId: string;
    vi: string;
    scientific: string;
    taxonomicGroup: TaxonomicGroup | null;
    imageId: string | null;
  }[];
}
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}
export function summarizeOverview(
  rows: OverviewRow[],
  hsCases: number,
  release: { id: string; internal: boolean },
): CatalogOverview {
  const groups = { fish: 0, crustacean: 0, mollusc: 0, other: 0, none: 0 };
  const usable = (m: OverviewRow['media'][number]) =>
    !m.revokedAt && (release.internal || m.status === 'approved');
  const items = rows.map((r) => {
    groups[r.taxonomicGroup ?? 'none']++;
    const image =
      r.media.find((m) => m.role === 'profile' && usable(m)) ??
      r.media.find((m) => m.role === 'identification' && usable(m));
    return {
      revisionId: r.revisionId,
      itemId: r.itemId,
      vi: r.vi,
      scientific: r.scientific,
      taxonomicGroup: r.taxonomicGroup,
      imageId: image?.id ?? null,
    };
  });
  return {
    releaseId: release.id,
    internal: release.internal,
    learnable: rows.length,
    groups,
    hsCases,
    items,
  };
}

export type GroupTotals = Record<TaxonomicGroup | 'none', number>;
/**
 * Per-group totals for the catalogue chips. `all` counts every item matching the current
 * filters except the taxon; items without one of the four named groups make up `none`.
 */
export function groupTotals(all: number, named: Record<TaxonomicGroup, number>): GroupTotals {
  const sum = named.fish + named.crustacean + named.mollusc + named.other;
  return { ...named, none: Math.max(0, all - sum) };
}
