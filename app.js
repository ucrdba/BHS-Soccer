/**
 * Beaumont High School Cougars Soccer - Core Application Engine
 * Includes Public Roster/Schedule, Anson Dorrance Competitive Matrix, & Practice Planner
 */

// Initial Sample Data for Beaumont High School
const DEFAULT_BHS_DATA = {
  school: {
    id: 'bhs',
    name: 'Beaumont High School',
    mascot: 'Cougars',
    city: 'Beaumont, CA',
    colors: { primary: '#0047AB', secondary: '#FFFFFF', navy: '#0A1428' },
    record: { wins: 9, losses: 1, draws: 2 }
  },
  players: [
    {
      id: 'p101',
      number: 10,
      name: 'Alex Rivera',
      position: 'Forward / CAM',
      classYear: 'Senior (2027)',
      height: "5'11\"",
      photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 14, assists: 8, games: 12 },
      ratings: { technical: 92, tactical: 88, physical: 85, mental: 90 },
      matrixStats: { wins: 28, losses: 6, points: 94, rank: 1, drillScore: 92.4 }
    },
    {
      id: 'p102',
      number: 7,
      name: 'Marcus Vance',
      position: 'Winger',
      classYear: 'Junior (2028)',
      height: "5'9\"",
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 9, assists: 11, games: 12 },
      ratings: { technical: 89, tactical: 84, physical: 91, mental: 86 },
      matrixStats: { wins: 25, losses: 8, points: 86, rank: 2, drillScore: 89.1 }
    },
    {
      id: 'p103',
      number: 4,
      name: 'Ethan Thorne',
      position: 'Center Back',
      classYear: 'Senior (2027)',
      height: "6'2\"",
      photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 2, assists: 3, tackles: 42, games: 12 },
      ratings: { technical: 80, tactical: 92, physical: 94, mental: 91 },
      matrixStats: { wins: 23, losses: 9, points: 81, rank: 3, drillScore: 86.5 }
    },
    {
      id: 'p104',
      number: 1,
      name: 'Mateo Sandoval',
      position: 'Goalkeeper',
      classYear: 'Junior (2028)',
      height: "6'1\"",
      photo: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80',
      seasonStats: { saves: 68, cleanSheets: 7, games: 12 },
      ratings: { technical: 86, tactical: 89, physical: 88, mental: 93 },
      matrixStats: { wins: 22, losses: 10, points: 79, rank: 4, drillScore: 84.8 }
    },
    {
      id: 'p105',
      number: 6,
      name: 'Lucas Sterling',
      position: 'Defensive Mid',
      classYear: 'Sophomore (2029)',
      height: "5'10\"",
      photo: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 3, assists: 6, games: 11 },
      ratings: { technical: 85, tactical: 87, physical: 86, mental: 85 },
      matrixStats: { wins: 20, losses: 11, points: 72, rank: 5, drillScore: 81.2 }
    },
    {
      id: 'p106',
      number: 9,
      name: 'Jordan Brooks',
      position: 'Striker',
      classYear: 'Senior (2027)',
      height: "6'0\"",
      photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 11, assists: 2, games: 12 },
      ratings: { technical: 87, tactical: 82, physical: 88, mental: 84 },
      matrixStats: { wins: 19, losses: 12, points: 69, rank: 6, drillScore: 79.5 }
    }
  ],
  schedule: [
    {
      id: 'm201',
      date: 'AUG 12, 2026',
      time: '6:30 PM',
      opponent: 'Yucaipa Thunderbirds',
      location: 'Home - Cougar Stadium',
      status: 'UPCOMING',
      isHome: true
    },
    {
      id: 'm202',
      date: 'AUG 18, 2026',
      time: '5:00 PM',
      opponent: 'Citrus Valley Blackhawks',
      location: 'Away - Redlands, CA',
      status: 'UPCOMING',
      isHome: false
    },
    {
      id: 'm203',
      date: 'JUL 28, 2026',
      time: 'FINAL',
      opponent: 'Redlands East Valley',
      location: 'Home - Cougar Stadium',
      status: 'COMPLETED',
      score: '3 - 1',
      result: 'WIN'
    },
    {
      id: 'm204',
      date: 'JUL 22, 2026',
      time: 'FINAL',
      opponent: 'Palm Springs Indians',
      location: 'Away - Palm Springs',
      status: 'COMPLETED',
      score: '2 - 0',
      result: 'WIN'
    }
  ],
  drillsBank: [
    { id: 'd1', name: 'Anson 1v1 Gauntlet (Continuous)', duration: '20 min', category: 'Competitive Matrix 1v1', points: 3 },
    { id: 'd2', name: '2v2 Flying Scrimmage with Bumpers', duration: '25 min', category: 'Small Sided', points: 3 },
    { id: 'd3', name: 'Finishing under High Pressure', duration: '15 min', category: 'Technical / Shooting', points: 2 },
    { id: 'd4', name: '12-Minute Cooper Fitness Test', duration: '15 min', category: 'Physical Conditioning', points: 5 },
    { id: 'd5', name: '7v7 Tactical Match Play', duration: '30 min', category: 'Full Scrimmage', points: 3 }
  ],
  currentPracticePlan: [
    { time: '0:00 - 0:15', name: 'Dynamic Warmup & Rondo (5v2)', duration: '15 min', coachNotes: 'Focus on 1-touch speed & communication' },
    { time: '0:15 - 0:35', name: 'Anson 1v1 Gauntlet (Continuous)', duration: '20 min', coachNotes: 'Log 1v1 win/loss scores into Matrix' },
    { time: '0:35 - 1:00', name: '2v2 Flying Scrimmage with Bumpers', duration: '25 min', coachNotes: 'High intensity transition' },
    { time: '1:00 - 1:25', name: '7v7 Tactical Match Play', duration: '25 min', coachNotes: 'Applying press triggers' },
    { time: '1:25 - 1:30', name: 'Cool Down & Matrix Leaderboard Review', duration: '5 min', coachNotes: 'Announce Competitor of the Day' }
  ]
};

