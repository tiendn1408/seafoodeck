import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { stopAudio } from './Media';
import {
  availableVoices,
  cancelSpeech,
  pickVoice,
  speak,
  speechAvailable,
  speechText,
  type VoiceKind,
} from './speechVoice';

export function MachineVoice({ kind, label }: { kind: VoiceKind; label: string }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => availableVoices());
  const [slow, setSlow] = useState(false);
  const key = `${kind}|${label}`;
  const [shown, setShown] = useState({ key, text: '' });
  const status = shown.key === key ? shown.text : '';
  const setStatus = (text: string) => setShown({ key, text });
  const run = useRef(0);
  useEffect(() => {
    if (!speechAvailable()) return;
    const synth = window.speechSynthesis;
    const onChange = () => setVoices(availableVoices());
    synth.addEventListener?.('voiceschanged', onChange);
    onChange();
    return () => synth.removeEventListener?.('voiceschanged', onChange);
  }, []);
  useEffect(
    () => () => {
      run.current++;
      cancelSpeech();
    },
    [kind, label],
  );
  if (!speechAvailable() || !speechText(kind, label) || !pickVoice(kind, voices)) return null;
  function play(useSlow: boolean) {
    stopAudio();
    const mine = ++run.current;
    const live = () => mine === run.current;
    const ok = speak(kind, label, useSlow, {
      start: () => live() && setStatus('Đang đọc'),
      end: () => live() && setStatus('Đã đọc xong'),
      error: (fatal) => live() && setStatus(fatal ? 'Không đọc được. Hãy thử lại.' : ''),
    });
    setStatus(ok ? 'Đang đọc' : 'Không đọc được. Hãy thử lại.');
  }
  return (
    <div className="pilot-audio">
      <span>Giọng máy, tham khảo</span>
      <button className="btn secondary" onClick={() => play(slow)}>
        <Volume2 size={17} />
        Nghe
      </button>
      <button
        className="btn secondary"
        aria-pressed={slow}
        onClick={() => {
          run.current++;
          cancelSpeech();
          setSlow(!slow);
          setStatus('');
        }}
      >
        {slow ? 'Chậm' : 'Thường'}
      </button>
      <span role="status">{status}</span>
    </div>
  );
}
