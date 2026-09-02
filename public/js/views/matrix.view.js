/**
 * BHS Soccer - Competitive Matrix View
 * Adds renderMatrixView() to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 */

Object.assign(BHSSoccerApp.prototype, {

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
            </div>` : ''}
        </div>

        <div class="matrix-grid">
          <div class="matrix-table-container">
            <div class="table-title">
              <h3 style="color:#FFF">CURRENT PRACTICE MATRIX LEADERBOARD</h3>
              <span class="badge badge-coach">UPDATED DAILY</span>
            </div>
            
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>RANK</th>
                  <th>PLAYER</th>
                  <th>EX</th>
                  <th>W-D-L</th>
                  <th>PTS</th>
                  <th>OF</th>
                  <th>SHARE</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  // Hoisted: computing this inside the map would rescan every
                  // player for every row.
                  const leaderPts = Math.max(0, ...(this.data.players || [])
                    .map(x => Number(x.matrixStats?.earned || 0)));
                  return (this.data.players || [])
                  .filter(p => !p.is_deleted && !p.isDeleted)
                  .sort((a, b) => (a.matrixStats?.rank || 999) - (b.matrixStats?.rank || 999))
                  .map(p => {
                    // Per-key defaults, not `p.matrixStats || {...}`. matrixStats is
                    // populated in syncFromSupabase() by left-joining standings onto
                    // the roster, so a player with no logged results at all gets no
                    // matrixStats property rather than a zeroed one — an
                    // object-level fallback covers that, but per-key defaults are
                    // also what protects a partially-shaped object (e.g. missing
                    // `exercises` while `wins`/`losses` are present) from rendering
                    // `undefined` in any one cell.
                    const ms = p.matrixStats || {};
                    const m = {
                      wins: ms.wins || 0, draws: ms.draws || 0, losses: ms.losses || 0,
                      games: ms.games || 0, exercises: ms.exercises || 0,
                      earned: Number(ms.earned || 0), available: Number(ms.available || 0),
                      share: (ms.share === undefined ? null : ms.share),
                      rank: ms.rank || 999
                    };
                    // The bar tracks POINTS against the leader, because points
                    // are what the table is ordered by. A bar drawn from share
                    // would disagree with the ordering sitting beside it.
                    const barPct = leaderPts > 0 ? Math.round((m.earned / leaderPts) * 100) : 0;
                    return `
                  <tr>
                    <td>
                      ${m.exercises === 0
                        ? '<div class="rank-pill rank-other">&mdash;</div>'
                        : `<div class="rank-pill ${m.rank <= 3 ? 'rank-' + m.rank : 'rank-other'}">${m.rank}</div>`}
                    </td>
                    <td>
                      <button type="button" onclick="app.openBreakdown('${p.id}')"
                              title="See how these points were earned"
                              style="background:none; border:0; padding:0; cursor:pointer; text-align:left; font:inherit; color:inherit;">
                        <strong style="border-bottom:1px dotted var(--bhs-cyan-accent);">${p.name}</strong>
                      </button>
                      <span class="text-muted">${p.recordingNumber != null ? '(' + p.recordingNumber + ')' : '—'}</span>
                    </td>
                    <td>${m.exercises}</td>
                    <td>${m.wins} - ${m.draws} - ${m.losses}</td>
                    <td><strong>${m.earned.toFixed(2)}</strong></td>
                    <td class="text-muted">${m.available.toFixed(2)}</td>
                    <td>
                      ${m.share === null ? '<span class="text-muted">&mdash;</span>' : m.share.toFixed(1) + '%'}
                      <div class="score-progress">
                        <div class="score-bar" style="width: ${barPct}%;"></div>
                      </div>
                    </td>
                  </tr>`;
                  }).join('');
                })()}
              </tbody>
            </table>

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
