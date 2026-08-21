/**
 * BHS Soccer - Core App Engine (BHSSoccerApp class)
 * Contains: constructor, init, data sync, auth, routing, category dropdowns.
 *
 * Converted from js/app.core.js. Other modules extend this class's prototype
 * (Object.assign(BHSSoccerApp.prototype, {...})) and declare-merge their
 * method signatures onto the `BHSSoccerApp` interface below, exactly the way
 * src/views/*.view.ts and src/utils.ts already do.
 */

import type { AppData, SoccerCategory, DailyThought } from './types';
import { auth } from './auth';
import { DEFAULT_BHS_DATA } from './data';
import { SoccerTacticalBoard } from './diagrammer';
import './globals';

export class BHSSoccerApp {
  data: AppData;
  currentView: string;
  activeFilter: string;
  diagrammer: SoccerTacticalBoard;
  masterDiagrammer: SoccerTacticalBoard;
  selectedDrillIndex?: number;

  constructor() {
    this.data = this.loadData();
    this.currentView = 'home';
    this.activeFilter = 'ALL';
    this.diagrammer = new SoccerTacticalBoard(this);
    this.masterDiagrammer = new SoccerTacticalBoard(this);
    this.init();
  }

  loadData(): AppData {
    let data: AppData = DEFAULT_BHS_DATA;
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
    if (!data.soccerCategories || !Array.isArray(data.soccerCategories) || data.soccerCategories.length === 0) {
      data.soccerCategories = DEFAULT_BHS_DATA.soccerCategories;
    }
    return data;
  }

  saveData(): void {
    localStorage.setItem('bhs_soccer_app_data', JSON.stringify(this.data));
  }

  async init(): Promise<void> {
    await auth.init();

    auth.subscribe(() => {
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

  async syncFromSupabase(): Promise<void> {
    const supabaseService = window.supabaseService;
    if (!supabaseService) return;

    try {
      // Sync School Profile & Multi-tenant Schools list from Supabase DB
      const currentCode = this.data.school?.code || 'bhs';
      const dbSchool = await supabaseService.fetchSchool(currentCode);
      if (dbSchool) {
        this.data.school = {
          id: dbSchool.id!,
          code: dbSchool.code!,
          name: dbSchool.name!,
          mascot: dbSchool.mascot!,
          city: dbSchool.city!,
          colors: dbSchool.colors || { primary: '#0047AB', secondary: '#FFD700' },
          record: dbSchool.record || { wins: 0, losses: 0, draws: 0 }
        };
      }

      const dbSchools = await supabaseService.fetchSchools();
      if (dbSchools && dbSchools.length > 0) {
        this.data.schools = dbSchools.map(s => ({
          id: s.id!,
          code: s.code!,
          name: s.name!,
          mascot: s.mascot!,
          city: s.city!,
          colors: s.colors || { primary: '#0047AB', secondary: '#FFD700' },
          record: s.record || { wins: 0, losses: 0, draws: 0 }
        }));
      }

      const dbDrillsBank = await supabaseService.fetchDrillsBank('bhs');
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

      const dbPlayers = await supabaseService.fetchPlayers('bhs');
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

      const dbSchedule = await supabaseService.fetchSchedule('bhs');
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

      const dbPlans = await supabaseService.fetchPracticePlans('bhs');
      if (dbPlans && dbPlans.length > 0) {
        const planMap: Record<string, AppData['savedPlans'][number]> = {};

        dbPlans.forEach(plan => {
          const notes = plan.coach_notes || '';
          let planName = plan.name || 'Practice Plan';
          const drillName = plan.drill || plan.name || 'Soccer Drill';
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

      const dbCoaches = await supabaseService.fetchCoaches('bhs');
      if (dbCoaches && dbCoaches.length > 0) {
        this.data.coaches = dbCoaches.map(c => ({
          id: c.id!,
          name: c.name!,
          level: c.level!,
          phone: c.phone!,
          address: c.address!,
          email: c.email!,
          photo: c.photo!,
          bio: c.bio!
        }));
      }

      const dbThoughts = await supabaseService.fetchDailyThoughts('bhs');
      if (dbThoughts && dbThoughts.length > 0) {
        this.data.dailyThoughts = dbThoughts.map((t: any) => ({
          id: t.id,
          coachId: t.coach_id,
          coachName: t.coach_name || 'Coach Bob Miller',
          text: t.thoughts_text,
          isActive: !!t.is_active,
          createdAt: new Date(t.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
        }));
      }

      const dbCategories = await supabaseService.fetchSoccerCategories('bhs');
      if (dbCategories && dbCategories.length > 0) {
        this.data.soccerCategories = dbCategories.map((cat: any) => ({
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

  populateCategoryDropdowns(): void {
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

    const categories: SoccerCategory[] = this.data.soccerCategories;
    const masterSelect = document.getElementById('masterDrillFormCategory') as HTMLSelectElement | null;
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

  updateCategoryDescriptionTooltip(categoryName: string, targetId: string = 'masterDrillCategoryDesc'): void {
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

  bindEvents(): void {
    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        if (view) this.switchView(view);
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

  switchView(viewName: string): void {
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

  updateAuthUI(): void {
    const currentUser = auth.getCurrentUser();
    const isGuest = !currentUser || currentUser.role === 'guest';
    const isCoachOrAdmin = auth.isCoach() || auth.isAdmin();
    const canAccessRatings = auth.canAccessRatings();

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
      const el = item as HTMLElement;
      if (view === 'matrix') {
        el.style.display = canAccessRatings ? '' : 'none';
      } else if (view === 'planner') {
        el.style.display = isCoachOrAdmin ? '' : 'none';
      } else if (view === 'coaches') {
        el.style.display = isCoachOrAdmin ? '' : 'none';
      } else {
        el.style.display = '';
      }
    });

    // Single Primary Auth / Admin Control Button
    const adminBtn = document.getElementById('adminBtn') as HTMLButtonElement | null;
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

  renderCurrentView(): void {
    const container = document.getElementById('mainAppContainer');
    if (!container) return;

    const canAccessRatings = auth.canAccessRatings();

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
      if (!auth.isCoach()) {
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

// ─── Pending migration ────────────────────────────────────────────────────
// The methods below still live in js/views/planner.view.js and js/admin.js
// (not yet converted). These signatures let app.core.ts type-check on its
// own; delete each line once its real module lands with a matching
// `declare module './app.core'` augmentation.
export interface BHSSoccerApp {
  renderPlannerView(): string;
  renderCoachesView(): string;
  updateHeaderBranding(): void;
  openAdminModal(): void;
  getActiveThought(): DailyThought;
  openManageThoughtsModal(): void;
  openTakeQuizModal(tab?: string): void;
  renderAdminModalContent(): void;
}

// The singleton is created by initApp() in src/utils.ts, once the DOM is
// ready — matching the original js/utils.js boot sequence (bindEvents()
// needs querySelectorAll results to exist before it runs).
declare global {
  interface Window {
    app: BHSSoccerApp;
  }
}
