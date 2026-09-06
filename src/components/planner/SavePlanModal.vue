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
      <h3 class="block__h">Save this session</h3>
      <label class="fld">
        <span class="fld__label">Plan name</span>
        <input v-model="name" type="text" class="inp inp--wide" data-plan-name />
      </label>
      <p v-if="willReplace" class="hint" data-plan-replace>
        A plan called "{{ name.trim() }}" already exists on this team. Saving
        replaces it.
      </p>
      <button
        type="button" class="btn btn--primary" :disabled="busy"
        data-plan-save @click="onSave"
      >{{ busy ? 'Saving…' : 'Save plan' }}</button>
    </section>

    <section v-if="copyable" class="block" data-plan-active>
      <h3 class="block__h">"{{ copyable.name }}"</h3>

      <label class="fld">
        <span class="fld__label">Rename to</span>
        <input v-model="renameTo" type="text" class="inp inp--wide" data-plan-rename-to />
      </label>
      <button type="button" class="btn" data-plan-rename @click="onRename">Rename</button>

      <label class="fld fld--top">
        <span class="fld__label">Copy to another team</span>
        <select v-model="target" class="inp inp--wide" data-plan-copy-target>
          <option value="">— pick a team —</option>
          <option v-for="t in planner.copyTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </label>
      <p class="hint">
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

    <p v-else class="hint" data-plan-none-active>
      Load a saved plan to rename, copy or delete it. Copying matches on the
      plan's name, so it needs one that has actually been saved.
    </p>

    <p v-if="notice" class="hint hint--good" role="status" data-plan-notice>{{ notice }}</p>
    <p v-if="error" class="hint hint--bad" role="alert" data-plan-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.block { padding-bottom: 0.9rem; margin-bottom: 0.9rem; border-bottom: 1px solid var(--bhs-navy-border); }
.block:last-of-type { border-bottom: 0; }

.block__h {
  margin: 0 0 0.6rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.74rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.fld { display: block; margin-bottom: 0.6rem; }
.fld--top { margin-top: 0.9rem; }

.fld__label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.inp {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: var(--bhs-navy-bg);
  color: #fff;
  font: inherit;
  font-size: 0.85rem;
}

.inp--wide { width: 100%; }

.hint { margin: 0.4rem 0; color: var(--text-muted, #94a3b8); font-size: 0.78rem; line-height: 1.5; }
.hint--good { color: var(--bhs-cyan-accent); }
.hint--bad { color: var(--color-danger, #f87171); }

.danger { margin-top: 1rem; padding-top: 0.7rem; border-top: 1px solid var(--bhs-navy-border); }

.btn {
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.btn--primary { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
.btn--danger { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }
.btn:disabled { opacity: 0.55; cursor: default; }
</style>
