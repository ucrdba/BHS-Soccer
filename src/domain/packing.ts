/**
 * Packing points: opponents taken out of play by a completed pass or dribble.
 *
 * Two records can exist for one match. Live taps (a 'packing' event in the
 * stat_events log) carry only a player and a count. Video tags carry the
 * action, the receiver of a pass, and the count. **Once a match has any video
 * tag, the tags count and the live taps do not** — the video is the careful
 * record. Both are kept; removing every tag brings the live taps back.
 *
 * This module is the only place that rule lives. Every report reads a match
 * through `matchPacking`, so no two screens can disagree about which source
 * counted.
 *
 * Live entry never asks who received the ball or whether it was a pass, so a
 * live-sourced match reports those as null, not 0: zero would be a claim
 * nobody made.
 */

export const PACKING_MIN = 1;
export const PACKING_MAX = 11;

export type PackingAction = 'pass' | 'dribble';
export type PackingSource = 'video' | 'live' | 'none';

export interface PackingTag {
  id?: string;
  playerId: string;
  receiverId: string | null;
  action: PackingAction;
  bypassed: number;
  videoSeconds: number | null;
  isDeleted?: boolean;
  createdAt?: string;
}

export interface LiveEventLike {
  kind: string;
  playerId?: string | null;
  bypassed?: number | null;
  isDeleted?: boolean;
}

export interface PlayerPacking {
  packing: number;
  received: number | null;
  byPass: number | null;
  byDribble: number | null;
}

export interface MatchPacking {
  source: PackingSource;
  players: Map<string, PlayerPacking>;
}

export type VideoTime = { ok: true; seconds: number | null } | { ok: false; error: string };

export function validBypassed(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= PACKING_MIN && n <= PACKING_MAX;
}

const liveTaps = (events: LiveEventLike[]) =>
  (events || []).filter(e => e && e.kind === 'packing' && !e.isDeleted && !!e.playerId);

const keptTags = (tags: PackingTag[]) => (tags || []).filter(t => t && !t.isDeleted);

export function livePackingCount(events: LiveEventLike[]): number {
  return liveTaps(events).length;
}

export function packingSource(events: LiveEventLike[], tags: PackingTag[]): PackingSource {
  if (keptTags(tags).length > 0) return 'video';
  if (liveTaps(events).length > 0) return 'live';
  return 'none';
}

export function matchPacking(
  events: LiveEventLike[], tags: PackingTag[], playerIds: string[] = []
): MatchPacking {
  const source = packingSource(events, tags);
  const video = source === 'video';
  const players = new Map<string, PlayerPacking>();

  const ensure = (id: string): PlayerPacking => {
    if (!players.has(id)) {
      players.set(id, {
        packing: 0,
        received: video ? 0 : null,
        byPass: video ? 0 : null,
        byDribble: video ? 0 : null
      });
    }
    return players.get(id)!;
  };
  playerIds.forEach(ensure);

  if (video) {
    for (const t of keptTags(tags)) {
      const p = ensure(t.playerId);
      p.packing += t.bypassed;
      if (t.action === 'pass') {
        p.byPass = (p.byPass ?? 0) + t.bypassed;
        if (t.receiverId) {
          const r = ensure(t.receiverId);
          r.received = (r.received ?? 0) + t.bypassed;
        }
      } else {
        p.byDribble = (p.byDribble ?? 0) + t.bypassed;
      }
    }
  } else {
    for (const e of liveTaps(events)) ensure(e.playerId as string).packing += Number(e.bypassed) || 0;
  }

  return { source, players };
}

const TIME_REFUSAL = 'Type the video time as m:ss or h:mm:ss — for example 23:41 or 1:02:05 — or leave it blank.';

/**
 * Where an action is in the video, in seconds.
 *
 * Not `parseTimeToSeconds`: that reads '.' as ':' and serves fitness times.
 * Whole minutes may run past 59 (`75:30`), because a video player's scrub bar
 * often shows a long video that way and the reading is unambiguous. Seconds
 * are always two digits, so `23:5` is refused rather than guessed.
 */
export function parseVideoTime(text: string | null | undefined): VideoTime {
  const s = String(text ?? '').trim();
  if (s === '') return { ok: true, seconds: null };

  let m = /^(\d+):(\d{2})$/.exec(s);
  if (m) {
    const sec = Number(m[2]);
    if (sec > 59) return { ok: false, error: TIME_REFUSAL };
    return { ok: true, seconds: Number(m[1]) * 60 + sec };
  }

  m = /^(\d+):(\d{2}):(\d{2})$/.exec(s);
  if (m) {
    const min = Number(m[2]);
    const sec = Number(m[3]);
    if (min > 59 || sec > 59) return { ok: false, error: TIME_REFUSAL };
    return { ok: true, seconds: Number(m[1]) * 3600 + min * 60 + sec };
  }

  return { ok: false, error: TIME_REFUSAL };
}

export function formatVideoTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  const n = Math.max(0, Math.floor(seconds));
  const two = (v: number) => String(v).padStart(2, '0');
  if (n < 3600) return `${Math.floor(n / 60)}:${two(n % 60)}`;
  return `${Math.floor(n / 3600)}:${two(Math.floor((n % 3600) / 60))}:${two(n % 60)}`;
}

/** Timed tags in video order; untimed ones after them, in the order entered. */
export function orderTags(tags: PackingTag[]): PackingTag[] {
  return (tags || [])
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const x = a.t.videoSeconds, y = b.t.videoSeconds;
      if (x != null && y != null && x !== y) return x - y;
      if (x != null && y == null) return -1;
      if (x == null && y != null) return 1;
      return a.i - b.i;
    })
    .map(v => v.t);
}

/**
 * The player wearing this shirt number.
 *
 * The shirt, because that is what the video shows — never the recording
 * number. Null unless exactly one player wears it; `candidates` lets the screen
 * offer a choice when two do.
 */
export function resolveShirtNumber(squad: any[], text: string): { player: any | null; candidates: any[] } {
  const s = String(text ?? '').trim();
  if (!/^\d+$/.test(s)) return { player: null, candidates: [] };
  const n = Number(s);
  const candidates = (squad || []).filter(p => p && p.number != null && Number(p.number) === n);
  return { player: candidates.length === 1 ? candidates[0] : null, candidates };
}
