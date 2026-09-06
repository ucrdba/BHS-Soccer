/**
 * Recording a match live.
 *
 * **The one rule this store exists to enforce: a plus or a minus may only be
 * recorded while the clock is RUNNING.** Not "has been started" — running.
 *
 * Every event is stamped with the match clock, and playing time and goal
 * difference are *derived from those stamps* rather than stored as counters.
 * Before kick-off everything stamps at 0:00 and, since minutes come from
 * substitutions measured against the clock, every player finishes the match
 * credited with zero. While merely paused an event stamps at a minute that
 * has already passed and lands against whoever was on the pitch *then*.
 *
 * Neither says so at the time: the counters go up and the sheet looks right.
 *
 * The guard lives in `append` and nowhere else. The tap, the long press, the
 * two-finger press and the right click all arrive through that one door, and
 * a guard repeated four times is a guard that drifts. Substitutions stay
 * outside it — arranging the starting shape is how a coach begins — and so
 * does starting the clock, or the guard would deadlock.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabaseService } from '../data/supabase';
import {
  pmClock, pmClockRunning, pmClockEverStarted, pmMaxOnPitch,
  pmStartersFromLineup
} from '../domain/plus-minus-court';
import {
  replay, orderEvents, onPitch as pitchOf, formatClock,
  type StatEvent, type StatKind
} from '../data/plus-minus';

export interface WriteResult { ok: boolean; error?: string }

/** Recorded against the clock, so gated on it. */
const CLOCK_GATED: StatKind[] = ['plus', 'minus', 'shot', 'goal', 'assist'];

