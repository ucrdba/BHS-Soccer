/**
 * Matrix session entry.
 *
 * Extracted from public/js/views/matrix-session.view.js during the Vue
 * migration (Phase 0). The band-draft and drill-picker helpers that the
 * migration spec also listed here turned out to reach the DOM, so they stay
 * in the view until it is replaced.
 */

/**
 * Order two rows of the session grid.
 *
 * A player with no recording number sinks whichever way the column points --
 * an unnumbered block must never lead the grid just because it was clicked
 * twice.
 */
export function compareSessionPlayers(a: any, b: any, by: string, reversed: boolean): number {
  const flip = reversed ? -1 : 1;

  if (by === 'name') {
    return flip * String(a.name || '').localeCompare(String(b.name || ''));
  }

  const na = a.recordingNumber == null ? NaN : Number(a.recordingNumber);
  const nb = b.recordingNumber == null ? NaN : Number(b.recordingNumber);
  const ga = Number.isFinite(na), gb = Number.isFinite(nb);
  if (ga !== gb) return ga ? -1 : 1;
  if (ga && na !== nb) return flip * (na - nb);
  return flip * String(a.name || '').localeCompare(String(b.name || ''));
}

/**
 * What the attendance dropdown reads before anybody touches it.
 *
 * A timed exercise starts everyone absent: a time that was never run is not a
 * slow time, and defaulting to present would award the bottom band to a
 * player who was not there.
 */
export function defaultSessionAttendance(measure: string): 'present' | 'unexcused' {
  return measure === 'time_low' || measure === 'time_bands' ? 'unexcused' : 'present';
}

export function isTimedExercise(row: any, drillsBank: any[]): boolean {
  const drill = (drillsBank || []).find(d => d.id === row.drill_id);
  return !!drill && (drill.measure === 'time_low' || drill.measure === 'time_bands');
}
