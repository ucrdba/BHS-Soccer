<script setup lang="ts">
/**
 * Drill categories.
 *
 * Coach-visible rather than admin-only: `soccer_categories_write` in
 * `supabase_migration_auth.sql` allows coach or admin, so offering these to a
 * coach does not produce a control the database refuses.
 *
 * **`drills_bank.category` is free TEXT, not a foreign key.** A drill can
 * carry a name no category row has, and on the live data many do. Those are
 * shown as their own group — "used by drills, not defined" — so the drift is
 * visible rather than silent, and each can be adopted as a real category or
 * merged into one.
 *
 * Every destructive action says how many drills it moves, because that is
 * what makes retiring or merging a decision rather than a guess.
 *
 * ---
 *
 * **This list belongs to one organization**, as of migration 0027. Before it
 * `soccer_categories` had no `school_id` at all and `name` was globally
 * UNIQUE, so every organization shared one list, a club coach was shown
 * Beaumont's categories, and two clubs could not both have a "Possession" —
 * the second save updated the first's row.
 *
 * Every call from here therefore passes the resolved organization, including
 * the rename and merge, which work by NAME: unscoped, merging a club's
 * "Warmup" re-tagged Beaumont's drills and retired their category of that
 * name. The screen renders nothing until `schoolId` resolves rather than
 * falling back, because `requireOrg`'s fallback is Beaumont.
 */
import { ref, computed, onMounted } from 'vue';
import { supabaseService } from '../../data/supabase';

const props = defineProps<{ schoolId: string | null }>();

const categories = ref<any[]>([]);
const usage = ref<Record<string, number>>({});
const loading = ref(false);
const loadError = ref<string | null>(null);
const notice = ref<string | null>(null);
const error = ref<string | null>(null);

const newName = ref('');
const editingId = ref<string | null>(null);
const editName = ref('');
/** Where a stray category is being merged to. */
const mergeTo = ref<Record<string, string>>({});

const defined = computed(() => categories.value.map((c: any) => ({
  ...c,
  drills: usage.value[(c.name || '').trim()] || 0
})));

