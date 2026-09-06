<script setup lang="ts">
/**
 * The recorded sessions behind the leaderboard, newest first.
 *
 * A session is how a whole squad's results get entered, so it is also how a
 * whole squad's results get entered wrong. Editing reopens the grid carrying
 * the session's own id, which is what makes the save upsert rather than write
 * a second session for the same exercise and day — that would double
 * everyone's `available` without anything on screen looking wrong.
 *
 * Coach only, and absent from anyone else's document rather than hidden.
 */
import { computed, ref } from 'vue';
import { useSessionStore } from '../../stores/session';

const props = defineProps<{ canEdit: boolean; teamId: string | null }>();
const emit = defineEmits<{ edit: [string]; changed: [] }>();

const session = useSessionStore();
const error = ref<string | null>(null);

const rows = computed(() => session.sessions.slice().sort(
  (a: any, b: any) => String(b.occurred_on).localeCompare(String(a.occurred_on))));

/** The drill may have been deleted since, so drills_bank comes back null. */
function nameOf(s: any): string {
  return s?.drills_bank?.name || 'Exercise (since removed)';
}

async function onEdit(s: any): Promise<void> {
  error.value = null;
  await session.openExisting(s.id, props.teamId);
  emit('edit', s.drill_id);
}

/**
 * Deleting takes every result in the session with it and re-ranks the table,
 * so the confirmation says both.
 */
async function onDelete(s: any): Promise<void> {
  error.value = null;
  const ok = window.confirm(
    `Delete the ${nameOf(s)} session on ${s.occurred_on}?\n\n`
    + 'Every result in it is removed and the standings are re-scored.'
  );
  if (!ok) return;

  const res = await session.remove(s.id, props.teamId);
  if (!res?.ok) { error.value = res?.error || 'Could not delete that session.'; return; }
  emit('changed');
}
</script>

<template>
  <section v-if="props.canEdit" class="history" data-history>
    <h2 class="history__title">
      Recorded sessions
      <span v-if="rows.length" class="history__count">{{ rows.length }}</span>
    </h2>

    <p v-if="rows.length === 0" class="history__empty" data-history-empty>
      No sessions recorded yet. The leaderboard is calculated from these and
      from individual results.
    </p>

    <div v-for="s in rows" :key="s.id" class="row" data-history-row>
      <span class="row__name">{{ nameOf(s) }}</span>
      <span class="row__date" data-history-date>{{ s.occurred_on }}</span>
      <button type="button" class="btn" data-history-edit @click="onEdit(s)">Edit</button>
      <button type="button" class="btn btn--danger" data-history-delete @click="onDelete(s)">Delete</button>
    </div>

    <p v-if="error" class="history__error" role="alert" data-history-error>{{ error }}</p>
  </section>
</template>

<style scoped>
.history { margin-top: 2rem; }

.history__title {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin: 0 0 0.7rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.history__count {
  padding: 0.05rem 0.45rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  color: var(--text-muted, #94a3b8);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

.history__empty, .history__error {
  margin: 0;
  color: var(--text-muted, #94a3b8);
  font-size: 0.85rem;
  line-height: 1.5;
}

.history__error { margin-top: 0.6rem; color: var(--color-danger, #f87171); }

.row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--bhs-navy-border);
  font-size: 0.82rem;
}

.row__name { flex: 1; color: #fff; }
.row__date { color: var(--text-muted, #94a3b8); font-size: 0.78rem; }

.btn {
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.btn--danger:hover { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }
</style>
