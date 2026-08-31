/**
 * Matrix session entry and exercise weighting.
 *
 * Separate from matrix.view.js, which owns the leaderboard. These are the two
 * write surfaces: what an exercise is worth, and what happened in one.
 *
 * Classic script — no imports. Extends the prototype defined in app.core.js,
 * so index.html must load this AFTER that file.
 */
Object.assign(BHSSoccerApp.prototype, {

  async openWeightsModal() {
    const err = document.getElementById('matrixWeightsError');
    if (err) err.textContent = '';
    if (window.supabaseService?.isConfigured()) {
      this._weightDrills = (await window.supabaseService.fetchDrillsForWeighting('bhs')) || [];
    } else {
      this._weightDrills = this._weightDrills || [];
    }
    const rows = document.getElementById('matrixWeightsRows');
    if (rows) rows.innerHTML = this.renderWeightsRows();
    const modal = document.getElementById('matrixWeightsModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  renderWeightsRows() {
    const drills = this._weightDrills || [];
    if (drills.length === 0) {
      return '<p class="text-muted" style="font-size:0.85rem;">No exercises yet. Add drills in the practice planner first.</p>';
    }
    const measures = [
      ['head_to_head', '1v1 (pairings)'],
      ['win_loss', 'Small-sided (W/D/L)'],
      ['count_high', 'Counted, high wins'],
      ['time_low', 'Timed, low wins']
    ];
    return drills.map(d => `
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
        <span style="flex:1; color:#FFF; font-size:0.85rem;">${d.name}
          <span class="text-muted" style="font-size:0.75rem;">${d.category || ''}</span>
        </span>
        <input type="number" id="weightPoints_${d.id}" class="form-control"
               step="0.5" min="0" max="10" style="max-width:80px; font-size:0.8rem;"
               value="${Number(d.points ?? 3)}" />
        <select id="weightMeasure_${d.id}" class="form-control" style="max-width:190px; font-size:0.8rem;">
          ${measures.map(([v, label]) =>
            `<option value="${v}"${(d.measure || 'head_to_head') === v ? ' selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>`).join('');
  },

  async saveWeights() {
    const err = document.getElementById('matrixWeightsError');
    const set = (m, ok = false) => {
      if (!err) return;
      err.textContent = m;
      err.style.color = ok ? 'var(--bhs-cyan-accent)' : 'var(--color-danger)';
    };
    const rows = (this._weightDrills || []).map(d => ({
      id: d.id,
      points: parseFloat(document.getElementById(`weightPoints_${d.id}`)?.value),
      measure: document.getElementById(`weightMeasure_${d.id}`)?.value || 'head_to_head'
    }));
    if (rows.length === 0) return set('Nothing to save.');

    set('Saving…');
    const res = await window.supabaseService.updateDrillWeights(rows);
    if (!res.ok) return set(res.error || 'Could not save those weights.');

    // Weights are looked up live, so every past result is re-scored. Re-sync
    // rather than patch, or the leaderboard on screen contradicts the database.
    await this.syncFromSupabase();
    this.renderCurrentView();
    set(`Saved ${res.updated} exercise${res.updated === 1 ? '' : 's'}. Standings re-scored.`, true);
  },

  /**
   * Drills that are recorded as a session.
   *
   * head_to_head is deliberately excluded: those are entered as pairings in the
   * Record Result modal, and offering both routes for one drill would let the
   * same day's competition be counted twice.
   */
  sessionDrillOptions() {
    return (this.data.drillsBank || [])
      .filter(d => !d.is_deleted && !d.isDeleted && (d.measure || 'head_to_head') !== 'head_to_head')
      .map(d => `<option value="${d.id}"${this._sessionDrillId === d.id ? ' selected' : ''}>${d.name}</option>`)
      .join('');
  },

  sessionDrill() {
    return (this.data.drillsBank || []).find(d => d.id === this._sessionDrillId) || null;
  },

  async openSessionModal(drillId) {
    this._sessionDrillId = drillId || this._sessionDrillId || '';
    const err = document.getElementById('sessionError');
    if (err) err.textContent = '';

    const picker = document.getElementById('sessionDrill');
    if (picker) {
      picker.innerHTML = '<option value="">— pick an exercise —</option>' + this.sessionDrillOptions();
      picker.value = this._sessionDrillId;
    }
    const when = document.getElementById('sessionDate');
    if (when && !when.value) when.value = new Date().toISOString().slice(0, 10);

    const rows = document.getElementById('sessionRows');
    if (rows) rows.innerHTML = this.renderSessionRows();

    const modal = document.getElementById('matrixSessionModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  renderSessionRows() {
    const drill = this.sessionDrill();
    if (!drill) {
      // Distinguish "you have not picked one yet" from "there is nothing to
      // pick". The picker excludes head_to_head drills because those are
      // recorded as pairings elsewhere, and every drill starts as
      // head_to_head — so on a fresh install the list is legitimately empty
      // and an unexplained blank reads as a broken feature.
      const available = (this.data.drillsBank || [])
        .filter(d => !d.is_deleted && !d.isDeleted && (d.measure || 'head_to_head') !== 'head_to_head');
      if (available.length === 0) {
        return `
          <p class="text-muted" style="font-size:0.85rem;">
            No exercises are set up for session recording yet.
          </p>
          <p class="text-muted" style="font-size:0.85rem;">
            Sessions are for whole-squad exercises &mdash; a timed run, a beep test,
            shots made out of ten, a small-sided game. Open
            <strong style="color:#FFF;">&#9878; Exercise weights</strong> and give a drill
            any measurement type other than <em>1v1</em>, and it will appear here.
            1v1 drills stay in <strong style="color:#FFF;">Record Practice Drill Scores</strong>,
            because those are entered as pairings.
          </p>`;
      }
      return '<p class="text-muted" style="font-size:0.85rem;">Pick an exercise to load the squad.</p>';
    }
    const players = (this.data.players || []).filter(p => !p.is_deleted && !p.isDeleted);
    if (players.length === 0) {
      return '<p class="text-muted" style="font-size:0.85rem;">This team has no players yet.</p>';
    }

    const measure = drill.measure || 'count_high';
    const hint = measure === 'time_low' ? 'seconds — lower wins'
               : measure === 'win_loss' ? 'result'
               : 'number — higher wins';

    return `
      <p class="text-muted" style="font-size:0.78rem; margin:0 0 8px 0;">
        ${drill.name} &middot; weight ${Number(drill.points ?? 3)} &middot; ${hint}
      </p>
      ${players.map(p => `
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
          <span style="flex:1; color:#FFF; font-size:0.85rem;">
            ${p.name} <span class="text-muted">#${p.number || '—'}</span>
          </span>
          ${measure === 'win_loss'
            ? `<select id="sessionOutcome_${p.id}" class="form-control" style="max-width:110px; font-size:0.8rem;">
                 <option value="" selected>— result —</option>
                 <option value="win">Won</option>
                 <option value="draw">Drew</option>
                 <option value="loss">Lost</option>
               </select>`
            : `<input type="number" id="sessionValue_${p.id}" class="form-control" step="any"
                      style="max-width:110px; font-size:0.8rem;" />`}
          <select id="sessionAttend_${p.id}" class="form-control" style="max-width:130px; font-size:0.8rem;">
            <option value="present">Here</option>
            <option value="excused">Excused</option>
            <option value="unexcused">No-show</option>
          </select>
        </div>`).join('')}`;
  },

  /**
   * Read the grid. Split out from saveSession so the DOM reading can be tested
   * without a service call standing in the way.
   *
   * An absent player's input/select can still hold a value the coach typed
   * before switching their attendance (e.g. entered 2800, then marked them
   * excused) — that stale entry is never read for a non-present player, so a
   * result is only ever sent for someone who was actually present.
   */
  collectSessionResults() {
    const drill = this.sessionDrill();
    const measure = drill ? (drill.measure || 'count_high') : 'count_high';
    return (this.data.players || [])
      .filter(p => !p.is_deleted && !p.isDeleted)
      .map(p => {
        const attendance = document.getElementById(`sessionAttend_${p.id}`)?.value || 'present';
        if (attendance !== 'present') {
          return { playerId: p.id, attendance, rawValue: null, outcome: null };
        }
        if (measure === 'win_loss') {
          return { playerId: p.id, attendance, rawValue: null,
                   outcome: document.getElementById(`sessionOutcome_${p.id}`)?.value || null };
        }
        const raw = document.getElementById(`sessionValue_${p.id}`)?.value;
        const n = parseFloat(raw);
        return { playerId: p.id, attendance,
                 rawValue: Number.isFinite(n) ? n : null, outcome: null };
      });
  },

  async saveSession() {
    const err = document.getElementById('sessionError');
    const set = (m, ok = false) => {
      if (!err) return;
      err.textContent = m;
      err.style.color = ok ? 'var(--bhs-cyan-accent)' : 'var(--color-danger)';
    };

    if (!this._sessionDrillId) return set('Pick the exercise this session was.');
    const occurredOn = document.getElementById('sessionDate')?.value;
    if (!occurredOn) return set('Pick the date this session happened.');

    // Disabled for the duration of the request so a double-click cannot fire
    // two saveMatrixSession calls and double everyone's `available`. Always
    // re-enabled, including on the failure path, or a refused save would
    // leave the coach unable to try again without reopening the modal.
    const btn = document.getElementById('sessionSaveBtn');
    if (btn) btn.disabled = true;
    try {
      set('Saving…');
      const res = await window.supabaseService.saveMatrixSession(
        this.activeTeamId,
        { drillId: this._sessionDrillId, occurredOn },
        this.collectSessionResults()
      );
      if (!res.ok) return set(res.error || 'Could not save that session.');

      // Standings are derived in Postgres, so nothing moves until a re-read.
      await this.syncFromSupabase();
      this.renderCurrentView();
      this.closeModals();
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  /**
   * The recorded sessions behind the leaderboard, newest first.
   *
   * Editing a past session is out of scope — delete and re-enter is the only
   * correction path — so this list exists specifically to make delete
   * reachable. A session's drill can itself have been deleted since, so
   * `drills_bank` may come back null; fall back to a label rather than
   * rendering "undefined".
   */
  renderSessionHistory() {
    const sessions = (this._sessions || []).slice()
      .sort((a, b) => String(b.occurred_on).localeCompare(String(a.occurred_on)));
    if (sessions.length === 0) {
      return '<p class="text-muted" style="font-size:0.85rem;">No sessions recorded yet.</p>';
    }
    return sessions.map(s => `
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px; font-size:0.8rem;">
        <span style="flex:1; color:#FFF;">${s.drills_bank?.name || 'Exercise'}</span>
        <span class="text-muted">${s.occurred_on}</span>
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;"
                onclick="app.removeSession('${s.id}')">Delete</button>
      </div>`).join('');
  },

  /**
   * Soft-delete a session. Editing one is out of scope, so this is the only
   * correction path — which is exactly why it has to ask first: deleting takes
   * every result in the session with it and re-ranks the table.
   */
  async removeSession(sessionId) {
    const s = (this._sessions || []).find(x => x.id === sessionId);
    if (!s) return;
    const ok = window.confirm(
      `Delete the ${s.drills_bank?.name || 'exercise'} session on ${s.occurred_on}?\n\n` +
      `Every result in it is removed and the standings are re-scored.`
    );
    if (!ok) return;

    const res = await window.supabaseService.deleteMatrixSession(sessionId);
    if (!res.ok) { window.alert(res.error || 'Could not delete that session.'); return; }

    await this.syncFromSupabase();
    this.renderCurrentView();
  }

});
