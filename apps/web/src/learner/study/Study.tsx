import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Pause, Timer, TimerOff } from 'lucide-react';
import {
  api,
  ApiError,
  type ApiQuestion,
  type Game,
  type ProgressEntry,
  type Score,
} from '../../pilot/api';
import { stopAudio } from '../../pilot/Media';
import { ErrorNote } from '../ErrorNote';
import { FloatRope, type RopeFloat } from '../FloatRope';
import { QuestionView, coverName, type QuestionHandle } from './QuestionView';
import { SoundControl } from '../sound/SoundControl';
import { installSoundUnlock } from '../sound/sfx';
import { ComboChip } from './ComboChip';
import { sessionCombo } from './combo';
import { Summary } from './HaulSummary';
import { findSpecies, useSpeciesIndex } from './species';
import { sessionQueue, withResult, type GameUpdate } from './submitQueues';
import { useSessionSummary } from './useSessionSummary';
import { timeoutKey, timerBudgetMs, useSessionTimer } from './sessionTimer';
import { setTimerOn, useTimerOn } from './timerSetting';
import { TimerBar, WARM_MS } from './TimerBar';
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

/** Đoán hình: the only mode with a session clock. */
const isImageSession = (game: Game) =>
  game.mode === 'image' &&
  game.questions.length > 0 &&
  game.questions.every((x) => x.type === 'image');

