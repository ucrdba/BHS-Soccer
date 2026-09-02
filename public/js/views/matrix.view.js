/**
 * BHS Soccer - Competitive Matrix View
 * Adds renderMatrixView() to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 */

Object.assign(BHSSoccerApp.prototype, {

  /**
   * The leaderboard for ONE exercise.
   *
   * The overall board answers "who is ahead". This answers "who has the most
   * small-sided wins" and "who is best at Coopers", which are different
   * questions with different natural answers.
   *
   * `best` is each player's PEAK, and which direction that means depends on the
   * measure: the highest count for a counted exercise, the FASTEST time for a
   * timed one. Taking the maximum for a timed drill would call a player's worst
   * run their best and put the slowest of them on top.
   *
   * Points are totalled across every attempt rather than taken from the best
   * one, so this column still agrees with the overall board.
   */
  exerciseLeaderboard(drillId, sortBy, reversed) {
    const rows = (this._exercisePoints || []).filter(r => r.drill_id === drillId);
    if (rows.length === 0) return [];

    const drill = (this.data.drillsBank || []).find(d => d.id === drillId);
    const measure = (drill && drill.measure) || 'count_high';
    const timed = measure === 'time_low' || measure === 'time_bands';
    const byId = new Map((this.data.players || []).map(p => [p.id, p]));

    const acc = {};
    rows.forEach(r => {
      const a = acc[r.player_id] = acc[r.player_id] || {
        playerId: r.player_id,
        wins: 0, draws: 0, losses: 0,
        earned: 0, available: 0, attempts: 0,
        best: null, timed
      };

      a.wins += Number(r.w) || 0;
      a.draws += Number(r.dr) || 0;
      a.losses += Number(r.ls) || 0;
      a.earned += Number(r.earned) || 0;
      a.available += Number(r.available) || 0;

      // A row with no value is an absence or a session never filled in: it
      // counts against the points, but it is not an attempt and cannot be a
      // personal best.
      if (r.raw_value === null || r.raw_value === undefined) return;
      a.attempts += 1;
      const v = Number(r.raw_value);
      if (a.best === null) a.best = v;
      else a.best = timed ? Math.min(a.best, v) : Math.max(a.best, v);
    });

    const out = Object.values(acc).map(a => {
      const p = byId.get(a.playerId);
      return {
        ...a,
        name: (p && p.name) || 'Former squad member',
        recordingNumber: p ? p.recordingNumber : null,
        share: a.available ? (100 * a.earned) / a.available : 0
      };
    });

    return out.sort((x, y) => this.compareExerciseRows(x, y, sortBy, timed, reversed));
  },

  /**
   * Order two rows of a single-exercise board.
   *
   * Points first by default -- the board's own currency, and the only figure
   * that means the same thing for every measure. A player with no figure at all
   * sorts last whichever column is chosen, so a column of blanks never leads.
   */
  compareExerciseRows(x, y, sortBy, timed, reversed) {
    const by = sortBy || 'earned';
    // Reversing flips the comparison of VALUES only. Rows with nothing to
    // compare keep sinking either way -- a column of blanks must never lead
    // the board just because it was clicked twice.
    const flip = reversed ? -1 : 1;

    if (by === 'best') {
      if (x.best === null || y.best === null) {
        if (x.best === y.best) return 0;
        return x.best === null ? 1 : -1;
      }
      // Fastest first for a timed exercise; highest first for a counted one.
      return flip * (timed ? x.best - y.best : y.best - x.best);
    }

    if (by === 'wins') {
      if (y.wins !== x.wins) return flip * (y.wins - x.wins);
      return flip * (y.earned - x.earned);
    }

    if (by === 'name') {
      return flip * String(x.name || '').localeCompare(String(y.name || ''));
    }

    if (by === 'number') {
      const nx = x.recordingNumber == null ? NaN : Number(x.recordingNumber);
      const ny = y.recordingNumber == null ? NaN : Number(y.recordingNumber);
      const gx = Number.isFinite(nx), gy = Number.isFinite(ny);
      if (gx !== gy) return gx ? -1 : 1;          // unnumbered always last
      if (gx && nx !== ny) return flip * (nx - ny);
      return flip * String(x.name || '').localeCompare(String(y.name || ''));
    }

    // Default: points earned, with the best figure breaking a tie rather than
    // leaving two equal players in whatever order they happened to arrive.
    if (y.earned !== x.earned) return flip * (y.earned - x.earned);
    if (x.best !== null && y.best !== null && x.best !== y.best) {
      return flip * (timed ? x.best - y.best : y.best - x.best);
    }
    return String(x.name || '').localeCompare(String(y.name || ''));
  },

  /** Exercises that actually have results, for the picker. */
  exercisesWithResults() {
    const ids = new Set((this._exercisePoints || []).map(r => r.drill_id).filter(Boolean));
    return (this.data.drillsBank || [])
      .filter(d => ids.has(d.id) && !d.is_deleted && !d.isDeleted)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
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

  /**
   * The overall board's rows, already ordered.
   *
   * Lifted out of the template so the ordering can be tested and so the header
   * can sort it. Rank stays the default, because that is the board's own
   * answer to "who is ahead"; the other columns answer different questions.
   *
   * Per-key defaults rather than an object-level fallback: matrixStats is
   * populated by left-joining standings onto the roster, so a player with no
   * results has no matrixStats at all, and one with partial standings can be
   * missing a single key while holding the rest.
   */
  matrixBoardRows() {
    const players = (this.data.players || []).filter(p => !p.is_deleted && !p.isDeleted);
    // Hoisted: computing this per row would rescan every player for every row.
    const leaderPts = Math.max(0, ...players.map(x => Number(x.matrixStats?.earned || 0)));

    const rows = players.map(p => {
      const ms = p.matrixStats || {};
      const earned = Number(ms.earned || 0);
      return {
        playerId: p.id,
        name: p.name,
        recordingNumber: p.recordingNumber,
        wins: ms.wins || 0, draws: ms.draws || 0, losses: ms.losses || 0,
        games: ms.games || 0, exercises: ms.exercises || 0,
        earned,
        available: Number(ms.available || 0),
        share: (ms.share === undefined ? null : ms.share),
        rank: ms.rank || 999,
        // The bar tracks POINTS against the leader, because points are what
        // the table is ordered by by default. A bar drawn from share would
        // disagree with the ordering sitting beside it.
        barPct: leaderPts > 0 ? Math.round((earned / leaderPts) * 100) : 0
      };
    });

    const by = this._boardSort || 'rank';
    const reversed = !!this._boardSortReversed;
    return rows.sort((x, y) => this.compareBoardRows(x, y, by, reversed));
  },

  /**
   * Order two rows of the overall board.
   *
   * A player who has taken part in nothing is not last on merit and not first
   * when reversed -- there is nothing to compare. They sink either way, so a
   * block of empty rows never leads the board.
   */
  compareBoardRows(x, y, by, reversed) {
    const flip = reversed ? -1 : 1;
    const unranked = (r) => r.exercises === 0;

    if (by !== 'name') {
      if (unranked(x) !== unranked(y)) return unranked(x) ? 1 : -1;
    }

    if (by === 'name') {
      return flip * String(x.name || '').localeCompare(String(y.name || ''));
    }

    if (by === 'earned') {
      if (x.earned !== y.earned) return flip * (y.earned - x.earned);
      return String(x.name || '').localeCompare(String(y.name || ''));
    }

    if (by === 'share') {
      // Share is null until a player has taken part in something.
      if (x.share === null || y.share === null) {
        if (x.share === y.share) return 0;
        return x.share === null ? 1 : -1;
      }
      if (x.share !== y.share) return flip * (y.share - x.share);
      return String(x.name || '').localeCompare(String(y.name || ''));
    }

    // Default: the board's own rank, best first.
    if (x.rank !== y.rank) return flip * (x.rank - y.rank);
    return String(x.name || '').localeCompare(String(y.name || ''));
  },

  /** Which way a board column reads on its first click. */
  boardSortDescends(by) {
    return by === 'earned' || by === 'share';
  },

  setBoardSort(by) {
    if (this._boardSort === by) {
      this._boardSortReversed = !this._boardSortReversed;
    } else {
      this._boardSort = by;
      this._boardSortReversed = false;
    }
    this.renderCurrentView();
  },

  /**
   * Click a column to sort by it; click the same one again to reverse.
   *
   * There was no direction at all before: every click re-applied the same
   * fixed order, so the board sorted one way and the arrow in the header
   * implied a second way that did not exist.
   */
  setExerciseSort(by) {
    if (this._exerciseSort === by) {
      this._exerciseSortReversed = !this._exerciseSortReversed;
    } else {
      this._exerciseSort = by;
      this._exerciseSortReversed = false;
    }
    this.renderCurrentView();
  },

  /**
   * Which way a column reads on its FIRST click.
   *
   * Points and wins read highest-first, a time reads fastest-first, and a name
   * or number reads lowest-first. Knowing this is what lets the header arrow
   * show the order actually in force rather than just "sorted".
   */
  exerciseSortDescends(by, timed) {
    if (by === 'name' || by === 'number') return false;
    if (by === 'best') return !timed;
    return true;                        // earned, wins
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
