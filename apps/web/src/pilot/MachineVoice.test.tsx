import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { mount, unmountAll, button, click } from '../learner/testDom';
import { MachineVoice } from './MachineVoice';
import { Pronunciation, isClipPlaying, stopAudio } from './Media';

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
  it('resets a previous instance status when another instance takes over', async () => {
    const fake = install([voice('Samantha', 'en-US')]);
    const host = mount(
      <>
        <section data-testid="a">
          <MachineVoice kind="en" label="Blue mussel" />
        </section>
        <section data-testid="b">
          <MachineVoice kind="scientific" label="Mytilus edulis" />
        </section>
      </>,
    );
    const a = host.querySelector('[data-testid=a]') as HTMLElement;
    const b = host.querySelector('[data-testid=b]') as HTMLElement;
    await click(button(a, 'Nghe'));
    expect(a.querySelector('[role=status]')!.textContent).toBe('Đang đọc');
    await click(button(b, 'Nghe'));
    expect(fake.spoken).toHaveLength(2);
    expect(a.querySelector('[role=status]')!.textContent).not.toBe('Đang đọc');
    expect(b.querySelector('[role=status]')!.textContent).toBe('Đang đọc');
  });
  it('ignores late end and code-less error events from a taken-over utterance', async () => {
    const fake = install([voice('Samantha', 'en-US')]);
    const host = mount(
      <>
        <section data-testid="a">
          <MachineVoice kind="en" label="Blue mussel" />
        </section>
        <section data-testid="b">
          <MachineVoice kind="scientific" label="Mytilus edulis" />
        </section>
      </>,
    );
    const a = host.querySelector('[data-testid=a]') as HTMLElement;
    const b = host.querySelector('[data-testid=b]') as HTMLElement;
    await click(button(a, 'Nghe'));
    await click(button(b, 'Nghe'));
    act(() => fake.spoken[0].onend?.());
    expect(a.querySelector('[role=status]')!.textContent).toBe('');
    act(() => fake.spoken[0].onerror?.({} as { error: string }));
    expect(a.querySelector('[role=status]')!.textContent).toBe('');
  });
  it('describes Nghe by the visible machine voice label', () => {
    install([voice('Samantha', 'en-US')]);
    const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
    const id = button(host, 'Nghe').getAttribute('aria-describedby')!;
    expect(host.querySelector(`[id="${id}"]`)!.textContent).toBe('Giọng máy, tham khảo');
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

  describe('watchdog and stale file status', () => {
    const status = (host: HTMLElement) => host.querySelector('[role=status]')!.textContent;
    const tap = (el: HTMLElement) => act(() => el.click());
    afterEach(() => vi.useRealTimers());

    it('shows the failure when the engine never reports back, and the next click speaks again', () => {
      vi.useFakeTimers();
      const fake = install([voice('Samantha', 'en-US')]);
      const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
      tap(button(host, 'Nghe'));
      expect(status(host)).toBe('Đang đọc');
      act(() => void vi.advanceTimersByTime(3000));
      expect(status(host)).toBe('Không đọc được. Hãy thử lại.');
      tap(button(host, 'Nghe'));
      expect(fake.spoken).toHaveLength(2);
      expect(status(host)).toBe('Đang đọc');
    });
    it('clears the status when start fires but end never does', () => {
      vi.useFakeTimers();
      const fake = install([voice('Samantha', 'en-US')]);
      const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
      tap(button(host, 'Nghe'));
      act(() => void vi.advanceTimersByTime(100));
      act(() => fake.spoken[0].onstart?.());
      act(() => void vi.advanceTimersByTime(15000));
      expect(status(host)).toBe('');
    });
    it('a normal utterance stays "Đã đọc xong"', () => {
      vi.useFakeTimers();
      const fake = install([voice('Samantha', 'en-US')]);
      const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
      tap(button(host, 'Nghe'));
      act(() => fake.spoken[0].onstart?.());
      act(() => fake.spoken[0].onend?.());
      act(() => void vi.advanceTimersByTime(20000));
      expect(status(host)).toBe('Đã đọc xong');
    });
    it('a taken-over utterance timer never changes its status', () => {
      vi.useFakeTimers();
      const fake = install([voice('Samantha', 'en-US')]);
      const host = mount(
        <>
          <section data-testid="a">
            <MachineVoice kind="en" label="Blue mussel" />
          </section>
          <section data-testid="b">
            <MachineVoice kind="scientific" label="Mytilus edulis" />
          </section>
        </>,
      );
      const a = host.querySelector('[data-testid=a]') as HTMLElement;
      const b = host.querySelector('[data-testid=b]') as HTMLElement;
      tap(button(a, 'Nghe'));
      tap(button(b, 'Nghe'));
      act(() => fake.spoken[1].onstart?.());
      act(() => void vi.advanceTimersByTime(3000));
      expect(status(a)).toBe('');
      expect(status(b)).toBe('Đang đọc');
    });
    it('unmounting with a pending watchdog causes no warning', () => {
      vi.useFakeTimers();
      install([voice('Samantha', 'en-US')]);
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const host = mount(<MachineVoice kind="en" label="Blue mussel" />);
      tap(button(host, 'Nghe'));
      unmountAll();
      act(() => void vi.advanceTimersByTime(20000));
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
    });

    class FakeAudio {
      static last: FakeAudio | null = null;
      static count = 0;
      playbackRate = 1;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pause = vi.fn();
      play = () => Promise.resolve();
      constructor() {
        FakeAudio.last = this;
        FakeAudio.count++;
      }
    }
    const clip = async () => {
      vi.stubGlobal('Audio', FakeAudio);
      const host = mount(<Pronunciation initialUrl="https://example.test/a.mp3" />);
      await click(button(host, 'Nghe'));
      return host;
    };

    it('stopAudio resets a playing clip status', async () => {
      const host = await clip();
      expect(status(host)).toBe('Đang phát');
      act(() => stopAudio());
      expect(status(host)).toBe('');
    });
    it('machine voice interrupting a clip resets its status', async () => {
      install([voice('Samantha', 'en-US')]);
      vi.stubGlobal('Audio', FakeAudio);
      const host = mount(
        <>
          <section data-testid="clip">
            <Pronunciation initialUrl="https://example.test/a.mp3" />
          </section>
          <MachineVoice kind="en" label="Blue mussel" />
        </>,
      );
      const clipHost = host.querySelector('[data-testid=clip]') as HTMLElement;
      await click(button(clipHost, 'Nghe'));
      expect(status(clipHost)).toBe('Đang phát');
      const nghe = [...host.querySelectorAll('button')].filter((x) => x.textContent === 'Nghe');
      await click(nghe[1]);
      expect(status(clipHost)).toBe('');
    });
    it('a clip that ended keeps "Đã phát xong" after a later stopAudio', async () => {
      const host = await clip();
      act(() => FakeAudio.last!.onended?.());
      expect(status(host)).toBe('Đã phát xong');
      act(() => stopAudio());
      expect(status(host)).toBe('Đã phát xong');
    });
    it('stopAudio with nothing playing does not throw', () => {
      expect(() => stopAudio()).not.toThrow();
    });
    it('interrupting while the URL loads leaves no status and plays nothing more', async () => {
      FakeAudio.count = 0;
      vi.stubGlobal('Audio', FakeAudio);
      let resolve!: (u: string) => void;
      const onRefresh = () => new Promise<string | undefined>((r) => (resolve = r));
      const host = mount(<Pronunciation initialUrl="x" onRefresh={onRefresh} />);
      await click(button(host, 'Nghe'));
      const first = FakeAudio.last!;
      act(() => first.onerror?.());
      act(() => stopAudio());
      await act(async () => resolve('https://example.test/b.mp3'));
      expect(status(host)).toBe('');
      expect(FakeAudio.count).toBe(1);
      expect(FakeAudio.last).toBe(first);
      expect(first.pause).toHaveBeenCalled();
    });
    it('an interrupted clip whose play() is pending shows no error (AbortError)', async () => {
      class PendingAudio extends FakeAudio {
        reject: ((e: unknown) => void) | null = null;
        pause = vi.fn(() => this.reject?.({ name: 'AbortError' }));
        play = () => new Promise<void>((_, rej) => (this.reject = rej));
      }
      vi.stubGlobal('Audio', PendingAudio);
      const host = mount(<Pronunciation initialUrl="https://example.test/a.mp3" />);
      await click(button(host, 'Nghe'));
      act(() => stopAudio());
      await act(async () => {});
      expect(status(host)).toBe('');
    });
    it('a real play failure still shows the retry text', async () => {
      class FailingAudio extends FakeAudio {
        play = () => Promise.reject(new Error('NotAllowedError'));
      }
      vi.stubGlobal('Audio', FailingAudio);
      const host = mount(<Pronunciation initialUrl="https://example.test/a.mp3" />);
      await click(button(host, 'Nghe'));
      expect(status(host)).toBe('Không phát được bản thu. Hãy thử lại.');
      act(() => stopAudio());
      expect(status(host)).toBe('Không phát được bản thu. Hãy thử lại.');
    });
    it('isClipPlaying is true while a clip plays and false once it ends, errors or is stopped', async () => {
      expect(isClipPlaying()).toBe(false);
      await clip();
      expect(isClipPlaying()).toBe(true);
      act(() => FakeAudio.last!.onended?.());
      expect(isClipPlaying()).toBe(false);
      await click(button(document.body, 'Nghe'));
      expect(isClipPlaying()).toBe(true);
      act(() => stopAudio());
      expect(isClipPlaying()).toBe(false);
    });
    it('isClipPlaying is false after a clip errors', async () => {
      await clip();
      expect(isClipPlaying()).toBe(true);
      await act(async () => {
        FakeAudio.last!.onerror?.();
        await new Promise((r) => setTimeout(r, 0));
      });
      act(() => FakeAudio.last!.onerror?.());
      expect(isClipPlaying()).toBe(false);
    });
    it('unmounting a playing clip emits no warning', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      await clip();
      unmountAll();
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
    });
  });
});
