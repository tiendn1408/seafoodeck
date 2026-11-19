import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternateNameIdsSql, ungroupedIdsSql } from './search-sql';

/** Postgres text ($1, $2…) with whitespace collapsed and none just inside parentheses. */
const flat = (q: { text: string }) =>
  q.text.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();

test('alternate-name search is parameterised and scoped to the release', () => {
  const q = alternateNameIdsSql('rel-1', 'Giant 50%_"[');
  const sql = flat(q);
  assert.match(sql, /JOIN "ReleaseItem" ri ON ri\."revisionId" = r\."id"/);
  assert.match(sql, /ri\."releaseId" = \$1/);
  assert.deepEqual(q.values, [
    'rel-1',
    '%Giant 50\\%\\_"[%',
    '%Giant 50\\%\\_"[%',
    '%Giant 50\\%\\_"[%',
  ]);
  // The user's text never lands in the SQL string itself.
  assert.ok(!sql.includes('Giant'));
});

test('alternate-name search matches alias elements, not the JSON text of the array', () => {
  const sql = flat(alternateNameIdsSql('rel-1', 'x'));
  assert.ok(!sql.includes('::text'), 'no cast of the whole JSON value to text');
  assert.match(
    sql,
    /EXISTS \(SELECT 1 FROM jsonb_array_elements_text\(CASE WHEN jsonb_typeof\(r\."data"->'enAliases'\) = 'array' THEN r\."data"->'enAliases' ELSE '\[\]'::jsonb END\) a WHERE a ILIKE \$4 ESCAPE '\\'\)/,
  );
  assert.match(sql, /r\."data"->>'jaTrade' ILIKE \$2 ESCAPE '\\'/);
  assert.match(sql, /r\."data"->>'jaKanji' ILIKE \$3 ESCAPE '\\'/);
  assert.equal((sql.match(/ESCAPE '\\'/g) ?? []).length, 3);
});

test('ungrouped ids are scoped to the release', () => {
  const q = ungroupedIdsSql('rel-2');
  const sql = flat(q);
  assert.match(sql, /JOIN "ReleaseItem" ri ON ri\."revisionId" = r\."id"/);
  assert.match(sql, /ri\."releaseId" = \$1/);
  assert.match(
    sql,
    /COALESCE\(r\."data"->>'taxonomicGroup', ''\) NOT IN \('fish', 'crustacean', 'mollusc', 'other'\)/,
  );
  assert.deepEqual(q.values, ['rel-2']);
});
