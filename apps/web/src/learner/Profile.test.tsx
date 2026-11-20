import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { CatalogItem } from '../pilot/api';
import { Profile } from './Profile';
import { mount, unmountAll } from './testDom';

const profileItem: CatalogItem = {
  revisionId: 'r1',
  externalId: 'blue-mussel',
  sku: 'MUS-01',
  group: 'Nhuyễn thể hai mảnh vỏ',
  names: [
    { kind: 'vi', label: 'Vẹm xanh', source: 'src', pronunciation: null },
    { kind: 'scientific', label: 'Mytilus edulis', source: 'src', pronunciation: null },
  ],
  forms: [],
  identification: '',
  note: '',
  media: [],
  taxonomicGroup: 'mollusc',
};
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(profileItem), { status: 200 }))),
  );
});
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));

describe('Profile study actions', () => {
  it('shows the flashcard start when the viewer can study', async () => {
    const host = mount(<Profile id="x" internal={false} canStudy onStart={async () => {}} />);
    await tick();
    expect(host.querySelector('.profile-primary')).not.toBeNull();
  });
  it('hides the study actions when the viewer cannot study', async () => {
    const onStart = vi.fn(async () => {});
    const host = mount(<Profile id="x" internal={false} canStudy={false} onStart={onStart} />);
    await tick();
    expect(host.textContent).toContain('Vẹm xanh');
    expect(host.querySelector('.profile-primary, .profile-actions')).toBeNull();
    expect(host.textContent).not.toMatch(/quản lý/i);
  });
});
