/**
 * What a position number means.
 *
 * A player's position is the soccer position number 1-11, stored in
 * team_players.position since 0036:
 *
 *   1      goalkeeper
 *   2-6    defence
 *   7-11   attack
 *
 * There is no midfield role. This module is the ONLY place those ranges are
 * written down -- the roster filter, the labels, the spreadsheet import and the
 * Goals by role drill all ask it -- so a change to the rule is one edit.
 *
 * The role strings are the ones the Goals by role drill stores, so the two can
 * never disagree about what "defend" means.
 */

export type PositionRole = 'keeper' | 'defend' | 'attack';

export const POSITIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 11;
}

export function roleOfPosition(position: number | null | undefined): PositionRole | null {
  if (!isPosition(position)) return null;
  if (position === 1) return 'keeper';
  return position <= 6 ? 'defend' : 'attack';
}

const ROLE_LABELS: Record<PositionRole, string> = {
  keeper: 'Goalkeeper',
  defend: 'Defence',
  attack: 'Attack'
};

export function roleLabel(role: PositionRole): string {
  return ROLE_LABELS[role];
}

/** "4 · Defence" — the roster form's picker. */
export function positionOptionLabel(position: number): string {
  const role = roleOfPosition(position);
  return role ? `${position} · ${roleLabel(role)}` : String(position);
}

/** "Defence (4)" — the roster card. Empty when there is no position. */
export function positionCardLabel(position: number | null | undefined): string {
  const role = roleOfPosition(position);
  return role ? `${roleLabel(role)} (${position})` : '';
}

/**
 * "Position 4 · Defence" — the bio. The word "Position" is what keeps it from
 * being read as the shirt number, which the bio already shows as "No. 9".
 */
export function positionBioLabel(position: number | null | undefined): string {
  const role = roleOfPosition(position);
  return role ? `Position ${position} · ${roleLabel(role)}` : '';
}

/** A position from a value read back — a number, or numeric text — else null. */
export function toPosition(value: unknown): number | null {
  if (isPosition(value)) return value;
  if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) {
    const n = Number(value.trim());
    return isPosition(n) ? n : null;
  }
  return null;
}

/**
 * A spreadsheet's Position cell.
 *
 * Blank is "no position". A number 1-11, or text that is one, is that number.
 * Anything else is refused rather than guessed: "FB" could be 2 or 3, and a
 * guess would put the player in the wrong role without anyone noticing.
 */
export function parsePositionCell(value: unknown): { ok: true; position: number | null } | { ok: false } {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { ok: true, position: null };
  }
  const position = toPosition(value);
  return position === null ? { ok: false } : { ok: true, position };
}
