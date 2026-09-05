/**
 * Plus/minus summed across a season, and the per-match rates drawn from it.
 *
 * ── Why a rate, and why not per 90 ────────────────────────────────────────
 *
 * Plus and minus accrue while a player is on the pitch, so raw totals mostly
 * measure who got picked. A substitute working their way into the side shows
 * a rising line without having played any better, which is the opposite of
 * what the chart is read for. Dividing by minutes and scaling to a full match
 * puts a starter and a substitute on the same footing.
 *
 * A FULL MATCH, not ninety minutes. Per-90 is the professional convention and
 * it is wrong here: high school soccer plays two forty-minute halves, and
 * club fixtures vary by age group. Scaling an 80-minute game to 90 inflates
 * every figure by an eighth, so a player who was on for the entire match
 * would show a rate higher than what they actually did — which makes the one
 * number a coach can sanity-check against their own memory of the game wrong.
 *
 * The length therefore travels with the team rather than being a constant
 * here. DEFAULT_FULL_MATCH_MINUTES is a fallback for a team that has not said,
 * not an assumption about the sport.
 *
 * The cost is that a short outing extrapolates absurdly: one plus in five
 * minutes of an eighty-minute game reads as +16. In professional football the
 * usual answer is a minutes threshold, below which a player is dropped from
 * the table.
 *
 * That answer is wrong here. This is high school soccer under NFHS rules —
 * substitution is unlimited and players re-enter freely, so a large part of
 * the squad finishes any fixture well short of a full match, and the coach
 * reads these numbers precisely to decide who to give more minutes to. A
 * threshold would hide exactly the players the report exists to inform a
 * decision about.
 *
 * So nobody is filtered. Instead every figure travels with the minutes behind
 * it, and `seasonToDate` gives a running rate that steadies as minutes
 * accumulate. A coach can see that +18 came off five minutes and judge it as
 * noise themselves — which is a judgement they are equipped to make and this
 * module should not make for them.
 */

import type { PlayerStats } from './plus-minus';

/** One tracked fixture, after its events have been replayed. */
export interface MatchStats {
  /** The stat_matches row id. */
  statMatchId: string;
  /** The schedule row, when the session was tied to a fixture. */
  matchId: string | null;
  /** As displayed: "DEC 8 2026". Used for ordering and axis labels. */
  date: string;
  /** Sorts chronologically; null when the date could not be parsed. */
  sortKey: string | null;
  opponent: string;
  /** Replayed statistics, by player id. */
  stats: Map<string, PlayerStats>;
}

/** What one player did across the whole season. */
export interface SeasonTotals {
  playerId: string;
  /** Fixtures in which they were on the pitch at all. */
  appearances: number;
  minutes: number;
  plus: number;
  minus: number;
  score: number;
  goalDiff: number;
  shots: number;
  goals: number;
  assists: number;
  /** Net score per full match, or null when they never played. */
  scorePerMatch: number | null;
  goalDiffPerMatch: number | null;
}

/** One point on a player's chart. */
export interface SeasonPoint {
  statMatchId: string;
  date: string;
  opponent: string;
  minutes: number;
  score: number;
  goalDiff: number;
  /** This match alone, scaled to a full match. Null when they did not play. */
  scorePerMatch: number | null;
  goalDiffPerMatch: number | null;
  /** Every match up to and including this one, scaled to a full match. */
  scorePerMatchToDate: number | null;
  goalDiffPerMatchToDate: number | null;
  /** Minutes accumulated up to and including this match. */
  minutesToDate: number;
}

/**
 * Used when a team has not recorded its own match length.
 *
 * Eighty because that is the NFHS high school match this app was built for.
 * A club team playing 70 or 60 sets its own; nothing here should assume every
 * organization plays the same length.
 */
export const DEFAULT_FULL_MATCH_MINUTES = 80;

/**
 * A rate per full match, or null when there are no minutes to divide by.
 *
 * Null rather than zero: a player who has not been on the pitch has no rate,
 * and plotting that as zero would draw them as a mid-table performer rather
 * than as absent. The two are different things and the chart must not blur
 * them.
 */
export function perMatch(
  value: number, minutes: number, fullMatch: number = DEFAULT_FULL_MATCH_MINUTES
): number | null {
  if (!minutes || minutes <= 0) return null;
  const len = fullMatch > 0 ? fullMatch : DEFAULT_FULL_MATCH_MINUTES;
  return (value / minutes) * len;
}

/** Minutes, from the seconds the replay engine accumulates. */
export function toMinutes(seconds: number): number {
  return Math.max(0, seconds || 0) / 60;
}

/**
 * Matches oldest first.
 *
 * Ordered by the derived sort key rather than the displayed text, because
 * "DEC 8 2026" and "JAN 6 2027" do not compare usefully as strings. A match
 * whose date could not be parsed sorts last rather than to the front, so one
 * bad row cannot silently become the start of the season.
 */
export function orderMatches(matches: MatchStats[]): MatchStats[] {
  return (matches || [])
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ak = a.m.sortKey, bk = b.m.sortKey;
      if (ak && bk && ak !== bk) return ak < bk ? -1 : 1;
      if (ak && !bk) return -1;
      if (!ak && bk) return 1;
      return a.i - b.i;
    })
    .map(x => x.m);
}

