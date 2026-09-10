/**
 * The Competitive Matrix boards.
 *
 * Extracted from public/js/views/matrix.view.js during the Vue migration
 * (Phase 0). Behaviour is unchanged; app state arrives as parameters.
 */

export interface MatrixContext {
  points: any[];        // rows as matrix_exercise_points returns them
  players: any[];
  drillsBank: any[];
}
export interface SortState { by: string; reversed: boolean }

const isTimedMeasure = (m: string) => m === 'time_low' || m === 'time_bands';

export function exerciseLeaderboard(
  ctx: MatrixContext, drillId: string, sortBy?: string, reversed?: boolean
): any[] {
  const rows = (ctx.points || []).filter(r => r.drill_id === drillId);
  if (rows.length === 0) return [];

  const drill = (ctx.drillsBank || []).find(d => d.id === drillId);
  const measure = (drill && drill.measure) || 'count_high';
  const timed = isTimedMeasure(measure);
  const byId = new Map((ctx.players || []).map(p => [p.id, p]));

  const acc: Record<string, any> = {};
  rows.forEach(r => {
    const a = acc[r.player_id] = acc[r.player_id] || {
      playerId: r.player_id,
      wins: 0, draws: 0, losses: 0,
      earned: 0, available: 0, attempts: 0,
      attemptedEarned: 0, attemptedAvailable: 0,
      best: null, timed
    };

    a.wins += Number(r.w) || 0;
    a.draws += Number(r.dr) || 0;
    a.losses += Number(r.ls) || 0;
    a.earned += Number(r.earned) || 0;
    a.available += Number(r.available) || 0;

    // A row with no value is an absence or a session never filled in: it
    // counts against the points, but it is not an attempt and cannot be a
    // personal best.
    if (r.raw_value === null || r.raw_value === undefined) return;
    a.attempts += 1;
    // The same totals over attempted sessions alone. Points rank on the
    // totals above, absences included; a match-readiness standard asks only
    // whether the player cleared the bar when they ran, so it reads these.
    a.attemptedEarned += Number(r.earned) || 0;
    a.attemptedAvailable += Number(r.available) || 0;
    const v = Number(r.raw_value);
    if (a.best === null) a.best = v;
    else a.best = timed ? Math.min(a.best, v) : Math.max(a.best, v);
  });

  const out = Object.values(acc).map((a: any) => {
    const p = byId.get(a.playerId);
    return {
      ...a,
      name: (p && p.name) || 'Former squad member',
      recordingNumber: p ? p.recordingNumber : null,
      share: a.available ? (100 * a.earned) / a.available : 0
    };
  });

  return out.sort((x, y) => compareExerciseRows(x, y, sortBy, timed, reversed));
}

/**
 * Order two rows of a single-exercise board.
 *
 * Points first by default -- the board's own currency, and the only figure
 * that means the same thing for every measure. A player with no figure at all
 * sorts last whichever column is chosen, so a column of blanks never leads.
 */
export function compareExerciseRows(
  x: any, y: any, sortBy: string, timed: boolean, reversed: boolean
): number {
  const by = sortBy || 'earned';
  // Reversing flips the comparison of VALUES only. Rows with nothing to
  // compare keep sinking either way -- a column of blanks must never lead
  // the board just because it was clicked twice.
  const flip = reversed ? -1 : 1;

  if (by === 'best') {
    if (x.best === null || y.best === null) {
      if (x.best === y.best) return 0;
      return x.best === null ? 1 : -1;
    }
    // Fastest first for a timed exercise; highest first for a counted one.
    return flip * (timed ? x.best - y.best : y.best - x.best);
  }

  if (by === 'wins') {
    if (y.wins !== x.wins) return flip * (y.wins - x.wins);
    return flip * (y.earned - x.earned);
  }

  if (by === 'name') {
    return flip * String(x.name || '').localeCompare(String(y.name || ''));
  }

  if (by === 'number') {
    const nx = x.recordingNumber == null ? NaN : Number(x.recordingNumber);
    const ny = y.recordingNumber == null ? NaN : Number(y.recordingNumber);
    const gx = Number.isFinite(nx), gy = Number.isFinite(ny);
    if (gx !== gy) return gx ? -1 : 1;          // unnumbered always last
    if (gx && nx !== ny) return flip * (nx - ny);
    return flip * String(x.name || '').localeCompare(String(y.name || ''));
  }

  // Default: points earned, with the best figure breaking a tie rather than
  // leaving two equal players in whatever order they happened to arrive.
  if (y.earned !== x.earned) return flip * (y.earned - x.earned);
  if (x.best !== null && y.best !== null && x.best !== y.best) {
    return flip * (timed ? x.best - y.best : y.best - x.best);
  }
  return String(x.name || '').localeCompare(String(y.name || ''));
}

