<script setup lang="ts">
/**
 * Coaching Staff, and the accounts waiting to be let in.
 *
 * Cut out of public/js/views/planner.view.js:530, where it sat among 1,800
 * lines belonging to the practice planner. Nothing else came with it.
 *
 * The approval queue itself lives in the admin panel; this page says how many
 * are waiting and links there, so there is one queue rather than two that drift.
 */
import { ref, computed, watch } from 'vue';
import CoachFormModal from '../components/coaches/CoachFormModal.vue';
import { useCoachesStore, type CoachForm } from '../stores/coaches';
import { useOrganizationStore } from '../stores/organization';
import { useAuthStore } from '../stores/auth';
import { photoOrPlaceholder } from '../domain/player-row';
import type { Coach } from '../domain/coach-row';

const store = useCoachesStore();
const org = useOrganizationStore();
const auth = useAuthStore();

const canEdit = computed(() => auth.isCoach || auth.isAdmin);
const schoolId = computed(() => org.school?.id ?? null);

const editing = ref<Coach | null>(null);
const formOpen = ref(false);
const busy = ref(false);
const formError = ref<string | null>(null);
const notice = ref<string | null>(null);

const settled = computed(() => !store.loading && store.loadedSchoolId !== null);

watch(schoolId, (id) => {
  store.load(id);
  store.loadPending();
}, { immediate: true });

function openAdd(): void {
  editing.value = null;
  formError.value = null;
  formOpen.value = true;
}

function openEdit(c: Coach): void {
  editing.value = c;
  formError.value = null;
  formOpen.value = true;
}

async function onSave(f: CoachForm): Promise<void> {
  if (!schoolId.value) { formError.value = 'No organization resolved.'; return; }
  busy.value = true;
  formError.value = null;
  try {
    const res = editing.value
      ? await store.updateCoach(editing.value.id, f, schoolId.value)
      : await store.addCoach(f, schoolId.value);

    if (res?.ok) {
      formOpen.value = false;
      notice.value = editing.value ? 'Coach updated.' : 'Coach added.';
      return;
    }
    formError.value = res?.error || 'Could not save.';
  } finally {
    busy.value = false;
  }
}

async function onRemove(c: Coach): Promise<void> {
  if (!schoolId.value) return;
  if (!window.confirm(`Remove ${c.name} from the coaching staff?`)) return;
  const res = await store.removeCoach(c.id, schoolId.value);
  notice.value = res?.ok ? `${c.name} removed.` : (res?.error || 'Could not remove.');
}
</script>

<template>
  <section class="staff">
    <header class="staff__head">
      <div>
        <h1 class="staff__title">Coaching Staff</h1>
        <p v-if="org.branding.name" class="staff__org kicker">{{ org.branding.name }}</p>
      </div>
      <button v-if="canEdit" type="button" class="btn btn--go" data-add-coach @click="openAdd">
        + Add coach
      </button>
    </header>

    <p v-if="notice" class="notice" role="status" data-notice>
      {{ notice }}
      <button type="button" class="notice__x" aria-label="Dismiss" @click="notice = null">&times;</button>
    </p>
    <p v-if="store.loadError" class="notice notice--bad" role="alert" data-load-error>
      {{ store.loadError }}
    </p>

    <!-- One queue, in the admin panel. This says it exists. -->
    <p v-if="canEdit && store.pending.length" class="queue" data-pending-queue>
      <span data-pending-count>
        {{ store.pending.length }} {{ store.pending.length === 1 ? 'account is' : 'accounts are' }} waiting for approval.
      </span>
      <RouterLink :to="{ name: 'admin' }" class="btn btn--small btn--go" data-pending-review>Review</RouterLink>
    </p>

    <p v-if="!settled" class="empty">Loading the coaching staff…</p>
    <p v-else-if="store.staff.length === 0" class="empty" data-empty>
      No coaching staff listed yet.<template v-if="canEdit"> Add someone to get started.</template>
    </p>

    <div v-else class="grid">
      <article v-for="c in store.staff" :key="c.id" class="card" data-coach>
        <span class="plate card__plate" :class="{ 'plate--empty': !c.photo }">
          <img v-if="c.photo" class="plate__img" :src="photoOrPlaceholder(c.photo, 'coach')" :alt="''" />
          <span v-else class="plate__label">Photo</span>
        </span>
        <div class="card__body">
          <h2 class="card__name">{{ c.name }}</h2>
          <p class="card__level kicker">{{ c.level }}</p>
          <p v-if="c.bio" class="card__bio">{{ c.bio }}</p>
          <p v-if="c.email" class="card__contact">
            <a :href="`mailto:${c.email}`">{{ c.email }}</a>
          </p>
        </div>
        <div v-if="canEdit" class="card__admin">
          <button type="button" class="btn btn--small btn--plain" data-coach-edit
                  @click="openEdit(c)">Edit</button>
          <button type="button" class="btn btn--small btn--danger" data-coach-remove
                  @click="onRemove(c)">Remove</button>
        </div>
      </article>
    </div>

    <CoachFormModal
      v-if="canEdit"
      :open="formOpen" :coach="editing" :busy="busy" :error="formError"
      @close="formOpen = false" @save="onSave" />
  </section>
</template>

<style scoped>
.staff { padding: var(--space-4) var(--space-4) var(--space-8); }

.staff__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

.staff__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--mark); }
.staff__org { margin-top: var(--space-1); }

/* Says the queue exists, and points at the admin panel: an emphasised rule,
   not a filled panel. */
.queue {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin: var(--space-4) 0 var(--space-6);
  padding: var(--space-2) 0 var(--space-2) var(--space-3);
  border-left: 2px solid var(--rule-strong);
  color: var(--ink);
  font-size: 14px;
}

.grid { display: flex; flex-direction: column; }

/* A bordered, unfilled card (spec §5.1): the rule carries it, not a fill. */
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
}

.card__plate { width: 4.5rem; height: 4.5rem; }
.card__plate.plate--empty { border-style: dashed; background: transparent; }
.card__name { margin: 0; color: var(--ink); font-family: var(--heading-face); font-weight: 500; font-size: 18px; }
.card__level { margin-top: 2px; }
.card__bio { margin: var(--space-2) 0 0; color: var(--ink-muted); font-size: 13px; line-height: 1.55; }
.card__contact { margin: var(--space-1) 0 0; font-size: 13px; }
.card__contact a { color: var(--live); }
.card__admin { display: flex; gap: var(--space-1); }

.empty { padding: var(--space-8) var(--space-3); color: var(--ink-muted); text-align: center; }

.notice {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin: var(--space-3) 0 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 13px;
}
.notice--bad { border-left-color: var(--color-warning); }
.notice__x { border: 0; background: none; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; }

@media (min-width: 768px) {
  .staff { max-width: 64rem; margin: 0 auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr)); gap: var(--space-4); }
  .card { padding: var(--space-4); border: 1px solid var(--rule); border-radius: var(--radius-md); }
}
</style>
