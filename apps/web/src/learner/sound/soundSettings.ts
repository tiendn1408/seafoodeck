import { useSyncExternalStore } from 'react';

export type SoundSettings = { on: boolean; volume: number };

export const DEFAULT_SOUND: SoundSettings = { on: true, volume: 0.25 };

const KEY = 'seafoodeck.sound.v1';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function loadSoundSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return { ...DEFAULT_SOUND };
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_SOUND };
    const { on, volume } = data as { on?: unknown; volume?: unknown };
    return {
      on: typeof on === 'boolean' ? on : DEFAULT_SOUND.on,
      volume:
        typeof volume === 'number' && Number.isFinite(volume)
          ? clamp01(volume)
          : DEFAULT_SOUND.volume,
    };
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

export function saveSoundSettings(s: SoundSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ on: s.on, volume: s.volume }));
  } catch {
    /* storage unavailable: the setting just is not remembered */
  }
}

// The snapshot object is replaced only when a value changes, as useSyncExternalStore requires.
let current: SoundSettings | null = null;
const listeners = new Set<() => void>();

export function getSoundSettings(): SoundSettings {
  current ??= loadSoundSettings();
  return current;
}

export function updateSoundSettings(patch: Partial<SoundSettings>): void {
  const prev = getSoundSettings();
  const next: SoundSettings = {
    on: typeof patch.on === 'boolean' ? patch.on : prev.on,
    volume:
      typeof patch.volume === 'number' && Number.isFinite(patch.volume)
        ? clamp01(patch.volume)
        : prev.volume,
  };
  if (next.on === prev.on && next.volume === prev.volume) return;
  current = next;
  saveSoundSettings(next);
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(subscribe, getSoundSettings, getSoundSettings);
}

export function resetSoundSettingsForTests(): void {
  current = null;
  listeners.clear();
}
