import { withPage, withQuery, withTaxon, type LibraryView } from './libraryView';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, vi, type CatalogItem, type CatalogPage, type MeMastery } from '../pilot/api';
import { ErrorNote } from './ErrorNote';
import { MasteryScales, type MasteryLevel } from './MasteryScales';
import { SpeciesCard } from './SpeciesCard';
import { coverPhoto } from './SpeciesCover';
import { groupTone } from './groups';
import { groupSections, libraryPath } from './shelves';
import type { Taxon } from './Home';
import { useMedia } from './useMedia';
import { useOverview } from './useOverview';
import './library.css';

const taxa: Taxon[] = ['fish', 'crustacean', 'mollusc', 'other'];
const nameOf = (item: CatalogItem, kind: string) =>
  item.names.find((n) => n.kind === kind)?.label ?? '';

function Names({ item }: { item: CatalogItem }) {
  const en = nameOf(item, 'en'),
    ja = nameOf(item, 'ja');
  if (!en && !ja) return null;
  return (
    <span className="library-trade">
      {en && <span lang="en">{en}</span>}
      {en && ja && ' · '}
      {ja && <span lang="ja">{ja}</span>}
    </span>
  );
}

function Entry({
  item,
  variant,
  level,
}: {
  item: CatalogItem;
  variant: 'row' | 'tile';
  level: MasteryLevel | null;
}) {
  return (
    <li className="library-card">
      <SpeciesCard
        variant={variant}
        href={'#profile/' + item.externalId}
        item={{
          revisionId: item.revisionId,
          vi: vi(item),
          scientific: nameOf(item, 'scientific'),
          taxonomicGroup: item.taxonomicGroup,
          imageId: coverPhoto(item)?.id ?? null,
        }}
        sub={<Names item={item} />}
        aside={level === null ? undefined : <MasteryScales level={level} />}
      />
    </li>
  );
}

/**
 * One page of species. Phone: a compact list in group sections with coloured headers.
 * Desktop: a tile grid, each tile carrying its own group colour bar.
 */
