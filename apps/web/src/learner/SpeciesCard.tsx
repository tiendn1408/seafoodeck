import type { CSSProperties } from 'react';
import { SignedImage } from '../pilot/Media';
import { groupTone } from './haul';
import './species-card.css';

export type SpeciesCardItem = {
  revisionId: string;
  vi: string;
  scientific: string;
  taxonomicGroup: string | null | undefined;
  imageId: string | null;
};

/** Neutral silhouette for a species whose photo is still missing. */
function Silhouette() {
  return (
    <svg className="species-card-silhouette" viewBox="0 0 96 48" aria-hidden="true">
      <path d="M6 24c10-13 30-19 50-15 9 2 16 7 22 12l12-9-4 12 4 12-12-9c-6 5-13 10-22 12C36 43 16 37 6 24Z" />
      <circle cx="22" cy="21" r="2.4" />
    </svg>
  );
}

/**
 * A species as a card: photo shown whole (object-fit: contain), Vietnamese name, italic
 * scientific name and a group tag. The name is the link (stretched over the card) so the
 * photo's own retry button never ends up nested inside another control.
 */
export function SpeciesCard({
  item,
  variant,
  style,
}: {
  item: SpeciesCardItem;
  variant: 'float' | 'row' | 'tile';
  style?: CSSProperties;
}) {
  const tone = groupTone(item.taxonomicGroup);
  return (
    <article
      className={`species-card species-card--${variant}`}
      data-group={tone.key}
      style={
        {
          '--tone': tone.css,
          '--tone-ink': `var(--group-${tone.key}-ink)`,
          ...style,
        } as CSSProperties
      }
    >
      <div className="species-card-photo">
        {item.imageId ? (
          <SignedImage id={item.imageId} thumbnail />
        ) : (
          <div className="species-card-missing">
            <Silhouette />
            <span>Ảnh đang bổ sung</span>
          </div>
        )}
      </div>
      <div className="species-card-copy">
        <span className="species-card-tag">{tone.label}</span>
        <a className="species-card-name" href={'#profile/' + item.revisionId}>
          {item.vi}
        </a>
        <i className="species-card-sci" lang="la">
          {item.scientific}
        </i>
      </div>
    </article>
  );
}
