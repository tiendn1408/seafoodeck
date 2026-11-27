import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmountAll } from '../testDom';
import {
  DEFAULT_SOUND,
  getSoundSettings,
  loadSoundSettings,
  resetSoundSettingsForTests,
  saveSoundSettings,
  updateSoundSettings,
  useSoundSettings,
} from './soundSettings';

const KEY = 'seafoodeck.sound.v1';

beforeEach(() => {
  localStorage.clear();
  resetSoundSettingsForTests();
});
afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

describe('loadSoundSettings', () => {
  it('has the agreed defaults', () => {
    expect(DEFAULT_SOUND).toEqual({ on: true, volume: 0.25 });
  });
  it('returns defaults when the key is missing', () => {
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND);
  });
  it('clamps the volume', () => {
    localStorage.setItem(KEY, JSON.stringify({ on: false, volume: 1.7 }));
    expect(loadSoundSettings()).toEqual({ on: false, volume: 1 });
    localStorage.setItem(KEY, JSON.stringify({ on: true, volume: -3 }));
    expect(loadSoundSettings()).toEqual({ on: true, volume: 0 });
  });
  it('ignores a non-number volume and a non-boolean on', () => {
    localStorage.setItem(KEY, JSON.stringify({ on: 'yes', volume: '0.9' }));
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND);
    localStorage.setItem(KEY, JSON.stringify({ on: false, volume: null }));
    expect(loadSoundSettings()).toEqual({ on: false, volume: 0.25 });
  });
  it('returns defaults for invalid JSON', () => {
    localStorage.setItem(KEY, '{nope');
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND);
    localStorage.setItem(KEY, 'null');
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND);
  });
  it('returns defaults when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND);
  });
});

describe('saveSoundSettings', () => {
  it('writes the compact JSON under the key', () => {
    saveSoundSettings({ on: false, volume: 0.5 });
    expect(localStorage.getItem(KEY)).toBe('{"on":false,"volume":0.5}');
  });
  it('does not throw when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => saveSoundSettings({ on: true, volume: 0.1 })).not.toThrow();
  });
});

describe('shared store', () => {
  it('clamps, saves and keeps a stable snapshot until a change', () => {
    const a = getSoundSettings();
    expect(getSoundSettings()).toBe(a);
    updateSoundSettings({ volume: 2 });
    expect(getSoundSettings()).toEqual({ on: true, volume: 1 });
    expect(localStorage.getItem(KEY)).toBe('{"on":true,"volume":1}');
    const b = getSoundSettings();
    expect(getSoundSettings()).toBe(b);
  });
  it('ignores a non-finite volume and keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    updateSoundSettings({ volume: Number.NaN });
    expect(getSoundSettings().volume).toBe(0.25);
    updateSoundSettings({ on: false });
    expect(getSoundSettings().on).toBe(false);
  });
});

describe('useSoundSettings', () => {
  it('re-renders a mounted component when the settings change from outside', () => {
    function Probe() {
      const s = useSoundSettings();
      return createElement('span', null, `${s.on ? 'on' : 'off'}:${s.volume}`);
    }
    const host = mount(createElement(Probe));
    expect(host.textContent).toBe('on:0.25');
    act(() => updateSoundSettings({ on: false, volume: 0.6 }));
    expect(host.textContent).toBe('off:0.6');
  });
});
