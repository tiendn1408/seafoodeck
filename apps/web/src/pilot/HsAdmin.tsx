import { useState } from 'react';
import { api } from './api';
export interface AdminTariff {
  id: string;
  code: string;
  level: number;
  market: string;
  version: string;
  source: string;
  reviewedBy: string | null;
}
export interface AdminScenario {
  id: string;
  status: string;
  data: Record<string, unknown>;
  tariffId: string | null;
}
const factLabels: Record<string, string> = {
  frozen: 'Đông lạnh',
  filleted: 'Phi lê',
  cooked: 'Đã nấu',
  seasoned: 'Tẩm ướp',
  smoked: 'Hun khói',
};
export function HsAdmin({
  revisionId,
  tariffs,
  scenarios,
  refresh,
}: {
  revisionId?: string;
  tariffs: AdminTariff[];
  scenarios: AdminScenario[];
  refresh: () => Promise<unknown>;
}) {
  const [reference, setReference] = useState({
    code: '',
    level: 6,
    market: 'VN',
    version: '',
    source: '',
  });
  const [prompt, setPrompt] = useState(''),
    [explanation, setExplanation] = useState(''),
    [kind, setKind] = useState('code'),
    [tariffId, setTariffId] = useState(''),
    [wrong, setWrong] = useState(''),
    [requiredFact, setRequiredFact] = useState('filleted'),
    [followUp, setFollowUp] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [facts, setFacts] = useState<Record<string, string>>({
    frozen: 'unknown',
    filleted: 'unknown',
    cooked: 'unknown',
    seasoned: 'unknown',
    smoked: 'unknown',
  });
  async function act(path: string, body: unknown = {}) {
    setBusy(true);
    setMessage('');
    try {
      await api(path, body);
      setMessage('Đã lưu.');
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const referenceCode = tariffs.find((t) => t.id === tariffId)?.code;
  return (
    <section>
      <h2>Hồ sơ HS theo dạng hàng</h2>
      <p>
        Mã thuộc quy cách, thị trường và phiên bản nguồn. Người có nghiệp vụ cần kiểm nguồn và hiệu
        lực trước khi duyệt.
      </p>
      <details>
        <summary>Thêm dòng tham chiếu mã</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act('/admin/tariffs', reference);
          }}
        >
          <label>
            Mã HS
            <input
              value={reference.code}
              onChange={(e) => setReference({ ...reference, code: e.target.value })}
              required
              inputMode="numeric"
            />
          </label>
          <label className="select-label">
            Cấp mã
            <select
              value={reference.level}
              onChange={(e) => setReference({ ...reference, level: Number(e.target.value) })}
            >
              <option value="6">6 số</option>
              <option value="8">8 số</option>
            </select>
          </label>
          <label className="select-label">
            Danh mục
            <select
              value={reference.market}
              onChange={(e) => setReference({ ...reference, market: e.target.value })}
            >
              <option value="VN">Việt Nam</option>
              <option value="WCO">WCO (chỉ cấp 6 số)</option>
            </select>
          </label>
          <label>
            Phiên bản danh mục
            <input
              value={reference.version}
              onChange={(e) => setReference({ ...reference, version: e.target.value })}
              required
            />
          </label>
          <label>
            Nguồn, dòng tham chiếu và phạm vi hiệu lực
            <textarea
              value={reference.source}
              onChange={(e) => setReference({ ...reference, source: e.target.value })}
              required
              rows={3}
            />
          </label>
          <button className="btn secondary" disabled={busy}>
            Lưu tham chiếu nháp
          </button>
        </form>
      </details>
      <div className="pilot-tariffs">
        {tariffs.map((t) => (
          <article key={t.id}>
            <p>
              <strong>{t.code}</strong> · {t.market} · {t.version} · {t.level} số
            </p>
            <details>
              <summary>Nguồn tham chiếu</summary>
              <p>{t.source}</p>
            </details>
            <button
              className="btn secondary"
              disabled={busy || !!t.reviewedBy}
              onClick={() => {
                if (
                  confirm(
                    'Xác nhận đã đối chiếu đúng dòng mã, nguồn và hiệu lực cho phạm vi bài học?',
                  )
                )
                  void act(`/admin/tariffs/${t.id}/approve`, { confirmed: true });
              }}
            >
              {t.reviewedBy ? 'Đã duyệt tham chiếu' : 'Duyệt tham chiếu mã'}
            </button>
          </article>
        ))}
      </div>
      <details>
        <summary>Thêm tình huống vào mục đang chọn</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const options = [
              ...(kind === 'code'
                ? [{ label: referenceCode, correct: true }]
                : referenceCode
                  ? [{ label: referenceCode, correct: false }]
                  : []),
              ...wrong
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((label) => ({ label, correct: false })),
              { label: 'Chưa đủ thông tin', correct: kind === 'insufficient' },
            ];
            void act('/admin/scenarios', {
              revisionId,
              tariffId: tariffId || undefined,
              data: {
                prompt,
                explanation,
                kind,
                facts: Object.fromEntries(
                  Object.entries(facts).map(([k, v]) => [
                    k,
                    v === 'unknown' ? 'unknown' : v === 'true',
                  ]),
                ),
                options,
                ...(kind === 'insufficient'
                  ? {
                      requiredFact,
                      followUps: [
                        { label: followUp, correct: true, fact: requiredFact },
                        {
                          label: 'Hỏi lại thông tin không ảnh hưởng dạng hàng',
                          correct: false,
                          fact: 'irrelevant',
                        },
                      ],
                    }
                  : {}),
              },
            });
          }}
        >
          <p>
            Chọn một mục nháp ở phần nội dung phía trên. Nếu mục đã có trong release, tạo nháp mới
            trước khi sửa.
          </p>
          <label>
            Đề bài và mô tả quy cách
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
            />
          </label>
          <label className="select-label">
            Loại tình huống
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="code">Đủ dữ kiện để chọn mã</option>
              <option value="insufficient">Thiếu dữ kiện quyết định</option>
            </select>
          </label>
          <label className="select-label">
            Dòng mã tham chiếu
            <select required value={tariffId} onChange={(e) => setTariffId(e.target.value)}>
              <option value="">Chọn mã và phiên bản</option>
              {tariffs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.version} · {t.reviewedBy ? 'đã duyệt' : 'chưa duyệt'}
                </option>
              ))}
            </select>
          </label>
          <div className="pilot-edit-fields">
            {Object.entries(factLabels).map(([field, label]) => (
              <label key={field} className="select-label">
                {label}
                <select
                  value={facts[field]}
                  onChange={(e) => setFacts({ ...facts, [field]: e.target.value })}
                >
                  <option value="unknown">Chưa biết</option>
                  <option value="true">Có</option>
                  <option value="false">Không</option>
                </select>
              </label>
            ))}
          </div>
          {kind === 'insufficient' && (
            <>
              <label className="select-label">
                Dữ kiện còn thiếu
                <select value={requiredFact} onChange={(e) => setRequiredFact(e.target.value)}>
                  {Object.entries(factLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Câu hỏi cần bổ sung
                <input value={followUp} onChange={(e) => setFollowUp(e.target.value)} required />
              </label>
            </>
          )}
          <label>
            Mã gây nhiễu, cách nhau bằng dấu phẩy
            <input value={wrong} onChange={(e) => setWrong(e.target.value)} />
          </label>
          <label>
            Giải thích, nguồn và lý do loại đáp án nhiễu
            <textarea
              rows={4}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              required
            />
          </label>
          <button className="btn secondary" disabled={busy || !revisionId}>
            Lưu tình huống nháp
          </button>
        </form>
      </details>
      {scenarios.map((s) => (
        <article key={s.id}>
          <h3>{String(s.data.prompt ?? '')}</h3>
          <p>
            {s.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'} ·{' '}
            {tariffs.find((t) => t.id === s.tariffId)?.code ?? 'Chưa có tham chiếu'}
          </p>
          <details>
            <summary>Dữ kiện, đáp án và giải thích để duyệt</summary>
            <ul>
              {Object.entries((s.data.facts ?? {}) as Record<string, unknown>).map(([k, v]) => (
                <li key={k}>
                  {factLabels[k] ?? k}: {v === 'unknown' ? 'Chưa biết' : v ? 'Có' : 'Không'}
                </li>
              ))}
            </ul>
            <ul>
              {((s.data.options ?? []) as { label: string; correct: boolean }[]).map((o, i) => (
                <li key={i}>
                  {o.label}
                  {o.correct ? ' · Đáp án đúng' : ''}
                </li>
              ))}
            </ul>
            <p>{String(s.data.explanation ?? '')}</p>
          </details>
          <button
            className="btn secondary"
            disabled={busy || s.status === 'approved'}
            onClick={() => {
              if (
                confirm(
                  'Đã kiểm đủ dữ kiện, đáp án, câu hỏi còn thiếu và nguồn nghiệp vụ của hồ sơ này?',
                )
              )
                void act(`/admin/scenarios/${s.id}/approve`);
            }}
          >
            Duyệt hồ sơ HS
          </button>
        </article>
      ))}
      <p role="status">{message}</p>
    </section>
  );
}
