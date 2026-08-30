/**
 * BHS Soccer - Core App Engine (BHSSoccerApp class)
 * Contains: constructor, init, data sync, auth, routing, category dropdowns.
 * Extracted from app.js during fix/refactor branch.
 */

/**
 * Placeholder shown when a player has no photo.
 *
 * Lives under public/ rather than assets/ on purpose. Vite only emits assets it
 * can see referenced from index.html, so a runtime path like
 * "assets/profile.png" resolves in dev and 404s in a production build.
 * Everything under public/ is copied verbatim to the dist root, which is the
 * same mechanism that makes public/js/*.js work.
 *
 * Generated from assets/profile.png: transparent margins trimmed, squared,
 * resized to 192px and stored as grey+alpha — every pixel is black, so the RGB
 * channels were redundant. 758 KB -> 20 KB.
 */
const PLAYER_SILHOUETTE = 'img/player-placeholder.png';

/**
 * The same figure in the coaching palette — navy ground, gold figure — so a
 * coach without a photo is distinguishable at a glance from a player without
 * one, and sits inside the gold border the coach cards already use.
 */
const COACH_SILHOUETTE = 'img/coach-placeholder.png';

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

  /**
   * Merge imported rows into a collection, keyed on name, so re-importing the
   * same file updates records instead of duplicating them.
   *
   * Matching is trimmed and case-insensitive: " john smith " matches "John Smith".
   *
   * On a match the EXISTING id is kept. That is what makes the write an update
   * rather than an insert — the Supabase upsert helpers only send an id when it
   * is a real UUID, so a locally-generated id like "p_1724..." always inserts.
   *
   * A column the sheet omits — or leaves empty — is not written to an existing
   * record: only keys the file actually supplied reach `target[prop]` below, so
   * a sheet of just Name + Goals updates scores without clearing positions,
   * ratings or photos. `defaults` is applied only when a row is newly inserted
   * (never on an update), so a wholly missing sheet still produces a complete
   * new record. One consequence: a blank Photo cell can never clear a stored
   * photo — clearing a field requires writing an explicit empty value some
   * other way, not omitting the column.
   *
   * When a matched record's existing value and the incoming value are both
   * plain objects (e.g. `seasonStats`), they are merged key-by-key rather than
   * replaced wholesale: incoming keys overwrite (unless blank), but stored keys
   * the sheet doesn't mention survive. That's what lets a `Name + Goals` sheet
   * update `goals` on a matched player without wiping `seasonStats.games`.
   * Arrays and non-plain values still replace wholesale.
   *
   * Returns the records to persist, plus counts for the status line.
   */
  upsertByKey(collection, incoming, keyOf, defaults) {
    const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
    const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
    const isPlainObject = (v) =>
      v != null && typeof v === 'object' && !Array.isArray(v);
    const keyFor = (rec) => {
      const k = keyOf(rec);
      return Array.isArray(k) ? k.map(norm).join('|') : norm(k);
    };
    const applyDefaults = (row) => {
      if (defaults) {
        for (const [prop, v] of Object.entries(defaults)) {
          if (row[prop] === undefined) {
            // Clone plain-object/array defaults so every inserted row gets its
            // own copy — otherwise every record inserted in one import shares
            // the same object reference, and one in-place edit silently
            // changes several records at once.
            row[prop] = (v != null && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
          }
        }
      }
      return row;
    };

    const index = new Map();
    collection.forEach((existing, i) => {
      const k = keyFor(existing);
      if (k && k.replace(/\|/g, '')) index.set(k, i);
    });

    const toPersist = [];
    let updated = 0, inserted = 0;

    for (const row of incoming) {
      const k = keyFor(row);
      if (!k || !k.replace(/\|/g, '')) {
        // Blank key: can't match an existing record, and must not be indexed —
        // indexing it would make every later blank-key row merge into this one.
        applyDefaults(row);
        collection.push(row);
        toPersist.push(row);
        inserted++;
        continue;
      }
      const idx = index.get(k);
      if (idx === undefined) {
        applyDefaults(row);
        collection.push(row);
        index.set(k, collection.length - 1);
        toPersist.push(row);
        inserted++;
        continue;
      }
      const target = collection[idx];
      for (const [prop, v] of Object.entries(row)) {
        if (prop === 'id' || blank(v)) continue;   // never let an import rewrite the id
        if (isPlainObject(v) && isPlainObject(target[prop])) {
          // Merge one level deep so stored keys the sheet doesn't mention
          // (e.g. seasonStats.games) survive instead of being wiped by a
          // wholesale replacement.
          const merged = { ...target[prop] };
          for (const [k, mv] of Object.entries(v)) {
            if (!blank(mv)) merged[k] = mv;
          }
          target[prop] = merged;
        } else {
          target[prop] = v;
        }
      }
      toPersist.push(target);
      updated++;
    }

    return { toPersist, updated, inserted };
  }

  /** Records identified by a single name column: players, coaches, drills, profiles. */
  upsertByName(collection, incoming, defaults) {
    return this.upsertByKey(collection, incoming, (r) => (r ? r.name : ''), defaults);
  }

  /**
   * Fixtures are identified by when they kick off, not by opponent — a season
   * can meet the same opponent home and away.
   */
  upsertByDateTime(collection, incoming, defaults) {
    return this.upsertByKey(collection, incoming, (r) => (r ? [r.date, r.time] : ['', '']), defaults);
  }

  /**
   * A player's photo, or the silhouette placeholder when none is set.
   * Treats null, undefined and whitespace-only strings alike — imports and
   * manual edits all leave photo_url as an empty string rather than null.
   */
  photoOrPlaceholder(url, kind = 'player') {
    if (url && String(url).trim()) return url;
    return kind === 'coach' ? COACH_SILHOUETTE : PLAYER_SILHOUETTE;
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

      // Matrix standings are derived in Postgres from matrix_logs, not stored on
      // the player. Left-join them on: a player with no logged results produces
      // no standings row, and must still appear on the leaderboard as 0/0/0
      // rather than disappearing from it.
      //
      // This supersedes the `matrixStats: p.matrix_stats || {}` assignment in the
      // players mapping above (app.core.js:234). Leave that line alone — it is
      // retained only so `player.matrixStats` stays populated for the roster
      // card and leaderboard between syncs; the `matrix_stats` column itself is
      // unread elsewhere (the players export does not touch it) and is slated
      // to be dropped in Phase 2. This block simply overwrites the in-memory
      // value with the derived one.
      const dbStandings = await window.supabaseService.fetchMatrixStandings('bhs');
      const standingsById = new Map((dbStandings || []).map(s => [s.player_id, s]));
      const unrankedFrom = (dbStandings || []).length + 1;

      this.data.players.forEach(p => {
        const s = standingsById.get(p.id);
        p.matrixStats = s
          ? {
              wins: s.wins || 0, draws: s.draws || 0, losses: s.losses || 0,
              games: s.games || 0, points: s.points || 0,
              winPct: s.win_pct === null || s.win_pct === undefined ? null : Number(s.win_pct),
              rank: s.rank
            }
          : { wins: 0, draws: 0, losses: 0, games: 0, points: 0, winPct: null, rank: unrankedFrom };
      });

      // The individual results behind those standings. Kept in state so a coach
      // can correct a mis-entered result: the standings view derives points from
      // these rows, so a leaderboard that cannot be corrected is a leaderboard
      // that is wrong forever. Stored snake_case as the database returns it —
      // the panel that renders it resolves player names against this.data.players.
      this.data.matrixLogs = (await window.supabaseService.fetchMatrixLogs('bhs')) || [];

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
          coachName: t.coach_name || '',
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
    const categories = this.data.soccerCategories || [];
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
