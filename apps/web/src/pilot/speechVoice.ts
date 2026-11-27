export type VoiceKind = 'en' | 'ja' | 'scientific';

export interface SpeakHandlers {
  start(): void;
  end(): void;
  error(fatal: boolean): void;
  /** Another sound took over (or speech was cancelled): drop any "speaking" status. */
  reset?(): void;
}

export function speechText(kind: VoiceKind, label: string): string {
  void kind;
  return label
    .replace(/\s*\/\s*/g, '、')
    .replace(/\s+sp\.\s*$/, ' species')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pickVoice(
  kind: VoiceKind,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  // Android Chrome and Firefox report tags such as ja_JP and en_US.
  const tag = (v: SpeechSynthesisVoice) => v.lang.replace(/_/g, '-');
  if (kind === 'ja') {
    return (
      voices.find((v) => tag(v) === 'ja-JP' && v.name.includes('Kyoko')) ??
      voices.find((v) => tag(v) === 'ja-JP')
    );
  }
  return voices.find((v) => tag(v) === 'en-US');
}

export function speechRate(kind: VoiceKind, slow: boolean): number {
  if (kind === 'ja') return slow ? 0.65 : 0.85;
  return slow ? 0.75 : 1;
}

export function speechAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      !!window.speechSynthesis &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  } catch {
    return false;
  }
}

export function availableVoices(): SpeechSynthesisVoice[] {
  try {
    return speechAvailable() ? Array.from(window.speechSynthesis.getVoices()) : [];
  } catch {
    return [];
  }
}

// Browsers may garbage-collect an utterance that is still speaking; keep a reference.
const held: SpeechSynthesisUtterance[] = [];
// The handlers of whoever is speaking now, so a takeover can reset the previous status even
// when the browser reports `end` instead of `error: interrupted`.
let owner: SpeakHandlers | null = null;

function releaseOwner(): void {
  const previous = owner;
  owner = null;
  previous?.reset?.();
}

export function speak(kind: VoiceKind, label: string, slow: boolean, on: SpeakHandlers): boolean {
  const text = speechText(kind, label);
  if (!text || !speechAvailable()) return false;
  const voice = pickVoice(kind, availableVoices());
  if (!voice) return false;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = speechRate(kind, slow);
    utterance.onstart = () => on.start();
    utterance.onend = () => on.end();
    utterance.onerror = (e) => {
      const code = (e as { error?: string }).error;
      on.error(!(code === 'interrupted' || code === 'canceled'));
    };
    window.speechSynthesis.cancel();
    releaseOwner();
    owner = on;
    held.splice(0, held.length, utterance);
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function cancelSpeech(): void {
  held.length = 0;
  releaseOwner();
  try {
    if (speechAvailable()) window.speechSynthesis.cancel();
  } catch {
    /* nothing to cancel */
  }
}
