import { useEffect, useRef, useState } from 'react';
import { Volume2, RotateCcw } from 'lucide-react';
import { api } from './api';
import { cancelSpeech } from './speechVoice';
export function MediaCredit({ id }: { id: string }) {
  const [info, setInfo] = useState<{ credit: string; rights: string; source: string } | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ credit: string; rights: string; source: string }>(`/media/${id}/url`)
      .then((d) => {
        if (alive) setInfo(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  if (!info) return null;
  return (
    <div className="pilot-media-credit">
      <p>
        {info.credit} · {info.rights}
      </p>
      {/^https?:\/\/\S+$/.test(info.source) ? (
        <a href={info.source} target="_blank" rel="noreferrer">
          Nguồn ảnh và quyền sử dụng
        </a>
      ) : (
        <p>{info.source}</p>
      )}
      <small>Ảnh đã được thu gọn và loại metadata ở bản hiển thị.</small>
    </div>
  );
}
export function SignedImage(props: { id: string; alt?: string; thumbnail?: boolean }) {
  return <ImageContent key={`${props.id}/${props.thumbnail}`} {...props} />;
}
function ImageContent({
  id,
  alt = '',
  thumbnail = false,
}: {
  id: string;
  alt?: string;
  thumbnail?: boolean;
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState(false);
  const [generation, setGeneration] = useState(0);
  const refreshed = useRef(false);
  async function load() {
    try {
      const d = await api<{ url: string }>(`/media/${id}/url?thumbnail=${thumbnail}`);
      setUrl(d.url);
      setGeneration((n) => n + 1);
      setError(false);
    } catch {
      setError(true);
    }
  }
  useEffect(() => {
    let alive = true;
    refreshed.current = false;
    api<{ url: string }>(`/media/${id}/url?thumbnail=${thumbnail}`)
      .then((d) => {
        if (alive) setUrl(d.url);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [id, thumbnail]);
  if (error)
    return (
      <div className="pilot-media-placeholder">
        Không tải được ảnh.
        <button
          onClick={() => {
            refreshed.current = false;
            void load();
          }}
        >
          Thử lại
        </button>
      </div>
    );
  return url ? (
    <img
      key={generation}
      src={url}
      alt={alt}
      loading="lazy"
      width="640"
      height="420"
      onError={() => {
        if (!refreshed.current) {
          refreshed.current = true;
          void load();
        } else setError(true);
      }}
    />
  ) : (
    <div className="pilot-media-placeholder">Đang tải ảnh…</div>
  );
}
let playing: HTMLAudioElement | null = null;
// The current clip ended or failed on its own; `playing` is kept so stopAudio still cleans it up.
let playingDone = false;
let audioGeneration = 0;
// Clears the status of the Pronunciation that owns the current clip.
let playingReset: (() => void) | null = null;
/** True while an approved-audio file clip is playing (machine voice is not a clip). */
export function isClipPlaying(): boolean {
  return playing !== null && !playingDone;
}
export function stopAudio() {
  audioGeneration++;
  const reset = playingReset;
  playingReset = null;
  if (playing) {
    playing.onerror = null;
    playing.onended = null;
    playing.pause();
  }
  playing = null;
  playingDone = false;
  reset?.();
  cancelSpeech();
}
export function Pronunciation({
  id,
  initialUrl,
  onRefresh,
}: {
  id?: string | null;
  initialUrl?: string;
  onRefresh?: () => Promise<string | undefined>;
}) {
  const [status, setStatus] = useState('');
  const [speed, setSpeed] = useState<1 | 0.75>(1);
  useEffect(() => () => stopAudio(), [id]);
  async function play() {
    if (!id && !initialUrl) {
      setStatus('Chưa có bản thu.');
      return;
    }
    stopAudio();
    const generation = audioGeneration;
    const reset = () => setStatus('');
    playingReset = reset;
    // A clip that finished or failed on its own keeps its own status.
    const settle = (text: string) => {
      if (playingReset === reset) playingReset = null;
      setStatus(text);
    };
    try {
      let refreshed = false;
      const run = async () => {
        const d = id
          ? await api<{ url: string }>(`/media/${id}/url`)
          : { url: refreshed ? await onRefresh?.() : initialUrl };
        if (!d.url) throw new Error('Media unavailable');
        if (generation !== audioGeneration) return;
        const audio = new Audio(d.url);
        playing = audio;
        playingDone = false;
        audio.playbackRate = speed;
        // An ended or failed clip is no longer "playing" (stopAudio still cleans up).
        const done = () => {
          if (playing === audio) playingDone = true;
        };
        audio.onended = () => {
          done();
          settle('Đã phát xong');
        };
        audio.onerror = () => {
          done();
          if (!refreshed) {
            refreshed = true;
            void run().catch(() => settle('Không phát được bản thu. Hãy thử lại.'));
          } else settle('Không phát được bản thu. Hãy thử lại.');
        };
        await audio.play();
        if (generation === audioGeneration) setStatus('Đang phát');
      };
      await run();
    } catch {
      // An interrupted clip (pause() rejects a pending play() with AbortError) is not a failure.
      if (generation === audioGeneration) {
        playingDone = true;
        settle('Không phát được bản thu. Hãy thử lại.');
      }
    }
  }
  if (!id && !initialUrl)
    return (
      <div className="pilot-audio">
        <button className="btn secondary" disabled>
          <Volume2 size={17} />
          Chưa có bản thu
        </button>
      </div>
    );
  return (
    <div className="pilot-audio">
      <button className="btn secondary" onClick={() => void play()}>
        <Volume2 size={17} />
        {status.includes('Không') ? <RotateCcw size={15} /> : null}Nghe
      </button>
      <button
        className="btn secondary"
        aria-pressed={speed === 0.75}
        onClick={() => {
          stopAudio();
          setSpeed(speed === 1 ? 0.75 : 1);
          setStatus('');
        }}
      >
        {speed === 1 ? 'Thường' : 'Chậm'}
      </button>
      <span role="status">{status || (!id && !initialUrl ? 'Chưa có bản thu' : '')}</span>
    </div>
  );
}
