<script setup lang="ts">
/**
 * Squads and organizations.
 *
 * Admin-only, and it reads across organizations — `fetchAllTeams` exists
 * because the organization store holds only the teams the viewer belongs to,
 * and this is the one screen that has to see all of them.
 *
 * **Nothing here defaults an organization.** Creating a team asks which one;
 * falling back to the first, or the only, or Beaumont is exactly how a club's
 * squad ends up filed under a school. The same applies to a `kind`: `school`
 * or `club` is what the whole multi-tenant model rests on, so it is asked
 * rather than assumed.
 *
 * A mascot is asked for too, because `schools.mascot` is NOT NULL with no
 * default and it is what page headings render beside the name — omitting it
 * fails the insert, and defaulting it ships an organization branded with a
 * placeholder nobody remembers to correct.
 */
import { ref, computed, onMounted } from 'vue';
import SectionShell from './SectionShell.vue';
import InviteControl from '../accounts/InviteControl.vue';
import { demoConfig } from '../../demo';
import { supabaseService } from '../../data/supabase';

const teams = ref<any[]>([]);
const teamCoaches = ref<any[]>([]);
const assignable = ref<any[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const notice = ref<string | null>(null);
const error = ref<string | null>(null);

/** New organization. */
const orgName = ref('');
const orgCode = ref('');
const orgMascot = ref('');
const orgKind = ref<'school' | 'club'>('school');

/** New team. */
const teamName = ref('');
const teamSeason = ref('');
const teamOrg = ref('');

/** Which coach is picked for which team. */
const picked = ref<Record<string, string>>({});

/**
 * Which teams' "Invite a coach" disclosure has been opened.
 *
 * `InviteControl` is mounted only once true, because it reads for its team on
 * mount -- mounting it for every row regardless of the closed <details> would
 * fire a read per team platform-wide on every visit to this screen. Once
 * opened it stays mounted on close, so a coach revoking or re-opening an
 * invitation does not lose the control's state.
 */
const invitingCoach = ref<Record<string, boolean>>({});

/** The demo's accounts are shared and public; nobody real is invited from it. */
const demo = demoConfig();

function onInviteToggle(teamId: string, e: Event): void {
  if ((e.target as HTMLDetailsElement).open) invitingCoach.value[teamId] = true;
}

/**
 * The team being edited, if any, and the draft of it.
 *
 * One at a time: two open editors on a list this long is a good way to save
 * the wrong row. `minutes` is a string because the input is, and because ''
 * has to survive as "nobody has said" rather than becoming 0.
 */
const editing = ref<string | null>(null);
const draft = ref<{ name: string; season: string; minutes: string | number }>(
  { name: '', season: '', minutes: '' });

function onEdit(team: any): void {
  editing.value = team.id;
  draft.value = {
    name: team.name || '',
    season: team.season || '',
    // Blank when unstated: showing the app's 80-minute fallback here would
    // write it back as though somebody had chosen it (0034).
    minutes: team.match_minutes === null || team.match_minutes === undefined ? '' : String(team.match_minutes)
  };
  error.value = null;
  notice.value = null;
}

function onCancelEdit(): void {
  editing.value = null;
}

async function onSaveEdit(teamId: string): Promise<void> {
  const name = draft.value.name.trim();
  if (!name) { error.value = 'A team needs a name.'; return; }

  // v-model on an input[type=number] hands back a number, not a string, so
  // this cannot assume either. An empty field is still ''.
  const typed = String(draft.value.minutes ?? '').trim();
  let matchMinutes: number | null = null;
  if (typed) {
    const n = Number(typed);
    if (!Number.isInteger(n) || n <= 0) {
      // The database says the same thing (0034's check); saying it here makes
      // it a sentence rather than a constraint violation.
      error.value = 'A match length is a whole number of minutes above zero.';
      return;
    }
    matchMinutes = n;
  }

  const res = await supabaseService.updateTeam(teamId, {
    name, season: draft.value.season.trim(), matchMinutes
  });
  if (report(res, `${name} saved.`)) {
    editing.value = null;
    await load();
  }
}

const organizations = computed(() => {
  const seen = new Map<string, any>();
  teams.value.forEach(t => {
    if (!seen.has(t.school_id)) {
      seen.set(t.school_id, { id: t.school_id, name: t.school_name, kind: t.school_kind });
    }
  });
  return Array.from(seen.values());
});

function coachesOf(teamId: string): any[] {
  return teamCoaches.value.filter(c => c.team_id === teamId);
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const [all, coaches, people] = await Promise.all([
      supabaseService.fetchAllTeams(),
      supabaseService.fetchTeamCoaches(),
      supabaseService.fetchAssignableCoaches()
    ]);
    if (all === null) { loadError.value = 'Could not load the squads.'; return; }

    teams.value = all;
    teamCoaches.value = coaches || [];
    assignable.value = people || [];
  } catch {
    // A throw here is a client that is not configured the way this expects.
    // Reported rather than left to escape as an unhandled rejection, which
    // shows up nowhere the admin can see and fails the test run silently.
    loadError.value = 'Could not load the squads.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function report(res: any, done: string): boolean {
  if (res?.ok) { notice.value = done; error.value = null; return true; }
  error.value = res?.error || 'That did not work.';
  notice.value = null;
  return false;
}

async function onCreateOrganization(): Promise<void> {
  const res = await supabaseService.createSchool(
    orgCode.value, orgName.value, orgKind.value, orgMascot.value);

  if (report(res, `${orgName.value} created.`)) {
    orgName.value = ''; orgCode.value = ''; orgMascot.value = '';
    await load();
  }
}

async function onCreateTeam(): Promise<void> {
  // Asked, never defaulted: a squad filed under the wrong organization is
  // invisible until somebody notices the roster is somebody else's.
  if (!teamOrg.value) { error.value = 'Pick the organization this team belongs to.'; return; }

  const res = await supabaseService.createTeam(teamOrg.value, teamName.value, teamSeason.value);
  if (report(res, `${teamName.value} created.`)) {
    teamName.value = ''; teamSeason.value = '';
    await load();
  }
}

async function onAssign(teamId: string): Promise<void> {
  const profileId = picked.value[teamId];
  if (!profileId) { error.value = 'Pick a coach to assign.'; return; }

  const res = await supabaseService.assignCoachToTeam(teamId, profileId);
  if (report(res, 'Coach assigned.')) { picked.value[teamId] = ''; await load(); }
}

async function onRemove(teamId: string, coach: any): Promise<void> {
  const team = teams.value.find(t => t.id === teamId);
  const who = coach.profiles?.name || coach.profiles?.email || 'that coach';

  const ok = window.confirm(
    `Remove ${who} from ${team?.name || 'this team'}?\n\n`
    + 'They keep their account and their role; they simply stop being able to '
    + "change this squad's data."
  );
  if (!ok) return;

  const res = await supabaseService.removeCoachFromTeam(teamId, coach.profile_id);
  if (report(res, `${who} removed from ${team?.name || 'the team'}.`)) await load();
}
</script>

<template>
  <SectionShell
    title="Squads and organizations"
    :badge="`${teams.length} teams`"
    data-teams-section
  >

    <p v-if="loading" class="note">Loading…</p>
    <p v-else-if="loadError" class="note note--bad" role="alert" data-teams-error>{{ loadError }}</p>

    <template v-else>
      <div v-for="t in teams" :key="t.id" class="row hrow" data-team-row>
        <div class="row__what">
          <strong class="row__name" data-team-name>{{ t.name }}</strong>
          <span class="tag tag--live" data-team-org>{{ t.school_name }}</span>
          <span class="tag" data-team-kind>{{ t.school_kind }}</span>
          <span v-if="t.season" class="tag">{{ t.season }}</span>
          <!--
            Only when stated. A team with no length plays 80 by the app's
            fallback, which is not the same as having said so.
          -->
          <span v-if="t.match_minutes" class="tag" data-team-minutes>{{ t.match_minutes }} min</span>

          <div v-if="editing === t.id" class="teamedit">
            <label class="field">
              <span class="fld__label kicker">Name</span>
              <input v-model="draft.name" type="text" class="input" data-team-edit-name />
            </label>
            <label class="field">
              <span class="fld__label kicker">Season</span>
              <input v-model="draft.season" type="text" class="input" data-team-edit-season />
            </label>
            <label class="field">
              <span class="fld__label kicker">Match length</span>
              <input
                v-model="draft.minutes" type="number" min="1" step="1"
                class="input teamedit__minutes" data-team-edit-minutes
              />
              <span class="note">minutes — blank means 80</span>
            </label>
            <div class="teamedit__acts">
              <button
                type="button" class="btn btn--go" data-team-edit-save
                @click="onSaveEdit(t.id)"
              >Save</button>
              <button type="button" class="btn" data-team-edit-cancel @click="onCancelEdit">
                Cancel
              </button>
            </div>
          </div>

          <p class="row__coaches">
            <span v-if="coachesOf(t.id).length === 0" class="note">No coach assigned</span>
            <span
              v-for="c in coachesOf(t.id)" :key="c.profile_id"
              class="coach" data-team-coach
            >
              {{ c.profiles?.name || c.profiles?.email }}
              <button
                type="button" class="coach__x" :data-team-coach-remove="c.profile_id"
                @click="onRemove(t.id, c)"
              >&times;</button>
            </span>
          </p>

          <details v-if="!demo.enabled" class="invitecoach" data-team-invite @toggle="onInviteToggle(t.id, $event)">
            <summary class="kicker">Invite a coach</summary>
            <InviteControl v-if="invitingCoach[t.id]" :team-id="t.id" role="coach" :subject="t.name" />
          </details>
        </div>

        <div class="row__acts">
          <select v-model="picked[t.id]" class="input" :data-team-coach-pick="t.id">
            <option value="">— pick a coach —</option>
            <option v-for="p in assignable" :key="p.id" :value="p.id">
              {{ p.name || p.email }}
            </option>
          </select>
          <button type="button" class="btn" :data-team-assign="t.id" @click="onAssign(t.id)">
            Assign
          </button>
          <button type="button" class="btn" data-team-edit @click="onEdit(t)">Edit</button>
        </div>
      </div>

      <div class="forms">
        <form class="form" data-new-org @submit.prevent="onCreateOrganization">
          <h3 class="form__h kicker">New organization</h3>

          <label class="field">
            <span class="fld__label kicker">Name</span>
            <input v-model="orgName" type="text" class="input input--wide" data-org-name />
          </label>
          <label class="field">
            <span class="fld__label kicker">Short code</span>
            <input v-model="orgCode" type="text" class="input" data-org-code />
          </label>
          <label class="field">
            <span class="fld__label kicker">Mascot</span>
            <input v-model="orgMascot" type="text" class="input" data-org-mascot />
          </label>
          <label class="field">
            <span class="fld__label kicker">Kind</span>
            <select v-model="orgKind" class="input" data-org-kind>
              <option value="school">School</option>
              <option value="club">Club</option>
            </select>
          </label>

          <button type="submit" class="btn btn--go" data-org-create>Create organization</button>
        </form>

        <form class="form" data-new-team @submit.prevent="onCreateTeam">
          <h3 class="form__h kicker">New team</h3>

          <label class="field">
            <span class="fld__label kicker">Organization</span>
            <select v-model="teamOrg" class="input input--wide" data-team-org-pick>
              <option value="">— pick one —</option>
              <option v-for="o in organizations" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
          </label>
          <label class="field">
            <span class="fld__label kicker">Name</span>
            <input v-model="teamName" type="text" class="input input--wide" data-team-name-input />
          </label>
          <label class="field">
            <span class="fld__label kicker">Season</span>
            <input v-model="teamSeason" type="text" class="input" data-team-season />
          </label>

          <button type="submit" class="btn btn--go" data-team-create>Create team</button>
        </form>
      </div>
    </template>

    <p v-if="notice" class="note note--good" role="status" data-teams-notice>{{ notice }}</p>
    <p v-if="error" class="note note--bad" role="alert" data-teams-form-error>{{ error }}</p>
  </SectionShell>
</template>

<style scoped>

.row { align-items: flex-start; }

.row__what { flex: 1; min-width: 15rem; }
.row__name { color: var(--ink); font-size: 14px; }

.row__coaches { margin: var(--space-1) 0 0; display: flex; flex-wrap: wrap; gap: var(--space-1); font-size: 13px; }
.row__coaches .note { margin: 0; }

.coach {
  display: inline-flex;
  gap: 0.2rem;
  align-items: center;
  padding: 0.05rem var(--space-2);
  border: 1px solid var(--rule);
  border-radius: 999px;
  color: var(--ink);
}

.coach__x { border: 0; background: none; color: var(--ink-muted); cursor: pointer; }

.invitecoach { margin-top: var(--space-2); }

.row__acts { display: flex; gap: var(--space-1); align-items: flex-start; }

/* The editor sits inside the row it belongs to, indented enough to read as
   part of that team rather than as a new form under the list. */
.teamedit {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2);
  margin: var(--space-2) 0;
  padding: var(--space-2);
  border-left: 2px solid var(--rule-strong);
  background: var(--surface-deep);
  border-radius: var(--radius-md);
}
.teamedit__minutes { width: 5rem; }
.teamedit__acts { display: flex; gap: var(--space-1); }

.forms { display: flex; flex-wrap: wrap; gap: var(--space-6); margin-top: var(--space-4); }
.form { flex: 1; min-width: 15rem; display: flex; flex-direction: column; gap: var(--space-2); }
</style>
