/**
 * Reading a spreadsheet somebody else made.
 *
 * Extracted from public/js/admin.js during the Vue migration (Phase 0).
 */

/**
 * CSV to objects, keyed by the header row.
 *
 * Hand-rolled rather than split(',') because the schedules coaches paste in
 * carry quoted opponents with commas in them, and a naive split turns one
 * fixture into two half-fixtures.
 */
export function parseCsvText(text: string): Record<string, string>[] {
  let src = String(text || '');
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }   // "" is one literal quote
        else quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  if (rows.length === 0) return [];

  const headers = rows[0].map(h => String(h).trim());
  return rows.slice(1)
    // A trailing newline leaves one empty cell behind; that is not a record.
    .filter(r => r.some(v => String(v).trim() !== ''))
    .map(r => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (r[i] === undefined ? '' : String(r[i]).trim()); });
      return obj;
    });
}

/**
 * A value from whichever column the sheet happened to call it.
 *
 * BOTH sides are normalised. Only the row's key used to be, so an alias
 * list written the way the column is spelled in the sheet — ['Opponent']
 * rather than ['opponent'] — matched nothing and every row silently lost
 * that column. Nothing about the signature said which form was expected,
 * and the first caller to guess wrong lost an entire import.
 */
export function pickColumn(row: Record<string, any>, aliases: string[]): any {
  const norm = (k: any) => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = (aliases || []).map(norm);
  for (const key of Object.keys(row || {})) {
    if (wanted.indexOf(norm(key)) !== -1) {
      const v = row[key];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
  }
  return undefined;
}

export function compareMatrixPlayers(a: any, b: any, by: string): number {
  if (by === 'name') {
    // By SURNAME, the way a team sheet reads. Sorting on the full name puts
    // "Ashton Lanza" before "Cesar Alva", which is alphabetical by first
    // name and not how anyone looks a player up.
    const la = String(a.lastName || a.name || '');
    const lb = String(b.lastName || b.name || '');
    const cmp = la.localeCompare(lb);
    return cmp !== 0 ? cmp : String(a.name || '').localeCompare(String(b.name || ''));
  }
  const na = a.recordingNumber == null ? NaN : Number(a.recordingNumber);
  const nb = b.recordingNumber == null ? NaN : Number(b.recordingNumber);
  const ga = Number.isFinite(na), gb = Number.isFinite(nb);
  if (ga !== gb) return ga ? -1 : 1;
  if (ga && na !== nb) return na - nb;
  return String(a.name || '').localeCompare(String(b.name || ''));
}
