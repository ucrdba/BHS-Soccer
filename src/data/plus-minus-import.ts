/**
 * Turning a spreadsheet of plus/minus figures back into events.
 *
 * ── Why this is not a straight insert ─────────────────────────────────────
 *
 * Plus/minus stores no totals. Every figure the app shows — plus, minus, net
 * score, goal differential, minutes, shots, goals, assists — is replayed from
 * an append-only log of what happened. There is nowhere to put a number.
 *
 * So an import has to work backwards: given the figures a coach wants to see,
 * synthesise a log that replays to them. That is straightforward for the
 * columns that belong to a player — a plus of four is four `plus` events —
 * and it is the whole difficulty for the two that do not.
 *
 * ── Minutes, and who was on when ──────────────────────────────────────────
 *
 * A player's minutes are the sum of their spells, so any set of spells adding
 * to the right total is faithful to the figure. But WHICH minutes decides
 * their goal differential, because that is credited to whoever was on the
 * pitch when a goal went in. Spells therefore cannot be placed arbitrarily.
 *
 * The rule here: the eleven longest appearances start at kick-off and come
 * off when their minutes run out; everyone else comes on late enough to
 * finish at the whistle. That is roughly how a match runs, it gives every
 * player exactly the minutes stated, and it means goals spread across the
 * match land on a plausible set of players.
 *
 * With unlimited substitution a real match is messier than this — players go
 * off and come back — and a single spell each is an approximation. The
 * totals are exact; only the shape is invented.
 *
 * ── Goal differential is a consequence, not an input ──────────────────────
 *
 * There is no per-player column for it, deliberately. The sheet gives the
 * match score once, the goals are spread across the match, and each player's
 * differential falls out of who was on. A column would have to be forced by
 * writing goals that only one player can see — events that could not have
 * happened — and a session imported that way would look wrong the moment it
 * was opened in the live Plus/Minus screen.
 */

/** One row of the sheet: what one player did in one match. */
export interface ImportRow {
  team?: string;
  date: string;
  opponent: string;
  goalsFor?: number;
  goalsAgainst?: number;
  recordingNumber: number;
  minutes: number;
  plus?: number;
  minus?: number;
  shots?: number;
  goals?: number;
  assists?: number;
}

/** A synthesised event, in the shape appendStatEvent already writes. */
export interface BuiltEvent {
  kind: string;
  playerId: string | null;
  atSeconds: number;
  period: number;
}

/** One match's worth of synthesised log. */
export interface BuiltMatch {
  date: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  events: BuiltEvent[];
  /** Recording numbers in the sheet that no player on the team matched. */
  unknownNumbers: number[];
}

export const DEFAULT_FULL_MATCH_MINUTES = 80;

/** Eleven on the pitch, so eleven appearances start the match. */
const STARTERS = 11;

const num = (v: any): number => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * Group rows into matches, keyed on the fixture they name.
 *
 * Keyed on date AND opponent rather than date alone: a squad can play twice
 * in a day at a tournament, and merging those would double every figure.
 */
