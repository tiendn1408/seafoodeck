import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY, applyStoredTheme, getTheme, setTheme } from './theme';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('theme', () => {
  it('starts with no explicit choice', () => {
    expect(getTheme()).toBeNull();
  });

  it('setTheme("dark") marks the document and is read back', () => {
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(getTheme()).toBe('dark');
  });

  it('setTheme(null) returns to the system preference', () => {
    setTheme('light');
    setTheme(null);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(getTheme()).toBeNull();
  });

  it('ignores unknown stored values', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    expect(getTheme()).toBeNull();
  });

  it('applyStoredTheme restores the saved choice on the document', () => {
    localStorage.setItem(THEME_KEY, 'light');
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('never throws when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setTheme('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(() => getTheme()).not.toThrow();
    expect(getTheme()).toBeNull();
    expect(() => setTheme(null)).not.toThrow();
    expect(() => applyStoredTheme()).not.toThrow();
  });
});
