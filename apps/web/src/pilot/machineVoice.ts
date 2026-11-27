export type VoiceKind = 'en' | 'ja' | 'scientific';

export interface SpeakHandlers {
  start(): void;
  end(): void;
  error(fatal: boolean): void;
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
  if (kind === 'ja') {
    return (
      voices.find((v) => v.lang === 'ja-JP' && v.name.includes('Kyoko')) ??
      voices.find((v) => v.lang === 'ja-JP')
    );
  }
  return voices.find((v) => v.lang === 'en-US');
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
    held.splice(0, held.length, utterance);
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function cancelSpeech(): void {
  held.length = 0;
  try {
    if (speechAvailable()) window.speechSynthesis.cancel();
  } catch {
    /* nothing to cancel */
  }
}
