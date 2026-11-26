import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Admin } from './Admin';
import { field, mount, setValue, unmountAll } from '@web/learner/testDom';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const overview = {
  revisionTotal: 0,
  revisions: [],
  tariffs: [],
  scenarios: [],
  audit: [],
  releases: [
    { id: 'aaaaaaaa-new', internal: true, current: false, items: [{ revisionId: 'r1' }] },
    { id: 'bbbbbbbb-old', internal: true, current: true, items: [{ revisionId: 'r1' }] },
  ],
};
let calls: string[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push(key);
      return key.startsWith('GET /admin/overview') ? json(overview) : json({}, 404);
    }),
  );
});
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});
const tick = (ms = 10) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

it('loads the overview once on mount and searches only on submit', async () => {
  const host = mount(<Admin />);
  await tick();
  expect(calls).toEqual(['GET /admin/overview?q=']);
  setValue(field(host, 'Tìm revision theo ID hoặc tên'), 'tuna');
  await tick();
  expect(calls).toEqual(['GET /admin/overview?q=']);
  const form = field(host, 'Tìm revision theo ID hoặc tên').closest('form')!;
  act(() => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await tick();
  expect(calls).toEqual(['GET /admin/overview?q=', 'GET /admin/overview?q=tuna']);
});

it('marks the release learners are served in the release history', async () => {
  const host = mount(<Admin />);
  await tick();
  const rows = [...host.querySelectorAll('p')].filter((p) =>
    p.textContent?.includes('Quay về bộ này'),
  );
  expect(rows.map((p) => p.textContent?.replace('Quay về bộ này', '').trim())).toEqual([
    'aaaaaaaa · Nội bộ · 1 mục',
    'bbbbbbbb · Nội bộ · 1 mục · Hiện hành',
  ]);
});
