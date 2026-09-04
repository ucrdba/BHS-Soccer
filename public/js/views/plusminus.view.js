/**
 * BHS Soccer — plus/minus match tracking.
 *
 * A statistician stands on the touchline with a phone and records what
 * happens. Everything here is shaped by that: the match does not wait, so a
 * gesture that needs a second look is a gesture that loses a goal.
 *
 * The gestures, and why each is what it is:
 *
 *   ONE TAP on a player on the pitch                → plus
 *   TWO FINGERS, LONG PRESS, or right-click         → minus
 *   DRAG a player between pitch and bench           → substitution
 *
 * Three ways to say minus because two fingers do not always fit on a chip,
 * and the match does not wait for a second attempt. Right-click is the desktop
 * equivalent, with the context menu suppressed.
 *
 * The long press does compete with the drag — that is why it was left out at
 * first — so it is cancelled the moment the finger moves past the drag
 * threshold. A press that stays put is a minus; a press that travels is a
 * substitution; neither can be both.
 *
 * Shots, goals and assists are EVENT FIRST: press the event, then the player.
 * The event buttons are big fixed targets that can be hit without looking,
 * where a player's position moves as the lineup changes. Assist is its own
 * button rather than a prompt after every goal, so nothing is asked when
 * nobody assisted.
 *
 * Nothing is counted here. Every figure comes from window.plusMinus.replay()
 * over the event log, so this file only ever appends events and draws the
 * result — see src/data/plus-minus.ts for why that matters.
 *
 * Numbers shown here are UNIFORM numbers, not recording numbers. This screen
 * is read against players on a pitch wearing shirts, so the number on the
 * chip has to be the number on the back. The recording number is for paper
 * score sheets and belongs on the session grid, not here.
 *
 * Classic script — no imports. Extends the prototype from app.core.js.
 *
 * Uses lineupFormations()/lineupSlots() from lineup.view.js for the shape
 * picker rather than defining a second set of formations: two lists of the
 * same shapes drift, and 4-3-3 means the same thing on both screens. Both
 * files extend the prototype at load time, so the order they appear in
 * index.html does not matter — but the dependency is real, and a test loading
 * this file alone has to load that one too.
 */

