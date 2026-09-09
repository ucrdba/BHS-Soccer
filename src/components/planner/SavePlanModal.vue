<script setup lang="ts">
/**
 * Saving, renaming, deleting and copying a named plan.
 *
 * A plan is whatever `practice_plans` rows share a name, so saving under an
 * existing name **replaces that plan** — which is what a coach means by
 * saving over one, and worth saying out loud before they do it.
 *
 * "Copy to team" is offered only when the active plan is one that really
 * exists, because `copyPracticePlan` matches on the name. The legacy heading
 * defaults to a name no write path ever stores, so the control failed for
 * every coach who had not just loaded a plan.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { usePlannerStore } from '../../stores/planner';

const props = defineProps<{ open: boolean; teamId: string | null }>();
const emit = defineEmits<{ close: [] }>();

const planner = usePlannerStore();

const name = ref('');
const renameTo = ref('');
const target = ref('');
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const busy = ref(false);

const copyable = computed(() => planner.copyablePlan);

watch(() => props.open, async (open) => {
  if (!open) return;
  error.value = null;
  notice.value = null;
  name.value = planner.activePlanName || '';
  renameTo.value = '';
  target.value = '';
  await planner.loadCopyTargets();
// immediate: the modal can be mounted already open, and without it the name
// box starts blank and the destination list is never read.
}, { immediate: true });

/** Saving over a plan that exists replaces it; say so before it happens. */
const willReplace = computed(() =>
  planner.savedPlans.some(p => p.name === name.value.trim()));

function report(res: { ok: boolean; error?: string }, done: string): void {
  if (res?.ok) { notice.value = done; error.value = null; }
  else { error.value = res?.error || 'That did not work.'; notice.value = null; }
}

async function onSave(): Promise<void> {
  busy.value = true;
  try {
    report(await planner.savePlan(props.teamId, name.value), 'Plan saved.');
  } finally {
    busy.value = false;
  }
}

async function onRename(): Promise<void> {
  const to = renameTo.value.trim();
  if (!to) { error.value = 'Give the plan a new name.'; return; }

  const res = await planner.renamePlan(props.teamId, planner.activePlanName, to);
  report(res, `Renamed to "${to}".`);
  if (res.ok) renameTo.value = '';
}

async function onDelete(): Promise<void> {
  const plan = copyable.value;
  if (!plan) return;

  const ok = window.confirm(
    `Delete the plan "${plan.name}"?\n\n`
    + `All ${plan.drills.length} drills in it are removed. Sessions you have `
    + 'already run are not affected.'
  );
  if (!ok) return;

  report(await planner.deletePlan(plan.id, props.teamId), 'Plan deleted.');
}

async function onCopy(): Promise<void> {
  if (!target.value) { error.value = 'Pick a team to copy it to.'; return; }

  const to = planner.copyTargets.find((t: any) => t.id === target.value);
  report(
    await planner.copyToTeam(props.teamId, target.value),
    `Copied to ${to?.name || 'that team'}.`
  );
}
</script>

<template>
  <BaseModal :open="open" title="Saved plans" @close="emit('close')">
    <section class="block">
      <h3 class="block__h kicker">Save this session</h3>
      <label class="field">
        <span class="fld__label kicker">Plan name</span>
        <input v-model="name" type="text" class="input input--wide" data-plan-name />
      </label>
      <p v-if="willReplace" class="note" data-plan-replace>
        A plan called "{{ name.trim() }}" already exists on this team. Saving
        replaces it.
      </p>
      <button
        type="button" class="btn btn--go" :disabled="busy"
        data-plan-save @click="onSave"
      >{{ busy ? 'Saving…' : 'Save plan' }}</button>
    </section>

    <section v-if="copyable" class="block" data-plan-active>
      <h3 class="block__h kicker">"{{ copyable.name }}"</h3>

      <label class="field">
        <span class="fld__label kicker">Rename to</span>
        <input v-model="renameTo" type="text" class="input input--wide" data-plan-rename-to />
      </label>
      <button type="button" class="btn" data-plan-rename @click="onRename">Rename</button>

      <label class="field fld--top">
        <span class="fld__label kicker">Copy to another team</span>
        <select v-model="target" class="input input--wide" data-plan-copy-target>
          <option value="">— pick a team —</option>
          <option v-for="t in planner.copyTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </label>
      <p class="note">
        Only teams you coach are listed — the database refuses a write to any
        other, so offering one would be a control that always fails.
      </p>
      <button type="button" class="btn" data-plan-copy @click="onCopy">Copy</button>

      <div class="danger">
        <button type="button" class="btn btn--danger" data-plan-delete @click="onDelete">
          Delete this plan
        </button>
      </div>
    </section>

    <p v-else class="note" data-plan-none-active>
      Load a saved plan to rename, copy or delete it. Copying matches on the
      plan's name, so it needs one that has actually been saved.
    </p>

    <p v-if="notice" class="note note--good" role="status" data-plan-notice>{{ notice }}</p>
    <p v-if="error" class="note note--bad" role="alert" data-plan-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.block { padding-bottom: var(--space-3); margin-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.block:last-of-type { border-bottom: 0; }

.block__h { margin: 0 0 var(--space-2); }

.field { margin-bottom: var(--space-2); }
.fld--top { margin-top: var(--space-3); }

.danger { margin-top: var(--space-4); padding-top: var(--space-2); border-top: 1px solid var(--rule); }
</style>
