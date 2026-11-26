import { useEffect, useState } from 'react';
import { extraRows } from './itemExtras';
import { api, type CatalogItem } from '@web/pilot/api';
import { SignedImage, Pronunciation } from '@web/pilot/Media';
import { HsAdmin, type AdminTariff } from './HsAdmin';
import './admin.css';
interface Revision {
  id: string;
  version: number;
  status: string;
  data: Record<string, unknown>;
  names: CatalogItem['names'];
  media: {
    asset: {
      id: string;
      role: string;
      nameKind: string | null;
      status: string;
      aiGenerated: boolean;
      metadata: Record<string, unknown>;
      revokedAt: string | null;
    };
  }[];
}
interface Overview {
  revisionTotal: number;
  tariffs: AdminTariff[];
  revisions: Revision[];
  releases: { id: string; internal: boolean; items: { revisionId: string }[] }[];
  scenarios: {
    id: string;
    status: string;
    data: Record<string, unknown>;
    tariffId: string | null;
  }[];
  audit: { id: string; action: string; at: string; targetId: string }[];
}
export function Admin() {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<{
      count: number;
      errors: { row: number; message: string }[];
    } | null>(null),
    [revisionQuery, setRevisionQuery] = useState(''),
    [selected, setSelected] = useState(''),
    [edit, setEdit] = useState(''),
    [busy, setBusy] = useState(false),
    [checked, setChecked] = useState<string[]>([]);
  const refresh = () =>
    api<Overview>('/admin/overview?q=' + encodeURIComponent(revisionQuery))
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
  }, []);
  async function act(path: string, body: unknown = {}) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(path, body);
      setMessage('Đã lưu.');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const revision = data?.revisions.find((r) => r.id === selected);
  const extras = extraRows(revision?.data);
  return (
    <div className="pilot-admin">
      <h1>Biên tập và xuất bản</h1>
      <p>
        Nội dung nháp không tự xuất hiện cho người học. Duyệt nội dung và quyền media là hai việc
        riêng.
      </p>
      {error && (
        <div role="alert" className="notice">
          {error}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <section>
        <h2>Nhập danh mục CSV</h2>
        <p>
          UTF-8, tối đa 2 MiB / 2.000 dòng. Xem lỗi trước khi nhập; có lỗi thì không ghi dòng nào.
        </p>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void api<{ csv: string }>('/admin/csv-template')
              .then((d) => {
                setCsv(d.csv);
                setPreview(null);
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Lấy mẫu CSV
        </button>
        <label>
          Chọn file CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 2097152) {
                setError('CSV tối đa 2 MiB.');
                return;
              }
              void file.text().then((text) => {
                setCsv(text);
                setPreview(null);
              });
            }}
          />
        </label>
        <label>
          Nội dung CSV
          <textarea
            rows={7}
            disabled={busy}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        <div className="pilot-actions">
          <button
            className="btn secondary"
            disabled={busy || !csv}
            onClick={() => {
              setError('');
              setBusy(true);
              void api<{ count: number; errors: { row: number; message: string }[] }>(
                '/admin/import/preview',
                { csv },
              )
                .then(setPreview)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Xem trước lỗi
          </button>
          <button
            className="btn primary"
            disabled={busy || !preview || preview.errors.length > 0}
            onClick={() => void act('/admin/import', { csv })}
          >
            Nhập nháp
          </button>
        </div>
        {preview && (
          <div role="status">
            <p>
              {preview.count} dòng · {preview.errors.length} lỗi
            </p>
            <ul>
              {preview.errors.map((e) => (
                <li key={e.row}>
                  Dòng {e.row}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section>
        <h2>Revision và media</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSelected('');
            setBusy(true);
            void refresh().finally(() => setBusy(false));
          }}
        >
          <label>
            Tìm revision theo ID hoặc tên
            <input
              type="search"
              maxLength={100}
              value={revisionQuery}
              disabled={busy}
              onChange={(event) => setRevisionQuery(event.target.value)}
            />
          </label>
          <button className="btn secondary" disabled={busy}>
            Tìm revision
          </button>
        </form>
        <p>
          {data?.revisionTotal ?? 0} revision · Hiện tối đa 100 bản mới nhất, dùng tìm kiếm để mở
          bản cũ.
        </p>
        <label className="select-label">
          Chọn revision
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              const r = data?.revisions.find((r) => r.id === e.target.value);
              setEdit(r ? JSON.stringify(r.data, null, 2) : '');
            }}
          >
            <option value="">Chọn mục</option>
            {data?.revisions.map((r) => (
              <option key={r.id} value={r.id}>
                {String(r.data.vi)} · v{r.version} · {r.status}
              </option>
            ))}
          </select>
        </label>
        {revision && (
          <>
            <div className="pilot-edit-fields">
              {(
                [
                  ['vi', 'Tên Việt'],
                  ['en', 'Tên Anh'],
                  ['ja', 'Tên Nhật'],
                  ['scientific', 'Tên khoa học (để trống nếu chưa rõ)'],
                  ['sku', 'Mã SKU'],
                  ['group', 'Nhóm thương mại'],
                  ['source', 'Nguồn tên gọi'],
                  ['identification', 'Dấu hiệu nhận biết'],
                  ['note', 'Lưu ý thương mại'],
                ] as const
              ).map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input
                    value={String((edit ? JSON.parse(edit) : {})[field] ?? '')}
                    onChange={(e) =>
                      setEdit(JSON.stringify({ ...JSON.parse(edit), [field]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <label>
                Bí danh tìm kiếm, cách nhau bằng dấu |
                <input
                  value={(JSON.parse(edit || '{}').aliases ?? []).join(' | ')}
                  onChange={(e) =>
                    setEdit(
                      JSON.stringify({
                        ...JSON.parse(edit),
                        aliases: e.target.value
                          .split('|')
                          .map((v) => v.trim())
                          .filter(Boolean),
                      }),
                    )
                  }
                />
              </label>
              <label>
                Dạng hàng, cách nhau bằng dấu |
                <input
                  value={(JSON.parse(edit || '{}').forms ?? []).join(' | ')}
                  onChange={(e) =>
                    setEdit(
                      JSON.stringify({
                        ...JSON.parse(edit),
                        forms: e.target.value
                          .split('|')
                          .map((v) => v.trim())
                          .filter(Boolean),
                      }),
                    )
                  }
                />
              </label>
              {(
                [
                  ['en', 'Hướng dẫn đọc Anh / IPA theo giọng'],
                  ['ja', 'Kana / romaji Nhật'],
                  ['scientific', 'Quy ước đọc tên khoa học'],
                ] as const
              ).map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input
                    value={String(JSON.parse(edit || '{}').pronunciation?.[field] ?? '')}
                    onChange={(e) => {
                      const data = JSON.parse(edit);
                      setEdit(
                        JSON.stringify({
                          ...data,
                          pronunciation: { ...data.pronunciation, [field]: e.target.value },
                        }),
                      );
                    }}
                  />
                </label>
              ))}
            </div>
            {extras.length > 0 && (
              <dl className="pilot-extra-fields">
                {extras.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>
                      {row.value}
                      {row.unsourced && (
                        <small className="pilot-unsourced">
                          {' '}
                          Chưa có nguồn — không hiển thị cho người học
                        </small>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => {
                try {
                  void act('/admin/items', { item: JSON.parse(edit) });
                } catch {
                  setError('JSON chưa hợp lệ.');
                }
              }}
            >
              Lưu revision nháp mới
            </button>
            <div className="pilot-actions">
              <button
                className="btn secondary"
                disabled={busy || revision.status !== 'draft'}
                onClick={() => void act(`/admin/revisions/${revision.id}/submit`)}
              >
                Gửi duyệt
              </button>
              <button
                className="btn secondary"
                disabled={busy || revision.status !== 'review'}
                onClick={() => void act(`/admin/revisions/${revision.id}/approve`)}
              >
                Duyệt nội dung
              </button>
            </div>
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => void act(`/admin/revisions/${revision.id}/clone`)}
            >
              Tạo nháp mới để thay ảnh/audio
            </button>
            <Upload
              revisionId={revision.id}
              disabled={revision.status !== 'draft'}
              onUploaded={refresh}
            />
            <div className="pilot-admin-media">
              {revision.media.map(({ asset: a }) => (
                <article key={a.id}>
                  {a.role === 'pronunciation' ? (
                    <Pronunciation id={a.id} />
                  ) : (
                    <SignedImage id={a.id} thumbnail />
                  )}
                  <p>
                    {a.role} · {a.nameKind} · {a.status}
                    {a.revokedAt ? ' · Đã thu hồi' : ''}
                  </p>
                  <p>
                    {String(a.metadata.credit ?? '')} · {String(a.metadata.rights ?? '')}
                  </p>
                  <details>
                    <summary>Nguồn</summary>
                    {String(a.metadata.source ?? '')}
                  </details>
                  <button
                    className="btn secondary"
                    disabled={busy || !!a.revokedAt || a.status === 'approved'}
                    onClick={() => {
                      if (
                        confirm(
                          a.role === 'identification'
                            ? 'Xác nhận đã đối chiếu đúng loài, đủ dấu hiệu nhận diện và quyền sử dụng cho bài chấm điểm?'
                            : 'Xác nhận đã kiểm nội dung và quyền sử dụng media?',
                        )
                      )
                        void act(`/admin/media/${a.id}/approve`, {
                          confirmIdentification: a.role === 'identification',
                        });
                    }}
                  >
                    Duyệt media
                  </button>
                  <button
                    className="btn secondary"
                    disabled={busy || !!a.revokedAt}
                    onClick={() => {
                      if (
                        confirm(
                          'Thu hồi media này? Phiên cũ sẽ bỏ qua không phạt, URL đã ký còn sống đến khi hết TTL.',
                        )
                      )
                        void act(`/admin/media/${a.id}/revoke`);
                    }}
                  >
                    Thu hồi
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      <section>
        <h2>Xuất bản một bộ revision</h2>
        <p>
          Chọn tối đa một revision mỗi mục. Bộ public phải qua cổng tên, ảnh identification và HS;
          không tự coi seed nội bộ là đã duyệt.
        </p>
        <div className="pilot-release-items">
          {data?.revisions.map((r) => (
            <label key={r.id}>
              <input
                type="checkbox"
                checked={checked.includes(r.id)}
                onChange={(e) =>
                  setChecked(
                    e.target.checked ? [...checked, r.id] : checked.filter((id) => id !== r.id),
                  )
                }
              />
              {String(r.data.vi)} · v{r.version} · {r.status}
            </label>
          ))}
        </div>
        <div className="pilot-actions">
          <button
            className="btn primary"
            disabled={busy || !checked.length}
            onClick={() => void act('/admin/releases', { revisionIds: checked, internal: false })}
          >
            Xuất bản bộ đã duyệt
          </button>
          <button
            className="btn secondary"
            disabled={busy || !checked.length}
            onClick={() => {
              if (
                confirm(
                  'Chỉ xuất bản cho phạm vi kỹ thuật nội bộ, không đánh dấu nội dung đã duyệt?',
                )
              )
                void act('/admin/releases', { revisionIds: checked, internal: true });
            }}
          >
            Xuất bản thử nội bộ
          </button>
        </div>
        <h3>Lịch sử release</h3>
        {data?.releases.map((r) => (
          <p key={r.id}>
            {r.id.slice(0, 8)} · {r.internal ? 'Nội bộ' : 'Đã duyệt'} · {r.items.length} mục{' '}
            <button
              className="pilot-text-button"
              disabled={busy}
              onClick={() => {
                if (confirm('Đổi bộ hiện hành về release này? Phiên đang chơi vẫn pin đề cũ.'))
                  void act(`/admin/releases/${r.id}/rollback`);
              }}
            >
              Quay về bộ này
            </button>
          </p>
        ))}
      </section>
      <HsAdmin
        revisionId={revision?.id}
        tariffs={data?.tariffs ?? []}
        scenarios={data?.scenarios ?? []}
        refresh={refresh}
      />
      <section>
        <h2>Nhật ký thay đổi</h2>
        {data?.audit.map((a) => (
          <p key={a.id}>
            {new Date(a.at).toLocaleString('vi-VN')} · {a.action} · {a.targetId.slice(0, 8)}
          </p>
        ))}
      </section>
    </div>
  );
}
function Upload({
  revisionId,
  disabled,
  onUploaded,
}: {
  revisionId: string;
  disabled: boolean;
  onUploaded: () => Promise<unknown>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [role, setRole] = useState('profile'),
    [kind, setKind] = useState('en'),
    [source, setSource] = useState(''),
    [credit, setCredit] = useState(''),
    [rights, setRights] = useState(''),
    [ai, setAi] = useState(false),
    [originalId, setOriginalId] = useState(''),
    [locale, setLocale] = useState(''),
    [voice, setVoice] = useState(''),
    [spokenLabel, setSpokenLabel] = useState(''),
    [readingConvention, setReadingConvention] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <form
      className="pilot-upload"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        setMessage('');
        const body = new FormData();
        body.append('file', file);
        body.append('source', source);
        body.append('credit', credit);
        body.append('rights', rights);
        body.append('role', role);
        body.append('aiGenerated', String(ai));
        if (originalId) body.append('originalImageId', originalId);
        if (role === 'pronunciation') {
          body.append('nameKind', kind);
          body.append('locale', locale);
          body.append('voice', voice);
          body.append('spokenLabel', spokenLabel);
          body.append('readingConvention', readingConvention);
        }
        void api(`/admin/revisions/${revisionId}/media`, body)
          .then(() => {
            setMessage('Đã upload nháp, chưa duyệt.');
            return onUploaded();
          })
          .catch((e) => setMessage(e.message))
          .finally(() => setBusy(false));
      }}
    >
      <h3>Thêm ảnh / bản thu vào nháp</h3>
      <fieldset disabled={disabled || busy}>
        <label>
          File
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,audio/mpeg"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="select-label">
          Vai trò
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="profile">Ảnh hồ sơ</option>
            <option value="identification">Ảnh nhận diện chấm điểm</option>
            <option value="product">Ảnh dạng hàng</option>
            <option value="pronunciation">Bản thu phát âm</option>
            <option value="illustration">Minh họa</option>
          </select>
        </label>
        {role === 'pronunciation' && (
          <label className="select-label">
            Ngôn ngữ
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="en">Anh</option>
              <option value="ja">Nhật</option>
              <option value="scientific">Khoa học</option>
            </select>
          </label>
        )}
        {role === 'identification' && (
          <label>
            ID ảnh gốc (giữ cùng ID cho các crop của cùng ảnh)
            <input required value={originalId} onChange={(e) => setOriginalId(e.target.value)} />
          </label>
        )}
        {role === 'pronunciation' && (
          <>
            <label>
              Tên được đọc trong bản thu
              <input
                value={spokenLabel}
                onChange={(e) => setSpokenLabel(e.target.value)}
                required
              />
            </label>
            <label>
              Ngôn ngữ / vùng giọng (ví dụ en-US, ja-JP)
              <input value={locale} onChange={(e) => setLocale(e.target.value)} required />
            </label>
            <label>
              Người đọc / giọng đọc
              <input value={voice} onChange={(e) => setVoice(e.target.value)} required />
            </label>
            {kind === 'scientific' && (
              <label>
                Quy ước đọc tên khoa học của bộ
                <textarea
                  value={readingConvention}
                  onChange={(e) => setReadingConvention(e.target.value)}
                  required
                />
              </label>
            )}
          </>
        )}
        <label>
          Nguồn / bằng chứng
          <input required value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        <label>
          Tác giả / credit
          <input required value={credit} onChange={(e) => setCredit(e.target.value)} />
        </label>
        <label>
          Quyền sử dụng
          <input required value={rights} onChange={(e) => setRights(e.target.value)} />
        </label>
        <label>
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
          Do AI tạo
        </label>
        <button className="btn secondary" type="submit">
          Upload nháp
        </button>
      </fieldset>
      <p role="status">{message}</p>
    </form>
  );
}
