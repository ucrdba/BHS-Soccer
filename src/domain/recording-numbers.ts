/**
 * Recording numbers.
 *
 * Extracted from public/js/views/recording-numbers.view.js during the Vue
 * migration (Phase 0).
 *
 * These functions PROPOSE and never apply. A recording number is assigned by
 * the coach in a block per squad, and it is what the paper sheets carry
 * through a season, so a number that changed on its own would silently
 * disagree with every sheet already written. Nothing here writes to a player;
 * the view takes the proposal and the coach confirms it.
 */

export function rosterForNumbering(players: any[]): any[] {
  return (players || []).filter(p => !p.is_deleted && !p.isDeleted);
}

/**
 * Where a fresh block should start.
 *
 * The lowest number already in use, so re-running the proposal over a squad
 * that has been numbered lands on the same block rather than shifting it.
 */
export function suggestedNumberStart(roster: any[]): number {
  const nums = rosterForNumbering(roster)
    .map(p => p.recordingNumber).filter(n => n != null).map(Number);
  if (nums.length) return Math.min(...nums);
  return 1;
}

/**
 * A number for everyone who has none, in surname order.
 *
 * Anyone already numbered keeps their number untouched — that is the whole
 * point — and the proposal fills the gaps around them.
 */
export function proposeRecordingNumbers(players: any[], startAt: number): Map<string, number> {
  const taken = new Set(
    players.map(p => p.recordingNumber).filter(n => n != null).map(Number)
  );

  const bySurname = players.slice().sort((a, b) => {
    const sa = String(a.lastName || a.name || '').toLowerCase();
    const sb = String(b.lastName || b.name || '').toLowerCase();
    return sa.localeCompare(sb) || String(a.name || '').localeCompare(String(b.name || ''));
  });

  let next = Number.isFinite(Number(startAt)) && Number(startAt) >= 1 ? Math.floor(Number(startAt)) : 1;
  const out = new Map<string, number>();
  bySurname.forEach(p => {
    if (p.recordingNumber != null) { out.set(p.id, Number(p.recordingNumber)); return; }
    while (taken.has(next)) next += 1;
    taken.add(next);
    out.set(p.id, next);
  });
  return out;
}

export interface Assignment {
  playerId: string;
  name: string;
  /** What the database holds now. */
  current: number | null;
  /** What the coach wants it to be. */
  value: number | null;
}

/**
 * Numbers used more than once.
 *
 * Checked before any write starts: `recording_number` is unique per team, so
 * a duplicate would stop the save halfway and leave the squad part-renumbered
 * — a state the coach then has to unpick by hand.
 *
 * Nulls are ignored. Several players having no number yet is the normal state
 * of a squad being numbered for the first time.
 */
export function duplicateNumbers(assignments: Assignment[]): number[] {
  const seen = new Set<number>();
  const dupes = new Set<number>();

  (assignments || []).forEach(a => {
    if (a?.value == null) return;
    const n = Number(a.value);
    if (seen.has(n)) dupes.add(n);
    seen.add(n);
  });

  return Array.from(dupes).sort((a, b) => a - b);
}

function isChanged(a: Assignment): boolean {
  if ((a.value == null) !== (a.current == null)) return true;
  return Number(a.value) !== Number(a.current);
}

/**
 * The order writes must happen in to avoid a transient collision.
 *
 * The unique index is per team, so **swapping two players' numbers by writing
 * one at a time hits the constraint on the first write**, even though the
 * final state is perfectly legal. Anything whose current number somebody else
 * is about to take is therefore cleared to null first, and everything is set
 * afterwards.
 *
 * Rows that are not changing are left out entirely: a squad of twenty-five
 * with two edits makes two writes, not fifty.
 */
export function planNumberWrites(
  assignments: Assignment[]
): { playerId: string; value: number | null }[] {
  const list = assignments || [];
  const changed = list.filter(isChanged);
  if (changed.length === 0) return [];

  const wanted = new Set(
    changed.map(a => a.value).filter(v => v != null).map(Number));

  // Whose current number somebody else is about to take.
  const mustClear = list.filter(a =>
    a.current != null && wanted.has(Number(a.current)) && Number(a.current) !== Number(a.value));

  return [
    ...mustClear.map(a => ({ playerId: a.playerId, value: null })),
    ...changed.map(a => ({ playerId: a.playerId, value: a.value }))
  ];
}
