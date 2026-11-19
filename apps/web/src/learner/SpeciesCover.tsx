import type { CSSProperties, ReactNode } from 'react';
import { MediaCredit, SignedImage } from '../pilot/Media';
import type { CatalogItem } from '../pilot/api';
import { groupTone } from './haul';
import { MissingPhoto } from './MissingPhoto';
import './cover.css';

export type CoverMode = 'profile' | 'flashcard' | 'image';

const nameOf = (item: CatalogItem, kind: string) =>
  item.names.find((n) => n.kind === kind)?.label ?? '';
const pending = <span className="cover-pending">Đang bổ sung</span>;

/** The species photo used on covers: the profile or identification shot. */
export function coverPhoto(item: CatalogItem) {
  return item.media.find((m) => ['profile', 'identification'].includes(m.role)) ?? null;
}

function Row({ code, label, children }: { code: string; label: string; children: ReactNode }) {
  return (
    <div className="cover-row">
      <dt>
        <span className="cover-code" aria-hidden="true">
          {code}
        </span>
        <span className="cover-sr">{label}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * "Ấn bản loài": one species as a cover. The photo is shown whole (object-fit: contain) on a
 * dark frame with its credit; beside it (desktop) or below it (phone) the group tag, the
 * Vietnamese name as the page's h1 and the EN / JP / LAT rows like a table of contents.
 *
 * - `reveal.names=false` hides the three rows (flashcard answer side); in `mode="image"` it
 *   also hides the Vietnamese name, the group/family and the credit, leaving only the photo.
 * - `reveal.rows=false` reveals the name but keeps the three rows hidden (a study question
 *   whose species could not be resolved to a full catalogue entry).
 * - `photo` / `credit` replace the catalogue photo and its credit: a study question shows its
 *   own signed image, credited from the answer. The credit is hidden while masked.
 * - `rope` sits above the cover (session progress); `children` is the answer area under the
 *   names.
 */
export function SpeciesCover({
  item,
  reveal,
  mode,
  rope,
  photo: photoSlot,
  credit,
  children,
}: {
  item: CatalogItem;
  reveal: { names: boolean; rows?: boolean };
  mode: CoverMode;
  rope?: ReactNode;
  photo?: ReactNode;
  credit?: ReactNode;
  children?: ReactNode;
}) {
  const tone = groupTone(item.taxonomicGroup);
  const photo = coverPhoto(item);
  const vi = nameOf(item, 'vi') || item.sku;
  const masked = mode === 'image' && !reveal.names;
  const rows = reveal.names && reveal.rows !== false;
  const caption = masked
    ? null
    : photoSlot !== undefined
      ? credit
      : photo && <MediaCredit id={photo.id} />;
  const family = item.family
    ? item.familyVi
      ? `${item.family} (${item.familyVi})`
      : item.family
    : item.familyVi || '';
  const en = nameOf(item, 'en');
  const ja = nameOf(item, 'ja');
  const lat = nameOf(item, 'scientific');
  const aliases = (item.enAliases ?? []).filter((a) => a && a !== en);
  return (
    <article
      className="cover"
      data-mode={mode}
      data-group={tone.key}
      style={
        {
          '--tone': tone.css,
          '--tone-ink': `var(--group-${tone.key}-ink)`,
        } as CSSProperties
      }
    >
      {rope && <div className="cover-rope">{rope}</div>}
      <figure className="cover-frame">
        <div className="cover-photo">
          {photoSlot !== undefined ? (
            photoSlot
          ) : photo ? (
            <SignedImage id={photo.id} alt={masked ? 'Ảnh loài cần đoán' : vi} />
          ) : (
            <MissingPhoto />
          )}
        </div>
        {caption && <figcaption className="cover-credit">{caption}</figcaption>}
      </figure>
      <div className="cover-text">
        {!masked && (
          <p className="cover-tags">
            <span className="cover-group">{tone.label}</span>
            {family && <span className="cover-family">{family}</span>}
          </p>
        )}
        {!masked && <h1 className="cover-title">{vi}</h1>}
        {rows && (
          <dl className="cover-names">
            <Row code="EN" label="Tiếng Anh">
              {en ? (
                <span className="cover-name" lang="en">
                  {en}
                </span>
              ) : (
                pending
              )}
              {aliases.length > 0 && (
                <span className="cover-extra" lang="en">
                  {aliases.join(' · ')}
                </span>
              )}
            </Row>
            <Row code="JP" label="Tiếng Nhật">
              {ja ? (
                <span className="cover-name cover-ja" lang="ja">
                  {ja}
                  {item.jaKanji && <span className="cover-kanji">{item.jaKanji}</span>}
                </span>
              ) : (
                pending
              )}
              {item.jaTrade && (
                <span className="cover-extra">
                  tên thương mại{' '}
                  <span className="cover-ja" lang="ja">
                    {item.jaTrade}
                  </span>
                </span>
              )}
            </Row>
            <Row code="LAT" label="Tên khoa học">
              {lat ? (
                <i className="cover-name" lang="la">
                  {lat}
                </i>
              ) : (
                pending
              )}
            </Row>
          </dl>
        )}
        {children && <div className="cover-answer">{children}</div>}
      </div>
    </article>
  );
}