/** Names drills use that no category row defines. */
const strays = computed(() => {
  const known = new Set(categories.value.map((c: any) => (c.name || '').trim()));
  return Object.keys(usage.value)
    .filter(name => name && !known.has(name))
    .map(name => ({ name, drills: usage.value[name] }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const [rows, counts] = await Promise.all([
      props.schoolId ? supabaseService.fetchSoccerCategories(props.schoolId) : Promise.resolve([]),
      supabaseService.fetchCategoryUsage(props.schoolId)
    ]);
    if (rows === null || counts === null) {
      loadError.value = 'Could not load the categories.';
      return;
    }
    categories.value = rows as any[];
    usage.value = counts;
  } catch {
    loadError.value = 'Could not load the categories.';
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

async function onAdd(): Promise<void> {
  const name = newName.value.trim();
  if (!name) { error.value = 'Give the category a name.'; return; }
  if (!props.schoolId) { error.value = 'No organization for this team.'; return; }

  const res = await supabaseService.upsertSoccerCategory(props.schoolId, { name });
  if (report(res, `"${name}" added.`)) { newName.value = ''; await load(); }
}

function startEdit(c: any): void {
  editingId.value = c.id;
  editName.value = c.name;
}

async function onRename(c: any): Promise<void> {
  const to = editName.value.trim();
  const res = await supabaseService.renameSoccerCategory(props.schoolId, c.id, c.name, to);

  if (report(res, `Renamed to "${to}"${res?.drillsUpdated ? `, moving ${res.drillsUpdated} drills.` : '.'}`)) {
    editingId.value = null;
    await load();
  }
}

async function onRetire(c: any): Promise<void> {
  // Named in specifics: how many drills, and what happens to them.
  const ok = window.confirm(
    c.drills > 0
      ? `Retire "${c.name}"?\n\nIt is used by ${c.drills} drill${c.drills === 1 ? '' : 's'}, `
        + 'which keep the name — it simply stops being offered as a choice.'
      : `Retire "${c.name}"?\n\nNo drills use it, so nothing else changes.`
  );
  if (!ok) return;

  const res = await supabaseService.retireSoccerCategory(c.id);
  if (report(res, `Retired "${c.name}".`)) await load();
}

async function onMergeStray(stray: any): Promise<void> {
  const to = mergeTo.value[stray.name];
  if (!to) { error.value = 'Pick a category to merge into.'; return; }

  const ok = window.confirm(
    `Merge "${stray.name}" into "${to}"?\n\n`
    + `${stray.drills} drill${stray.drills === 1 ? '' : 's'} will be re-tagged. `
    + 'This cannot be undone in one step — you would have to re-tag them back.'
  );
  if (!ok) return;

  const res = await supabaseService.mergeSoccerCategory(props.schoolId, stray.name, to);
  if (report(res, `Merged "${stray.name}" into "${to}".`)) await load();
}

async function onAdoptStray(stray: any): Promise<void> {
  if (!props.schoolId) { error.value = 'No organization for this team.'; return; }

  const res = await supabaseService.upsertSoccerCategory(props.schoolId, { name: stray.name });
  if (report(res, `"${stray.name}" is now a real category.`)) await load();
}
</script>

<template>
  <section class="sec" data-categories-section>
    <h2 class="sec__h">Drill categories</h2>

    <p v-if="loading" class="note">Loading…</p>
    <p v-else-if="loadError" class="note note--bad" role="alert" data-categories-error>
      {{ loadError }}
    </p>

    <template v-else>
      <div v-for="c in defined" :key="c.id" class="row" data-category-row>
        <div class="row__what">
          <template v-if="editingId === c.id">
            <input v-model="editName" type="text" class="inp" data-category-edit-name />
          </template>
          <template v-else>
            <strong class="row__name" data-category-name>{{ c.name }}</strong>
          </template>

          <span class="tag tag--quiet" data-category-usage>
            {{ c.drills }} drill{{ c.drills === 1 ? '' : 's' }}
          </span>
        </div>

        <div class="row__acts">
          <template v-if="editingId === c.id">
            <button type="button" class="btn" data-category-save @click="onRename(c)">Save</button>
            <button type="button" class="btn" @click="editingId = null">Cancel</button>
          </template>
          <template v-else>
            <button
              type="button" class="btn" :data-category-edit="c.id" @click="startEdit(c)"
            >Rename</button>
            <button
              type="button" class="btn" :data-category-retire="c.id" @click="onRetire(c)"
            >Retire</button>
          </template>
        </div>
      </div>

      <form class="add" data-category-add-form @submit.prevent="onAdd">
        <input
          v-model="newName" type="text" class="inp"
          placeholder="New category" data-category-new
        />
        <button type="submit" class="btn btn--go" data-category-add>Add</button>
      </form>

      <template v-if="strays.length">
        <h3 class="sub">Used by drills, not defined</h3>
        <p class="sec__note">
          <code>drills_bank.category</code> is free text rather than a link, so
          a drill can carry a name no category has. Adopt one to make it real,
          or merge it into a category that already exists.
        </p>

        <div v-for="s in strays" :key="s.name" class="row" data-stray-row>
          <div class="row__what">
            <strong class="row__name" data-stray-name>{{ s.name }}</strong>
            <span class="tag tag--quiet">{{ s.drills }} drill{{ s.drills === 1 ? '' : 's' }}</span>
          </div>

          <div class="row__acts">
            <button
              type="button" class="btn" :data-stray-adopt="s.name" @click="onAdoptStray(s)"
            >Adopt</button>

            <select v-model="mergeTo[s.name]" class="inp" :data-stray-merge-pick="s.name">
              <option value="">— merge into —</option>
              <option v-for="c in defined" :key="c.id" :value="c.name">{{ c.name }}</option>
            </select>
            <button
              type="button" class="btn" :data-stray-merge="s.name" @click="onMergeStray(s)"
            >Merge</button>
          </div>
        </div>
      </template>
    </template>

    <p v-if="notice" class="note note--good" role="status" data-categories-notice>{{ notice }}</p>
    <p v-if="error" class="note note--bad" role="alert" data-categories-action-error>{{ error }}</p>
  </section>
</template>

<style scoped>
.sec { margin-bottom: 2rem; }

.sec__h {
  margin: 0 0 0.5rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.sub {
  margin: 1rem 0 0.3rem;
  color: var(--bhs-gold-accent);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sec__note {
  margin: 0 0 0.5rem;
  max-width: 40rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.78rem;
  line-height: 1.5;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--bhs-navy-border);
}

.row__what { display: flex; gap: 0.4rem; align-items: baseline; }
.row__name { color: var(--ink); font-size: 0.88rem; }
.row__acts { display: flex; gap: 0.3rem; flex-wrap: wrap; }

.tag {
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  color: var(--bhs-cyan-accent);
  font-size: 0.68rem;
}

.tag--quiet { color: var(--text-muted, #94a3b8); }

.add { display: flex; gap: 0.35rem; margin-top: 0.7rem; }

.inp {
  padding: 0.28rem 0.45rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: var(--bhs-navy-bg);
  color: var(--ink);
  font: inherit;
  font-size: 0.82rem;
}

.note { margin: 0.6rem 0 0; color: var(--text-muted, #94a3b8); font-size: 0.83rem; line-height: 1.5; }
.note--bad { color: var(--color-danger, #f87171); }
.note--good { color: var(--bhs-cyan-accent); }

.btn {
  padding: 0.26rem 0.55rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}

.btn--go { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }

code { font-size: 0.9em; }
</style>
