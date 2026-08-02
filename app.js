/**
 * Beaumont High School Cougars Soccer - Core Application Engine
 * Includes Public Roster/Schedule, Competitive Matrix, & Practice Planner
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
    { id: 'd1', name: '1v1 Gauntlet (Continuous)', duration: '20 min', category: 'Competitive Matrix 1v1', points: 3 },
    { id: 'd2', name: '2v2 Flying Scrimmage with Bumpers', duration: '25 min', category: 'Small Sided', points: 3 },
    { id: 'd3', name: 'Finishing under High Pressure', duration: '15 min', category: 'Technical / Shooting', points: 2 },
    { id: 'd4', name: '12-Minute Cooper Fitness Test', duration: '15 min', category: 'Physical Conditioning', points: 5 },
    { id: 'd5', name: '7v7 Tactical Match Play', duration: '30 min', category: 'Full Scrimmage', points: 3 }
  ],
  currentPracticePlan: [
    { time: '0:00 - 0:15', name: 'Dynamic Warmup & Rondo (5v2)', duration: '15 min', coachNotes: 'Focus on 1-touch speed & communication' },
    { time: '0:15 - 0:35', name: '1v1 Gauntlet (Continuous)', duration: '20 min', coachNotes: 'Log 1v1 win/loss scores into Matrix' },
    { time: '0:35 - 1:00', name: '2v2 Flying Scrimmage with Bumpers', duration: '25 min', coachNotes: 'High intensity transition' },
    { time: '1:00 - 1:25', name: '7v7 Tactical Match Play', duration: '25 min', coachNotes: 'Applying press triggers' },
    { time: '1:25 - 1:30', name: 'Cool Down & Matrix Leaderboard Review', duration: '5 min', coachNotes: 'Announce Competitor of the Day' }
  ],
  savedPlans: [
    {
      id: 'plan_default_1',
      name: 'Standard Varsity 90-Min High Intensity',
      date: 'AUG 1, 2026',
      drills: [
        { time: '0:00 - 0:15', name: 'Dynamic Warmup & Rondo (5v2)', duration: '15 min', coachNotes: 'Focus on 1-touch speed & communication' },
        { time: '0:15 - 0:35', name: '1v1 Gauntlet (Continuous)', duration: '20 min', coachNotes: 'Log 1v1 win/loss scores into Matrix' },
        { time: '0:35 - 1:00', name: '2v2 Flying Scrimmage with Bumpers', duration: '25 min', coachNotes: 'High intensity transition' },
        { time: '1:00 - 1:25', name: '7v7 Tactical Match Play', duration: '25 min', coachNotes: 'Applying press triggers' },
        { time: '1:25 - 1:30', name: 'Cool Down & Matrix Leaderboard Review', duration: '5 min', coachNotes: 'Announce Competitor of the Day' }
      ]
    }
  ],
  activePlanName: 'Standard Varsity 90-Min High Intensity',
  coaches: [
    {
      id: 'c1',
      name: 'Coach Bob Miller',
      level: 'Boys Varsity Head Coach',
      phone: '(951) 555-0199',
      address: '39139 Cherry Valley Blvd, Beaumont, CA 92223',
      email: 'bob.miller@bhs-cougars.org',
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      bio: 'Head Varsity Soccer Coach entering 8th season at Beaumont High School.'
    },
    {
      id: 'c2',
      name: 'Coach Dave Ramirez',
      level: 'JV Head Coach / Assistant Varsity',
      phone: '(951) 555-0188',
      address: '39139 Cherry Valley Blvd, Beaumont, CA 92223',
      email: 'dave.ramirez@bhs-cougars.org',
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      bio: 'JV Head Coach focusing on tactical development, pressing triggers, and player progression.'
    }
  ],
  dailyThoughts: [
    {
      id: 'dt1',
      coachId: 'c1',
      coachName: 'Coach Bob Miller',
      text: 'Focus on high-intensity transition, quick 1-touch ball circulation, and aggressive pressing triggers ahead of our upcoming Citrus Belt League match. Hydrate well and bring maximum energy to practice today!',
      isActive: true,
      createdAt: 'AUG 2, 2026'
    }
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
    let data = DEFAULT_BHS_DATA;
    const saved = localStorage.getItem('bhs_soccer_app_data');
    if (saved) {
      try { data = JSON.parse(saved); } catch (e) { data = DEFAULT_BHS_DATA; }
    }
    if (!data.savedPlans) data.savedPlans = DEFAULT_BHS_DATA.savedPlans;
    if (!data.activePlanName) data.activePlanName = DEFAULT_BHS_DATA.activePlanName;
    if (!data.coaches || !Array.isArray(data.coaches) || data.coaches.length === 0) data.coaches = DEFAULT_BHS_DATA.coaches;
    if (!data.dailyThoughts || !Array.isArray(data.dailyThoughts) || data.dailyThoughts.length === 0) {
      data.dailyThoughts = DEFAULT_BHS_DATA.dailyThoughts;
    }
    return data;
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
        const timelineDrills = [];
        const planMap = {};

        dbPlans.forEach(plan => {
          const notes = plan.coach_notes || '';
          const match = notes.match(/^\[Plan:\s*([^\]]+)\]\s*(.*)/i);
          if (match) {
            const planName = match[1].trim();
            const cleanNotes = match[2].trim();
            if (!planMap[planName]) {
              planMap[planName] = {
                id: 'plan_db_' + planName.replace(/\s+/g, '_'),
                name: planName,
                date: new Date(plan.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
                drills: []
              };
            }
            planMap[planName].drills.push({
              id: plan.id,
              time: plan.time_slot,
              name: plan.name,
              duration: plan.duration,
              coachNotes: cleanNotes
            });
          } else {
            timelineDrills.push({
              id: plan.id,
              time: plan.time_slot,
              name: plan.name,
              duration: plan.duration,
              coachNotes: notes
            });
          }
        });

        if (timelineDrills.length > 0) {
          this.data.currentPracticePlan = timelineDrills;
        }

        // Merge DB saved plans into local savedPlans
        Object.values(planMap).forEach(dbPlan => {
          if (!this.data.savedPlans) this.data.savedPlans = [];
          const idx = this.data.savedPlans.findIndex(sp => sp.name.toLowerCase() === dbPlan.name.toLowerCase());
          if (idx !== -1) {
            this.data.savedPlans[idx] = dbPlan;
          } else {
            this.data.savedPlans.push(dbPlan);
          }
        });
      }

      const dbCoaches = await window.supabaseService.fetchCoaches('bhs');
      if (dbCoaches && dbCoaches.length > 0) {
        this.data.coaches = dbCoaches.map(c => ({
          id: c.id,
          name: c.name,
          level: c.level,
          phone: c.phone,
          address: c.address,
          email: c.email,
          photo: c.photo_url,
          bio: c.bio
        }));
      }

      const dbThoughts = await window.supabaseService.fetchDailyThoughts('bhs');
      if (dbThoughts && dbThoughts.length > 0) {
        this.data.dailyThoughts = dbThoughts.map(t => ({
          id: t.id,
          coachId: t.coach_id,
          coachName: t.coach_name || 'Coach Bob Miller',
          text: t.thoughts_text,
          isActive: !!t.is_active,
          createdAt: new Date(t.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
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
    } else if (this.currentView === 'coaches') {
      container.innerHTML = this.renderCoachesView();
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

    // Next upcoming match & countdown
    const nextMatch = this.data.schedule.find(m => m.status !== 'COMPLETED');
    const countdown = this.getNextMatchCountdown();
    const cdDaysStr = countdown ? countdown.days : '00';
    const cdHoursStr = countdown ? countdown.hours : '00';
    const cdMinsStr = countdown ? countdown.mins : '00';

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
        <!-- Side-by-Side: Coach's Daily Thoughts (Left) & Season Spotlight (Right) -->
        <div style="display: grid; grid-template-columns: minmax(300px, 360px) 1fr; gap: 24px; margin-bottom: 50px; align-items: stretch;">
          <!-- Left Column: Coach's Thoughts For The Day -->
          <div class="player-card" style="padding: 24px; background: linear-gradient(145deg, rgba(0, 71, 171, 0.25), rgba(15, 23, 42, 0.85)); border: 1px solid var(--bhs-gold-accent); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--bhs-navy-border); padding-bottom: 10px;">
                <h3 style="color: var(--bhs-gold-accent); margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                  <span>💡</span> COACH'S DAILY THOUGHTS
                </h3>
                ${(window.auth.isCoach() || window.auth.isAdmin()) ? `<button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;" onclick="app.openManageThoughtsModal()">⚙️ Manage</button>` : ''}
              </div>
              <p style="color: #FFF; font-size: 0.93rem; line-height: 1.65; white-space: pre-wrap; margin: 0;">${activeThought.text}</p>
            </div>
            <div style="margin-top: 20px; pt-10; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.78rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
              <span>— ${activeThought.coachName || 'Coach Bob Miller'}</span>
              <span class="badge badge-coach">HEAD COACH</span>
            </div>
          </div>

          <!-- Right Column: Season Spotlight Stats Grid -->
          <div>
            <div class="section-header" style="margin-bottom: 16px;">
              <div>
                <h2 class="section-title">SEASON SPOTLIGHT</h2>
                <p class="text-muted">Beaumont Cougars 2026 Campaign Record</p>
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
    const savedCount = (this.data.savedPlans || []).length;
    const activeName = this.data.activePlanName || 'Standard Practice Session';

    // Compute total session duration in minutes
    let totalMinutes = 0;
    (this.data.currentPracticePlan || []).forEach(p => {
      const match = (p.duration || '').match(/(\d+)/);
      if (match) {
        totalMinutes += parseInt(match[1]);
      }
    });

    let totalTimeStr = `${totalMinutes} min`;
    if (totalMinutes >= 60) {
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      totalTimeStr = `${totalMinutes} min (${hrs} hr${hrs > 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''})`;
    }

    return `
      <div class="container">
        <div class="portal-header">
          <div class="portal-title">
            <h2>📋 COACH PRACTICE PLANNER</h2>
            <p>Design practice sessions, prompt &amp; save named plans to database, and reload past sessions anytime.</p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-gold" onclick="app.openAddPlanDrillModal()">+ Add Drill to Plan</button>
            <button class="btn btn-gold" onclick="app.openSavePlanModal()">💾 Save Practice Plan</button>
            <button class="btn btn-primary" onclick="app.openLoadPlanModal()">📂 Saved Plans Database (${savedCount})</button>
            <button class="btn btn-primary" onclick="app.printPracticePlan()">🖨️ Print Practice Plan</button>
            <button class="btn btn-secondary" onclick="app.downloadPracticePlan('html')">📥 Save/Download Plan File</button>
          </div>
        </div>

        <div class="planner-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; border-bottom: 1px solid var(--bhs-navy-border); padding-bottom: 14px;">
            <div>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                <h3 style="color: #FFF; margin: 0;">TODAY'S PRACTICE TIMELINE</h3>
                <span class="badge badge-coach">ACTIVE PLAN</span>
              </div>
              <div style="color: var(--bhs-gold-accent); font-size: 0.95rem; font-weight: 700;">
                "${activeName}"
              </div>
            </div>
            <div style="display: flex; gap: 16px; align-items: center; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--bhs-navy-border); padding: 8px 16px; border-radius: 8px; font-size: 0.85rem;">
              <div>
                <span class="text-muted" style="font-size:0.72rem; display:block;">TOTAL SESSION TIME</span>
                <strong style="color: var(--bhs-cyan-accent); font-size: 1.05rem;">⏱️ ${totalTimeStr}</strong>
              </div>
              <div style="border-left: 1px solid var(--bhs-navy-border); padding-left: 16px;">
                <span class="text-muted" style="font-size:0.72rem; display:block;">TOTAL DRILLS</span>
                <strong style="color: #FFF; font-size: 1.05rem;">⚽ ${this.data.currentPracticePlan.length} Drills</strong>
              </div>
            </div>
          </div>

          ${this.data.currentPracticePlan.length === 0 ? `
            <div style="text-align:center; padding:30px; color:var(--text-muted);">
              <p style="font-size:1rem; margin-bottom:8px;">Today's practice timeline is currently empty.</p>
              <p style="font-size:0.85rem;">Click <strong>+ Add Drill to Plan</strong> above or <strong>📂 Saved Plans Database</strong> to load a session.</p>
            </div>
          ` : this.data.currentPracticePlan.map((p, idx) => `
            <div class="drill-item">
              <div class="drill-info" style="flex: 1; padding-right: 20px;">
                <h4>${p.name}</h4>
                <p style="white-space: pre-wrap; margin-top: 4px; color: var(--bhs-silver); font-size: 0.85rem;">💡 <strong>Coach Focus &amp; Notes:</strong>\n${p.coachNotes}</p>
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
    `;
  }

  getActiveThought() {
    const thoughts = this.data.dailyThoughts || [];
    return thoughts.find(t => t.isActive) || thoughts[0] || {
      id: 'dt_default',
      coachId: 'c1',
      coachName: 'Coach Bob Miller',
      text: 'No coach thoughts entered for today.',
      isActive: true
    };
  }

  openManageThoughtsModal() {
    this.renderThoughtsList();
    const modal = document.getElementById('manageThoughtsModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  renderThoughtsList() {
    const container = document.getElementById('thoughtsListContainer');
    if (!container) return;

    const thoughts = this.data.dailyThoughts || [];
    if (thoughts.length === 0) {
      container.innerHTML = `<p class="text-muted" style="text-align: center; padding: 20px;">No daily thoughts recorded yet. Click <strong>+ Add New Thought</strong> above to create one!</p>`;
      return;
    }

    container.innerHTML = thoughts.map(t => `
      <div style="background: rgba(0,0,0,0.3); border: ${t.isActive ? '2px solid var(--bhs-gold-accent)' : '1px solid var(--bhs-navy-border)'}; border-radius: 8px; padding: 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="color: #FFF;">— ${t.coachName || 'Coach Bob Miller'}</strong>
            ${t.isActive ? '<span class="badge badge-gold">🟢 ACTIVE</span>' : '<span class="badge badge-secondary" style="font-size:0.7rem;">ARCHIVED</span>'}
          </div>
          <div style="display:flex; gap:6px;">
            ${!t.isActive ? `<button class="btn btn-secondary" style="padding:3px 8px; font-size:0.75rem;" onclick="app.setActiveThought('${t.id}')">⭐ Set Active</button>` : ''}
            <button class="btn btn-primary" style="padding:3px 8px; font-size:0.75rem;" onclick="app.openEditThoughtFormModal('${t.id}')">✏️ Edit</button>
            <button class="btn btn-secondary" style="padding:3px 8px; font-size:0.75rem; background:rgba(239,68,68,0.2); color:var(--color-danger); border-color:var(--color-danger);" onclick="app.deleteThought('${t.id}')">🗑️ Delete</button>
          </div>
        </div>
        <p style="color: #DDD; font-size: 0.88rem; line-height: 1.5; margin: 0; white-space: pre-wrap;">${t.text}</p>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 8px;">Posted: ${t.createdAt || 'Recent'}</div>
      </div>
    `).join('');
  }

  openAddThoughtModal() {
    const currentUser = window.auth.getCurrentUser();
    document.getElementById('thoughtEditId').value = '';
    document.getElementById('thoughtFormModalTitle').textContent = '➕ ADD NEW DAILY THOUGHT';
    document.getElementById('thoughtCoachNameInput').value = (currentUser && currentUser.name) ? currentUser.name : 'Coach Bob Miller';
    document.getElementById('thoughtTextInput').value = '';
    document.getElementById('thoughtIsActiveInput').checked = true;

    const modal = document.getElementById('editThoughtFormModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  openEditThoughtFormModal(thoughtId) {
    const thought = (this.data.dailyThoughts || []).find(t => t.id === thoughtId);
    if (!thought) return;

    document.getElementById('thoughtEditId').value = thought.id;
    document.getElementById('thoughtFormModalTitle').textContent = '✏️ EDIT DAILY THOUGHT';
    document.getElementById('thoughtCoachNameInput').value = thought.coachName || 'Coach Bob Miller';
    document.getElementById('thoughtTextInput').value = thought.text || '';
    document.getElementById('thoughtIsActiveInput').checked = !!thought.isActive;

    const modal = document.getElementById('editThoughtFormModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async submitThoughtForm() {
    const id = document.getElementById('thoughtEditId').value;
    const coachName = document.getElementById('thoughtCoachNameInput').value.trim() || 'Coach Bob Miller';
    const text = document.getElementById('thoughtTextInput').value.trim();
    const isActive = document.getElementById('thoughtIsActiveInput').checked;

    if (!text) { alert('Please enter daily thoughts text.'); return; }

    const currentUser = window.auth.getCurrentUser();
    const coachId = (currentUser && currentUser.id) ? currentUser.id : 'c1';

    if (isActive) {
      (this.data.dailyThoughts || []).forEach(t => t.isActive = false);
    }

    let targetThought = null;
    if (id) {
      targetThought = (this.data.dailyThoughts || []).find(t => t.id === id);
      if (targetThought) {
        targetThought.coachName = coachName;
        targetThought.text = text;
        targetThought.isActive = isActive;
      }
    } else {
      targetThought = {
        id: 'dt_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        coachId: coachId,
        coachName: coachName,
        text: text,
        isActive: isActive,
        createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
      };
      if (!this.data.dailyThoughts) this.data.dailyThoughts = [];
      this.data.dailyThoughts.unshift(targetThought);
    }

    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      if (isActive) {
        await window.supabaseService.setActiveDailyThought('bhs', targetThought.id);
      }
      await window.supabaseService.upsertDailyThought('bhs', {
        id: targetThought.id,
        coachId: coachId,
        coachName: coachName,
        text: text,
        isActive: isActive
      });
    }

    this.renderThoughtsList();
    this.renderCurrentView();
    const formModal = document.getElementById('editThoughtFormModal');
    if (formModal) { formModal.style.display = 'none'; formModal.classList.remove('active'); }
    alert('✅ Daily thought saved successfully!');
  }

  async setActiveThought(thoughtId) {
    (this.data.dailyThoughts || []).forEach(t => {
      t.isActive = (t.id === thoughtId);
    });
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.setActiveDailyThought('bhs', thoughtId);
    }

    this.renderThoughtsList();
    this.renderCurrentView();
  }

  async deleteThought(thoughtId) {
    if (!confirm('Are you sure you want to delete this daily thought entry?')) return;

    this.data.dailyThoughts = (this.data.dailyThoughts || []).filter(t => t.id !== thoughtId);
    if (this.data.dailyThoughts.length > 0 && !this.data.dailyThoughts.some(t => t.isActive)) {
      this.data.dailyThoughts[0].isActive = true;
    }

    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.deleteDailyThought(thoughtId);
    }

    this.renderThoughtsList();
    this.renderCurrentView();
  }

  renderCoachesView() {
    const isCoach = window.auth.isCoach();
    const coaches = this.data.coaches || [];

    return `
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">BEAUMONT COUGARS COACHING STAFF</h2>
            <p class="text-muted">Leadership, tactical direction &amp; player development team</p>
          </div>
          ${isCoach ? `<button class="btn btn-gold" onclick="app.openAddCoachModal()">+ Add New Coach</button>` : ''}
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
          ${coaches.map(c => `
            <div class="player-card" style="padding: 24px; position: relative;">
              ${isCoach ? `
                <div style="position: absolute; top: 15px; right: 15px; display: flex; gap: 6px;">
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="app.openEditCoachModal('${c.id}')">✏️ Edit</button>
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; background: rgba(239, 68, 68, 0.2); color: var(--color-danger); border-color: var(--color-danger);" onclick="app.deleteCoach('${c.id}')">🗑️</button>
                </div>
              ` : ''}

              <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                <img src="${c.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--bhs-gold-accent); object-fit: cover;" alt="${c.name}" />
                <div>
                  <h3 style="color: #FFF; font-size: 1.25rem; margin-bottom: 4px;">${c.name}</h3>
                  <span class="badge badge-coach">${c.level}</span>
                </div>
              </div>

              <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.88rem; color: var(--bhs-silver); margin-bottom: 16px;">
                <div>📞 <strong>Phone:</strong> <a href="tel:${c.phone}" style="color: var(--bhs-cyan-accent); text-decoration: none;">${c.phone}</a></div>
                <div>✉️ <strong>Email:</strong> <a href="mailto:${c.email}" style="color: var(--bhs-cyan-accent); text-decoration: none;">${c.email}</a></div>
                <div>📍 <strong>Address / Location:</strong> ${c.address}</div>
              </div>

              ${c.bio ? `
                <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 12px; border-radius: 8px; font-size: 0.83rem; color: var(--text-muted); line-height: 1.5;">
                  📝 <strong>Bio:</strong> ${c.bio}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  openAddCoachModal() {
    const modal = document.getElementById('addCoachModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async addCoach(data) {
    const newCoach = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      name: data.name.trim(),
      level: data.level.trim(),
      phone: data.phone.trim(),
      address: data.address.trim(),
      email: data.email.trim(),
      photo: data.photo?.trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      bio: data.bio?.trim() || ''
    };

    if (!this.data.coaches) this.data.coaches = [];
    this.data.coaches.push(newCoach);
    this.saveData();

    if (window.supabaseService?.isConfigured()) {
      const saved = await window.supabaseService.upsertCoach('bhs', newCoach);
      if (saved && saved.id) newCoach.id = saved.id;
    }

    this.renderCurrentView();
    this.closeModals();
    alert(`✅ Coach "${newCoach.name}" added to coaching staff successfully!`);
  }

  openEditCoachModal(coachId) {
    const coach = (this.data.coaches || []).find(c => c.id === coachId);
    if (!coach) return;

    document.getElementById('editCoachId').value = coach.id;
    document.getElementById('editCoachName').value = coach.name;
    document.getElementById('editCoachLevel').value = coach.level;
    document.getElementById('editCoachPhone').value = coach.phone;
    document.getElementById('editCoachEmail').value = coach.email;
    document.getElementById('editCoachAddress').value = coach.address;
    document.getElementById('editCoachPhoto').value = coach.photo;
    document.getElementById('editCoachBio').value = coach.bio || '';

    const modal = document.getElementById('editCoachModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async submitEditCoach() {
    const id = document.getElementById('editCoachId').value;
    const index = (this.data.coaches || []).findIndex(c => c.id === id);
    if (index === -1) return;

    const updated = {
      ...this.data.coaches[index],
      name: document.getElementById('editCoachName').value.trim(),
      level: document.getElementById('editCoachLevel').value.trim(),
      phone: document.getElementById('editCoachPhone').value.trim(),
      email: document.getElementById('editCoachEmail').value.trim(),
      address: document.getElementById('editCoachAddress').value.trim(),
      photo: document.getElementById('editCoachPhoto').value.trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      bio: document.getElementById('editCoachBio').value.trim()
    };

    this.data.coaches[index] = updated;
    this.saveData();

    if (window.supabaseService?.isConfigured()) {
      await window.supabaseService.upsertCoach('bhs', updated);
    }

    this.renderCurrentView();
    this.closeModals();
    alert(`✅ Coach profile updated for "${updated.name}"!`);
  }

  async deleteCoach(coachId) {
    const coach = (this.data.coaches || []).find(c => c.id === coachId);
    if (!coach) return;

    if (confirm(`Are you sure you want to remove "${coach.name}" from the coaching staff?`)) {
      this.data.coaches = (this.data.coaches || []).filter(c => c.id !== coachId);
      this.saveData();

      if (window.supabaseService?.isConfigured()) {
        await window.supabaseService.deleteCoach(coachId);
      }

      this.renderCurrentView();
    }
  }

  openSavePlanModal() {
    if (!this.data.currentPracticePlan || this.data.currentPracticePlan.length === 0) {
      alert('Your current practice timeline is empty. Add at least one drill to the plan before saving.');
      return;
    }
    const input = document.getElementById('savePlanNameInput');
    if (input) {
      input.value = this.data.activePlanName || `Practice Plan - ${new Date().toLocaleDateString()}`;
      setTimeout(() => { input.focus(); input.select(); }, 150);
    }
    const modal = document.getElementById('savePlanModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  async savePracticePlan(planName, triggerDownload = true) {
    if (!planName || !planName.trim()) {
      alert('Please enter a valid name for the practice plan.');
      return;
    }
    const cleanName = planName.trim();
    if (!this.data.savedPlans) this.data.savedPlans = [];
    const existingIndex = this.data.savedPlans.findIndex(p => p.name.toLowerCase() === cleanName.toLowerCase());

    const planObj = {
      id: existingIndex !== -1 ? this.data.savedPlans[existingIndex].id : 'plan_' + Date.now(),
      name: cleanName,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
      drills: JSON.parse(JSON.stringify(this.data.currentPracticePlan))
    };

    if (existingIndex !== -1) {
      this.data.savedPlans[existingIndex] = planObj;
    } else {
      this.data.savedPlans.push(planObj);
    }

    this.data.activePlanName = cleanName;
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.saveFullPracticePlan('bhs', cleanName, planObj.drills);
    }

    this.renderCurrentView();
    this.closeModals();

    if (triggerDownload) {
      // Trigger native browser File Save dialog with Filename Box prefilled with cleanName
      this.downloadPracticePlan('html');
    } else {
      alert(`✅ Practice Plan "${cleanName}" saved to database successfully!`);
    }
  }

  openLoadPlanModal() {
    const container = document.getElementById('savedPlansContainer');
    const saved = this.data.savedPlans || [];

    if (container) {
      if (saved.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:30px; color:var(--text-muted);">
            <p style="font-size:1.1rem; margin-bottom:8px;">No saved practice plans found.</p>
            <p style="font-size:0.85rem;">Add drills to today's timeline and click <strong>💾 Save Practice Plan</strong> to record custom plans here.</p>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:12px; max-height:420px; overflow-y:auto; padding-right:4px;">
            ${saved.map(p => `
              <div style="background:var(--bhs-navy-card); border:1px solid var(--bhs-navy-border); border-radius:10px; padding:16px; display:flex; justify-content:space-between; align-items:center; gap:15px; flex-wrap:wrap;">
                <div>
                  <h4 style="color:#FFF; margin-bottom:4px;">${p.name}</h4>
                  <div style="font-size:0.8rem; color:var(--text-muted);">
                    📅 Saved: ${p.date || 'Recently'} &nbsp;·&nbsp; ⚽ Drills: <strong>${p.drills ? p.drills.length : 0}</strong>
                  </div>
                  <div style="font-size:0.75rem; color:var(--bhs-cyan-accent); margin-top:4px;">
                    ${(p.drills || []).map(d => d.name).slice(0, 3).join(', ')}${(p.drills || []).length > 3 ? '...' : ''}
                  </div>
                </div>
                <div style="display:flex; gap:8px;">
                  <button class="btn btn-gold" style="padding:6px 12px; font-size:0.82rem;" onclick="app.loadPracticePlan('${p.id}')">⚡ Load Plan</button>
                  <button class="btn btn-secondary" style="padding:6px 10px; font-size:0.82rem; background:rgba(239, 68, 68, 0.2); color:var(--color-danger); border-color:var(--color-danger);" onclick="app.deleteSavedPlan('${p.id}')">🗑️</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    const modal = document.getElementById('loadPlanModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  loadPracticePlan(planId) {
    const plan = (this.data.savedPlans || []).find(p => p.id === planId);
    if (!plan) return;

    if (confirm(`Load practice plan "${plan.name}"? This will replace today's practice timeline with the ${plan.drills.length} drills from this plan.`)) {
      this.data.currentPracticePlan = JSON.parse(JSON.stringify(plan.drills));
      this.data.activePlanName = plan.name;
      this.saveData();
      this.renderCurrentView();
      this.closeModals();
    }
  }

  deleteSavedPlan(planId) {
    const plan = (this.data.savedPlans || []).find(p => p.id === planId);
    if (!plan) return;

    if (confirm(`Are you sure you want to delete the saved plan "${plan.name}"?`)) {
      this.data.savedPlans = (this.data.savedPlans || []).filter(p => p.id !== planId);
      this.saveData();
      this.openLoadPlanModal();
    }
  }

  printPracticePlan() {
    const activeName = this.data.activePlanName || 'Standard Practice Session';
    const plan = this.data.currentPracticePlan || [];

    if (plan.length === 0) {
      alert('Your current practice timeline is empty. Add at least one drill to the plan before printing.');
      return;
    }

    let totalMinutes = 0;
    plan.forEach(p => {
      const match = (p.duration || '').match(/(\d+)/);
      if (match) totalMinutes += parseInt(match[1]);
    });

    let totalTimeStr = `${totalMinutes} min`;
    if (totalMinutes >= 60) {
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      totalTimeStr = `${totalMinutes} min (${hrs} hr${hrs > 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''})`;
    }

    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; color: #111827; line-height: 1.5; }
    .header { border-bottom: 3px solid #0047AB; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .header h1 { margin: 0; font-size: 20px; color: #0047AB; letter-spacing: 0.5px; }
    .header h2 { margin: 4px 0 0 0; font-size: 15px; color: #374151; font-weight: 600; }
    .meta { font-size: 12px; color: #4B5563; text-align: right; }
    .summary-bar { background: #F3F4F6; border: 1px solid #E5E7EB; padding: 10px 16px; border-radius: 6px; margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #1F2937; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #0047AB; color: #FFFFFF; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 12px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: top; font-size: 13px; }
    tr:nth-child(even) { background: #F9FAFB; }
    .time-col { width: 120px; font-weight: bold; color: #0047AB; }
    .dur-col { width: 90px; font-weight: bold; text-align: center; color: #111827; }
    .notes { margin-top: 6px; color: #374151; font-size: 12px; white-space: pre-wrap; background: #FFF; padding: 6px 8px; border-left: 3px solid #0047AB; }
    .footer { margin-top: 35px; border-top: 1px solid #E5E7EB; padding-top: 10px; font-size: 11px; color: #6B7280; text-align: center; }
    @media print {
      body { margin: 15px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>BEAUMONT HIGH SCHOOL COUGARS SOCCER</h1>
      <h2>OFFICIAL PRACTICE TIMELINE & DRILL PLAN</h2>
    </div>
    <div class="meta">
      <div><strong>Date:</strong> ${dateStr}</div>
      <div><strong>Plan Name:</strong> "${activeName}"</div>
    </div>
  </div>

  <div class="summary-bar">
    <div>⏱️ Total Time: ${totalTimeStr}</div>
    <div>⚽ Total Drills: ${plan.length}</div>
    <div>📍 Location: Cougar Stadium Practice Field</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="time-col">TIME SLOT</th>
        <th>DRILL NAME & COACH FOCUS NOTES</th>
        <th class="dur-col">DURATION</th>
      </tr>
    </thead>
    <tbody>
      ${plan.map(d => `
        <tr>
          <td class="time-col">${d.time || ''}</td>
          <td>
            <strong>${d.name}</strong>
            ${d.coachNotes ? `<div class="notes">💡 <strong>Coach Focus & Notes:</strong><br/>${d.coachNotes}</div>` : ''}
          </td>
          <td class="dur-col">${d.duration}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    Beaumont High School Athletics &bull; Boys Varsity Soccer Command Center
  </div>

  <script>
    document.title = ${JSON.stringify(activeName)};
    window.onload = function() {
      document.title = ${JSON.stringify(activeName)};
      setTimeout(function() {
        document.title = ${JSON.stringify(activeName)};
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const printWin = window.open(url, '_blank', 'width=850,height=950');

    if (!printWin) {
      const origTitle = document.title;
      document.title = activeName;
      window.print();
      setTimeout(() => { document.title = origTitle; }, 3000);
    }
  }

  downloadPracticePlan(format = 'html') {
    const activeName = this.data.activePlanName || 'Standard Practice Session';
    const plan = this.data.currentPracticePlan || [];

    if (plan.length === 0) {
      alert('Your current practice timeline is empty. Add at least one drill to the plan before downloading.');
      return;
    }

    const safeFileName = activeName.replace(/[/\\?%*:|"<>]/g, '_');

    if (format === 'xlsx') {
      this.exportXLSX('plan');
      return;
    }

    let totalMinutes = 0;
    plan.forEach(p => {
      const match = (p.duration || '').match(/(\d+)/);
      if (match) totalMinutes += parseInt(match[1]);
    });

    let totalTimeStr = `${totalMinutes} min`;
    if (totalMinutes >= 60) {
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      totalTimeStr = `${totalMinutes} min (${hrs} hr${hrs > 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''})`;
    }

    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; color: #111827; line-height: 1.5; }
    .header { border-bottom: 3px solid #0047AB; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .header h1 { margin: 0; font-size: 20px; color: #0047AB; letter-spacing: 0.5px; }
    .header h2 { margin: 4px 0 0 0; font-size: 15px; color: #374151; font-weight: 600; }
    .meta { font-size: 12px; color: #4B5563; text-align: right; }
    .summary-bar { background: #F3F4F6; border: 1px solid #E5E7EB; padding: 10px 16px; border-radius: 6px; margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #1F2937; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #0047AB; color: #FFFFFF; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 12px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: top; font-size: 13px; }
    tr:nth-child(even) { background: #F9FAFB; }
    .time-col { width: 120px; font-weight: bold; color: #0047AB; }
    .dur-col { width: 90px; font-weight: bold; text-align: center; color: #111827; }
    .notes { margin-top: 6px; color: #374151; font-size: 12px; white-space: pre-wrap; background: #FFF; padding: 6px 8px; border-left: 3px solid #0047AB; }
    .footer { margin-top: 35px; border-top: 1px solid #E5E7EB; padding-top: 10px; font-size: 11px; color: #6B7280; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>BEAUMONT HIGH SCHOOL COUGARS SOCCER</h1>
      <h2>OFFICIAL PRACTICE TIMELINE & DRILL PLAN</h2>
    </div>
    <div class="meta">
      <div><strong>Date:</strong> ${dateStr}</div>
      <div><strong>Plan Name:</strong> "${activeName}"</div>
    </div>
  </div>

  <div class="summary-bar">
    <div>⏱️ Total Time: ${totalTimeStr}</div>
    <div>⚽ Total Drills: ${plan.length}</div>
    <div>📍 Location: Cougar Stadium Practice Field</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="time-col">TIME SLOT</th>
        <th>DRILL NAME & COACH FOCUS NOTES</th>
        <th class="dur-col">DURATION</th>
      </tr>
    </thead>
    <tbody>
      ${plan.map(d => `
        <tr>
          <td class="time-col">${d.time || ''}</td>
          <td>
            <strong>${d.name}</strong>
            ${d.coachNotes ? `<div class="notes">💡 <strong>Coach Focus & Notes:</strong><br/>${d.coachNotes}</div>` : ''}
          </td>
          <td class="dur-col">${d.duration}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    Beaumont High School Athletics &bull; Boys Varsity Soccer Command Center
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${safeFileName}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    this.openAdminModal();
  }

  renderAdminModalContent() {
    const currentUser = window.auth.getCurrentUser();

    const sampleUsers = [
      { id: 'user_coach_bob', name: 'Coach Bob', role: 'Coach', icon: '👔', desc: 'Head Coach: full practice planning, match crud, roster & ratings' },
      { id: 'user_admin_sam', name: 'Admin Sam', role: 'Admin', icon: '⚡', desc: 'Athletic Director: full system & administrative control' },
      { id: 'user_player_alex', name: 'Alex Rivera (#10)', role: 'Player', icon: '⚽', desc: 'Varsity Player: roster viewing, schedule & ratings matrix' },
      { id: 'user_guest', name: 'Public Visitor', role: 'Guest', icon: '👤', desc: 'Fan / Public: public matches, schedule & basic team bios' }
    ];

    const container = document.getElementById('adminModalContent');
    if (!container) return;

    const isCoachOrAdmin = window.auth.isCoach() || window.auth.isAdmin();

    container.innerHTML = `
      <!-- Section 1: Role Switcher -->
      <div style="margin-bottom: 24px;">
        <h4 style="color: var(--bhs-gold-accent); margin-bottom: 12px; display:flex; align-items:center; gap:8px;">
          <span>🔑</span> SWITCH ACTIVE ROLE / USER ACCOUNT
        </h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          ${sampleUsers.map(u => {
            const isActive = currentUser && currentUser.id === u.id;
            return `
              <div onclick="app.switchUserRole('${u.id}')" style="cursor: pointer; background: ${isActive ? 'rgba(0, 71, 171, 0.35)' : 'rgba(0, 0, 0, 0.25)'}; border: ${isActive ? '2px solid var(--bhs-gold-accent)' : '1px solid var(--bhs-navy-border)'}; border-radius: 8px; padding: 12px; transition: all 0.2s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <strong style="color: #FFF; font-size: 0.95rem;">${u.icon} ${u.name}</strong>
                  ${isActive ? `<span class="badge badge-gold">ACTIVE</span>` : `<span class="badge badge-secondary" style="font-size:0.7rem;">SWITCH</span>`}
                </div>
                <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.3;">${u.desc}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <hr style="border-color: var(--bhs-navy-border); margin: 20px 0;" />

      <!-- Section 2: Import & Export Data -->
      <div style="margin-bottom: 24px;">
        <h4 style="color: var(--bhs-gold-accent); margin-bottom: 12px; display:flex; align-items:center; gap:8px;">
          <span>📂</span> IMPORT &amp; EXPORT DATA (CSV / EXCEL)
        </h4>

        ${!isCoachOrAdmin ? `
          <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid var(--color-danger); padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; color: #FFF; margin-bottom: 12px;">
            🔒 File import/export actions are reserved for Coach and Admin roles. Switch to <strong>Coach Bob</strong> or <strong>Admin Sam</strong> above to enable full import/export functions.
          </div>
        ` : ''}

        <!-- Export Data Card with Dropdown -->
        <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px; border-radius: 8px; margin-bottom: 16px;">
          <h5 style="color: var(--bhs-gold-accent); margin-bottom: 8px;">📊 Export Data to Excel (.xlsx)</h5>
          <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 12px;">
            Select data table or full workbook to generate Excel file download.
          </p>

          <div style="display: flex; gap: 10px; align-items: center;">
            <select id="exportTarget" class="form-control" style="flex:1;" ${!isCoachOrAdmin ? 'disabled' : ''}>
              <option value="players">👥 Players / Roster</option>
              <option value="schedule">📅 Schedule &amp; Results</option>
              <option value="plan">📋 Practice Plan</option>
              <option value="coaches">👔 Coaching Staff</option>
              <option value="all">📦 All Data (Single Workbook)</option>
            </select>
            <button class="btn btn-gold" onclick="app.exportXLSX(document.getElementById('exportTarget').value)" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📊 Export Selected Data</button>
          </div>
        </div>

        <!-- Import Data Card with Dropdown -->
        <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px; border-radius: 8px;">
          <h5 style="color: var(--bhs-cyan-accent); margin-bottom: 8px;">📥 Import Data from CSV or Excel</h5>
          <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 12px;">
            Download a template first, fill in your data, then upload.
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
            <button class="btn btn-secondary" onclick="app.downloadTemplate('players')" style="font-size:0.8rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Player Template</button>
            <button class="btn btn-secondary" onclick="app.downloadTemplate('schedule')" style="font-size:0.8rem;" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📄 Schedule Template</button>
          </div>

          <div style="display: flex; gap: 10px; align-items: center;">
            <select id="importTarget" class="form-control" style="flex:1;" ${!isCoachOrAdmin ? 'disabled' : ''}>
              <option value="players">👥 Players / Roster</option>
              <option value="schedule">📅 Schedule &amp; Results</option>
              <option value="plan">📋 Practice Plan</option>
            </select>
            <button class="btn btn-gold" onclick="document.getElementById('importFileInput').click()" ${!isCoachOrAdmin ? 'disabled style="opacity:0.5;"' : ''}>📂 Choose &amp; Import</button>
          </div>
          <input type="file" id="importFileInput" accept=".csv,.xlsx,.xls" style="display:none;"
            onchange="app.handleImportFile(this.files[0], document.getElementById('importTarget').value); this.value='';" />
          <div id="importStatus" style="margin-top:10px; font-size:0.85rem; color: var(--color-success);"></div>
        </div>
      </div>

      <hr style="border-color: var(--bhs-navy-border); margin: 20px 0;" />

      <!-- Section 3: System & Cloud Database Controls -->
      <div>
        <h4 style="color: var(--bhs-cyan-accent); margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
          <span>⚡</span> SYSTEM &amp; CLOUD DATABASE
        </h4>
        <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.2); padding:10px 14px; border-radius:6px; font-size:0.85rem;">
          <div>
            <strong>Cloud Sync Status:</strong> <span style="color: var(--color-success);">Connected to Supabase</span>
          </div>
          <button class="btn btn-secondary" style="padding: 4px 10px; font-size:0.8rem;" onclick="app.syncFromSupabase(); alert('✅ Synced latest data from Supabase Cloud!');">🔄 Reload Cloud Data</button>
        </div>
      </div>
    `;
  }

  switchUserRole(userId) {
    window.auth.switchRole(userId);
    this.renderAdminModalContent();
    this.renderCurrentView();
  }

  openAdminModal() {
    this.renderAdminModalContent();
    const modal = document.getElementById('adminModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

  openImportExportModal() {
    this.openAdminModal();
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

    if (type === 'coaches' || type === 'all') {
      const rows = (this.data.coaches || []).map(c => ({
        Name: c.name, Level: c.level, Phone: c.phone || '',
        Email: c.email || '', Address: c.address || '', Bio: c.bio || '', Photo: c.photo || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Coaches');
    }

    const planNameClean = (this.data.activePlanName || 'PracticePlan').replace(/[/\\?%*:|"<>]/g, '_');
    const fileName = type === 'all' ? 'BHS_Soccer_AllData.xlsx' :
      type === 'players' ? 'BHS_Roster.xlsx' :
      type === 'schedule' ? 'BHS_Schedule.xlsx' :
      type === 'coaches' ? 'BHS_Coaching_Staff.xlsx' : `${planNameClean}.xlsx`;

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

        const toStr = (v) => String(v ?? '').trim();
        let count = 0;

        if (target === 'players') {
          const imported = rows.filter(r => r.Name).map(r => ({
            id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
            number: parseInt(r.Number) || 0,
            name: toStr(r.Name), position: toStr(r.Position) || 'Midfielder',
            classYear: toStr(r.Class) || 'Junior', height: toStr(r.Height) || "5'10\"",
            photo: toStr(r.Photo) || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
            seasonStats: toStr(r.Position).includes('Goalkeeper')
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
            date: toStr(r.Date).toUpperCase(),
            time: toStr(r.Time) || '6:00 PM',
            opponent: toStr(r.Opponent),
            location: toStr(r.Location) || 'Home - Cougar Stadium',
            isHome: toStr(r.Home).toLowerCase() !== 'away',
            status: (toStr(r.Status) || 'UPCOMING').toUpperCase(),
            score: toStr(r.Score) || null
          }));
          this.data.schedule.push(...imported);
          count = imported.length;
          if (window.supabaseService?.isConfigured()) {
            for (const m of imported) await window.supabaseService.upsertMatch('bhs', m);
          }
        } else if (target === 'plan') {
          const imported = rows.filter(r => r.DrillName || r.name).map(r => ({
            id: null,
            time: toStr(r.TimeSlot || r.time),
            name: toStr(r.DrillName || r.name),
            duration: toStr(r.Duration || r.duration) || '15 min',
            coachNotes: toStr(r.CoachNotes || r.coachNotes)
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

  parseMatchDateTime(dateStr, timeStr) {
    if (!dateStr) return null;
    const combined = `${dateStr} ${timeStr || ''}`.trim();
    const parsed = new Date(combined);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    try {
      const months = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
      const parts = dateStr.replace(/,/g, '').split(/\s+/);
      if (parts.length >= 3) {
        const monthIndex = months[parts[0].substring(0,3).toUpperCase()];
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        let hours = 18, minutes = 0;
        if (timeStr) {
          const timeMatch = timeStr.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
          if (timeMatch) {
            hours = parseInt(timeMatch[1]);
            minutes = parseInt(timeMatch[2] || 0);
            const ampm = (timeMatch[3] || '').toUpperCase();
            if (ampm === 'PM' && hours < 12) hours += 12;
            if (ampm === 'AM' && hours === 12) hours = 0;
          }
        }
        if (monthIndex !== undefined && !isNaN(day) && !isNaN(year)) {
          return new Date(year, monthIndex, day, hours, minutes);
        }
      }
    } catch(e) {}
    return null;
  }

  getNextMatchCountdown() {
    const nextMatch = this.data.schedule.find(m => m.status !== 'COMPLETED');
    if (!nextMatch) return null;

    const targetDate = this.parseMatchDateTime(nextMatch.date, nextMatch.time);
    if (!targetDate) return null;

    const now = new Date();
    const diffMs = targetDate - now;

    if (diffMs <= 0) {
      return { days: '00', hours: '00', mins: '00' };
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);

    return {
      days: String(days).padStart(2, '0'),
      hours: String(hours).padStart(2, '0'),
      mins: String(mins).padStart(2, '0')
    };
  }

  updateCountdownUI() {
    const daysEl = document.getElementById('cdDays');
    const hoursEl = document.getElementById('cdHours');
    const minsEl = document.getElementById('cdMins');

    if (daysEl && hoursEl && minsEl) {
      const countdown = this.getNextMatchCountdown();
      if (countdown) {
        daysEl.textContent = countdown.days;
        hoursEl.textContent = countdown.hours;
        minsEl.textContent = countdown.mins;
      } else {
        daysEl.textContent = '00';
        hoursEl.textContent = '00';
        minsEl.textContent = '00';
      }
    }
  }

  startCountdownTimer() {
    this.updateCountdownUI();
    setInterval(() => {
      this.updateCountdownUI();
    }, 10000);
  }
}

function initApp() {
  if (!window.app) {
    window.app = new BHSSoccerApp();
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initApp();
} else {
  document.addEventListener('DOMContentLoaded', initApp);
}