const noop = () => {};

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
  usePrefetch(game.questions[cursor + 1]);
  const combo = sessionCombo(game.questions);
  // Đoán hình session clock (15 s per question for the whole session). It measures recognition:
  // it runs only while the question on screen is open and its image is ready (loaded, failed, or
  // there is none), so feedback and a slow image do not eat the budget. It stops for good once
  // every question has a result; leaving the screen pauses it (the hook saves the time left).
  const imageSession = isImageSession(game);
  const timerOn = useTimerOn();
  const allDone = game.questions.every((x) => !!x.result);
  const timerEnabled = imageSession && timerOn && !allDone;
  // The question whose image last settled; a new question waits for its own image.
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const settleImage = useCallback((id: string) => setSettledFor(id), []);
  const current = game.questions[cursor];
  const totalMs = timerBudgetMs(game.questions.length);
  // The expiry is driven by `expired` (below), not by `onExpire`: a budget restored as 0 (it ran
  // out as the screen closed, or the closing failed before a reload) is expired without a call.
  const timer = useSessionTimer({
    gameId: game.id,
    totalMs,
    enabled: timerEnabled,
    running: !!current && settledFor === current.id && !current.result && !allDone,
    onExpire: noop,
  });
  const [timedOut, setTimedOut] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closingNow, setClosingNow] = useState(false);
  const closeNoteRef = useRef<HTMLDivElement>(null);
  const focusNote = useRef(false);
  const shown = useRef<QuestionHandle>(null);
  const closing = useRef(new Set<string>());
  const closedFor = useRef<string | null>(null);
  const latest = useRef({ game, cursor, onChange });
  useEffect(() => {
    latest.current = { game, cursor, onChange };
  });

  /**
   * Gives every question without a result one: the question on screen sends its selected option
   * (or a timeout) through its own submit, the later ones a timeout with the deterministic key.
   * A 409 means the server already holds a result: it is read back instead. Safe to run again
   * (retry): questions with a result or a request on its way are left alone.
   */
  const closeAll = useCallback(async () => {
    const { game: g, cursor: at } = latest.current;
    const apply = (id: string, s: Score) =>
      latest.current.onChange((x) => withResult(x, g.id, id, s));
    const open = g.questions.filter((x) => !x.result && !closing.current.has(x.id));
    if (!open.length) return;
    setClosingNow(true);
    const outcomes = await Promise.allSettled(
      open.map((x) => {
        closing.current.add(x.id);
        const sent =
          x.id === g.questions[at]?.id && shown.current
            ? shown.current.closeOut()
            : api<Score>(`/learning/sessions/${g.id}/questions/${x.id}/attempts`, {
                key: timeoutKey(g.id, x.id),
                answer: { timeout: true },
              }).then((s) => apply(x.id, s));
        return sent.finally(() => closing.current.delete(x.id));
      }),
    );
    const failed = outcomes.flatMap((o, i) =>
      o.status === 'rejected' ? [{ id: open[i].id, error: o.reason as Error }] : [],
    );
    let errors = failed.filter((f) => (f.error as ApiError).status !== 409);
    const conflicts = failed.filter((f) => (f.error as ApiError).status === 409);
    if (conflicts.length) {
      try {
        const fresh = await api<Game>('/learning/sessions/' + g.id);
        for (const c of conflicts) {
          const stored = fresh.questions.find((x) => x.id === c.id)?.result;
          if (stored) apply(c.id, stored);
          else errors.push(c);
        }
      } catch (e) {
        errors = [...errors, ...conflicts.map((c) => ({ ...c, error: e as Error }))];
      }
    }
    setClosingNow(closing.current.size > 0);
    setCloseError(
      errors.length
        ? `Chưa nộp được ${errors.length} câu khi hết giờ: ${errors[0].error.message}`
        : '',
    );
  }, []);

  // Once per mount and game: the clock is out while questions are still open.
  const timeUp = timerEnabled && timer.expired;
  useEffect(() => {
    if (!timeUp || closedFor.current === game.id) return;
    closedFor.current = game.id;
    setTimedOut(true);
    void closeAll();
  }, [timeUp, game.id, closeAll]);
  const announce =
    timedOut || timeUp
      ? 'Hết giờ'
      : timerEnabled && timer.remainingMs <= WARM_MS
        ? 'Còn 10 giây'
        : '';
  // After the clock ran out the session ends on the summary as soon as every question is closed.
  const q = timedOut && allDone ? undefined : game.questions[cursor];
  const server = useSessionSummary(
    game.id,
    userKind === 'student' && restored && !q && !saving && !failures.length,
  );
  const timeNotice =
    timedOut || game.questions.some((x) => x.result?.explanation?.startsWith('Hết giờ'));

  const ended = timedOut && allDone;
  useEffect(() => {
    if (!advanced.current && !ended) return;
    window.scrollTo(0, 0);
    stage.current
      ?.querySelector<HTMLElement>('[data-focus-target]')
      ?.focus({ preventScroll: true });
  }, [cursor, ended]);
  // "Tiếp tục" after the time ran out retries the closing; the note (if it is or comes back) takes
  // focus so a phone user sees it even when it is above the fold.
  useEffect(() => {
    const note = closeNoteRef.current;
    if (!focusNote.current || !note) return;
    focusNote.current = false;
    note.scrollIntoView?.({ block: 'center' });
    note.focus({ preventScroll: true });
  });
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
  // Polite, outside the screens below so it survives the move to the summary; the bar itself is
  // not a live region (no per-second announcements).
  const status = imageSession && (
    <p className="study-visually-hidden study-timer-status" role="status">
      {announce}
    </p>
  );
  if (!q)
    return (
      <>
        {status}
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
            bestCombo={combo.best}
            timedOut={timeNotice}
          />
        </div>
      </>
    );
  const closeNote = closeError && (
    <ErrorNote
      message={closeError}
      retry={() => void closeAll().catch(noop)}
      noteRef={closeNoteRef}
    />
  );
  return (
    <>
      {status}
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
              <ComboChip current={combo.current} />
              {imageSession && timerOn && (
                <TimerBar remainingMs={timer.remainingMs} totalMs={totalMs} />
              )}
              <span className="study-saving" role="status">
                {saving ? 'Đang lưu…' : ''}
              </span>
            </p>
            <div className="study-tools">
              <SoundControl />
              {imageSession && (
                <button
                  type="button"
                  className="study-timer-toggle"
                  aria-pressed={timerOn}
                  title="Tính giờ"
                  onClick={() => setTimerOn(!timerOn)}
                >
                  {timerOn ? (
                    <Timer size={18} aria-hidden="true" />
                  ) : (
                    <TimerOff size={18} aria-hidden="true" />
                  )}
                  <span className="study-visually-hidden">Tính giờ</span>
                </button>
              )}
              <a className="study-pause" href="#home" title="Tạm dừng">
                <Pause size={18} aria-hidden="true" />
                <span className="study-pause-text">Tạm dừng</span>
              </a>
            </div>
          </div>
          {rope}
        </div>
        {saveError}
        {closeNote}
        <QuestionView
          key={q.id}
          ref={shown}
          onImageSettled={settleImage}
          timeUp={timedOut}
          closing={closingNow}
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
            // Time is up: no new question. Retry the closing (questions already being sent are
            // left alone); the summary follows on its own once every question has a result.
            if (timedOut) {
              focusNote.current = true;
              void closeAll().catch(noop);
              return;
            }
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
    </>
  );
}
