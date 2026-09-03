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
  lineupFormations() {
    const back4 = [
      { slot: 'LB', x: 15, y: 25 }, { slot: 'LCB', x: 38, y: 20 },
      { slot: 'RCB', x: 62, y: 20 }, { slot: 'RB', x: 85, y: 25 }
    ];
    const back3 = [
      { slot: 'LCB', x: 25, y: 22 }, { slot: 'CB', x: 50, y: 18 }, { slot: 'RCB', x: 75, y: 22 }
    ];
    // y=6 put the slot's lower half within a couple of percent of the goal
    // line, which the pitch's overflow:hidden clipped on a short viewport.
    const gk = { slot: 'GK', x: 50, y: 10 };

    return {
      '4-4-2': [gk, ...back4,
        { slot: 'LM', x: 15, y: 55 }, { slot: 'LCM', x: 38, y: 52 },
        { slot: 'RCM', x: 62, y: 52 }, { slot: 'RM', x: 85, y: 55 },
        { slot: 'LST', x: 40, y: 82 }, { slot: 'RST', x: 60, y: 82 }],

      '4-3-3': [gk, ...back4,
        { slot: 'LCM', x: 30, y: 52 }, { slot: 'CM', x: 50, y: 46 }, { slot: 'RCM', x: 70, y: 52 },
        { slot: 'LW', x: 18, y: 82 }, { slot: 'ST', x: 50, y: 86 }, { slot: 'RW', x: 82, y: 82 }],

      '4-2-3-1': [gk, ...back4,
        { slot: 'LDM', x: 38, y: 42 }, { slot: 'RDM', x: 62, y: 42 },
        { slot: 'LAM', x: 20, y: 68 }, { slot: 'CAM', x: 50, y: 66 }, { slot: 'RAM', x: 80, y: 68 },
        { slot: 'ST', x: 50, y: 88 }],

      '3-5-2': [gk, ...back3,
        { slot: 'LWB', x: 10, y: 50 }, { slot: 'LCM', x: 33, y: 50 }, { slot: 'CM', x: 50, y: 45 },
        { slot: 'RCM', x: 67, y: 50 }, { slot: 'RWB', x: 90, y: 50 },
        { slot: 'LST', x: 40, y: 84 }, { slot: 'RST', x: 60, y: 84 }],

      '4-4-1-1': [gk, ...back4,
        { slot: 'LM', x: 15, y: 52 }, { slot: 'LCM', x: 38, y: 48 },
        { slot: 'RCM', x: 62, y: 48 }, { slot: 'RM', x: 85, y: 52 },
        { slot: 'CF', x: 50, y: 72 }, { slot: 'ST', x: 50, y: 90 }]
    };
  },

  lineupSlots(formation) {
    const all = this.lineupFormations();
    return all[formation] || all['4-4-2'];
  },

  /** Everyone available to pick, in the order a team sheet reads. */
  lineupSquad() {
    return (this.data.players || [])
      .filter(p => !p.is_deleted && !p.isDeleted)
      .slice()
      .sort((a, b) => {
        const na = a.number == null ? NaN : Number(a.number);
        const nb = b.number == null ? NaN : Number(b.number);
        const ga = Number.isFinite(na), gb = Number.isFinite(nb);
        // Unnumbered players last: Number(null) is 0, which would put them on
        // top of the squad list.
        if (ga !== gb) return ga ? -1 : 1;
        if (ga && na !== nb) return na - nb;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
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
    // Take the player off any slot they already hold.
    Object.keys(asg).forEach(k => { if (asg[k] === playerId) delete asg[k]; });
    if (playerId) asg[slot] = playerId; else delete asg[slot];
    return asg;
  },

  clearLineupSlot(slot) {
    if (this._lineupAssign) delete this._lineupAssign[slot];
  },

  /** The XI, in the formation's own order. */
  lineupStarters(formation) {
    const asg = this._lineupAssign || {};
    const byId = new Map(this.lineupSquad().map(p => [p.id, p]));
    return this.lineupSlots(formation)
      .map((s, i) => {
        const p = byId.get(asg[s.slot]);
        return p ? { ...s, sort_order: i, player: p } : null;
      })
      .filter(Boolean);
  },

  /** Everyone dressed but not starting. */
  lineupBench(formation) {
    const starting = new Set(this.lineupStarters(formation).map(r => r.player.id));
    const dressed = this._lineupBench || null;
    return this.lineupSquad().filter(p =>
      !starting.has(p.id) && (dressed == null || dressed[p.id]));
  },

  /** Rows in the shape saveLineup expects. */
  lineupRowsForSave(formation) {
    const starters = this.lineupStarters(formation).map(r => ({
      player_id: r.player.id, role: 'starter', slot: r.slot,
      x: r.x, y: r.y, sort_order: r.sort_order
    }));
    const bench = this.lineupBench(formation).map((p, i) => ({
      player_id: p.id, role: 'bench', slot: null,
      x: null, y: null, sort_order: 100 + i
    }));
    return starters.concat(bench);
  },

  /**
   * What a drop should do, decided without touching the DOM.
   *
   * Kept separate from the pointer plumbing so the rules can be tested: the
   * plumbing is browser behaviour, but "dropping a starter on the squad list
   * takes them off the pitch" is a rule, and a rule that only exists inside an
   * event handler is a rule nobody can check.
   */
  resolveLineupDrop({ playerId, fromSlot, overSlot, overSquad }) {
    if (!playerId) return { action: 'none' };

    if (overSlot) {
      // Dropping a player back on the slot they came from changes nothing --
      // it is how a drag is cancelled.
      if (overSlot === fromSlot) return { action: 'none' };
      return { action: 'place', playerId, slot: overSlot };
    }

    // Off the pitch. Dragging a starter to the squad list removes them; doing
    // the same with somebody who was never on it is simply a cancelled drag.
    if (overSquad && fromSlot) return { action: 'remove', slot: fromSlot };
    return { action: 'none' };
  },

  /** Carry out a resolved drop. */
  applyLineupDrop(drop) {
    if (!drop || drop.action === 'none') return false;
    if (drop.action === 'place') { this.assignLineupSlot(drop.slot, drop.playerId); return true; }
    if (drop.action === 'remove') { this.clearLineupSlot(drop.slot); return true; }
    return false;
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

  async openLineupModal(matchId) {
    this._lineupMatchId = matchId || null;
    this._lineupError = '';
    this._lineupPicked = null;
    this._lineupAssign = {};
    this._lineupBench = null;
    this._lineupFormation = '4-4-2';

    if (window.supabaseService?.isConfigured() && this.activeTeamId) {
      const saved = await window.supabaseService.fetchLineup(this.activeTeamId, this._lineupMatchId);
      if (saved) {
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
      }
    }

    this.renderLineupBody();
    const modal = document.getElementById('lineupModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
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
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong style="color:#FFF; font-size:0.86rem;">Squad</strong>
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

  /** "K. Corona" — a full name does not fit in a slot on a pitch. */
  lineupShortName(p) {
    const parts = String(p.name || '').trim().split(/\s+/);
    if (parts.length < 2) return parts[0] || '';
    return parts[0].charAt(0) + '. ' + parts[parts.length - 1];
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
    const raw = String(p.classYear || p.class_year || '').trim();
    if (!raw) return '';
    const word = raw.toLowerCase();
    if (word.startsWith('fresh')) return '9';
    if (word.startsWith('soph')) return '10';
    if (word.startsWith('jun')) return '11';
    if (word.startsWith('sen')) return '12';
    const m = raw.match(/\b(9|10|11|12)\b/);
    return m ? m[1] : raw;
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

    win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>Lineup — ${esc(label.team || 'Team')}</title>
      <style>
        body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 16mm; color: #111; }
        h1 { font-size: 19pt; margin: 0; }
        .sub { color: #555; font-size: 10pt; margin: 2px 0 14px 0; }
        h2 { font-size: 12pt; margin: 14px 0 4px 0; border-bottom: 2px solid #111; padding-bottom: 3px; }
        table { width: 100%; border-collapse: collapse; font-size: 12pt; }
        th { text-align: left; font-size: 8pt; text-transform: uppercase; color: #555; padding: 3px 6px; }
        td { padding: 5px 6px; border-bottom: 1px solid #ddd; }
        /* Officials read down the number column, so it is fixed width and
           tabular rather than flowing with the name beside it. */
        .num   { width: 42px; font-variant-numeric: tabular-nums; font-weight: 700; }
        .slot  { width: 58px; color: #555; font-size: 9pt; }
        .grade { width: 46px; color: #555; }
        .sign { margin-top: 26px; font-size: 9pt; color: #555; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <h1>${esc(label.org || '')} ${esc(label.team || '')}</h1>
      <div class="sub">
        ${match ? 'vs ' + esc(match.opponent) + ' &middot; ' + esc(match.date) + ' &middot; ' : ''}
        Formation ${esc(formation)} &middot; ${new Date().toLocaleDateString()}
      </div>

      <h2>Starting XI</h2>
      <table><thead><tr><th>Pos</th><th>No.</th><th>Player</th><th>Gr</th></tr></thead>
        <tbody>${rows(starters, true)}</tbody></table>

      ${bench.length ? `<h2>Substitutes</h2>
      <table><thead><tr><th></th><th>No.</th><th>Player</th><th>Gr</th></tr></thead>
        <tbody>${rows(bench, false)}</tbody></table>` : ''}

      <div class="sign">Coach signature ________________________________</div>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

});
