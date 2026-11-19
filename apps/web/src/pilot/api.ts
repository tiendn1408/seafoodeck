export interface AuthView {
  role: string;
  internal: boolean;
  csrf: string;
  expiresAt: string;
}
export interface CatalogItem {
  revisionId: string;
  externalId: string;
  sku: string;
  group: string;
  names: { kind: string; label: string; source: string; pronunciation: string | null }[];
  forms: string[];
  identification: string;
  note: string;
  media: { id: string; role: string; nameKind: string | null; approved: boolean }[];
  taxonomicGroup?: 'fish' | 'crustacean' | 'mollusc' | 'other' | null;
  family?: string | null;
  familyVi?: string | null;
  enAliases?: string[];
  jaKanji?: string | null;
  jaTrade?: string | null;
}
export interface CatalogOverview {
  releaseId: string;
  internal: boolean;
  learnable: number;
  groups: { fish: number; crustacean: number; mollusc: number; other: number; none: number };
  hsCases: number;
  items: {
    revisionId: string;
    /** Item row id (uuid): same as ledger/learning targetId. */
    itemId: string;
    vi: string;
    scientific: string;
    taxonomicGroup: 'fish' | 'crustacean' | 'mollusc' | 'other' | null;
    imageId: string | null;
  }[];
}
export interface CatalogPage {
  releaseId: string;
  internal: boolean;
  page: number;
  limit: number;
  total: number;
  items: CatalogItem[];
  /** Items per taxonomic group for the current search, ignoring the taxon filter. */
  groups?: { fish: number; crustacean: number; mollusc: number; other: number; none: number };
}
export interface Score {
  targetLabel?: string;
  at?: string;
  items?: { targetId: string; correct: boolean; label?: string }[];
  answered: boolean;
  skipped: boolean;
  correct: boolean;
  selfRated: boolean;
  questionId: string;
  targetId: string;
  skill: string;
  contentVersion: string;
  explanation: string;
  source?: string;
  correctOption?: string;
  correctPairs?: Record<string, string>;
}
export interface Option {
  id: string;
  label: string;
}
export interface ApiQuestion {
  id: string;
  type: string;
  prompt: string;
  front?: string;
  options?: Option[];
  left?: Option[];
  right?: Option[];
  followUps?: Option[];
  catalog?: string;
  image?: { url: string; expiresIn: number };
  audio?: { url: string; expiresIn: number };
  unavailable: boolean;
  result?: Score;
}
export interface Game {
  id: string;
  releaseId: string;
  internal: boolean;
  mode: string;
  expiresAt: string;
  questions: ApiQuestion[];
}
export interface Reveal {
  audio?: { url: string; expiresIn: number } | null;
  label: string;
  pronunciation: string | null;
  source: string;
  audioAssetId: string | null;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers:
        body === undefined
          ? {}
          : {
              ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
              'X-CSRF-Token': csrf,
            },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.', 0);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      'API trả phản hồi không hợp lệ; kiểm tra proxy và máy chủ.',
      response.status,
    );
  }
  if (!response.ok)
    throw new ApiError(
      Array.isArray(data.message)
        ? data.message.join('; ')
        : (data.message ?? 'Không thực hiện được yêu cầu.'),
      response.status,
    );
  return data;
}
export const vi = (item: CatalogItem) => item.names.find((n) => n.kind === 'vi')?.label ?? item.sku;
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
