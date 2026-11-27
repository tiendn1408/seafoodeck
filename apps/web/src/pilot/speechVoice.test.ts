import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelSpeech,
  pickVoice,
  speak,
  speechAvailable,
  speechRate,
  speechText,
} from './speechVoice';

const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;
const enUS = voice('Samantha', 'en-US');
const enGB = voice('Daniel', 'en-GB');
const jaOther = voice('Otoya', 'ja-JP');
const jaKyoko = voice('Kyoko', 'ja-JP');

class FakeUtterance {
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

function install(voices: SpeechSynthesisVoice[]) {
  const calls: string[] = [];
  const spoken: FakeUtterance[] = [];
  const synth = {
    getVoices: () => voices,
    speak: vi.fn((u: FakeUtterance) => {
      calls.push('speak');
      spoken.push(u);
    }),
    cancel: vi.fn(() => calls.push('cancel')),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return { synth, calls, spoken };
}
const handlers = () => ({ start: vi.fn(), end: vi.fn(), error: vi.fn() });

afterEach(() => vi.unstubAllGlobals());

describe('speechText', () => {
  it('normalises labels', () => {
    expect(speechText('ja', 'ウニ / ムラサキウニ')).toBe('ウニ、ムラサキウニ');
    expect(speechText('en', 'Squid / Calamari')).toBe('Squid, Calamari');
    expect(speechText('scientific', 'Oreochromis sp.')).toBe('Oreochromis species');
    expect(speechText('en', '   ')).toBe('');
    expect(speechText('en', '  Blue  mussel ')).toBe('Blue mussel');
  });
});

describe('pickVoice', () => {
  it('prefers Kyoko, then the first ja-JP, else undefined', () => {
    expect(pickVoice('ja', [enUS, jaOther, jaKyoko])).toBe(jaKyoko);
    expect(pickVoice('ja', [enUS, jaOther])).toBe(jaOther);
    expect(pickVoice('ja', [enUS, enGB])).toBeUndefined();
  });
  it('accepts underscore tags reported by Android Chrome and Firefox', () => {
    const jaUnderscore = voice('Google 日本語', 'ja_JP');
    const enUnderscore = voice('Google US English', 'en_US');
    expect(pickVoice('ja', [enUnderscore, jaUnderscore])).toBe(jaUnderscore);
    expect(pickVoice('en', [jaUnderscore, enUnderscore])).toBe(enUnderscore);
    expect(pickVoice('scientific', [enUnderscore])).toBe(enUnderscore);
  });
  it('prefers en-US for English and scientific', () => {
    expect(pickVoice('en', [enGB, enUS])).toBe(enUS);
    expect(pickVoice('scientific', [enGB, enUS])).toBe(enUS);
    expect(pickVoice('en', [enGB, jaOther])).toBeUndefined();
  });
});

describe('pickVoice choice', () => {
  const v = (name: string, extra: Partial<SpeechSynthesisVoice> = {}) =>
    ({ name, lang: 'en-US', localService: true, default: false, ...extra }) as SpeechSynthesisVoice;
  const mac = [v('Albert'), v('Bad News'), v('Bahh'), v('Eddy'), v('Samantha')];
  it('prefers Samantha over novelty voices listed first', () => {
    expect(pickVoice('en', mac)?.name).toBe('Samantha');
  });
  it('prefers the default, then a non-novelty en-US, when Samantha is absent', () => {
    expect(pickVoice('en', [v('Albert'), v('Eddy')])?.name).toBe('Eddy');
    expect(pickVoice('en', [v('Albert'), v('Eddy'), v('Fred', { default: true })])?.name).toBe(
      'Fred',
    );
  });
  it('prefers on-device voices but keeps a remote one as last resort', () => {
    const remote = v('Google US English', { localService: false });
    expect(pickVoice('en', [remote, v('Eddy')])?.name).toBe('Eddy');
    expect(pickVoice('en', [remote])).toBe(remote);
    const jaRemote = {
      name: 'Google 日本語',
      lang: 'ja-JP',
      localService: false,
    } as SpeechSynthesisVoice;
    const jaLocal = { name: 'Otoya', lang: 'ja-JP', localService: true } as SpeechSynthesisVoice;
    expect(pickVoice('ja', [jaRemote, jaLocal])).toBe(jaLocal);
    expect(pickVoice('ja', [jaRemote])).toBe(jaRemote);
  });
});

describe('speechRate', () => {
  it('uses the agreed rates', () => {
    expect(speechRate('ja', false)).toBe(0.85);
    expect(speechRate('ja', true)).toBe(0.65);
    expect(speechRate('en', true)).toBe(0.75);
    expect(speechRate('scientific', false)).toBe(1);
  });
});

describe('speechAvailable', () => {
  it('is false without the browser APIs and true with them', () => {
    expect(speechAvailable()).toBe(false);
    install([enUS]);
    expect(speechAvailable()).toBe(true);
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    expect(speechAvailable()).toBe(false);
  });
});

describe('speak', () => {
  it('cancels first, then speaks a configured utterance', () => {
    const { synth, calls, spoken } = install([enUS, jaOther, jaKyoko]);
    expect(speak('ja', 'ウニ / ムラサキウニ', true, handlers())).toBe(true);
    expect(calls).toEqual(['cancel', 'speak']);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0]).toMatchObject({
      text: 'ウニ、ムラサキウニ',
      voice: jaKyoko,
      lang: 'ja-JP',
      rate: 0.65,
    });
  });
  it('sets a normalised BCP 47 lang for underscore voices', () => {
    const { spoken } = install([voice('Google 日本語', 'ja_JP')]);
    speak('ja', 'ウニ', false, handlers());
    expect(spoken[0].lang).toBe('ja-JP');
  });
  it('returns false without speaking when there is no voice or no text', () => {
    const { synth } = install([enUS]);
    expect(speak('ja', 'ウニ', false, handlers())).toBe(false);
    expect(speak('en', '   ', false, handlers())).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
  });
  it('returns false and never throws without the API', () => {
    expect(speak('en', 'Mussel', false, handlers())).toBe(false);
    expect(() => cancelSpeech()).not.toThrow();
  });
  it('returns false when the browser throws', () => {
    const { synth } = install([enUS]);
    synth.speak.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(speak('en', 'Mussel', false, handlers())).toBe(false);
  });
  it('maps start, end and errors', () => {
    const { spoken } = install([enUS]);
    const on = handlers();
    speak('en', 'Mussel', false, on);
    spoken[0].onstart?.();
    spoken[0].onend?.();
    expect(on.start).toHaveBeenCalledTimes(1);
    expect(on.end).toHaveBeenCalledTimes(1);
    spoken[0].onerror?.({ error: 'interrupted' });
    spoken[0].onerror?.({ error: 'canceled' });
    expect(on.error).toHaveBeenNthCalledWith(1, false);
    expect(on.error).toHaveBeenNthCalledWith(2, false);
    spoken[0].onerror?.({ error: 'synthesis-failed' });
    expect(on.error).toHaveBeenNthCalledWith(3, true);
  });
});

describe('cancelSpeech', () => {
  it('calls cancel when available', () => {
    const { synth } = install([enUS]);
    cancelSpeech();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });
});
