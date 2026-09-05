/**
 * The plus/minus court: the pitch, its positions, and what a gesture means.
 *
 * Extracted from public/js/views/plusminus.view.js during the Vue migration
 * (Phase 0). Deliberately named apart from src/data/plus-minus.ts, which
 * replays the event log — that is the arithmetic, this is the screen.
 *
 * Everything here is side-effect free. The view keeps pmLoadPositions and
 * pmSavePositions, which touch localStorage, and pmArm, pmApplyFormation and
 * setPlusMinusSort, which mutate and redraw.
 */
import { lineupSlots } from './lineup';

export interface Position { x: number; y: number }
export interface TapContext {
  armed: string | null; fingers: number; rightClick: boolean; onPitch: boolean;
}
export interface DropContext {
  playerId: string; wasOn: boolean; overPitch: boolean; overBench: boolean;
  onCount: number; overPlayerId?: string | null;
}
export interface PmColumn {
  key: string; label: string; desc: boolean; text: boolean;
  get: (p: any, s: any) => any;
}

/** The clock as it stands, ticked forward to this instant. */
export function pmClock(clockBase: number, runningSince: number | null, now: number = Date.now()): number {
  const base = clockBase || 0;
  if (!runningSince) return base;
  return base + Math.floor((now - runningSince) / 1000);
}

/**
 * Is the match clock running right now?
 *
 * Plus and minus are gated on this, not on whether the clock has ever
 * started. Stopped is stopped: at half time, or during any break in play,
 * the clock is not counting, so an event recorded then is stamped at a
 * minute that has already passed and lands against whoever happened to be
 * on the pitch at that moment. Play is the only time plus and minus mean
 * anything.
 */
export function pmClockRunning(runningSince: number | null): boolean {
  return !!runningSince;
}

/**
 * Has this match's clock ever been started?
 *
 * Only used to word the refusal, since "start the clock" and "the clock is
 * stopped" are different situations to a coach. Read from the event log
 * rather than from the clock base, because the base is zero both before
 * kick-off AND straight after a reset — the log is the only thing that
 * distinguishes "not started yet" from "started, and back at zero".
 */
export function pmClockEverStarted(events: any[]): boolean {
  return (events || []).some(e => e.kind === 'clock_start');
}

/**
 * What a tap means, given what is armed and how many fingers landed.
 *
 * Split out from the event plumbing so the rules can be tested: which
 * gesture produces which event is the part worth protecting, and browser
 * pointer behaviour is not.
 */
export function pmResolveTap({ armed, fingers, rightClick, onPitch }: TapContext): any {
  if (armed) return { kind: armed, disarm: true };
  // Two fingers, or the mouse's second button, is the minus gesture.
  if (fingers >= 2 || rightClick) return onPitch ? { kind: 'minus' } : { kind: null };
  // A plain tap only counts for someone actually on the pitch: a bench
  // player cannot have made a good play.
  return onPitch ? { kind: 'plus' } : { kind: null };
}

export function pmPosKey(matchId: string | null, fixture: string | null): string {
  return 'bhs_pm_pos_' + (matchId || fixture || 'default');
}

/**
 * Which layout the stored positions belong to.
 *
 * Positions are percentages of the pitch, so they only mean anything under
 * the layout that produced them. When the formation spread changed — the
 * keeper was sitting on top of the centre backs — every position already in
 * a coach's browser stayed as it was, was restored on open, and no amount
 * of fixing the layout could reach it. The screen looked exactly as broken
 * as before the fix.
 *
 * Raise this whenever the meaning of a stored position changes. Anything
 * stamped with an older number is dropped, and the pitch is laid out again
 * from the lineup, which is where the shape should come from anyway.
 */
export function pmPosVersion(): number { return 2; }

/**
 * Keep a chip fully on the pitch: without it half of one sits outside the
 * boundary where it cannot be tapped.
 */
export function pmClampPosition(x: number, y: number): Position {
  const clamp = (v: any) => Math.max(8, Math.min(92, Number(v) || 0));
  return { x: clamp(x), y: clamp(y) };
}

/**
 * How many chips fit across the pitch without touching.
 *
 * A chip carries a number and a name, so it is wide — well over a tenth of
 * the pitch. Six per row gave each one 12.7% of the width to sit in, and
 * they overlapped every time, which made a player hard to tap in the one
 * situation where tapping the right player matters.
 */
