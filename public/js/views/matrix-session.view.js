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
      // Resolved from the active team rather than a hardcoded school code: the
      // drill library belongs to an organization, and a club coach has their
      // own.
      const team = (this.data.teams || []).find(t => t.id === this.activeTeamId);
      this._weightDrills = (await window.supabaseService.fetchDrillsForWeighting(team?.school_id)) || [];

      // Standards are per squad, so they are loaded for the active team only.
      this._weightBands = {};
      if (this.activeTeamId) {
        for (const d of this._weightDrills) {
          if (d.measure === 'time_bands') {
            this._weightBands[d.id] =
              (await window.supabaseService.fetchTimeBands(d.id, this.activeTeamId)) || [];
          }
        }
      }
    } else {
      this._weightDrills = this._weightDrills || [];
    }
    const rows = document.getElementById('matrixWeightsRows');
    if (rows) rows.innerHTML = this.renderWeightsRows();
    const modal = document.getElementById('matrixWeightsModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  /**
   * The standards rows for one drill, for the active squad.
   *
   * Rows are held as a DRAFT of what is in the boxes -- {time, factor} as the
   * coach typed them -- rather than as saved seconds. That is what lets a row
   * be added or removed without a save: a re-render that read from the database
   * would blank whatever had been typed and not yet stored.
   *
   * The first version had no Add button and simply appended one spare row,
   * which meant a coach could set exactly one standard per save-and-reopen
   * cycle. Three standards took three round trips.
   */
  renderBandRows(drillId) {
    const rows = this.bandDraft(drillId);
    const label = this.activeTeamLabel ? (this.activeTeamLabel().team || 'this team') : 'this team';
    const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

    return `
      <div style="margin:4px 0 10px 12px; padding:8px 10px; background:rgba(0,0,0,0.25); border-left:2px solid var(--bhs-gold-accent); border-radius:0 6px 6px 0;">
        <div class="text-muted" style="font-size:0.73rem; text-transform:uppercase; margin-bottom:5px;">
          Standards for ${esc(label)}
        </div>
        ${rows.map((b, i) => `
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
            <span class="text-muted" style="font-size:0.75rem;">at or under</span>
            <input type="text" id="bandTime_${drillId}_${i}" class="form-control"
                   style="max-width:80px; font-size:0.78rem;" placeholder="4:30"
                   value="${esc(b.time)}" />
            <span class="text-muted" style="font-size:0.75rem;">earns</span>
            <input type="number" id="bandFactor_${drillId}_${i}" class="form-control"
                   step="0.25" min="0" max="1" style="max-width:80px; font-size:0.78rem;" placeholder="1"
                   value="${esc(b.factor)}" />
            <span class="text-muted" style="font-size:0.72rem;">of the exercise</span>
            <button type="button" class="btn-card-delete" style="padding:0 7px; font-size:0.8rem;"
                    title="Remove this standard"
                    onclick="app.removeBandRow('${drillId}', ${i})">&times;</button>
          </div>`).join('')}
        <button type="button" class="btn btn-secondary" style="padding:3px 10px; font-size:0.76rem; margin-top:4px;"
                onclick="app.addBandRow('${drillId}')">+ Add a standard</button>
        <div class="text-muted" style="font-size:0.72rem; margin-top:6px;">
          A time meeting no standard scores nothing. Set none and this exercise is not counted for
          ${esc(label)} at all.
        </div>
      </div>`;
  },

  /**
   * The draft rows for a drill: always at least one, so there is somewhere to
   * type. Seeded from the saved bands the first time it is asked for.
   */
  bandDraft(drillId) {
    this._weightBands = this._weightBands || {};
    let rows = this._weightBands[drillId];

    if (!Array.isArray(rows)) rows = [];
    rows = rows.map(b => (
      // Saved bands arrive as seconds; drafts are already strings.
      Object.prototype.hasOwnProperty.call(b, 'max_seconds')
        ? { time: window.supabaseService.formatSecondsAsTime(b.max_seconds), factor: String(b.factor ?? '') }
        : { time: String(b.time ?? ''), factor: String(b.factor ?? '') }
    ));

    if (rows.length === 0) rows = [{ time: '', factor: '' }];
    this._weightBands[drillId] = rows;
    return rows;
  },

  /** What is in the boxes right now, in order. */
  readBandRows(drillId) {
    const out = [];
    for (let i = 0; ; i++) {
      const t = document.getElementById(`bandTime_${drillId}_${i}`);
      const f = document.getElementById(`bandFactor_${drillId}_${i}`);
      if (!t || !f) break;
      out.push({ time: t.value, factor: f.value });
    }
    return out;
  },

  /**
   * Copy what is typed in every drill's boxes into the draft.
   *
   * Called BEFORE changing a draft, never after: re-reading the DOM once the
   * state has been updated but the markup has not re-rendered reads the old
   * rows back over the new ones, which silently undoes an added row.
   */
  captureBandDrafts() {
    this._weightBands = this._weightBands || {};
    (this._weightDrills || [])
      .filter(d => d.measure === 'time_bands')
      .forEach(d => {
        const typed = this.readBandRows(d.id);
        if (typed.length) this._weightBands[d.id] = typed;
      });
  },

  /** Re-render the weights modal from the drafts as they now stand. */
  redrawWeights() {
    const rows = document.getElementById('matrixWeightsRows');
    if (rows) rows.innerHTML = this.renderWeightsRows();
  },

  addBandRow(drillId) {
    this.captureBandDrafts();
    this._weightBands[drillId] = this.bandDraft(drillId).concat([{ time: '', factor: '' }]);
    this.redrawWeights();
  },

  removeBandRow(drillId, index) {
    this.captureBandDrafts();
    const kept = this.bandDraft(drillId).filter((_, i) => i !== index);
    // Never leave the section with no boxes at all.
    this._weightBands[drillId] = kept.length ? kept : [{ time: '', factor: '' }];
    this.redrawWeights();
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
      ['time_low', 'Timed, fastest wins'],
      ['time_bands', 'Timed against a standard']
    ];
    return drills.map(d => `
      <div style="margin-bottom:6px;">
        <div style="display:flex; gap:8px; align-items:center;">
          <span style="flex:1; color:#FFF; font-size:0.85rem;">${d.name}
            <span class="text-muted" style="font-size:0.75rem;">${d.category || ''}</span>
          </span>
          <input type="number" id="weightPoints_${d.id}" class="form-control"
                 step="0.5" min="0" max="10" style="max-width:80px; font-size:0.8rem;"
                 value="${Number(d.points ?? 3)}" />
          <select id="weightMeasure_${d.id}" class="form-control" style="max-width:190px; font-size:0.8rem;"
                  onchange="app.onMeasureChanged('${d.id}', this.value)">
            ${measures.map(([v, label]) =>
              `<option value="${v}"${(d.measure || 'head_to_head') === v ? ' selected' : ''}>${label}</option>`
            ).join('')}
          </select>
        </div>
        ${d.measure === 'time_bands' ? this.renderBandRows(d.id) : ''}
      </div>`).join('');
  },

  /**
   * Reveal or hide the standards rows when the measure changes.
   *
   * Held in local state and re-rendered rather than toggled with CSS, so the
   * rows a coach has typed survive switching away and back before saving.
   */
  onMeasureChanged(drillId, measure) {
    const d = (this._weightDrills || []).find(x => x.id === drillId);
    if (!d) return;
    d.measure = measure;
    if (measure === 'time_bands' && !(this._weightBands || {})[drillId]) {
      this._weightBands = this._weightBands || {};
      this._weightBands[drillId] = [];
    }
    const rows = document.getElementById('matrixWeightsRows');
    if (rows) rows.innerHTML = this.renderWeightsRows();
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

    // Standards for any drill now measured against one. Saved after the
    // weights, because a band is meaningless until the measure is stored --
    // and reported by name on failure rather than lost behind a success
    // message about the weights.
    for (const r of rows.filter(r => r.measure === 'time_bands')) {
      if (!this.activeTeamId) {
        return set('Weights saved, but standards need a team. Choose one in the header.');
      }
      const bandRes = await window.supabaseService.saveTimeBands(
        r.id, this.activeTeamId, this.readBandRows(r.id)
      );
      if (!bandRes.ok) {
        const name = (this._weightDrills.find(d => d.id === r.id) || {}).name || 'that exercise';
        return set(`Weights saved. Standards for ${name}: ${bandRes.error}`);
      }
      this._weightBands[r.id] = (await window.supabaseService.fetchTimeBands(r.id, this.activeTeamId)) || [];
      // Re-render so the saved standards, and a fresh spare row, are there to
      // carry on with. Without this the modal keeps the pre-save markup and a
      // coach has to close and reopen to add another.
      this.redrawWeights();
    }

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

  /**
   * Open the grid to edit a session already recorded.
   *
   * The exercise is locked: the drill decides how every stored value is
   * scored, so switching a count_high session to win_loss would leave numbers
   * that mean nothing. Delete and re-enter is the route for a wrong exercise.
   */
  async editSession(sessionId) {
    const s = (this._sessions || []).find(x => x.id === sessionId);
    if (!s) return;

    this._editingSessionId = sessionId;
    this._sessionDrillId = s.drill_id;
    this._sessionPrefill = {};

    const rows = (await window.supabaseService.fetchMatrixSessionResults(sessionId)) || [];
    rows.forEach(r => {
      this._sessionPrefill[r.player_id] = {
        attendance: r.attendance,
        rawValue: r.raw_value,
        outcome: r.outcome
      };
    });

    await this.openSessionModal(s.drill_id);
    const when = document.getElementById('sessionDate');
    if (when) when.value = s.occurred_on || '';
  },

  /**
   * Start a NEW session.
   *
   * Separate from openSessionModal because that is also the drill picker's
   * onchange handler, so it cannot tell a fresh start from a change of
   * exercise by its arguments. Inferring it from whether a prefill existed
   * was the bug this replaces: after editing a session, "Record a session"
   * reopened that same session for editing.
   */
  async newSession() {
    this._editingSessionId = null;
    this._sessionPrefill = null;
    this._sessionDrillId = '';
    const when = document.getElementById('sessionDate');
    if (when) when.value = '';          // openSessionModal fills today's date
    await this.openSessionModal();
  },

  /**
   * The active squad's standards for the exercise being recorded.
   *
   * Loaded per session rather than held globally: the bands belong to a
   * (drill, team) pair, and both change as the coach moves around.
   */
  async loadSessionBands() {
    this._sessionBands = [];
    const drill = this.sessionDrill();
    if (!drill || (drill.measure || '') !== 'time_bands') return;
    if (!window.supabaseService?.isConfigured() || !this.activeTeamId) return;

    this._sessionBands =
      (await window.supabaseService.fetchTimeBands(drill.id, this.activeTeamId)) || [];
  },

  async openSessionModal(drillId) {
    this._sessionDrillId = drillId || this._sessionDrillId || '';
    const err = document.getElementById('sessionError');
    if (err) err.textContent = '';

    await this.loadSessionBands();

    const picker = document.getElementById('sessionDrill');
    if (picker) {
      picker.innerHTML = '<option value="">— pick an exercise —</option>' + this.sessionDrillOptions();
      picker.value = this._sessionDrillId;
      picker.disabled = !!this._editingSessionId;
    }
    const title = document.querySelector('#matrixSessionModal .modal-header h3');
    if (title) {
      title.textContent = this._editingSessionId ? '✏️ EDIT SESSION' : '📋 RECORD A SESSION';
    }
    const saveBtn = document.getElementById('sessionSaveBtn');
    if (saveBtn) {
      saveBtn.textContent = this._editingSessionId ? '💾 Save changes' : '💾 Save session';
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
    const roster = (this.data.players || []).filter(p => !p.is_deleted && !p.isDeleted);
    const pre = this._sessionPrefill || null;

    // Someone recorded in this session who is no longer on the roster still
    // has a result that is still scoring. Hiding them would let a coach save
    // the session while silently keeping a result they cannot see, so they are
    // shown and flagged instead.
    const gone = pre
      ? Object.keys(pre)
          .filter(id => !roster.some(p => p.id === id))
          .map(id => ({ id, name: 'Former squad member', number: null, _gone: true }))
      : [];
    // Ordered by recording number by default, because that is the order the
    // paper sheet is written in and the coach reads down it. Players with no
    // number sort last rather than leading with a run of blanks.
    const by = this._sessionSort === 'name' ? 'name' : 'number';
    const players = roster.concat(gone).sort((a, b) => {
      if (by === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      // Number(null) is 0, which would sort an unnumbered player to the very
      // top -- a run of blanks above the squad reads as broken data.
      const na = a.recordingNumber == null ? NaN : Number(a.recordingNumber);
      const nb = b.recordingNumber == null ? NaN : Number(b.recordingNumber);
      const ga = Number.isFinite(na), gb = Number.isFinite(nb);
      if (ga !== gb) return ga ? -1 : 1;
      if (ga && na !== nb) return na - nb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    if (players.length === 0) {
      return '<p class="text-muted" style="font-size:0.85rem;">This team has no players yet.</p>';
    }

    const measure = drill.measure || 'count_high';
    const bands = (this._sessionBands || []);
    const hint = measure === 'time_low' ? 'seconds — fastest wins'
               : measure === 'time_bands' ? 'mm:ss — scored against the standard'
               : measure === 'win_loss' ? 'result'
               : 'number — higher wins';

    // A timed standard is only meaningful once the squad has one. Said here
    // rather than after saving, when the exercise would simply not be counted
    // and nothing would explain why.
    const bandNote = measure === 'time_bands'
      ? (bands.length
          ? `<p class="text-muted" style="font-size:0.76rem; margin:0 0 8px 0;">Standards: ${
              bands.map(b => `${window.supabaseService.formatSecondsAsTime(b.max_seconds)} → ${Number(b.factor)}`).join(' · ')
            }</p>`
          : `<p style="color:var(--color-danger); font-size:0.76rem; margin:0 0 8px 0;">
               No standards set for this team, so this exercise will not be scored for them.
               Set them under Exercise Weights first.
             </p>`)
      : '';

    return `
      <p class="text-muted" style="font-size:0.78rem; margin:0 0 8px 0;">
        ${drill.name} &middot; weight ${Number(drill.points ?? 3)} &middot; ${hint}
      </p>
      ${bandNote}
      <div style="display:flex; gap:8px; align-items:center; margin:0 0 8px 0;">
        <span class="text-muted" style="font-size:0.72rem; text-transform:uppercase;">Order by</span>
        <span class="filter-chip ${by === 'number' ? 'active' : ''}" style="font-size:0.72rem; cursor:pointer;"
              onclick="app.setSessionSort('number')">Recording no.</span>
        <span class="filter-chip ${by === 'name' ? 'active' : ''}" style="font-size:0.72rem; cursor:pointer;"
              onclick="app.setSessionSort('name')">Name</span>
      </div>
      ${players.map(p => {
        // A player who joined after this session was recorded has no stored
        // row. Default them to excused rather than present: they were not
        // there, and a blank present row would block the save.
        const had = pre ? pre[p.id] : null;
        const att = pre ? (had ? had.attendance : 'excused') : 'present';
        const val = had && had.rawValue !== null && had.rawValue !== undefined ? had.rawValue : '';
        const out = had && had.outcome ? had.outcome : '';
        return `
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;${p._gone ? ' opacity:.75;' : ''}">
          <span style="flex:1; color:#FFF; font-size:0.85rem;">
            <span style="display:inline-block; min-width:28px; color:var(--bhs-gold-accent); font-weight:700;">${p.recordingNumber != null ? p.recordingNumber : '—'}</span>
            ${p.name}
            ${p._gone ? '<span class="badge badge-coach" style="font-size:0.65rem;">no longer on this team</span>' : ''}
          </span>
          ${measure === 'win_loss'
            ? `<select id="sessionOutcome_${p.id}" class="form-control" style="max-width:110px; font-size:0.8rem;">
                 <option value=""${out === '' ? ' selected' : ''}>— result —</option>
                 <option value="win"${out === 'win' ? ' selected' : ''}>Won</option>
                 <option value="draw"${out === 'draw' ? ' selected' : ''}>Drew</option>
                 <option value="loss"${out === 'loss' ? ' selected' : ''}>Lost</option>
               </select>`
            : measure === 'time_bands'
            ? `<input type="text" id="sessionValue_${p.id}" class="form-control" placeholder="4:30"
                      style="max-width:110px; font-size:0.8rem;"
                      value="${val === '' ? '' : window.supabaseService.formatSecondsAsTime(val)}"
                      oninput="app.showBandEarned('${p.id}')" />
               <span id="sessionEarned_${p.id}" class="text-muted" style="font-size:0.75rem; min-width:64px;"></span>`
            : `<input type="number" id="sessionValue_${p.id}" class="form-control" step="any"
                      style="max-width:110px; font-size:0.8rem;" value="${val}" />`}
          <select id="sessionAttend_${p.id}" class="form-control" style="max-width:130px; font-size:0.8rem;">
            <option value="present"${att === 'present' ? ' selected' : ''}>Here</option>
            <option value="excused"${att === 'excused' ? ' selected' : ''}>Excused</option>
            <option value="unexcused"${att === 'unexcused' ? ' selected' : ''}>No-show</option>
          </select>
        </div>`; }).join('')}`;
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
  /**
   * Show what a typed time earns, as it is typed.
   *
   * The database is the authority on scoring; this is the same rule computed
   * locally so a coach sees the band land rather than discovering it after a
   * save and a reload.
   */
  showBandEarned(playerId) {
    const out = document.getElementById(`sessionEarned_${playerId}`);
    const input = document.getElementById(`sessionValue_${playerId}`);
    if (!out || !input) return;

    const raw = input.value.trim();
    if (!raw) { out.textContent = ''; return; }

    const seconds = window.supabaseService.parseTimeToSeconds(raw);
    if (seconds === null) {
      out.textContent = 'mm:ss?';
      out.style.color = 'var(--color-danger)';
      return;
    }

    const factor = window.supabaseService.factorForTime(seconds, this._sessionBands || []);
    out.textContent = factor > 0 ? `earns ${factor}` : 'no band';
    out.style.color = factor > 0 ? 'var(--bhs-cyan-accent)' : 'var(--text-muted)';
  },

  /**
   * Reorder the session grid.
   *
   * Whatever has been typed is read back into the prefill first, so changing
   * the order mid-entry does not discard times already entered -- the rows are
   * re-rendered from scratch, and anything only in the DOM would be lost.
   */
  setSessionSort(by) {
    const typed = this.collectSessionResults();
    this._sessionPrefill = this._sessionPrefill || {};
    typed.forEach(r => {
      this._sessionPrefill[r.playerId] = {
        attendance: r.attendance,
        rawValue: r.rawValue,
        outcome: r.outcome
      };
    });

    this._sessionSort = by === 'name' ? 'name' : 'number';
    const rows = document.getElementById('sessionRows');
    if (rows) rows.innerHTML = this.renderSessionRows();
  },

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
        // A banded drill is typed as mm:ss and stored as seconds. parseFloat
        // would read "4:30" as 4, which lands under every standard and hands
        // the player full marks for a time they did not run.
        const n = measure === 'time_bands'
          ? window.supabaseService.parseTimeToSeconds(raw)
          : parseFloat(raw);
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
      // Passing the id makes saveMatrixSession upsert the existing row rather
      // than insert a second session for the same exercise and day.
      const session = { drillId: this._sessionDrillId, occurredOn };
      if (this._editingSessionId) session.id = this._editingSessionId;

      const res = await window.supabaseService.saveMatrixSession(
        this.activeTeamId, session, this.collectSessionResults()
      );
      if (!res.ok) return set(res.error || 'Could not save that session.');

      // Leaving edit state set would make the next "Record a session"
      // overwrite the session just edited instead of creating a new one.
      this._editingSessionId = null;
      this._sessionPrefill = null;

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
   * Each row offers Edit and Delete. A session's drill can itself have been
   * deleted since, so
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
                onclick="app.editSession('${s.id}')">Edit</button>
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
  },

  /**
   * Why a player sits where they sit: one line per exercise.
   *
   * The lines come from matrix_exercise_points, which matrix_standings is an
   * aggregate of -- so they sum to the leaderboard row this was opened from
   * by construction rather than by two calculations agreeing.
   */
  async openBreakdown(playerId) {
    const player = (this.data.players || []).find(p => p.id === playerId);
    if (!player) return;

    this._breakdownPlayer = player;
    this._breakdown = null;

    const body = document.getElementById('breakdownBody');
    const title = document.getElementById('breakdownTitle');
    if (title) title.textContent = player.name;
    if (body) body.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">Loading…</p>';

    const modal = document.getElementById('breakdownModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }

    if (window.supabaseService?.isConfigured()) {
      this._breakdown = await window.supabaseService.fetchPlayerBreakdown(this.activeTeamId, playerId);
    }
    if (body) body.innerHTML = this.renderBreakdown();
  },

  /** What the player actually did, phrased for the exercise they did it in. */
  breakdownDetail(row) {
    const names = new Map((this.data.players || []).map(p => [p.id, p.name]));
    if (row.kind === 'head_to_head') {
      const who = names.get(row.opponent_id) || 'an opponent';
      return row.detail === 'win' ? `beat ${who}`
           : row.detail === 'draw' ? `drew with ${who}`
           : `lost to ${who}`;
    }
    if (row.kind === 'win_loss') {
      return row.detail === 'win' ? 'won' : row.detail === 'draw' ? 'drew' : 'lost';
    }
    if (row.kind === 'absent') return 'no-show';
    // Distinct from a no-show: nobody marked them absent, they were simply
    // never given a row. Naming it tells the coach to go back and fill it in.
    if (row.kind === 'not_entered') return 'not entered';
    return row.raw_value === null || row.raw_value === undefined
      ? 'took part' : String(Number(row.raw_value));
  },

  renderBreakdown() {
    const rows = this._breakdown;
    if (rows === null || rows === undefined) {
      return '<p class="text-muted" style="font-size:0.85rem;">Could not load the breakdown.</p>';
    }
    if (rows.length === 0) {
      // Distinct from a failure: this player genuinely has nothing scored.
      // An excused absence contributes no row, which is the point of it.
      return `<p class="text-muted" style="font-size:0.85rem;">
        Nothing scored yet for ${this._breakdownPlayer ? this._breakdownPlayer.name : 'this player'}
        on this team. Excused absences do not appear here &mdash; they count for
        nothing either way.</p>`;
    }

    const earned = rows.reduce((t, r) => t + Number(r.earned || 0), 0);
    const avail = rows.reduce((t, r) => t + Number(r.available || 0), 0);
    const share = avail > 0 ? (100 * earned / avail) : null;

    return `
      <div style="display:flex; gap:18px; align-items:baseline; flex-wrap:wrap; margin-bottom:12px;">
        <span style="color:var(--bhs-cyan-accent); font-size:1.5rem; font-weight:700;">
          ${share === null ? '—' : share.toFixed(1) + '%'}
        </span>
        <span class="text-muted" style="font-size:0.85rem;">
          ${earned.toFixed(2)} of ${avail.toFixed(2)} points across
          ${rows.length} exercise${rows.length === 1 ? '' : 's'}
        </span>
      </div>
      <div class="help-tablewrap"><table class="help-table">
        <thead><tr><th>Exercise</th><th>Date</th><th>Result</th><th>Earned</th><th>Of</th></tr></thead>
        <tbody>
          ${rows.map(r => {
            const zero = Number(r.earned || 0) === 0;
            return `
            <tr>
              <td>${r.exercise || 'Exercise'}</td>
              <td class="text-muted">${r.occurred_on || ''}</td>
              <td${(r.kind === 'absent' || r.kind === 'not_entered') ? ' style="color:var(--color-danger);"' : ''}>${this.breakdownDetail(r)}</td>
              <td${zero ? ' class="text-muted"' : ' style="color:var(--bhs-cyan-accent); font-weight:600;"'}>
                ${Number(r.earned || 0).toFixed(2)}
              </td>
              <td class="text-muted">${Number(r.available || 0).toFixed(2)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
      <p class="text-muted" style="font-size:0.78rem; margin-top:10px;">
        Every exercise offers its full weight; the best result earns all of it.
        Ranking is on points earned, so competing in what matters most is what
        rises. These lines add up to the leaderboard row exactly.
      </p>`;
  }

});
