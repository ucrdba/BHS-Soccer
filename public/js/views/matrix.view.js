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
                  <th>POS</th>
                  <th>PRACTICE WINS</th>
                  <th>WIN %</th>
                  <th>MATRIX INDEX</th>
                </tr>
              </thead>
              <tbody>
                ${(this.data.players || []).filter(p => !p.is_deleted && !p.isDeleted).sort((a,b) => (a.matrixStats?.rank || 99) - (b.matrixStats?.rank || 99)).map(p => `
                  <tr>
                    <td>
                      <div class="rank-pill ${p.matrixStats.rank <= 3 ? 'rank-' + p.matrixStats.rank : 'rank-other'}">
                        ${p.matrixStats.rank}
                      </div>
                    </td>
                    <td>
                      <strong>${p.name}</strong> <span class="text-muted">(#${p.number})</span>
                    </td>
                    <td><span class="badge-pos">${p.position}</span></td>
                    <td>${p.matrixStats.wins} W - ${p.matrixStats.losses} L</td>
                    <td>${((p.matrixStats.wins / (p.matrixStats.wins + p.matrixStats.losses)) * 100).toFixed(1)}%</td>
                    <td>
                      <strong>${p.matrixStats.drillScore}</strong>
                      <div class="score-progress">
                        <div class="score-bar" style="width: ${p.matrixStats.drillScore}%;"></div>
                      </div>
                    </td>
                  </tr>
                `).join('')}
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
