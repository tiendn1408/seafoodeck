import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { CatalogItem } from '../pilot/api';
import { Profile } from './Profile';
import { mount, unmountAll } from './testDom';

class FakeUtterance {
  constructor(public text: string) {}
}
const installSpeech = () => {
  vi.stubGlobal('speechSynthesis', {
    getVoices: () =>
      [
        { name: 'Samantha', lang: 'en-US' },
        { name: 'Kyoko', lang: 'ja-JP' },
      ] as SpeechSynthesisVoice[],
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
};
const serve = (item: CatalogItem) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(item), { status: 200 }))),
  );
const fourNames: CatalogItem['names'] = [
  { kind: 'vi', label: 'Vẹm xanh', source: 'src', pronunciation: null },
  { kind: 'en', label: 'Blue mussel', source: 'src', pronunciation: null },
  { kind: 'ja', label: 'ムラサキイガイ', source: 'src', pronunciation: null },
  { kind: 'scientific', label: 'Mytilus edulis', source: 'src', pronunciation: null },
];
const LABEL = 'Giọng máy, tham khảo';

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

describe('Profile machine voice', () => {
  it('offers the machine voice for en, ja and scientific names only, never vi', async () => {
    installSpeech();
    serve({ ...profileItem, names: fourNames });
    const host = mount(<Profile id="x" internal={false} canStudy onStart={async () => {}} />);
    await tick();
    expect(host.textContent!.split(LABEL)).toHaveLength(4);
    const vi_ = [...host.querySelectorAll('.profile-name')].find((li) =>
      li.textContent!.includes('Vẹm xanh'),
    )!;
    expect(vi_.textContent).not.toContain(LABEL);
  });
  it('shows only the approved player for a name that has an approved recording', async () => {
    installSpeech();
    serve({
      ...profileItem,
      names: fourNames,
      media: [
        {
          id: 'm-en',
          role: 'pronunciation',
          nameKind: 'en',
          approved: true,
        } as unknown as CatalogItem['media'][number],
      ],
    });
    const host = mount(<Profile id="x" internal={false} canStudy onStart={async () => {}} />);
    await tick();
    const en = [...host.querySelectorAll('.profile-name')].find((li) =>
      li.textContent!.includes('Blue mussel'),
    )!;
    expect(en.textContent).not.toContain(LABEL);
    expect(en.querySelector('.pilot-audio')).not.toBeNull();
    expect(host.textContent!.split(LABEL)).toHaveLength(3);
  });
  it('keeps the missing-audio text and does not throw without speechSynthesis', async () => {
    serve({ ...profileItem, names: fourNames });
    const host = mount(<Profile id="x" internal={false} canStudy onStart={async () => {}} />);
    await tick();
    expect(host.textContent).toContain('Chưa có bản thu đã duyệt.');
    expect(host.textContent).not.toContain(LABEL);
  });
});
