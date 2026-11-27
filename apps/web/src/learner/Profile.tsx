import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api, type CatalogItem } from '../pilot/api';
import { Pronunciation } from '../pilot/Media';
import { MachineVoice } from '../pilot/MachineVoice';
import type { VoiceKind } from '../pilot/speechVoice';
import { ErrorNote } from './ErrorNote';
import { SpeciesCover } from './SpeciesCover';
import './profile.css';

const languages: Record<string, { code: string; label: string }> = {
  vi: { code: 'VI', label: 'Tiếng Việt' },
  en: { code: 'EN', label: 'Tiếng Anh' },
  ja: { code: 'JP', label: 'Tiếng Nhật' },
  scientific: { code: 'LAT', label: 'Tên khoa học' },
};
const langAttr: Record<string, string> = { vi: 'vi', en: 'en', ja: 'ja', scientific: 'la' };

/**
 * Species profile: the "Ấn bản loài" cover on deep water, then a cold ice sheet with the
 * identification notes, reference product forms and, per name, its reading guide, audio
 * status and source.
 */
export function Profile({
  id,
  internal,
  canStudy,
  onStart,
}: {
  id: string;
  internal: boolean;
  /** False for viewers who only browse (managers): no study actions at all. */
  canStudy: boolean;
  onStart: (mode: string, id: string) => Promise<void>;
}) {
  const [item, setItem] = useState<CatalogItem | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api<CatalogItem>('/catalog/items/' + id)
      .then(setItem)
      .catch((e) => setError(e.message));
  }, [id]);
  if (error) return <ErrorNote message={error} />;
  if (!item)
    return (
      <p className="profile-loading" role="status">
        Đang tải hồ sơ…
      </p>
    );
  const audioFor = (kind: string) =>
    item.media.find(
      (m) => m.role === 'pronunciation' && m.nameKind === kind && (internal || m.approved),
    )?.id;
  return (
    <div className="profile">
      <a href="#library" className="profile-back">
        <ArrowLeft size={18} aria-hidden="true" />
        Về thư viện
      </a>
      <SpeciesCover item={item} reveal={{ names: true }} mode="profile" />
      <div className="profile-sheet">
        <section className="profile-facts" aria-labelledby="profile-identification">
          <div>
            <h2 id="profile-identification">Dấu hiệu nhận biết</h2>
            <p className="profile-prose">{item.identification || 'Chưa có mô tả được duyệt.'}</p>
            {item.note && <p className="profile-note">{item.note}</p>}
          </div>
          <div>
            <h2>Dạng hàng tham khảo</h2>
            {item.forms.length ? (
              <ul className="profile-forms">
                {item.forms.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : (
              <p className="profile-prose">Chưa có dữ liệu quy cách.</p>
            )}
            <p className="profile-meta">
              {item.group} · {item.sku}
            </p>
          </div>
        </section>
        <section className="profile-names" aria-labelledby="profile-names">
          <h2 id="profile-names">Cách đọc và nguồn tên gọi</h2>
          <ul>
            {item.names.map((n) => {
              const lang = languages[n.kind] ?? { code: n.kind.toUpperCase(), label: n.kind };
              const audio = n.kind !== 'vi' ? audioFor(n.kind) : undefined;
              return (
                <li key={n.kind} className="profile-name">
                  <p className="profile-name-lang">
                    <span className="profile-code" aria-hidden="true">
                      {lang.code}
                    </span>
                    {lang.label}
                  </p>
                  <h3 lang={langAttr[n.kind]}>
                    {n.kind === 'scientific' ? <i>{n.label}</i> : n.label}
                  </h3>
                  <p className="profile-reading">
                    {n.pronunciation || 'Hướng dẫn đọc đang bổ sung.'}
                  </p>
                  {n.kind !== 'vi' &&
                    (audio ? (
                      <Pronunciation id={audio} />
                    ) : (
                      <>
                        <p className="profile-audio-missing">Chưa có bản thu đã duyệt.</p>
                        {(n.kind === 'en' || n.kind === 'ja' || n.kind === 'scientific') && (
                          <MachineVoice
                            key={n.kind}
                            kind={n.kind satisfies VoiceKind}
                            label={n.label}
                          />
                        )}
                      </>
                    ))}
                  <details>
                    <summary>Nguồn tên gọi</summary>
                    <p>{n.source}</p>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
        {canStudy && (
          <div className="profile-actions">
            <button
              type="button"
              className="profile-primary"
              onClick={() => void onStart('flashcard', item.revisionId)}
            >
              Chỉ học flashcard · 3 thẻ
            </button>
            <a className="profile-secondary" href="#home">
              Xem HS theo dạng hàng
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