export function pmPerRow(viewportWidth: number = 1024): number {
  return (viewportWidth || 1024) < 700 ? 3 : 4;
}

/**
 * A formation slot, respread for this pitch.
 *
 * The coordinates come from the lineup screen, whose pitch is a tall 2:3
 * portrait. This one is wide and short, so the same percentages put players
 * much closer together on screen: the goalkeeper at x=50 and the centre
 * backs at x=38 and x=62 are twelve percent apart, and a chip is wider than
 * that. They collided, which is exactly where a coach reported it.
 *
 * So x is pushed out from the centre line and y is stretched across the
 * full height. The SHAPE is preserved — a back four still sits in front of
 * the keeper, wingers still hug the touchline — it is only spread to suit a
 * landscape pitch.
 */
export function pmSpreadSlot(slot: { x: number; y: number; slot?: string }): Position {
  const x = 50 + (Number(slot.x) - 50) * 1.35;

  // The keeper is placed rather than scaled. A uniform stretch cannot save
  // it: 3-5-2 puts a centre back directly in front of the keeper, eight
  // percent away and on the same x, and no expansion that still fits on a
  // pitch turns eight percent into a chip's height. So the keeper goes to
  // the goal line and the outfield starts above it.
  //
  // The outfield starts at 26 rather than immediately above the keeper. In
  // 3-5-2 a centre back stands directly in front of the keeper on the same
  // x, so their vertical gap is the ONLY thing keeping them apart, and it
  // is measured as a percentage of a pitch whose height follows the
  // viewport. Thirteen percent is comfortable on a tall window and about
  // four pixels on a short one, which is where the overlap came back.
  //
  // The ceiling is 90, not 86: 4-4-1-1 stands a striker at 90 directly
  // above a second forward at 72, and capping both at 86 squashed them
  // together. The keeper's gap and the strikers' gap compete for the same
  // vertical budget, so 25..92 is what satisfies each with room to spare.
  const raw = Number(slot.y);
  const y = raw < 15
    ? 8
    : 25 + ((Math.min(raw, 90) - 18) / 72) * 67;
  return {
    x: Math.max(9, Math.min(91, x)),
    y: Math.max(8, Math.min(92, y))
  };
}

/**
 * Where a player sits, or a sensible place if nobody has said.
 *
 * Spread across the middle rather than stacked at one point: an unplaced
 * squad piled on the centre spot is unusable, and the coach reaches for the
 * formation button the moment they see it.
 */
export function pmPositionFor(
  positions: Record<string, Position>, playerId: string,
  index: number, total: number, viewportWidth?: number
): Position {
  const pos = (positions || {})[playerId];
  if (pos) return pos;
  const perRow = pmPerRow(viewportWidth);
  const row = Math.floor(index / perRow);
  const col = index % perRow;
  // Rows are spaced by more than a chip is tall, and the grid starts high
  // enough that four rows of an over-full pitch still land on the grass.
  return pmClampPosition(
    10 + (col + 0.5) * (80 / perRow),
    78 - row * 18
  );
}

/**
 * How many may be on the pitch at once.
 *
 * Eleven, and a function rather than a literal so a small-sided fixture is
 * one line away rather than a search through the file.
 */
export function pmMaxOnPitch(): number { return 11; }

/**
 * What a drop means: onto the pitch, off it, or nothing.
 *
 * Dropping a player where they already are is how a drag gets cancelled.
 */
export function pmResolveDrop(
  { playerId, wasOn, overPitch, overBench, onCount, overPlayerId }: DropContext
): any {
  if (!playerId) return { kind: null };

  // Dropped onto somebody else. This is the case that was silently wrong:
  // the incoming player was simply placed at the same coordinates, so two
  // chips stacked and the newer drew over the older. It looked exactly like
  // the field player's statistics had become the substitute's.
  if (overPlayerId && overPlayerId !== playerId) {
    // A substitute onto a player on the pitch is a SUBSTITUTION: that is
    // what dropping one on the other means to anyone doing it.
    if (!wasOn) return { kind: 'sub', outId: overPlayerId };
    // Two players already on simply exchange places.
    return { kind: 'swap', otherId: overPlayerId };
  }

  if (overPitch && !wasOn) {
    // A twelfth player on the pitch is not a mistake anyone spots at the
    // time: the minutes and the goal differential are simply wrong
    // afterwards, for everybody. Refused, and said so.
    if ((onCount || 0) >= pmMaxOnPitch()) {
      return { kind: null, reason: 'full' };
    }
    return { kind: 'on' };
  }

  // Already on, dropped somewhere else on the pitch: that is a reposition,
  // not a substitution. It appends NO event — where a player stands is not
  // a statistic, and recording it would put noise in the log that undo would
  // then have to step back through.
  if (overPitch && wasOn) return { kind: 'move' };

  if (overBench && wasOn) return { kind: 'off' };
  return { kind: null };
}

