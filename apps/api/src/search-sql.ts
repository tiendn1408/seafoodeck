import { Prisma } from './generated/prisma/client';
import { likePattern } from './overview';

/**
 * Revisions of one release whose Japanese trade name, kanji or an English alias contains the
 * query. The text is bound as a parameter, LIKE wildcards are escaped by `likePattern`, and
 * aliases are matched element by element (never the JSON text, so `"`, `,` or `[` match
 * nothing). A non-array `enAliases` is read as empty.
 */
export function alternateNameIdsSql(releaseId: string, query: string): Prisma.Sql {
  const like = likePattern(query);
  return Prisma.sql`
    SELECT r."id" FROM "Revision" r
    JOIN "ReleaseItem" ri ON ri."revisionId" = r."id"
    WHERE ri."releaseId" = ${releaseId}
      AND (
        r."data"->>'jaTrade' ILIKE ${like} ESCAPE '\\'
        OR r."data"->>'jaKanji' ILIKE ${like} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(r."data"->'enAliases') = 'array'
              THEN r."data"->'enAliases' ELSE '[]'::jsonb END
          ) a
          WHERE a ILIKE ${like} ESCAPE '\\'
        )
      )`;
}

/** Revisions of one release with no named group recorded (missing, null or unknown value). */
export function ungroupedIdsSql(releaseId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT r."id" FROM "Revision" r
    JOIN "ReleaseItem" ri ON ri."revisionId" = r."id"
    WHERE ri."releaseId" = ${releaseId}
      AND COALESCE(r."data"->>'taxonomicGroup', '') NOT IN ('fish', 'crustacean', 'mollusc', 'other')`;
}