export function groupRows(rows: ImportRow[]): Map<string, ImportRow[]> {
  const out = new Map<string, ImportRow[]>();
  for (const r of rows || []) {
    const key = `${String(r.date || '').trim().toUpperCase()}|${String(r.opponent || '').trim().toUpperCase()}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(r);
  }
  return out;
}

/**
 * When each goal went in.
 *
 * Spread evenly rather than bunched, so a substitute who played the last
 * twenty minutes shares in some of them. Nudged off the exact minute marks so
 * a goal never lands on the same second as a substitution, where whether the
 * player coming off gets the credit would depend on event order rather than
 * on anything real.
 */
export function goalTimes(count: number, fullMatchSeconds: number, offset = 0): number[] {
  const times: number[] = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    const at = Math.round(((i + 1) / (count + 1)) * fullMatchSeconds) + offset;
    times.push(Math.max(1, Math.min(fullMatchSeconds - 1, at)));
  }
  return times;
}

/**
 * The order a match actually happened in.
 *
 * Load-bearing, not cosmetic. `replay` credits a team goal to whoever is on
 * the pitch AT THE MOMENT IT PROCESSES THE EVENT, which is a function of
 * position in the log rather than of the timestamp on it. Emit every goal
 * after every substitution and the whole differential lands on whoever
 * finished the match.
 *
 * Within a second, the order is: the clock starts, players come off, players
 * come on, then everything that happened while they were there, and the clock
 * stops last. Off before on is the same convention the live screen uses for a
 * substitution, so a sheet and a tracked match produce the same shape.
 */
const KIND_RANK: Record<string, number> = {
  clock_start: 0, off: 1, on: 2, period: 3,
  goal_for: 4, goal_against: 4,
  plus: 5, minus: 5, shot: 5, goal: 5, assist: 5,
  clock_stop: 9
};

export function orderBuilt(events: BuiltEvent[]): BuiltEvent[] {
  return (events || [])
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      (a.e.atSeconds - b.e.atSeconds) ||
      ((KIND_RANK[a.e.kind] ?? 5) - (KIND_RANK[b.e.kind] ?? 5)) ||
      (a.i - b.i))
    .map(x => x.e);
}

/**
 * Build one match's event log.
 *
 * `playerIdFor` resolves a recording number to a player id, and returns null
 * for a number nobody on the team carries. Those rows are reported rather
 * than guessed at: a mistyped number that quietly landed on another player
 * would put one student's match on another student's record.
 */
export function buildMatch(
  rows: ImportRow[],
  playerIdFor: (recordingNumber: number) => string | null,
  fullMatchMinutes: number = DEFAULT_FULL_MATCH_MINUTES
): BuiltMatch {
  const full = (fullMatchMinutes > 0 ? fullMatchMinutes : DEFAULT_FULL_MATCH_MINUTES) * 60;
  const first = rows[0] || ({} as ImportRow);

  const unknownNumbers: number[] = [];
  const entries = rows.map(r => {
    const id = playerIdFor(r.recordingNumber);
    if (!id) unknownNumbers.push(r.recordingNumber);
    return { row: r, id };
  }).filter(e => e.id) as Array<{ row: ImportRow; id: string }>;

  // Longest appearances start; the rest finish the match. Ties keep sheet
  // order so the same file always produces the same log.
  const ranked = entries
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => (num(b.row.minutes) - num(a.row.minutes)) || (a.i - b.i));

  const events: BuiltEvent[] = [];
  const periodAt = (s: number) => (s < full / 2 ? 1 : 2);
  const push = (kind: string, playerId: string | null, atSeconds: number) => {
    const at = Math.max(0, Math.min(full, Math.round(atSeconds)));
    events.push({ kind, playerId, atSeconds: at, period: periodAt(at) });
  };

  push('clock_start', null, 0);

  const spells = new Map<string, { on: number; off: number }>();
  ranked.forEach((e, rank) => {
    const mins = Math.max(0, Math.min(full / 60, num(e.row.minutes)));
    const secs = mins * 60;
    if (secs <= 0) return;
    // A starter runs from kick-off; a substitute finishes the match.
    const on = rank < STARTERS ? 0 : full - secs;
    spells.set(e.id, { on, off: on + secs });
  });

  // On and off, in clock order, so the log reads like a match rather than
  // like a spreadsheet.
  const changes: Array<{ at: number; kind: 'on' | 'off'; id: string }> = [];
  spells.forEach((sp, id) => {
    changes.push({ at: sp.on, kind: 'on', id });
    if (sp.off < full) changes.push({ at: sp.off, kind: 'off', id });
  });
  changes.sort((a, b) => a.at - b.at || (a.kind === 'on' ? -1 : 1));
  changes.forEach(c => push(c.kind, c.id, c.at));

  // Team goals. Against is offset by a few seconds so a goal for and a goal
  // against never share a second.
  const goalsFor = num(first.goalsFor);
  const goalsAgainst = num(first.goalsAgainst);
  goalTimes(goalsFor, full).forEach(at => push('goal_for', null, at));
  goalTimes(goalsAgainst, full, 7).forEach(at => push('goal_against', null, at));

  // Everything a player did, spread inside their own spell so it could have
  // happened: an event recorded while they were off the pitch would be a log
  // the live screen could never have produced.
  for (const e of entries) {
    const sp = spells.get(e.id);
    const counts: Array<[string, number]> = [
      ['plus', num(e.row.plus)],
      ['minus', num(e.row.minus)],
      ['shot', num(e.row.shots)],
      ['goal', num(e.row.goals)],
      ['assist', num(e.row.assists)]
    ];
    for (const [kind, n] of counts) {
      for (let i = 0; i < n; i++) {
        const at = sp
          ? sp.on + ((i + 1) / (n + 1)) * (sp.off - sp.on)
          : ((i + 1) / (n + 1)) * full;
        push(kind, e.id, at);
      }
    }
  }

  push('clock_stop', null, full);

  return {
    date: String(first.date || '').trim(),
    opponent: String(first.opponent || '').trim(),
    goalsFor, goalsAgainst,
    events: orderBuilt(events),
    unknownNumbers: [...new Set(unknownNumbers)]
  };
}

/** Every match in the sheet, built. */
export function buildImport(
  rows: ImportRow[],
  playerIdFor: (recordingNumber: number) => string | null,
  fullMatchMinutes: number = DEFAULT_FULL_MATCH_MINUTES
): BuiltMatch[] {
  return [...groupRows(rows).values()]
    .filter(group => group.length > 0)
    .map(group => buildMatch(group, playerIdFor, fullMatchMinutes));
}
