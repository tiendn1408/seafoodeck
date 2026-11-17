import type { MediaAsset } from './models';
import { canUseMedia } from './content';

export type AudioStatus = 'idle' | 'playing' | 'missing' | 'error';
export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private notify: (status: AudioStatus) => void = () => {};
  private generation = 0;
  stop() {
    this.generation++;
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio = null;
      this.notify('idle');
    }
    this.notify = () => {};
  }
  async play(asset: MediaAsset | undefined, rate: 1 | 0.75, notify: (status: AudioStatus) => void) {
    this.stop();
    this.notify = notify;
    if (!canUseMedia(asset, 'pronunciation')) {
      notify('missing');
      return;
    }
    const generation = this.generation;
    try {
      this.audio = new Audio(asset!.path);
      this.audio.playbackRate = rate;
      this.audio.onended = () => {
        if (generation === this.generation) notify('idle');
      };
      this.audio.onerror = () => {
        if (generation === this.generation) notify('error');
      };
      await this.audio.play();
      if (generation === this.generation) notify('playing');
    } catch {
      if (generation === this.generation) notify('error');
    }
  }
}
export const audioPlayer = new AudioPlayer();