/**
 * Which starters a saved lineup puts on the pitch, and where.
 *
 * x/y is preferred when the lineup has it — the coach may have nudged a
 * player off their slot — and the formation's own slot position is the
 * fallback, so a lineup saved before positions were stored still lays out
 * correctly rather than piling everyone at the origin.
 */
export function pmStartersFromLineup(lineup: any): any[] {
  if (!lineup) return [];
  const slots = lineupSlots(lineup.formation || '4-4-2');
  const bySlot = new Map(slots.map(s => [s.slot, s]));

  return (lineup.players || [])
    .filter((r: any) => r && r.player_id && r.role !== 'bench')
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .slice(0, pmMaxOnPitch())
    .map((r: any) => {
      // A position the coach dragged on the LINEUP screen is in that
      // screen's coordinates, so it is respread here just like a slot is.
      // Only the shape is adjusted; who stands where is theirs.
      const fallback = bySlot.get(r.slot);
      const raw = {
        x: r.x != null ? Number(r.x) : (fallback ? fallback.x : 50),
        y: r.y != null ? Number(r.y) : (fallback ? fallback.y : 50)
      };
      const p = pmSpreadSlot(raw);
      return { playerId: r.player_id, ...pmClampPosition(p.x, p.y) };
    });
}

export function pmColumns(): PmColumn[] {
  return [
    { key: 'number',  label: '#',       desc: false, text: false, get: (p) => p.number == null ? null : Number(p.number) },
    { key: 'name',    label: 'Player',  desc: false, text: true,  get: (p) => String(p.name || '').toLowerCase() },
    { key: 'plus',    label: 'Plus',    desc: true,  text: false, get: (p, s) => s.plus || 0 },
    { key: 'minus',   label: 'Minus',   desc: true,  text: false, get: (p, s) => s.minus || 0 },
    { key: 'score',   label: 'Score',   desc: true,  text: false, get: (p, s) => s.score || 0 },
    { key: 'gd',      label: 'GD',      desc: true,  text: false, get: (p, s) => s.goalDiff || 0 },
    { key: 'mins',    label: 'Mins',    desc: true,  text: false, get: (p, s) => s.secondsPlayed || 0 },
    { key: 'shots',   label: 'Shots',   desc: true,  text: false, get: (p, s) => s.shots || 0 },
    { key: 'goals',   label: 'Goals',   desc: true,  text: false, get: (p, s) => s.goals || 0 },
    { key: 'assists', label: 'Assists', desc: true,  text: false, get: (p, s) => s.assists || 0 }
  ];
}

/** The sheet's rows, in the order the chosen column asks for. */
export function pmSortedRows(
  stats: Map<string, any>, squad: any[], sortKey: string, reversed: boolean
): any[] {
  const key = sortKey || 'mins';
  const cols = pmColumns();
  const col = cols.find(c => c.key === key) || cols.find(c => c.key === 'mins');
  const flip = (col.desc ? -1 : 1) * (reversed ? -1 : 1);

  return (squad || [])
    .map(p => ({ p, s: stats.get(p.id) || {} }))
    .sort((a, b) => {
      const x = col.get(a.p, a.s);
      const y = col.get(b.p, b.s);

      // A player with no recording number has nothing to compare, so they
      // sink whichever way the column is pointed rather than leading it.
      if (x === null || y === null) {
        if (x === y) return String(a.p.name || '').localeCompare(String(b.p.name || ''));
        return x === null ? 1 : -1;
      }

      if (col.text) return flip * String(x).localeCompare(String(y));
      if (x !== y) return flip * (x - y);
      // A tie on any figure falls back to the name, so the order is stable
      // between redraws — the sheet redraws every second while the clock
      // runs, and rows swapping places under the eye reads as a fault.
      return String(a.p.name || '').localeCompare(String(b.p.name || ''));
    });
}