export const usePlusMinusStore = defineStore('plusMinus', () => {
  const events = ref<StatEvent[]>([]);
  const statMatchId = ref<string | null>(null);
  const clockBase = ref(0);
  const runningSince = ref<number | null>(null);
  const period = ref(1);
  const armed = ref<StatKind | null>(null);
  const notice = ref('');
  const loading = ref(false);
  const seq = ref(0);

  /** Bumped by a ticker so the clock re-renders while it runs. */
  const now = ref(Date.now());

  const clock = computed(() => pmClock(clockBase.value, runningSince.value, now.value));
  const clockText = computed(() => formatClock(clock.value));
  const running = computed(() => pmClockRunning(runningSince.value));
  const everStarted = computed(() => pmClockEverStarted(events.value));
  const onPitch = computed(() => pitchOf(events.value));

  /*
   * `statsFor` is deliberately NOT here.
   *
   * Replaying the log is a pure function of `events` and a squad, and
   * `createTestingPinia` with `stubActions` replaces every function a setup
   * store returns — a component test would get `undefined` back from it. The
   * components call `replay(orderEvents(...))` themselves. Same trap the
   * lineup store hit; see CLAUDE.md.
   */

  function say(message: string): void { notice.value = message || ''; }

  async function open(
    teamId: string | null, schoolId: string | null,
    matchId: string | null, label?: string
  ): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'Choose a team first.' };
    if (!schoolId) return { ok: false, error: 'No organization for this team.' };

    loading.value = true;
    try {
      events.value = [];
      clockBase.value = 0;
      runningSince.value = null;
      period.value = 1;
      armed.value = null;
      say('');

      const res = await supabaseService.openStatMatch(teamId, schoolId, matchId, label);
      if (!res?.ok || !res.id) {
        return { ok: false, error: res?.error || 'Could not open that match.' };
      }
      statMatchId.value = res.id;

      const rows = await supabaseService.fetchStatEvents(res.id);
      if (rows) {
        events.value = rows.map((r: any) => ({
          id: r.id, kind: r.kind, playerId: r.player_id,
          atSeconds: r.at_seconds, period: r.period
        }));
        // The clock picks up where the log left it, rather than at zero.
        const last = events.value[events.value.length - 1];
        clockBase.value = last ? last.atSeconds : 0;
        period.value = last?.period || 1;
      }
      return { ok: true };
    } finally {
      loading.value = false;
    }
  }

  /**
   * The single door every event goes through.
   *
   * Optimistic: the event lands on the board first so the coach sees it
   * immediately, and is rolled back off if the write is refused. A board
   * showing a plus the database rejected is worse than a slow one.
   */
  async function append(kind: StatKind, playerId?: string | null): Promise<WriteResult> {
    // THE RULE. See the module comment.
    if (CLOCK_GATED.includes(kind) && !running.value) {
      say(everStarted.value
        ? 'The clock is stopped. Start it to record plus and minus.'
        : 'Please start the clock to record plus and minus — before kick-off they '
          + 'stamp at 0:00 and nobody is credited any minutes.');
      return { ok: false, error: notice.value };
    }

    // Here as well as on the drag, because a twelfth player is wrong however
    // they got on — and afterwards the minutes and goal difference of
    // everyone on the pitch are quietly wrong.
    if (kind === 'on') {
      const on = onPitch.value;
      if (on.includes(playerId as string)) return { ok: true };
      if (on.length >= pmMaxOnPitch()) {
        say(`${pmMaxOnPitch()} players are already on. Take one off first.`);
        return { ok: false, error: notice.value };
      }
    }

    // Past every guard, so whatever the last refusal complained about has
    // been dealt with. Leaving "start the clock" on screen after the coach
    // has started it reads as the refusal still standing.
    say('');

    const event: StatEvent = {
      kind,
      playerId: playerId || null,
      atSeconds: clock.value,
      period: period.value,
      seq: (seq.value += 1)
    };
    events.value = events.value.concat([event]);

    if (!statMatchId.value) return { ok: true };

    const res = await supabaseService.appendStatEvent(statMatchId.value, event as any);
    if (res?.ok) {
      // Found by seq, not by identity: `events` is a deep ref, so what is in
      // the array is a reactive proxy and never === the object appended.
      const stored = events.value.find(e => e.seq === event.seq);
      if (stored) stored.id = res.id;
      return { ok: true };
    }

    events.value = events.value.filter(e => e.seq !== event.seq);
    say(res?.error || 'That did not save.');
    return { ok: false, error: notice.value };
  }

  /**
   * Undo the most recent event.
   *
   * The clock is derived from `clock_start` / `clock_stop`, so undoing one
   * has to put the running state back or the clock counts on from nothing.
   */
  async function undo(): Promise<WriteResult> {
    if (events.value.length === 0) {
      say('Nothing to undo.');
      return { ok: false, error: notice.value };
    }

    const last = events.value[events.value.length - 1];
    events.value = events.value.slice(0, -1);

    if (last.kind === 'clock_start') { clockBase.value = last.atSeconds; runningSince.value = null; }
    if (last.kind === 'clock_stop') {
      clockBase.value = last.atSeconds;
      runningSince.value = Date.now();
      now.value = runningSince.value;
    }
    say('');

    if (last.id) {
      const res = await supabaseService.undoStatEvent(last.id);
      if (!res?.ok) {
        say(res?.error || 'Undone here, but not in the database.');
        return { ok: false, error: notice.value };
      }
    }
    return { ok: true };
  }

  async function toggleClock(): Promise<WriteResult> {
    if (runningSince.value) {
      clockBase.value = clock.value;
      runningSince.value = null;
      return append('clock_stop');
    }

    const at = Date.now();
    runningSince.value = at;
    // `now` only moves when the ticker asks, so without this the first event
    // after a start is measured against a stale reading and stamps a second
    // BEFORE the clock began. One second, silently, on the event a coach is
    // most likely to record immediately after kick-off.
    now.value = at;
    return append('clock_start');
  }

  /**
   * Move the clock, bracketed by a stop and a start.
   *
   * That is what keeps minutes honest: the stop credits everyone on the pitch
   * up to the OLD time and the start resumes from the NEW one. Without it,
   * winding forward hands every player on the pitch the jump as minutes they
   * did not play.
   */
  async function setClock(seconds: number): Promise<WriteResult> {
    const target = Math.max(0, Math.round(Number(seconds) || 0));
    const wasRunning = !!runningSince.value;

    if (wasRunning) {
      clockBase.value = clock.value;
      runningSince.value = null;
      await append('clock_stop');
    }

    clockBase.value = target;
    say('');

    if (wasRunning) {
      runningSince.value = Date.now();
      now.value = runningSince.value;
      return append('clock_start');
    }
    return { ok: true };
  }

  /**
   * End the period, stopping the clock first.
   *
   * A half that ends with the clock running keeps crediting everyone on the
   * pitch with time they did not play, and nobody notices until the minutes
   * look wrong at full time.
   */
  async function endPeriod(): Promise<WriteResult> {
    if (runningSince.value) {
      clockBase.value = clock.value;
      runningSince.value = null;
      await append('clock_stop');
    }
    period.value += 1;
    return append('period');
  }

  /** Pressing the armed event again disarms it, cancelling a mis-press. */
  function arm(kind: StatKind | null): void {
    armed.value = armed.value === kind ? null : kind;
    say('');
  }

  /**
   * A team goal: nobody is tapped.
   *
   * The differential of everyone currently on the pitch moves, and who
   * scored is a separate press.
   */
  async function teamGoal(mine: boolean): Promise<WriteResult> {
    return append(mine ? 'goal_for' : 'goal_against');
  }

  async function movePlayer(playerId: string, toPitch: boolean): Promise<WriteResult> {
    return append(toPitch ? 'on' : 'off', playerId);
  }

  /** Put the saved XI on the pitch, so a coach does not place eleven by hand. */
  async function seedFromLineup(lineup: any): Promise<WriteResult> {
    const starters = pmStartersFromLineup(lineup);
    for (const s of starters) {
      const id = s.playerId || s.player_id || s.id;
      if (id) await append('on', id);
    }
    return { ok: true };
  }

  function tick(): void { now.value = Date.now(); }

  return {
    events, statMatchId, clockBase, runningSince, period, armed, notice, loading,
    clock, clockText, running, everStarted, onPitch,
    open, append, undo, toggleClock, setClock, endPeriod, arm, teamGoal,
    movePlayer, seedFromLineup, say, tick
  };
});
