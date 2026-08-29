/**
 * BHS Soccer - Competitive Matrix View
 * Adds renderMatrixView() to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 */

Object.assign(BHSSoccerApp.prototype, {

  renderMatrixView() {
    const isCoach = window.auth.isCoach();

    return `
      <div class="container">
        <div class="portal-header">
          <div class="portal-title">
            <h2>🏆 COMPETITIVE RATING MATRIX</h2>
            <p>Objective practice competition tracker modeling competitive player performance ratings and rankings.</p>
          </div>
          ${isCoach ? `<button class="btn btn-gold" onclick="app.openAddDrillModal()">+ Record Practice Drill Scores</button>` : ''}
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
                  <th>GP</th>
                  <th>W-D-L</th>
                  <th>PTS</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  // Hoisted: computing this inside the map would rescan every
                  // player for every row.
                  const leaderPts = Math.max(1, ...(this.data.players || []).map(x => x.matrixStats?.points || 0));
                  return (this.data.players || [])
                  .filter(p => !p.is_deleted && !p.isDeleted)
                  .sort((a, b) => (a.matrixStats?.rank || 999) - (b.matrixStats?.rank || 999))
                  .map(p => {
                    // Per-key defaults, not `p.matrixStats || {...}`. A player added
                    // through the UI before the next sync carries the OLD shape
                    // (wins, losses, points, rank, and the removed blended index)
                    // with no games, draws or winPct — an object-level fallback
                    // would not fire and the row would render `undefined`.
                    const ms = p.matrixStats || {};
                    const m = {
                      wins: ms.wins || 0, draws: ms.draws || 0, losses: ms.losses || 0,
                      games: ms.games || 0, points: ms.points || 0,
                      winPct: (ms.winPct === undefined ? null : ms.winPct),
                      rank: ms.rank || 999
                    };
                    const barPct = Math.round((m.points / leaderPts) * 100);
                    return `
                  <tr>
                    <td>
                      ${m.games === 0
                        ? '<div class="rank-pill rank-other">&mdash;</div>'
                        : `<div class="rank-pill ${m.rank <= 3 ? 'rank-' + m.rank : 'rank-other'}">${m.rank}</div>`}
                    </td>
                    <td><strong>${p.name}</strong> <span class="text-muted">#${p.number || '—'}</span></td>
                    <td>${m.games}</td>
                    <td>${m.wins} - ${m.draws} - ${m.losses}</td>
                    <td><strong>${m.points}</strong></td>
                    <td>
                      ${m.winPct === null ? '<span class="text-muted">—</span>' : m.winPct.toFixed(1) + '%'}
                      <div class="score-progress">
                        <div class="score-bar" style="width: ${barPct}%;"></div>
                      </div>
                    </td>
                  </tr>`;
                  }).join('');
                })()}
              </tbody>
            </table>
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
