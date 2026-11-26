import { isSerializationConflict } from './progress-record';

export const BUSY = 'Hệ thống đang bận, vui lòng thử lại.';
/** HTTP status for a non-HttpException error (Prisma codes and serialization conflicts). */
export function errorStatus(error: unknown): number {
  const code = (error as { code?: string } | null)?.code;
  if (isSerializationConflict(error)) return 409;
  return code === 'P2025' ? 404 : code === 'P2002' ? 409 : code === 'P1001' ? 503 : 500;
}
/** Body for a non-HttpException error; a serialization conflict carries `code: 'BUSY'` (retryable). */
export function errorBody(error: unknown): { message: string; code?: 'BUSY' } {
  return isSerializationConflict(error)
    ? { message: BUSY, code: 'BUSY' }
    : { message: 'Lỗi máy chủ. Thử lại sau.' };
}
