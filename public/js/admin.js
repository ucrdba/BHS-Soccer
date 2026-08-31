/**
 * BHS Soccer - Admin Panel, Diagnostics and Import/Export
 */

Object.assign(BHSSoccerApp.prototype, {

  async handleSignOut() {
    await window.auth.logout();
    this.updateAuthUI();
    this.renderCurrentView();
    this.closeModals();
  },

  renderPlayerAccountModalContent() {
    const currentUser = window.auth.getCurrentUser();
    const container = document.getElementById('adminModalContent');
    const titleEl = document.getElementById('adminModalTitle');
    if (!container) return;

    if (titleEl) {
      titleEl.innerHTML = '👤 MY PLAYER ACCOUNT &amp; PROFILE';
    }

    // Find matching player in team roster
    const player = (this.data && this.data.players && this.data.players.find(p => p.id === currentUser.playerId || (currentUser.name && p.name.toLowerCase().includes(currentUser.name.toLowerCase().split(' ')[0])))) || {
      name: currentUser ? currentUser.name : 'Varsity Player',
      number: 10,
      position: 'Forward / CAM',
      classYear: 'Senior (2027)',
      height: "5'11\"",
      photo: currentUser.avatar || 'assets/bhs_cougars_logo.png',
      seasonStats: { goals: 14, assists: 8, games: 12 },
      ratings: { technical: 92, tactical: 88, physical: 85, mental: 90 },
      matrixStats: { rank: 1, points: 94, wins: 28, losses: 6 }
    };

    container.innerHTML = `
      <!-- Player Banner Card -->
      <div style="background: linear-gradient(135deg, rgba(0, 71, 171, 0.4), rgba(10, 20, 40, 0.8)); border: 1px solid var(--bhs-blue-electric); padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: center; position: relative;">
        <img src="${player.photo || currentUser.avatar || 'assets/bhs_cougars_logo.png'}" style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid var(--bhs-gold-accent); object-fit: cover; box-shadow: 0 4px 14px rgba(0,0,0,0.5);" />
        <h2 style="color: #FFF; margin-top: 10px; margin-bottom: 2px;">${player.number ? '#' + player.number + ' ' : ''}${player.name}</h2>
        <p class="text-cyan" style="font-weight: 700; margin-bottom: 6px;">${player.position} &bull; ${player.classYear}</p>
        <span class="badge badge-role">BEAUMONT HIGH SCHOOL VARSITY SOCCER</span>
      </div>

      <!-- Account Info Row -->
      <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px; border-radius: 8px; margin-bottom: 20px;">
        <h4 style="color: var(--bhs-gold-accent); margin-bottom: 10px; font-size: 0.9rem;">📧 ACCOUNT CREDENTIALS &amp; PROFILE INFO</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem;">
          <div><span style="color: var(--text-muted);">Email:</span> <strong style="color: #FFF;">${currentUser.email || 'N/A'}</strong></div>
          <div><span style="color: var(--text-muted);">Account Role:</span> <span class="badge badge-role">PLAYER</span></div>
          <div><span style="color: var(--text-muted);">School:</span> <strong style="color: #FFF;">Beaumont High School</strong></div>
          <div><span style="color: var(--text-muted);">Team:</span> <strong style="color: #FFF;">Boys Varsity Soccer</strong></div>
        </div>
      </div>

      <!-- Season Stats Summary -->
      <div style="margin-bottom: 20px;">
        <h4 style="color: var(--bhs-gold-accent); margin-bottom: 12px; font-size: 0.9rem;">⚽ MY SEASON PERFORMANCE STATS</h4>
        <div class="player-stats-row" style="margin-bottom: 0;">
          <div class="stat-item"><div class="val">${player.seasonStats?.goals ?? 0}</div><div class="lbl">Goals</div></div>
          <div class="stat-item"><div class="val">${player.seasonStats?.assists ?? 0}</div><div class="lbl">Assists</div></div>
          <div class="stat-item"><div class="val">${player.seasonStats?.games ?? 0}</div><div class="lbl">Games Played</div></div>
          <div class="stat-item"><div class="val text-gold">#${player.matrixStats?.rank ?? '1'}</div><div class="lbl">Team Rank</div></div>
        </div>
      </div>

      <!-- Coach Ratings Breakdown -->
      ${player.ratings ? `
        <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--bhs-navy-border); padding: 16px; border-radius: 10px; margin-bottom: 20px;">
          <h4 style="color: var(--bhs-cyan-accent); margin-bottom: 12px; font-size: 0.9rem;">📊 MY COACH EVALUATION RATINGS</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.88rem;">
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 4px;"><span>Technical Skill</span><strong style="color: var(--bhs-gold-accent);">${player.ratings.technical}/100</strong></div>
              <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px;"><div style="background: var(--bhs-gold-accent); height: 100%; width: ${player.ratings.technical}%; border-radius: 3px;"></div></div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 4px;"><span>Tactical IQ</span><strong style="color: var(--bhs-gold-accent);">${player.ratings.tactical}/100</strong></div>
              <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px;"><div style="background: var(--bhs-gold-accent); height: 100%; width: ${player.ratings.tactical}%; border-radius: 3px;"></div></div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 4px;"><span>Physical Speed &amp; Power</span><strong style="color: var(--bhs-gold-accent);">${player.ratings.physical}/100</strong></div>
              <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px;"><div style="background: var(--bhs-gold-accent); height: 100%; width: ${player.ratings.physical}%; border-radius: 3px;"></div></div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 4px;"><span>Mental Drive</span><strong style="color: var(--bhs-gold-accent);">${player.ratings.mental}/100</strong></div>
              <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px;"><div style="background: var(--bhs-gold-accent); height: 100%; width: ${player.ratings.mental}%; border-radius: 3px;"></div></div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Action Buttons -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--bhs-navy-border); padding-top: 16px;">
        <button class="btn btn-secondary" onclick="app.handleSignOut()">🚪 Sign Out</button>
        <button class="btn btn-gold" onclick="app.closeModals(); app.switchView('roster');">👥 View Team Roster</button>
      </div>
    `;
  },

  renderAdminModalContent() {
    const currentUser = window.auth.getCurrentUser();
    if (currentUser && currentUser.role === 'player') {
      return this.renderPlayerAccountModalContent();
    }

    const titleEl = document.getElementById('adminModalTitle');
    if (titleEl) {
      titleEl.innerHTML = '⚙️ ADMIN &amp; ROLE CONTROL CENTER';
    }

    const isGuest = !currentUser || currentUser.role === 'guest';
    const isCoachOrAdmin = window.auth.isCoach() || window.auth.isAdmin();
    const isAdminUser = window.auth.isAdmin();
    const pending = this._pendingApprovals || [];

    const container = document.getElementById('adminModalContent');
    if (!container) return;

    container.innerHTML = `
      <!-- Current Account Header -->
      <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--bhs-navy-border); padding: 12px 16px; border-radius: 8px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${currentUser.avatar || 'assets/bhs_cougars_logo.png'}" style="height: 40px; width: 40px; border-radius: 50%; object-fit: cover; border: 1px solid var(--bhs-gold-accent);" />
          <div>
            <strong style="color: #FFF; font-size: 0.95rem; display: block;">${currentUser.name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${currentUser.email || 'Team Account'} &bull; <span style="color: var(--bhs-gold-accent); text-transform: uppercase; font-weight: 700;">${currentUser.role}</span></div>
          </div>
        </div>
        ${!isGuest ? `<button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="app.handleSignOut()">🚪 Sign Out</button>` : `<span class="badge badge-gold">PUBLIC ACCESS</span>`}
      </div>

      <!-- Section 1: Active User Account -->
      <details class="admin-accordion">
        <summary class="admin-accordion-summary">
          <span>🔑 ACTIVE USER ACCOUNT</span>
          <span class="badge badge-gold">${currentUser.name} (${currentUser.role.toUpperCase()})</span>
        </summary>
        <div class="admin-accordion-content">
          <p class="text-muted" style="font-size: 0.85rem; margin: 0;">
            ${window.auth.isLoggedIn()
              ? `Signed in as <strong style="color:#FFF;">${currentUser.email}</strong>. Roles are assigned by an administrator and cannot be changed from this panel.`
              : `Browsing as a public visitor. Sign in to access team tools.`}
          </p>
        </div>
      </details>

      ${this.renderTeamAdminSection()}

      <!-- Section 2: School & Club Profile Settings -->
      <details class="admin-accordion">
        <summary class="admin-accordion-summary">
          <span>🏫 SCHOOL &amp; CLUB PROFILE SETTINGS</span>
          <span class="badge badge-coach">${this.data.school?.name || 'Beaumont High School'}</span>
        </summary>
        <div class="admin-accordion-content">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px;">
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">School Code (e.g. bhs)</label>
              <input type="text" id="adminSchoolCode" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.code || this.data.school?.id || 'bhs'}" placeholder="bhs" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">Official School / Club Name</label>
              <input type="text" id="adminSchoolName" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.name || 'Beaumont High School'}" placeholder="Beaumont High School" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">Mascot / Team Nickname</label>
              <input type="text" id="adminSchoolMascot" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.mascot || 'Cougars'}" placeholder="Cougars" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">City &amp; State Location</label>
              <input type="text" id="adminSchoolCity" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.city || 'Beaumont, CA'}" placeholder="Beaumont, CA" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 14px;">
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">Season Wins</label>
              <input type="number" id="adminSchoolWins" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.record?.wins ?? 9}" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">Season Losses</label>
              <input type="number" id="adminSchoolLosses" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.record?.losses ?? 1}" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.78rem;">Season Draws</label>
              <input type="number" id="adminSchoolDraws" class="form-control" style="font-size:0.85rem;" value="${this.data.school?.record?.draws ?? 2}" />
            </div>
          </div>

          <button class="btn btn-gold" style="width: 100%; font-weight:700; font-size:0.85rem; padding: 8px;" onclick="app.saveSchoolDataFromAdmin()">💾 Save School Profile to Database</button>
        </div>
      </details>

      ${isAdminUser ? `
        <!-- Section 3: Pending User Approvals Queue -->
        <details class="admin-accordion">
          <summary class="admin-accordion-summary">
            <span>👥 PENDING USER APPROVAL QUEUE</span>
            <span class="badge badge-gold">${pending.length} REQUESTS</span>
          </summary>
          <div class="admin-accordion-content">
            ${pending.length === 0 ? `
              <p class="text-muted" style="font-size: 0.85rem; margin: 0;">No pending account authorization requests. New signups requiring Coach/Player access will appear here.</p>
            ` : `
              <div style="display:flex; flex-direction:column; gap:10px;">
                ${pending.map(p => `
                  <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--bhs-navy-border); padding: 10px 14px; border-radius: 8px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                    <div>
                      <strong style="color:#FFF; display:block; font-size:0.9rem;">${p.name}</strong>
                      <div style="font-size:0.78rem; color:var(--text-muted);">${p.email} &bull; Requested Role: <span class="badge badge-role">${(p.requestedRole || 'player').toUpperCase()}</span></div>
                    </div>
                    <div style="display:flex; gap:8px;">
                      <button class="btn btn-gold" style="padding: 4px 10px; font-size:0.8rem;" onclick="app.approveUserAccess('${p.id}')">✅ Approve Access</button>
                      <button class="btn btn-secondary" style="padding: 4px 10px; font-size:0.8rem; background:rgba(239, 68, 68, 0.2); color:var(--color-danger);" onclick="app.rejectUserAccess('${p.id}')">❌ Reject</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </details>
      ` : ''}

      ${!isGuest ? `
        <!-- Section 4: Import & Export Data -->
        <details class="admin-accordion">
          <summary class="admin-accordion-summary">
            <span>📂 IMPORT &amp; EXPORT DATA (CSV / EXCEL)</span>
            <span class="badge badge-coach">EXCEL / CSV</span>
          </summary>
          <div class="admin-accordion-content">
            ${!isCoachOrAdmin ? `
              <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid var(--color-danger); padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; color: #FFF; margin-bottom: 12px;">
                🔒 File import/export actions are reserved for Coach and Admin roles. Sign in with a coach or administrator account to enable them.
              </div>
            ` : ''}

            <!-- Export Data Card with Dropdown -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px; border-radius: 8px; margin-bottom: 16px;">
              <h5 style="color: var(--bhs-gold-accent); margin-bottom: 8px;">📊 Export System Data to Excel (.xlsx)</h5>
              <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 12px;">
                Select a individual table or export all 10 database tables at once into a multi-sheet Excel workbook package.
              </p>

              <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px;">
                <select id="exportTarget" class="form-control" style="flex:1; min-width: 220px;" ${!isCoachOrAdmin ? 'disabled' : ''}>
                  <option value="all">📦 ALL TABLES AT ONCE (Complete Multi-Sheet Workbook)</option>
                  <option value="schools">🏫 Schools &amp; Team Config</option>
                  <option value="profiles">👤 User Profiles &amp; Roles</option>
                  <option value="players">👥 Players / Roster</option>
                  <option value="schedule">📅 Schedule &amp; Results</option>
                  <option value="drills">📚 Master Drills Library</option>
                  <option value="plan">📋 Practice Plans</option>
                  <option value="matrix">⚔️ Matrix Competition Logs</option>
                  <option value="coaches">👔 Coaching Staff</option>
                  <option value="thoughts">💡 Coach Daily Thoughts</option>
                  <option value="quiz">📝 Quiz Questions Bank</option>
                  <option value="categories">🏷️ Soccer Categories Bank</option>
                </select>
                <button class="btn btn-gold" onclick="app.exportXLSX(document.getElementById('exportTarget').value)" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📊 Export Selected Data</button>
              </div>

              <div style="display:flex; gap:10px; margin-top:8px; flex-wrap:wrap;">
                <button class="btn btn-gold" style="flex:1; min-width:200px; border-color:var(--bhs-cyan-accent); color:var(--bhs-cyan-accent);" onclick="app.exportXLSX('all', false)" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📦 Export All 11 Tables (Single Workbook Package)</button>
                <button class="btn btn-secondary" style="flex:1; min-width:200px; border-color:var(--bhs-gold-accent); color:var(--bhs-gold-accent);" onclick="app.exportXLSX('all', true)" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📂 Export All 11 Tables (11 Separate Files)</button>
              </div>
            </div>

            <!-- Import Data Card with Dropdown -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px; border-radius: 8px;">
              <h5 style="color: var(--bhs-cyan-accent); margin-bottom: 8px;">📥 Import Data from CSV or Excel</h5>
              <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 12px;">
                Download a template first, fill in your data, then upload CSV or Multi-Sheet Excel files.
              </p>

              <div style="font-size: 0.78rem; font-weight: 700; color: var(--bhs-gold-accent); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                Step 1 &mdash; Download a blank template
              </div>
              <p class="text-muted" style="font-size: 0.78rem; margin: 0 0 8px 0;">
                These buttons <strong>save a file</strong> to your computer. They do not import anything.
              </p>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-bottom: 14px;">
                <button class="btn btn-secondary" onclick="app.downloadTemplate('all')" style="font-size:0.75rem; border-color:var(--bhs-gold-accent); color:var(--bhs-gold-accent);" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📦 All Tables Template</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('players')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Players</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('schedule')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Schedule</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('drills')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Drills</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('plan')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Plans</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('coaches')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Coaches</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('thoughts')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Thoughts</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('quiz')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Quiz</button>
                <button class="btn btn-secondary" onclick="app.downloadTemplate('categories')" style="font-size:0.75rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Categories</button>
              </div>

              <div style="font-size: 0.78rem; font-weight: 700; color: var(--bhs-cyan-accent); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                Step 2 &mdash; Choose what you are importing, then pick your file
              </div>

              <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                <select id="importTarget" class="form-control" style="flex:1; min-width: 220px;" ${!isCoachOrAdmin ? 'disabled' : ''}>
                  <option value="all">📦 ALL TABLES AT ONCE (Multi-Sheet Workbook / Package)</option>
                  <option value="schools">🏫 Schools &amp; Team Config</option>
                  <option value="profiles">👤 User Profiles &amp; Roles</option>
                  <option value="players">👥 Players / Roster</option>
                  <option value="schedule">📅 Schedule &amp; Results</option>
                  <option value="drills">📚 Master Drills Library</option>
                  <option value="plan">📋 Practice Plans</option>
                  <option value="matrix">⚔️ Matrix Competition Logs</option>
                  <option value="coaches">👔 Coaching Staff</option>
                  <option value="thoughts">💡 Coach Daily Thoughts</option>
                  <option value="quiz">📝 Quiz Questions Bank</option>
                  <option value="categories">🏷️ Soccer Categories Bank</option>
                </select>
                <button class="btn btn-gold" onclick="document.getElementById('importFileInput').click()" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📂 Choose &amp; Import Data</button>
              </div>
              <input type="file" id="importFileInput" accept=".csv,.xlsx,.xls" style="display:none;"
                onchange="app.handleImportFile(this.files[0], document.getElementById('importTarget').value); this.value='';" />
              <div id="importStatus" style="margin-top:10px; font-size:0.85rem; color: var(--color-success);"></div>
            </div>
          </div>
        </details>

        <!-- Section 5: System & Cloud Database Controls -->
        <details class="admin-accordion">
          <summary class="admin-accordion-summary">
            <span>⚡ SYSTEM &amp; CLOUD DATABASE CONTROLS</span>
            <span class="badge ${window.supabaseService && window.supabaseService.isConfigured() ? 'badge-win' : 'badge-gold'}">
              ${(window.supabaseService && window.supabaseService.isConfigured()) ? '⚡ CONNECTED' : '📦 LOCAL MODE'}
            </span>
          </summary>
          <div class="admin-accordion-content">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; flex-wrap:wrap; gap:8px;">
              <div>
                <strong>Cloud Sync Status:</strong> 
                ${(window.supabaseService && window.supabaseService.isConfigured()) 
                  ? `<span style="color: var(--color-success); font-weight:700;">⚡ Connected to Supabase Cloud DB</span>` 
                  : `<span style="color: var(--bhs-gold-accent); font-weight:700;">📦 Local Mode (Requires valid Supabase Anon JWT Key)</span>`}
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-gold" style="padding: 4px 10px; font-size:0.78rem;" onclick="app.pushAllLocalDataToSupabase()">⬆️ Sync Local Data to Cloud DB</button>
                <button class="btn btn-gold" style="padding: 4px 10px; font-size:0.78rem;" onclick="app.runLiveDatabaseTest()">🧪 Run Live Database Test</button>
                <button class="btn btn-secondary" style="padding: 4px 10px; font-size:0.78rem;" onclick="app.testProfilesTableInsert()">👤 Test Profile Insert</button>
                <button class="btn btn-secondary" style="padding: 4px 10px; font-size:0.78rem;" onclick="app.syncFromSupabase(); alert('✅ Synced latest data from Supabase Cloud!');">🔄 Reload Cloud Data</button>
              </div>
            </div>

            <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--bhs-navy-border); padding: 12px; border-radius: 6px; font-size: 0.82rem;">
              <div style="font-weight: 700; color: var(--bhs-gold-accent); margin-bottom: 6px;">🔑 Supabase Cloud Project Credentials</div>
              <div class="form-group" style="margin-bottom: 8px;">
                <label style="font-size:0.75rem;">Supabase Project URL</label>
                <input type="text" id="supabaseUrlInput" class="form-control" style="font-size:0.8rem;" value="${localStorage.getItem('bhs_supabase_url') || 'https://arsigevpgpbqluqbnhjr.supabase.co'}" placeholder="https://xyz.supabase.co" />
              </div>
              <div class="form-group" style="margin-bottom: 10px;">
                <label style="font-size:0.75rem;">Supabase Anon Key (JWT starting with eyJ...)</label>
                <input type="password" id="supabaseKeyInput" class="form-control" style="font-size:0.8rem;" value="${localStorage.getItem('bhs_supabase_anon_key') || ''}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
              </div>
              <button class="btn btn-gold" style="width:100%; font-size:0.8rem; padding: 6px;" onclick="app.saveSupabaseCredentials(document.getElementById('supabaseUrlInput').value, document.getElementById('supabaseKeyInput').value)">💾 Save Credentials &amp; Connect</button>
            </div>
          </div>
        </details>
      ` : ''}
    `;
  },

  saveSupabaseCredentials(url, key) {
    if (!key || !key.startsWith('eyJ')) {
      alert('⚠️ Please enter a valid Supabase Anon Key (starts with "eyJ..."). You can copy it from your Supabase Dashboard -> Project Settings -> API.');
      return;
    }
    const ok = window.supabaseService.setCredentials(url, key);
    if (ok) {
      alert('⚡ Supabase Cloud Database connected successfully!');
      this.renderAdminModalContent();
    } else {
      alert('❌ Failed to connect to Supabase with provided credentials.');
    }
  },

  async pushAllLocalDataToSupabase() {
    if (!window.supabaseService || !window.supabaseService.isConfigured()) {
      this.showAlertModal('Supabase Disconnected', '⚠️ Supabase Cloud Database is not connected.\n\nPlease enter your Supabase Anon Key (starts with "eyJ...") in the Admin Center, click "Save Credentials", then run this sync.');
      return;
    }

    this.showConfirmModal({
      title: '⚡ ONE-TIME DATABASE OVERWRITE / SYNC',
      message: 'This will take all local data stored in your browser (School Info, Roster, Schedule, Practice Plans, Drills Library, Coaches, Daily Thoughts) and write it directly into your Supabase Cloud Database.\n\nDo you want to proceed?',
      confirmText: '⚡ Proceed with Sync',
      confirmClass: 'btn-gold',
      onConfirm: async () => {
        const report = [];
        const schoolCode = this.data.school?.code || 'bhs';

        // 1. School Profile
        try {
          if (this.data.school) {
            const schoolRes = await window.supabaseService.upsertSchool(schoolCode, this.data.school);
            if (schoolRes && schoolRes.data) {
              if (schoolRes.data.id) this.data.school.id = schoolRes.data.id;
              report.push(`✅ 🏫 School Profile ('${this.data.school.name}') synced to DB`);
            } else {
              report.push(`⚠️ 🏫 School Profile sync warning: ${schoolRes?.error || 'Unknown error'}`);
            }
          }
        } catch (e) {
          report.push(`❌ 🏫 School Profile Exception: ${e.message}`);
        }

        // 2. Roster / Players
        try {
          const players = this.data.players || [];
          let playerSuccess = 0;
          const teamId = this.activeTeamId;
          const team = (this.data.teams || []).find(t => t.id === teamId);
          if (!teamId || !team) {
            // Local players carry no team column — a sync can only land them on
            // the team currently selected. Refuse rather than guess.
            report.push('⚠️ 👥 Players Roster skipped — no team is selected. Choose a team in the header first; synced players join that team.');
          } else {
            for (const p of players) {
              const identity = await window.supabaseService.upsertPlayerIdentity(p);
              let ok = false;
              if (identity && identity.id) {
                p.id = identity.id;
                const memRes = await window.supabaseService.upsertTeamMembership(teamId, team.school_id, {
                  player_id: identity.id,
                  number: p.number,
                  position: p.position,
                  season_stats: p.seasonStats || p.season_stats,
                  ratings: p.ratings
                });
                ok = !!(memRes && memRes.ok);
              }
              if (ok) playerSuccess++;
            }
            report.push(`✅ 👥 Players Roster: ${playerSuccess} / ${players.length} players synced to DB`);
          }
        } catch (e) {
          report.push(`❌ 👥 Players Roster Exception: ${e.message}`);
        }

        // 3. Schedule / Matches
        try {
          const matches = this.data.schedule || [];
          let matchSuccess = 0;
          for (const m of matches) {
            const res = await window.supabaseService.upsertMatch(this.activeTeamId, m);
            if (res) {
              if (res.id) m.id = res.id;
              matchSuccess++;
            }
          }
          report.push(`✅ 📅 Schedule: ${matchSuccess} / ${matches.length} matches synced to DB`);
        } catch (e) {
          report.push(`❌ 📅 Schedule Exception: ${e.message}`);
        }

        // 4. Drills Library Bank
        try {
          const drills = this.data.drillsBank || [];
          let drillSuccess = 0;
          for (const d of drills) {
            const res = await window.supabaseService.upsertDrillBankItem(schoolCode, d);
            if (res) {
              if (res.id) d.id = res.id;
              drillSuccess++;
            }
          }
          report.push(`✅ 📚 Master Drills Library: ${drillSuccess} / ${drills.length} drills synced to DB`);
        } catch (e) {
          report.push(`❌ 📚 Master Drills Library Exception: ${e.message}`);
        }

        // 5. Practice Plans (Saved Plans & Current Plan)
        try {
          const plans = this.data.savedPlans || [];
          let planSuccess = 0;
          for (const plan of plans) {
            const res = await window.supabaseService.saveFullPracticePlan(schoolCode, plan);
            if (res && res.success) {
              planSuccess++;
            }
          }
          if (this.data.currentPracticePlan && this.data.currentPracticePlan.length > 0) {
            await window.supabaseService.saveFullPracticePlan(schoolCode, {
              name: this.data.activePlanName || 'Current Practice Session',
              items: this.data.currentPracticePlan
            });
          }
          report.push(`✅ 📋 Practice Plans: ${planSuccess} saved plans synced to DB`);
        } catch (e) {
          report.push(`❌ 📋 Practice Plans Exception: ${e.message}`);
        }

        // 6. Coaching Staff
        try {
          const coaches = this.data.coaches || [];
          let coachSuccess = 0;
          for (const c of coaches) {
            const res = await window.supabaseService.upsertCoach(schoolCode, c);
            if (res) {
              if (res.id) c.id = res.id;
              coachSuccess++;
            }
          }
          report.push(`✅ 👔 Coaching Staff: ${coachSuccess} / ${coaches.length} coaches synced to DB`);
        } catch (e) {
          report.push(`❌ 👔 Coaching Staff Exception: ${e.message}`);
        }

        // 7. Daily Thoughts
        try {
          const thoughts = this.data.dailyThoughts || [];
          let thoughtSuccess = 0;
          for (const t of thoughts) {
            const res = await window.supabaseService.upsertDailyThought(schoolCode, t);
            if (res && res.data) {
              if (res.data.id) t.id = res.data.id;
              thoughtSuccess++;
            }
          }
          report.push(`✅ 💡 Coach Daily Thoughts: ${thoughtSuccess} / ${thoughts.length} thoughts synced to DB`);
        } catch (e) {
          report.push(`❌ 💡 Coach Daily Thoughts Exception: ${e.message}`);
        }

        // Save updated ID mappings locally
        this.saveData();

        this.showAlertModal('Sync Complete', `⚡ LOCAL DATA TO SUPABASE CLOUD SYNC COMPLETE!\n\n${report.join('\n')}`);
      }
    });
  },

  async runLiveDatabaseTest() {
    if (!window.supabaseService || !window.supabaseService.isConfigured()) {
      alert('⚠️ Supabase Cloud Database is not connected.\n\nPlease enter your Supabase Anon Key (starts with "eyJ...") in the Admin Center, click "Save Credentials", then run this test.');
      return;
    }

    const modal = document.getElementById('dbDiagnosticModal');
    const headerEl = document.getElementById('dbDiagnosticSummaryHeader');
    const listEl = document.getElementById('dbDiagnosticTableList');

    if (modal) {
      modal.style.display = '';
      modal.classList.add('active');
    }

    if (headerEl) {
      headerEl.innerHTML = `
        <div style="text-align:center; padding:15px; color:var(--bhs-gold-accent);">
          <strong style="font-size:1rem;">⏳ Running live 9-table database diagnostic test against Supabase Cloud...</strong>
          <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 0 0;">Verifying SELECT reads, INSERT writes, and RLS policies for each table.</p>
        </div>
      `;
    }
    if (listEl) listEl.innerHTML = '';

    const res = await window.supabaseService.runFullDatabaseDiagnostic();

    if (!res.credentials) {
      if (headerEl) headerEl.innerHTML = `<div style="color:var(--color-danger);">${res.summaryText}</div>`;
      return;
    }

    const passedCount = (res.tableResults || []).filter(r => r.insertStatus === 'PASSED' || r.insertStatus === 'N/A').length;
    const totalCount = (res.tableResults || []).length;
    const isOverallSuccess = passedCount === totalCount;

    if (headerEl) {
      headerEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h4 style="margin:0 0 4px 0; color: ${isOverallSuccess ? 'var(--color-success)' : 'var(--bhs-gold-accent)'};">
              ${isOverallSuccess ? '🎉 ALL TABLES PASSED DATABASE WRITE & READ TESTS!' : `⚠️ ${totalCount - passedCount} OUT OF ${totalCount} TABLES RETURNED ERRORS`}
            </h4>
            <div style="font-size:0.82rem; color:var(--text-muted);">
              Project URL: <strong>${res.credentials.url}</strong> | Resolved School UUID: <strong style="color:#FFF;">${res.credentials.schoolUuid || 'Default Nullable'}</strong>
            </div>
          </div>
          <span class="badge ${isOverallSuccess ? 'badge-win' : 'badge-coach'}" style="font-size:0.9rem; padding:6px 12px;">
            ${passedCount} / ${totalCount} Tables Functional
          </span>
        </div>
      `;
    }

    if (listEl && res.tableResults) {
      listEl.innerHTML = res.tableResults.map(r => {
        const isPass = r.insertStatus === 'PASSED' || r.insertStatus === 'N/A';
        const badgeClass = isPass ? 'badge-win' : 'badge-role';
        const cardBorderColor = isPass ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.5)';

        return `
          <div style="background: rgba(0,0,0,0.3); border: 1px solid ${cardBorderColor}; padding: 14px; border-radius: 8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:1.2rem;">${r.icon}</span>
                <strong style="color:#FFF; font-size:1rem;">Table: '${r.table}'</strong>
                <span class="badge badge-coach">${r.operation}</span>
              </div>
              <span class="badge ${badgeClass}" style="font-weight:700;">
                ${isPass ? '✅ SUCCESS' : '❌ WRITE FAILED'}
              </span>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.82rem; margin-top:8px;">
              <div style="background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:6px; border:1px solid var(--bhs-navy-border);">
                <span style="color:var(--text-muted); display:block; font-weight:700; margin-bottom:2px;">📥 SELECT Query Test:</span>
                <span style="color:${r.selectStatus === 'PASSED' ? 'var(--color-success)' : 'var(--color-danger)'};">${r.selectDetails}</span>
              </div>

              <div style="background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:6px; border:1px solid var(--bhs-navy-border);">
                <span style="color:var(--text-muted); display:block; font-weight:700; margin-bottom:2px;">💾 INSERT / UPSERT Response:</span>
                <span style="color:${isPass ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight:700;">${r.responseDetails}</span>
              </div>
            </div>

            ${r.payload ? `
              <div style="margin-top:10px;">
                <details>
                  <summary style="cursor:pointer; color:var(--bhs-gold-accent); font-size:0.8rem; font-weight:700;">🔍 View Exact Test Data Payload Sent to Supabase</summary>
                  <pre style="background:#090d16; color:#a6accd; padding:8px 10px; border-radius:6px; font-size:0.75rem; margin-top:6px; overflow-x:auto; border:1px solid var(--bhs-navy-border);">${JSON.stringify(r.payload, null, 2)}</pre>
                </details>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }
  },

  async testProfilesTableInsert() {
    if (!window.supabaseService || !window.supabaseService.isConfigured()) {
      alert('⚠️ Supabase Cloud Database is not connected.\n\nPlease enter your Supabase Anon Key (starts with "eyJ...") in the Admin Center, click "Save Credentials", then run this test.');
      return;
    }

    const res = await window.supabaseService.testProfileInsert();
    if (res.success) {
      alert(`🎉 SUCCESS! Profile row inserted into Supabase 'profiles' table:\n\nEmail: ${res.data.email}\nName: ${res.data.name}\nRole: ${res.data.role}\nStatus: ${res.data.status}`);
    } else {
      alert(`❌ SUPABASE INSERT NOTICE:\n\n${res.error}\n\nMake sure to run the SQL table script provided in the Admin Center / schema file in your Supabase SQL Editor.`);
    }
  },

  async saveSchoolDataFromAdmin() {
    const code = (document.getElementById('adminSchoolCode')?.value || 'bhs').trim().toLowerCase();
    const name = (document.getElementById('adminSchoolName')?.value || 'Beaumont High School').trim();
    const mascot = (document.getElementById('adminSchoolMascot')?.value || 'Cougars').trim();
    const city = (document.getElementById('adminSchoolCity')?.value || 'Beaumont, CA').trim();
    const wins = parseInt(document.getElementById('adminSchoolWins')?.value || 0, 10);
    const losses = parseInt(document.getElementById('adminSchoolLosses')?.value || 0, 10);
    const draws = parseInt(document.getElementById('adminSchoolDraws')?.value || 0, 10);

    const schoolData = {
      code: code || 'bhs',
      name: name,
      mascot: mascot,
      city: city,
      colors: this.data.school?.colors || { primary: '#0047AB', secondary: '#FFD700' },
      record: { wins, losses, draws }
    };

    if (this.data.school?.id) schoolData.id = this.data.school.id;

    this.data.school = schoolData;

    const schools = this.getSchoolsList();
    const existingIdx = schools.findIndex(s => (s.code || s.id || '').toLowerCase() === code);
    if (existingIdx !== -1) {
      schools[existingIdx] = { ...schools[existingIdx], ...schoolData };
    } else {
      schools.push(schoolData);
    }
    this.data.schools = schools;

    this.saveData();

    let dbSuccess = false;
    if (window.supabaseService?.isConfigured()) {
      const res = await window.supabaseService.upsertSchool(code, schoolData);
      if (res) dbSuccess = true;
    }

    this.updateHeaderBranding();
    this.renderCurrentView();

    if (dbSuccess) {
      alert(`✅ School Profile saved for "${name} ${mascot}" and synced to Supabase Database!`);
    } else {
      alert(`⚠️ School Profile for "${name} ${mascot}" could not be synced to the database. Changes may not persist.`);
    }
  },

  /**
   * Team management. Admin-only, because teams_write and team_coaches_write are
   * admin-only by RLS -- rendering these controls for a coach would offer an
   * action the database will refuse.
   */
  renderTeamAdminSection() {
    if (!window.auth.isAdmin()) return '';

    const teams = this._allTeams || [];
    const coaches = this._teamCoaches || [];
    const assignable = this._assignableCoaches || [];
    const orgs = (this.data.schools || []).length
      ? this.data.schools
      : [...new Map(teams.map(t => [t.school_id, { id: t.school_id, name: t.school_name }])).values()];

    const byOrg = new Map();
    teams.forEach(t => {
      const key = t.school_name || 'Organization';
      if (!byOrg.has(key)) byOrg.set(key, []);
      byOrg.get(key).push(t);
    });

    const teamRows = Array.from(byOrg.entries()).map(([org, list]) => `
      <div style="margin-bottom:14px;">
        <div style="color:var(--bhs-gold-accent); font-size:0.8rem; font-weight:700; margin-bottom:6px;">
          ${org}
          <span class="text-muted" style="font-weight:400; text-transform:uppercase; font-size:0.7rem;">
            ${(list[0] && list[0].school_kind === 'club') ? 'club' : 'school'}
          </span>
        </div>
        ${list.map(t => {
          const staff = coaches.filter(c => c.team_id === t.id);
          return `
          <div style="background:rgba(0,0,0,0.25); border:1px solid var(--bhs-navy-border); border-radius:8px; padding:10px 12px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
              <strong style="color:#FFF; font-size:0.9rem;">${t.name}${t.season ? ' <span class="text-muted" style="font-weight:400;">' + t.season + '</span>' : ''}</strong>
              ${t.is_public_default ? '<span class="badge badge-gold">PUBLIC DEFAULT</span>' : ''}
            </div>
            <div style="margin-top:6px; font-size:0.8rem;">
              ${staff.length === 0
                ? '<span class="text-muted">No coaches assigned &mdash; nobody can edit this team.</span>'
                : staff.map(c => `
                    <span style="display:inline-flex; align-items:center; gap:6px; background:rgba(0,0,0,0.3); border:1px solid var(--bhs-navy-border); border-radius:6px; padding:3px 8px; margin:0 6px 6px 0;">
                      ${c.name}
                      <button class="btn-card-delete" style="padding:0 5px; font-size:0.75rem;"
                              onclick="app.removeCoachFromTeam('${t.id}','${c.profile_id}')" title="Remove">&times;</button>
                    </span>`).join('')}
            </div>
            <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
              <select id="assignCoach_${t.id}" class="form-control" style="max-width:220px; font-size:0.8rem;">
                <option value="">&mdash; assign a coach &mdash;</option>
                ${assignable
                    .filter(a => !staff.some(c => c.profile_id === a.id))
                    .map(a => `<option value="${a.id}">${a.name} (${a.role})</option>`).join('')}
              </select>
              <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.8rem;"
                      onclick="app.assignCoachToTeam('${t.id}')">Assign</button>
            </div>
            <!-- Failures belong beside the control that caused them. A shared
                 message box at the foot of the accordion is off-screen from
                 here, so a refusal reads as nothing happening. -->
            <div id="teamFeedback_${t.id}" style="color:var(--color-danger); font-size:0.78rem; margin-top:6px;"></div>
          </div>`;
        }).join('')}
      </div>`).join('');

    return `
      <details class="admin-accordion">
        <summary class="admin-accordion-summary">
          <span>&#128101; TEAMS &amp; COACH ASSIGNMENTS</span>
          <span class="badge badge-coach">${teams.length} TEAM${teams.length === 1 ? '' : 'S'}</span>
        </summary>
        <div class="admin-accordion-content">
          <p class="text-muted" style="font-size:0.8rem; margin:0 0 12px 0;">
            A coach can only edit rosters, fixtures and Matrix results for teams listed against
            their name here. Removing them takes that access away immediately.
          </p>

          ${teamRows || '<p class="text-muted" style="font-size:0.85rem;">No teams yet.</p>'}

          <div style="border-top:1px solid var(--bhs-navy-border); padding-top:12px; margin-top:6px;">
            <div style="color:#FFF; font-size:0.85rem; font-weight:700; margin-bottom:8px;">Create an organization</div>
            <p class="text-muted" style="font-size:0.78rem; margin:0 0 8px 0;">
              A school or a club. Teams belong to one, and a player may be on one team per
              organization &mdash; so a player can be on a school team and a club team at once.
            </p>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <input type="text" id="newOrgName" class="form-control" style="max-width:200px; font-size:0.8rem;" placeholder="Riverside Surf SC" />
              <input type="text" id="newOrgMascot" class="form-control" style="max-width:130px; font-size:0.8rem;" placeholder="Surf" />
              <input type="text" id="newOrgCode" class="form-control" style="max-width:90px; font-size:0.8rem;" placeholder="rvsc" />
              <select id="newOrgKind" class="form-control" style="max-width:120px; font-size:0.8rem;">
                <option value="school">School</option>
                <option value="club">Club</option>
              </select>
              <button class="btn btn-secondary" style="padding:4px 12px; font-size:0.8rem;" onclick="app.createOrganization()">+ Create</button>
            </div>
            <div id="orgAdminFeedback" style="color:var(--color-danger); font-size:0.8rem; margin-top:8px;"></div>
          </div>

          <div style="border-top:1px solid var(--bhs-navy-border); padding-top:12px; margin-top:12px;">
            <div style="color:#FFF; font-size:0.85rem; font-weight:700; margin-bottom:8px;">Create a team</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <select id="newTeamOrg" class="form-control" style="max-width:220px; font-size:0.8rem;">
                ${orgs.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
              </select>
              <input type="text" id="newTeamName" class="form-control" style="max-width:160px; font-size:0.8rem;" placeholder="e.g. JV" />
              <input type="text" id="newTeamSeason" class="form-control" style="max-width:100px; font-size:0.8rem;" placeholder="2026" />
              <button class="btn btn-gold" style="padding:4px 12px; font-size:0.8rem;" onclick="app.createTeamFromAdmin()">+ Create</button>
            </div>
            <div id="teamAdminFeedback" style="color:var(--color-danger); font-size:0.8rem; margin-top:8px;"></div>
          </div>
        </div>
      </details>`;
  },

  async createOrganization() {
    const err = document.getElementById('orgAdminFeedback');
    const set = (m) => { if (err) err.textContent = m; };
    const name = (document.getElementById('newOrgName')?.value || '').trim();
    const mascot = (document.getElementById('newOrgMascot')?.value || '').trim();
    const code = (document.getElementById('newOrgCode')?.value || '').trim().toLowerCase();
    const kind = document.getElementById('newOrgKind')?.value || 'school';

    if (!name) return set('Give the organization a name.');
    // Headings render the mascot beside the name, and the column is NOT NULL.
    if (!mascot) return set('Give it a mascot, e.g. Surf.');
    if (!code) return set('Give it a short code, e.g. rvsc.');

    set('Creating...');
    const res = await window.supabaseService.createSchool(code, name, kind, mascot);
    if (!res.ok) return set(res.error || 'Could not create that organization.');

    // Re-sync rather than patch: the new organization has to reach
    // this.data.schools before the create-team picker can offer it.
    await this.syncFromSupabase();
    await this.openAdminModal();
  },

  async createTeamFromAdmin() {
    const err = document.getElementById('teamAdminFeedback');
    const set = (m) => { if (err) err.textContent = m; };
    const schoolId = document.getElementById('newTeamOrg')?.value;
    const name = (document.getElementById('newTeamName')?.value || '').trim();
    const season = (document.getElementById('newTeamSeason')?.value || '').trim();

    if (!schoolId) return set('Pick an organization.');
    if (!name) return set('Give the team a name.');

    set('Creating...');
    const created = await window.supabaseService.createTeam(schoolId, name, season || undefined);
    if (!created || !created.id) {
      return set('Could not create that team. Only an admin can, and the name must be unique within the organization.');
    }
    await this.openAdminModal();
  },

  async assignCoachToTeam(teamId) {
    const err = document.getElementById('teamFeedback_' + teamId) || document.getElementById('teamAdminFeedback');
    const profileId = document.getElementById('assignCoach_' + teamId)?.value;
    if (!profileId) { if (err) err.textContent = 'Pick a coach from the dropdown first.'; return; }

    if (err) err.textContent = 'Assigning...';
    const res = await window.supabaseService.assignCoachToTeam(teamId, profileId);
    if (!res.ok) { if (err) err.textContent = res.error || 'Could not assign that coach.'; return; }
    // Re-open rather than patch the DOM: the assignment changes what the team
    // switcher shows for that person, and a stale panel would misreport access.
    await this.openAdminModal();
  },

  async removeCoachFromTeam(teamId, profileId) {
    const staff = (this._teamCoaches || []).filter(c => c.team_id === teamId);
    if (staff.length === 1 && !window.confirm(
      'This is the only coach on that team. Removing them leaves nobody able to edit its roster, fixtures or Matrix results.\n\nRemove anyway?')) return;

    const res = await window.supabaseService.removeCoachFromTeam(teamId, profileId);
    const err = document.getElementById('teamFeedback_' + teamId) || document.getElementById('teamAdminFeedback');
    if (!res.ok) { if (err) err.textContent = res.error || 'Could not remove that coach.'; return; }
    await this.openAdminModal();
  },

  async openAdminModal() {
    this._pendingApprovals = (await window.auth.getPendingApprovals()) || [];
    // Team management reads across organizations, so it cannot reuse
    // this.data.teams -- that holds only the teams the viewer belongs to.
    if (window.auth.isAdmin() && window.supabaseService?.isConfigured()) {
      const [allTeams, teamCoaches, assignable] = await Promise.all([
        window.supabaseService.fetchAllTeams(),
        window.supabaseService.fetchTeamCoaches(),
        window.supabaseService.fetchAssignableCoaches()
      ]);
      this._allTeams = allTeams || [];
      this._teamCoaches = teamCoaches || [];
      this._assignableCoaches = assignable || [];
    }
    this.renderAdminModalContent();
    const modal = document.getElementById('adminModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  openPlayerModal(playerId) {
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) return;

    const canAccessRatings = window.auth.canAccessRatings();
    const modal = document.getElementById('playerDetailModal');
    const content = document.getElementById('playerDetailContent');
    
    if (!modal || !content) return;

    content.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${this.photoOrPlaceholder(player.photo)}" alt="${player.name}" style="width: 120px; height: 120px; border-radius: 50%; border: 3px solid var(--bhs-blue-electric); object-fit: cover;" />
        <h2 style="color: #FFF; margin-top: 10px;">#${player.number} ${player.name}</h2>
        <p class="text-cyan" style="font-weight: 600;">${player.position} • ${player.classYear}</p>
      </div>

      <div class="player-stats-row" style="margin-bottom: 20px;">
        <div class="stat-item"><div class="val">${player.height}</div><div class="lbl">Height</div></div>
        <div class="stat-item"><div class="val">${player.seasonStats.goals || player.seasonStats.saves || 0}</div><div class="lbl">Primary Stat</div></div>
        <div class="stat-item"><div class="val text-gold">${canAccessRatings ? '#' + player.matrixStats.rank : '🔒 Private'}</div><div class="lbl">Matrix Rank</div></div>
      </div>

      ${canAccessRatings ? `
        <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--bhs-navy-border); padding: 16px; border-radius: 10px; margin-bottom: 20px;">
          <h4 style="color: var(--bhs-gold-accent); margin-bottom: 10px;">COACH EVALUATION RATINGS</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">
            <div>Technical Skills: <strong>${player.ratings.technical}/100</strong></div>
            <div>Tactical IQ: <strong>${player.ratings.tactical}/100</strong></div>
            <div>Physicality & Speed: <strong>${player.ratings.physical}/100</strong></div>
            <div>Mental Drive: <strong>${player.ratings.mental}/100</strong></div>
          </div>
        </div>
      ` : `
        <p class="text-muted" style="text-align: center; font-size: 0.85rem;">🔒 Coach practice ratings are private to signed-in team members.</p>
      `}
    `;

    modal.style.display = '';
    modal.classList.add('active');
  },

  /**
   * Opens the result form. With a logId it edits that result; without one it
   * records a new result.
   *
   * The hidden matrixLogId is cleared FIRST, before any early return. If a
   * previous edit left it set, "Record" would silently overwrite that result
   * instead of adding one — a data-loss bug with no visible symptom, so the
   * reset must not depend on the modal having been closed a particular way.
   */
  openAddDrillModal(logId) {
    const idField = document.getElementById('matrixLogId');
    if (idField) idField.value = '';

    const players = (this.data.players || [])
      .filter(p => !p.is_deleted && !p.isDeleted)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    // Leads with a blank so nothing is chosen by default. A pre-filled pair
    // means one stray click records a result between two arbitrary players, and
    // there is no way to correct a wrong entry from the roster view -- only from
    // the LOGGED RESULTS panel, after you notice.
    const playerOptions = '<option value="">— select a player —</option>' + players
      .map(p => `<option value="${p.id}">${p.name}${p.number ? ' (#' + p.number + ')' : ''}</option>`)
      .join('');

    const drillOptions = '<option value="">— none —</option>' + (this.data.drillsBank || [])
      .filter(d => !d.is_deleted && !d.isDeleted)
      .map(d => `<option value="${d.id}">${d.name}</option>`)
      .join('');

    const a = document.getElementById('matrixPlayerA');
    const b = document.getElementById('matrixPlayerB');
    const drill = document.getElementById('matrixDrill');
    const when = document.getElementById('matrixOccurredOn');
    const err = document.getElementById('matrixFormError');

    if (a) a.innerHTML = playerOptions;
    if (b) b.innerHTML = playerOptions;
    if (drill) drill.innerHTML = drillOptions;
    if (when) when.value = new Date().toISOString().slice(0, 10);
    if (err) err.textContent = '';

    if (players.length < 2 && err) {
      err.textContent = 'At least two players are needed to record a head-to-head result.';
    }

    // Edit mode: prefill from the stored row and relabel the form. Done after
    // the selects are populated, since setting .value before the options exist
    // silently leaves the field on its first entry.
    const heading = document.getElementById('matrixModalTitle');
    const submitBtn = document.getElementById('matrixSubmitBtn');
    const log = logId ? (this.data.matrixLogs || []).find(l => l.id === logId) : null;

    if (log) {
      if (idField) idField.value = log.id;
      if (a) a.value = log.player_a_id;
      if (b) b.value = log.player_b_id;
      if (drill) drill.value = log.drill_id || '';
      if (when) when.value = log.occurred_on || '';
      const outcome = document.getElementById('matrixOutcome');
      const score = document.getElementById('matrixScoreText');
      if (outcome) outcome.value = log.outcome;
      if (score) score.value = log.score_text || '';
      if (heading) heading.textContent = 'EDIT RECORDED RESULT';
      if (submitBtn) submitBtn.textContent = '💾 Save Changes';
    } else {
      if (heading) heading.textContent = 'RECORD DRILL RESULT';
      if (submitBtn) submitBtn.textContent = '💾 Record Result';
      if (logId && err) {
        // The id came from a rendered row, so this means state moved underneath
        // the panel — better to say so than to silently open a blank new-result
        // form the coach believes is an edit.
        err.textContent = 'That result is no longer available. Reload and try again.';
      }
    }

    const modal = document.getElementById('addDrillScoreModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  /**
   * Soft-deletes a logged result after confirmation. The standings view filters
   * on is_deleted, so the points it contributed disappear on the next sync.
   */
  async deleteMatrixResult(logId) {
    const log = (this.data.matrixLogs || []).find(l => l.id === logId);
    if (!log) return;

    const byId = new Map((this.data.players || []).map(p => [p.id, p]));
    const nm = (id) => (byId.get(id) || {}).name || 'a removed player';
    const ok = window.confirm(
      `Delete the result between ${nm(log.player_a_id)} and ${nm(log.player_b_id)} on ${log.occurred_on}?\n\n` +
      `Both players' points and ranks will be recalculated without it.`
    );
    if (!ok) return;

    const res = await window.supabaseService.deleteMatrixResult(logId);
    if (!res.ok) {
      window.alert(res.error || 'Could not delete that result.');
      return;
    }
    await this.syncFromSupabase();
    this.renderCurrentView();
  },

  async submitMatrixResult() {
    const err = document.getElementById('matrixFormError');
    const set = (msg) => { if (err) err.textContent = msg; };

    const playerAId = document.getElementById('matrixPlayerA')?.value;
    const playerBId = document.getElementById('matrixPlayerB')?.value;
    const outcome   = document.getElementById('matrixOutcome')?.value;
    const drillId   = document.getElementById('matrixDrill')?.value || null;
    const scoreText = document.getElementById('matrixScoreText')?.value.trim();
    const occurredOn = document.getElementById('matrixOccurredOn')?.value;

    if (!playerAId || !playerBId) return set('Pick both players.');
    if (playerAId === playerBId) return set('A player cannot play themselves. Pick two different players.');
    if (!occurredOn) return set('Pick the date the result happened.');

    // An id here means the form was opened on an existing result: update it
    // rather than logging a second one. Both paths return {ok, error}, because
    // an RLS denial produces no error and no rows on either.
    const logId = document.getElementById('matrixLogId')?.value || '';
    const payload = { playerAId, playerBId, outcome, drillId, scoreText, occurredOn };

    set(logId ? 'Saving…' : 'Recording…');
    const res = logId
      ? await window.supabaseService.updateMatrixResult(logId, payload)
      : await window.supabaseService.logMatrixResult(this.activeTeamId, payload);

    if (!res.ok) return set(res.error || (logId ? 'Could not save that change.' : 'Could not record that result.'));

    // Standings are derived in Postgres, so the leaderboard only changes after
    // a re-read. Without this the coach records a result and sees nothing move.
    await this.syncFromSupabase();
    this.renderCurrentView();
    this.closeModals();
  },

  // ─── Import / Export ─────────────────────────────────────────────────────

  openImportExportModal() {
    const modal = document.getElementById('importExportModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
    const status = document.getElementById('importStatus');
    if (status) status.textContent = '';
  },

  async exportXLSX(type, separateFiles = false) {
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded yet — please wait a moment and try again.'); return; }

    const tables = ['schools', 'profiles', 'players', 'schedule', 'drills', 'plan', 'matrix', 'coaches', 'thoughts', 'quiz', 'categories'];

    if (type === 'all' && separateFiles) {
      if (typeof JSZip !== 'undefined') {
        const zip = new JSZip();
        const folder = zip.folder("BHS_Soccer_Database_Export");

        tables.forEach(t => {
          const wb = XLSX.utils.book_new();
          let fileName = 'Table.xlsx';
          let sheetName = 'Data';

          if (t === 'schools') {
            fileName = '1_Schools_Config.xlsx'; sheetName = 'Schools';
            const rows = [{ Code: this.data.schoolInfo?.code || 'bhs', Name: this.data.schoolInfo?.name || 'Beaumont High School', Mascot: this.data.schoolInfo?.mascot || 'Cougars', City: this.data.schoolInfo?.city || 'Beaumont, CA', PrimaryColor: this.data.schoolInfo?.colors?.primary || '#0047AB', SecondaryColor: this.data.schoolInfo?.colors?.secondary || '#FFD700', Wins: this.data.schoolInfo?.record?.wins || 0, Losses: this.data.schoolInfo?.record?.losses || 0, Draws: this.data.schoolInfo?.record?.draws || 0, IsDeleted: 'FALSE' }];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
          } else if (t === 'profiles') {
            fileName = '2_User_Profiles.xlsx'; sheetName = 'Profiles';
            const rows = (this.data.userProfiles || [{ username: 'coach_bob', name: 'Coach Bob Miller', role: 'Coach', approved: true }, { username: 'sam_admin', name: 'Admin Sam', role: 'Admin', approved: true }]).map(u => ({ Username: u.username || '', Name: u.name || '', Role: u.role || 'User', PlayerId: u.playerId || '', SchoolCode: u.schoolCode || 'bhs', Approved: u.approved !== false ? 'YES' : 'NO', IsDeleted: u.is_deleted || u.isDeleted ? 'TRUE' : 'FALSE' }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
          } else if (t === 'players') {
            fileName = '3_Roster_Players.xlsx'; sheetName = 'Players';
            const rows = (this.data.players || []).map(p => ({ Team: (this.data.teams || []).find(t => t.id === this.activeTeamId)?.name || '', Number: p.number, Name: p.name, Position: p.position, Class: p.classYear || p.class_year || 'Senior', Height: p.height || '', Goals: p.seasonStats?.goals ?? '', Assists: p.seasonStats?.assists ?? '', Saves: p.seasonStats?.saves ?? '', CleanSheets: p.seasonStats?.cleanSheets ?? '', Tech: p.ratings?.technical ?? '', Tactical: p.ratings?.tactical ?? '', Physical: p.ratings?.physical ?? '', Mental: p.ratings?.mental ?? '', Photo: p.photo || '', IsDeleted: p.is_deleted || p.isDeleted ? 'TRUE' : 'FALSE' }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
          } else if (t === 'schedule') {
            fileName = '4_Schedule_Results.xlsx'; sheetName = 'Schedule';
            const rows = (this.data.schedule || []).map(m => ({ Team: (this.data.teams || []).find(t => t.id === this.activeTeamId)?.name || '', Date: m.date, Time: m.time, Opponent: m.opponent, Location: m.location, Home: m.isHome ? 'Home' : 'Away', Status: m.status, Score: m.score || '', IsDeleted: m.is_deleted || m.isDeleted ? 'TRUE' : 'FALSE' }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
          } else if (t === 'drills') {
            fileName = '5_Master_Drills_Library.xlsx'; sheetName = 'MasterDrills';
            const rows = (this.data.drillsBank || []).map(d => ({ Name: d.name, Category: d.category || 'General', CoachNotes: d.coachNotes || d.coach_notes || '', IsDeleted: d.is_deleted || d.isDeleted ? 'TRUE' : 'FALSE' }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
          } else if (t === 'plan') {
            fileName = '6_Practice_Plans.xlsx'; sheetName = 'PracticePlans';
            const rows = (this.data.currentPracticePlan || []).map(d => ({ PlanName: this.data.activePlanName || 'Practice Plan', TimeSlot: d.time, DrillName: d.name, Duration: d.duration, CoachNotes: d.coachNotes || '', IsDeleted: d.is_deleted || d.isDeleted ? 'TRUE' : 'FALSE' }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
          } else if (t === 'matrix') {
            fileName = '7_Matrix_Logs.xlsx'; sheetName = 'MatrixLogs';
            const rows = (this.data.matrixLogs || []).map(l => ({ PlayerName: l.playerName || '', DrillName: l.drillName || '', Result: l.result || 'WIN', OpponentName: l.opponentName || '', ScoreText: l.scoreText || '', Date: l.date || '', IsDeleted: l.is_deleted || l.isDeleted ? 'TRUE' : 'FALSE' }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ PlayerName:'Sample Player', DrillName:'1v1 Gauntlet', Result:'WIN', OpponentName:'Challenger', ScoreText:'3-1', Date:'AUG 6, 2026', IsDeleted:'FALSE' }]), sheetName);
          } else if (t === 'coaches') {
            fileName = '8_Coaching_Staff.xlsx'; sheetName = 'Coaches';
            const rows = (this.data.coaches || []).map(c => ({ Name: c.name, Level: c.level, Phone: c.phone || '', Email: c.email || '', Address: c.address || '', Bio: c.bio || '', Photo: c.photo || '', IsDeleted: c.is_deleted || c.isDeleted ? 'TRUE' : 'FALSE' }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
          } else if (t === 'thoughts') {
            fileName = '9_Coach_Daily_Thoughts.xlsx'; sheetName = 'DailyThoughts';
            const rows = (this.data.dailyThoughts || []).map(t => ({ CoachName: t.coachName || 'Coach Bob Miller', ThoughtsText: t.text || '', IsActive: t.isActive ? 'YES' : 'NO', CreatedAt: t.createdAt || '', IsDeleted: t.is_deleted || t.isDeleted ? 'TRUE' : 'FALSE' }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
          } else if (t === 'quiz') {
            fileName = '10_Quiz_Questions.xlsx'; sheetName = 'QuizQuestions';
            const rows = [{ QuestionText: 'What is the primary tactical objective emphasized in Coach\'s Daily Thoughts?', OptionA: 'Drop back into low-block passive defense', OptionB: 'High intensity pressing & quick 2-touch passing transitions', OptionC: 'Dribble individually without passing options', OptionD: 'Long high balls into penalty box only', CorrectAnswer: 'B', Explanation: 'High intensity press and quick transitions.', IsDeleted: 'FALSE' }];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
          } else if (t === 'categories') {
            fileName = '11_Soccer_Categories.xlsx'; sheetName = 'SoccerCategories';
            const rows = (this.data.soccerCategories || []).map(c => ({ Name: c.name, Description: c.description || '', IsDeleted: c.is_deleted || c.isDeleted ? 'TRUE' : 'FALSE' }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
          }

          const fileData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          folder.file(fileName, fileData);
        });

        const zipContent = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(zipContent);
        const a = document.createElement('a');
        a.href = zipUrl;
        a.download = 'BHS_Soccer_All_11_Separate_Tables_Package.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(zipUrl), 2000);
        return;
      }

      tables.forEach((t, idx) => {
        setTimeout(() => {
          this.exportXLSX(t, false);
        }, idx * 200);
      });
      return;
    }

    const wb = XLSX.utils.book_new();

    // 1. SCHOOLS SHEET
    if (type === 'schools' || type === 'all') {
      const rows = [{
        Code: this.data.schoolInfo?.code || 'bhs',
        Name: this.data.schoolInfo?.name || 'Beaumont High School',
        Mascot: this.data.schoolInfo?.mascot || 'Cougars',
        City: this.data.schoolInfo?.city || 'Beaumont, CA',
        PrimaryColor: this.data.schoolInfo?.colors?.primary || '#0047AB',
        SecondaryColor: this.data.schoolInfo?.colors?.secondary || '#FFD700',
        Wins: this.data.schoolInfo?.record?.wins || 0,
        Losses: this.data.schoolInfo?.record?.losses || 0,
        Draws: this.data.schoolInfo?.record?.draws || 0,
        IsDeleted: 'FALSE'
      }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Schools');
    }

    // 2. PROFILES SHEET
    if (type === 'profiles' || type === 'all') {
      const rows = (this.data.userProfiles || [
        { username: 'coach_bob', name: 'Coach Bob Miller', role: 'Coach', approved: true },
        { username: 'sam_admin', name: 'Admin Sam', role: 'Admin', approved: true }
      ]).map(u => ({
        Username: u.username || '', Name: u.name || '', Role: u.role || 'User',
        PlayerId: u.playerId || '', SchoolCode: u.schoolCode || 'bhs',
        Approved: u.approved !== false ? 'YES' : 'NO',
        IsDeleted: u.is_deleted || u.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Profiles');
    }

    // 3. PLAYERS SHEET
    if (type === 'players' || type === 'all') {
      const rows = (this.data.players || []).map(p => ({
        Number: p.number, Name: p.name, Position: p.position,
        Class: p.classYear || p.class_year || 'Senior', Height: p.height || '',
        Goals: p.seasonStats?.goals ?? '', Assists: p.seasonStats?.assists ?? '',
        Saves: p.seasonStats?.saves ?? '', CleanSheets: p.seasonStats?.cleanSheets ?? '',
        Tech: p.ratings?.technical ?? '', Tactical: p.ratings?.tactical ?? '',
        Physical: p.ratings?.physical ?? '', Mental: p.ratings?.mental ?? '',
        Photo: p.photo || '', IsDeleted: p.is_deleted || p.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Players');
    }

    // 4. SCHEDULE SHEET
    if (type === 'schedule' || type === 'all') {
      const rows = (this.data.schedule || []).map(m => ({
        Date: m.date, Time: m.time, Opponent: m.opponent,
        Location: m.location, Home: m.isHome ? 'Home' : 'Away',
        Status: m.status, Score: m.score || '',
        IsDeleted: m.is_deleted || m.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Schedule');
    }

    // 5. MASTER DRILLS SHEET
    if (type === 'drills' || type === 'all') {
      const rows = (this.data.drillsBank || []).map(d => ({
        Name: d.name, Category: d.category || 'General',
        CoachNotes: d.coachNotes || d.coach_notes || '',
        IsDeleted: d.is_deleted || d.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'MasterDrills');
    }

    // 6. PRACTICE PLANS SHEET
    if (type === 'plan' || type === 'all') {
      const rows = (this.data.currentPracticePlan || []).map(d => ({
        PlanName: this.data.activePlanName || 'Practice Plan',
        TimeSlot: d.time, DrillName: d.name, Duration: d.duration,
        CoachNotes: d.coachNotes || '',
        IsDeleted: d.is_deleted || d.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'PracticePlans');
    }

    // 7. MATRIX LOGS SHEET
    if (type === 'matrix' || type === 'all') {
      const rows = (this.data.matrixLogs || []).map(l => ({
        PlayerName: l.playerName || '', DrillName: l.drillName || '',
        Result: l.result || 'WIN', OpponentName: l.opponentName || '',
        ScoreText: l.scoreText || '', Date: l.date || '',
        IsDeleted: l.is_deleted || l.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ PlayerName:'Sample Player', DrillName:'1v1 Gauntlet', Result:'WIN', OpponentName:'Challenger', ScoreText:'3-1', Date:'AUG 6, 2026', IsDeleted:'FALSE' }]), 'MatrixLogs');
    }

    // 8. COACHES SHEET
    if (type === 'coaches' || type === 'all') {
      const rows = (this.data.coaches || []).map(c => ({
        Name: c.name, Level: c.level, Phone: c.phone || '',
        Email: c.email || '', Address: c.address || '', Bio: c.bio || '',
        Photo: c.photo || '', IsDeleted: c.is_deleted || c.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Coaches');
    }

    // 9. DAILY THOUGHTS SHEET
    if (type === 'thoughts' || type === 'all') {
      const rows = (this.data.dailyThoughts || []).map(t => ({
        CoachName: t.coachName || 'Coach Bob Miller',
        ThoughtsText: t.text || '',
        IsActive: t.isActive ? 'YES' : 'NO',
        CreatedAt: t.createdAt || '',
        IsDeleted: t.is_deleted || t.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'DailyThoughts');
    }

    // 10. QUIZ QUESTIONS SHEET
    if (type === 'quiz' || type === 'all') {
      const rows = [
        { QuestionText: 'What is the primary tactical objective emphasized in Coach\'s Daily Thoughts?', OptionA: 'Drop back into low-block passive defense', OptionB: 'High intensity pressing & quick 2-touch passing transitions', OptionC: 'Dribble individually without passing options', OptionD: 'Long high balls into penalty box only', CorrectAnswer: 'B', Explanation: 'High intensity press and quick transitions.', IsDeleted: 'FALSE' },
        { QuestionText: 'How should players handle possession under pressure according to today\'s focus?', OptionA: 'Make the simple, quick pass as first option', OptionB: 'Hold the ball until surrounded by defenders', OptionC: 'Turn around and kick the ball out of bounds', OptionD: 'Stop moving completely and wait for whistle', CorrectAnswer: 'A', Explanation: 'Make the simple quick pass early.', IsDeleted: 'FALSE' }
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'QuizQuestions');
    }

    // 11. SOCCER CATEGORIES SHEET
    if (type === 'categories' || type === 'all') {
      const rows = (this.data.soccerCategories || []).map(c => ({
        Name: c.name,
        Description: c.description || '',
        IsDeleted: c.is_deleted || c.isDeleted ? 'TRUE' : 'FALSE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'SoccerCategories');
    }

    const planNameClean = (this.data.activePlanName || 'PracticePlan').replace(/[/\\?%*:|"<>]/g, '_');
    const fileName = type === 'all' ? 'BHS_Soccer_AllData_Complete.xlsx' :
      type === 'schools' ? 'BHS_Schools_Config.xlsx' :
      type === 'profiles' ? 'BHS_User_Profiles.xlsx' :
      type === 'players' ? 'BHS_Roster.xlsx' :
      type === 'schedule' ? 'BHS_Schedule.xlsx' :
      type === 'drills' ? 'BHS_Master_Drills_Library.xlsx' :
      type === 'matrix' ? 'BHS_Matrix_Logs.xlsx' :
      type === 'coaches' ? 'BHS_Coaching_Staff.xlsx' :
      type === 'thoughts' ? 'BHS_Coach_Daily_Thoughts.xlsx' :
      type === 'quiz' ? 'BHS_Quiz_Questions.xlsx' :
      type === 'categories' ? 'BHS_Soccer_Categories.xlsx' : `${planNameClean}.xlsx`;

    XLSX.writeFile(wb, fileName);
  },

  downloadTemplate(type) {
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded yet — please wait a moment and try again.'); return; }
    const wb = XLSX.utils.book_new();

    if (type === 'all') {
      this.exportXLSX('all');
      return;
    }

    if (type === 'schools') {
      const headers = [{ Code:'bhs', Name:'Beaumont High School', Mascot:'Cougars', City:'Beaumont, CA', PrimaryColor:'#0047AB', SecondaryColor:'#FFD700', Wins:0, Losses:0, Draws:0, IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Schools');
      XLSX.writeFile(wb, 'BHS_Schools_Template.xlsx');
    } else if (type === 'profiles') {
      const headers = [{ Username:'johndoe', Name:'John Doe', Role:'Coach', PlayerId:'', SchoolCode:'bhs', Approved:'YES', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Profiles');
      XLSX.writeFile(wb, 'BHS_Profiles_Template.xlsx');
    } else if (type === 'players') {
      const headers = [{ Team:'blank = current team', Number:'', Name:'', Position:'', Class:'', Height:'', Goals:'', Assists:'', Saves:'', CleanSheets:'', Tech:'', Tactical:'', Physical:'', Mental:'', Photo:'', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Players');
      XLSX.writeFile(wb, 'BHS_Player_Template.xlsx');
    } else if (type === 'schedule') {
      const headers = [{ Team:'blank = current team', Date:'', Time:'', Opponent:'', Location:'', Home:'Home or Away', Status:'UPCOMING or COMPLETED', Score:'', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Schedule');
      XLSX.writeFile(wb, 'BHS_Schedule_Template.xlsx');
    } else if (type === 'drills') {
      const headers = [{ Name:'', Category:'General', CoachNotes:'', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'MasterDrills');
      XLSX.writeFile(wb, 'BHS_Master_Drills_Template.xlsx');
} else if (type === 'quiz') {
      const headers = [{ QuestionText:'Sample Question?', OptionA:'Option 1', OptionB:'Option 2', OptionC:'Option 3', OptionD:'Option 4', CorrectAnswer:'B', Explanation:'Sample explanation', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'QuizQuestions');
      XLSX.writeFile(wb, 'BHS_Quiz_Questions_Template.xlsx');
    } else if (type === 'categories') {
      const headers = [{ Name:'Tactical / Attacking', Description:'Drills focused on offensive build-up, 1v1 gauntlets, overlapping runs, counter-pressing, and finishing in the box.', IsDeleted:'FALSE' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'SoccerCategories');
      XLSX.writeFile(wb, 'BHS_Soccer_Categories_Template.xlsx');
    }
  },

  /**
   * Resolves an import row's Team column to a real team.
   *
   * Blank falls back to the active team, so every sheet written before this
   * column existed keeps working unchanged. A name that matches an existing
   * team in the same organization reuses it. A name that matches nothing is
   * CREATED, which is what makes loading a season's worth of squads a single
   * import rather than a round of SQL first.
   *
   * Two consequences worth knowing. Creating a team needs admin, because
   * teams_write is admin-only — a coach importing a sheet that names a new team
   * gets those rows skipped with a warning rather than the whole sheet failing.
   * And a typo makes a team: "Varisty" becomes a fourth squad. That is the
   * deliberate trade for not refusing the import.
   *
   * `cache` is a Map shared across one import so a 30-row sheet resolves each
   * distinct team once, not thirty times.
   */
  async resolveImportTeam(name, cache, warnings) {
    const active = (this.data.teams || []).find(t => t.id === this.activeTeamId) || null;
    const wanted = String(name || '').trim();
    if (!wanted) return active;

    const key = wanted.toLowerCase();
    if (cache.has(key)) return cache.get(key);

    const existing = (this.data.teams || []).find(t =>
      String(t.name || '').toLowerCase() === key &&
      (!active || t.school_id === active.school_id));
    if (existing) { cache.set(key, existing); return existing; }

    if (!active) { cache.set(key, null); return null; }

    const created = await window.supabaseService.createTeam(active.school_id, wanted);
    if (!created || !created.id) {
      warnings.push(`Team "${wanted}" does not exist and could not be created (admin access required) — rows naming it were skipped.`);
      cache.set(key, null);
      return null;
    }
    const team = {
      id: created.id, school_id: active.school_id, name: wanted,
      season: null, is_public_default: false,
      school_name: active.school_name, school_kind: active.school_kind
    };
    this.data.teams.push(team);
    cache.set(key, team);
    return team;
  },

  async handleImportFile(file, target) {
    if (!file) return;
    const status = document.getElementById('importStatus');
    if (status) status.textContent = '⏳ Reading & importing file package...';

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const toStr = (v) => String(v ?? '').trim();
        // undefined (not '' or 0) when the sheet has no such column, so upsertByKey's
        // blank-skip can distinguish "not supplied" from "supplied as empty".
        const opt = (v) => { const s = (v == null ? '' : String(v)).trim(); return s === '' ? undefined : s; };
        const optI = (v) => { const s = opt(v); return s === undefined ? undefined : (parseInt(s, 10) || 0); };
        const optB = (v) => { const s = opt(v); return s === undefined ? undefined : s.toLowerCase() === 'true'; };
        let totalCount = 0;
        let totalUpdated = 0, totalInserted = 0, totalRejected = 0;
        // Sheets skipped for a reason the coach needs to hear. Collected rather
        // than written straight to the status line, which the summary overwrites.
        const warnings = [];

        /**
         * Writes each row and counts the ones the database refused.
         *
         * The upsert helpers log the error and return null rather than throwing,
         * so a bare `for (...) await upsert(...)` loop cannot tell a stored row
         * from a rejected one — and the status line would report a clean import
         * for rows that never landed. That became reachable the moment a unique
         * index went on players(school_id, lower(name)): re-importing a name that
         * belongs to a soft-deleted player now raises 23505 instead of silently
         * inserting a duplicate. Better, but only if somebody says so.
         */
        const persistAll = async (rows, write) => {
          let rejected = 0;
          for (const row of rows || []) {
            if (!(await write(row))) rejected++;
          }
          return rejected;
        };

        let workbookSheets = {};

        if (file.name.endsWith('.csv')) {
          const text = e.target.result;
          const lines = text.trim().split('\n');
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          const rows = lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h, i) => obj[h] = vals[i] || '');
            return obj;
          });
          workbookSheets[target || 'Sheet1'] = rows;
        } else {
          if (typeof XLSX === 'undefined') throw new Error('SheetJS library not loaded');
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          wb.SheetNames.forEach(sName => {
            workbookSheets[sName] = XLSX.utils.sheet_to_json(wb.Sheets[sName], { defval: '' });
          });
        }

        // Re-read from Postgres before merging. this.data may already be stale
        // (another user's edit, or a manual change in the SQL editor) before this
        // import ever touches it, and a stale copy is exactly what lets a blank
        // sheet column preserve a stale value and write it straight back. This
        // protects the merge about to happen; the post-write sync below protects
        // only the *next* import.
        if (window.supabaseService?.isConfigured()) {
          try {
            await this.syncFromSupabase();
          } catch (syncErr) {
            console.warn('Pre-import re-sync notice:', syncErr);
          }
        }

        const sheetsToProcess = target === 'all'
          ? Object.keys(workbookSheets)
          : [Object.keys(workbookSheets)[0]];

        for (const sheetName of sheetsToProcess) {
          const rows = workbookSheets[sheetName] || [];
          if (!rows || rows.length === 0) continue;

          const sLower = sheetName.toLowerCase();
          const activeTarget = (target !== 'all') ? target :
            sLower.includes('school') ? 'schools' :
            sLower.includes('profile') ? 'profiles' :
            sLower.includes('player') ? 'players' :
            sLower.includes('schedule') ? 'schedule' :
            sLower.includes('drill') ? 'drills' :
            sLower.includes('plan') ? 'plan' :
            sLower.includes('matrix') ? 'matrix' :
            sLower.includes('coach') ? 'coaches' :
            sLower.includes('thought') ? 'thoughts' :
            sLower.includes('quiz') ? 'quiz' :
            (sLower.includes('category') || sLower.includes('categories')) ? 'categories' : 'players';

          if (activeTarget === 'schools') {
            const r = rows[0];
            if (r) {
              this.data.schoolInfo = {
                code: toStr(r.Code) || 'bhs',
                name: toStr(r.Name) || 'Beaumont High School',
                mascot: toStr(r.Mascot) || 'Cougars',
                city: toStr(r.City) || 'Beaumont, CA',
                colors: { primary: toStr(r.PrimaryColor) || '#0047AB', secondary: toStr(r.SecondaryColor) || '#FFD700' },
                record: { wins: parseInt(r.Wins) || 0, losses: parseInt(r.Losses) || 0, draws: parseInt(r.Draws) || 0 }
              };
              totalCount += 1;
              if (window.supabaseService?.isConfigured()) await window.supabaseService.upsertSchool('bhs', this.data.schoolInfo);
            }
          } else if (activeTarget === 'profiles') {
            const imported = rows.filter(r => r.Username || r.Name).map(r => ({
              id: 'prof_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              username: toStr(r.Username || r.Name).toLowerCase().replace(/\s+/g, '_'),
              name: toStr(r.Name || r.Username),
              role: toStr(r.Role) || 'User',
              schoolCode: toStr(r.SchoolCode) || 'bhs',
              approved: toStr(r.Approved).toUpperCase() !== 'NO',
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));
            if (!this.data.userProfiles) this.data.userProfiles = [];
            const resU = this.upsertByName(this.data.userProfiles, imported);
            totalCount += imported.length; totalUpdated += resU.updated; totalInserted += resU.inserted;
          } else if (activeTarget === 'players') {
            if (!this.activeTeamId) {
              // Rows without a Team column land on the active team, and creating
              // a named team needs one to borrow an organization from. With no
              // team at all there is nothing to resolve against.
              warnings.push('Players sheet skipped — no team is selected. Choose a team in the header first; rows without a Team column join it.');
              continue;
            }
            const playerDefaults = {
              number: 0, position: 'Midfielder', classYear: 'Junior', height: "5'10\"",
              ratings: { technical: 80, tactical: 80, physical: 80, mental: 80 },
              seasonStats: { goals: 0, assists: 0, games: 1 },
              isDeleted: false, is_deleted: false
            };
            const imported = rows.filter(r => r.Name).map(r => {
              // Build seasonStats/ratings from whichever columns the sheet
              // actually supplied — not from a shape chosen by the sheet's
              // Position column, which only reads the sheet and never the
              // stored record. upsertByKey's deep merge (app.core.js) then
              // folds these into the existing object one key at a time, so a
              // partial sheet can't clobber stats it didn't mention.
              const stats = {};
              if (optI(r.Goals)       !== undefined) stats.goals       = optI(r.Goals);
              if (optI(r.Assists)     !== undefined) stats.assists     = optI(r.Assists);
              if (optI(r.Saves)       !== undefined) stats.saves       = optI(r.Saves);
              if (optI(r.CleanSheets) !== undefined) stats.cleanSheets = optI(r.CleanSheets);
              const seasonStats = Object.keys(stats).length ? stats : undefined;

              const ratings = {};
              if (optI(r.Tech)     !== undefined) ratings.technical = optI(r.Tech);
              if (optI(r.Tactical) !== undefined) ratings.tactical  = optI(r.Tactical);
              if (optI(r.Physical) !== undefined) ratings.physical  = optI(r.Physical);
              if (optI(r.Mental)   !== undefined) ratings.mental    = optI(r.Mental);
              const ratingsOut = Object.keys(ratings).length ? ratings : undefined;

              return {
                id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
                number: optI(r.Number),
                name: toStr(r.Name), position: opt(r.Position),
                classYear: opt(r.Class || r.ClassYear), height: opt(r.Height),
                photo: opt(r.Photo || r.PhotoUrl),
                seasonStats,
                ratings: ratingsOut,
                // matrixStats intentionally not set here: that legacy shape
                // ({wins,losses,points,rank,drillScore}) is unused by Phase 3 and
                // clobbers the derived standings syncFromSupabase joins onto the player.
                isDeleted: optB(r.IsDeleted),
                is_deleted: optB(r.IsDeleted),
                // Which squad this row joins. Blank means the active team.
                importTeamName: opt(r.Team)
              };
            });
            totalCount += imported.length;
            if (window.supabaseService?.isConfigured()) {
              // Match people by name across the WHOLE identity table, not against
              // this.data.players — that holds only the active team's roster, so a
              // sheet putting someone on JV would miss their Varsity identity and
              // mint a duplicate human.
              const allIdentities = (await window.supabaseService.fetchAllPlayerIdentities()) || [];
              const identityByName = new Map(allIdentities.map(r => [String(r.name || '').trim().toLowerCase(), r.id]));
              const teamCache = new Map();

              totalRejected += await persistAll(imported, async p => {
                const team = await this.resolveImportTeam(p.importTeamName, teamCache, warnings);
                if (!team) return false;

                const nameKey = String(p.name || '').trim().toLowerCase();
                const identity = await window.supabaseService.upsertPlayerIdentity(
                  identityByName.has(nameKey) ? { ...p, id: identityByName.get(nameKey) } : p
                );
                if (!identity || !identity.id) return false;
                // Remember it, so a sheet naming the same person on two teams
                // reuses the identity created moments ago rather than duplicating.
                identityByName.set(nameKey, identity.id);

                const memRes = await window.supabaseService.upsertTeamMembership(team.id, team.school_id, {
                  player_id: identity.id,
                  number: p.number,
                  position: p.position,
                  season_stats: p.seasonStats,
                  ratings: p.ratings
                });
                if (memRes && memRes.ok) { totalInserted += 1; return true; }
                if (memRes && memRes.error) warnings.push(`${p.name}: ${memRes.error}`);
                return false;
              });
            }
          } else if (activeTarget === 'schedule') {
            if (!this.activeTeamId) {
              // Rows without a Team column land on the active team, and creating
              // a named team needs one to borrow an organization from.
              warnings.push('Schedule sheet skipped — no team is selected. Choose a team in the header first; rows without a Team column join it.');
              continue;
            }

            // Fixtures are matched on [date, time], so a sheet with no Time
            // column cannot match anything: every row would key as "AUG 14,
            // 2026|" and insert as a duplicate of a fixture that already
            // exists. Defaulting the time does not save it either — stored
            // times vary (6:30 PM, 5:00 PM, and FINAL on completed games), so
            // any single default still mismatches most rows. Refuse instead,
            // rather than silently duplicating the schedule.
            const headerHasTime = rows.some(r => Object.prototype.hasOwnProperty.call(r, 'Time'));
            if (!headerHasTime && rows.length > 0) {
              // `continue`, not `return`: an "all tables" import must not lose
              // its other sheets because this one is unusable.
              warnings.push('Schedule sheet skipped — it has no Time column. Fixtures are matched '
                + 'on Date + Time, so importing it would duplicate every fixture rather than update '
                + 'it. Export the schedule and edit that file; the export always includes Time.');
              continue;
            }

            const scheduleDefaults = {
              location: 'Home - Cougar Stadium', isHome: true,
              status: 'UPCOMING', score: null, isDeleted: false, is_deleted: false
            };
            const imported = rows.filter(r => r.Opponent).map(r => ({
              id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              date: toStr(r.Date).toUpperCase(),
              // `time` is part of the [date, time] composite key upsertByDateTime
              // keys on, so it must be defaulted here, before the key is
              // computed — not in `defaults`, which is only applied after a row
              // is determined to be a new insert.
              time: toStr(r.Time) || '6:00 PM',
              opponent: toStr(r.Opponent),
              location: opt(r.Location),
              isHome: opt(r.Home) !== undefined ? (opt(r.Home).toLowerCase() !== 'away') : undefined,
              status: opt(r.Status) ? toStr(r.Status).toUpperCase() : undefined,
              score: opt(r.Score),
              isDeleted: optB(r.IsDeleted),
              is_deleted: optB(r.IsDeleted),
              // Which team's fixture this is. Blank means the active team.
              importTeamName: opt(r.Team)
            }));
            const resS = this.upsertByDateTime(this.data.schedule, imported, scheduleDefaults);
            totalCount += imported.length; totalUpdated += resS.updated; totalInserted += resS.inserted;
            if (window.supabaseService?.isConfigured()) {
              const schedTeamCache = new Map();
              totalRejected += await persistAll(resS.toPersist, async m => {
                const team = await this.resolveImportTeam(m.importTeamName, schedTeamCache, warnings);
                if (!team) return false;
                return !!(await window.supabaseService.upsertMatch(team.id, m));
              });
            }
          } else if (activeTarget === 'drills') {
            const drillDefaults = { category: 'General', isDeleted: false, is_deleted: false };
            const imported = rows.filter(r => r.Name || r.DrillName).map(r => ({
              id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              name: toStr(r.Name || r.DrillName),
              category: opt(r.Category),
              coachNotes: toStr(r.CoachNotes || r.coach_notes),
              isDeleted: optB(r.IsDeleted),
              is_deleted: optB(r.IsDeleted)
            }));
            if (!this.data.drillsBank) this.data.drillsBank = [];
            const resD = this.upsertByName(this.data.drillsBank, imported, drillDefaults);
            totalCount += imported.length; totalUpdated += resD.updated; totalInserted += resD.inserted;
            if (window.supabaseService?.isConfigured()) {
              totalRejected += await persistAll(resD.toPersist, d => window.supabaseService.upsertDrillBankItem('bhs', d));
            }
          } else if (activeTarget === 'plan') {
            const imported = rows.filter(r => r.DrillName || r.drill || r.Name || r.name).map(r => ({
              id: null,
              time: toStr(r.TimeSlot || r.Time || r.time),
              name: toStr(r.DrillName || r.drill || r.Name || r.name),
              duration: toStr(r.Duration || r.duration) || '15 min',
              coachNotes: toStr(r.CoachNotes || r.coachNotes),
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));
            this.data.currentPracticePlan.push(...imported);
            totalCount += imported.length;
          } else if (activeTarget === 'coaches') {
            const coachDefaults = { level: 'Staff', isDeleted: false, is_deleted: false };
            const imported = rows.filter(r => r.Name).map(r => ({
              id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              name: toStr(r.Name),
              level: opt(r.Level),
              phone: toStr(r.Phone),
              email: toStr(r.Email),
              address: toStr(r.Address),
              bio: toStr(r.Bio),
              photo: toStr(r.Photo || r.PhotoUrl),
              isDeleted: optB(r.IsDeleted),
              is_deleted: optB(r.IsDeleted)
            }));
            if (!this.data.coaches) this.data.coaches = [];
            const resC = this.upsertByName(this.data.coaches, imported, coachDefaults);
            totalCount += imported.length; totalUpdated += resC.updated; totalInserted += resC.inserted;
            if (window.supabaseService?.isConfigured()) {
              totalRejected += await persistAll(resC.toPersist, c => window.supabaseService.upsertCoach('bhs', c));
            }
          } else if (activeTarget === 'thoughts') {
            const imported = rows.filter(r => r.ThoughtsText || r.text).map(r => ({
              id: 'dt_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              coachId: 'c1',
              coachName: toStr(r.CoachName || r.coachName) || 'Coach Bob Miller',
              text: toStr(r.ThoughtsText || r.text),
              isActive: toStr(r.IsActive || r.isActive).toLowerCase() === 'yes' || toStr(r.IsActive || r.isActive).toLowerCase() === 'true',
              createdAt: toStr(r.CreatedAt || r.createdAt) || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));

            if (imported.some(t => t.isActive)) {
              (this.data.dailyThoughts || []).forEach(t => t.isActive = false);
            }
            if (!this.data.dailyThoughts) this.data.dailyThoughts = [];
            this.data.dailyThoughts.unshift(...imported);
            totalCount += imported.length;

            if (window.supabaseService?.isConfigured()) {
              for (const t of imported) {
                await window.supabaseService.upsertDailyThought('bhs', {
                  id: t.id,
                  coachId: t.coachId,
                  coachName: t.coachName,
                  text: t.text,
                  isActive: t.isActive,
                  is_deleted: t.is_deleted
                });
              }
            }
          } else if (activeTarget === 'categories') {
            const imported = rows.filter(r => r.Name || r.name).map(r => ({
              id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
              name: toStr(r.Name || r.name),
              description: toStr(r.Description || r.description),
              isDeleted: toStr(r.IsDeleted).toLowerCase() === 'true',
              is_deleted: toStr(r.IsDeleted).toLowerCase() === 'true'
            }));
            if (!this.data.soccerCategories) this.data.soccerCategories = [];
            imported.forEach(cat => {
              const idx = this.data.soccerCategories.findIndex(c => c.name.toLowerCase() === cat.name.toLowerCase());
              if (idx !== -1) {
                this.data.soccerCategories[idx] = cat;
              } else {
                this.data.soccerCategories.push(cat);
              }
            });
            totalCount += imported.length;
            if (window.supabaseService?.isConfigured()) {
              for (const cat of imported) await window.supabaseService.upsertSoccerCategory('bhs', cat);
            }
            this.populateCategoryDropdowns();
          }
        }

        this.saveData();

        // Re-read from Postgres before rendering. This protects the *next*
        // import (and any other view) from merging against what this import
        // just wrote plus whatever mutated this.data while it ran — the
        // pre-import sync above is what protects this import's own merge.
        if (window.supabaseService?.isConfigured()) {
          if (status) status.textContent = '⏳ Imported. Re-syncing from the database…';
          try {
            await this.syncFromSupabase();
          } catch (syncErr) {
            console.warn('Post-import re-sync notice:', syncErr);
          }
        }

        this.renderCurrentView();
        if (status) {
          // A rejection is not a failed import, but it is not a clean one either:
          // say so plainly rather than reporting only what succeeded.
          const rejected = totalRejected
            ? `, ${totalRejected} rejected by the database (see the browser console)`
            : '';
          const flagged = totalRejected || warnings.length;
          status.textContent = `${flagged ? '⚠️' : '✅'} Imported ${totalCount} records — `
            + `${totalUpdated} updated, ${totalInserted} added${rejected}.`
            + (warnings.length ? ' ' + warnings.join(' ') : '');
        }
      } catch (err) {
        console.error('Import error:', err);
        if (status) status.textContent = `❌ Import failed: ${err.message}`;
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  }


});
