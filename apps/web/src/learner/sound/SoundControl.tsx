import { useEffect, useId, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { playSfx, soundSupported } from './sfx';
import { updateSoundSettings, useSoundSettings } from './soundSettings';

/**
 * The speaker button of the study bar: opens a small panel with the on/off switch and the
 * volume slider. Settings are remembered per device (see soundSettings).
 */
export function SoundControl() {
  const { on, volume } = useSoundSettings();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const muted = !on || volume === 0;
  const Icon = muted ? VolumeX : Volume2;

  // While open, a press outside closes the panel, and so does Escape. Escape is heard on the
  // document: Safari gives a button no focus on click, so the key event never reaches the control.
  useEffect(() => {
    if (!open) return;
    const onPress = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPress);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPress);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The native "change" fires when a slider value is committed (release, or a key press),
  // not on every "input" tick: one quiet preview tick at the chosen loudness.
  useEffect(() => {
    const el = slider.current;
    if (!open || !el) return;
    const commit = () => void playSfx('neutral');
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [open]);

  if (!soundSupported()) return null;
  return (
    <div
      className="sound"
      ref={root}
      onBlur={(e) => {
        // Tabbing out closes the panel without taking focus back; focus moving inside, or to
        // nowhere (browser UI), leaves it open.
        const next = e.relatedTarget as Node | null;
        if (open && next && !e.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={button}
        className="sound-toggle"
        title="Âm thanh hiệu ứng"
        aria-label={`Âm thanh hiệu ứng: ${muted ? 'tắt' : 'bật'}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
      >
        <Icon size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="sound-panel" id={panelId} role="group" aria-label="Âm thanh hiệu ứng">
          <label className="sound-row">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => updateSoundSettings({ on: e.target.checked })}
            />
            <span>Bật âm thanh</span>
          </label>
          <label className="sound-row sound-volume">
            <span className="sound-label" aria-hidden="true">
              Âm lượng
            </span>
            <input
              type="range"
              ref={slider}
              min={0}
              max={100}
              step={1}
              aria-label="Âm lượng hiệu ứng"
              value={Math.round(volume * 100)}
              onChange={(e) => updateSoundSettings({ volume: Number(e.target.value) / 100 })}
            />
            <output className="sound-value" aria-hidden="true">
              {Math.round(volume * 100)}%
            </output>
          </label>
        </div>
      )}
    </div>
  );
}
