import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Review } from './Review';
import { clearMe } from './meStore';
import { button, click, mount, unmountAll } from './testDom';
import type { CatalogOverview, MeReview, MeReviewEntry } from '../pilot/api';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const species = (n: number) => ({
  revisionId: 'r' + n,
  itemId: 'i' + n,
  vi: 'Loài ' + n,
  scientific: 'Species ' + n,
  taxonomicGroup: 'fish' as const,
  imageId: null,
});
const overview: CatalogOverview = {
  releaseId: 'rel1',
  internal: false,
  learnable: 3,
  groups: { fish: 3, crustacean: 0, mollusc: 0, other: 0, none: 0 },
  hsCases: 0,
  items: [1, 2, 3].map(species),
};
const entry = (n: number, over: Partial<MeReviewEntry> = {}): MeReviewEntry => ({
  targetId: 'i' + n,
  itemId: 'i' + n,
  label: 'Loài ' + n,
  skill: 'name:en',
  stage: 1,
  dueAt: '2026-11-20T00:00:00.000Z',
  ...over,
});

let routes: Record<string, () => Promise<Response>>;
let calls: { key: string; body?: string }[];
beforeEach(() => {
  clearMe();
  calls = [];
  routes = {
    'GET /catalog/overview': () => json(overview),
    'GET /me/mastery': () =>
      json({ i1: { status: 'due', level: 2 }, i2: { status: 'learning', level: 1 } }),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push({ key });
      const r = routes[key];
      return r ? r() : json({ message: 'unrouted ' + key }, 404);
    }),
  );
});
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
async function show(data: MeReview, onStart = vi.fn(async () => {}), pending = false) {
  routes['GET /me/review'] = () => json(data);
  const host = mount(<Review userId="u1" pending={pending} onStart={onStart} />);
  await tick();
  await tick();
  return { host, onStart };
}

describe('Review from /me/review', () => {
  it('splits due and scheduled by the server lists and groups skills by species', async () => {
    const { host } = await show({
      due: [entry(1), entry(1, { targetId: 'i1', skill: 'name:ja' }), entry(2)],
      scheduled: [entry(3, { stage: 2, dueAt: '2026-12-01T12:00:00.000Z' })],
    });
    const due = host.querySelector('#review-due')!.closest('section')!;
    const later = host.querySelector('#review-later')!.closest('section')!;
    expect(due.querySelectorAll('.review-entry')).toHaveLength(2);
    expect(due.querySelectorAll('.review-skill')).toHaveLength(3);
    expect(later.querySelectorAll('.review-entry')).toHaveLength(1);
    expect(later.textContent).toContain('Loài 3');
    expect(later.textContent).toContain('Mốc 7 ngày');
    expect(due.textContent).toContain('Tên tiếng Nhật');
    // Figures and headings count species (rows), like "Chưa vào lịch"; skills stay in the rows.
    expect(host.querySelector('.ice-figures')!.textContent).toBe('Loài đến hạn2Loài đã lên lịch1');
    expect(due.querySelector('.ice-count')!.textContent).toBe('2');
    expect(later.querySelector('.ice-count')!.textContent).toBe('1');
    expect(due.querySelector('[aria-label="Mức nhớ 2/4"]')).not.toBeNull();
  });

  it('shows HS rows in their own group labelled by the entry label', async () => {
    const { host } = await show({
      due: [entry(1, { itemId: null, targetId: 'hs1', label: 'HS 0306', skill: 'hs:form' })],
      scheduled: [],
    });
    const plain = host.querySelector('.review-plain')!;
    expect(plain.textContent).toContain('HS 0306');
    expect(plain.textContent).toContain('HS theo dạng hàng');
  });

  it('starts a review with limit <= 30 and no reviewTargets', async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      entry(1, { targetId: 'i1-' + i, skill: 'name:en' }),
    );
    const { host, onStart } = await show({ due: many, scheduled: [] });
    await click(button(host, 'Ôn 40 mục'));
    expect(onStart).toHaveBeenCalledWith('review', undefined, 'en', undefined, undefined, 30);
  });

  it('passes the due count as limit when under 30', async () => {
    const { host, onStart } = await show({ due: [entry(1), entry(2)], scheduled: [] });
    await click(button(host, 'Ôn 2 mục'));
    expect(onStart).toHaveBeenCalledWith('review', undefined, 'en', undefined, undefined, 2);
  });

  it('counts a species with several scheduled skills once', async () => {
    const { host } = await show({
      due: [],
      scheduled: ['name:en', 'name:ja', 'name:scientific'].map((skill) =>
        entry(1, { skill, dueAt: '2026-12-01T00:00:00.000Z' }),
      ),
    });
    expect(host.querySelector('.ice-figures')!.textContent).toBe('Loài đến hạn0Loài đã lên lịch1');
    expect(host.querySelector('#review-later .ice-count')!.textContent).toBe('1');
  });

  it('with nothing due the disabled action says so instead of "Ôn 0 mục"', async () => {
    const { host } = await show({
      due: [],
      scheduled: [entry(1, { dueAt: '2026-12-01T00:00:00.000Z' })],
    });
    const action = host.querySelector<HTMLButtonElement>('.review-action .ice-primary')!;
    expect(action.disabled).toBe(true);
    expect(action.textContent).toBe('Chưa có mục đến hạn');
    expect(host.textContent).not.toContain('Ôn 0 mục');
    expect(host.querySelector('.review-action .ice-note')!.textContent).toContain('Mục kế tiếp');
  });

  it('shows the empty state when nothing is scheduled', async () => {
    const { host } = await show({ due: [], scheduled: [] });
    expect(host.textContent).toContain('Chưa có mục ôn tập');
    expect(host.querySelector('.review-action')).toBeNull();
  });

  it('shows an error with retry on first-load failure', async () => {
    routes['GET /me/review'] = () => json({ message: 'hỏng' }, 500);
    const host = mount(<Review userId="u1" pending={false} onStart={async () => {}} />);
    await tick();
    await tick();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('hỏng');
    expect(button(host, 'Thử lại')).toBeTruthy();
  });
});
