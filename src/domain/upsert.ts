/**
 * The import path's merge rule.
 *
 * Extracted from public/js/app.core.js during the Vue migration (Phase 0).
 *
 * `upsertByKey` MUTATES the collection it is given — pushing inserts onto it
 * and writing updates into the existing objects — and returns a summary. That
 * is what the original did, and every caller relies on it, so it is preserved
 * rather than tidied into a pure return. Changing it would be a behavioural
 * change, which Phase 0 does not make.
 *
 * photoOrPlaceholder stays in app.core.js: it resolves to two silhouette
 * data-URI constants defined there, and moving it would drag them along.
 */

export interface UpsertResult { toPersist: any[]; updated: number; inserted: number }

export function upsertByKey(
  collection: any[], incoming: any[],
  keyOf: (rec: any) => any, defaults?: Record<string, any>
): UpsertResult {
  const norm = (v: any) => String(v == null ? '' : v).trim().toLowerCase();
  const blank = (v: any) => v == null || (typeof v === 'string' && v.trim() === '');
  const isPlainObject = (v: any) =>
    v != null && typeof v === 'object' && !Array.isArray(v);
  const keyFor = (rec: any) => {
    const k = keyOf(rec);
    return Array.isArray(k) ? k.map(norm).join('|') : norm(k);
  };
  const applyDefaults = (row: any) => {
    if (defaults) {
      for (const [prop, v] of Object.entries(defaults)) {
        if (row[prop] === undefined) {
          // Clone plain-object/array defaults so every inserted row gets its
          // own copy — otherwise every record inserted in one import shares
          // the same object reference, and one in-place edit silently
          // changes several records at once.
          row[prop] = (v != null && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
        }
      }
    }
    return row;
  };

  const index = new Map<string, number>();
  collection.forEach((existing, i) => {
    const k = keyFor(existing);
    if (k && k.replace(/\|/g, '')) index.set(k, i);
  });

  const toPersist: any[] = [];
  let updated = 0, inserted = 0;

  for (const row of incoming) {
    const k = keyFor(row);
    if (!k || !k.replace(/\|/g, '')) {
      // Blank key: can't match an existing record, and must not be indexed —
      // indexing it would make every later blank-key row merge into this one.
      applyDefaults(row);
      collection.push(row);
      toPersist.push(row);
      inserted++;
      continue;
    }
    const idx = index.get(k);
    if (idx === undefined) {
      applyDefaults(row);
      collection.push(row);
      index.set(k, collection.length - 1);
      toPersist.push(row);
      inserted++;
      continue;
    }
    const target = collection[idx];
    for (const [prop, v] of Object.entries(row)) {
      if (prop === 'id' || blank(v)) continue;   // never let an import rewrite the id
      if (isPlainObject(v) && isPlainObject(target[prop])) {
        // Merge one level deep so stored keys the sheet doesn't mention
        // (e.g. seasonStats.games) survive instead of being wiped by a
        // wholesale replacement.
        const merged = { ...target[prop] };
        for (const [mk, mv] of Object.entries(v)) {
          if (!blank(mv)) merged[mk] = mv;
        }
        target[prop] = merged;
      } else {
        target[prop] = v;
      }
    }
    toPersist.push(target);
    updated++;
  }

  return { toPersist, updated, inserted };
}

/** Records identified by a single name column: players, coaches, drills, profiles. */
export function upsertByName(
  collection: any[], incoming: any[], defaults?: Record<string, any>
): UpsertResult {
  return upsertByKey(collection, incoming, (r) => (r ? r.name : ''), defaults);
}

/**
 * Fixtures are identified by when they kick off, not by opponent — a season
 * can meet the same opponent home and away.
 */
export function upsertByDateTime(
  collection: any[], incoming: any[], defaults?: Record<string, any>
): UpsertResult {
  return upsertByKey(collection, incoming, (r) => (r ? [r.date, r.time] : ['', '']), defaults);
}

/**
 * How the active team should be named in page headings.
 *
 * Every heading used to be hardcoded to Beaumont Varsity, so a coach looking
 * at a club U16 roster read "BEAUMONT COUGARS ROSTER / 2026 Varsity Boys
 * Soccer Squad". The switcher groups by organization precisely because that
 * distinction matters, and then the heading contradicted it.
 *
 * Falls back to the school record when no team is resolved, so a signed-out
 * visitor mid-load never sees an empty heading.
 */
export function activeTeamLabel(
  teams: any[], school: any, activeTeamId: string
): { org: string; team: string; season: string } {
  const t = (teams || []).find(x => x.id === activeTeamId);
  const fallbackOrg = school?.name || 'Beaumont High School';
  if (!t) return { org: fallbackOrg, team: '', season: '' };
  return {
    org: t.school_name || fallbackOrg,
    team: t.name || '',
    season: t.season || ''
  };
}
