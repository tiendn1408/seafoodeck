import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pronunciation, isClipPlaying } from '../../pilot/Media';
import { button, click, mount, unmountAll } from '../testDom';
import { installSoundUnlock, playSfx } from './sfx';

class ClipAudio {
  static last: ClipAudio | null = null;
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = () => Promise.resolve();
  constructor() {
    ClipAudio.last = this;
  }
}
class Ctx {
  currentTime = 0;
  state = 'running';
  destination = {};
  resume = () => Promise.resolve();
  createOscillator = () => ({
    frequency: { value: 0 },
    type: 'sine',
    connect: () => {},
    disconnect: () => {},
    start: () => {},
    stop: () => {},
  });
  createGain = () => ({
    gain: {
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    },
    connect: () => {},
    disconnect: () => {},
  });
}

beforeEach(() => vi.stubEnv('VITE_SOUND_EFFECTS', 'on'));
const removers: (() => void)[] = [];
const install = () => {
  const r = installSoundUnlock();
  removers.push(r);
  return r;
};
afterEach(() => {
  for (const r of removers.splice(0)) r();
  unmountAll();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('sfx with the real clip state', () => {
  it('a finished clip no longer blocks playSfx', async () => {
    vi.stubGlobal('Audio', ClipAudio);
    vi.stubGlobal('AudioContext', Ctx);
    const remove = install();
    document.dispatchEvent(new Event('pointerdown'));
    const host = mount(<Pronunciation initialUrl="https://example.test/a.mp3" />);
    await click(button(host, 'Nghe'));
    expect(playSfx('correct')).toBe(false);
    act(() => ClipAudio.last!.onended?.());
    expect(playSfx('correct')).toBe(true);
    remove();
  });
});

describe('clip state after a failed refresh', () => {
  it('a rejected play() of the refreshed clip no longer blocks playSfx', async () => {
    let n = 0;
    class FlakyAudio extends ClipAudio {
      play = () => (n++ === 0 ? Promise.resolve() : Promise.reject(new Error('NotAllowedError')));
    }
    vi.stubGlobal('Audio', FlakyAudio);
    vi.stubGlobal('AudioContext', Ctx);
    const remove = install();
    document.dispatchEvent(new Event('pointerdown'));
    const host = mount(
      <Pronunciation
        initialUrl="https://example.test/a.mp3"
        onRefresh={async () => 'https://example.test/b.mp3'}
      />,
    );
    await click(button(host, 'Nghe'));
    await act(async () => {
      ClipAudio.last!.onerror?.();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(n).toBe(2);
    expect(isClipPlaying()).toBe(false);
    expect(playSfx('wrong')).toBe(true);
    remove();
  });
});
