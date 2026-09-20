<script setup lang="ts">
/**
 * Invite a whole squad from one pasted list.
 *
 * The same invitation as the one on a player's bio, in bulk: `create_invitation`
 * per address, which decides who may invite whom. Nothing here is privileged.
 *
 * **Nothing is sent on the first press.** A coach pastes whatever shape the
 * addresses arrived in, and the screen shows every line with the roster entry
 * it matched and what will happen. An invitation is a place on a squad, so a
 * line that matches nobody -- or two players at once -- is reported and left
 * rather than guessed at, and only the lines it could place are sent.
 *
 * The app emails nothing (see `InviteControl`), and the invitation is matched
 * by address when the person confirms, so no per-player link is needed: the
 * result says to tell the squad to register with the address their coach has.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { parseInviteList, planBulkInvites, type PlannedInvite } from '../../domain/bulk-invite';

const props = defineProps<{ open: boolean; teamId: string | null }>();
const emit = defineEmits<{ close: []; invited: [number] }>();

const text = ref('');
const roster = ref<Array<{ id: string; name: string }>>([]);
const linkedIds = ref<string[]>([]);
const invitations = ref<any[]>([]);
const chosen = ref<Record<number, string>>({});
const previewed = ref(false);
const busy = ref(false);
const loadError = ref<string | null>(null);
const result = ref<string | null>(null);
const refusals = ref<string[]>([]);

const planned = computed<PlannedInvite[]>(() => previewed.value
  ? planBulkInvites({
      lines: parseInviteList(text.value),
      roster: roster.value,
      linkedIds: linkedIds.value,
      invitations: invitations.value,
      chosen: chosen.value
    })
  : []);

const toSend = computed(() => planned.value.filter(p => p.outcome === 'invite'));
const skipped = computed(() => planned.value.length - toSend.value.length);

/** Only entries a coach could still invite: one with an account is not one. */
const choosable = computed(() =>
  roster.value.filter(p => !linkedIds.value.includes(p.id)));

const LABELS: Record<string, string> = {
  invite: 'Will invite', choose: 'Choose a player', linked: 'Has an account',
  invited: 'Already invited', 'no-match': 'No match', ambiguous: 'Two of that name',
  'bad-email': 'Not an address', duplicate: 'Listed twice'
};

async function load(): Promise<void> {
  loadError.value = null;
  if (!props.teamId) { loadError.value = 'Choose a team first.'; return; }

  const [rosterRows, linked, open] = await Promise.all([
    supabaseService.fetchTeamRoster(props.teamId),
    supabaseService.fetchLinkedPlayerIds(props.teamId),
    supabaseService.fetchTeamInvitations(props.teamId)
  ]);

  if (rosterRows === null || linked === null || open === null) {
    loadError.value = 'Could not read this squad. Nothing has been invited.';
    return;
  }

  roster.value = (rosterRows as any[])
    .map(m => ({ id: m?.players?.id, name: m?.players?.name || '' }))
    .filter(p => p.id);
  linkedIds.value = linked;
  invitations.value = (open as any[]).filter(i => i.role === 'player');
}

watch(() => [props.open, props.teamId] as const, () => {
  if (!props.open) return;
  previewed.value = false;
  result.value = null;
  refusals.value = [];
  chosen.value = {};
  load();
}, { immediate: true });

function onPreview(): void {
  previewed.value = true;
  result.value = null;
  refusals.value = [];
}

async function onSend(): Promise<void> {
  if (!props.teamId || toSend.value.length === 0) return;
  busy.value = true;
  refusals.value = [];
  let sent = 0;

  try {
    // One at a time, in the order shown: the database checks each caller, and
    // a refusal belongs beside the address it refused.
    for (const row of toSend.value) {
      const res = await supabaseService.createInvitation(row.email, props.teamId, 'player', row.playerId);
      if (res?.ok) sent += 1;
      else refusals.value.push(`${row.email}: ${res?.error || 'The invitation was refused.'}`);
    }
  } finally {
    busy.value = false;
  }

  const left = skipped.value;
  result.value = `${sent} invited`
    + (left ? `, ${left} skipped` : '')
    + '. Tell the squad to register on this site with the address you invited —'
    + ' nothing has been emailed from here.';

  if (sent > 0) {
    emit('invited', sent);
    await load();
  }
}
</script>

