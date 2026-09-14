<script setup lang="ts">
/**
 * Accounts waiting for approval.
 *
 * **The most consequential control in the application.** Approving hands
 * somebody access to a squad of minors, so the confirmation names the person,
 * the team and the role.
 *
 * The list comes from pending_requests(), which returns only what the caller
 * may act on: a coach sees player requests for their own teams, an admin sees
 * everything. Nothing here filters by organization, because a filter in the
 * browser is not a boundary -- the old queue took an organization and ignored
 * it.
 *
 * Refusing is not deletion: it sets a status, and the confirmation says so, or
 * a coach assumes a mis-click is unrecoverable.
 */
import { ref, computed, onMounted } from 'vue';
import SectionShell from './SectionShell.vue';
import { supabaseService } from '../../data/supabase';
import type { PendingRequest, JoinableTeam } from '../../types';

const props = defineProps<{ isAdmin: boolean }>();

const requests = ref<PendingRequest[] | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const notice = ref<string | null>(null);
const refused = ref<string | null>(null);
const busyId = ref<string | null>(null);

/** Per request: the team to place them on, and the roster entry ('' = a new one). */
const choice = ref<Record<string, { teamId: string; playerId: string }>>({});
/** Unlinked roster entries, per team id. */
const rosters = ref<Record<string, { id: string; name: string }[]>>({});
const teams = ref<JoinableTeam[]>([]);
/**
 * A failed roster or team read is not the same thing as a genuinely empty
 * list: a null return from `fetchUnlinkedRosterEntries`/`fetchJoinableTeams`
 * must not collapse into `[]`, or a coach sees only "New roster entry" for a
 * roster that actually has the very entry that request should link to --
 * approving then creates a duplicate players row.
 */
const failedRosters = ref<Record<string, boolean>>({});
const teamsFailed = ref(false);
const ROSTER_ERROR = "Could not load this team's roster, so approving could create a second record for someone already on it. Reload the page to try again.";

const rows = computed(() => requests.value || []);

function who(r: PendingRequest): string { return r.name || r.email; }

function teamLabel(r: PendingRequest): string {
  const teamId = choice.value[r.id]?.teamId;
  if (teamId && teamId === r.requested_team_id && r.team_name) {
    return r.school_name ? `${r.team_name} · ${r.school_name}` : r.team_name;
  }
  const t = teams.value.find(x => x.id === teamId);
  return t ? `${t.name} · ${t.schoolName}` : '';
}

