/**
 * BHS Soccer — lineup builder and lineup card.
 *
 * A coach picks a formation, puts players in its slots, and prints a card to
 * hand to the officials: the XI with slot, uniform number, name and grade,
 * then the bench.
 *
 * Two decisions shape everything here.
 *
 * Placement is DRAG AND DROP, built on Pointer Events rather than HTML5 drag.
 * HTML5 drag events never fire on touch, and this screen is used on a phone at
 * the ground, so a dragstart/drop implementation would work on the desk and
 * not at the match. Pointer events are one API for mouse and finger alike.
 *
 * A press that never moves is still a tap, so tap-a-player then tap-a-slot
 * keeps working — useful one-handed, and the only route available to a
 * keyboard. Nothing was taken away to add dragging.
 *
 * The slot and the coordinates are BOTH stored. The slot ("LB", "CM") is what
 * the card prints and is stable; x/y is where the player sits on the diagram,
 * which the coach may nudge. Deriving either from the other loses whichever
 * was moved.
 *
 * Classic script — no imports. Extends the prototype defined in app.core.js,
 * so index.html must load this after it.
 */

Object.assign(BHSSoccerApp.prototype, {

  /**
   * The formations offered, as slots with a label and a place on the pitch.
   *
   * x and y run 0-100 across and down, with y=0 the team's own goal line, so
   * the keeper is at the bottom of the diagram and the forwards at the top —
   * the way a coach draws it facing the opposition.
   */
  // Formation geometry, squad partitioning and the drop rules live in
  // src/domain/lineup.ts and reach this classic script through window.
  // See docs/superpowers/specs/2026-09-05-vue-migration-design.md.
  lineupFormations() {
    return window.lineupDomain.lineupFormations();
  },

  lineupSlots(formation) {
    return window.lineupDomain.lineupSlots(formation);
  },

  /** Everyone available to pick, in the order a team sheet reads. */
  lineupSquad() {
    return window.lineupDomain.lineupSquad(this.data.players || []);
  },

  /**
   * Put the selected player in a slot.
   *
   * A slot holds one player and a player holds one slot, so assigning either
   * side displaces whatever was there. Silently allowing two players in one
   * slot would print a card with twelve names.
   */
  assignLineupSlot(slot, playerId) {
    const asg = this._lineupAssign || (this._lineupAssign = {});
    return window.lineupDomain.assignLineupSlot(asg, slot, playerId);
  },

  clearLineupSlot(slot) {
    if (this._lineupAssign) window.lineupDomain.clearLineupSlot(this._lineupAssign, slot);
  },

  /** The XI, in the formation's own order. */
  lineupStarters(formation) {
    return window.lineupDomain.lineupStarters(
      this._lineupAssign || {}, this.lineupSquad(), formation);
  },

  /** Everyone dressed but not starting. */
  lineupBench(formation) {
    return window.lineupDomain.lineupBench(
      this._lineupAssign || {}, this.lineupSquad(), formation, this._lineupBench || null);
  },

  /** Rows in the shape saveLineup expects. */
  lineupRowsForSave(formation) {
    return window.lineupDomain.lineupRowsForSave(
      this._lineupAssign || {}, this.lineupSquad(), formation, this._lineupBench || null);
  },

  /**
   * What a drop should do, decided without touching the DOM.
   *
   * Kept separate from the pointer plumbing so the rules can be tested: the
   * plumbing is browser behaviour, but "dropping a starter on the squad list
   * takes them off the pitch" is a rule, and a rule that only exists inside an
   * event handler is a rule nobody can check.
   */
  resolveLineupDrop(drop) {
    return window.lineupDomain.resolveLineupDrop(drop);
  },

  /** Carry out a resolved drop. */
  applyLineupDrop(drop) {
    const asg = this._lineupAssign || (this._lineupAssign = {});
    return window.lineupDomain.applyLineupDrop(asg, drop);
  },

  /**
   * Bind dragging once, by delegation.
   *
   * The body is rebuilt by innerHTML on every change, so per-element listeners
   * would be thrown away each time and rebound wrongly. One listener on the
   * container survives every redraw.
   */
  attachLineupDrag() {
    const body = document.getElementById('lineupBody');
    if (!body || body.dataset.dragBound === '1') return;
    body.dataset.dragBound = '1';

    let drag = null;

    const ghostFor = (el) => {
      const g = document.createElement('div');
      g.className = 'lineup-ghost';
      g.textContent = el.dataset.dragLabel || '';
      document.body.appendChild(g);
      return g;
    };

    const moveGhost = (e) => {
      if (!drag || !drag.ghost) return;
      drag.ghost.style.left = e.clientX + 'px';
      drag.ghost.style.top = e.clientY + 'px';
    };

    body.addEventListener('pointerdown', (e) => {
      // The bench toggle is a button in its own right and must not start a drag.
      if (e.target.closest('.benchtag')) return;
      const handle = e.target.closest('[data-player-id]');
      if (!handle) return;

      drag = {
        playerId: handle.dataset.playerId,
        fromSlot: handle.dataset.slot || null,
        startX: e.clientX, startY: e.clientY,
        moved: false, ghost: null, handle
      };
      // Capture so the drag survives the pointer leaving the element, and so
      // a redraw mid-drag cannot strand it.
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });

    body.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved) {
        // A few pixels of slop: a finger never holds perfectly still, and
        // treating every press as a drag would break tapping.
        const far = Math.abs(e.clientX - drag.startX) > 6 || Math.abs(e.clientY - drag.startY) > 6;
        if (!far) return;
        drag.moved = true;
        drag.ghost = ghostFor(drag.handle);
        document.body.classList.add('lineup-dragging');
      }
      moveGhost(e);
    });

    const finish = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.ghost) d.ghost.remove();
      document.body.classList.remove('lineup-dragging');
      try { d.handle.releasePointerCapture(e.pointerId); } catch (_) {}

      if (!d.moved) {
        // Never moved: this was a tap.
        if (d.fromSlot) this.tapLineupSlot(d.fromSlot);
        else this.pickLineupPlayer(d.playerId);
        return;
      }

      // The ghost follows the pointer, so it would always be the top element.
      // It is pointer-events:none for exactly this reason.
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const slotEl = under && under.closest ? under.closest('.lineup-slot') : null;
      const squadEl = under && under.closest ? under.closest('.lineup-squad') : null;

      const changed = this.applyLineupDrop(this.resolveLineupDrop({
        playerId: d.playerId,
        fromSlot: d.fromSlot,
        overSlot: slotEl ? slotEl.dataset.slot : null,
        overSquad: !!squadEl
      }));

      // A dropped player is placed, so nothing stays in hand either way.
      this._lineupPicked = null;
      if (changed) this.renderLineupBody();
      else this.renderLineupBody();
    };

    body.addEventListener('pointerup', finish);
    body.addEventListener('pointercancel', (e) => {
      if (!drag) return;
      if (drag.ghost) drag.ghost.remove();
      document.body.classList.remove('lineup-dragging');
      drag = null;
    });

    // Pointer events do not fire for a keyboard activation, so Enter and Space
    // on a focused control still need a way through.
    body.addEventListener('click', (e) => {
      if (e.detail !== 0) return;                 // 0 means keyboard-generated
      if (e.target.closest('.benchtag')) return;
      const handle = e.target.closest('[data-player-id]');
      if (!handle) return;
      if (handle.dataset.slot) this.tapLineupSlot(handle.dataset.slot);
      else this.pickLineupPlayer(handle.dataset.playerId);
    });
  },

  // ── The screen ───────────────────────────────────────────────────────────

  /**
   * Load a saved lineup into the working state.
   *
   * Split out from opening the modal so copying from another fixture goes
   * through exactly the same path — a copy that took a different route would
   * eventually diverge from a reopen.
   */
  applySavedLineup(saved) {
    if (!saved) return false;
    this._lineupFormation = saved.formation || '4-4-2';
    const asg = {};
    const bench = {};
    (saved.players || []).forEach(r => {
      if (r.role === 'bench') bench[r.player_id] = true;
      else if (r.slot) asg[r.slot] = r.player_id;
    });
    this._lineupAssign = asg;
    // Only narrow the bench if one was actually recorded; otherwise every
    // non-starter is available, which is the sensible default.
    this._lineupBench = Object.keys(bench).length ? bench : null;
    return true;
  },

  async openLineupModal(matchId) {
    this._lineupMatchId = matchId || null;
    this._lineupError = '';
    this._lineupPicked = null;
    this._lineupAssign = {};
    this._lineupBench = null;
    this._lineupFormation = '4-4-2';
    this._lineupLoaded = false;
    this._lineupIndex = [];

    if (window.supabaseService?.isConfigured() && this.activeTeamId) {
      // A saved lineup for THIS fixture reopens automatically — that is what
      // recalling one means, and asking would be friction for the common case.
      const saved = await window.supabaseService.fetchLineup(this.activeTeamId, this._lineupMatchId);
      this._lineupLoaded = this.applySavedLineup(saved);
      this._lineupIndex =
        (await window.supabaseService.fetchTeamLineups(this.activeTeamId)) || [];
    }

    this.renderLineupBody();
    this.renderLineupSources();
    const modal = document.getElementById('lineupModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  /** A saved lineup described the way a coach would name it. */
  lineupSourceLabel(row) {
    if (!row.match_id) return 'Default lineup';
    const m = (this.data.schedule || []).find(x => x.id === row.match_id);
    if (!m) return 'A past fixture';
    const when = this.displayMatchDate ? this.displayMatchDate(m.date) : (m.date || '');
    return `${m.opponent || 'Opponent'} — ${when}`.trim();
  },

  /** The lineups worth offering as a starting point: every one but this one. */
  lineupCopySources() {
    return (this._lineupIndex || [])
      .filter(r => (r.match_id || null) !== (this._lineupMatchId || null))
      .map(r => ({ ...r, label: this.lineupSourceLabel(r) }));
  },

  renderLineupSources() {
    const wrap = document.getElementById('lineupCopyWrap');
    if (!wrap) return;
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const sources = this.lineupCopySources();
    if (sources.length === 0) { wrap.innerHTML = ''; return; }

    wrap.innerHTML = `
      <label for="lineupCopyFrom" class="text-muted" style="font-size:0.74rem; text-transform:uppercase;">Copy from</label>
      <select id="lineupCopyFrom" class="form-control" style="max-width:230px;">
        <option value="">&mdash; another match &mdash;</option>
        ${sources.map(r => `<option value="${esc(r.match_id || '')}">${esc(r.label)}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-secondary" style="padding:6px 12px; font-size:0.78rem;"
              onclick="app.copyLineupFrom()">Copy</button>`;
  },

  /**
   * Take another fixture's arrangement as a starting point.
   *
   * Loads it into the working lineup WITHOUT saving: the same XI usually needs
   * a change or two for the next opponent, and writing it immediately would
   * commit a lineup the coach has not looked at yet. It is theirs once they
   * press Save.
   */
  async copyLineupFrom() {
    const sel = document.getElementById('lineupCopyFrom');
    const err = document.getElementById('lineupError');
    const say = (m) => { this._lineupError = m; if (err) err.textContent = m; };
    if (!sel) return;

    const value = sel.value;
    if (!value && sel.selectedIndex <= 0) return say('Choose a match to copy from.');

    const placed = Object.keys(this._lineupAssign || {}).length;
    if (placed > 0 && !window.confirm(
      `Replace the ${placed} player${placed === 1 ? '' : 's'} currently placed with that lineup?\n\n`
      + `Nothing is saved until you press Save lineup.`)) return;

    const saved = await window.supabaseService.fetchLineup(this.activeTeamId, value || null);
    if (!saved) return say('That lineup could not be read.');

    this.applySavedLineup(saved);
    this._lineupPicked = null;
    say('Copied. Press Save lineup to keep it for this match.');
    this.renderLineupBody();
  },

  setLineupFormation(formation) {
    // Assignments are keyed by slot label, so a slot the new shape also has
    // keeps its player and the rest are freed rather than silently dropped.
    this._lineupFormation = formation;
    const keep = new Set(this.lineupSlots(formation).map(s => s.slot));
    const asg = this._lineupAssign || {};
    Object.keys(asg).forEach(k => { if (!keep.has(k)) delete asg[k]; });
    this.renderLineupBody();
  },

  pickLineupPlayer(playerId) {
    // Tapping the picked player again puts them down.
    this._lineupPicked = this._lineupPicked === playerId ? null : playerId;
    this.renderLineupBody();
  },

  tapLineupSlot(slot) {
    const picked = this._lineupPicked;
    if (!picked) {
      // Nothing in hand: tapping an occupied slot picks that player up.
      const held = (this._lineupAssign || {})[slot];
      if (held) { this.clearLineupSlot(slot); this._lineupPicked = held; }
      this.renderLineupBody();
      return;
    }
    this.assignLineupSlot(slot, picked);
    this._lineupPicked = null;
    this.renderLineupBody();
  },

  toggleLineupBench(playerId) {
    // == null, not === null: the property is undefined until the modal sets
    // it, and a strict check threw on the first tap from that state.
    if (this._lineupBench == null) {
      // First narrowing: start from everyone available, then remove this one.
      const all = {};
      this.lineupSquad().forEach(p => { all[p.id] = true; });
      this._lineupBench = all;
    }
    if (this._lineupBench[playerId]) delete this._lineupBench[playerId];
    else this._lineupBench[playerId] = true;
    this.renderLineupBody();
  },

  /**
   * Take everybody off the pitch.
   *
   * Confirmed, because it throws away arranging work that took real thought,
   * and the button sits beside Save where a mis-tap is easy.
   *
   * This clears the WORKING lineup only. Whatever was last saved is untouched
   * until Save is pressed, so a reset done by accident is recovered by closing
   * the modal and opening it again — which the confirmation says, so nobody
   * has to guess.
   */
  resetLineup() {
    const placed = Object.keys(this._lineupAssign || {}).length;
    if (placed > 0 && !window.confirm(
      `Take all ${placed} player${placed === 1 ? '' : 's'} off the pitch?

`
      + `The saved lineup is not changed until you press Save lineup, so closing `
      + `and reopening brings it back.`)) return;

    this._lineupAssign = {};
    this._lineupPicked = null;
    this._lineupBench = null;      // everyone available again, the default
    this._lineupError = '';
    this.renderLineupBody();
  },

  renderLineupBody() {
    const body = document.getElementById('lineupBody');
    if (!body) return;

    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const formation = this._lineupFormation || '4-4-2';
    const asg = this._lineupAssign || {};
    const byId = new Map(this.lineupSquad().map(p => [p.id, p]));
    const picked = this._lineupPicked;

    // An empty slot carries no data-player-id, so pointerdown ignores it and a
    // plain click still reaches tapLineupSlot below.
    const slots = this.lineupSlots(formation).map(s => {
      const p = byId.get(asg[s.slot]);
      const label = p
        ? `<span class="lineup-num">${p.number != null ? esc(p.number) : '—'}</span>
           <span class="lineup-who">${esc(this.lineupShortName(p))}</span>`
        : `<span class="lineup-slotlabel">${esc(s.slot)}</span>`;
      return `
        <button type="button" class="lineup-slot${p ? ' filled' : ''}${picked ? ' awaiting' : ''}"
                style="left:${s.x}%; bottom:${s.y}%;"
                data-slot="${esc(s.slot)}"
                ${p ? `data-player-id="${esc(p.id)}" data-drag-label="${esc(this.lineupShortName(p))}"` : ''}
                title="${p ? esc(p.name) + ' — drag off, or tap to lift' : 'Empty ' + esc(s.slot)}"
                >${label}</button>`;
    }).join('');

    const starting = new Set(Object.values(asg));
    const squad = this.lineupSquad().map(p => {
      const isOn = starting.has(p.id);
      const dressed = this._lineupBench == null || !!this._lineupBench[p.id];
      return `
        <div class="lineup-pick${picked === p.id ? ' picked' : ''}${isOn ? ' onpitch' : ''}">
          <button type="button" class="lineup-pick-main"
                  data-player-id="${esc(p.id)}" data-drag-label="${esc(this.lineupShortName(p))}"
                  title="${isOn ? 'Already on the pitch' : 'Drag onto a position, or tap then tap'}">
            <span class="lineup-num">${p.number != null ? esc(p.number) : '—'}</span>
            <span class="lineup-who">${esc(p.name)}</span>
            <span class="lineup-grade">${esc(this.lineupGrade(p))}</span>
          </button>
          ${isOn ? '<span class="lineup-tag">XI</span>'
                 : `<button type="button" class="lineup-tag benchtag${dressed ? ' on' : ''}"
                        title="${dressed ? 'On the bench — tap to leave out' : 'Not dressed — tap to add to the bench'}"
                        onclick="app.toggleLineupBench('${esc(p.id)}')">${dressed ? 'Bench' : 'Out'}</button>`}
        </div>`;
    }).join('');

    const filled = Object.keys(asg).length;
    const total = this.lineupSlots(formation).length;

    body.innerHTML = `
      <div class="lineup-shell">
        <div>
          <div class="lineup-pitch">${slots}</div>
          <p class="text-muted" style="font-size:0.76rem; margin:8px 0 0 0;">
            ${picked ? 'Now tap a position to place them.'
              : 'Drag a player onto a position, or tap one then tap a position. Drag a player back to the squad list to take them off.'}
          </p>
        </div>
        <div class="lineup-side">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong style="color:#FFF; font-size:0.86rem;">Squad</strong>
            ${this._lineupLoaded ? '<span class="badge badge-coach" style="font-size:0.62rem;">SAVED LINEUP LOADED</span>' : ''}
            <span class="text-muted" style="font-size:0.76rem;">${filled} of ${total} placed</span>
          </div>
          <div class="lineup-squad">${squad}</div>
        </div>
      </div>`;

    // Empty slots have no drag handle, so they keep an ordinary click.
    body.querySelectorAll('.lineup-slot:not([data-player-id])').forEach(el => {
      el.addEventListener('click', () => this.tapLineupSlot(el.dataset.slot));
    });
    this.attachLineupDrag();

    const sel = document.getElementById('lineupFormation');
    if (sel && sel.value !== formation) sel.value = formation;
    const err = document.getElementById('lineupError');
    if (err) err.textContent = this._lineupError || '';
  },

  /**
   * "Kevin C." — a full name does not fit in a slot on a pitch.
   *
   * First name in full with the surname reduced to an initial, not the other
   * way round: a coach calls across a pitch by first name, and two players
   * sharing a surname are the common case in a school squad while two sharing
   * a first name AND a surname initial is rare.
   */
  lineupShortName(p) {
    return window.lineupDomain.lineupShortName(p);
  },

  /**
   * Grade, shortened for the card.
   *
   * The roster holds these in several shapes — "12", "Senior", "Senior (2027)"
   * — because they arrived from different imports. The card has room for a
   * couple of characters, so a known word becomes its year and anything else
   * is passed through as written rather than guessed at.
   */
  lineupGrade(p) {
    return window.lineupDomain.lineupGrade(p);
  },

  async saveLineup() {
    const btn = document.getElementById('lineupSave');
    const err = document.getElementById('lineupError');
    const say = (m) => { this._lineupError = m; if (err) err.textContent = m; };

    if (!this.activeTeamId) return say('Choose a team in the header first.');
    const team = (this.data.teams || []).find(t => t.id === this.activeTeamId);
    if (!team) return say('Choose a team in the header first.');

    const formation = this._lineupFormation || '4-4-2';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    say('');

    const res = await window.supabaseService.saveLineup(
      this.activeTeamId, team.school_id, this._lineupMatchId,
      formation, this.lineupRowsForSave(formation));

    if (btn) { btn.disabled = false; btn.textContent = 'Save lineup'; }
    if (!res || !res.ok) return say((res && res.error) || 'Could not save that lineup.');

    say('Saved.');
  },

  /**
   * Fixtures this lineup could be pushed out to.
   *
   * Only ones with NO lineup of their own. A fixture whose lineup a coach has
   * already set is the last thing that should be quietly overwritten by a
   * bulk action, so those are left alone and reported rather than skipped in
   * silence.
   */
  fixturesWithoutLineup() {
    return window.lineupDomain.fixturesWithoutLineup(
      this.data.schedule || [], this._lineupIndex || []);
  },

  /**
   * Put the current arrangement on every fixture that has none.
   *
   * The season's shape is usually one lineup with a change or two per match,
   * so setting them one at a time is the same work repeated twenty times. This
   * writes the starting point; each fixture is then edited and saved normally.
   *
   * Deliberately NOT an overwrite. Fixtures that already have a lineup keep
   * it, because a bulk action that silently replaced a carefully set XI would
   * be unforgivable, and the count of what was skipped is reported.
   */
  async applyLineupToAllFixtures() {
    const err = document.getElementById('lineupError');
    const say = (m) => { this._lineupError = m; if (err) err.textContent = m; };

    if (!this.activeTeamId) return say('Choose a team in the header first.');
    const team = (this.data.teams || []).find(t => t.id === this.activeTeamId);
    if (!team) return say('Choose a team in the header first.');

    const formation = this._lineupFormation || '4-4-2';
    const rows = this.lineupRowsForSave(formation);
    if (rows.filter(r => r.role === 'starter').length === 0) {
      return say('Place some players before applying this to other matches.');
    }

    const targets = this.fixturesWithoutLineup();
    const skipped = (this.data.schedule || [])
      .filter(m => !m.is_deleted && !m.isDeleted && m.id).length - targets.length;

    if (targets.length === 0) {
      return say(skipped > 0
        ? `Every fixture already has its own lineup — none were changed.`
        : 'There are no fixtures to apply this to.');
    }

    if (!window.confirm(
      `Apply this lineup to ${targets.length} fixture${targets.length === 1 ? '' : 's'} `
      + `that have none?\n\n`
      + (skipped > 0
          ? `${skipped} fixture${skipped === 1 ? '' : 's'} already have a lineup and will NOT be changed.\n\n`
          : '')
      + `Each one can still be edited and saved separately afterwards.`)) return;

    const btn = document.getElementById('lineupApplyAll');
    if (btn) { btn.disabled = true; btn.textContent = 'Applying...'; }

    let done = 0;
    const failures = [];
    for (const m of targets) {
      const res = await window.supabaseService.saveLineup(
        this.activeTeamId, team.school_id, m.id, formation, rows);
      if (res && res.ok) done += 1;
      else failures.push(`${m.opponent || 'a fixture'}: ${res?.error || 'refused'}`);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Apply to all fixtures'; }

    // Refresh the index so the picker and the skip count reflect what now exists.
    this._lineupIndex =
      (await window.supabaseService.fetchTeamLineups(this.activeTeamId)) || [];
    this.renderLineupSources();

    if (failures.length) {
      return say(`Applied to ${done}. ${failures.length} failed — ${failures[0]}`);
    }
    say(`Applied to ${done} fixture${done === 1 ? '' : 's'}.`
      + (skipped > 0 ? ` ${skipped} already had one and were left alone.` : ''));
  },

  /**
   * How tightly to set the card so it lands on ONE sheet.
   *
   * A lineup card that runs to a second page is useless: it is handed over at
   * the touchline and read at a glance. The XI is always eleven rows, but the
   * bench is whatever the squad has left, so the total varies from about
   * twelve to nearly forty and a single fixed size cannot serve both.
   *
   * Two levers, applied together. The type scales down as the list grows, and
   * a long bench splits into two columns — which halves its height and is worth
   * far more than another point off the font.
   *
   * The thresholds are set against US Letter at 10mm margins, the smaller of
   * the two common sheets, so anything that fits there fits A4 as well.
   */
  lineupCardDensity(starters, bench) {
    return window.lineupDomain.lineupCardDensity(starters, bench);
  },

  /**
   * The card, printed in its own window.
   *
   * Same approach as the squad report: the print dialog's Save as PDF is the
   * PDF path, and the app's dark theme prints as a wall of ink, so this window
   * carries its own light stylesheet.
   */
  printLineupCard() {
    const formation = this._lineupFormation || '4-4-2';
    const starters = this.lineupStarters(formation);
    if (starters.length === 0) {
      window.alert('Place at least one player before printing the card.');
      return;
    }

    const label = this.activeTeamLabel ? this.activeTeamLabel() : { org: '', team: '' };
    const match = (this.data.schedule || []).find(m => m.id === this._lineupMatchId);
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const win = window.open('', '_blank');
    if (!win) {
      window.alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
      return;
    }

    const rows = (list, withSlot) => list.map(r => {
      const p = withSlot ? r.player : r;
      return `<tr>
        <td class="slot">${withSlot ? esc(r.slot) : ''}</td>
        <td class="num">${p.number != null ? esc(p.number) : ''}</td>
        <td>${esc(p.name)}</td>
        <td class="grade">${esc(this.lineupGrade(p))}</td>
      </tr>`;
    }).join('');

    const bench = this.lineupBench(formation);

    const d = this.lineupCardDensity(starters.length, bench.length);

    // The bench split across columns, filling down each in turn so the numbers
    // still read in order rather than snaking across.
    const per = Math.ceil(bench.length / d.benchCols);
    const benchCols = [];
    for (let i = 0; i < d.benchCols; i++) benchCols.push(bench.slice(i * per, (i + 1) * per));

    win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>Lineup — ${esc(label.team || 'Team')}</title>
      <style>
        /* One sheet, always. The margin is set here rather than on body so it
           applies to the printed page rather than the preview only. */
        @page { margin: 10mm; }
        body {
          font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
          margin: 0; color: #111;
          font-size: ${d.font}pt;
        }
        /* The header is one line. It was three, which cost a fifth of the page
           for information the coach already knows. */
        .head {
          display: flex; justify-content: space-between; align-items: baseline;
          gap: 10px; border-bottom: 2px solid #111; padding-bottom: 3px; margin-bottom: 6px;
        }
        h1 { font-size: ${d.head}pt; margin: 0; white-space: nowrap; }
        .meta { font-size: ${Math.max(7, d.font - 2)}pt; color: #555; text-align: right; }

        h2 {
          font-size: ${Math.max(8, d.font - 1)}pt; margin: 7px 0 2px 0;
          text-transform: uppercase; letter-spacing: 0.06em; color: #333;
        }
        table { width: 100%; border-collapse: collapse; font-size: ${d.font}pt; }
        th {
          text-align: left; font-size: ${Math.max(6, d.font - 3.5)}pt;
          text-transform: uppercase; color: #666; padding: 1px 5px; font-weight: 600;
        }
        td { padding: ${d.pad}pt 5px; border-bottom: 1px solid #ddd; }
        /* Officials read down the number column, so it is fixed width and
           tabular rather than flowing with the name beside it. */
        .num   { width: 8%; font-variant-numeric: tabular-nums; font-weight: 700; }
        .slot  { width: 12%; color: #555; font-size: ${Math.max(6, d.font - 2)}pt; }
        .grade { width: 8%; color: #555; }

        .bench { display: flex; gap: 14px; align-items: flex-start; }
        .bench > table { flex: 1; }

        /* Nothing may break across a page, because there is only one. */
        table, tr, .head { break-inside: avoid; page-break-inside: avoid; }

        .sign {
          margin-top: 10px; font-size: ${Math.max(7, d.font - 2.5)}pt; color: #555;
          display: flex; justify-content: space-between; gap: 20px;
        }
      </style></head><body>
      <div class="head">
        <h1>${esc(label.org || '')} ${esc(label.team || '')}</h1>
        <div class="meta">
          ${match ? esc(match.opponent) + ' &middot; '
              + esc(this.displayMatchDate ? this.displayMatchDate(match.date) : match.date)
              + '<br />' : ''}
          ${esc(formation)} &middot; ${new Date().toLocaleDateString()}
        </div>
      </div>

      <h2>Starting XI</h2>
      <table><thead><tr><th>Pos</th><th>No.</th><th>Player</th><th>Gr</th></tr></thead>
        <tbody>${rows(starters, true)}</tbody></table>

      ${bench.length ? `<h2>Substitutes</h2>
      <div class="bench">
        ${benchCols.filter(c => c.length).map(col => `
          <table><thead><tr><th></th><th>No.</th><th>Player</th><th>Gr</th></tr></thead>
            <tbody>${rows(col, false)}</tbody></table>`).join('')}
      </div>` : ''}

      <div class="sign">
        <span>Coach ______________________________</span>
        <span>Official ______________________________</span>
      </div>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

});
