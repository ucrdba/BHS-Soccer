<script setup lang="ts">
/**
 * Accounts waiting for approval.
 *
 * **The most consequential control in the application.** Approving a signup
 * hands somebody a coach's access to a squad of minors, so the confirmation
 * names the person and the role rather than asking "are you sure?".
 *
 * Rejecting is not deletion — it sets a status, and the panel says so,
 * because otherwise a coach will assume a mis-click is unrecoverable and
 * leave a real person locked out rather than ask.
 *
 * The list is scoped to the ORGANIZATION and never fetched bare.
 * `getPendingApprovals()` without one falls back to a legacy default, which
 * showed a club admin Beaumont's signups — a fixed bug this must not
 * reintroduce.
 */
import { ref, computed, watch } from 'vue';
import { auth } from '../../auth';

const props = defineProps<{ schoolId: string | null }>();

const pending = ref<any[] | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const notice = ref<string | null>(null);
const busyId = ref<string | null>(null);

const rows = computed(() => pending.value || []);

async function load(): Promise<void> {
  loadError.value = null;

  if (!props.schoolId) {
    // Never bare: the fallback is another organization's list.
    loadError.value = 'No organization resolved yet, so there is nobody to show.';
    pending.value = null;
    return;
  }

  loading.value = true;
  try {
    pending.value = await auth.getPendingApprovals(props.schoolId);
  } catch {
    // A failed read shown as "nobody is waiting" leaves a real person
    // waiting indefinitely.
    loadError.value = 'Could not load the accounts waiting for approval.';
    pending.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => props.schoolId, load, { immediate: true });

function describe(u: any): string {
  const role = String(u.requestedRole || u.role || 'access').toUpperCase();
  return `${u.name || u.email} — ${role}`;
}

async function onApprove(u: any): Promise<void> {
  const role = String(u.requestedRole || u.role || 'access').toUpperCase();
  const ok = window.confirm(
    `Give ${u.name || u.email} ${role} access?\n\n`
    + `They will be able to see and change whatever that role allows for this `
    + `organization. You can change it again afterwards.`
  );
  if (!ok) return;

  busyId.value = u.id;
  try {
    const done = await auth.approveUserAccess(u.id);
    notice.value = done
      ? `${u.name || u.email} approved.`
      : 'That approval was refused by the database.';
    if (done) await load();
  } finally {
    busyId.value = null;
  }
}

async function onReject(u: any): Promise<void> {
  const ok = window.confirm(
    `Refuse ${u.name || u.email}?\n\n`
    + `Their account is kept and marked as rejected rather than deleted, so `
    + `this can be undone by approving them later.`
  );
  if (!ok) return;

  busyId.value = u.id;
  try {
    const done = await auth.rejectUserAccess(u.id);
    notice.value = done
      ? `${u.name || u.email} refused. Their account is kept.`
      : 'That was refused by the database.';
    if (done) await load();
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <section class="sec" data-approvals>
    <h2 class="sec__h">
      Waiting for approval
      <span v-if="rows.length" class="sec__n" data-approvals-count>{{ rows.length }}</span>
    </h2>

    <p v-if="loading" class="note">Loading…</p>
    <p v-else-if="loadError" class="note note--bad" role="alert" data-approvals-error>
      {{ loadError }}
    </p>
    <p v-else-if="rows.length === 0" class="note" data-approvals-empty>
      Nobody is waiting.
    </p>

    <div v-for="u in rows" :key="u.id" class="row" data-approval-row>
      <div class="row__who">
        <strong class="row__name" data-approval-name>{{ u.name || 'No name given' }}</strong>
        <span class="row__email" data-approval-email>{{ u.email }}</span>
        <span class="tag" data-approval-role>
          asked for {{ String(u.requestedRole || u.role || 'access').toUpperCase() }}
        </span>
      </div>

      <div class="row__acts">
        <button
          type="button" class="btn btn--go" :disabled="busyId === u.id"
          data-approval-approve @click="onApprove(u)"
        >Approve</button>
        <button
          type="button" class="btn" :disabled="busyId === u.id"
          data-approval-reject @click="onReject(u)"
        >Refuse</button>
      </div>
    </div>

    <p v-if="notice" class="note note--good" role="status" data-approvals-notice>{{ notice }}</p>
  </section>
</template>

<style scoped>
.sec { margin-bottom: 2rem; }

.sec__h {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin: 0 0 0.6rem;
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

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--bhs-navy-border);
}

.row__who { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; }
.row__name { color: #fff; font-size: 0.9rem; }
.row__email { color: var(--text-muted, #94a3b8); font-size: 0.8rem; }

.tag {
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  color: var(--bhs-gold-accent);
  font-size: 0.68rem;
}

.row__acts { display: flex; gap: 0.35rem; }

.note { margin: 0.5rem 0 0; color: var(--text-muted, #94a3b8); font-size: 0.83rem; line-height: 1.5; }
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
.btn:disabled { opacity: 0.55; cursor: default; }
</style>