Object.assign(BHSSoccerApp.prototype, {

  // ── State ────────────────────────────────────────────────────────────────

  /** Seconds on the match clock right now, including the running part. */
  pmClock() {
    const base = this._pmClockBase || 0;
    if (!this._pmRunningSince) return base;
    return base + Math.floor((Date.now() - this._pmRunningSince) / 1000);
  },

  /** Statistics as they stand, ticked forward to this instant. */
  pmStats() {
    const ids = (this.data.players || [])
      .filter(p => !p.is_deleted && !p.isDeleted).map(p => p.id);
    return window.plusMinus.replayTo(this._pmEvents || [], ids, this.pmClock());
  },

  pmOnPitch() { return window.plusMinus.onPitch(this._pmEvents || []); },

  /**
   * Append an event, to the screen first and the database after.
   *
   * The screen must not wait for the network: a statistician who taps and sees
   * nothing taps again, and the match has moved on by the time the round trip
   * lands. If the write fails the event is rolled back out of the local log
   * and said so — silently keeping it would make the screen disagree with what
   * a reload would show.
   */
  /**
   * Has this match's clock ever been started?
   *
   * Read from the event log rather than from _pmClockBase, because the base
   * is zero both before kick-off AND straight after a reset — the log is the
   * only thing that distinguishes "not started yet" from "started, and back
   * at zero".
   */
  pmClockEverStarted() {
    return (this._pmEvents || []).some(e => e.kind === 'clock_start');
  },

  async pmAppend(kind, playerId) {
    // Plus and minus before kick-off are stamped at 0:00, and every player is
    // credited zero minutes for the whole match, because minutes are derived
    // from substitutions measured against the clock. Nothing at the time says
    // so: the counters go up, the sheet looks right, and the minutes column
    // is quietly worthless afterwards.
    //
    // The first plus of a match is exactly when a coach would notice a
    // forgotten clock, so that is where to say it. Refused here rather than
    // in the tap handler, alongside the eleven-player limit and for the same
    // reason: it is a fact about the match, not about one gesture, and the
    // tap, the long press, the two-finger press and the right click all
    // arrive through this one door.
    if ((kind === 'plus' || kind === 'minus') && !this.pmClockEverStarted()) {
      this.pmSay('Start the clock first — otherwise this lands at 0:00 and nobody is credited any minutes.');
      this.renderPlusMinus();
      return;
    }

    // The limit lives HERE as well as on the drag, because it is a fact about
    // the match rather than about one gesture: a twelfth player is wrong
    // however they got on. The minutes and the goal differential of everyone
    // on the pitch are quietly wrong afterwards, and nothing at the time says
    // so — which is exactly the class of bug worth refusing at the source.
    if (kind === 'on') {
      const on = this.pmOnPitch();
      if (on.includes(playerId)) return;                  // already on
      if (on.length >= this.pmMaxOnPitch()) {
        this.pmSay(`${this.pmMaxOnPitch()} players are already on. Take one off first.`);
        this.renderPlusMinus();
        return;
      }
    }

    // Past every guard, so whatever the last one complained about has been
    // dealt with. Without this the "start the clock" line stays on screen
    // after the coach has started it and recorded successfully, which reads
    // as the refusal still standing.
    this.pmSay('');

    const at = this.pmClock();
    const event = {
      kind, playerId: playerId || null, atSeconds: at,
      period: this._pmPeriod || 1,
      seq: (this._pmSeq = (this._pmSeq || 0) + 1)
    };
    this._pmEvents = (this._pmEvents || []).concat([event]);
    this.renderPlusMinus();

    if (!this._pmMatchId || !window.supabaseService?.isConfigured()) return;

    const res = await window.supabaseService.appendStatEvent(this._pmMatchId, event);
    if (res && res.ok) { event.id = res.id; return; }

    this._pmEvents = this._pmEvents.filter(e => e !== event);
    this.pmSay((res && res.error) || 'That did not save.');
    this.renderPlusMinus();
  },

  /** Undo the most recent event, on screen and in the log. */
  async pmUndo() {
    const events = this._pmEvents || [];
    if (events.length === 0) return this.pmSay('Nothing to undo.');

    const last = events[events.length - 1];
    this._pmEvents = events.slice(0, -1);
    // The clock is derived from clock_start/stop, so undoing one has to put
    // the running state back or the clock keeps counting from nothing.
    if (last.kind === 'clock_start') { this._pmClockBase = last.atSeconds; this._pmRunningSince = null; }
    if (last.kind === 'clock_stop') { this._pmClockBase = last.atSeconds; this._pmRunningSince = Date.now(); }
    this.pmSay('');
    this.renderPlusMinus();

    if (last.id && window.supabaseService?.isConfigured()) {
      const res = await window.supabaseService.undoStatEvent(last.id);
      if (!res || !res.ok) this.pmSay((res && res.error) || 'Undone here, but not in the database.');
    }
  },

  pmSay(message) {
    this._pmError = message || '';
    const el = document.getElementById('pmError');
    if (el) el.textContent = this._pmError;
  },

  // ── The clock ────────────────────────────────────────────────────────────

  async pmToggleClock() {
    if (this._pmRunningSince) {
      this._pmClockBase = this.pmClock();
      this._pmRunningSince = null;
      await this.pmAppend('clock_stop');
    } else {
      this._pmRunningSince = Date.now();
      await this.pmAppend('clock_start');
    }
  },

  /**
   * Set the match clock to a value.
   *
   * Bracketed by a stop and a start, which is what keeps minutes honest: the
   * stop credits everyone on the pitch up to the OLD time, and the start
   * resumes from the NEW one. Without that, moving the clock forward would
   * hand every player on the pitch the jump as minutes they did not play, and
   * moving it back would silently stop their minutes until the clock caught up
   * again.
   *
   * Events replay in the order they were recorded rather than by clock stamp,
   * so winding the clock back does not reorder what already happened — see
   * orderEvents() in src/data/plus-minus.ts.
   */
  async pmSetClock(seconds) {
    const target = Math.max(0, Math.round(Number(seconds) || 0));
    const wasRunning = !!this._pmRunningSince;

    if (wasRunning) {
      this._pmClockBase = this.pmClock();
      this._pmRunningSince = null;
      await this.pmAppend('clock_stop');
    }

    this._pmClockBase = target;
    this.pmSay('');

    if (wasRunning) {
      this._pmRunningSince = Date.now();
      await this.pmAppend('clock_start');
    } else {
      this.renderPlusMinus();
    }
  },

  /**
   * Ask for a time and set it.
   *
   * Read through parseTimeToSeconds, so "12:30", "12.30" and a bare "750" all
   * work — the same rule as everywhere else a time is typed, rather than a
   * second one to remember.
   */
  async pmPromptClock() {
    const current = window.plusMinus.formatClock(this.pmClock());
    const typed = window.prompt(
      'Set the match clock.\n\nmm:ss — for example 12:30, or 12.30, or 750 for seconds.',
      current);
    if (typed === null) return;                       // cancelled

    const seconds = window.supabaseService.parseTimeToSeconds(String(typed).trim());
    if (seconds === null) {
      this.pmSay(`"${typed}" is not a time. Use mm:ss, for example 12:30.`);
      this.renderPlusMinus();
      return;
    }
    await this.pmSetClock(seconds);
  },

  /** Back to 0:00, confirmed because it is rarely what you meant mid-match. */
  async pmResetClock() {
    if (this.pmClock() > 0 && !window.confirm(
      `Set the match clock back to 0:00?\n\n`
      + `Minutes already played are kept — the clock simply starts counting again `
      + `from zero.`)) return;
    await this.pmSetClock(0);
  },

  /**
   * End the period.
   *
   * Stops the clock first: a half that ends with the clock running keeps
   * crediting everyone on the pitch with time they did not play, and nobody
   * notices until the minutes look wrong at full time.
   */
  async pmEndPeriod() {
    if (this._pmRunningSince) {
      this._pmClockBase = this.pmClock();
      this._pmRunningSince = null;
      await this.pmAppend('clock_stop');
    }
    this._pmPeriod = (this._pmPeriod || 1) + 1;
    await this.pmAppend('period');
  },

  // ── Arming an event ──────────────────────────────────────────────────────

  /**
   * Arm an event, so the next tap on a player records it.
   *
   * Pressing the armed event again disarms it, which is how a mis-press is
   * cancelled without recording anything against anybody.
   */
  pmArm(kind) {
    this._pmArmed = this._pmArmed === kind ? null : kind;
    this.pmSay('');
    this.renderPlusMinus();
  },

  /**
   * A team goal. Nobody is tapped: the differential of everyone currently on
   * the pitch moves, and who scored is a separate SHOT/GOAL press.
   */
  async pmTeamGoal(mine) {
    await this.pmAppend(mine ? 'goal_for' : 'goal_against');
  },

  // ── Tapping a player ─────────────────────────────────────────────────────

  /**
   * What a tap means, given what is armed and how many fingers landed.
   *
   * Split out from the event plumbing so the rules can be tested: which
   * gesture produces which event is the part worth protecting, and browser
   * pointer behaviour is not.
   */
  pmResolveTap({ armed, fingers, rightClick, onPitch }) {
    if (armed) return { kind: armed, disarm: true };
    // Two fingers, or the mouse's second button, is the minus gesture.
    if (fingers >= 2 || rightClick) return onPitch ? { kind: 'minus' } : { kind: null };
    // A plain tap only counts for someone actually on the pitch: a bench
    // player cannot have made a good play.
    return onPitch ? { kind: 'plus' } : { kind: null };
  },

  async pmTapPlayer(playerId, opts) {
    const on = this.pmOnPitch().includes(playerId);
    const decision = this.pmResolveTap({
      armed: this._pmArmed || null,
      fingers: (opts && opts.fingers) || 1,
      rightClick: !!(opts && opts.rightClick),
      onPitch: on
    });
    if (!decision.kind) return;
    if (decision.disarm) this._pmArmed = null;
    await this.pmAppend(decision.kind, playerId);
  },

  // ── Where players stand ──────────────────────────────────────────────────

  /**
   * Positions are PRESENTATION, not statistics.
   *
   * Where a chip sits on the pitch changes nothing about plus, minus, goal
   * differential or minutes played — those come from the event log, and a
   * position is only there so the shape on screen matches the shape on the
   * grass and a statistician can find a player without reading names.
   *
   * So they are kept per device in localStorage rather than written as events
   * or into the lineup table. Two consequences worth knowing: a second device
   * tracking the same match arranges its own pitch, and reusing the coach's
   * saved lineup here would let a statistician's drag overwrite the team sheet.
   */
  pmPosKey() { return 'bhs_pm_pos_' + (this._pmMatchId || this._pmMatchFixture || 'default'); },

  pmLoadPositions() {
    this._pmPos = {};
    try {
      const raw = localStorage.getItem(this.pmPosKey());
      if (raw) this._pmPos = JSON.parse(raw) || {};
    } catch (e) { /* private mode, or nonsense in storage; an empty pitch is fine */ }
  },

  pmSavePositions() {
    try { localStorage.setItem(this.pmPosKey(), JSON.stringify(this._pmPos || {})); }
    catch (e) { /* storage blocked; positions last as long as the screen does */ }
  },

  /**
   * Clamped so a chip can never be dragged off its own pitch.
   *
   * The margin is half a chip: positions are the CENTRE of the chip, and
   * without it half of one sits outside the boundary where it cannot be
   * tapped.
   */
  pmClampPosition(x, y) {
    const clamp = (v) => Math.max(8, Math.min(92, Number(v) || 0));
    return { x: clamp(x), y: clamp(y) };
  },

  pmSetPosition(playerId, x, y) {
    if (!this._pmPos) this._pmPos = {};
    this._pmPos[playerId] = this.pmClampPosition(x, y);
    this.pmSavePositions();
  },

  /**
   * Lay the players out in a formation.
   *
   * Reuses lineupFormations() rather than defining a second set: two lists of
   * the same shapes drift, and the coach who set 4-3-3 on the lineup screen
   * means the same thing here.
   *
   * Only as many slots as there are players, in the order they went on, so a
   * side playing with ten is not left with a gap where a formation says there
   * should be somebody.
   */
  pmApplyFormation(name) {
    this._pmFormation = name || '4-4-2';
    const slots = this.lineupSlots(this._pmFormation);
    const on = this.pmOnPitch();

    if (!this._pmPos) this._pmPos = {};
    on.forEach((id, i) => {
      const slot = slots[i];
      if (slot) this._pmPos[id] = this.pmClampPosition(slot.x, slot.y);
    });
    this.pmSavePositions();
    this.renderPlusMinus();
  },

  /**
   * Where a player sits, or a sensible place if nobody has said.
   *
   * Spread across the middle rather than stacked at one point: an unplaced
   * squad piled on the centre spot is unusable, and the coach reaches for the
   * formation button the moment they see it.
   */
  pmPositionFor(playerId, index, total) {
    const pos = (this._pmPos || {})[playerId];
    if (pos) return pos;
    const perRow = Math.min(6, Math.max(3, Math.ceil(total / 2)));
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    return this.pmClampPosition(
      12 + (col + 0.5) * (76 / perRow),
      70 - row * 22
    );
  },

  // ── Substitutions ────────────────────────────────────────────────────────

  /**
   * What a drop means: onto the pitch, off it, or nothing.
   *
   * Dropping a player where they already are is how a drag gets cancelled.
   */
  /**
   * How many may be on the pitch at once.
   *
   * Eleven, and a method rather than a literal so a small-sided fixture is one
   * line away rather than a search through the file.
   */
  pmMaxOnPitch() { return 11; },

  pmResolveDrop({ playerId, wasOn, overPitch, overBench, onCount, overPlayerId }) {
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
      if ((onCount || 0) >= this.pmMaxOnPitch()) {
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
  },

  async pmMovePlayer(playerId, toPitch, at, overPlayerId) {
    const on = this.pmOnPitch();
    const drop = this.pmResolveDrop({
      playerId,
      wasOn: on.includes(playerId),
      overPitch: toPitch,
      overBench: !toPitch,
      onCount: on.length,
      overPlayerId: overPlayerId || null
    });

    if (drop.reason === 'full') {
      this.pmSay(`${this.pmMaxOnPitch()} players are already on. Take one off first.`);
      this.renderPlusMinus();
      return;
    }
    if (!drop.kind) return;
    this.pmSay('');

    if (drop.kind === 'move') {
      if (at) { this.pmSetPosition(playerId, at.x, at.y); this.renderPlusMinus(); }
      return;
    }

    if (drop.kind === 'swap') {
      // Positions only. Both players stay on, so nothing about the match
      // changed and no event belongs in the log.
      const a = (this._pmPos || {})[playerId];
      const b = (this._pmPos || {})[drop.otherId];
      if (a && b) {
        this.pmSetPosition(playerId, b.x, b.y);
        this.pmSetPosition(drop.otherId, a.x, a.y);
      }
      this.renderPlusMinus();
      return;
    }

    if (drop.kind === 'sub') {
      // The one going off FIRST, or an eleventh-and-twelfth pair exists for an
      // instant and the limit refuses the player coming on.
      const spot = (this._pmPos || {})[drop.outId];
      await this.pmAppend('off', drop.outId);
      if (spot) this.pmSetPosition(playerId, spot.x, spot.y);
      await this.pmAppend('on', playerId);
      return;
    }

    // A player coming on lands where they were dropped, so a substitution
    // puts them in the position they are actually taking.
    if (drop.kind === 'on' && at) this.pmSetPosition(playerId, at.x, at.y);
    await this.pmAppend(drop.kind, playerId);
  },

  // ── Starting from the lineup ─────────────────────────────────────────────

  /**
   * Which starters a saved lineup puts on the pitch, and where.
   *
   * Pure, so the rules can be tested without a database: what counts as a
   * starter, where they stand, and how many are taken.
   *
   * x/y is preferred when the lineup has it — the coach may have nudged a
   * player off their slot — and the formation's own slot position is the
   * fallback, so a lineup saved before positions were stored still lays out
   * correctly rather than piling everyone at the origin.
   */
  pmStartersFromLineup(lineup) {
    if (!lineup) return [];
    const slots = this.lineupSlots(lineup.formation || '4-4-2');
    const bySlot = new Map(slots.map(s => [s.slot, s]));

    return (lineup.players || [])
      .filter(r => r && r.player_id && r.role !== 'bench')
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .slice(0, this.pmMaxOnPitch())
      .map(r => {
        const fallback = bySlot.get(r.slot);
        const x = r.x != null ? Number(r.x) : (fallback ? fallback.x : 50);
        const y = r.y != null ? Number(r.y) : (fallback ? fallback.y : 50);
        return { playerId: r.player_id, ...this.pmClampPosition(x, y) };
      });
  },

  /**
   * Put the saved lineup on the pitch.
   *
   * Only for a match nobody has started: the check is whether ANY player has
   * ever been sent on, not who is on now — a match where everyone was
   * substituted off is finished, not empty, and repopulating it would put
   * eleven players back on at full time.
   *
   * The fixture's own lineup wins over the default one, because a coach who
   * set a lineup for this match meant it for this match.
   */
  async pmSeedFromLineup(force) {
    // Opening a match must not repopulate one that has already been played;
    // the coach asking for it explicitly is a different thing.
    if (!force && (this._pmEvents || []).some(e => e.kind === 'on')) return false;
    if (!window.supabaseService?.isConfigured() || !this.activeTeamId) return false;

    const lineup =
      (await window.supabaseService.fetchLineup(this.activeTeamId, this._pmMatchFixture))
      || (this._pmMatchFixture
            ? await window.supabaseService.fetchLineup(this.activeTeamId, null)
            : null);

    // Anyone already on keeps their place and their minutes: loading the
    // lineup over a part-filled pitch tops it up rather than starting again.
    const already = this.pmOnPitch();
    const starters = this.pmStartersFromLineup(lineup)
      .filter(p => !already.includes(p.playerId))
      .slice(0, Math.max(0, this.pmMaxOnPitch() - already.length));
    if (starters.length === 0) return false;

    this._pmFormation = (lineup && lineup.formation) || this._pmFormation || '';
    // Positions first, so each player is drawn where they belong the moment
    // they appear rather than jumping there afterwards.
    if (!this._pmPos) this._pmPos = {};
    starters.forEach(p => { this._pmPos[p.playerId] = { x: p.x, y: p.y }; });
    this.pmSavePositions();

    for (const p of starters) await this.pmAppend('on', p.playerId);
    return true;
  },

  /**
   * Take everyone off the pitch.
   *
   * Recorded as `off` events at the current clock rather than deleting
   * anything: the log is append-only, and everything earned up to this point —
   * plus, minus, goal differential, minutes played — stays exactly as it was.
   * Clearing the pitch is something that HAPPENED, not something that unhappens.
   *
   * Confirmed, because it stops every player's minutes at once and the button
   * sits beside the clock.
   */
  async pmResetPitch() {
    const on = this.pmOnPitch();
    if (on.length === 0) { this.pmSay('Nobody is on the pitch.'); return; }

    if (!window.confirm(
      `Take all ${on.length} player${on.length === 1 ? '' : 's'} off the pitch?\n\n`
      + `Everything recorded so far is kept — minutes simply stop counting until `
      + `players are sent on again.`)) return;

    for (const id of on) await this.pmAppend('off', id);

    // Verify rather than assume. Each `off` is a separate write, so one
    // refused in the middle would leave part of the squad on the pitch still
    // accruing minutes — and the only sign would be chips that did not
    // disappear, which is easy to read as a slow screen.
    const left = this.pmOnPitch();
    if (left.length > 0) {
      const names = left
        .map(id => (this.data.players || []).find(p => p.id === id))
        .filter(Boolean).map(p => p.name);
      this.pmSay(`${left.length} still on the pitch: ${names.join(', ')}. Try again.`);
      this.renderPlusMinus();
      return;
    }
    this.pmSay('');
  },

  /**
   * Put the saved lineup on, on demand.
   *
   * The automatic version refuses a match that has already started, which is
   * right for opening one — but after clearing the pitch a coach explicitly
   * wants it back, and that is what this is for. Same source, same positions,
   * without the guard.
   */
  async pmLoadLineup() {
    const on = this.pmOnPitch();
    if (on.length > 0 && !window.confirm(
      `${on.length} player${on.length === 1 ? ' is' : 's are'} already on the pitch.\n\n`
      + `Load the saved lineup as well? Only players who are not already on will `
      + `be added, up to ${this.pmMaxOnPitch()}.`)) return;

    const added = await this.pmSeedFromLineup(true);
    if (!added) {
      this.pmSay('No saved lineup for this team yet. Set one on the Schedule first.');
      this.renderPlusMinus();
    }
  },

  // ── Opening ──────────────────────────────────────────────────────────────

  async openPlusMinus(matchId) {
    this._pmMatchFixture = matchId || null;
    this._pmEvents = [];
    this._pmArmed = null;
    this._pmError = '';
    this._pmClockBase = 0;
    this._pmRunningSince = null;
    this._pmPeriod = 1;
    this._pmMatchId = null;
    this._pmFormation = '';
    this.pmLoadPositions();

    const team = (this.data.teams || []).find(t => t.id === this.activeTeamId);
    if (window.supabaseService?.isConfigured() && team) {
      const opened = await window.supabaseService.openStatMatch(
        this.activeTeamId, team.school_id, this._pmMatchFixture);
      if (opened && opened.ok) {
        this._pmMatchId = opened.id;
        this._pmEvents = (await window.supabaseService.fetchStatEvents(opened.id)) || [];
        // Stamp an explicit order on what came back. Without it, loaded events
        // fall back to their ARRAY INDEX for ordering while events added this
        // session use `seq` counting from 1 — two different scales for the same
        // comparison, so a new event can sort before an older one that shares
        // its clock second. Ordering decides who was on the pitch when a goal
        // went in, so the two must never be mixed.
        this._pmEvents.forEach((e, i) => { e.seq = i; });
        this._pmSeq = this._pmEvents.length;
        // Rebuild the clock from the log rather than starting at zero: a
        // statistician reopening after a dead battery must not lose the half.
        this._pmPeriod = window.plusMinus.currentPeriod(this._pmEvents);
        const last = this._pmEvents[this._pmEvents.length - 1];
        this._pmClockBase = last ? last.atSeconds : 0;
        this._pmRunningSince = window.plusMinus.clockRunning(this._pmEvents) ? Date.now() : null;
      } else {
        this._pmError = (opened && opened.error) || 'Could not open that match.';
      }
    }
    // Re-read now the match id is known: the storage key depends on it, and
    // the first read used the fixture id or nothing.
    this.pmLoadPositions();

    // A match nobody has started begins from the coach's lineup, so the
    // statistician is not arranging eleven players at kickoff.
    await this.pmSeedFromLineup();

    this.renderPlusMinus();
    const modal = document.getElementById('plusMinusModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }

    // One second is the resolution the clock is displayed at; anything faster
    // redraws for nothing.
    if (this._pmTimer) clearInterval(this._pmTimer);
    this._pmTimer = setInterval(() => {
      if (this._pmRunningSince) this.renderPlusMinus();
    }, 1000);
  },

  closePlusMinus() {
    if (this._pmTimer) { clearInterval(this._pmTimer); this._pmTimer = null; }
  },

  // ── Drawing ──────────────────────────────────────────────────────────────

  renderPlusMinus() {
    const body = document.getElementById('plusMinusBody');
    if (!body) return;

    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const stats = this.pmStats();
    const on = this.pmOnPitch();
    const squad = (this.data.players || []).filter(p => !p.is_deleted && !p.isDeleted);
    const byId = new Map(squad.map(p => [p.id, p]));
    const score = window.plusMinus.scoreLine(this._pmEvents || []);
    const running = !!this._pmRunningSince;

    const chip = (p, isOn, place) => {
      const s = stats.get(p.id) || {};
      const at = place
        ? ` style="left:${place.x}%; bottom:${place.y}%;"`
        : '';
      return `
        <button type="button" class="pm-chip${isOn ? ' on' : ''}${place ? ' placed' : ''}"
                data-player-id="${esc(p.id)}"${at}
                title="${esc(p.name)} — tap +1, hold or two fingers −1, drag to move or substitute">
          <span class="pm-num">${p.number != null ? esc(p.number) : '—'}</span>
          <span class="pm-name">${esc(this.lineupShortName ? this.lineupShortName(p) : p.name)}</span>
          <span class="pm-score">${(s.score || 0) > 0 ? '+' : ''}${s.score || 0}</span>
        </button>`;
    };

    const armed = this._pmArmed;
    const evBtn = (kind, label) =>
      `<button type="button" class="pm-event${armed === kind ? ' armed' : ''}"
               onclick="app.pmArm('${kind}')">${label}</button>`;

    body.innerHTML = `
      <div class="pm-bar">
        <button type="button" class="pm-clock${running ? ' running' : ''}"
                onclick="app.pmToggleClock()">
          <span class="pm-time">${window.plusMinus.formatClock(this.pmClock())}</span>
          <span class="pm-clocklabel">${running ? 'Stop' : 'Start'}</span>
        </button>
        <div class="pm-score-box">
          <button type="button" class="pm-goal us" onclick="app.pmTeamGoal(true)">WE SCORED</button>
          <span class="pm-scoreline">${score.for} &ndash; ${score.against}</span>
          <button type="button" class="pm-goal them" onclick="app.pmTeamGoal(false)">THEY SCORED</button>
        </div>
        <div class="pm-meta">
          <span class="text-muted">Period ${this._pmPeriod || 1}</span>
          <button type="button" class="btn btn-secondary pm-small" title="Type the match clock"
                  onclick="app.pmPromptClock()">Set clock</button>
          <button type="button" class="btn btn-secondary pm-small" title="Back to 0:00"
                  onclick="app.pmResetClock()">Reset clock</button>
          <button type="button" class="btn btn-secondary pm-small" onclick="app.pmEndPeriod()">End period</button>
          <button type="button" class="btn btn-secondary pm-small" onclick="app.pmUndo()">&#8630; Undo</button>
          <button type="button" class="btn btn-secondary pm-small" title="Put the saved lineup on the pitch"
                  onclick="app.pmLoadLineup()">Load lineup</button>
          <button type="button" class="btn btn-secondary pm-small" title="Take everyone off the pitch"
                  onclick="app.pmResetPitch()">Clear pitch</button>
        </div>
      </div>

      <div class="pm-events">
        ${evBtn('shot', 'SHOT')}${evBtn('goal', 'GOAL')}${evBtn('assist', 'ASSIST')}
        <span class="pm-armed-hint">${armed ? 'Now tap the player' : 'Tap an event, then a player'}</span>
      </div>

      <div class="pm-pitch-label">
        <span>
          ON THE PITCH &middot; ${on.length} / ${this.pmMaxOnPitch()}
          <span class="pm-hint">tap +1 &middot; hold or two fingers &minus;1 &middot; drag to move or sub</span>
        </span>
        <span class="pm-formation">
          <label for="pmFormation">Shape</label>
          <select id="pmFormation" class="form-control"
                  onchange="app.pmApplyFormation(this.value)">
            ${Object.keys(this.lineupFormations()).map(f =>
              `<option value="${f}"${(this._pmFormation || '') === f ? ' selected' : ''}>${f}</option>`
            ).join('')}
          </select>
        </span>
      </div>

      <!-- A drawn pitch rather than a green box, so the tracking screen reads
           the same way as the lineup one: markings, then players on top of
           them, then the bench underneath. -->
      <div class="pm-pitch" id="pmPitch">
        ${on.map((id, i) => {
          const p = byId.get(id);
          if (!p) return '';
          return chip(p, true, this.pmPositionFor(id, i, on.length));
        }).join('')
          || '<span class="pm-empty">Drag players onto the pitch to start.</span>'}
      </div>

      <div class="pm-pitch-label">SUBS &middot; ${squad.length - on.length}</div>
      <div class="pm-bench" id="pmBench">
        <div class="pm-chips">
          ${squad.filter(p => !on.includes(p.id)).map(p => chip(p, false)).join('')
            || '<span class="text-muted" style="font-size:0.8rem;">Everyone is on.</span>'}
        </div>
      </div>

      <p id="pmError" class="text-danger" style="font-size:0.8rem; min-height:1em;">${esc(this._pmError || '')}</p>

      ${this.renderPlusMinusTable(stats, squad)}`;

    this.attachPlusMinusGestures();
  },

  /**
   * How each column of the sheet is read, and which way it sorts first.
   *
   * Every figure but the number and the name reads highest-first: at half time
   * the question is who is doing well and who is not, and one click should
   * answer it rather than two.
   */
  pmColumns() {
    return [
      { key: 'number',  label: '#',       desc: false, text: false, get: (p, s) => p.number == null ? null : Number(p.number) },
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
  },

  /**
   * Click a heading to sort by it; click it again to reverse.
   *
   * Minutes played by default, because at half time the question is who to
   * change and scanning twenty-five alphabetical rows for it wastes the
   * interval.
   */
  setPlusMinusSort(key) {
    if ((this._pmSort || 'mins') === key) {
      this._pmSortReversed = !this._pmSortReversed;
    } else {
      this._pmSort = key;
      this._pmSortReversed = false;
    }
    this.renderPlusMinus();
  },

  /** The sheet's rows, in the order the chosen column asks for. */
  pmSortedRows(stats, squad) {
    const key = this._pmSort || 'mins';
    const cols = this.pmColumns();
    const col = cols.find(c => c.key === key) || cols.find(c => c.key === 'mins');
    const flip = (col.desc ? -1 : 1) * (this._pmSortReversed ? -1 : 1);

    return squad
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
  },

  /** The sheet: the eight columns asked for, in that order. */
  renderPlusMinusTable(stats, squad) {
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const rows = this.pmSortedRows(stats, squad);
    const active = this._pmSort || 'mins';

    const th = (col) => {
      const on = col.key === active;
      // The arrow shows the order in force, not merely that a column is sorted.
      const desc = col.desc !== !!this._pmSortReversed;
      const arrow = on ? (desc ? ' \u25BC' : ' \u25B2') : '';
      return `<th class="sortable${col.text ? ' col-text' : ''}${on ? ' sorted' : ''}"
                  title="Sort by ${esc(col.label)}"
                  onclick="app.setPlusMinusSort('${col.key}')">${esc(col.label)}${arrow}</th>`;
    };

    // Ten columns do not fit a phone. Wrapped in its own scroller so every
    // heading can still be reached and tapped — a column past the edge with
    // nothing to scroll is a column that cannot be sorted.
    return `
      <div class="pm-tablewrap">
      <table class="data-table pm-table">
        <thead><tr>${this.pmColumns().map(th).join('')}</tr></thead>
        <tbody>
          ${rows.map(({ p, s }) => `
            <tr>
              <td>${p.number != null ? esc(p.number) : '—'}</td>
              <td class="col-text">${esc(p.name)}</td>
              <td>${s.plus || 0}</td>
              <td>${s.minus || 0}</td>
              <td><strong>${(s.score || 0) > 0 ? '+' : ''}${s.score || 0}</strong></td>
              <td><strong>${(s.goalDiff || 0) > 0 ? '+' : ''}${s.goalDiff || 0}</strong></td>
              <td>${window.plusMinus.minutesPlayed(s.secondsPlayed || 0)}</td>
              <td>${s.shots || 0}</td>
              <td>${s.goals || 0}</td>
              <td>${s.assists || 0}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>`;
  },

  /**
   * Bind the gestures once, by delegation.
   *
   * The body is rebuilt every second while the clock runs, so per-element
   * listeners would be discarded and rebound sixty times a minute.
   */
  attachPlusMinusGestures() {
    const body = document.getElementById('plusMinusBody');
    if (!body || body.dataset.pmBound === '1') return;
    body.dataset.pmBound = '1';

    let drag = null;
    // Set when a gesture has already been recorded, so the pointer events that
    // follow the same finger-down do not record it a second time.
    let handled = false;

    /**
     * Two fingers is a minus, and it fires HERE — the moment the second finger
     * lands, against the player under the first.
     *
     * The first version only remembered "two fingers happened" and left the
     * decision to the next pointerup. Two fingers therefore did nothing at the
     * time and turned the NEXT single tap into a minus — against whichever
     * player was touched next, which is not even the same player.
     *
     * Pointer events do not report how many fingers are down, which is why
     * this is a touch listener; elementFromPoint rather than e.target because
     * the second finger may land on a different element from the first, and
     * the first is the one that identifies the player being marked.
     */
    body.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length < 2) return;
      const el = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
      const chip = el && el.closest ? el.closest('.pm-chip') : null;
      if (!chip) return;

      // Or the browser pinch-zooms the page instead of counting a minus.
      e.preventDefault();
      handled = true;

      // A drag may have begun on the first finger. Abandon it: two fingers is
      // a minus, not a substitution. The long-press timer goes with it, or the
      // same gesture would count two minuses.
      if (drag) { drag.chip.classList.remove('dragging'); drag = null; }
      if (typeof cancelPress === 'function') cancelPress();

      this.pmTapPlayer(chip.dataset.playerId, { fingers: 2 });
    }, { passive: false });

    // Only once every finger has lifted, or the second finger coming up would
    // re-arm the tap path while the first is still down.
    body.addEventListener('touchend', (e) => {
      if (!e.touches || e.touches.length === 0) handled = false;
    });

    // The minus gesture on a desktop. Without suppressing the menu, a
    // right-click opens the browser's context menu over the pitch.
    body.addEventListener('contextmenu', (e) => {
      const chip = e.target.closest('.pm-chip');
      if (!chip) return;
      e.preventDefault();
      this.pmTapPlayer(chip.dataset.playerId, { rightClick: true });
    });

    /**
     * A press held still is a minus.
     *
     * 500ms: long enough that a normal tap never reaches it, short enough that
     * it does not feel like waiting. Cancelled by any movement past the drag
     * threshold, which is what keeps it from fighting the substitution
     * gesture — a press that travels is a drag, a press that stays is a minus.
     */
    const LONG_PRESS_MS = 500;
    let pressTimer = null;
    const cancelPress = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    };

    body.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest('.pm-chip');
      if (!chip) return;
      if (e.button === 2) return;            // handled by contextmenu
      drag = {
        playerId: chip.dataset.playerId, chip,
        x: e.clientX, y: e.clientY, moved: false
      };
      try { chip.setPointerCapture(e.pointerId); } catch (_) {}

      cancelPress();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (!drag || drag.moved || handled) return;
        handled = true;
        drag.chip.classList.remove('dragging');
        chip.classList.add('pm-pressed');
        setTimeout(() => chip.classList.remove('pm-pressed'), 250);
        this.pmTapPlayer(chip.dataset.playerId, { fingers: 2 });
      }, LONG_PRESS_MS);
    });

    body.addEventListener('pointermove', (e) => {
      if (!drag || drag.moved) return;
      if (Math.abs(e.clientX - drag.x) > 8 || Math.abs(e.clientY - drag.y) > 8) {
        drag.moved = true;
        drag.chip.classList.add('dragging');
        // Moving means this is a substitution, not a minus.
        cancelPress();
      }
    });

    const finish = (e) => {
      cancelPress();
      if (!drag) return;
      const d = drag; drag = null;
      d.chip.classList.remove('dragging');
      try { d.chip.releasePointerCapture(e.pointerId); } catch (_) {}

      // The two-finger minus already fired. Without this the finger coming up
      // would add a plus on top of it.
      if (handled) return;

      if (d.moved) {
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const toPitch = !!(under && under.closest && under.closest('#pmPitch'));
        const toBench = !!(under && under.closest && under.closest('#pmBench'));

        // Where on the pitch, as a percentage, so a position survives the
        // screen being rotated or the window resized.
        let at = null;
        const pitch = document.getElementById('pmPitch');
        if (toPitch && pitch && pitch.getBoundingClientRect) {
          const r = pitch.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            at = {
              x: ((e.clientX - r.left) / r.width) * 100,
              // Measured from the bottom: y=0 is the team's own goal line, the
              // way a coach draws it and the way lineupFormations() defines it.
              y: ((r.bottom - e.clientY) / r.height) * 100
            };
          }
        }

        // Whose chip is under the finger, if anyone's. The dragged chip stays
        // where it was rather than following the pointer, so it can be the one
        // returned — dropping a player on themselves is not a substitution.
        const overChip = under && under.closest ? under.closest('.pm-chip') : null;
        const overPlayerId = overChip && overChip.dataset.playerId !== d.playerId
          ? overChip.dataset.playerId
          : null;

        if (toPitch || toBench) this.pmMovePlayer(d.playerId, toPitch, at, overPlayerId);
        return;
      }

      this.pmTapPlayer(d.playerId, { fingers: 1 });
    };

    body.addEventListener('pointerup', finish);
    body.addEventListener('pointercancel', () => {
      cancelPress();
      if (drag) drag.chip.classList.remove('dragging');
      drag = null;
    });
  },

  /**
   * Print the sheet, for half time and full time.
   *
   * Its own window and light stylesheet, as with every other printed view
   * here: the app's dark theme prints as a wall of ink.
   */
  printPlusMinus() {
    const squad = (this.data.players || []).filter(p => !p.is_deleted && !p.isDeleted);
    const stats = this.pmStats();
    const label = this.activeTeamLabel ? this.activeTeamLabel() : { org: '', team: '' };
    const score = window.plusMinus.scoreLine(this._pmEvents || []);
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const win = window.open('', '_blank');
    if (!win) {
      window.alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
      return;
    }

    win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>Plus / Minus — ${esc(label.team || 'Team')}</title>
      <style>
        @page { margin: 12mm; }
        body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; color: #111; font-size: 10pt; }
        h1 { font-size: 16pt; margin: 0; }
        .sub { color: #555; font-size: 9pt; margin: 2px 0 12px 0; }
        table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
        th { text-align: right; font-size: 7.5pt; text-transform: uppercase; color: #555; padding: 2px 5px; }
        th.l, td.l { text-align: left; }
        td { padding: 4px 5px; border-bottom: 1px solid #ddd; text-align: right; }
        tr { break-inside: avoid; page-break-inside: avoid; }
      </style></head><body>
      <h1>${esc(label.org || '')} ${esc(label.team || '')} &mdash; Plus / Minus</h1>
      <div class="sub">
        ${score.for} &ndash; ${score.against} &middot; period ${this._pmPeriod || 1}
        &middot; clock ${window.plusMinus.formatClock(this.pmClock())}
        &middot; ${new Date().toLocaleString()}
      </div>
      <table>
        <thead><tr>
          <th class="l">#</th><th class="l">Player</th>
          <th>Plus</th><th>Minus</th><th>Score</th><th>GD</th>
          <th>Mins</th><th>Shots</th><th>Goals</th><th>Assists</th>
        </tr></thead>
        <tbody>
          ${squad.map(p => {
            const s = stats.get(p.id) || {};
            return `<tr>
              <td class="l">${p.number != null ? esc(p.number) : ''}</td>
              <td class="l">${esc(p.name)}</td>
              <td>${s.plus || 0}</td><td>${s.minus || 0}</td>
              <td>${(s.score || 0) > 0 ? '+' : ''}${s.score || 0}</td>
              <td>${(s.goalDiff || 0) > 0 ? '+' : ''}${s.goalDiff || 0}</td>
              <td>${window.plusMinus.minutesPlayed(s.secondsPlayed || 0)}</td>
              <td>${s.shots || 0}</td><td>${s.goals || 0}</td><td>${s.assists || 0}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

});
