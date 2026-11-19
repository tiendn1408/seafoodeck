import type { CSSProperties } from 'react';
import { SignedImage } from '../pilot/Media';
import { groupTone } from './haul';
import { MissingPhoto } from './MissingPhoto';
import './species-card.css';

export type SpeciesCardItem = {
  revisionId: string;
  vi: string;
  scientific: string;
  taxonomicGroup: string | null | undefined;
  imageId: string | null;
};

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
        {item.imageId ? <SignedImage id={item.imageId} thumbnail /> : <MissingPhoto />}
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
