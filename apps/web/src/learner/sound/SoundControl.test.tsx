import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { mount, unmountAll } from '../testDom';
import { SoundControl } from './SoundControl';
import { getSoundSettings, resetSoundSettingsForTests, updateSoundSettings } from './soundSettings';

vi.mock('./sfx', () => ({ playSfx: vi.fn(() => true) }));
import { playSfx } from './sfx';

beforeEach(() => {
  localStorage.clear();
  resetSoundSettingsForTests();
  vi.mocked(playSfx).mockClear();
});
afterEach(() => unmountAll());

const toggle = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('button.sound-toggle')!;
const open = (host: HTMLElement) => act(() => toggle(host).click());
const slider = (host: HTMLElement) =>
  host.querySelector<HTMLInputElement>('input[type="range"][aria-label="Âm lượng hiệu ứng"]')!;
const checkbox = (host: HTMLElement) =>
  host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

function drag(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const commit = (input: HTMLInputElement) =>
  act(() => void input.dispatchEvent(new Event('change', { bubbles: true })));

describe('SoundControl', () => {
  it('is a collapsed button named for sound with its state', () => {
    const host = mount(<SoundControl />);
    expect(toggle(host).getAttribute('aria-label')).toBe('Âm thanh hiệu ứng: bật');
    expect(toggle(host).getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[role="group"]')).toBeNull();
  });

  it('opens a group with the switch and the volume slider', () => {
    const host = mount(<SoundControl />);
    open(host);
    expect(toggle(host).getAttribute('aria-expanded')).toBe('true');
    const group = host.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('Âm thanh hiệu ứng');
    expect(checkbox(host).checked).toBe(true);
    expect(group.textContent).toContain('Bật âm thanh');
    const s = slider(host);
    expect([s.min, s.max, s.value]).toEqual(['0', '100', '25']);
    // The value is shown but not announced a second time (the slider itself is announced).
    expect(host.querySelector('output')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('toggles sound on and off', () => {
    const host = mount(<SoundControl />);
    open(host);
    act(() => checkbox(host).click());
    expect(getSoundSettings().on).toBe(false);
    expect(checkbox(host).checked).toBe(false);
    expect(toggle(host).getAttribute('aria-label')).toBe('Âm thanh hiệu ứng: tắt');
  });

  it('shows the mute state at volume 0', () => {
    updateSoundSettings({ volume: 0 });
    const host = mount(<SoundControl />);
    expect(toggle(host).getAttribute('aria-label')).toBe('Âm thanh hiệu ứng: tắt');
  });

  it('updates the volume live and previews once when the value is committed', () => {
    const host = mount(<SoundControl />);
    open(host);
    drag(slider(host), '40');
    drag(slider(host), '60');
    expect(getSoundSettings().volume).toBeCloseTo(0.6);
    expect(playSfx).not.toHaveBeenCalled();
    commit(slider(host));
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith('neutral');
  });

  it('closes on Escape and returns focus to the button', () => {
    const host = mount(<SoundControl />);
    open(host);
    act(() => slider(host).focus());
    act(() => {
      slider(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="group"]')).toBeNull();
    expect(toggle(host).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle(host));
  });

  it('closes on Escape pressed on the document when focus stayed on body (Safari click)', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const host = mount(<SoundControl />);
    open(host);
    expect(document.activeElement).toBe(document.body);
    const esc = () =>
      act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    esc();
    expect(host.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(toggle(host));
    const handler = add.mock.calls.find((c) => c[0] === 'keydown')?.[1];
    expect(handler).toBeDefined();
    expect(remove.mock.calls.some((c) => c[0] === 'keydown' && c[1] === handler)).toBe(true);
    act(() => toggle(host).blur());
    esc();
    expect(document.activeElement).toBe(document.body);
    add.mockRestore();
    remove.mockRestore();
  });

  it('closes on a press outside and removes its document listeners on unmount', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const host = mount(<SoundControl />);
    open(host);
    act(() => void document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(host.querySelector('[role="group"]')).toBeNull();
    open(host);
    unmountAll();
    const added = add.mock.calls.map((c) => c[0]);
    const removed = remove.mock.calls.map((c) => c[0]);
    for (const type of new Set(added)) expect(removed).toContain(type);
    add.mockRestore();
    remove.mockRestore();
  });
});
