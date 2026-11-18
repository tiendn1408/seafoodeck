export type Theme = 'light' | 'dark';
export const THEME_KEY = 'seafood-deck:theme';

/** The learner's explicit choice, or null to follow `prefers-color-scheme`. */
export function getTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function mark(theme: Theme | null) {
  const root = document.documentElement;
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;
}

/** Applies the choice to `<html data-theme>` and remembers it when storage allows. */
export function setTheme(theme: Theme | null) {
  mark(theme);
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Storage blocked (private mode, policy): the choice lasts for this page only.
  }
}

/** Called once at startup so a saved choice is on the document before first paint. */
export function applyStoredTheme() {
  mark(getTheme());
}
