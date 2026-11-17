import { useState } from 'react';
import { customerPack as pack } from '../data/customer';
import { primaryName } from '../domain/content';
import type { Attempt, Question } from '../domain/models';

export function ImageQuestion({
  question,
  choice,
  attempt,
  onChoice,
  onSubmit,
  onSkip,
}: {
  question: Extract<Question, { type: 'image' }>;
  choice?: string;
  attempt?: Attempt;
  onChoice: (id: string) => void;
  onSubmit: (correct: boolean, answer: string) => void;
  onSkip: () => void;
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadVersion, setLoadVersion] = useState(0);
  const media = pack.media.find((m) => m.id === question.assetId)!;
  const name = (id: string) => primaryName(pack, id, 'vi')!.label;
  const selected = attempt?.answer ?? choice;
  return (
    <>
      <div className="study-heading">
        <div className="eyebrow">Nhận diện nguyên liệu · 3 câu</div>
        <h1>Đây là loài nào?</h1>
        <p>Demo nội bộ · Ảnh ứng viên chưa duyệt nhận diện.</p>
      </div>
      <section className="image-question">
        <div className="quiz-image-frame">
          <img
            key={loadVersion}
            width="640"
            height="480"
            src={media.path}
            alt="Ảnh mẫu để chọn tên loài"
            hidden={status !== 'ready'}
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
          />
          {status !== 'ready' && (
            <span role="status">
              {status === 'error' ? 'Thiếu hoặc không đọc được ảnh local.' : 'Đang tải ảnh…'}
            </span>
          )}
        </div>
        {!attempt && status === 'error' && (
          <div className="image-error" role="alert">
            <p>Ảnh không tải được. Bỏ qua không tính sai và không tính là đã trả lời.</p>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setStatus('loading');
                setLoadVersion((v) => v + 1);
              }}
            >
              Thử tải lại
            </button>
          </div>
        )}
        <fieldset className="answer-options" disabled={!!attempt || status !== 'ready'}>
          <legend>Chọn tên tiếng Việt</legend>
          {question.options.map((id, i) => (
            <label className={`answer-option ${selected === id ? 'chosen' : ''}`} key={id}>
              <input
                type="radio"
                name={question.id}
                checked={selected === id}
                onChange={() => onChoice(id)}
              />
              <span className="answer-letter">{String.fromCharCode(65 + i)}</span>
              <span>{name(id)}</span>
              <span className="radio-indicator">{selected === id && <span />}</span>
            </label>
          ))}
        </fieldset>
        {!attempt && (
          <div className="image-actions">
            <button
              className="btn btn-primary"
              disabled={!choice || status !== 'ready'}
              onClick={() => onSubmit(choice === question.speciesId, choice!)}
            >
              Kiểm tra câu trả lời
            </button>
            <button className="btn btn-secondary" onClick={onSkip}>
              Bỏ qua câu
            </button>
          </div>
        )}
        {attempt &&
          (attempt.skipped ? (
            <div className="feedback neutral" role="status">
              <p>
                Đã bỏ qua. Câu này không tính đúng/sai, không tạo lịch ôn và không tăng số câu đã
                trả lời.
              </p>
            </div>
          ) : (
            <div className={`feedback ${attempt.correct ? 'correct' : 'incorrect'}`} role="status">
              <div>
                <strong>
                  {attempt.correct ? 'Chính xác' : 'Cùng quan sát lại'}: {name(question.speciesId)}
                </strong>
                <p>{media.explanation}</p>
                <p>Ảnh ứng viên, chưa duyệt nhận diện.</p>
                <p className="photo-credit">
                  {media.credit} · {media.rights}
                  <br />
                  <a href={media.sourceUrl} target="_blank" rel="noreferrer">
                    Nguồn ảnh
                  </a>{' '}
                  ·{' '}
                  <a href={media.licenseUrl} target="_blank" rel="noreferrer">
                    Thông tin quyền
                  </a>
                  <br />
                  Ảnh được đóng gói local, hiển thị vừa khung, không crop. Hồ sơ nguồn ghi rõ bản
                  gốc hoặc thumbnail.
                </p>
              </div>
            </div>
          ))}
      </section>
    </>
  );
}
