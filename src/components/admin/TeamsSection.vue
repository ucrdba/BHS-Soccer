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
  <section class="sec" data-teams-section>
    <h2 class="sec__h">Squads and organizations</h2>

    <p v-if="loading" class="note">Loading…</p>
    <p v-else-if="loadError" class="note note--bad" role="alert" data-teams-error>{{ loadError }}</p>

    <template v-else>
      <div v-for="t in teams" :key="t.id" class="row" data-team-row>
        <div class="row__what">
          <strong class="row__name" data-team-name>{{ t.name }}</strong>
          <span class="tag" data-team-org>{{ t.school_name }}</span>
          <span class="tag tag--quiet" data-team-kind>{{ t.school_kind }}</span>
          <span v-if="t.season" class="tag tag--quiet">{{ t.season }}</span>

          <p class="row__coaches">
            <span v-if="coachesOf(t.id).length === 0" class="muted">No coach assigned</span>
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
        </div>

        <div class="row__acts">
          <select v-model="picked[t.id]" class="inp" :data-team-coach-pick="t.id">
            <option value="">— pick a coach —</option>
            <option v-for="p in assignable" :key="p.id" :value="p.id">
              {{ p.name || p.email }}
            </option>
          </select>
          <button type="button" class="btn" :data-team-assign="t.id" @click="onAssign(t.id)">
            Assign
          </button>
        </div>
      </div>

      <div class="forms">
        <form class="form" data-new-org @submit.prevent="onCreateOrganization">
          <h3 class="form__h">New organization</h3>

          <label class="fld">
            <span class="fld__label">Name</span>
            <input v-model="orgName" type="text" class="inp inp--wide" data-org-name />
          </label>
          <label class="fld">
            <span class="fld__label">Short code</span>
            <input v-model="orgCode" type="text" class="inp" data-org-code />
          </label>
          <label class="fld">
            <span class="fld__label">Mascot</span>
            <input v-model="orgMascot" type="text" class="inp" data-org-mascot />
          </label>
          <label class="fld">
            <span class="fld__label">Kind</span>
            <select v-model="orgKind" class="inp" data-org-kind>
              <option value="school">School</option>
              <option value="club">Club</option>
            </select>
          </label>

          <button type="submit" class="btn btn--go" data-org-create>Create organization</button>
        </form>

        <form class="form" data-new-team @submit.prevent="onCreateTeam">
          <h3 class="form__h">New team</h3>

          <label class="fld">
            <span class="fld__label">Organization</span>
            <select v-model="teamOrg" class="inp inp--wide" data-team-org-pick>
              <option value="">— pick one —</option>
              <option v-for="o in organizations" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
          </label>
          <label class="fld">
            <span class="fld__label">Name</span>
            <input v-model="teamName" type="text" class="inp inp--wide" data-team-name-input />
          </label>
          <label class="fld">
            <span class="fld__label">Season</span>
            <input v-model="teamSeason" type="text" class="inp" data-team-season />
          </label>

          <button type="submit" class="btn btn--go" data-team-create>Create team</button>
        </form>
      </div>
    </template>

    <p v-if="notice" class="note note--good" role="status" data-teams-notice>{{ notice }}</p>
    <p v-if="error" class="note note--bad" role="alert" data-teams-form-error>{{ error }}</p>
  </section>
</template>

<style scoped>
.sec { margin-bottom: 2rem; }

.sec__h {
  margin: 0 0 0.6rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--bhs-navy-border);
}

.row__what { flex: 1; min-width: 15rem; }
.row__name { color: #fff; font-size: 0.9rem; }

.row__coaches { margin: 0.3rem 0 0; display: flex; flex-wrap: wrap; gap: 0.3rem; font-size: 0.78rem; }

.coach {
  display: inline-flex;
  gap: 0.2rem;
  align-items: center;
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  color: #fff;
}

.coach__x { border: 0; background: none; color: var(--text-muted, #94a3b8); cursor: pointer; }

.tag {
  margin-left: 0.4rem;
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  color: var(--bhs-cyan-accent);
  font-size: 0.68rem;
}

.tag--quiet { color: var(--text-muted, #94a3b8); }
.muted { color: var(--text-muted, #94a3b8); }

.row__acts { display: flex; gap: 0.3rem; align-items: flex-start; }

.forms { display: flex; flex-wrap: wrap; gap: 1.5rem; margin-top: 1.2rem; }
.form { flex: 1; min-width: 15rem; }

.form__h {
  margin: 0 0 0.5rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.fld { display: block; margin-bottom: 0.5rem; }

.fld__label {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.inp {
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: var(--bhs-navy-bg);
  color: #fff;
  font: inherit;
  font-size: 0.82rem;
}

.inp--wide { width: 100%; }

.note { margin: 0.6rem 0 0; color: var(--text-muted, #94a3b8); font-size: 0.83rem; line-height: 1.5; }
.note--bad { color: var(--color-danger, #f87171); }
.note--good { color: var(--bhs-cyan-accent); }

.btn {
  padding: 0.28rem 0.6rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.btn--go { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
</style>
