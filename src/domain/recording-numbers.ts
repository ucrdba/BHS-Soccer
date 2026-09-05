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