export function LibraryResults({
  items,
  wide,
  levelOf,
}: {
  items: CatalogItem[];
  wide: boolean;
  /** Null for kinds without a learning record: no scales, no legend. */
  levelOf: ((revisionId: string) => MasteryLevel) | null;
}) {
  if (wide)
    return (
      <ul className="library-grid">
        {items.map((i) => (
          <Entry
            key={i.revisionId}
            item={i}
            variant="tile"
            level={levelOf ? levelOf(i.revisionId) : null}
          />
        ))}
      </ul>
    );
  return (
    <div className="library-sections">
      {groupSections(items).map((s) => (
        <section
          key={s.key}
          className="library-section"
          aria-label={`${s.label}, ${s.items.length} loài`}
          style={{ '--tone': groupTone(s.key).css } as CSSProperties}
        >
          <h2 className="library-section-head">
            <span className="library-swatch" aria-hidden="true" />
            {s.label}
            <span className="library-section-count">{s.items.length}</span>
            {levelOf && (
              <span className="library-section-legend" aria-hidden="true">
                Mức nhớ
              </span>
            )}
          </h2>
          <ul className="library-list">
            {s.items.map((i) => (
              <Entry
                key={i.revisionId}
                item={i}
                variant="row"
                level={levelOf ? levelOf(i.revisionId) : null}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * "Tất cả" plus the four group chips. Counts come from the list response (taxon ignored), so a
 * chip's number is the total its list shows; before the first response the chips carry none.
 */
export function GroupChips({
  taxon,
  groups,
  onChoose,
}: {
  taxon: Taxon | '';
  groups: CatalogPage['groups'];
  onChoose: (taxon: Taxon | '') => void;
}) {
  const all = groups
    ? groups.fish + groups.crustacean + groups.mollusc + groups.other + groups.none
    : null;
  return (
    <div className="library-chips" role="group" aria-label="Lọc theo nhóm">
      <button
        type="button"
        className="library-chip"
        aria-pressed={taxon === ''}
        onClick={() => onChoose('')}
      >
        Tất cả
        {all !== null && <span className="library-chip-count">{all}</span>}
      </button>
      {taxa.map((t) => {
        const tone = groupTone(t);
        return (
          <button
            type="button"
            key={t}
            className="library-chip"
            aria-pressed={taxon === t}
            style={{ '--tone': tone.css } as CSSProperties}
            onClick={() => onChoose(t)}
          >
            <span className="library-swatch" aria-hidden="true" />
            {tone.label}
            {groups && <span className="library-chip-count">{groups[t]}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Library({
  view,
  onView,
  mastery,
  onVersion,
}: {
  /** Search, group and page, kept by the app so a profile visit and back restores them. */
  view: LibraryView;
  onView: (view: LibraryView) => void;
  /** Server mastery per catalog item; null (trial, manager, staff) shows no memory levels. */
  mastery: MeMastery | null;
  onVersion: (releaseId: string) => void;
}) {
  const { overview } = useOverview(onVersion);
  const { query, taxon, page } = view;
  const wide = useMedia('(min-width: 900px)');
  const [data, setData] = useState<CatalogPage | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([page, query, taxon, retry]);
  const [loadedKey, setLoadedKey] = useState('');
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = new AbortController();
    const timer = setTimeout(() => {
      api<CatalogPage>(libraryPath(page, query, taxon), undefined, c.signal)
        .then((d) => {
          setData(d);
          setError('');
          setLoadedKey(requestKey);
          onVersion(d.releaseId);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') {
            setError(e.message);
            setLoadedKey(requestKey);
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [page, query, taxon, retry, onVersion, requestKey]);

  const itemIds = new Map(overview?.items.map((i) => [i.revisionId, i.itemId]));
  const levelOf = mastery
    ? (revisionId: string): MasteryLevel => {
        const id = itemIds.get(revisionId);
        return (id && mastery[id]?.level) || 0;
      }
    : null;
  const loading = loadedKey !== requestKey;
  // The neutral "Chưa phân nhóm" tag is said once here, not on every tile.
  const ungrouped =
    data?.items.filter((i) => groupTone(i.taxonomicGroup).key === 'none').length ?? 0;
  const failed = !loading && !!error;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  function turn(next: number) {
    onView(withPage(view, next));
    top.current?.scrollIntoView({ block: 'start' });
  }
  function choose(next: Taxon | '') {
    onView(withTaxon(view, next));
  }

  return (
    <section className="ice-page library" aria-labelledby="library-title">
      <header className="ice-head">
        <h1 id="library-title">Thư viện loài</h1>
        <p className="ice-lede">
          Tra bốn tên gọi của từng loài thương mại: Việt, Anh, Nhật và khoa học.
        </p>
      </header>
      <div className="library-tools" ref={top}>
        <label className="library-search">
          <Search size={20} aria-hidden="true" />
          <input
            type="search"
            aria-label="Tìm loài theo bốn tên gọi"
            value={query}
            onChange={(e) => onView(withQuery(view, e.target.value))}
            placeholder="Tên Việt, Anh, Nhật, khoa học…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <GroupChips taxon={taxon} groups={data?.groups} onChoose={choose} />
      </div>

      {failed ? (
        <ErrorNote message={error} retry={() => setRetry(retry + 1)} />
      ) : !data ? (
        <p className="ice-status" role="status">
          Đang tải danh mục…
        </p>
      ) : (
        <div className="library-results" aria-busy={loading}>
          <p className="library-count" role="status">
            {data.total} mục · Trang {data.page} / {pages}
            {wide && ungrouped > 0 && (
              <span className="library-ungrouped">
                <span className="library-swatch" aria-hidden="true" />
                {ungrouped === data.items.length
                  ? 'Cả trang chưa phân nhóm'
                  : `${ungrouped} loài trên trang chưa phân nhóm`}
              </span>
            )}
            {loading && <span className="library-loading"> · đang tải…</span>}
          </p>
          {data.items.length ? (
            <LibraryResults items={data.items} wide={wide} levelOf={levelOf} />
          ) : (
            <div className="ice-empty">
              <h2>Không tìm thấy loài phù hợp</h2>
              <p>
                {query
                  ? `Không có loài nào khớp “${query}”${taxon ? ` trong nhóm ${groupTone(taxon).label}` : ''}. Thử tên khác hoặc bí danh thương mại.`
                  : taxon
                    ? `Nhóm ${groupTone(taxon).label} chưa có loài nào được gắn nhóm trong bộ đang xuất bản.`
                    : 'Bộ đang xuất bản chưa có loài nào.'}
              </p>
              {taxon && (
                <button type="button" className="ice-secondary" onClick={() => choose('')}>
                  Xem tất cả nhóm
                </button>
              )}
            </div>
          )}
          {data.total > data.limit && (
            <nav className="library-pages" aria-label="Phân trang">
              <button
                type="button"
                className="ice-secondary"
                disabled={page === 1}
                onClick={() => turn(page - 1)}
              >
                <ChevronLeft size={18} aria-hidden="true" />
                Trang trước
              </button>
              <button
                type="button"
                className="ice-secondary"
                disabled={page * data.limit >= data.total}
                onClick={() => turn(page + 1)}
              >
                Trang sau
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
