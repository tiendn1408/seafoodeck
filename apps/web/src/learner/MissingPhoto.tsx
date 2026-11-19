import './missing-photo.css';

/**
 * Honest stand-in for a species whose photo is still missing: a neutral silhouette and
 * "Ảnh đang bổ sung". Shared by the species card and the species cover. Its colours come
 * from `--missing-ink` / `--missing-hole` set by the surface it sits on.
 */
export function MissingPhoto() {
  return (
    <div className="missing-photo">
      <svg className="missing-photo-silhouette" viewBox="0 0 96 48" aria-hidden="true">
        <path d="M6 24c10-13 30-19 50-15 9 2 16 7 22 12l12-9-4 12 4 12-12-9c-6 5-13 10-22 12C36 43 16 37 6 24Z" />
        <circle cx="22" cy="21" r="2.4" />
      </svg>
      <span>Ảnh đang bổ sung</span>
    </div>
  );
}
