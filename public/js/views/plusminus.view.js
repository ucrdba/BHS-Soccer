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
 * Classic script — no imports. Extends the prototype from app.core.js.
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
  async pmAppend(kind, playerId) {
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

  pmResolveDrop({ playerId, wasOn, overPitch, overBench, onCount }) {
    if (!playerId) return { kind: null };

    if (overPitch && !wasOn) {
      // A twelfth player on the pitch is not a mistake anyone spots at the
      // time: the minutes and the goal differential are simply wrong
      // afterwards, for everybody. Refused, and said so.
      if ((onCount || 0) >= this.pmMaxOnPitch()) {
        return { kind: null, reason: 'full' };
      }
      return { kind: 'on' };
    }

    if (overBench && wasOn) return { kind: 'off' };
    return { kind: null };
  },

  async pmMovePlayer(playerId, toPitch) {
    const on = this.pmOnPitch();
    const drop = this.pmResolveDrop({
      playerId,
      wasOn: on.includes(playerId),
      overPitch: toPitch,
      overBench: !toPitch,
      onCount: on.length
    });

    if (drop.reason === 'full') {
      this.pmSay(`${this.pmMaxOnPitch()} players are already on. Take one off first.`);
      this.renderPlusMinus();
      return;
    }
    if (!drop.kind) return;
    this.pmSay('');
    await this.pmAppend(drop.kind, playerId);
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

    const team = (this.data.teams || []).find(t => t.id === this.activeTeamId);
    if (window.supabaseService?.isConfigured() && team) {
      const opened = await window.supabaseService.openStatMatch(
        this.activeTeamId, team.school_id, this._pmMatchFixture);
      if (opened && opened.ok) {
        this._pmMatchId = opened.id;
        this._pmEvents = (await window.supabaseService.fetchStatEvents(opened.id)) || [];
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

    const chip = (p, isOn) => {
      const s = stats.get(p.id) || {};
      return `
        <button type="button" class="pm-chip${isOn ? ' on' : ''}"
                data-player-id="${esc(p.id)}"
                title="${esc(p.name)} — tap +1, two fingers or right-click −1, drag to substitute">
          <span class="pm-num">${p.recordingNumber != null ? esc(p.recordingNumber) : (p.number != null ? esc(p.number) : '—')}</span>
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
          <button type="button" class="btn btn-secondary pm-small" onclick="app.pmEndPeriod()">End period</button>
          <button type="button" class="btn btn-secondary pm-small" onclick="app.pmUndo()">&#8630; Undo</button>
        </div>
      </div>

      <div class="pm-events">
        ${evBtn('shot', 'SHOT')}${evBtn('goal', 'GOAL')}${evBtn('assist', 'ASSIST')}
        <span class="pm-armed-hint">${armed ? 'Now tap the player' : 'Tap an event, then a player'}</span>
      </div>

      <div class="pm-pitch-label">
        ON THE PITCH &middot; ${on.length} / ${this.pmMaxOnPitch()}
        <span class="pm-hint">tap +1 &middot; hold or two fingers &minus;1 &middot; drag to sub</span>
      </div>

      <!-- A drawn pitch rather than a green box, so the tracking screen reads
           the same way as the lineup one: markings, then players on top of
           them, then the bench underneath. -->
      <div class="pm-pitch" id="pmPitch">
        <div class="pm-chips">
          ${on.map(id => byId.get(id)).filter(Boolean).map(p => chip(p, true)).join('')
            || '<span class="pm-empty">Drag players onto the pitch to start.</span>'}
        </div>
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
      { key: 'number',  label: '#',       desc: false, text: false, get: (p, s) => p.recordingNumber == null ? null : Number(p.recordingNumber) },
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
              <td>${p.recordingNumber != null ? esc(p.recordingNumber) : '—'}</td>
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
        if (toPitch || toBench) this.pmMovePlayer(d.playerId, toPitch);
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
              <td class="l">${p.recordingNumber != null ? esc(p.recordingNumber) : ''}</td>
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
