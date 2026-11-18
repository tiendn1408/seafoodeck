export const IMPORTER_ORIGIN = 'prototype:seafood-master-2';
export const EXTERNAL_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

export interface ImportState {
  externalId: string;
  latest: {
    revisionId: string;
    version: number;
    status: string;
    released: boolean;
    fromImporter: boolean;
    hasProfileImage: boolean;
    scenarioCaseIds: string[];
  };
}

function provenance(data: unknown): Record<string, unknown> | undefined {
  const p =
    data && typeof data === 'object' ? (data as Record<string, unknown>).provenance : undefined;
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : undefined;
}

export function summarizeImportState(item: {
  externalId: string;
  revisions: {
    id: string;
    version: number;
    status: string;
    data: unknown;
    releases: unknown[];
    media: { asset: { role: string; revokedAt: Date | null } }[];
    scenarios: { data: unknown }[];
  }[];
}): ImportState {
  const latest = item.revisions.reduce((a, b) => (b.version > a.version ? b : a));
  return {
    externalId: item.externalId,
    latest: {
      revisionId: latest.id,
      version: latest.version,
      status: latest.status,
      released: latest.releases.length > 0,
      fromImporter: provenance(latest.data)?.origin === IMPORTER_ORIGIN,
      hasProfileImage: latest.media.some((m) => m.asset.role === 'profile' && !m.asset.revokedAt),
      scenarioCaseIds: latest.scenarios.flatMap((s) => {
        const id = provenance(s.data)?.prototypeCaseId;
        return typeof id === 'string' ? [id] : [];
      }),
    },
  };
}
