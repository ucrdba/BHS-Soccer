<script setup lang="ts">
/**
 * The organization's drill library.
 *
 * Shared by every team in the organization — `drills_bank` is school-scoped,
 * not team-scoped, so a drill written here is available to the club's other
 * squads and to the Competitive Matrix.
 *
 * **The matrix weight is shown but not edited here.** `points` and `measure`
 * are what the Matrix scores a session against, and they already have an
 * editor on Player Ratings. Two editors for one column is how the two drift,
 * so this one says what the weight is and where to change it.
 *
 * `duration` is displayed when a row carries one, but `drills_bank` has no
 * such column — `upsertDrillBankItem` never writes it. It survives only on
 * rows that came from an import, which is why nothing here offers to set it.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { usePlannerStore } from '../../stores/planner';

const props = defineProps<{ open: boolean; schoolId: string | null }>();
const emit = defineEmits<{ close: []; use: [any] }>();

const planner = usePlannerStore();

const editingId = ref<string | null>(null);
const name = ref('');
const category = ref('');
const notes = ref('');
const error = ref<string | null>(null);
const busy = ref(false);

const drills = computed(() =>
  (planner.drillsBank || []).filter((d: any) => !d.is_deleted && !d.isDeleted));

const composing = computed(() => editingId.value !== null);

watch(() => props.open, (open) => {
  if (!open) return;
  error.value = null;
  reset();
});

function reset(): void {
  editingId.value = null;
  name.value = '';
  category.value = '';
  notes.value = '';
}

function startNew(): void {
  reset();
  editingId.value = '';
}

function startEdit(drill: any): void {
  editingId.value = drill.id;
  name.value = drill.name || '';
  category.value = drill.category || '';
  notes.value = drill.coach_notes || drill.coachNotes || '';
}

async function onSave(): Promise<void> {
  error.value = null;

  const trimmed = name.value.trim();
  if (!trimmed) { error.value = 'Give the drill a name.'; return; }
  if (!props.schoolId) {
    // The library belongs to an organization; a bare write would be refused
    // or, worse, land in somebody else's.
    error.value = 'No organization for this team, so there is no library to add to.';
    return;
  }

  busy.value = true;
  try {
    const saved = await supabaseService.upsertDrillBankItem(props.schoolId, {
      id: editingId.value || undefined,
      name: trimmed,
      category: category.value.trim() || 'General',
      coachNotes: notes.value
    });
    if (!saved) { error.value = 'Could not save that drill.'; return; }

    await planner.loadDrillsBank(props.schoolId);
    reset();
  } finally {
    busy.value = false;
  }
}

async function onDelete(drill: any): Promise<void> {
  error.value = null;

  const ok = window.confirm(
    `Remove "${drill.name}" from the library?\n\n`
    + 'Sessions that already use it keep their copy; it just stops being offered.'
  );
  if (!ok) return;

  const res = await supabaseService.deleteDrillBankItem(drill.id);
  if (res === null) { error.value = 'Could not remove that drill.'; return; }
  if (props.schoolId) await planner.loadDrillsBank(props.schoolId);
}
</script>

<template>
  <BaseModal :open="open" title="Drill library" wide @close="emit('close')">
    <p class="lede">
      Shared by every team in this organization. A drill here can be dropped
      into any session, and the Competitive Matrix scores against the same list.
    </p>

    <p v-if="drills.length === 0" class="hint" data-library-empty>
      No drills in the library yet. Write one and it is available to every
      squad.
    </p>

    <div v-for="d in drills" :key="d.id" class="row" data-library-row>
      <div class="row__what">
        <strong class="row__name" data-library-name>{{ d.name }}</strong>
        <span class="tag">{{ d.category || 'General' }}</span>
        <span class="tag tag--quiet" data-library-weight>
          weight {{ Number(d.points ?? 3) }}
        </span>
        <span v-if="d.diagram_image || d.diagramImage" class="tag tag--quiet">diagram</span>
        <p v-if="d.coach_notes || d.coachNotes" class="row__notes">
          {{ d.coach_notes || d.coachNotes }}
        </p>
      </div>

      <div class="row__acts">
        <button type="button" class="mini" data-library-use @click="emit('use', d)">
          Use in this plan
        </button>
        <button type="button" class="mini" data-library-edit @click="startEdit(d)">Edit</button>
        <button type="button" class="mini mini--danger" data-library-delete @click="onDelete(d)">
          Remove
        </button>
      </div>
    </div>

    <p class="weights" data-weights-note>
      A drill's weight and how it is measured are set on Player Ratings, under
      Weights &amp; standards — they decide how the Matrix scores it.
    </p>

    <div v-if="composing" class="form" data-library-form>
      <label class="fld">
        <span class="fld__label">Drill</span>
        <input v-model="name" type="text" class="inp inp--wide" data-library-name-input />
      </label>

      <label class="fld">
        <span class="fld__label">Category</span>
        <input v-model="category" type="text" class="inp" placeholder="General" data-library-category />
      </label>

      <label class="fld">
        <span class="fld__label">Coach notes</span>
        <textarea v-model="notes" class="inp inp--wide" rows="3" data-library-notes />
      </label>
    </div>

    <p v-if="error" class="hint hint--bad" role="alert" data-library-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
      <button v-if="!composing" type="button" class="btn" data-library-new @click="startNew">
        Add a drill
      </button>
      <button
        v-else type="button" class="btn btn--primary" :disabled="busy"
        data-library-save @click="onSave"
      >{{ busy ? 'Saving…' : 'Save drill' }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.lede {
  margin: 0 0 0.9rem;
  max-width: 40rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.82rem;
  line-height: 1.5;
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

.row__what { flex: 1; min-width: 14rem; }
.row__name { color: #fff; font-size: 0.9rem; }

.row__notes {
  margin: 0.25rem 0 0;
  color: var(--text-muted, #94a3b8);
  font-size: 0.8rem;
  line-height: 1.5;
}

.tag {
  margin-left: 0.4rem;
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  color: var(--bhs-cyan-accent);
  font-size: 0.68rem;
}

.tag--quiet { color: var(--text-muted, #94a3b8); }

.row__acts { display: flex; gap: 0.3rem; flex-wrap: wrap; }

.weights {
  margin: 0.9rem 0 0;
  color: var(--text-muted, #94a3b8);
  font-size: 0.76rem;
  line-height: 1.5;
}

.form { margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid var(--bhs-navy-border); }

.fld { display: block; margin-bottom: 0.6rem; }

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

.hint { margin: 0.7rem 0 0; color: var(--text-muted, #94a3b8); font-size: 0.8rem; line-height: 1.5; }
.hint--bad { color: var(--color-danger, #f87171); }

.mini, .btn {
  padding: 0.22rem 0.55rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.btn { color: #fff; padding: 0.3rem 0.65rem; font-size: 0.78rem; }
.btn--primary { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
.btn:disabled { opacity: 0.55; cursor: default; }
.mini--danger:hover { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }
</style>
