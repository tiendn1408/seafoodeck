import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmountAll } from '../testDom';
import { getTimerOn, resetTimerSettingForTests, setTimerOn, useTimerOn } from './timerSetting';

const KEY = 'seafoodeck.timer.on.v1';

beforeEach(() => {
  localStorage.clear();
  resetTimerSettingForTests();
});
afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

function Probe({ id }: { id: string }) {
  return createElement('span', { id }, String(useTimerOn()));
}

describe('timerSetting', () => {
  it('defaults to on', () => {
    expect(getTimerOn()).toBe(true);
  });
  it('reads back what was set and stores it', () => {
    setTimerOn(false);
    expect(getTimerOn()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
    resetTimerSettingForTests();
    expect(getTimerOn()).toBe(false);
  });
  it('falls back to on for invalid stored strings', () => {
    for (const bad of ['yes', '1', '', 'null', 'TRUE', '{"on":false}']) {
      localStorage.setItem(KEY, bad);
      resetTimerSettingForTests();
      expect(getTimerOn()).toBe(true);
    }
  });
  it('falls back to on when storage throws, and still works', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(getTimerOn()).toBe(true);
    setTimerOn(false);
    expect(getTimerOn()).toBe(false);
  });
  it('re-renders every mounted useTimerOn component', () => {
    const host = mount(
      createElement(
        'div',
        null,
        createElement(Probe, { id: 'a' }),
        createElement(Probe, { id: 'b' }),
      ),
    );
    expect(host.querySelector('#a')!.textContent).toBe('true');
    act(() => setTimerOn(false));
    expect(host.querySelector('#a')!.textContent).toBe('false');
    expect(host.querySelector('#b')!.textContent).toBe('false');
    act(() => setTimerOn(true));
    expect(host.querySelector('#b')!.textContent).toBe('true');
  });
});
