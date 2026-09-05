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

  async function load(): Promise<void> {
    loading.value = true;
    loadError.value = null;
    try {
      schools.value = (await supabaseService.fetchSchools()) || [];
      // fetchTeamsForViewer, not fetchTeams: it returns only the teams this
      // profile may see, which is what the switcher should offer.
      teams.value = (await supabaseService.fetchTeamsForViewer()) || [];

      let stored: string | null = null;
      try { stored = localStorage.getItem(ACTIVE_TEAM_KEY); } catch { /* blocked */ }

      // Returns the id, not the team. A stored id is only honoured while the
      // viewer still has access, so a coach removed from a team stops seeing it.
      activeTeamId.value = resolveActiveTeam(teams.value as any, stored, null);
    } catch (err: any) {
      loadError.value = err?.message || 'Could not load the organization.';
      console.error('Organization load failed:', err);
    } finally {
      loading.value = false;
    }
  }

  return {
    schools, teams, activeTeamId, activeTeam, school, branding,
    loading, loadError, load, setActiveTeam
  };
});
