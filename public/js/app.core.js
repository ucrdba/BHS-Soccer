/**
 * BHS Soccer - Core App Engine (BHSSoccerApp class)
 * Contains: constructor, init, data sync, auth, routing, category dropdowns.
 * Extracted from app.js during fix/refactor branch.
 */

class BHSSoccerApp {
  constructor() {
    this.data = this.loadData();
    this.currentView = 'home';
    this.activeFilter = 'ALL';
    this.diagrammer = new SoccerTacticalBoard(this);
    this.masterDiagrammer = new SoccerTacticalBoard(this);
    this.init();
  }

  loadData() {
    return {
      school: null,
      schools: [],
      players: [],
      schedule: [],
      drillsBank: [],
      currentPracticePlan: [],
      savedPlans: [],
      activePlanName: '',
      coaches: [],
      dailyThoughts: [],
      soccerCategories: [],
    };
  }

  saveData() {
    // Intentionally does nothing. Postgres is the source of truth: every mutation
    // already writes through supabaseService, and a reload repopulates via
    // syncFromSupabase(). loadData() no longer reads localStorage, so writing the
    // legacy `bhs_soccer_app_data` blob here would only recreate the key that
    // backupLegacyBlob() removes at boot. Per-collection caching under
    // bhs.cache.v1.* is the repository layer's job in the next phase.
  }

