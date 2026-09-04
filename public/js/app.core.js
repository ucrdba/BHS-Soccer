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

// Which team the viewer is looking at. A per-device UI preference, so it lives
// in localStorage rather than in profiles — storing it server-side would mean a
// write on every switch.
const ACTIVE_TEAM_KEY = 'bhs_active_team_id';

class BHSSoccerApp {
  constructor() {
    this.data = this.loadData();
    this.currentView = 'home';
    this.activeFilter = 'ALL';
    this.activeTeamId = null;
    this.diagrammer = new SoccerTacticalBoard(this);
    this.masterDiagrammer = new SoccerTacticalBoard(this);
    this.init();
  }

  loadData() {
    return {
      school: null,
      schools: [],
      teams: [],
      players: [],
      schedule: [],
      matrixLogs: [],
      drillsBank: [],
      currentPracticePlan: [],
      savedPlans: [],
      quizQuestions: [],
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

  /**
   * How the active team should be named in page headings.
   *
   * Every heading used to be hardcoded to Beaumont Varsity, so a coach looking
   * at a club U16 roster read "BEAUMONT COUGARS ROSTER / 2026 Varsity Boys
   * Soccer Squad". The switcher groups by organization precisely because that
   * distinction matters, and then the heading contradicted it.
   *
   * Falls back to the school record when no team is resolved, so a signed-out
   * visitor mid-load never sees an empty heading.
   */
  activeTeamLabel() {
    const t = (this.data.teams || []).find(x => x.id === this.activeTeamId);
    const fallbackOrg = this.data.school?.name || 'Beaumont High School';
    if (!t) return { org: fallbackOrg, team: '', season: '' };
    return {
      org: t.school_name || fallbackOrg,
      team: t.name || '',
      season: t.season || ''
    };
  }

  /**
   * Bind the working practice plan to the team it came from.
   *
   * `currentPracticePlan` is not free-floating scratch: once a drill has been
   * written, it carries that team's practice_plans row id, and every later
   * edit upserts on that id with whatever activeTeamId happens to be current.
   * Tagging it is what lets syncFromSupabase tell "the same plan, re-synced"
   * from "another team's plan, still on screen".
   *
   * Called from loadPracticePlan, savePracticePlan and the two add-drill
   * paths -- everywhere the plan gains a database identity. A null activeTeamId
   * leaves it untagged, which is correct: nothing was written, so there are no
   * row ids to move.
   */
  tagWorkingPlanTeam() {
    this._workingPlanTeamId = this.activeTeamId || null;
  }

  clearWorkingPlan() {
    this.data.currentPracticePlan = [];
    this.data.activePlanName = '';
    this.selectedDrillIndex = undefined;
    this._workingPlanTeamId = null;
  }

  async setActiveTeam(teamId) {
    if (!teamId || teamId === this.activeTeamId) return;
    this.activeTeamId = teamId;
    try { localStorage.setItem(ACTIVE_TEAM_KEY, teamId); } catch (e) { /* private mode */ }

    // The working plan belongs to the team it was loaded from: its drills carry
    // that team's practice_plans row ids, and a later drill edit upserts on
    // those ids with the NEW team_id, moving rows between squads.
    //
    // The tag comparison in syncFromSupabase() would catch this too -- it is
    // the same condition -- but this stays explicit because the sync can throw
    // before it ever reaches that comparison (fetchTeamsForViewer is its first
    // await, and the whole body is inside one try/catch). activeTeamId has
    // already changed by then. A team switch the coach asked for must not
    // depend on a network call succeeding.
    //
    // savedPlans and dailyThoughts are rebuilt by the sync below and need no
    // clearing here.
    this.clearWorkingPlan();

    await this.syncFromSupabase();
    this.renderCurrentView();
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

      // Signing in changes WHICH DATA this person can see, not just how the
      // chrome is painted, so an auth change has to re-fetch. Before multi-team
      // nothing in this.data was user-scoped and a re-render was enough; now a
      // coach who signs in on a page that loaded signed-out would keep the
      // public default team and never see their own until they reloaded.
      if (window.supabaseService?.isConfigured()) {
        this.syncFromSupabase().catch(e => console.warn('Post-auth re-sync notice:', e));
      }
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
      // Every fetch below is scoped to one team, so resolve it first.
      this.data.teams = (await window.supabaseService.fetchTeamsForViewer()) || [];
      let stored = null;
      try { stored = localStorage.getItem(ACTIVE_TEAM_KEY); } catch (e) { /* private mode */ }
      const publicDefault = (this.data.teams.find(t => t.is_public_default) || {}).id || null;
      this.activeTeamId = window.resolveActiveTeam
        ? window.resolveActiveTeam(this.data.teams, stored, publicDefault)
        : ((this.data.teams[0] || {}).id || null);

      // A viewer with no team is legitimate -- and this branch is also reached
      // when fetchTeamsForViewer transiently fails, which is why it must not
      // gate the fetches below. school, schools, drillsBank, coaches and
      // soccerCategories are not team-scoped; a network blip on one table
      // should not blank all of them. practicePlans and dailyThoughts ARE
      // team-scoped, so they run inside the `if (hasTeam)` block below,
      // alongside roster/schedule/matrix, not out here.
      const hasTeam = !!this.activeTeamId;

      // The working plan belongs to one team (see tagWorkingPlanTeam). Its
      // drills carry that team's practice_plans row ids, and the next edit
      // upserts on those ids under whatever team is active now -- silently
      // moving the previous team's rows. So when the resolved team no longer
      // matches the tag, the plan on screen has to go.
      //
      // setActiveTeam already clears on an explicit switch. This catches the
      // route it cannot see: one user signs out and another signs in on the
      // same device, the auth subscriber re-syncs, and resolveActiveTeam lands
      // on a DIFFERENT team without setActiveTeam ever running.
      //
      // Deliberately NOT triggered when nothing resolved. That branch is also
      // reached when fetchTeamsForViewer transiently fails, and discarding a
      // coach's unsaved plan over a dropped packet is a bad trade for a guard
      // setActiveTeam already provides. With no resolved team there is nothing
      // to compare against, and every write path already refuses without a
      // team, so nothing can be corrupted while in that state.
      if (hasTeam && this._workingPlanTeamId && this._workingPlanTeamId !== this.activeTeamId) {
        this.clearWorkingPlan();
      }

      if (!hasTeam) {
        this.data.players = [];
        this.data.schedule = [];
        this.data.matrixLogs = [];
        this._sessions = [];
        // savedPlans and dailyThoughts are database-derived and must not bleed
        // across teams, so they clear with the rest. currentPracticePlan and
        // activePlanName deliberately do NOT: this branch is also reached on a
        // transient fetchTeamsForViewer failure, and a coach's unsaved work
        // should survive a dropped packet. The tag comparison above is what
        // discards it, and only once a DIFFERENT team has actually resolved.
        this.data.savedPlans = [];
        this.data.dailyThoughts = [];
        this.data.quizQuestions = [];
      }

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
          kind: s.kind || 'school',
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
          measure: d.measure || 'head_to_head',
          coachNotes: d.coach_notes || '',
          diagramImage: d.diagram_image || null,
          diagramData: d.diagram_data || null
        }));
      }

      this.saveData();
      this.updateHeaderBranding();

      // Team-scoped: skip when there is no active team so a transient
      // fetchTeamsForViewer failure doesn't throw trying to fetch with an
      // undefined teamId. hasTeam is false, the resulting empty collections
      // set above already stand.
      if (hasTeam) {
        const roster = await window.supabaseService.fetchTeamRoster(this.activeTeamId);
        this.data.players = (roster || []).map(m => ({
          id: m.players?.id,
          membershipId: m.id,
          // `name` is maintained by a database trigger from the two parts
          // (0016), and stays in state because the roster cards, Matrix
          // standings, planner and export all read it. The parts come along
          // for the roster editor, which edits them rather than the whole.
          name: m.players?.name,
          firstName: m.players?.first_name || '',
          lastName: m.players?.last_name || '',
          classYear: m.players?.class_year,
          height: m.players?.height,
          photo: m.players?.photo_url,
          number: m.number,
          // The paper-sheet number, distinct from the shirt number (0021).
          recordingNumber: m.recording_number,
          position: m.position,
          seasonStats: m.season_stats || {},
          ratings: m.ratings || {}
        })).filter(p => p.id);

        // Matrix standings are derived in Postgres from matrix_logs, not stored on
        // the player. Left-join them on: a player with no logged results produces
        // no standings row, and must still appear on the leaderboard as 0/0/0
        // rather than disappearing from it.
        //
        // The players mapping above (from fetchTeamRoster) sets no `matrixStats`
        // of its own — `matrix_stats` is a `players` column `0005` drops, and
        // per-team standings live in Postgres, derived from matrix_logs, not
        // stored on the player or the membership row. This block is what
        // populates `player.matrixStats` for the roster card and leaderboard.
        // Every scored line, so the leaderboard can be filtered to one
        // exercise without a second round trip when the coach picks one.
        this._exercisePoints =
          (await window.supabaseService.fetchTeamExercisePoints(this.activeTeamId)) || [];

        const dbStandings = await window.supabaseService.fetchMatrixStandings(this.activeTeamId);
        const standingsById = new Map((dbStandings || []).map(s => [s.player_id, s]));
        const unrankedFrom = (dbStandings || []).length + 1;

        this.data.players.forEach(p => {
          const s = standingsById.get(p.id);
          // Reads the new columns and falls back to the old ones. The view is
          // rewritten by migration 0009, and this code deploys BEFORE that is
          // applied — so for a short window it is reading the old shape. The
          // fallback is what makes that window render zeros rather than
          // `undefined`, and it costs one `??` per field.
          p.matrixStats = s
            ? {
                wins: s.wins || 0, draws: s.draws || 0, losses: s.losses || 0,
                games: s.games || 0,
                exercises: s.exercises ?? s.games ?? 0,
                earned: Number(s.earned ?? s.points ?? 0),
                available: Number(s.available ?? 0),
                share: (s.share ?? s.win_pct) === null || (s.share ?? s.win_pct) === undefined
                  ? null : Number(s.share ?? s.win_pct),
                rank: s.rank
              }
            : { wins: 0, draws: 0, losses: 0, games: 0, exercises: 0,
                earned: 0, available: 0, share: null, rank: unrankedFrom };
        });

        // The individual results behind those standings. Kept in state so a coach
        // can correct a mis-entered result: the standings view derives points from
        // these rows, so a leaderboard that cannot be corrected is a leaderboard
        // that is wrong forever. Stored snake_case as the database returns it —
        // the panel that renders it resolves player names against this.data.players.
        this.data.matrixLogs = (await window.supabaseService.fetchMatrixLogs(this.activeTeamId)) || [];

        // Sessions behind the standings, so a coach can delete a mis-entered
        // one. Same reasoning as keeping matrixLogs in state.
        this._sessions = (await window.supabaseService.fetchMatrixSessions(this.activeTeamId)) || [];

        // Assigned unconditionally, like the roster and matrix logs above: an
        // empty team must produce an empty schedule. Guarding this on
        // `dbSchedule.length > 0` let a team switch leave the previous team's
        // fixtures in place — Varsity's schedule rendering under JV's name
        // after switching to an empty JV team.
        const dbSchedule = await window.supabaseService.fetchSchedule(this.activeTeamId);
        this.data.schedule = (dbSchedule || []).map(s => ({
          id: s.id,
          date: s.match_date,
          time: s.match_time,
          // Derived by a database trigger from the two above, and null when
          // the text would not parse. Used for comparing and ordering; the
          // text columns remain what the site displays.
          matchOn: s.match_on || null,
          kickoffTime: s.kickoff_time || null,
          opponent: s.opponent,
          location: s.location,
          venueAddress: s.venue_address || null,
          status: s.status,
          isHome: s.is_home,
          score: s.score,
          result: s.result
        }));

        // Moved inside the team branch: practicePlans and dailyThoughts are
        // now team-scoped (see the comment above `hasTeam`), so they must
        // run only once activeTeamId is known, same as roster/schedule/matrix.
        //
        // Rebuilt, not merged, and assigned unconditionally -- exactly like the
        // schedule above, and for the same reason. Guarding on
        // `dbPlans.length > 0` and merging into `this.data.savedPlans` let a
        // team switch leave the previous team's plans in the picker: after
        // 0014, JV and the club teams have zero plan rows, so the first switch
        // out of Varsity showed Varsity's plans under JV's name. Worse than a
        // display bug -- loading one of those leaked plans copies Varsity's
        // practice_plans row ids into `currentPracticePlan`, and the next drill
        // edit upserts on those ids with JV's team_id, MOVING Varsity's rows.
        // An empty team must produce an empty plan list. Do not reintroduce
        // the guard.
        const dbPlans = await window.supabaseService.fetchPracticePlans(this.activeTeamId);
        {
          const planMap = {};

          (dbPlans || []).forEach(plan => {
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

          // The active team's plans ARE the saved plans -- no merge with
          // whatever the previously active team left behind.
          this.data.savedPlans = Object.values(planMap);
        }

        // Assigned unconditionally for the same reason as the plans above: a
        // team with no daily_thoughts rows must show no coaching message, not
        // the previous team's. `daily_thoughts` is empty by construction after
        // 0014, so every team starts here.
        // The questions this squad is asked. Team-scoped like the rest of the
        // planner: the bank belongs to the organization and each team picks
        // from it, so this must run once activeTeamId is known.
        this.data.quizQuestions = (await window.supabaseService.fetchTeamQuiz(this.activeTeamId)) || [];

        const dbThoughts = await window.supabaseService.fetchDailyThoughts(this.activeTeamId);
        this.data.dailyThoughts = (dbThoughts || []).map(t => ({
          id: t.id,
          coachId: t.coach_id,
          coachName: t.coach_name || '',
          // Short name a quiz question can point at (0018), and what the
          // edit form pre-fills.
          title: t.title || '',
          text: t.thoughts_text,
          isActive: !!t.is_active,
          createdAt: new Date(t.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
        }));
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
    // A drawer left open over the page it just navigated to reads as a bug.
    if (this.closeNavMenu) this.closeNavMenu();
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
    } else if (this.currentView === 'help') {
      container.innerHTML = this.renderHelpView();
      // The index, search and highlighting need the elements to exist, so they
      // are wired after innerHTML lands -- the same reason the planner branch
      // re-initialises the tactical canvas on a timeout.
      setTimeout(() => this.initHelpView(), 0);

    } else if (this.currentView === 'coaches') {
      container.innerHTML = this.renderCoachesView();
    }

    const switcherMount = document.getElementById('teamSwitcherMount');
    if (switcherMount) switcherMount.innerHTML = this.renderTeamSwitcher();

    this.attachDynamicListeners();
  }
}

// BHSSoccerApp class defined above. View modules below extend it via Object.assign.
