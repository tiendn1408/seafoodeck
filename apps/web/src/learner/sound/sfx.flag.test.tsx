import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmountAll } from '../testDom';
import { SoundControl } from './SoundControl';
import { installSoundUnlock, playSfx, soundSupported } from './sfx';

let constructed = 0;
class Ctx {
  state = 'running';
  currentTime = 0;
  destination = {};
  constructor() {
    constructed++;
  }
  resume = () => Promise.resolve();
}

beforeEach(() => {
  constructed = 0;
  localStorage.clear();
  vi.stubGlobal('AudioContext', Ctx);
});
afterEach(() => {
  unmountAll();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VITE_SOUND_EFFECTS feature flag', () => {
  it('is off when unset: nothing is shown, listened to, constructed or played', () => {
    vi.stubEnv('VITE_SOUND_EFFECTS', '');
    expect(soundSupported()).toBe(false);
    const host = mount(<SoundControl />);
    expect(host.querySelector('button, .sound')).toBeNull();
    const add = vi.spyOn(document, 'addEventListener');
    const remove = installSoundUnlock();
    expect(add).not.toHaveBeenCalled();
    expect(() => remove()).not.toThrow();
    document.dispatchEvent(new Event('pointerdown'));
    expect(playSfx('correct')).toBe(false);
    expect(constructed).toBe(0);
  });

  it.each(['ON', '1', 'true', 'On', ' on'])('stays off for %j (exact "on" only)', (value) => {
    vi.stubEnv('VITE_SOUND_EFFECTS', value);
    expect(soundSupported()).toBe(false);
  });

  it('is on for "on", evaluated at call time', () => {
    vi.stubEnv('VITE_SOUND_EFFECTS', 'on');
    expect(soundSupported()).toBe(true);
    const host = mount(<SoundControl />);
    expect(host.querySelector('button.sound-toggle')).not.toBeNull();
    const remove = installSoundUnlock();
    document.dispatchEvent(new Event('pointerdown'));
    expect(constructed).toBe(1);
    remove();
  });
});
