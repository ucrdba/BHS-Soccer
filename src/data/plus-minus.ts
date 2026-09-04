/**
 * Plus/minus: turning a match's events into each player's statistics.
 *
 * Every figure the app shows is derived here by replaying an append-only log.
 * Nothing is stored as a running total, and that is the design rather than an
 * implementation detail:
 *
 *   Undo is free. A statistician on a touchline WILL mis-tap, and undoing a
 *   stored counter means guessing what it held before.
 *
 *   Playing time is exact. It comes from substitutions measured against the
 *   match clock, not from a counter ticking in a browser tab that may be
 *   backgrounded, throttled or closed mid-half.
 *
 *   Goal differential follows corrections. It is computed from who was on the
 *   pitch at that clock time, so fixing a mis-timed substitution fixes every
 *   goal that depended on it.
 *
 * Kept free of the DOM and of the database so it can be tested directly: this
 * is the part that must be right.
 */

export type StatKind =
  | 'on' | 'off'
  | 'plus' | 'minus'
  | 'shot' | 'goal' | 'assist'
  | 'goal_for' | 'goal_against'
  | 'clock_start' | 'clock_stop'
  | 'period';

export interface StatEvent {
  id?: string;
  kind: StatKind;
  playerId?: string | null;
  atSeconds: number;
  period?: number;
  /** Ordering within the same clock second. Insertion order is the fallback. */
  seq?: number;
}

export interface PlayerStats {
  playerId: string;
  plus: number;
  minus: number;
  /** The statistician's net judgement. */
  score: number;
  goalDiff: number;
  secondsPlayed: number;
  shots: number;
  goals: number;
  assists: number;
  onPitch: boolean;
}

/** Events in the order they happened, stable for those sharing a second. */
export function orderEvents(events: StatEvent[]): StatEvent[] {
  return (events || [])
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (a.e.atSeconds !== b.e.atSeconds) return a.e.atSeconds - b.e.atSeconds;
      const sa = a.e.seq ?? a.i;
      const sb = b.e.seq ?? b.i;
      return sa - sb;
    })
    .map(x => x.e);
}

const blank = (playerId: string): PlayerStats => ({
  playerId, plus: 0, minus: 0, score: 0, goalDiff: 0,
  secondsPlayed: 0, shots: 0, goals: 0, assists: 0, onPitch: false
});

/**
 * Replay a match.
 *
 * `playerIds` seeds the result so a player who never touched the ball still
 * appears with zeroes — a statistics sheet missing a player reads as a bug,
 * not as a quiet day.
 */