/**
 * Season totals for every player who appears anywhere in the matches.
 *
 * A player is counted as having appeared when they accumulated time, not when
 * an `on` event names them: a substitute sent on after the final whistle, or
 * one put on the pitch and taken straight off again, played no part in the
 * match and should not have an appearance recorded against them. Their plus
 * and minus still count if any were recorded.
 */
export function seasonTotals(
  matches: MatchStats[], fullMatch: number = DEFAULT_FULL_MATCH_MINUTES
): Map<string, SeasonTotals> {
  const out = new Map<string, SeasonTotals>();
  const blank = (playerId: string): SeasonTotals => ({
    playerId, appearances: 0, minutes: 0, plus: 0, minus: 0, score: 0,
    goalDiff: 0, shots: 0, goals: 0, assists: 0,
    scorePerMatch: null, goalDiffPerMatch: null
  });

  for (const m of matches || []) {
    m.stats.forEach((s, playerId) => {
      if (!out.has(playerId)) out.set(playerId, blank(playerId));
      const t = out.get(playerId)!;
      const minutes = toMinutes(s.secondsPlayed);
      if (minutes > 0) t.appearances += 1;
      t.minutes   += minutes;
      t.plus      += s.plus || 0;
      t.minus     += s.minus || 0;
      t.score     += s.score || 0;
      t.goalDiff  += s.goalDiff || 0;
      t.shots     += s.shots || 0;
      t.goals     += s.goals || 0;
      t.assists   += s.assists || 0;
    });
  }

  out.forEach(t => {
    t.scorePerMatch    = perMatch(t.score, t.minutes, fullMatch);
    t.goalDiffPerMatch = perMatch(t.goalDiff, t.minutes, fullMatch);
  });
  return out;
}

/**
 * One player's season as a series of points, oldest first.
 *
 * Matches in which the player did not feature are left out entirely rather
 * than plotted at zero. A line dipping to zero would say they had a poor
 * game; the truth is that they were not in it, and the running to-date figure
 * is what carries their form across the gap.
 */
export function seasonSeries(
  matches: MatchStats[], playerId: string,
  fullMatch: number = DEFAULT_FULL_MATCH_MINUTES
): SeasonPoint[] {
  const ordered = orderMatches(matches);
  const points: SeasonPoint[] = [];

  let minutesToDate = 0;
  let scoreToDate = 0;
  let goalDiffToDate = 0;

  for (const m of ordered) {
    const s = m.stats.get(playerId);
    if (!s) continue;
    const minutes = toMinutes(s.secondsPlayed);
    if (minutes <= 0) continue;

    minutesToDate  += minutes;
    scoreToDate    += s.score || 0;
    goalDiffToDate += s.goalDiff || 0;

    points.push({
      statMatchId: m.statMatchId,
      date: m.date,
      opponent: m.opponent,
      minutes,
      score: s.score || 0,
      goalDiff: s.goalDiff || 0,
      scorePerMatch: perMatch(s.score || 0, minutes, fullMatch),
      goalDiffPerMatch: perMatch(s.goalDiff || 0, minutes, fullMatch),
      scorePerMatchToDate: perMatch(scoreToDate, minutesToDate, fullMatch),
      goalDiffPerMatchToDate: perMatch(goalDiffToDate, minutesToDate, fullMatch),
      minutesToDate
    });
  }
  return points;
}

/**
 * How much weight a point deserves, from 0.25 to 1.
 *
 * Drives the size and opacity of the marker rather than whether it is drawn.
 * A five-minute cameo is faint and small, a full match solid — so a wild rate
 * off almost no minutes LOOKS uncertain without being hidden, and the coach
 * makes the judgement rather than the report making it for them.
 *
 * Scaled against the team's own full match, and clamped at both ends: a floor
 * so the shortest appearance is still visible, a ceiling so extra time does
 * not draw an outsized dot.
 */
export function pointWeight(
  minutes: number, fullMatch: number = DEFAULT_FULL_MATCH_MINUTES
): number {
  const len = fullMatch > 0 ? fullMatch : DEFAULT_FULL_MATCH_MINUTES;
  const share = Math.max(0, minutes) / len;
  return Math.max(0.25, Math.min(1, share));
}

/**
 * Is this player's season trending up, down, or neither?
 *
 * Compares the running per-90 at the halfway point of their appearances with
 * where it finished, so it answers "are they better now than they were" using
 * the figure that steadies with minutes rather than the noisy per-match one.
 *
 * Needs at least three appearances. Below that there is no trend to report,
 * only two numbers, and calling a single change a trend would put a
 * confident arrow on nothing.
 */
export function seasonTrend(
  points: SeasonPoint[],
  key: 'scorePerMatchToDate' | 'goalDiffPerMatchToDate' = 'scorePerMatchToDate'
): 'up' | 'down' | 'flat' | null {
  const usable = (points || []).filter(p => p[key] != null);
  if (usable.length < 3) return null;

  const mid = usable[Math.floor((usable.length - 1) / 2)][key] as number;
  const end = usable[usable.length - 1][key] as number;
  const delta = end - mid;

  // A tenth of a goal per match is below the resolution of a season this short;
  // anything smaller is reported as flat rather than dressed up as movement.
  if (Math.abs(delta) < 0.1) return 'flat';
  return delta > 0 ? 'up' : 'down';
}