<template>
  <BaseModal :open="open" title="Invite the squad" wide @close="emit('close')">
    <p class="lede">
      One player per line — <code>address, name</code>, <code>Name &lt;address&gt;</code>, or an
      address on its own. Nothing is sent until you have seen what each line will do.
    </p>

    <p v-if="loadError" class="state state--bad" role="alert" data-bulk-error>{{ loadError }}</p>

    <template v-else>
      <label class="field">
        <span class="kicker">Paste the list</span>
        <textarea
          v-model="text" class="input paste" rows="6" data-bulk-text
          placeholder="cesar.alva@example.com, Cesar Alva"
        />
      </label>

      <div class="acts">
        <button type="button" class="btn" data-bulk-preview @click="onPreview">Check the list</button>
        <button
          type="button" class="btn btn--go" :disabled="busy || toSend.length === 0"
          data-bulk-send @click="onSend"
        >{{ busy ? 'Inviting…' : 'Send the invitations' }}</button>
      </div>

      <template v-if="previewed">
        <p v-if="planned.length === 0" class="state" data-bulk-empty>
          Nothing to read in that list yet.
        </p>

        <template v-else>
          <p class="count" data-bulk-count>
            {{ toSend.length }} to invite<template v-if="skipped">, {{ skipped }} skipped</template>.
          </p>

          <div class="wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th class="is-text">Address</th>
                  <th class="is-text">Player</th>
                  <th class="is-text">What happens</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in planned" :key="row.line"
                  :class="`is-${row.outcome}`" data-bulk-row :data-bulk-outcome="row.outcome"
                >
                  <td class="is-text">{{ row.email || row.raw }}</td>
                  <td class="is-text">
                    <select
                      v-if="row.outcome === 'choose' || row.outcome === 'ambiguous'"
                      class="input input--small" data-bulk-choose
                      :value="chosen[row.line] || ''"
                      @change="chosen = { ...chosen, [row.line]: ($event.target as HTMLSelectElement).value }"
                    >
                      <option value="">Choose a player…</option>
                      <option v-for="p in choosable" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                    <template v-else>{{ row.playerName || '—' }}</template>
                  </td>
                  <td class="is-text">
                    <span class="tag">{{ LABELS[row.outcome] }}</span>
                    {{ row.note }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </template>

      <p v-if="result" class="state state--good" data-bulk-result>
        {{ result }}
        <template v-if="refusals.length">
          <span v-for="r in refusals" :key="r" class="refusal">{{ r }}</span>
        </template>
      </p>
    </template>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.lede {
  margin: 0 0 0.9rem;
  max-width: 44rem;
  color: var(--ink-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.field { display: block; margin-bottom: 0.6rem; }
.kicker { display: block; margin-bottom: 0.25rem; }

.input {
  width: 100%;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
}

.input--small { font-size: 0.78rem; }
.paste { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; }

.acts { display: flex; gap: 0.5rem; margin-bottom: 0.9rem; }

.btn {
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.btn--go { border-color: var(--rule-strong); color: var(--mark); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.count { margin: 0 0 0.4rem; color: var(--ink-muted); font-size: 0.8rem; }

.wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.tbl th, .tbl td { padding: 0.28rem 0.5rem; border-bottom: 1px solid var(--rule); text-align: left; }
.tbl th { color: var(--live); font-size: 0.64rem; letter-spacing: 0.08em; text-transform: uppercase; }

.tag {
  display: inline-block;
  margin-right: 0.35rem;
  padding: 1px 7px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  font-size: 0.68rem;
  white-space: nowrap;
}

/* Only the lines that will not be sent carry emphasis; the rest are the work. */
.tbl tr.is-no-match .tag,
.tbl tr.is-ambiguous .tag,
.tbl tr.is-bad-email .tag,
.tbl tr.is-duplicate .tag { color: var(--color-warning); border-color: var(--color-warning); }

.state { padding: 0.6rem 0; color: var(--ink-muted); font-size: 0.85rem; }
.state--bad { color: var(--color-danger); }
.state--good { color: var(--ink); }

.refusal { display: block; margin-top: 0.3rem; color: var(--color-danger); font-size: 0.8rem; }
</style>
