/**
 * BHS Soccer - Competitive Matrix View
 * Adds renderMatrixView() to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 */

Object.assign(BHSSoccerApp.prototype, {

  // The board maths lives in src/domain/matrix.ts and reaches this classic
  // script through window, the same way the plus/minus replay engine does.
  // See docs/superpowers/specs/2026-09-05-vue-migration-design.md.

  /** The data the matrix domain functions need, from app state. */
  _matrixCtx() {
    return {
      points: this._exercisePoints || [],
      players: this.data.players || [],
      drillsBank: this.data.drillsBank || []
    };
  },

  exerciseLeaderboard(drillId, sortBy, reversed) {
    return window.matrixDomain.exerciseLeaderboard(this._matrixCtx(), drillId, sortBy, reversed);
  },

  compareExerciseRows(x, y, sortBy, timed, reversed) {
    return window.matrixDomain.compareExerciseRows(x, y, sortBy, timed, reversed);
  },

  exercisesWithResults() {
    return window.matrixDomain.exercisesWithResults(this._matrixCtx());
  },

  /** How a player's best figure reads for this exercise. */
  formatExerciseBest(row) {
    if (row.best === null || row.best === undefined) return '—';
    return row.timed ? window.supabaseService.formatSecondsAsTime(row.best) : String(row.best);
  },

  async setExerciseFilter(drillId) {
    this._exerciseFilter = drillId || '';
    this._exerciseSort = 'earned';
    this._exerciseSortReversed = false;
    if (this._exerciseFilter && !(this._exercisePoints || []).length) {
      await this.loadExercisePoints();
    }
    this.renderCurrentView();
  },

  matrixBoardRows() {
    return window.matrixDomain.matrixBoardRows(
      this.data.players || [], this._boardSort || 'rank', !!this._boardSortReversed);
  },

  compareBoardRows(x, y, by, reversed) {
    return window.matrixDomain.compareBoardRows(x, y, by, reversed);
  },

  boardSortDescends(by) {
    return window.matrixDomain.boardSortDescends(by);
  },

  // The decision moves to the domain module; the assignment and the redraw
  // stay here, because they are what makes this a view method.
  setBoardSort(by) {
    const next = window.matrixDomain.nextSortState(
      { by: this._boardSort, reversed: !!this._boardSortReversed }, by);
    this._boardSort = next.by;
    this._boardSortReversed = next.reversed;
    this.renderCurrentView();
  },

  setExerciseSort(by) {
    const next = window.matrixDomain.nextSortState(
      { by: this._exerciseSort, reversed: !!this._exerciseSortReversed }, by);
    this._exerciseSort = next.by;
    this._exerciseSortReversed = next.reversed;
    this.renderCurrentView();
  },

  exerciseSortDescends(by, timed) {
    return window.matrixDomain.exerciseSortDescends(by, timed);
  },

  async loadExercisePoints() {
    if (!window.supabaseService?.isConfigured() || !this.activeTeamId) {
      this._exercisePoints = [];
      return;
    }
    this._exercisePoints =
      (await window.supabaseService.fetchTeamExercisePoints(this.activeTeamId)) || [];
  },

  /**
   * The single-exercise table.
   *
   * Columns differ by measure because the natural figure does: wins and draws
   * for a head-to-head or small-sided drill, a best count or a best time for
   * the others. Showing all of them for every exercise would fill the table
   * with columns that are always zero.
   */
  renderExerciseLeaderboard() {
    const drillId = this._exerciseFilter;
    const drill = (this.data.drillsBank || []).find(d => d.id === drillId);
    if (!drill) return '';

    const rows = this.exerciseLeaderboard(drillId, this._exerciseSort, this._exerciseSortReversed);
    const measure = drill.measure || 'count_high';
    const isWinLoss = measure === 'win_loss' || measure === 'head_to_head';
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (rows.length === 0) {
      return `<p class="text-muted" style="font-size:0.85rem;">No results recorded for ${esc(drill.name)} yet.</p>`;
    }

    const timed = measure === 'time_low' || measure === 'time_bands';
    const sortable = (key, label) => {
      const on = this._exerciseSort === key;
      // The arrow shows the order in force, not merely that a column is sorted.
      const desc = this.exerciseSortDescends(key, timed) !== !!this._exerciseSortReversed;
      const arrow = on ? (desc ? ' \u25BC' : ' \u25B2') : '';
      const cls = key === 'name' ? 'col-text' : '';
      return `<th class="${cls}" style="cursor:pointer;" title="Sort by ${esc(label)}"
                  onclick="app.setExerciseSort('${key}')">${esc(label)}${arrow}</th>`;
    };

    return `
      <table class="data-table" style="width:100%;">
        <thead>
          <tr>
            ${sortable('number', '#')}
            ${sortable('name', 'Player')}
            ${isWinLoss ? sortable('wins', 'W-D-L') : sortable('best', measure === 'time_bands' || measure === 'time_low' ? 'Best time' : 'Best')}
            ${sortable('earned', 'Points')}
            <th title="Points available from this exercise">Of</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="text-muted">${r.recordingNumber != null ? '(' + r.recordingNumber + ')' : '—'}</td>
              <td class="col-text"><strong>${esc(r.name)}</strong></td>
              <td>${isWinLoss ? `${r.wins} - ${r.draws} - ${r.losses}` : this.formatExerciseBest(r)}</td>
              <td><strong>${r.earned.toFixed(2)}</strong></td>
              <td class="text-muted">${r.available.toFixed(2)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  },


  /**
   * The individual results behind the leaderboard, with edit and delete.
   *
   * Points are derived in Postgres rather than stored, and the argument for
   * that design is that correcting a mis-entered result re-derives every rank.
   * That argument only holds if there is somewhere to correct it — otherwise a
   * typo needs the SQL editor. This panel is that somewhere.
   *
   * Coach-only, and rendered from `this.data.matrixLogs`, which syncFromSupabase
   * populates in the database's snake_case.
   */
  renderMatrixResultsPanel() {
    const logs = this.data.matrixLogs || [];

    // Resolve ids to names once rather than scanning the roster per row.
    const byId = new Map((this.data.players || []).map(p => [p.id, p]));
    const nameOf = (id) => {
      const p = byId.get(id);
      if (!p) return '<span class="text-muted">(removed player)</span>';
      // The RECORDING number, not the shirt: the Matrix is read alongside the
      // paper sheets, which carry recording numbers, and 0021 cleared the shirt
      // number for the whole squad when it moved those values across.
      return `${p.recordingNumber != null ? '<span class="text-muted">(' + p.recordingNumber + ')</span> ' : ''}${p.name}`;
    };
    const drillById = new Map((this.data.drillsBank || []).map(d => [d.id, d]));

    if (logs.length === 0) {
      return `
        <div class="table-title" style="margin-top:24px;">
          <h3 style="color:#FFF">LOGGED RESULTS</h3>
        </div>
        <p style="color:var(--text-muted); font-size:0.85rem; padding:8px 0;">
          No results recorded yet. Use <strong>+ Record Practice Drill Scores</strong> above; every
          result you log here is what the leaderboard is calculated from.
        </p>`;
    }

    return `
      <div class="table-title" style="margin-top:24px;">
        <h3 style="color:#FFF">LOGGED RESULTS</h3>
        <span class="badge badge-coach">${logs.length} RECORDED</span>
      </div>
      <table class="matrix-table">
        <thead>
          <tr><th>DATE</th><th>RESULT</th><th>SCORE</th><th>DRILL</th><th></th></tr>
        </thead>
        <tbody>
          ${logs.map(l => {
            const a = nameOf(l.player_a_id);
            const b = nameOf(l.player_b_id);
            // Mark the winner rather than making the reader decode 'a'/'b'.
            const verdict = l.outcome === 'draw'
              ? `${a} <span class="text-muted">drew with</span> ${b}`
              : l.outcome === 'a'
                ? `<strong style="color:var(--bhs-gold-accent);">${a}</strong> <span class="text-muted">beat</span> ${b}`
                : `<strong style="color:var(--bhs-gold-accent);">${b}</strong> <span class="text-muted">beat</span> ${a}`;
            const drill = drillById.get(l.drill_id);
            return `
          <tr>
            <td style="white-space:nowrap;">${l.occurred_on || '—'}</td>
            <td>${verdict}</td>
            <td>${l.score_text || '<span class="text-muted">—</span>'}</td>
            <td>${drill ? drill.name : '<span class="text-muted">—</span>'}</td>
            <td style="white-space:nowrap;">
              <button class="btn-card-edit" onclick="app.openAddDrillModal('${l.id}')">✏️ Edit</button>
              <button class="btn-card-delete" onclick="app.deleteMatrixResult('${l.id}')">🗑️ Delete</button>
            </td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  },

  renderMatrixView() {
    const isCoach = window.auth.isCoach();

    // The arrow shows the order in force, not merely that a column is sorted.
    const boardTh = (key, label) => {
      const on = (this._boardSort || 'rank') === key;
      const desc = this.boardSortDescends(key) !== !!this._boardSortReversed;
      const arrow = on ? (desc ? ' \u25BC' : ' \u25B2') : '';
      const cls = key === 'name' ? 'col-text' : '';
      return `<th class="${cls}" style="cursor:pointer;" title="Sort by ${label}"
                  onclick="app.setBoardSort('${key}')">${label}${arrow}</th>`;
    };

    return `
      <div class="container">
        <div class="portal-header">
          <div class="portal-title">
            <h2>🏆 COMPETITIVE RATING MATRIX</h2>
            <p>Objective practice competition tracker modeling competitive player performance ratings and rankings.</p>
          </div>
          ${isCoach ? `
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-gold" onclick="app.openAddDrillModal()">+ Record Practice Drill Scores</button>
              <button class="btn btn-gold" onclick="app.newSession()">📋 Record a session</button>
              <button class="btn btn-secondary" onclick="app.openWeightsModal()">⚖️ Exercise weights</button>
              <button class="btn btn-secondary" onclick="app.openSquadReport()"
                      title="Every exercise, printable for the locker room">📄 Squad report</button>
              <button class="btn btn-secondary" onclick="app.openProgressReport()"
                      title="Each player's results over time — is anyone improving">📈 Progress</button>
            </div>` : ''}
        </div>

        <div class="matrix-grid">
          <div class="matrix-table-container">
            <div class="table-title">
              <h3 style="color:#FFF">CURRENT PRACTICE MATRIX LEADERBOARD</h3>
              <span class="badge badge-coach">UPDATED DAILY</span>
            </div>

            <!-- Filtering to one exercise answers a different question from the
                 overall board: who has the most small-sided wins, who is best
                 at Coopers. -->
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
              <label for="matrixExerciseFilter" class="text-muted" style="font-size:0.72rem; text-transform:uppercase;">Exercise</label>
              <select id="matrixExerciseFilter" class="form-control" style="max-width:240px; font-size:0.8rem;"
                      onchange="app.setExerciseFilter(this.value)">
                <option value="">All exercises &mdash; overall points</option>
                ${this.exercisesWithResults().map(d =>
                  `<option value="${d.id}"${this._exerciseFilter === d.id ? ' selected' : ''}>${d.name}</option>`
                ).join('')}
              </select>
              ${this._exerciseFilter
                ? '<span class="text-muted" style="font-size:0.76rem;">Click a column heading to re-sort.</span>'
                : ''}
            </div>

            ${this._exerciseFilter ? this.renderExerciseLeaderboard() : `
            
            <table class="matrix-table">
              <thead>
                <tr>
                  ${boardTh('rank', 'RANK')}
                  ${boardTh('name', 'PLAYER')}
                  <th>EX</th>
                  <th>W-D-L</th>
                  ${boardTh('earned', 'PTS')}
                  <th>OF</th>
                  ${boardTh('share', 'SHARE')}
                </tr>
              </thead>
              <tbody>
                ${this.matrixBoardRows().map(m => `
                  <tr>
                    <td>
                      ${m.exercises === 0
                        ? '<div class="rank-pill rank-other">&mdash;</div>'
                        : `<div class="rank-pill ${m.rank <= 3 ? 'rank-' + m.rank : 'rank-other'}">${m.rank}</div>`}
                    </td>
                    <td class="col-text">
                      <button type="button" onclick="app.openBreakdown('${m.playerId}')"
                              title="See how these points were earned"
                              style="background:none; border:0; padding:0; cursor:pointer; text-align:left; font:inherit; color:inherit;">
                        <strong style="border-bottom:1px dotted var(--bhs-cyan-accent);">${m.name}</strong>
                      </button>
                      <span class="text-muted">${m.recordingNumber != null ? '(' + m.recordingNumber + ')' : '—'}</span>
                    </td>
                    <td>${m.exercises}</td>
                    <td>${m.wins} - ${m.draws} - ${m.losses}</td>
                    <td><strong>${m.earned.toFixed(2)}</strong></td>
                    <td class="text-muted">${m.available.toFixed(2)}</td>
                    <td>
                      ${m.share === null ? '<span class="text-muted">&mdash;</span>' : m.share.toFixed(1) + '%'}
                      <div class="score-progress">
                        <div class="score-bar" style="width: ${m.barPct}%;"></div>
                      </div>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>`}

            ${isCoach ? `<div class="planner-card" style="margin-top:12px;">
              <h3 style="color: var(--bhs-gold-accent); margin-bottom: 12px;">
                📋 RECORDED SESSIONS
                <span class="badge badge-coach">${(this._sessions || []).length}</span>
              </h3>
              ${this.renderSessionHistory()}
            </div>` : ''}

            ${isCoach ? this.renderMatrixResultsPanel() : ''}
          </div>

          <div>
            <div class="planner-card">
              <h3 style="color: var(--bhs-gold-accent); margin-bottom: 12px;">📊 ABOUT THE SYSTEM</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6;">
                Inspired by Hall of Fame UNC Coach <strong>Anson Dorrance</strong>, every practice session is measured competitively. 
                1v1 gauntlets, small-sided games, shooting drills, and fitness tests award points directly impacting player matrix ranks and starting lineup selection.
              </p>
            </div>

            <div class="planner-card">
              <h3 style="color: var(--bhs-cyan-accent); margin-bottom: 12px;">⚽ DRILLS IN CURRENT MATRIX</h3>
              ${this.data.currentPracticePlan.length === 0 ? `
                <p style="color:var(--text-muted); font-size:0.85rem;">No drills in today's practice plan yet. Add drills in the Coach Practice Planner.</p>
              ` : this.data.currentPracticePlan.map(d => `
                <div style="border-bottom: 1px solid var(--bhs-navy-border); padding: 8px 0;">
                  <strong style="color:#FFF">${d.name}</strong>
                  <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                    <span>⏱ ${d.time || ''} &nbsp;·&nbsp; ${d.duration}</span>
                    <span style="color:var(--bhs-cyan-accent);">${d.coachNotes ? '📝 ' + d.coachNotes.substring(0, 40) + (d.coachNotes.length > 40 ? '…' : '') : ''}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }


});
