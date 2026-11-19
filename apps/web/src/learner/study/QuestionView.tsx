import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookmarkCheck,
  Check,
  CircleCheck,
  CircleX,
  Hand,
  SkipForward,
  X,
} from 'lucide-react';
import {
  api,
  readLocal,
  writeLocal,
  type ApiQuestion,
  type Game,
  type Reveal,
  type Score,
} from '../../pilot/api';
import { Pronunciation } from '../../pilot/Media';
import { ErrorNote } from '../ErrorNote';
import { SpeciesCover } from '../SpeciesCover';
import { lightItem, useCatalogItem, type SpeciesRef } from './species';

/** The flashcard prompt names the language being asked; the code and lang follow from it. */
const answerLanguage: Record<string, { code: string; lang: string }> = {
  'Tên tiếng Anh': { code: 'EN', lang: 'en' },
  'Tên tiếng Nhật': { code: 'JP', lang: 'ja' },
  'Tên khoa học': { code: 'LAT', lang: 'la' },
};

/** The Vietnamese species name a question is about, when the question tells us. */
export function coverName(q: ApiQuestion): string | undefined {
  if (q.type === 'flashcard') return q.front;
  if (q.type === 'image') return q.result?.targetLabel;
  return undefined;
}

/** Photo credit carried by an answered image question ("credit · rights\nsource"). */
function SourceCredit({ source }: { source: string }) {
  const [line, link = ''] = source.split('\n');
  return (
    <div className="pilot-media-credit">
      <p>{line}</p>
      {/^https?:\/\/\S+$/.test(link) ? (
        <a href={link} target="_blank" rel="noreferrer">
          Nguồn ảnh và quyền sử dụng
        </a>
      ) : (
        link && <p>{link}</p>
      )}
    </div>
  );
}

function Feedback({ q, result }: { q: ApiQuestion; result: Score }) {
  const tone = result.skipped
    ? 'skip'
    : result.selfRated
      ? 'self'
      : result.correct
        ? 'correct'
        : 'wrong';
  const Icon = { skip: SkipForward, self: BookmarkCheck, correct: CircleCheck, wrong: CircleX }[
    tone
  ];
  return (
    <div className="pilot-feedback study-feedback" data-tone={tone} role="status">
      <p className="study-feedback-head">
        <Icon size={22} aria-hidden="true" />
        <strong>
          {result.skipped
            ? 'Đã bỏ qua'
            : result.selfRated
              ? 'Đã lưu tự đánh giá'
              : result.correct
                ? 'Chính xác'
                : 'Chưa chính xác'}
        </strong>
      </p>
      {!result.selfRated && <p>{result.explanation}</p>}
      {result.correctOption && (
        <p>
          Đáp án:{' '}
          <span className="study-feedback-answer">
            {q.options?.find((o) => o.id === result.correctOption)?.label}
          </span>
        </p>
      )}
      {result.correctPairs && (
        <ul>
          {Object.entries(result.correctPairs).map(([l, r]) => (
            <li key={l}>
              {q.left?.find((o) => o.id === l)?.label} — {q.right?.find((o) => o.id === r)?.label}
            </li>
          ))}
        </ul>
      )}
      {result.source && (
        <details>
          <summary>Nguồn và ghi công</summary>
          <p>{result.source}</p>
        </details>
      )}
    </div>
  );
}

/**
 * One question of a session. Flashcard and image questions sit on the species cover
 * ("Ấn bản loài"); matching, HS and listening sit on a light card on the deep frame.
 * Answer submission, reveal, drafts and idempotency keys are unchanged from the pilot.
 */
