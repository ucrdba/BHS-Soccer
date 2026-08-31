/**
 * BHS Soccer - Home View
 * Adds renderHomeView() to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 */

Object.assign(BHSSoccerApp.prototype, {

  renderHomeView() {
    // --- Compute season stats from completed schedule entries ---
    const completed = this.data.schedule.filter(m => m.status === 'COMPLETED' && m.score);
    let wins = 0, draws = 0, losses = 0, goalsFor = 0, cleanSheets = 0;

    completed.forEach(m => {
      // Parse score strings like "BHS 3 – 1", "BHS 2-0", "3:1" etc.
      const raw = (m.score || '').replace(/BHS\s*/i, '').replace(/–|-|:/g, ' ');
      const nums = raw.match(/\d+/g);
      if (nums && nums.length >= 2) {
        const gf = parseInt(nums[0]);
        const ga = parseInt(nums[1]);
        goalsFor += gf;
        if (ga === 0) cleanSheets++;
        if (gf > ga) wins++;
        else if (gf === ga) draws++;
        else losses++;
      }
    });

    const gamesPlayed = completed.length;
    const goalsPerGame = gamesPlayed > 0 ? (goalsFor / gamesPlayed).toFixed(2) : '0.00';
    const recordStr = `${wins} - ${losses} - ${draws}`;

    // Next upcoming match & countdown
    // Shared with the countdown, so the heading and the clock can never name
    // two different matches.
    const nextMatch = this.getNextMatch();
    const countdown = this.getNextMatchCountdown();
    const cdDaysStr = countdown ? countdown.days : '00';
    const cdHoursStr = countdown ? countdown.hours : '00';
    const cdMinsStr = countdown ? countdown.mins : '00';

    const currentUser = window.auth.getCurrentUser();
    const isPublicGuest = !currentUser || currentUser.role === 'guest';
    const activeThought = this.getActiveThought();

    return `
      <!-- Hero Section -->
      <section class="hero-section">
        <div class="hero-content">
          <span class="hero-tag">BEAUMONT HIGH SCHOOL • BOYS VARSITY</span>
          <h1 class="hero-title brand-font">HOME OF THE <span class="text-cyan">COUGARS</span></h1>
          <p class="hero-sub">Driven by discipline, tactical excellence, and relentless competition on the field.</p>
          
          <div class="countdown-box">
            <div class="match-info">
              ${nextMatch ? `
                <h4>NEXT MATCH vs ${nextMatch.opponent.toUpperCase()}</h4>
                <p>${nextMatch.isHome ? 'Home' : 'Away'} • ${nextMatch.location} | ${nextMatch.date}, ${nextMatch.time}</p>
              ` : `
                <h4>SEASON COMPLETE</h4>
                <p>All scheduled matches have been played. Final record: ${recordStr}</p>
              `}
            </div>
            <div class="timer-digits">
              <div class="timer-unit"><div class="timer-num" id="cdDays">${cdDaysStr}</div><div class="timer-label">Days</div></div>
              <div class="timer-unit"><div class="timer-num" id="cdHours">${cdHoursStr}</div><div class="timer-label">Hrs</div></div>
              <div class="timer-unit"><div class="timer-num" id="cdMins">${cdMinsStr}</div><div class="timer-label">Min</div></div>
            </div>
          </div>
        </div>
      </section>

      <div class="container" style="margin-top: 30px;">
        <!-- Side-by-Side (Team Members) or Full Width (Public Guest) -->
        <div style="display: grid; grid-template-columns: ${!isPublicGuest ? 'minmax(300px, 360px) 1fr' : '1fr'}; gap: 24px; margin-bottom: 50px; align-items: stretch;">
          
          ${!isPublicGuest ? `
            <!-- Left Column: Coach's Thoughts For The Day (Team Members Only) -->
            <div class="player-card" style="padding: 24px; background: linear-gradient(145deg, rgba(0, 71, 171, 0.25), rgba(15, 23, 42, 0.85)); border: 1px solid var(--bhs-gold-accent); display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--bhs-navy-border); padding-bottom: 10px;">
                  <h3 style="color: var(--bhs-gold-accent); margin: 0; font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
                    <span>💡</span> COACH'S DAILY THOUGHTS
                  </h3>
                  ${(window.auth.isCoach() || window.auth.isAdmin()) ? `<button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;" onclick="app.openManageThoughtsModal()">⚙️ Manage</button>` : ''}
                </div>
                <div style="max-height: 140px; overflow-y: auto; padding-right: 6px; scrollbar-width: thin; margin-bottom: 14px;">
                  <p style="color: #FFF; font-size: 0.92rem; line-height: 1.6; white-space: pre-wrap; margin: 0;">${activeThought.text}</p>
                </div>
                <div>
                  <button class="btn btn-gold" style="width: 100%; padding: 8px 14px; font-size: 0.88rem; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="app.openTakeQuizModal()">📝 Take Quiz</button>
                </div>
              </div>
              <div style="margin-top: 14px; pt-8; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.78rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
                ${activeThought.coachName ? `<span>— ${activeThought.coachName}</span>` : ''}
                <span class="badge badge-coach">HEAD COACH</span>
              </div>
            </div>
          ` : ''}

          <!-- Right Column: Season Spotlight Stats Grid -->
          <div>
            <div class="section-header" style="margin-bottom: 16px;">
              <div>
                <h2 class="section-title">SEASON SPOTLIGHT</h2>
                <p class="text-muted">${this.activeTeamLabel().org} ${this.activeTeamLabel().season || "2026"} Campaign Record</p>
              </div>
              <button class="btn btn-primary" onclick="app.switchView('schedule')">Full Fixtures &amp; Results</button>
            </div>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
              <div class="player-card" style="padding: 20px; text-align: center;">
                <h3 style="color: var(--bhs-gold-accent); font-size: 2.5rem; margin-bottom: 4px;" class="brand-font">${recordStr}</h3>
                <p class="text-muted" style="font-size: 0.85rem; margin: 0;">Overall Record (W-L-D)</p>
                <p class="text-muted" style="font-size: 0.72rem; margin-top:4px;">${gamesPlayed} games played</p>
              </div>
              <div class="player-card" style="padding: 20px; text-align: center;">
                <h3 style="color: var(--bhs-cyan-accent); font-size: 2.5rem; margin-bottom: 4px;" class="brand-font">${goalsFor}</h3>
                <p class="text-muted" style="font-size: 0.85rem; margin: 0;">Goals Scored (${goalsPerGame} / Game)</p>
              </div>
              <div class="player-card" style="padding: 20px; text-align: center;">
                <h3 style="color: var(--color-success); font-size: 2.5rem; margin-bottom: 4px;" class="brand-font">${cleanSheets}</h3>
                <p class="text-muted" style="font-size: 0.85rem; margin: 0;">Clean Sheets Recorded</p>
              </div>
              <div class="player-card" style="padding: 20px; text-align: center;">
                <h3 style="color: #FFF; font-size: 2.5rem; margin-bottom: 4px;" class="brand-font">${this.data.schedule.filter(m => m.status === 'UPCOMING').length}</h3>
                <p class="text-muted" style="font-size: 0.85rem; margin: 0;">Upcoming Matches</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Competitor Spotlight (If logged in as Player/Coach) -->
        ${window.auth.canAccessRatings() ? `
          <div class="portal-header" style="margin-bottom: 0;">
            <div class="portal-title">
              <h2>⚡ PRACTICE COMPETITOR OF THE WEEK</h2>
              <p>Top overall competitor ranked by practice wins, 1v1 performance, and training matrix index.</p>
            </div>
            <button class="btn btn-gold" onclick="app.switchView('matrix')">View Full Matrix Board</button>
          </div>
        ` : ''}
      </div>
    `;
  }

});
