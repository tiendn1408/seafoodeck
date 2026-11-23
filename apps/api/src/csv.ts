/** Pure CSV helpers. Cells that a spreadsheet could read as a formula get a leading quote. */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  // Formula starters, and any C0 control character (tab, CR, LF, NUL…) a spreadsheet may skip
  // before reading the rest as a formula.
  if (typeof value === 'string' && /^[=+\-@\x00-\x1f]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const minuteParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
/** An ISO instant as Ho Chi Minh wall time, "yyyy-mm-dd HH:mm" (what the pilot team reads). */
export function localMinute(iso: string | null): string | null {
  if (iso === null) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const p = Object.fromEntries(minuteParts.formatToParts(t).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