export function QuestionView({
  game,
  q,
  index,
  species,
  speciesSettled,
  onScore,
  onNext,
  onRefresh,
}: {
  game: Game;
  q: ApiQuestion;
  index: number;
  species: SpeciesRef | null;
  speciesSettled: boolean;
  onScore: (s: Score) => void;
  onNext: () => void;
  onRefresh: () => Promise<ApiQuestion | undefined>;
}) {
  const draftKey = `seafood-deck:draft:${game.id}:${q.id}`;
  const [draft, setDraft] = useState(() =>
    readLocal<{
      optionId?: string;
      followUpId?: string;
      pairs?: Record<string, string>;
      flipped?: boolean;
    }>(draftKey, {}),
  );
  const [reveal, setReveal] = useState<Reveal | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [left, setLeft] = useState(''),
    [image, setImage] = useState(q.image?.url),
    [broken, setBroken] = useState(q.unavailable),
    [refreshed, setRefreshed] = useState(false);
  const [imageGeneration, setImageGeneration] = useState(0);
  const tokenKey = draftKey + ':key';
  const [token] = useState(() => readLocal(tokenKey, '') || crypto.randomUUID());
  const catalog = useCatalogItem(species, speciesSettled);
  const section = useRef<HTMLElement>(null);
  const [answeredHere, setAnsweredHere] = useState(false);
  // Phone image question: the answer reveals the names above the options; bring them into
  // view (the feedback and "Tiếp tục" follow right below).
  useEffect(() => {
    if (!answeredHere || q.type !== 'image' || !matchMedia('(max-width: 899px)').matches) return;
    section.current?.querySelector('.cover-text')?.scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [answeredHere, q.type]);
  useEffect(() => {
    writeLocal(tokenKey, token);
  }, [token, tokenKey]);
  async function flip() {
    try {
      setReveal(await api<Reveal>(`/learning/sessions/${game.id}/questions/${q.id}/reveal`, {}));
      update({ ...draft, flipped: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!draft.flipped || q.type !== 'flashcard') return;
    let alive = true;
    api<Reveal>(`/learning/sessions/${game.id}/questions/${q.id}/reveal`, {})
      .then((r) => {
        if (alive) setReveal(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [draft.flipped, q.type, q.id, game.id]);
  function update(next: typeof draft) {
    setDraft(next);
    writeLocal(draftKey, next);
  }
  async function submit(answer: unknown) {
    if (busy || q.result) return;
    setBusy(true);
    setError('');
    try {
      const score = await api<Score>(`/learning/sessions/${game.id}/questions/${q.id}/attempts`, {
        key: token,
        answer,
      });
      onScore(score);
      setAnsweredHere(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const done = !!q.result;
  const result = q.result;
  const next = done && (
    <div className="pilot-question-next">
      <button
        className="btn primary study-next"
        onClick={(e) => {
          if (e.detail > 1) return;
          onNext();
        }}
      >
        {index === game.questions.length - 1 ? 'Xem tổng kết' : 'Tiếp tục'}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
  const feedback = result && <Feedback q={q} result={result} />;

  // Option buttons: one choice, pressed state as today; after the answer they show which
  // option was right (and whether the learner's pick was wrong) by icon as well as colour.
  const options = (
    <div className="pilot-options study-options">
      {q.options?.map((o) => {
        const picked = draft.optionId === o.id;
        const right = !!result?.correctOption && result.correctOption === o.id;
        const wrong = !!result?.correctOption && picked && !right;
        return (
          <button
            key={o.id}
            className={
              'pilot-option ' +
              (picked ? 'selected ' : '') +
              (right ? 'is-right ' : '') +
              (wrong ? 'is-wrong' : '')
            }
            aria-pressed={picked}
            disabled={done}
            onClick={() => update({ ...draft, optionId: o.id })}
          >
            <span className="study-radio" aria-hidden="true">
              {right ? <Check size={14} /> : wrong ? <X size={14} /> : null}
            </span>
            <span className="study-option-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
  const followUp =
    q.followUps?.length && !done ? (
      <label className="select-label study-followup">
        Nếu chọn “Chưa đủ thông tin”, cần hỏi gì?
        <select
          aria-label="Dữ kiện cần hỏi thêm"
          value={draft.followUpId ?? ''}
          onChange={(e) => update({ ...draft, followUpId: e.target.value })}
        >
          <option value="">Chọn dữ kiện</option>
          {q.followUps.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    ) : null;
  const actions = !done && (
    <div className="pilot-actions study-actions">
      <button
        className="btn primary"
        disabled={
          busy ||
          (q.type === 'match'
            ? Object.keys(draft.pairs ?? {}).length !== q.left?.length
            : !draft.optionId) ||
          (q.type === 'image' && broken)
        }
        onClick={() =>
          void submit(
            q.type === 'match'
              ? { pairs: draft.pairs }
              : {
                  optionId: draft.optionId,
                  ...(draft.followUpId ? { followUpId: draft.followUpId } : {}),
                },
          )
        }
      >
        Nộp câu trả lời
      </button>
      {['image', 'listening'].includes(q.type) && (
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => void submit({ skip: true })}
        >
          {q.type === 'listening' ? 'Bỏ qua bản thu' : 'Bỏ qua ảnh'}
        </button>
      )}
    </div>
  );

  let body: ReactNode;
  if (q.type === 'flashcard') {
    const language = answerLanguage[q.prompt];
    body = (
      <SpeciesCover
        item={catalog.item ?? lightItem(q.front ?? '', species?.group)}
        reveal={{ names: false }}
        mode="flashcard"
        photo={
          catalog.status === 'loading' ? (
            <div className="pilot-media-placeholder">Đang tải ảnh…</div>
          ) : undefined
        }
      >
        <div className="study-answer" data-flipped={reveal ? '' : undefined}>
          <p className="study-answer-label">
            {language && (
              <span className="cover-code" aria-hidden="true">
                {language.code}
              </span>
            )}
            {q.prompt}
          </p>
          {reveal ? (
            <div className="study-answer-face">
              <p className="study-answer-name" lang={language?.lang}>
                {reveal.label}
              </p>
              <div className="study-answer-meta">
                <p className="study-answer-reading">
                  {reveal.pronunciation || 'Hướng dẫn đọc đang bổ sung.'}
                </p>
                {reveal.audio?.url ? (
                  <Pronunciation
                    initialUrl={reveal.audio.url}
                    onRefresh={async () => {
                      const fresh = await api<Reveal>(
                        `/learning/sessions/${game.id}/questions/${q.id}/reveal`,
                        {},
                      );
                      return fresh.audio?.url;
                    }}
                  />
                ) : (
                  <span className="study-chip">Chưa có bản thu</span>
                )}
              </div>
            </div>
          ) : (
            <button className="pilot-flip study-flip" onClick={() => void flip()}>
              <Hand size={20} aria-hidden="true" />
              Chạm để lật thẻ
            </button>
          )}
        </div>
        {reveal && !done && (
          <div className="pilot-actions study-actions study-rate">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => void submit({ rating: 'again' })}
            >
              Chưa nhớ
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void submit({ rating: 'known' })}
            >
              Đã nhớ
            </button>
          </div>
        )}
        {done && (
          <div className="study-done">
            {feedback}
            {next}
          </div>
        )}
      </SpeciesCover>
    );
  } else if (q.type === 'image') {
    const name = coverName(q);
    body = (
      <SpeciesCover
        item={catalog.item ?? lightItem(name ?? '', species?.group)}
        reveal={{ names: done, rows: catalog.status === 'ready' }}
        mode="image"
        photo={
          broken || !image ? (
            <div className="pilot-media-placeholder">
              <p>Ảnh chưa tải được hoặc đã thu hồi.</p>
              <button
                className="btn secondary"
                onClick={() =>
                  void onRefresh()
                    .then((f) => {
                      setImage(f?.image?.url);
                      setImageGeneration((n) => n + 1);
                      setBroken(!f?.image);
                      setRefreshed(false);
                    })
                    .catch((e) => setError(e.message))
                }
              >
                Thử tải lại
              </button>
            </div>
          ) : (
            <img
              key={imageGeneration}
              src={image}
              alt="Mẫu nguyên liệu cần nhận diện"
              width="640"
              height="420"
              onError={() => {
                if (!refreshed) {
                  setRefreshed(true);
                  void onRefresh()
                    .then((f) => {
                      setImage(f?.image?.url);
                      setImageGeneration((n) => n + 1);
                      if (!f?.image) setBroken(true);
                    })
                    .catch(() => setBroken(true));
                } else setBroken(true);
              }}
            />
          )
        }
        credit={
          result?.source && !broken && image ? <SourceCredit source={result.source} /> : undefined
        }
      >
        {!done && <h1 className="study-prompt">{q.prompt}</h1>}
        {options}
        {actions}
        {feedback}
        {next}
      </SpeciesCover>
    );
  } else {
    // A goods description: its first line is the case title, the rest the description.
    const [title, ...rest] = q.prompt.split('\n');
    const detail = rest.join('\n').trim();
    body = (
      <div className="study-card">
        {q.catalog && <p className="pilot-question-meta">{q.catalog}</p>}
        <h1 className="study-card-prompt">{title}</h1>
        {detail && <p className="study-card-detail">{detail}</p>}
        {q.type === 'listening' && (
          <Pronunciation
            initialUrl={q.audio?.url}
            onRefresh={async () => {
              const fresh = await onRefresh();
              return fresh?.audio?.url;
            }}
          />
        )}
        {q.type === 'match' && !done && (
          <p className="study-hint">
            Chọn một tên tiếng Việt, rồi chọn tên tương ứng ở cột bên phải.
          </p>
        )}
        {q.type === 'match' ? (
          <div className="pilot-match">
            <div role="group" aria-label="Tên tiếng Việt">
              {q.left?.map((o) => {
                const pair = draft.pairs?.[o.id];
                const verdict =
                  result?.correctPairs && pair
                    ? result.correctPairs[o.id] === pair
                      ? 'is-right'
                      : 'is-wrong'
                    : '';
                return (
                  <button
                    key={o.id}
                    className={
                      'pilot-option ' +
                      (left === o.id ? 'selected ' : '') +
                      (pair ? 'paired ' : '') +
                      verdict
                    }
                    disabled={done}
                    aria-pressed={left === o.id}
                    onClick={() => setLeft(o.id)}
                  >
                    <span className="study-option-label">
                      {o.label}
                      {draft.pairs?.[o.id] && (
                        <small>{q.right?.find((r) => r.id === draft.pairs![o.id])?.label}</small>
                      )}
                    </span>
                    {verdict && (
                      <span className="study-verdict" aria-hidden="true">
                        {verdict === 'is-right' ? <Check size={16} /> : <X size={16} />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div role="group" aria-label="Tên cần ghép">
              {q.right?.map((o) => (
                <button
                  key={o.id}
                  className={
                    'pilot-option ' +
                    (Object.values(draft.pairs ?? {}).includes(o.id) ? 'paired' : '')
                  }
                  disabled={done || !left}
                  onClick={() => {
                    const pairs = { ...draft.pairs };
                    for (const [l, r] of Object.entries(pairs)) if (r === o.id) delete pairs[l];
                    pairs[left] = o.id;
                    update({ ...draft, pairs });
                    setLeft('');
                  }}
                >
                  <span className="study-option-label">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          options
        )}
        {followUp}
        {actions}
        {feedback}
        {next}
      </div>
    );
  }

  return (
    <section
      ref={section}
      className="pilot-question study-question"
      data-type={q.type}
      data-focus-target=""
      tabIndex={-1}
      aria-label={`Câu ${index + 1} / ${game.questions.length}`}
    >
      {error && <ErrorNote message={error} />}
      <div className="pilot-question-body">{body}</div>
    </section>
  );
}