class BHSSoccerApp {
  constructor() {
    this.data = this.loadData();
    this.currentView = 'home';
    this.activeFilter = 'ALL';
    this.init();
  }

  loadData() {
    const saved = localStorage.getItem('bhs_soccer_app_data');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return DEFAULT_BHS_DATA; }
    }
    return DEFAULT_BHS_DATA;
  }

  saveData() {
    localStorage.setItem('bhs_soccer_app_data', JSON.stringify(this.data));
  }

  async init() {
    window.auth.subscribe(() => {
      this.updateAuthUI();
      this.renderCurrentView();
    });

    this.bindEvents();
    this.updateAuthUI();
    this.renderCurrentView();
    this.startCountdownTimer();

    // Dynamically load live data from Supabase Cloud Database if configured
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await this.syncFromSupabase();
    }
  }

  async syncFromSupabase() {
    try {
      const dbPlayers = await window.supabaseService.fetchPlayers('bhs');
      if (dbPlayers && dbPlayers.length > 0) {
        this.data.players = dbPlayers
          .filter(p => !p.is_deleted)
          .map(p => ({
            id: p.id,
            number: p.number,
            name: p.name,
            position: p.position,
            classYear: p.class_year,
            height: p.height,
            photo: p.photo_url,
            seasonStats: p.season_stats || {},
            ratings: p.ratings || {},
            matrixStats: p.matrix_stats || {},
            isDeleted: p.is_deleted || false
          }));
      }

      const dbSchedule = await window.supabaseService.fetchSchedule('bhs');
      if (dbSchedule && dbSchedule.length > 0) {
        this.data.schedule = dbSchedule.map(s => ({
          id: s.id,
          date: s.match_date,
          time: s.match_time,
          opponent: s.opponent,
          location: s.location,
          status: s.status,
          isHome: s.is_home,
          score: s.score,
          result: s.result
        }));
      }

      const dbPlans = await window.supabaseService.fetchPracticePlans('bhs');
      if (dbPlans && dbPlans.length > 0) {
        this.data.currentPracticePlan = dbPlans.map(plan => ({
          id: plan.id,
          time: plan.time_slot,
          name: plan.name,
          duration: plan.duration,
          coachNotes: plan.coach_notes
        }));
      }

      console.log('⚡ Successfully loaded live data from Supabase Cloud!');
      this.renderCurrentView();
    } catch (e) {
      console.warn('Supabase data sync notice:', e);
    }
  }

  bindEvents() {
    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = item.getAttribute('data-view');
        this.switchView(view);
      });
    });

    // Auth Switcher button
    const authBtn = document.getElementById('authSwitchBtn');
    if (authBtn) {
      authBtn.addEventListener('click', () => this.openAuthModal());
    }

    // Modal Close buttons
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeModals());
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModals();
      });
    });
  }

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.getAttribute('data-view') === viewName) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    this.renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateAuthUI() {
    const currentUser = window.auth.getCurrentUser();
    const roleBadge = document.getElementById('navUserBadge');
    const roleName = document.getElementById('navUserName');
    
    if (roleBadge && roleName) {
      roleName.textContent = currentUser.name;
      roleBadge.textContent = currentUser.role.toUpperCase();
      
      // Update badge class
      roleBadge.className = 'badge ';
      if (currentUser.role === 'coach') roleBadge.classList.add('badge-coach');
      else if (currentUser.role === 'admin') roleBadge.classList.add('badge-admin');
      else if (currentUser.role === 'player') roleBadge.classList.add('badge-role');
      else roleBadge.classList.add('badge-win');
    }
  }

  renderCurrentView() {
    const container = document.getElementById('mainAppContainer');
    if (!container) return;

    const role = window.auth.getRole();
    const canAccessRatings = window.auth.canAccessRatings();

    if (this.currentView === 'home') {
      container.innerHTML = this.renderHomeView();
    } else if (this.currentView === 'roster') {
      container.innerHTML = this.renderRosterView();
    } else if (this.currentView === 'schedule') {
      container.innerHTML = this.renderScheduleView();
    } else if (this.currentView === 'matrix') {
      if (!canAccessRatings) {
        container.innerHTML = this.renderRestrictedAccess('Player Ratings', 'Coaches and players are the only team members authorized to view practice ratings and rankings.');
      } else {
        container.innerHTML = this.renderMatrixView();
      }
    } else if (this.currentView === 'planner') {
      if (!window.auth.isCoach()) {
        container.innerHTML = this.renderRestrictedAccess('Coach Practice Planner', 'Access to practice planning tools is restricted to Head Coaches and Coaching Staff.');
      } else {
        container.innerHTML = this.renderPlannerView();
      }
    }
    
    this.attachDynamicListeners();
  }

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

    // Next upcoming match
    const nextMatch = this.data.schedule.find(m => m.status !== 'COMPLETED');

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
              <div class="timer-unit"><div class="timer-num" id="cdDays">--</div><div class="timer-label">Days</div></div>
              <div class="timer-unit"><div class="timer-num" id="cdHours">--</div><div class="timer-label">Hrs</div></div>
              <div class="timer-unit"><div class="timer-num" id="cdMins">--</div><div class="timer-label">Min</div></div>
            </div>
          </div>
        </div>
      </section>

      <div class="container">
        <!-- Highlights & Quick Stats -->
        <div class="section-header">
          <div>
            <h2 class="section-title">SEASON SPOTLIGHT</h2>
            <p class="text-muted">Beaumont Cougars 2026 Campaign Record</p>
          </div>
          <button class="btn btn-primary" onclick="app.switchView('schedule')">Full Fixtures &amp; Results</button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 50px;">
          <div class="player-card" style="padding: 24px; text-align: center;">
            <h3 style="color: var(--bhs-gold-accent); font-size: 2.8rem;" class="brand-font">${recordStr}</h3>
            <p class="text-muted" style="font-size: 0.9rem;">Overall Season Record (W-L-D)</p>
            <p class="text-muted" style="font-size: 0.75rem; margin-top:4px;">${gamesPlayed} games played</p>
          </div>
          <div class="player-card" style="padding: 24px; text-align: center;">
            <h3 style="color: var(--bhs-cyan-accent); font-size: 2.8rem;" class="brand-font">${goalsFor}</h3>
            <p class="text-muted" style="font-size: 0.9rem;">Goals Scored (${goalsPerGame} / Game)</p>
          </div>
          <div class="player-card" style="padding: 24px; text-align: center;">
            <h3 style="color: var(--color-success); font-size: 2.8rem;" class="brand-font">${cleanSheets}</h3>
            <p class="text-muted" style="font-size: 0.9rem;">Clean Sheets Recorded</p>
          </div>
          <div class="player-card" style="padding: 24px; text-align: center;">
            <h3 style="color: #FFF; font-size: 2.8rem;" class="brand-font">${this.data.schedule.filter(m => m.status === 'UPCOMING').length}</h3>
            <p class="text-muted" style="font-size: 0.9rem;">Upcoming Matches</p>
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

  renderRosterView() {
    const canAccessRatings = window.auth.canAccessRatings();
    const isCoach = window.auth.isCoach();
    
    return `
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">BEAUMONT COUGARS ROSTER</h2>
            <p class="text-muted">2026 Varsity Boys Soccer Squad</p>
          </div>
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            ${isCoach ? `<button class="btn btn-gold" onclick="app.openAddPlayerModal()">+ Add New Player</button>` : ''}
            <div class="filters-bar">
              <span class="filter-chip active" data-filter="ALL" onclick="app.filterRoster('ALL')">All Players</span>
              <span class="filter-chip" data-filter="FWD" onclick="app.filterRoster('FWD')">Forwards</span>
              <span class="filter-chip" data-filter="MID" onclick="app.filterRoster('MID')">Midfielders</span>
              <span class="filter-chip" data-filter="DEF" onclick="app.filterRoster('DEF')">Defenders</span>
              <span class="filter-chip" data-filter="GK" onclick="app.filterRoster('GK')">Goalkeepers</span>
            </div>
          </div>
        </div>

        <div id="rosterGrid" class="roster-grid">
          ${this.data.players.map(p => `
            <div class="player-card" data-player-id="${p.id}" data-position="${p.position}">
              <div class="player-card-header" onclick="app.openPlayerModal('${p.id}')">
                <span class="jersey-number">#${p.number}</span>
                <img src="${p.photo}" class="player-photo" alt="${p.name}" />
              </div>
              <div class="player-card-body">
                <h3 class="player-name" style="cursor:pointer;" onclick="app.openPlayerModal('${p.id}')">${p.name}</h3>
                <div class="player-meta">
                  <span class="badge-pos">${p.position}</span>
                  <span class="badge-class">${p.classYear}</span>
                </div>
                
                <div class="player-stats-row">
                  ${p.seasonStats.goals !== undefined ? `
                    <div class="stat-item"><div class="val">${p.seasonStats.goals}</div><div class="lbl">Goals</div></div>
                    <div class="stat-item"><div class="val">${p.seasonStats.assists}</div><div class="lbl">Assists</div></div>
                  ` : `
                    <div class="stat-item"><div class="val">${p.seasonStats.saves || 0}</div><div class="lbl">Saves</div></div>
                    <div class="stat-item"><div class="val">${p.seasonStats.cleanSheets || 0}</div><div class="lbl">Clean St</div></div>
                  `}
                  <div class="stat-item">
                    <div class="val text-gold">${canAccessRatings ? '#' + p.matrixStats.rank : '🔒'}</div>
                    <div class="lbl">Matrix</div>
                  </div>
                </div>

                ${isCoach ? `
                  <div class="player-card-actions">
                    <button class="btn-card-edit" onclick="event.stopPropagation(); app.openEditPlayerModal('${p.id}')">✏️ Edit</button>
                    <button class="btn-card-delete" onclick="event.stopPropagation(); app.deletePlayer('${p.id}')">🗑️ Delete</button>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  filterRoster(filter) {
    // Update active chip styling
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-filter') === filter);
    });

    // Position keyword map
    const filterMap = {
      ALL: null,
      FWD: ['forward', 'winger', 'cam', 'striker'],
      MID: ['midfield', 'mid'],
      DEF: ['back', 'defender', 'def'],
      GK:  ['goalkeeper', 'keeper', 'gk']
    };

    const keywords = filterMap[filter];

    document.querySelectorAll('#rosterGrid .player-card').forEach(card => {
      if (!keywords) {
        card.style.display = '';
      } else {
        const pos = (card.getAttribute('data-position') || '').toLowerCase();
        const match = keywords.some(kw => pos.includes(kw));
        card.style.display = match ? '' : 'none';
      }
    });
  }

  openAddPlayerModal() {
    const modal = document.getElementById('addPlayerModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async addPlayer(playerData) {
    const newPlayer = {
      id: 'p_' + Date.now(),
      number: parseInt(playerData.number),
      name: playerData.name,
      position: playerData.position,
      classYear: playerData.classYear,
      height: playerData.height || "5'10\"",
      photo: playerData.photo || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
      seasonStats: playerData.position.includes('Goalkeeper') ? { saves: parseInt(playerData.stat1 || 0), cleanSheets: parseInt(playerData.stat2 || 0), games: 1 } : { goals: parseInt(playerData.stat1 || 0), assists: parseInt(playerData.stat2 || 0), games: 1 },
      ratings: {
        technical: parseInt(playerData.tech || 80),
        tactical: parseInt(playerData.tact || 80),
        physical: parseInt(playerData.phys || 80),
        mental: parseInt(playerData.ment || 80)
      },
      matrixStats: { wins: 0, losses: 0, points: 0, rank: this.data.players.length + 1, drillScore: 75.0 }
    };

    this.data.players.push(newPlayer);
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.upsertPlayer('bhs', newPlayer);
    }

    this.renderCurrentView();
    this.closeModals();
  }

  openEditPlayerModal(playerId) {
    console.log('[BHS] openEditPlayerModal called with id:', playerId);
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) {
      console.warn('[BHS] Player not found for id:', playerId);
      return;
    }
    console.log('[BHS] Found player:', player.name);

    const fields = {
      editPlayerId: player.id,
      editPlayerNumber: player.number,
      editPlayerName: player.name,
      editPlayerPosition: player.position,
      editPlayerClass: player.classYear,
      editPlayerHeight: player.height || '',
      editPlayerPhoto: player.photo || '',
      editPlayerStat1: player.seasonStats.goals !== undefined ? player.seasonStats.goals : (player.seasonStats.saves || 0),
      editPlayerStat2: player.seasonStats.assists !== undefined ? player.seasonStats.assists : (player.seasonStats.cleanSheets || 0),
      editPlayerTech: player.ratings ? player.ratings.technical : 80,
      editPlayerTact: player.ratings ? player.ratings.tactical : 80,
      editPlayerPhys: player.ratings ? player.ratings.physical : 80,
      editPlayerMent: player.ratings ? player.ratings.mental : 80
    };

    for (const [id, val] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (el) {
        el.value = val;
      } else {
        console.warn('[BHS] DOM element not found:', id);
      }
    }

    const modal = document.getElementById('editPlayerModal');
    if (modal) {
      modal.style.display = '';
      modal.classList.add('active');
      console.log('[BHS] Edit modal opened');
    } else {
      console.error('[BHS] editPlayerModal element NOT found in DOM!');
    }
  }

  async saveEditPlayer(playerId, playerData) {
    const idx = this.data.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const existing = this.data.players[idx];
      existing.number = parseInt(playerData.number);
      existing.name = playerData.name;
      existing.position = playerData.position;
      existing.classYear = playerData.classYear;
      existing.height = playerData.height;
      existing.photo = playerData.photo;

      if (playerData.position.includes('Goalkeeper')) {
        existing.seasonStats = { saves: parseInt(playerData.stat1), cleanSheets: parseInt(playerData.stat2), games: existing.seasonStats.games || 1 };
      } else {
        existing.seasonStats = { goals: parseInt(playerData.stat1), assists: parseInt(playerData.stat2), games: existing.seasonStats.games || 1 };
      }

      existing.ratings = {
        technical: parseInt(playerData.tech),
        tactical: parseInt(playerData.tact),
        physical: parseInt(playerData.phys),
        mental: parseInt(playerData.ment)
      };

      this.data.players[idx] = existing;
      this.saveData();

      if (window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.upsertPlayer('bhs', existing);
      }

      this.renderCurrentView();
      this.closeModals();
    }
  }

  async deletePlayer(playerId) {
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) return;

    // Soft delete player (sets is_deleted = true in database, preserves record)
    player.isDeleted = true;
    this.data.players = this.data.players.filter(p => p.id !== playerId);
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.deletePlayer(playerId);
    }

    this.renderCurrentView();
    this.closeModals();
  }

  renderScheduleView() {
    const isCoach = window.auth.isCoach();
    return `
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">SCHEDULE & GAME RESULTS</h2>
            <p class="text-muted">Beaumont High School Cougars Fall 2026 Fixtures</p>
          </div>
          ${isCoach ? `<button class="btn btn-gold" onclick="app.openAddMatchModal()">+ Add New Match</button>` : ''}
        </div>

        <div class="schedule-list">
          ${this.data.schedule.map(m => `
            <div class="schedule-card">
              <div class="game-date">
                ${m.date}
                <div class="time">${m.time}</div>
              </div>
              <div class="game-matchup">
                <div>
                  <div class="opponent-name">${m.opponent}</div>
                  <div class="location-tag">📍 ${m.location}</div>
                </div>
              </div>
              <div>
                <span class="badge ${m.isHome ? 'badge-win' : 'badge-role'}">${m.isHome ? 'HOME' : 'AWAY'}</span>
              </div>
              <div>
                ${m.status === 'COMPLETED' ? `
                  <div class="result-badge result-win">FINAL: ${m.score || ''}</div>
                ` : `
                  <div class="result-badge result-upcoming">UPCOMING</div>
                `}
              </div>
              ${isCoach ? `
                <div style="display:flex; gap:6px; margin-left: auto;">
                  <button class="btn-card-edit" style="padding:4px 10px; font-size:0.78rem;" onclick="app.openEditMatchModal('${m.id}')">✏️ Edit</button>
                  <button class="btn-card-delete" style="padding:4px 10px; font-size:0.78rem;" onclick="app.deleteMatch('${m.id}')">🗑️</button>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  openAddMatchModal() {
    // Clear form
    ['newMatchDate','newMatchTime','newMatchOpponent','newMatchLocation','newMatchScore'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const statusEl = document.getElementById('newMatchStatus');
    if (statusEl) statusEl.value = 'UPCOMING';
    const homeEl = document.getElementById('newMatchIsHome');
    if (homeEl) homeEl.value = 'true';

    const modal = document.getElementById('addMatchModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async addMatch(matchData) {
    const newMatch = {
      id: 'm_' + Date.now(),
      date: matchData.date.toUpperCase(),
      time: matchData.time,
      opponent: matchData.opponent,
      location: matchData.location,
      status: matchData.status,
      isHome: matchData.isHome === 'true',
      score: matchData.score || null,
      result: matchData.status === 'COMPLETED' ? (matchData.score || '') : null
    };

    this.data.schedule.push(newMatch);
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.upsertMatch('bhs', newMatch);
    }

    this.renderCurrentView();
    this.closeModals();
  }

  openEditMatchModal(matchId) {
    const match = this.data.schedule.find(m => m.id === matchId);
    if (!match) return;

    document.getElementById('editMatchId').value = match.id;
    document.getElementById('editMatchDate').value = match.date;
    document.getElementById('editMatchTime').value = match.time;
    document.getElementById('editMatchOpponent').value = match.opponent;
    document.getElementById('editMatchLocation').value = match.location;
    document.getElementById('editMatchStatus').value = match.status;
    document.getElementById('editMatchIsHome').value = String(match.isHome);
    document.getElementById('editMatchScore').value = match.score || '';

    const modal = document.getElementById('editMatchModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async saveEditMatch(matchData) {
    const idx = this.data.schedule.findIndex(m => m.id === matchData.id);
    if (idx !== -1) {
      const updated = {
        ...this.data.schedule[idx],
        date: matchData.date.toUpperCase(),
        time: matchData.time,
        opponent: matchData.opponent,
        location: matchData.location,
        status: matchData.status,
        isHome: matchData.isHome === 'true',
        score: matchData.score || null,
        result: matchData.status === 'COMPLETED' ? (matchData.score || '') : null
      };
      this.data.schedule[idx] = updated;
      this.saveData();

      if (window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.upsertMatch('bhs', updated);
      }

      this.renderCurrentView();
      this.closeModals();
    }
  }

  submitEditMatch() {
    const matchData = {
      id: document.getElementById('editMatchId').value,
      date: document.getElementById('editMatchDate').value,
      time: document.getElementById('editMatchTime').value,
      opponent: document.getElementById('editMatchOpponent').value,
      location: document.getElementById('editMatchLocation').value,
      status: document.getElementById('editMatchStatus').value,
      isHome: document.getElementById('editMatchIsHome').value,
      score: document.getElementById('editMatchScore').value
    };
    this.saveEditMatch(matchData);
  }

  async deleteMatch(matchId) {
    const match = this.data.schedule.find(m => m.id === matchId);
    if (!match) return;
    if (confirm(`Delete match vs ${match.opponent} on ${match.date}?`)) {
      this.data.schedule = this.data.schedule.filter(m => m.id !== matchId);
      this.saveData();

      if (window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.deleteMatch(matchId);
      }

      this.renderCurrentView();
    }
  }

  renderMatrixView() {
    const isCoach = window.auth.isCoach();

    return `
      <div class="container">
        <div class="portal-header">
          <div class="portal-title">
            <h2>🏆 ANSON DORRANCE COMPETITIVE MATRIX</h2>
            <p>Objective practice competition tracker modeling UNC legend Anson Dorrance's competitive rating system.</p>
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
                ${this.data.players.sort((a,b) => a.matrixStats.rank - b.matrixStats.rank).map(p => `
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

  renderPlannerView() {
    return `
      <div class="container">
        <div class="portal-header">
          <div class="portal-title">
            <h2>📋 COACH PRACTICE PLANNER</h2>
            <p>Design structured 90-minute high-intensity practice sessions with timed competitive drills.</p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-gold" onclick="app.openAddPlanDrillModal()">+ Add Drill to Plan</button>
            <button class="btn btn-primary" onclick="alert('Practice plan exported for printing.')">🖨️ Print / Save Plan</button>
            <button class="btn btn-secondary" onclick="app.openImportExportModal()">📂 Import / Export</button>
          </div>
        </div>

        <div class="planner-card">
          <h3 style="color: #FFF; margin-bottom: 16px;">TODAY'S PRACTICE TIMELINE</h3>
          ${this.data.currentPracticePlan.map((p, idx) => `
            <div class="drill-item">
              <div class="drill-info" style="flex: 1; padding-right: 20px;">
                <h4>${p.name}</h4>
                <p style="white-space: pre-wrap; margin-top: 4px; color: var(--bhs-silver); font-size: 0.85rem;">💡 <strong>Coach Focus & Notes:</strong>\n${p.coachNotes}</p>
              </div>
              <div style="display: flex; align-items: center; gap: 15px;">
                <div style="text-align: right;">
                  <div class="drill-duration">${p.duration}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${p.time}</div>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="app.openEditPlanDrillModal(${idx})">✏️ Edit</button>
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; background: rgba(239, 68, 68, 0.2); color: var(--color-danger); border-color: var(--color-danger);" onclick="app.deletePlanDrill(${idx})">🗑️</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  formatDuration(val) {
    if (!val) return '15 min';
    let trimmed = val.trim();
    // If it's a numeric string like "12", "18", or lacks min/hr suffix, append " min"
    if (/^\d+$/.test(trimmed) || (!trimmed.toLowerCase().includes('min') && !trimmed.toLowerCase().includes('hr'))) {
      return `${trimmed} min`;
    }
    return trimmed;
  }

  openAddPlanDrillModal() {
    const modal = document.getElementById('addPlanDrillModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async addPlanDrill(time, name, duration, coachNotes) {
    const formattedDuration = this.formatDuration(duration);
    const newDrill = { time, name, duration: formattedDuration, coachNotes };

    // Save to Supabase first to get the DB-assigned id
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      const saved = await window.supabaseService.savePracticePlanItem('bhs', newDrill);
      if (saved && saved.id) newDrill.id = saved.id;
    }

    this.data.currentPracticePlan.push(newDrill);
    this.saveData();
    this.renderCurrentView();
    this.closeModals();
  }

  openEditPlanDrillModal(index) {
    const drill = this.data.currentPracticePlan[index];
    if (!drill) return;

    document.getElementById('editDrillIndex').value = index;
    document.getElementById('editDrillTime').value = drill.time;
    document.getElementById('editDrillName').value = drill.name;
    document.getElementById('editDrillDuration').value = drill.duration;
    
    // Sync duration select dropdown
    const select = document.getElementById('editDrillDurationSelect');
    if (select) {
      const hasOption = Array.from(select.options).some(o => o.value === drill.duration);
      select.value = hasOption ? drill.duration : 'custom';
    }

    document.getElementById('editDrillNotes').value = drill.coachNotes;

    const modal = document.getElementById('editPlanDrillModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  submitEditPlanDrill() {
    const index = parseInt(document.getElementById('editDrillIndex').value);
    const time = document.getElementById('editDrillTime').value;
    const name = document.getElementById('editDrillName').value;
    const duration = document.getElementById('editDrillDuration').value;
    const coachNotes = document.getElementById('editDrillNotes').value;
    this.saveEditPlanDrill(index, time, name, duration, coachNotes);
  }

  async saveEditPlanDrill(index, time, name, duration, coachNotes) {
    if (this.data.currentPracticePlan[index]) {
      const formattedDuration = this.formatDuration(duration);
      const updated = { ...this.data.currentPracticePlan[index], time, name, duration: formattedDuration, coachNotes };
      this.data.currentPracticePlan[index] = updated;
      this.saveData();

      // Upsert to Supabase (uses existing id if present)
      if (window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.upsertPracticePlanItem('bhs', updated);
      }

      this.renderCurrentView();
      this.closeModals();
    }
  }

  async deletePlanDrill(index) {
    if (confirm('Are you sure you want to delete this drill from today\'s practice plan?')) {
      const drill = this.data.currentPracticePlan[index];
      this.data.currentPracticePlan.splice(index, 1);
      this.saveData();

      // Delete from Supabase using the drill's db id
      if (drill && drill.id && window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.deletePracticePlanItem(drill.id);
      }

      this.renderCurrentView();
    }
  }

  renderRestrictedAccess(featureName, reason) {
    return `
      <div class="container">
        <div class="restricted-box">
          <div class="restricted-icon">🔒</div>
          <h2 style="color: #FFF; margin-bottom: 8px;">RESTRICTED TEAM AREA</h2>
          <h4 style="color: var(--bhs-gold-accent); margin-bottom: 16px;">${featureName}</h4>
          <p class="text-muted" style="margin-bottom: 24px; font-size: 0.95rem;">${reason}</p>
          <button class="btn btn-primary" onclick="app.openAuthModal()">🔑 Sign In / Switch Role</button>
        </div>
      </div>
    `;
  }

  openAuthModal() {
    const modal = document.getElementById('authRoleModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  openPlayerModal(playerId) {
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) return;

    const canAccessRatings = window.auth.canAccessRatings();
    const modal = document.getElementById('playerDetailModal');
    const content = document.getElementById('playerDetailContent');
    
    if (!modal || !content) return;

    content.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${player.photo}" style="width: 120px; height: 120px; border-radius: 50%; border: 3px solid var(--bhs-blue-electric); object-fit: cover;" />
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
  }

  openAddDrillModal() {
    const modal = document.getElementById('addDrillScoreModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  // ─── Import / Export ─────────────────────────────────────────────────────

  openImportExportModal() {
    const modal = document.getElementById('importExportModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
    const status = document.getElementById('importStatus');
    if (status) status.textContent = '';
  }

  exportXLSX(type) {
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded yet — please wait a moment and try again.'); return; }
    const wb = XLSX.utils.book_new();

    if (type === 'players' || type === 'all') {
      const rows = this.data.players.map(p => ({
        Number: p.number, Name: p.name, Position: p.position,
        Class: p.classYear, Height: p.height || '',
        Goals: p.seasonStats.goals ?? '', Assists: p.seasonStats.assists ?? '',
        Saves: p.seasonStats.saves ?? '', CleanSheets: p.seasonStats.cleanSheets ?? '',
        Tech: p.ratings?.technical ?? '', Tactical: p.ratings?.tactical ?? '',
        Physical: p.ratings?.physical ?? '', Mental: p.ratings?.mental ?? '',
        Photo: p.photo || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Players');
    }

    if (type === 'schedule' || type === 'all') {
      const rows = this.data.schedule.map(m => ({
        Date: m.date, Time: m.time, Opponent: m.opponent,
        Location: m.location, Home: m.isHome ? 'Home' : 'Away',
        Status: m.status, Score: m.score || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Schedule');
    }

    if (type === 'plan' || type === 'all') {
      const rows = this.data.currentPracticePlan.map(d => ({
        TimeSlot: d.time, DrillName: d.name, Duration: d.duration, CoachNotes: d.coachNotes
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'PracticePlan');
    }

    const fileName = type === 'all' ? 'BHS_Soccer_AllData.xlsx' :
      type === 'players' ? 'BHS_Roster.xlsx' :
      type === 'schedule' ? 'BHS_Schedule.xlsx' : 'BHS_PracticePlan.xlsx';

    XLSX.writeFile(wb, fileName);
  }

  downloadTemplate(type) {
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded yet — please wait a moment and try again.'); return; }
    const wb = XLSX.utils.book_new();
    if (type === 'players') {
      const headers = [{ Number:'', Name:'', Position:'', Class:'', Height:'', Goals:'', Assists:'', Saves:'', CleanSheets:'', Tech:'', Tactical:'', Physical:'', Mental:'', Photo:'' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Players');
      XLSX.writeFile(wb, 'BHS_Player_Template.xlsx');
    } else if (type === 'schedule') {
      const headers = [{ Date:'', Time:'', Opponent:'', Location:'', Home:'Home or Away', Status:'UPCOMING or COMPLETED', Score:'' }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers), 'Schedule');
      XLSX.writeFile(wb, 'BHS_Schedule_Template.xlsx');
    }
  }

  async handleImportFile(file, target) {
    if (!file) return;
    const status = document.getElementById('importStatus');
    if (status) status.textContent = '⏳ Reading file...';

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let rows = [];
        if (file.name.endsWith('.csv')) {
          const text = e.target.result;
          const lines = text.trim().split('\n');
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          rows = lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h, i) => obj[h] = vals[i] || '');
            return obj;
          });
        } else {
          if (typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        }

        let count = 0;
        if (target === 'players') {
          const imported = rows.filter(r => r.Name).map(r => ({
            id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
            number: parseInt(r.Number) || 0,
            name: r.Name, position: r.Position || 'Midfielder',
            classYear: r.Class || '', height: r.Height || "5'10\"",
            photo: r.Photo || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
            seasonStats: r.Position?.includes('Goalkeeper')
              ? { saves: parseInt(r.Saves)||0, cleanSheets: parseInt(r.CleanSheets)||0, games: 1 }
              : { goals: parseInt(r.Goals)||0, assists: parseInt(r.Assists)||0, games: 1 },
            ratings: { technical: parseInt(r.Tech)||80, tactical: parseInt(r.Tactical)||80, physical: parseInt(r.Physical)||80, mental: parseInt(r.Mental)||80 },
            matrixStats: { wins: 0, losses: 0, points: 0, rank: 99, drillScore: 0 }
          }));
          this.data.players.push(...imported);
          count = imported.length;
          if (window.supabaseService?.isConfigured()) {
            for (const p of imported) await window.supabaseService.upsertPlayer('bhs', p);
          }
        } else if (target === 'schedule') {
          const imported = rows.filter(r => r.Opponent).map(r => ({
            id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
            date: (r.Date || '').toUpperCase(), time: r.Time || '6:00 PM',
            opponent: r.Opponent, location: r.Location || '',
            isHome: (r.Home || '').toLowerCase() !== 'away',
            status: (r.Status || 'UPCOMING').toUpperCase(),
            score: r.Score || null
          }));
          this.data.schedule.push(...imported);
          count = imported.length;
          if (window.supabaseService?.isConfigured()) {
            for (const m of imported) await window.supabaseService.upsertMatch('bhs', m);
          }
        } else if (target === 'plan') {
          const imported = rows.filter(r => r.DrillName).map(r => ({
            id: null, time: r.TimeSlot || '', name: r.DrillName,
            duration: r.Duration || '15 min', coachNotes: r.CoachNotes || ''
          }));
          this.data.currentPracticePlan.push(...imported);
          count = imported.length;
        }

        this.saveData();
        this.renderCurrentView();
        if (status) status.textContent = `✅ Successfully imported ${count} ${target} records!`;
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

  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.classList.remove('active');
      modal.style.display = '';
    });
  }

  attachDynamicListeners() {
    // Role switcher choices inside modal
    document.querySelectorAll('.role-switch-card').forEach(card => {
      card.addEventListener('click', () => {
        const userId = card.getAttribute('data-userid');
        window.auth.switchRole(userId);
        this.closeModals();
      });
    });
  }

  startCountdownTimer() {
    setInterval(() => {
      const minsEl = document.getElementById('cdMins');
      if (minsEl) {
        let current = parseInt(minsEl.textContent) || 30;
        current = current > 0 ? current - 1 : 59;
        minsEl.textContent = current < 10 ? '0' + current : current;
      }
    }, 60000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new BHSSoccerApp();
});
