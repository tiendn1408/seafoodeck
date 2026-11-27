import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { mount, unmountAll, button, click } from '../learner/testDom';
import { MachineVoice } from './MachineVoice';
import { Pronunciation, stopAudio } from './Media';

const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

class FakeUtterance {
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

function install(initial: SpeechSynthesisVoice[]) {
  let voices = initial;
  const listeners = new Set<() => void>();
  const spoken: FakeUtterance[] = [];
  const synth = {
    getVoices: () => voices,
    speak: vi.fn((u: FakeUtterance) => void spoken.push(u)),
    cancel: vi.fn(),
    addEventListener: vi.fn((_: string, fn: () => void) => void listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: () => void) => void listeners.delete(fn)),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return {
    synth,
    spoken,
    setVoices(next: SpeechSynthesisVoice[]) {
      voices = next;
      act(() => listeners.forEach((fn) => fn()));
    },
  };
}

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});

describe('MachineVoice', () => {
  it('renders nothing without speechSynthesis', () => {
    const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
    expect(host.querySelector('.pilot-audio')).toBeNull();
  });
  it('renders nothing when no voice fits, or the label is empty', () => {
    install([voice('Samantha', 'en-US')]);
    expect(mount(<MachineVoice kind="ja" label="ウニ" />).querySelector('.pilot-audio')).toBeNull();
    expect(mount(<MachineVoice kind="en" label="  " />).querySelector('.pilot-audio')).toBeNull();
  });
  it('shows the label, Nghe and the speed toggle when a voice exists', () => {
    install([voice('Samantha', 'en-US')]);
    const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
    expect(host.textContent).toContain('Giọng máy, tham khảo');
    expect(button(host, 'Nghe')).toBeTruthy();
    expect(button(host, 'Thường').getAttribute('aria-pressed')).toBe('false');
  });
  it('shows the button when voices arrive later and removes the listener on unmount', () => {
    const fake = install([]);
    const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
    expect(host.querySelector('.pilot-audio')).toBeNull();
    const added = fake.synth.addEventListener.mock.calls.at(-1)!;
    expect(added[0]).toBe('voiceschanged');
    fake.setVoices([voice('Samantha', 'en-US')]);
    expect(button(host, 'Nghe')).toBeTruthy();
    unmountAll();
    expect(fake.synth.removeEventListener).toHaveBeenCalledWith('voiceschanged', added[1]);
  });
  it('speaks on click and reports progress', async () => {
    const fake = install([voice('Samantha', 'en-US')]);
    const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
    await click(button(host, 'Nghe'));
    expect(fake.synth.speak).toHaveBeenCalledTimes(1);
    expect(fake.spoken[0].text).toBe('Blue mussel');
    expect(host.querySelector('[role=status]')!.textContent).toBe('Đang đọc');
    act(() => fake.spoken[0].onend?.());
    expect(host.querySelector('[role=status]')!.textContent).toBe('Đã đọc xong');
  });
  it('the toggle changes the next utterance rate', async () => {
    const fake = install([voice('Samantha', 'en-US')]);
    const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
    await click(button(host, 'Thường'));
    expect(button(host, 'Chậm').getAttribute('aria-pressed')).toBe('true');
    await click(button(host, 'Nghe'));
    expect(fake.spoken[0].rate).toBe(0.75);
  });
  it('ignores non-fatal errors and reports fatal ones', async () => {
    const fake = install([voice('Samantha', 'en-US')]);
    const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
    await click(button(host, 'Nghe'));
    act(() => fake.spoken[0].onerror?.({ error: 'interrupted' }));
    expect(host.querySelector('[role=status]')!.textContent).toBe('');
    act(() => fake.spoken[0].onerror?.({ error: 'synthesis-failed' }));
    expect(host.querySelector('[role=status]')!.textContent).toBe('Không đọc được. Hãy thử lại.');
  });
  it('ignores events from a superseded utterance', async () => {
    const fake = install([voice('Samantha', 'en-US')]);
    const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
    await click(button(host, 'Nghe'));
    await click(button(host, 'Nghe'));
    act(() => fake.spoken[0].onend?.());
    expect(host.querySelector('[role=status]')!.textContent).toBe('Đang đọc');
  });
  it('resets the status and cancels speech when the label changes', async () => {
    const fake = install([voice('Samantha', 'en-US')]);
    function Host() {
      const [label, setLabel] = useState('Blue mussel');
      return (
        <>
          <button data-testid="swap" onClick={() => setLabel('Scallop')} />
          <MachineVoice kind="en" label={label} />
        </>
      );
    }
    const host = mount(<Host />);
    await click(button(host, 'Nghe'));
    expect(host.querySelector('[role=status]')!.textContent).toBe('Đang đọc');
    fake.synth.cancel.mockClear();
    await click(host.querySelector('[data-testid=swap]') as HTMLElement);
    expect(fake.synth.cancel).toHaveBeenCalled();
    expect(host.querySelector('[role=status]')!.textContent).toBe('');
  });
  it('cancels speech on unmount', () => {
    const fake = install([voice('Samantha', 'en-US')]);
    mount(<MachineVoice kind="en" label="Blue mussel" />);
    fake.synth.cancel.mockClear();
    unmountAll();
    expect(fake.synth.cancel).toHaveBeenCalled();
  });
  it('stops a playing file clip when Nghe is clicked', async () => {
    const pause = vi.fn();
    vi.stubGlobal(
      'Audio',
      class {
        playbackRate = 1;
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        pause = pause;
        play = () => Promise.resolve();
      },
    );
    install([voice('Samantha', 'en-US')]);
    const host = mount(
      <>
        <Pronunciation initialUrl="https://example.test/a.mp3" />
        <MachineVoice kind="en" label="Blue mussel" />
      </>,
    );
    const nghe = [...host.querySelectorAll('button')].filter((b) => b.textContent === 'Nghe');
    await click(nghe[0]);
    expect(pause).not.toHaveBeenCalled();
    await click(nghe[1]);
    expect(pause).toHaveBeenCalledTimes(1);
  });
  it('playing a file clip cancels speech', async () => {
    vi.stubGlobal(
      'Audio',
      class {
        playbackRate = 1;
        pause = vi.fn();
        play = () => Promise.resolve();
      },
    );
    const fake = install([voice('Samantha', 'en-US')]);
    const host = mount(<Pronunciation initialUrl="https://example.test/a.mp3" />);
    fake.synth.cancel.mockClear();
    await click(button(host, 'Nghe'));
    expect(fake.synth.cancel).toHaveBeenCalled();
  });
  it('stopAudio cancels speech', () => {
    const fake = install([voice('Samantha', 'en-US')]);
    fake.synth.cancel.mockClear();
    stopAudio();
    expect(fake.synth.cancel).toHaveBeenCalledTimes(1);
  });
});
