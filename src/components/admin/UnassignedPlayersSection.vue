<script setup lang="ts">
/**
 * People with no squad.
 *
 * `players` rows with no live `team_players` membership — which is mostly how
 * an import leaves somebody whose team column did not match anything.
 *
 * **Two guards decide whether retiring is offered at all**, and both are
 * about not destroying history:
 *
 * `historyUnknown` means one of the history queries failed, so the app cannot
 * say what this person owns. Reporting zero results in that case reads
 * identically to "safe to retire", which is the dangerous reading — so
 * retiring is refused outright until the database is reachable.
 *
 * `resultCount` above zero means they have Matrix results on record. Retiring
 * them would strand those, so the answer is to put them on a team instead.
 *
 * Both are re-checked on the press rather than trusted from the rendered
 * button: the panel may have been open while a result was recorded elsewhere.
 */
import { ref, computed, onMounted } from 'vue';
import { supabaseService } from '../../data/supabase';

const props = defineProps<{ teamId: string | null; teams: any[] }>();

const people = ref<any[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const notice = ref<string | null>(null);
const error = ref<string | null>(null);

const team = computed(() => (props.teams || []).find((t: any) => t.id === props.teamId) || null);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const rows = await supabaseService.fetchUnassignedPlayers();
    if (rows === null) { loadError.value = 'Could not load the unassigned players.'; return; }
    people.value = rows;
  } catch {
    loadError.value = 'Could not load the unassigned players.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** Retiring is only offered when both guards are satisfied. */
function mayRetire(p: any): boolean {
  return !p.historyUnknown && (p.resultCount || 0) === 0;
}

async function onAdd(p: any): Promise<void> {
  error.value = null;
  notice.value = null;

  if (!team.value) { error.value = 'Choose a team in the header first.'; return; }

  const res = await supabaseService.upsertTeamMembership(
    team.value.id, team.value.school_id, { player_id: p.id });

  if (!res || res.ok === false) {
    // The likeliest cause is unique (school_id, player_id): they are already
    // on another team in this organization, which the design forbids.
    error.value = res?.error
      || `Could not add ${p.name}. They may already be on another team in this organization.`;
    return;
  }

  notice.value = `${p.name} joined ${team.value.name}. Set their number and position on the roster.`;
  await load();
}

async function onRetire(p: any): Promise<void> {
  error.value = null;
  notice.value = null;

  // Re-checked here, not trusted from the button: a result may have been
  // recorded elsewhere while this panel was open.
  if (p.historyUnknown) {
    error.value = `Could not read ${p.name}'s result history, so retiring them is not safe. `
      + 'Try again once the database is reachable.';
    return;
  }
  if ((p.resultCount || 0) > 0) {
    error.value = `${p.name} has ${p.resultCount} Matrix result${p.resultCount === 1 ? '' : 's'} `
      + 'on record and cannot be retired — add them to a team instead.';
    return;
  }

  const ok = window.confirm(
    `Retire ${p.name}?\n\n`
    + 'They are on no team and have no results, so they stop appearing here. '
    + 'They stay in the program — this does not delete anything a coach can '
    + 'see elsewhere.'
  );
  if (!ok) return;

  const res = await supabaseService.deletePlayer(p.id);
  if (!res || res.length === 0) {
    error.value = `Could not retire ${p.name}. The database refused it — only a coach or admin can.`;
    return;
  }

  notice.value = `Retired ${p.name}.`;
  await load();
}
</script>

<template>
  <section class="sec" data-unassigned-section>
    <h2 class="sec__h">
      Players on no team
      <span v-if="people.length" class="sec__n" data-unassigned-count>{{ people.length }}</span>
    </h2>

    <p class="sec__note">
      Usually somebody an import could not match to a squad. Adding them to a
      team is almost always the right answer.
    </p>

    <p v-if="loading" class="note">Loading…</p>
    <p v-else-if="loadError" class="note note--bad" role="alert" data-unassigned-error>
      {{ loadError }}
    </p>
    <p v-else-if="people.length === 0" class="note" data-unassigned-empty>
      Everybody is on a squad.
    </p>

    <div v-for="p in people" :key="p.id" class="row" data-unassigned-row>
      <div class="row__who">
        <strong class="row__name" data-unassigned-name>{{ p.name }}</strong>
        <span v-if="p.class_year" class="tag tag--quiet">{{ p.class_year }}</span>
        <span v-if="p.resultCount > 0" class="tag" data-unassigned-results>
          {{ p.resultCount }} result{{ p.resultCount === 1 ? '' : 's' }}
        </span>
        <span v-if="p.historyUnknown" class="tag tag--warn" data-unassigned-unknown>
          history unreadable
        </span>
      </div>

      <div class="row__acts">
        <button
          type="button" class="btn btn--go"
          :data-unassigned-add="p.id" @click="onAdd(p)"
        >Add to {{ team ? team.name : 'a team' }}</button>

        <!-- Not offered at all while either guard is unsatisfied: a disabled
             button invites a coach to look for the way round it. -->
        <button
          v-if="mayRetire(p)" type="button" class="btn"
          :data-unassigned-retire="p.id" @click="onRetire(p)"
        >Retire</button>
      </div>
    </div>

    <p v-if="notice" class="note note--good" role="status" data-unassigned-notice>{{ notice }}</p>
    <p v-if="error" class="note note--bad" role="alert" data-unassigned-action-error>{{ error }}</p>
  </section>
</template>

<style scoped>
.sec { margin-bottom: 2rem; }

.sec__h {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin: 0 0 0.3rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.sec__n {
  padding: 0.05rem 0.45rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  color: var(--text-muted, #94a3b8);
  font-size: 0.7rem;
}

.sec__note { margin: 0 0 0.6rem; color: var(--text-muted, #94a3b8); font-size: 0.8rem; line-height: 1.5; }

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--bhs-navy-border);
}

.row__who { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: baseline; }
.row__name { color: #fff; font-size: 0.88rem; }
.row__acts { display: flex; gap: 0.3rem; }

.tag {
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  color: var(--bhs-gold-accent);
  font-size: 0.68rem;
}

.tag--quiet { color: var(--text-muted, #94a3b8); }
.tag--warn { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }

.note { margin: 0.6rem 0 0; color: var(--text-muted, #94a3b8); font-size: 0.83rem; line-height: 1.5; }
.note--bad { color: var(--color-danger, #f87171); }
.note--good { color: var(--bhs-cyan-accent); }

.btn {
  padding: 0.26rem 0.55rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}

.btn--go { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
</style>
