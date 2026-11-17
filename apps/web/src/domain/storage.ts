import type { AppState } from './models';
import { emptyState } from './session';

export const STORAGE_KEY = 'seafood-deck:state:v1';
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isoDate = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const skillValid = (v: unknown) =>
  typeof v === 'string' &&
  /^(name:(en|ja|scientific)|match:(en|ja|scientific)|listening|image|hs)$/u.test(v);
export function validState(v: unknown): v is AppState {
  if (!isRecord(v) || v.schemaVersion !== 1 || !Array.isArray(v.attempts) || !isRecord(v.reviews))
    return false;
  if (
    !v.attempts.every(
      (a) =>
        isRecord(a) &&
        ['id', 'sessionId', 'questionId', 'targetId', 'contentVersion', 'answer'].every(
          (k) => typeof a[k] === 'string',
        ) &&
        skillValid(a.skill) &&
        typeof a.correct === 'boolean' &&
        typeof a.selfRated === 'boolean' &&
        typeof a.isReview === 'boolean' &&
        (a.skipped === undefined || typeof a.skipped === 'boolean') &&
        Number.isInteger(a.attemptNumber) &&
        Number(a.attemptNumber) > 0 &&
        isoDate(a.at),
    )
  )
    return false;
  if (new Set(v.attempts.map((a) => a.id)).size !== v.attempts.length) return false;
  if (
    !Object.entries(v.reviews).every(
      ([key, r]) =>
        isRecord(r) &&
        r.key === key &&
        key === `${r.targetId}/${r.skill}` &&
        skillValid(r.skill) &&
        typeof r.targetId === 'string' &&
        typeof r.lastSessionId === 'string' &&
        typeof r.contentVersion === 'string' &&
        typeof r.selfRated === 'boolean' &&
        Number.isInteger(r.stage) &&
        Number(r.stage) >= 0 &&
        Number(r.stage) <= 3 &&
        isoDate(r.dueAt),
    )
  )
    return false;
  if (v.session === null) return true;
  const s = v.session;
  if (
    !isRecord(s) ||
    typeof s.id !== 'string' ||
    !['full', 'flashcard', 'match', 'hs', 'image', 'review'].includes(String(s.mode)) ||
    typeof s.contentVersion !== 'string' ||
    !isoDate(s.startedAt) ||
    !Array.isArray(s.questions) ||
    !Number.isInteger(s.cursor) ||
    Number(s.cursor) < 0 ||
    Number(s.cursor) > s.questions.length ||
    !isRecord(s.ui)
  )
    return false;
  if (s.completedAt !== undefined && (!isoDate(s.completedAt) || s.cursor !== s.questions.length))
    return false;
  if (s.cursor === s.questions.length && !s.completedAt) return false;
  if (
    !Object.values(s.ui).every(
      (u) =>
        isRecord(u) &&
        (u.flipped === undefined || typeof u.flipped === 'boolean') &&
        (u.choice === undefined || typeof u.choice === 'string') &&
        (u.followUp === undefined || typeof u.followUp === 'string'),
    )
  )
    return false;
  return s.questions.every((q) => {
    if (!isRecord(q) || typeof q.id !== 'string') return false;
    if (q.type === 'flashcard')
      return typeof q.speciesId === 'string' && ['en', 'ja', 'scientific'].includes(String(q.kind));
    if (q.type === 'image')
      return (
        typeof q.speciesId === 'string' &&
        typeof q.assetId === 'string' &&
        Array.isArray(q.options) &&
        q.options.length === 3 &&
        q.options.every((id) => typeof id === 'string') &&
        new Set(q.options).size === 3 &&
        q.options.includes(q.speciesId)
      );
    if (q.type === 'hs') return typeof q.scenarioId === 'string';
    if (
      q.type !== 'match' ||
      !['en', 'ja', 'scientific'].includes(String(q.kind)) ||
      !Array.isArray(q.pairs) ||
      q.pairs.length !== 3 ||
      !Array.isArray(q.rightOrder) ||
      q.rightOrder.length !== 3
    )
      return false;
    const ids = q.pairs.map((p) =>
      isRecord(p) &&
      typeof p.speciesId === 'string' &&
      typeof p.left === 'string' &&
      typeof p.right === 'string'
        ? p.speciesId
        : null,
    );
    return (
      ids.every(Boolean) &&
      new Set(ids).size === 3 &&
      new Set(q.rightOrder).size === 3 &&
      q.rightOrder.every((id) => ids.includes(id))
    );
  });
}
export function loadState(storage: StorageLike): { state: AppState; warning?: string } {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return {
      state: emptyState(),
      warning: 'Không đọc được tiến độ trên thiết bị. Bạn vẫn có thể học trong lần mở này.',
    };
  }
  if (!raw) return { state: emptyState() };
  try {
    const value: unknown = JSON.parse(raw);
    if (!validState(value))
      return {
        state: emptyState(),
        warning:
          'Dữ liệu lưu không tương thích hoặc bị lỗi. Đã mở phiên mới; bản lưu cũ chưa bị xóa.',
      };
    return { state: value };
  } catch {
    return {
      state: emptyState(),
      warning:
        'Dữ liệu lưu không tương thích hoặc bị lỗi. Đã mở phiên mới; bản lưu cũ chưa bị xóa.',
    };
  }
}
export function saveState(storage: StorageLike, state: AppState): string | undefined {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return undefined;
  } catch {
    return 'Không lưu được tiến độ. Bạn vẫn có thể học, nhưng tiến độ có thể mất khi tải lại.';
  }
}