  async init() {
    await window.authReady;

    // supabase-js fires onAuthStateChange on its own schedule (TOKEN_REFRESHED,
    // and SIGNED_IN/INITIAL_SESSION when a tab regains visibility), not only on
    // user action as the previous fake auth did. renderCurrentView() replaces
    // innerHTML, which would wipe an in-progress practice plan or the tactical
    // canvas. Only react when the identity actually changed.
    const authKeyOf = (u) => (u ? `${u.id}:${u.role}:${u.status}` : 'none');
    let lastAuthKey = authKeyOf(window.auth.getCurrentUser());

    window.auth.subscribe((user) => {
      const key = authKeyOf(user);
      if (key === lastAuthKey) return;
      lastAuthKey = key;
      this.updateAuthUI();
      this.renderCurrentView();
    });

    this.bindEvents();
    this.updateAuthUI();
    this.populateCategoryDropdowns();
    this.renderCurrentView();
    this.startCountdownTimer();

    // Dynamically load live data from Supabase Cloud Database if configured
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await this.syncFromSupabase();
    }
  }

  async syncFromSupabase() {
    try {
      // Sync School Profile & Multi-tenant Schools list from Supabase DB
      const currentCode = this.data.school?.code || 'bhs';
      const dbSchool = await window.supabaseService.fetchSchool(currentCode);
      if (dbSchool) {
        this.data.school = {
          id: dbSchool.id,
          code: dbSchool.code,
          name: dbSchool.name,
          mascot: dbSchool.mascot,
          city: dbSchool.city,
          colors: dbSchool.colors || { primary: '#0047AB', secondary: '#FFD700' },
          record: dbSchool.record || { wins: 0, losses: 0, draws: 0 }
        };
      }

      const dbSchools = await window.supabaseService.fetchSchools();
      if (dbSchools && dbSchools.length > 0) {
        this.data.schools = dbSchools.map(s => ({
          id: s.id,
          code: s.code,
          name: s.name,
          mascot: s.mascot,
          city: s.city,
          colors: s.colors || { primary: '#0047AB', secondary: '#FFD700' },
          record: s.record || { wins: 0, losses: 0, draws: 0 }
        }));
      }

      const dbDrillsBank = await window.supabaseService.fetchDrillsBank('bhs');
      if (dbDrillsBank && dbDrillsBank.length > 0) {
        this.data.drillsBank = dbDrillsBank.map(d => ({
          id: d.id,
          name: d.name,
          duration: d.duration,
          category: d.category,
          points: d.points,
          coachNotes: d.coach_notes || '',
          diagramImage: d.diagram_image || null,
          diagramData: d.diagram_data || null
        }));
      }

      this.saveData();
      this.updateHeaderBranding();

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
        const planMap = {};

        dbPlans.forEach(plan => {
          const notes = plan.coach_notes || '';
          let planName = plan.name || 'Practice Plan';
          let drillName = plan.drill || plan.name || 'Soccer Drill';
          let cleanNotes = notes;

          const match = notes.match(/^\[Plan:\s*([^\]]+)\]\s*(.*)/i);
          if (match) {
            planName = match[1].trim();
            cleanNotes = match[2].trim();
          }

          if (planName) {
            if (!planMap[planName]) {
              planMap[planName] = {
                id: 'plan_db_' + planName.replace(/\s+/g, '_').toLowerCase(),
                name: planName,
                date: new Date(plan.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
                drills: []
              };
            }
            planMap[planName].drills.push({
              id: plan.id,
              time: plan.time_slot,
              name: drillName,
              duration: plan.duration,
              coachNotes: cleanNotes,
              diagramImage: plan.diagram_image || null,
              diagramData: plan.diagram_data || null
            });
          }
        });

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

      const dbCategories = await window.supabaseService.fetchSoccerCategories('bhs');
      if (dbCategories && dbCategories.length > 0) {
        this.data.soccerCategories = dbCategories.map(cat => ({
          id: cat.id,
          name: cat.name,
          description: cat.description || '',
          is_deleted: cat.is_deleted
        }));
      }

      console.log('⚡ Successfully loaded live data from Supabase Cloud!');
      this.populateCategoryDropdowns();
      this.renderCurrentView();
    } catch (e) {
      console.warn('Supabase data sync notice:', e);
    }
  }

  populateCategoryDropdowns() {
    if (!this.data.soccerCategories || !Array.isArray(this.data.soccerCategories) || this.data.soccerCategories.length === 0) {
      this.data.soccerCategories = [
        { id: 'cat_1', name: 'Tactical / Attacking', description: 'Drills focused on offensive build-up, 1v1 gauntlets, overlapping runs, counter-pressing, and finishing in the box.' },
        { id: 'cat_2', name: 'Defending / Pressing', description: 'Drills focusing on backline compact shape, high pressing triggers, defensive 1v1 containment, and tackling form.' },
        { id: 'cat_3', name: 'Technical / Passing', description: 'Drills highlighting ball control, quick 2-touch wall passes, weight of pass, and receiving under pressure.' },
        { id: 'cat_4', name: 'Physical / Conditioning', description: 'High-intensity fitness intervals, shuttle runs, agility ladder work, speed endurance, and core strength.' },
        { id: 'cat_5', name: 'Warmup & Rondo', description: 'Dynamic mobility warmups, 5v2 / 4v2 rondos, activation patterns, and touch refinement.' },
        { id: 'cat_6', name: 'Set Pieces / Penalty', description: 'Corner kick routines, free kick wall placement, long throw-ins, and penalty shootout practice.' }
      ];
    }

    const categories = this.data.soccerCategories;
    const masterSelect = document.getElementById('masterDrillFormCategory');
    if (masterSelect) {
      const currentVal = masterSelect.value;
      masterSelect.innerHTML = categories.map(c => 
        `<option value="${c.name}" title="${c.description}">${c.name}</option>`
      ).join('');
      if (currentVal && categories.some(c => c.name === currentVal)) {
        masterSelect.value = currentVal;
      }
      this.updateCategoryDescriptionTooltip(masterSelect.value, 'masterDrillCategoryDesc');
    }
  }

  updateCategoryDescriptionTooltip(categoryName, targetId = 'masterDrillCategoryDesc') {
    if (!categoryName) return;
    const categories = this.data.soccerCategories || [];
    const match = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      if (match && match.description) {
        targetEl.innerHTML = `💡 <strong>${match.name} DB Description:</strong> ${match.description}`;
      } else {
        targetEl.innerHTML = `Hover or select a category above to view database description.`;
      }
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
    const isGuest = !currentUser || currentUser.role === 'guest';
    const isCoachOrAdmin = window.auth.isCoach() || window.auth.isAdmin();
    const canAccessRatings = window.auth.canAccessRatings();

    const roleBadge = document.getElementById('navUserBadge');
    const roleName = document.getElementById('navUserName');
    
    if (roleBadge && roleName) {
      roleName.textContent = currentUser ? currentUser.name : 'Public Visitor';
      roleBadge.textContent = currentUser ? currentUser.role.toUpperCase() : 'GUEST';
      
      roleBadge.className = 'badge ';
      if (currentUser && currentUser.role === 'coach') roleBadge.classList.add('badge-coach');
      else if (currentUser && currentUser.role === 'admin') roleBadge.classList.add('badge-admin');
      else if (currentUser && currentUser.role === 'player') roleBadge.classList.add('badge-role');
      else roleBadge.classList.add('badge-win');
    }

    // Hide / Show Navigation Items based on Public Access vs Authenticated Role
    document.querySelectorAll('.nav-item').forEach(item => {
      const view = item.getAttribute('data-view');
      if (view === 'matrix') {
        item.style.display = canAccessRatings ? '' : 'none';
      } else if (view === 'planner') {
        item.style.display = isCoachOrAdmin ? '' : 'none';
      } else if (view === 'coaches') {
        item.style.display = isCoachOrAdmin ? '' : 'none';
      } else {
        item.style.display = '';
      }
    });

    // Single Primary Auth / Admin Control Button
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
      if (isGuest) {
        adminBtn.innerHTML = '🔑 Sign In / Register';
        adminBtn.className = 'btn btn-gold';
        adminBtn.onclick = () => this.openLoginModal();
      } else if (isCoachOrAdmin) {
        adminBtn.innerHTML = '⚙️ Admin Center';
        adminBtn.className = 'btn btn-gold';
        adminBtn.onclick = () => this.openAdminModal();
      } else {
        adminBtn.innerHTML = '👤 My Account';
        adminBtn.className = 'btn btn-secondary';
        adminBtn.onclick = () => this.openAdminModal();
      }
    }

    // Fallback to Home if guest attempts to view a restricted tab
    if (isGuest && (this.currentView === 'matrix' || this.currentView === 'planner' || this.currentView === 'coaches')) {
      this.switchView('home');
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
        setTimeout(() => {
          if (this.diagrammer) {
            this.diagrammer.init('soccerBoardCanvas');
            const selectedDrill = (this.data.currentPracticePlan || [])[this.selectedDrillIndex || 0];
            const masterDrill = (this.data.drillsBank || []).find(d => d.name.toLowerCase() === (selectedDrill?.name || '').toLowerCase());
            const targetData = selectedDrill?.diagramData || masterDrill?.diagramData;
            if (targetData) {
              this.diagrammer.loadDiagramData(targetData);
            }
          }
        }, 80);
      }
    } else if (this.currentView === 'coaches') {
      container.innerHTML = this.renderCoachesView();
    }
    
    this.attachDynamicListeners();
  }
}

// BHSSoccerApp class defined above. View modules below extend it via Object.assign.