export function replay(events: StatEvent[], playerIds: string[] = []): Map<string, PlayerStats> {
  const stats = new Map<string, PlayerStats>();
  const ensure = (id: string) => {
    if (!stats.has(id)) stats.set(id, blank(id));
    return stats.get(id)!;
  };
  playerIds.forEach(ensure);

  /** Who is on the pitch, and since when in clock terms. */
  const onSince = new Map<string, number>();
  let clockRunning = false;
  let lastTick = 0;

  /**
   * Credit time up to `now` to everyone on the pitch.
   *
   * Called before every event that could change who is on or whether the
   * clock runs, so an interval is only ever counted once and only while the
   * clock was actually running.
   */
  const accrue = (now: number) => {
    if (!clockRunning) { lastTick = now; return; }
    const delta = Math.max(0, now - lastTick);
    if (delta > 0) {
      onSince.forEach((_, id) => { ensure(id).secondsPlayed += delta; });
    }
    lastTick = now;
  };

  for (const e of orderEvents(events)) {
    const at = Math.max(0, Number(e.atSeconds) || 0);

    switch (e.kind) {
      case 'clock_start':
        accrue(at);
        clockRunning = true;
        lastTick = at;
        break;

      case 'clock_stop':
        accrue(at);
        clockRunning = false;
        break;

      case 'on':
        if (!e.playerId) break;
        accrue(at);
        onSince.set(e.playerId, at);
        ensure(e.playerId).onPitch = true;
        break;

      case 'off':
        if (!e.playerId) break;
        accrue(at);
        onSince.delete(e.playerId);
        ensure(e.playerId).onPitch = false;
        break;

      case 'plus':
        if (e.playerId) ensure(e.playerId).plus += 1;
        break;

      case 'minus':
        if (e.playerId) ensure(e.playerId).minus += 1;
        break;

      case 'shot':
        if (e.playerId) ensure(e.playerId).shots += 1;
        break;

      case 'goal':
        if (e.playerId) ensure(e.playerId).goals += 1;
        break;

      case 'assist':
        if (e.playerId) ensure(e.playerId).assists += 1;
        break;

      // A team goal moves the differential of everyone on the pitch AT THAT
      // MOMENT. Conventional direction: our goal is +1 to those on, theirs is
      // −1 — so a high number means good things happen while that player
      // plays, which is what the statistic is for.
      case 'goal_for':
        onSince.forEach((_, id) => { ensure(id).goalDiff += 1; });
        break;

      case 'goal_against':
        onSince.forEach((_, id) => { ensure(id).goalDiff -= 1; });
        break;

      case 'period':
        // A period marker does not stop the clock by itself; the statistician
        // stops it. Accrue so the boundary is not swallowed.
        accrue(at);
        break;
    }
  }

  stats.forEach(s => { s.score = s.plus - s.minus; });
  return stats;
}

/**
 * Bring the clock forward to `now` without an event.
 *
 * The live screen needs minutes played to tick between substitutions. Replaying
 * with a trailing marker keeps one implementation of the time arithmetic
 * rather than a second one that drifts from it.
 */
export function replayTo(
  events: StatEvent[], playerIds: string[], now: number
): Map<string, PlayerStats> {
  return replay([...(events || []), { kind: 'period', atSeconds: now, seq: Number.MAX_SAFE_INTEGER }], playerIds);
}

/** Who is on the pitch, in the order they were sent on. */
export function onPitch(events: StatEvent[]): string[] {
  const on: string[] = [];
  for (const e of orderEvents(events)) {
    if (e.kind === 'on' && e.playerId) {
      if (!on.includes(e.playerId)) on.push(e.playerId);
    } else if (e.kind === 'off' && e.playerId) {
      const i = on.indexOf(e.playerId);
      if (i !== -1) on.splice(i, 1);
    }
  }
  return on;
}

/** Is the clock running, given everything so far. */
export function clockRunning(events: StatEvent[]): boolean {
  let running = false;
  for (const e of orderEvents(events)) {
    if (e.kind === 'clock_start') running = true;
    else if (e.kind === 'clock_stop') running = false;
  }
  return running;
}

/** The current period, counting from 1. */
export function currentPeriod(events: StatEvent[]): number {
  let period = 1;
  for (const e of orderEvents(events)) {
    if (e.kind === 'period') period = Math.max(period, (e.period ?? period + 1));
  }
  return period;
}

/** The score, from team goal events. */
export function scoreLine(events: StatEvent[]): { for: number; against: number } {
  let f = 0, a = 0;
  for (const e of events || []) {
    if (e.kind === 'goal_for') f += 1;
    else if (e.kind === 'goal_against') a += 1;
  }
  return { for: f, against: a };
}

/** mm:ss for the match clock. */
export function formatClock(seconds: number): string {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

/**
 * Whole minutes played, rounded to nearest.
 *
 * Coaches talk in minutes, and a sheet reading "23:47" invites arithmetic
 * nobody wants at half time. Rounded rather than truncated so a player who was
 * on for 89 seconds is credited with the minute and a half they actually
 * played rather than one.
 */
export function minutesPlayed(seconds: number): number {
  return Math.round((Math.max(0, Number(seconds) || 0)) / 60);
}
