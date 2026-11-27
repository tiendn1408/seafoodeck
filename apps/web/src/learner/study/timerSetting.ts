import { useSyncExternalStore } from 'react';

const KEY = 'seafoodeck.timer.on.v1';

function loadTimerOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

// A boolean is its own stable snapshot; listeners are told only when it changes.
let current: boolean | null = null;
const listeners = new Set<() => void>();

export function getTimerOn(): boolean {
  current ??= loadTimerOn();
  return current;
}

export function setTimerOn(on: boolean): void {
  if (on === getTimerOn()) return;
  current = on;
  try {
    localStorage.setItem(KEY, String(on));
  } catch {
    /* storage unavailable: the setting just is not remembered */
  }
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTimerOn(): boolean {
  return useSyncExternalStore(subscribe, getTimerOn, getTimerOn);
}

export function resetTimerSettingForTests(): void {
  current = null;
  listeners.clear();
}
