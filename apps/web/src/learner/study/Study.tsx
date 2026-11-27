import { useEffect, useReducer, useRef, useState } from 'react';
import { Pause } from 'lucide-react';
import { api, type ApiQuestion, type Game, type ProgressEntry } from '../../pilot/api';
import { stopAudio } from '../../pilot/Media';
import { ErrorNote } from '../ErrorNote';
import { FloatRope, type RopeFloat } from '../FloatRope';
import { QuestionView, coverName } from './QuestionView';
import { SoundControl } from '../sound/SoundControl';
import { installSoundUnlock } from '../sound/sfx';
import { Summary } from './HaulSummary';
import { findSpecies, useSpeciesIndex } from './species';
import { sessionQueue, withResult, type GameUpdate } from './submitQueues';
import { useSessionSummary } from './useSessionSummary';
import './study.css';

const modeNames: Record<string, string> = {
  flashcard: 'Flashcard tên loài',
  match: 'Ghép tên thương mại',
  image: 'Đoán hình nguyên liệu',
  hs: 'HS theo dạng hàng',
};

export type UserKind = 'student' | 'trial';
export type { GameUpdate };

/** Review rows the server returned with the game's answers, the latest per target and skill. */
function progressOf(game: Game): ProgressEntry[] {
  const rows = new Map<string, ProgressEntry>();
  for (const q of game.questions)
    for (const r of q.result?.progress ?? []) rows.set(`${r.targetId}|${r.skill}`, r);
  return [...rows.values()];
}

/** The image of the question after `cursor`, loaded early so it is ready when the learner gets there. */
function usePrefetch(next: ApiQuestion | undefined) {
  const url = next && !next.unavailable ? next.image?.url : undefined;
  useEffect(() => {
    if (!url) return;
    // Signed URLs live 120 s; only the next one is warmed, so it is still valid when shown.
    new Image().src = url;
  }, [url]);
}

/**
 * A study session on the deep-sea frame: the haul's float rope on top, then the current
 * question, then the haul summary once every question is answered. Self-rated cards move on
 * at once and are sent in the background; graded questions wait for the server.
 */
export function Study({
  game,
  userKind,
  onChange,
  onRetry,
  pending,
}: {
  game: Game;
  userKind: UserKind;
  onChange: GameUpdate;
  onRetry: () => void;
  pending: boolean;
}) {
  const [cursor, setCursor] = useState(() =>
    game.questions.findIndex((q) => !q.result) < 0
      ? game.questions.length
      : game.questions.findIndex((q) => !q.result),
  );
  const { index: speciesIndex, settled } = useSpeciesIndex(game.releaseId);
  const progress = progressOf(game);
  // Confirmed answers without progress rows (restored from the server after a reload or a
  // resume, or answered with `progress: []`) leave the review days unknown; a student's summary
  // then asks the server for them once.
  const restored = game.questions.some(
    (q) => q.result && !q.result.provisional && !q.result.progress?.length,
  );
  // One queue per session, owned outside this screen: pausing and coming back shows the same
  // pending saves and failures, and results land in the parent's game either way.
  const queue = sessionQueue(game.id, onChange);
  // iPhone/Safari only start audio after a gesture: unlock on the first press in this screen.
  useEffect(() => installSoundUnlock(), []);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => queue.subscribe(redraw), [queue]);
  const saving = queue.pendingCount() > 0;
  const failures = queue.failures();
  const saveError = failures.length > 0 && (
    <ErrorNote
      message={`Chưa lưu được ${failures.length} thẻ tự đánh giá: ${failures[0].error.message}`}
      retry={() => failures.forEach((f) => queue.enqueue(f.job))}
      retryLabel="Thử gửi lại"
    />
  );

  // After "Tiếp tục" the old button is gone: start the next screen at the top and give it
  // focus so keyboard and screen-reader users land on the new question or the summary.
  const advanced = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!advanced.current) return;
    window.scrollTo(0, 0);
    stage.current
      ?.querySelector<HTMLElement>('[data-focus-target]')
      ?.focus({ preventScroll: true });
  }, [cursor]);
  usePrefetch(game.questions[cursor + 1]);
  const q = game.questions[cursor];
  const server = useSessionSummary(
    game.id,
    userKind === 'student' && restored && !q && !saving && !failures.length,
  );
  const lookup = (vi: string | undefined) => findSpecies(speciesIndex, game.releaseId, vi);
  const floats: RopeFloat[] = game.questions.flatMap((x, i) =>
    x.result
      ? [{ index: i, group: lookup(coverName(x))?.group ?? 'none', correct: x.result.correct }]
      : [],
  );
  const rope = (
    <FloatRope
      total={game.questions.length}
      done={floats}
      current={cursor}
      className="study-rope"
    />
  );
  if (!q)
    return (
      <div ref={stage}>
        <Summary
          game={game}
          progress={progress}
          server={server}
          saving={saving}
          saveError={saveError}
          rope={rope}
          lookup={lookup}
          onRetry={onRetry}
          pending={pending}
        />
      </div>
    );
  return (
    <div className="study" data-type={q.type} ref={stage}>
      <div className="study-frame">
        <div className="study-bar">
          <p className="study-mode">
            <span>
              {modeNames[q.type] || (q.type === 'listening' ? 'Nghe và chọn tên' : 'Ôn tập')}
            </span>
            <span className="study-count">
              Câu {cursor + 1} / {game.questions.length}
            </span>
            <span className="study-saving" role="status">
              {saving ? 'Đang lưu…' : ''}
            </span>
          </p>
          <div className="study-tools">
            <SoundControl />
            <a className="study-pause" href="#home" title="Tạm dừng">
              <Pause size={18} aria-hidden="true" />
              <span className="study-pause-text">Tạm dừng</span>
            </a>
          </div>
        </div>
        {rope}
      </div>
      {saveError}
      <QuestionView
        key={q.id}
        game={game}
        q={q}
        index={cursor}
        species={lookup(coverName(q))}
        speciesSettled={settled}
        onScore={(s) => onChange((g) => withResult(g, game.id, q.id, s))}
        onQueue={(job, provisional) => {
          onChange((g) => withResult(g, game.id, q.id, provisional));
          queue.enqueue(job);
        }}
        onNext={() => {
          stopAudio();
          advanced.current = true;
          setCursor(cursor + 1);
        }}
        onRefresh={async () => {
          const fresh = await api<Game>('/learning/sessions/' + game.id);
          // Fresh signed URLs, but answers this tab already holds (some not yet saved) stay.
          onChange((g) =>
            g.id !== fresh.id
              ? g
              : {
                  ...fresh,
                  questions: fresh.questions.map((fq) => {
                    const mine = g.questions.find((x) => x.id === fq.id)?.result;
                    return mine ? { ...fq, result: mine } : fq;
                  }),
                },
          );
          return fresh.questions.find((x) => x.id === q.id);
        }}
      />
    </div>
  );
}