/** Exercises that actually have results, for the picker. */
export function exercisesWithResults(ctx: MatrixContext): any[] {
  const ids = new Set((ctx.points || []).map(r => r.drill_id).filter(Boolean));
  return (ctx.drillsBank || [])
    .filter(d => ids.has(d.id) && !d.is_deleted && !d.isDeleted)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export function matrixBoardRows(
  players: any[], by: string = 'rank', reversed: boolean = false
): any[] {
  const live = (players || []).filter(p => !p.is_deleted && !p.isDeleted);
  // Hoisted: computing this per row would rescan every player for every row.
  const leaderPts = Math.max(0, ...live.map(x => Number(x.matrixStats?.earned || 0)));

  const rows = live.map(p => {
    const ms = p.matrixStats || {};
    const earned = Number(ms.earned || 0);
    return {
      playerId: p.id,
      name: p.name,
      recordingNumber: p.recordingNumber,
      wins: ms.wins || 0, draws: ms.draws || 0, losses: ms.losses || 0,
      games: ms.games || 0, exercises: ms.exercises || 0,
      earned,
      available: Number(ms.available || 0),
      share: (ms.share === undefined ? null : ms.share),
      rank: ms.rank || 999,
      // The bar tracks POINTS against the leader, because points are what
      // the table is ordered by by default. A bar drawn from share would
      // disagree with the ordering sitting beside it.
      barPct: leaderPts > 0 ? Math.round((earned / leaderPts) * 100) : 0
    };
  });

  return rows.sort((x, y) => compareBoardRows(x, y, by, reversed));
}

/**
 * Order two rows of the overall board.
 *
 * A player who has taken part in nothing is not last on merit and not first
 * when reversed -- there is nothing to compare. They sink either way, so a
 * block of empty rows never leads the board.
 */
export function compareBoardRows(x: any, y: any, by: string, reversed: boolean): number {
  const flip = reversed ? -1 : 1;
  const unranked = (r: any) => r.exercises === 0;

  if (by !== 'name') {
    if (unranked(x) !== unranked(y)) return unranked(x) ? 1 : -1;
  }

  if (by === 'name') {
    return flip * String(x.name || '').localeCompare(String(y.name || ''));
  }

  if (by === 'earned') {
    if (x.earned !== y.earned) return flip * (y.earned - x.earned);
    return String(x.name || '').localeCompare(String(y.name || ''));
  }

  if (by === 'share') {
    // Share is null until a player has taken part in something.
    if (x.share === null || y.share === null) {
      if (x.share === y.share) return 0;
      return x.share === null ? 1 : -1;
    }
    if (x.share !== y.share) return flip * (y.share - x.share);
    return String(x.name || '').localeCompare(String(y.name || ''));
  }

  // Default: the board's own rank, best first.
  if (x.rank !== y.rank) return flip * (x.rank - y.rank);
  return String(x.name || '').localeCompare(String(y.name || ''));
}

/** Which way a board column reads on its first click. */
export function boardSortDescends(by: string): boolean {
  return by === 'earned' || by === 'share';
}

/**
 * Which way an exercise column reads on its FIRST click.
 *
 * Points and wins read highest-first, a time reads fastest-first, and a name
 * or number reads lowest-first. Knowing this is what lets the header arrow
 * show the order actually in force rather than just "sorted".
 */
export function exerciseSortDescends(by: string, timed: boolean): boolean {
  if (by === 'name' || by === 'number') return false;
  if (by === 'best') return !timed;
  return true;                        // earned, wins
}

/**
 * Click a column to sort by it; click the same one again to reverse.
 *
 * The pure half of setBoardSort/setExerciseSort, which were identical apart
 * from which pair of fields they assigned to. The assignment stays in the
 * view; only the decision moves here.
 */
export function nextSortState(current: SortState, by: string): SortState {
  if (current.by === by) return { by, reversed: !current.reversed };
  return { by, reversed: false };
}
