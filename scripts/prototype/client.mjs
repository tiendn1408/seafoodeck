export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries only on HTTP 429 or network failures (errors without an HTTP status).
export async function withRetry(fn, { tries = 5, baseMs = 500 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error?.status === 429 || error?.status === undefined;
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
    const response = await this.fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: !hasBody ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
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
