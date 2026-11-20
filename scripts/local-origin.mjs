// Guard for scripts that log in as admin and change data: only loopback hosts unless explicitly allowed.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** True when `origin` is an http(s) URL whose host is a loopback name or address. */
export function isLoopbackOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return LOOPBACK.has(url.hostname.toLowerCase());
}

/** Returns null when the run may go ahead, or a refusal message. */
export function refuseNonLocal(origin, argv) {
  if (isLoopbackOrigin(origin) || argv.includes('--allow-nonlocal')) return null;
  return `Từ chối chạy: ${origin} không phải máy local (127.0.0.1, localhost, ::1). Script này tạo người dùng QA và đăng/rollback release nội bộ; không chạy trên VPS/production. Chỉ dùng --allow-nonlocal cho môi trường kiểm thử riêng.`;
}
