export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class NetworkError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'NetworkError';
  }
}

// True only for explicit fetch/network failures, never for programming errors.
export function isNetworkError(error) {
  if (error instanceof NetworkError) return true;
  return error instanceof TypeError && error.message === 'fetch failed';
}

// GET retries HTTP 429 and network failures. POST retries only HTTP 429, because a request
// that failed mid-flight may already have been applied and a retry would duplicate it.
export async function withRetry(fn, { tries = 5, baseMs = 500, method = 'GET' } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error?.status === 429 || (method === 'GET' && isNetworkError(error));
      if (!retryable || attempt >= tries) throw error;
      await sleep(baseMs * 2 ** (attempt - 1));
    }
  }
}

export class ApiClient {
  cookie = '';
  csrf = '';

  constructor(baseUrl, fetchImpl = globalThis.fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetch = fetchImpl;
  }

  async request(method, path, body) {
    const hasBody = body !== undefined;
    const headers = {
      ...(this.cookie ? { Cookie: this.cookie } : {}),
      ...(hasBody
        ? {
            'X-CSRF-Token': this.csrf,
            ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          }
        : {}),
    };
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers,
        body: !hasBody ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      });
    } catch (error) {
      if (error instanceof TypeError) throw new NetworkError(`${method} ${path}: lỗi mạng`, error);
      throw error;
    }
    const setCookie = response.headers.getSetCookie?.()[0];
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
    if (data && typeof data === 'object' && data.csrf) this.csrf = data.csrf;
    return { status: response.status, data };
  }

  async call(method, path, body) {
    const { status, data } = await this.request(method, path, body);
    if (status < 200 || status >= 300)
      throw new ApiError(`${method} ${path} → ${status}: ${data?.message ?? ''}`, status, data);
    return data;
  }

  get(path) {
    return this.call('GET', path);
  }

  post(path, body) {
    return this.call('POST', path, body ?? {});
  }

  // GET that maps 404 to null.
  async getOptional(path) {
    try {
      return await this.get(path);
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }
}

// Detects the image format from magic bytes. Returns 'jpeg' | 'png' | 'webp' | 'gif' | 'unknown'.
export function detectImageFormat(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (
    b.length >= 12 &&
    b.toString('latin1', 0, 4) === 'RIFF' &&
    b.toString('latin1', 8, 12) === 'WEBP'
  )
    return 'webp';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'gif';
  return 'unknown';
}

export const SUPPORTED_IMAGE_FORMATS = ['jpeg', 'png', 'webp'];
