/**
 * The active team, the organization it belongs to, and that organization's
 * branding.
 *
 * The organization is resolved from the active TEAM, never from a school code.
 * app.core.js still falls back to a 'bhs' literal when fetching the school;
 * that is legacy to work around, not a pattern to copy. `schools` holds
 * organizations distinguished by a `kind` of `school` or `club`, and a club
 * coach's app must show their club.
 */
import { defineStore } from 'pinia';
import { ref, computed, watchEffect } from 'vue';
import { supabaseService } from '../data/supabase';
import { resolveActiveTeam } from '../data/team-scope';
import { brandingFor, themeVars } from '../domain/theme';

/** The per-device preference, the same key the legacy app uses. */
const ACTIVE_TEAM_KEY = 'bhs_active_team_id';

export const useOrganizationStore = defineStore('organization', () => {
  const schools = ref<any[]>([]);
  const teams = ref<any[]>([]);
  const activeTeamId = ref<string | null>(null);
  const loading = ref(false);
  const loadError = ref<string | null>(null);

  const activeTeam = computed(() =>
    teams.value.find(t => String(t.id) === String(activeTeamId.value)) || null);

  /**
   * The organization the active team belongs to.
   *
   * Falls back to the first school so a signed-out visitor mid-load sees a
   * heading rather than a blank -- but never to a hardcoded name.
   */
  const school = computed(() => {
    const team = activeTeam.value;
    if (team?.school_id) {
      const found = schools.value.find(s => String(s.id) === String(team.school_id));
      if (found) return found;
    }
    return schools.value[0] || null;
  });

  const branding = computed(() => brandingFor(school.value));

  /**
   * Paint the organization's colours onto the document.
   *
   * Every component styles against the custom properties rather than a
   * literal, so switching to a club team restyles the whole app.
   */
  watchEffect(() => {
    if (typeof document === 'undefined') return;
    for (const [prop, value] of Object.entries(themeVars(branding.value))) {
      document.documentElement.style.setProperty(prop, value);
    }

    // The tab, for the same reason as the colours. index.html ships a neutral
    // title because the document is static and the organization is not known
    // until the teams load -- so a club coach's tab would otherwise read
    // somebody else's name, or nothing that identifies the app at all.
    const name = branding.value.name;
    if (name) document.title = name;
  });

  function setActiveTeam(id: string | null): void {
    activeTeamId.value = id;
    try {
      if (id) localStorage.setItem(ACTIVE_TEAM_KEY, id);
      else localStorage.removeItem(ACTIVE_TEAM_KEY);
    } catch {
      // A browser with site data blocked still works, it just forgets.
    }
  }

  /**
   * Which load is the newest. App reloads when the account changes, and that
   * can start while the page-open load is still waiting: without this, the
   * older, signed-out answer arriving last would put back the list the
   * sign-in replaced.
   */
  let loadGeneration = 0;

  async function load(): Promise<void> {
    const generation = ++loadGeneration;
    loading.value = true;
    loadError.value = null;
    try {
      const fetchedSchools = (await supabaseService.fetchSchools()) || [];
      // fetchTeamsForViewer, not fetchTeams: it returns only the teams this
      // profile may see, which is what the switcher should offer.
      const fetchedTeams = (await supabaseService.fetchTeamsForViewer()) || [];
      if (generation !== loadGeneration) return;
      schools.value = fetchedSchools;
      teams.value = fetchedTeams;

      let stored: string | null = null;
      try { stored = localStorage.getItem(ACTIVE_TEAM_KEY); } catch { /* blocked */ }

      // Returns the id, not the team. A stored id is only honoured while the
      // viewer still has access, so a coach removed from a team stops seeing it.
      activeTeamId.value = resolveActiveTeam(teams.value as any, stored, null);
    } catch (err: any) {
      if (generation !== loadGeneration) return;
      loadError.value = err?.message || 'Could not load the organization.';
      console.error('Organization load failed:', err);
    } finally {
      if (generation === loadGeneration) loading.value = false;
    }
  }

  return {
    schools, teams, activeTeamId, activeTeam, school, branding,
    loading, loadError, load, setActiveTeam
  };
});
