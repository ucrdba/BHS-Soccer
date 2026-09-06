<script setup lang="ts">
/**
 * Coaching Staff, and the accounts waiting to be let in.
 *
 * Cut out of public/js/views/planner.view.js:530, where it sat among 1,800
 * lines belonging to the practice planner. Nothing else came with it.
 *
 * The approval queue lives here rather than in the admin panel because this
 * is the screen about who is on the staff, and letting someone in is the same
 * question. It is only fetched for a coach or admin, and RLS enforces that
 * regardless of what this component does.
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
  store.loadPending(id);
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

async function onApprove(userId: string, name: string): Promise<void> {
  const res = await store.approve(userId, schoolId.value);
  notice.value = res?.ok ? `${name} approved.` : (res?.error || 'Could not approve.');
}

async function onReject(userId: string, name: string): Promise<void> {
  if (!window.confirm(`Reject ${name}'s request for access?`)) return;
  const res = await store.reject(userId, schoolId.value);
  notice.value = res?.ok ? `${name} rejected.` : (res?.error || 'Could not reject.');
}
</script>

<template>
  <section class="staff">
    <header class="staff__head">
      <div>
        <h1 class="staff__title">Coaching Staff</h1>
        <p v-if="org.branding.name" class="staff__org">{{ org.branding.name }}</p>
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

    <!-- Waiting to be let in. Coaches and admins only. -->
    <section v-if="canEdit && store.pending.length" class="queue" data-pending-queue>
      <h2 class="queue__title">Waiting for approval</h2>
      <ul class="queue__list">
        <li v-for="u in store.pending" :key="u.id" class="queue__row" data-pending-row>
          <span class="queue__who">
            <strong>{{ u.name || u.email }}</strong>
            <span class="queue__meta">{{ u.email }} · asked for {{ u.role }}</span>
          </span>
          <span class="queue__acts">
            <button type="button" class="btn btn--small btn--go" data-approve
                    @click="onApprove(u.id, u.name || u.email)">Approve</button>
            <button type="button" class="btn btn--small btn--plain" data-reject
                    @click="onReject(u.id, u.name || u.email)">Reject</button>
          </span>
        </li>
      </ul>
    </section>

    <p v-if="!settled" class="empty">Loading the coaching staff…</p>
    <p v-else-if="store.staff.length === 0" class="empty" data-empty>
      No coaching staff listed yet.<template v-if="canEdit"> Add someone to get started.</template>
    </p>

    <div v-else class="grid">
      <article v-for="c in store.staff" :key="c.id" class="card" data-coach>
        <img class="card__photo" :src="photoOrPlaceholder(c.photo, 'coach')" :alt="''" />
        <div class="card__body">
          <h2 class="card__name">{{ c.name }}</h2>
          <p class="card__level">{{ c.level }}</p>
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
.staff { max-width: 66rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }

.staff__head {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.staff__title { margin: 0; color: #fff; font-size: 1.4rem; }

.staff__org {
  margin: 0.25rem 0 0;
  color: var(--bhs-cyan-accent);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.queue {
  margin-bottom: 1.75rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--bhs-gold-accent);
  border-radius: 8px;
}

.queue__title {
  margin: 0 0 0.6rem;
  color: var(--bhs-gold-accent);
  font-size: 0.76rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.queue__list { margin: 0; padding: 0; list-style: none; }

.queue__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0;
}

.queue__who { display: flex; flex-direction: column; color: #fff; font-size: 0.9rem; }
.queue__meta { color: var(--text-muted, #94a3b8); font-size: 0.76rem; }
.queue__acts { display: flex; gap: 0.4rem; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
  gap: 1rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.1rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 10px;
  background: var(--bhs-navy-card);
}

.card__photo {
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 50%;
  border: 2px solid var(--bhs-gold-accent);
  object-fit: cover;
  background: var(--bhs-navy-bg);
}

.card__name { margin: 0; color: #fff; font-size: 1.05rem; }

.card__level {
  margin: 0.15rem 0 0;
  color: var(--bhs-cyan-accent);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.card__bio {
  margin: 0.6rem 0 0;
  color: var(--text-muted, #94a3b8);
  font-size: 0.84rem;
  line-height: 1.5;
}

.card__contact { margin: 0.5rem 0 0; font-size: 0.8rem; }
.card__contact a { color: var(--bhs-cyan-accent); }

.card__admin { display: flex; gap: 0.4rem; }

.empty { padding: 3rem 1rem; color: var(--text-muted, #94a3b8); text-align: center; }

.notice {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 1rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--bhs-cyan-accent);
  border-radius: 6px;
  color: var(--bhs-cyan-accent);
  font-size: 0.85rem;
}

.notice--bad { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }
.notice__x { border: 0; background: none; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; }

.btn {
  padding: 0.55rem 1rem;
  border: 1px solid transparent;
  border-radius: 6px;
  font: inherit;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn--small { padding: 0.3rem 0.6rem; font-size: 0.74rem; }
.btn--go { background: var(--bhs-cyan-accent); color: var(--bhs-navy-bg); }
.btn--plain { border-color: var(--bhs-navy-border); background: transparent; color: var(--text-muted, #94a3b8); }
.btn--danger { border-color: var(--bhs-navy-border); background: transparent; color: var(--text-muted, #94a3b8); }
.btn--danger:hover { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }
</style>
