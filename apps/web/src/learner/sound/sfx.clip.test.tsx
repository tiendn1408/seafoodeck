import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pronunciation } from '../../pilot/Media';
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

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});

describe('sfx with the real clip state', () => {
  it('a finished clip no longer blocks playSfx', async () => {
    vi.stubGlobal('Audio', ClipAudio);
    vi.stubGlobal('AudioContext', Ctx);
    const remove = installSoundUnlock();
    document.dispatchEvent(new Event('pointerdown'));
    const host = mount(<Pronunciation initialUrl="https://example.test/a.mp3" />);
    await click(button(host, 'Nghe'));
    expect(playSfx('correct')).toBe(false);
    act(() => ClipAudio.last!.onended?.());
    expect(playSfx('correct')).toBe(true);
    remove();
  });
});