async function loadRosters(): Promise<void> {
  const wanted = new Set(
    rows.value.filter(r => r.requested_role === 'player')
      .map(r => choice.value[r.id]?.teamId).filter(Boolean) as string[]);
  for (const teamId of wanted) {
    if (rosters.value[teamId]) continue;
    const found = await supabaseService.fetchUnlinkedRosterEntries(teamId);
    if (found === null) { failedRosters.value[teamId] = true; continue; }
    failedRosters.value[teamId] = false;
    rosters.value[teamId] = found;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const found = await supabaseService.fetchPendingRequests();
    if (found === null) {
      // "Nobody is waiting" for a failed read leaves a real person waiting.
      loadError.value = 'Could not load the accounts waiting for approval.';
      requests.value = null;
      return;
    }
    requests.value = found;
    for (const r of found) {
      if (!choice.value[r.id]) choice.value[r.id] = { teamId: r.requested_team_id || '', playerId: '' };
    }
    if (props.isAdmin && found.some(r => !r.requested_team_id)) {
      const foundTeams = await supabaseService.fetchJoinableTeams();
      teamsFailed.value = foundTeams === null;
      teams.value = foundTeams || [];
    }
    await loadRosters();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function onTeamChosen(r: PendingRequest, teamId: string): Promise<void> {
  choice.value[r.id] = { teamId, playerId: '' };
  await loadRosters();
}

async function onApprove(r: PendingRequest): Promise<void> {
  notice.value = null;
  refused.value = null;
  const c = choice.value[r.id];
  if (!c?.teamId) { refused.value = 'Choose the team to place them on first.'; return; }
  // Belt and braces for the disabled Approve button: a failed roster read
  // must never be silently treated as an empty one.
  if (r.requested_role === 'player' && failedRosters.value[c.teamId]) {
    refused.value = ROSTER_ERROR;
    return;
  }

  const team = teamLabel(r) || 'that team';
  const entry = rosters.value[c.teamId]?.find(p => p.id === c.playerId)?.name;
  const text = r.requested_role === 'coach'
    ? `Make ${who(r)} a coach of ${team}?\n\nThey will be able to change that squad's data.`
    : `Put ${who(r)} on ${team} as a player, ${entry ? `linked to ${entry}` : 'as a new roster entry'}?`;
  if (!window.confirm(text)) return;

  busyId.value = r.id;
  try {
    const res = r.requested_role === 'coach'
      ? await supabaseService.approveCoachRequest(r.id, c.teamId)
      : await supabaseService.approvePlayerRequest(r.id, c.teamId, c.playerId || null);
    if (!res.ok) { refused.value = res.error || 'That approval was refused.'; return; }
    notice.value = `${who(r)} approved.`;
    rosters.value = {};
    failedRosters.value = {};
    await load();
  } finally {
    busyId.value = null;
  }
}

async function onReject(r: PendingRequest): Promise<void> {
  notice.value = null;
  refused.value = null;
  const ok = window.confirm(
    `Refuse ${who(r)}?\n\nTheir account is kept and marked as refused rather than deleted.`);
  if (!ok) return;

  busyId.value = r.id;
  try {
    const res = await supabaseService.rejectRequest(r.id);
    if (!res.ok) { refused.value = res.error || 'That was refused.'; return; }
    notice.value = `${who(r)} refused. Their account is kept.`;
    await load();
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <SectionShell
    title="Waiting for approval"
    :badge="`${rows.length} waiting`"
    data-approvals
  >
    <p v-if="loading && !requests" class="note">Loading…</p>
    <p v-else-if="loadError" class="note note--bad" role="alert" data-approvals-error>{{ loadError }}</p>
    <p v-else-if="rows.length === 0" class="note" data-approvals-empty>Nobody is waiting.</p>

    <div v-for="r in rows" :key="r.id" class="row hrow" data-request-row>
      <div class="row__who">
        <strong class="row__name">{{ r.name || 'No name given' }}</strong>
        <span class="row__email">{{ r.email }}</span>
        <span class="tag tag--live">{{ r.requested_role === 'coach' ? 'Coach' : 'Player' }}</span>
        <span v-if="r.requested_team_id" class="tag" data-request-team-label>{{ teamLabel(r) }}</span>
        <span v-else class="note">named no team</span>
      </div>

      <div class="row__acts">
        <template v-if="!r.requested_team_id && isAdmin">
          <p v-if="teamsFailed" class="note note--bad" role="alert" data-request-teams-error>
            Could not load the teams to place this request on.
          </p>
          <select
            v-else
            class="input" :value="choice[r.id]?.teamId" data-request-team
            @change="onTeamChosen(r, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">— choose a team —</option>
            <option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }} · {{ t.schoolName }}</option>
          </select>
        </template>

        <select
          v-if="r.requested_role === 'player' && choice[r.id]?.teamId"
          v-model="choice[r.id].playerId" class="input" data-request-player
        >
          <option value="">New roster entry</option>
          <option v-for="p in rosters[choice[r.id].teamId] || []" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>

        <p
          v-if="r.requested_role === 'player' && choice[r.id]?.teamId && failedRosters[choice[r.id].teamId]"
          class="note note--bad" role="alert" data-request-roster-error
        >{{ ROSTER_ERROR }}</p>

        <button type="button" class="btn btn--go"
                :disabled="busyId === r.id || (r.requested_role === 'player' && !!failedRosters[choice[r.id]?.teamId])"
                data-request-approve @click="onApprove(r)">Approve</button>
        <button type="button" class="btn" :disabled="busyId === r.id"
                data-request-reject @click="onReject(r)">Refuse</button>
      </div>
    </div>

    <p v-if="refused" class="note note--bad" role="alert" data-approvals-refused>{{ refused }}</p>
    <p v-if="notice" class="note note--good" role="status" data-approvals-notice>{{ notice }}</p>
  </SectionShell>
</template>

<style scoped>
.row { align-items: center; }
.row__who { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; }
.row__name { color: var(--ink); font-size: 14px; }
.row__email { color: var(--ink-muted); font-size: 13px; }
.row__acts { display: flex; flex-wrap: wrap; gap: var(--space-1); }
</style>
