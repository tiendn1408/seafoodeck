import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, setAuthRequiredHandler } from '../pilot/api';
import { clearMe, refreshMe, useMe } from './meStore';

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
function renderHook<R, P = undefined>(hook: (p: P) => R, opts?: { initialProps: P }) {
  const result = { current: undefined as R };
  let props = opts?.initialProps as P;
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  const Probe = (): ReactNode => {
    result.current = hook(props);
    return null;
  };
  act(() => root.render(createElement(Probe)));
  return {
    result,
    rerender(p?: P) {
      props = p as P;
      act(() => root.render(createElement(Probe)));
    },
    unmount: () => act(() => root.unmount()),
  };
}
async function waitFor(check: () => void, ms = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      check();
      return;
    } catch (e) {
      if (Date.now() > end) throw e;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    }
  }
}
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  clearMe();
  setAuthRequiredHandler(null);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const r of roots.splice(0)) act(() => r.unmount());
});

describe('useMe', () => {
  describe('superseded requests', () => {
    // Request A is superseded by a same-key refresh (B); A then settles late, ignoring its abort signal.
    async function supersede(
      settleA: (a: { resolve(r: Response): void; reject(e: unknown): void }) => void,
    ) {
      let a!: { resolve(r: Response): void; reject(e: unknown): void };
      fetchMock.mockImplementationOnce(
        () => new Promise<Response>((resolve, reject) => (a = { resolve, reject })),
      );
      fetchMock.mockImplementationOnce(() => reply({ n: 2 }));
      const { result } = renderHook(() => useMe<{ n: number }>('/me/home', 'u1'));
      act(() => result.current.refresh());
      await waitFor(() => expect(result.current.data).toEqual({ n: 2 }));
      await act(async () => {
        settleA(a);
        await new Promise((r) => setTimeout(r, 10));
      });
      return result;
    }
    it('ignores a late failure of a superseded request', async () => {
      const result = await supersede((a) => a.reject(new TypeError('offline')));
      expect(result.current.error).toBe('');
      expect(result.current.data).toEqual({ n: 2 });
    });
    it('ignores a late success of a superseded request', async () => {
      const result = await supersede((a) => a.resolve(new Response(JSON.stringify({ n: 1 }))));
      expect(result.current.data).toEqual({ n: 2 });
    });
  });

  it('refreshMe(path) refreshes only matching paths', async () => {
    fetchMock.mockImplementation(() => reply({ n: 1 }));
    const a = renderHook(() => useMe('/me/home', 'u1'));
    const b = renderHook(() => useMe('/me/review', 'u1'));
    await waitFor(() => expect(a.result.current.data).not.toBeNull());
    await waitFor(() => expect(b.result.current.data).not.toBeNull());
    fetchMock.mockClear();
    act(() => refreshMe('/me/review'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/me/review');
  });

  it('returns cached data at once, then revalidates', async () => {
    fetchMock.mockImplementationOnce(() => reply({ n: 1 }));
    const first = renderHook(() => useMe<{ n: number }>('/me/home', 'u1'));
    await waitFor(() => expect(first.result.current.data).toEqual({ n: 1 }));
    first.unmount();
    fetchMock.mockImplementationOnce(() => reply({ n: 2 }));
    const second = renderHook(() => useMe<{ n: number }>('/me/home', 'u1'));
    expect(second.result.current.data).toEqual({ n: 1 });
    await waitFor(() => expect(second.result.current.data).toEqual({ n: 2 }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never exposes the previous user data when userId changes', async () => {
    fetchMock.mockImplementation(() => reply({ who: 'a' }));
    const seen: string[] = [];
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => {
        const r = useMe<{ who: string }>('/me/home', id);
        seen.push(id + ':' + (r.data?.who ?? 'null'));
        return r;
      },
      { initialProps: { id: 'u1' } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ who: 'a' }));
    fetchMock.mockImplementation(() => reply({ who: 'b' }));
    seen.length = 0;
    rerender({ id: 'u2' });
    await waitFor(() => expect(result.current.data).toEqual({ who: 'b' }));
    expect(seen.filter((s) => s.startsWith('u2:') && s.endsWith(':a'))).toEqual([]);
    expect(seen[0]).toBe('u2:null');
  });

  it('clearMe drops cached data', async () => {
    fetchMock.mockImplementation(() => reply({ n: 1 }));
    const first = renderHook(() => useMe<{ n: number }>('/me/home', 'u1'));
    await waitFor(() => expect(first.result.current.data).toEqual({ n: 1 }));
    act(() => clearMe());
    expect(first.result.current.data).toBeNull();
    first.unmount();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const second = renderHook(() => useMe('/me/home', 'u1'));
    expect(second.result.current.data).toBeNull();
  });

  it('never fetches without a userId', () => {
    const { result } = renderHook(() => useMe('/me/home', undefined));
    expect(result.current.data).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps data and sets error on network failure', async () => {
    fetchMock.mockImplementationOnce(() => reply({ n: 1 }));
    const { result } = renderHook(() => useMe<{ n: number }>('/me/home', 'u1'));
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).not.toBe(''));
    expect(result.current.data).toEqual({ n: 1 });
  });

  it('refreshMe refetches active hooks', async () => {
    fetchMock.mockImplementationOnce(() => reply({ n: 1 }));
    const { result } = renderHook(() => useMe<{ n: number }>('/me/home', 'u1'));
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
    fetchMock.mockImplementationOnce(() => reply({ n: 5 }));
    act(() => refreshMe('/me/home'));
    await waitFor(() => expect(result.current.data).toEqual({ n: 5 }));
  });

  it('aborts in-flight requests on unmount', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise(() => {});
    });
    const { unmount } = renderHook(() => useMe('/me/home', 'u1'));
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('routes MUST_CHANGE_PASSWORD to the handler from the store and from api()', async () => {
    const handler = vi.fn();
    setAuthRequiredHandler(handler);
    fetchMock.mockImplementation(() => reply({ message: 'x', code: 'MUST_CHANGE_PASSWORD' }, 403));
    const { result } = renderHook(() => useMe('/me/home', 'u1'));
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.error).not.toBe(''));
    const err = await api('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('MUST_CHANGE_PASSWORD');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe only clears the handler it registered', async () => {
    const first = vi.fn();
    const off = setAuthRequiredHandler(first);
    const second = vi.fn();
    setAuthRequiredHandler(second);
    off();
    fetchMock.mockImplementation(() => reply({ code: 'MUST_CHANGE_PASSWORD' }, 403));
    await expect(api('/x')).rejects.toBeInstanceOf(ApiError);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('api supports PATCH', async () => {
    fetchMock.mockImplementation(() => reply({}));
    await api('/me/password', { a: 1 }, undefined, 'PATCH');
    expect(fetchMock.mock.calls[0]![1].method).toBe('PATCH');
  });
});
