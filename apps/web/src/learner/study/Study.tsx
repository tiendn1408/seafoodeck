import { useEffect, useRef, useState } from 'react';
import { Pause } from 'lucide-react';
import { api, type Game, type Score } from '../../pilot/api';
import { stopAudio } from '../../pilot/Media';
import { FloatRope, type RopeFloat } from '../FloatRope';
import type { Ledger } from '../ledger';
import { QuestionView, coverName } from './QuestionView';
// Explicit extension: `Summary.tsx` sits beside `summary.ts` and macOS paths ignore case.
import { Summary } from './Summary.tsx';
import { findSpecies, useSpeciesIndex } from './species';
import './study.css';

const modeNames: Record<string, string> = {
  flashcard: 'Flashcard tên loài',
  match: 'Ghép tên thương mại',
  image: 'Đoán hình nguyên liệu',
  hs: 'HS theo dạng hàng',
};

/**
 * A study session on the deep-sea frame: the haul's float rope on top, then the current
 * question, then the haul summary once every question is answered.
 */
export function Study({
  game,
  ledger,
  onChange,
  onRecord,
  onRetry,
  pending,
}: {
  game: Game;
  ledger: Ledger;
  onChange: (g: Game) => void;
  onRecord: (s: Score, g: Game) => void;
  onRetry: () => void;
  pending: boolean;
}) {
  const [cursor, setCursor] = useState(() =>
    game.questions.findIndex((q) => !q.result) < 0
      ? game.questions.length
      : game.questions.findIndex((q) => !q.result),
  );
  const { index: speciesIndex, settled } = useSpeciesIndex(game.releaseId);
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
  const lookup = (vi: string | undefined) => findSpecies(speciesIndex, game.releaseId, vi);
  const floats: RopeFloat[] = game.questions.flatMap((x, i) =>
    x.result
      ? [{ index: i, group: lookup(coverName(x))?.group ?? 'none', correct: x.result.correct }]
      : [],
  );
  const rope = <FloatRope total={game.questions.length} done={floats} className="study-rope" />;
  const q = game.questions[cursor];
  if (!q)
    return (
      <div ref={stage}>
        <Summary
          game={game}
          ledger={ledger}
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
          </p>
          <a className="study-pause" href="#home">
            <Pause size={18} aria-hidden="true" />
            Tạm dừng
          </a>
        </div>
        {rope}
      </div>
      <QuestionView
        key={q.id}
        game={game}
        q={q}
        index={cursor}
        species={lookup(coverName(q))}
        speciesSettled={settled}
        onScore={(s) => {
          onRecord(s, game);
          onChange({
            ...game,
            questions: game.questions.map((x) => (x.id === q.id ? { ...x, result: s } : x)),
          });
        }}
        onNext={() => {
          stopAudio();
          advanced.current = true;
          setCursor(cursor + 1);
        }}
        onRefresh={async () => {
          const fresh = await api<Game>('/learning/sessions/' + game.id);
          onChange(fresh);
          return fresh.questions.find((x) => x.id === q.id);
        }}
      />
    </div>
  );
}
