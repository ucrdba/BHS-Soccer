<script setup lang="ts">
/**
 * The practice timeline — a session as an ordered list of drills.
 *
 * Two things here are deliberately not what the legacy planner does.
 *
 * **Reordering has a keyboard path.** Drag is the only way to move a drill in
 * the legacy app, so a coach on a phone at training is dragging a list item
 * with a finger, and anyone using a keyboard cannot reorder at all. Move-up
 * and move-down are two controls that remove both problems; the drag stays.
 *
 * **The times are derived, never typed twice.** Every add, edit, delete and
 * reorder reflows the whole timeline, because the printed plan is read on a
 * touchline against a watch and a third drill that starts before the second
 * ends is worse than no times at all.
 */
import { ref, computed, watch } from 'vue';
import DrillFormModal from '../components/planner/DrillFormModal.vue';
import DrillsBankModal from '../components/planner/DrillsBankModal.vue';
import SavePlanModal from '../components/planner/SavePlanModal.vue';
import DiagramModal from '../components/planner/DiagramModal.vue';
import { usePlannerStore } from '../stores/planner';
import { useOrganizationStore } from '../stores/organization';
import { useAuthStore } from '../stores/auth';
import { buildPrintDocument } from '../domain/plan-print';
import { diagramsForPlan } from '../diagram/raster';

const planner = usePlannerStore();
const org = useOrganizationStore();
const auth = useAuthStore();

const isCoach = computed(() => auth.isCoach || auth.isAdmin);
const schoolId = computed(() => org.school?.id ?? null);

const picking = ref(false);
const notice = ref<string | null>(null);
const dragFrom = ref<number | null>(null);

const drillOpen = ref(false);
/** Null adds a drill; an index edits the one already there. */
const drillIndex = ref<number | null>(null);
const libraryOpen = ref(false);
const plansOpen = ref(false);

const diagramOpen = ref(false);
/** A drill on the timeline, or one handed over from the library. */
const diagramIndex = ref<number | null>(null);
const diagramLibraryDrill = ref<any>(null);

function openDiagram(index: number): void {
  diagramIndex.value = index;
  diagramLibraryDrill.value = null;
  diagramOpen.value = true;
}

function openLibraryDiagram(drill: any): void {
  libraryOpen.value = false;
  diagramIndex.value = null;
  diagramLibraryDrill.value = drill;
  diagramOpen.value = true;
}

function openAdd(): void { drillIndex.value = null; drillOpen.value = true; }
function openEdit(index: number): void { drillIndex.value = index; drillOpen.value = true; }

async function onDrillSaved(item: any): Promise<void> {
  const res = drillIndex.value === null
    ? await planner.addDrill(org.activeTeamId, item)
    : await planner.editDrill(org.activeTeamId, drillIndex.value, item);

  drillOpen.value = false;
  report(res, drillIndex.value === null ? 'Drill added.' : 'Drill saved.');
}

/**
 * A library drill dropped straight into the session.
 *
 * It brings its notes and its diagram with it, and lands at the end of the
 * timeline, where the drill form would have put it.
 */
async function onUseFromLibrary(drill: any): Promise<void> {
  libraryOpen.value = false;
  const res = await planner.addDrill(org.activeTeamId, {
    name: drill.name || 'Soccer Drill',
    time: '',
    duration: drill.duration || '20 min',
    coachNotes: drill.coach_notes || drill.coachNotes || '',
    diagramImage: drill.diagram_image || drill.diagramImage || null,
    diagramData: drill.diagram_data || drill.diagramData || null
  });
  report(res, `"${drill.name}" added to the plan.`);
}

const items = computed(() => planner.items);

watch(
  () => [org.activeTeamId, schoolId.value],
  () => { planner.load(org.activeTeamId, schoolId.value); },
  { immediate: true }
);

function report(res: { ok: boolean; error?: string }, done: string): void {
  notice.value = res?.ok ? done : (res?.error || 'That did not work.');
}

async function onMove(from: number, to: number): Promise<void> {
  if (to < 0 || to >= items.value.length) return;
  const res = await planner.move(org.activeTeamId, from, to);
  if (!res?.ok) notice.value = res?.error || 'Could not save the new order.';
}

async function onRemove(index: number): Promise<void> {
  const drill = items.value[index];
  if (!drill) return;

  const ok = window.confirm(
    `Remove "${drill.name}" from this practice plan?\n\n`
    + 'The rest of the session moves up to fill the time.'
  );
  if (!ok) return;

  report(await planner.removeDrill(org.activeTeamId, index), 'Drill removed.');
}

/**
 * Hand the plan to the browser's own print dialog.
 *
 * A rendered document rather than a PDF library, which would be a dependency
 * for a worse result. Diagrams are 4b's: the document leaves a slot for them.
 */
function onPrint(): void {
  const html = buildPrintDocument({
    planName: planner.activePlanName || 'Practice plan',
    organization: org.branding.name || '',
    team: org.activeTeam?.name || '',
    items: planner.items,
    // Rendered from the stored blobs, falling back to each drill's saved
    // thumbnail. A browser that refuses a canvas prints the plan without
    // them rather than not printing.
    diagrams: diagramsForPlan(planner.items)
  });
  if (!html) { notice.value = 'Add a drill before printing the plan.'; return; }

  const win = window.open('', '_blank');
  if (!win) {
    // A blocked pop-up is silent otherwise, and the coach just sees nothing
    // happen when they press print.
    notice.value = 'Your browser blocked the print window. Allow pop-ups for this site and try again.';
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function onChoosePlan(planId: string): void {
  planner.loadPlan(planId);
  picking.value = false;
  notice.value = null;
}

/* The drag path, kept alongside the buttons rather than replaced by them. */
function onDragStart(index: number): void { dragFrom.value = index; }
function onDragEnd(): void { dragFrom.value = null; }

async function onDrop(index: number): Promise<void> {
  const from = dragFrom.value;
  dragFrom.value = null;
  if (from === null || from === index) return;
  await onMove(from, index);
}
</script>

<template>
  <section class="planner">
    <header class="planner__head">
      <div>
        <h1 class="planner__title">Coach Planner</h1>
        <p class="planner__sub">
          Build a session as a timeline. The times reflow themselves, so a
          drill that runs long moves everything after it.
        </p>
        <p v-if="org.branding.name" class="planner__org">
          {{ org.branding.name }}
          <span v-if="org.activeTeam">· {{ org.activeTeam.name }}</span>
        </p>
      </div>

      <div v-if="isCoach" class="planner__acts">
        <button type="button" class="act act--go" data-add-drill @click="openAdd">
          Add a drill
        </button>
        <button type="button" class="act" data-open-library @click="libraryOpen = true">
          Drill library ({{ planner.drillsBank.length }})
        </button>
        <button type="button" class="act" data-load-plan @click="picking = !picking">
          Select a plan ({{ planner.savedPlans.length }})
        </button>
        <button type="button" class="act" data-open-plans @click="plansOpen = true">
          Save &amp; share
        </button>
        <button type="button" class="act" data-print-plan @click="onPrint">
          Print
        </button>
      </div>
    </header>

    <p v-if="notice" class="notice" role="status" data-notice>
      {{ notice }}
      <button type="button" class="notice__x" aria-label="Dismiss" @click="notice = null">&times;</button>
    </p>
    <p v-if="planner.loadError" class="notice notice--bad" role="alert" data-load-error>
      {{ planner.loadError }}
    </p>

    <div v-if="picking" class="picker" data-plan-picker>
      <p v-if="planner.savedPlans.length === 0" class="picker__none">
        No saved plans for this team yet. Build a session and save it under a name.
      </p>
      <button
        v-for="p in planner.savedPlans" :key="p.id"
        type="button" class="picker__row" data-plan-choice
        @click="onChoosePlan(p.id)"
      >
        <span class="picker__name">{{ p.name }}</span>
        <span class="picker__meta">{{ p.drills.length }} drills · {{ p.date }}</span>
      </button>
    </div>

    <div class="bar">
      <div>
        <span class="bar__label">Active plan</span>
        <strong class="bar__value">{{ planner.activePlanName || 'Unsaved session' }}</strong>
      </div>
      <div>
        <span class="bar__label">Total session time</span>
        <strong class="bar__value" data-total-time>{{ planner.totalTime }}</strong>
      </div>
      <div>
        <span class="bar__label">Drills</span>
        <strong class="bar__value" data-drill-count>{{ items.length }}</strong>
      </div>
    </div>

    <p v-if="items.length === 0" class="empty" data-plan-empty>
      This session is empty. Add a drill to start building it, or select a
      saved plan above.
    </p>

    <ol v-else class="list">
      <li
        v-for="(d, i) in items" :key="d.id || `${d.name}-${i}`"
        class="drill" :class="{ 'is-selected': planner.selectedIndex === i }"
        data-drill-row
        draggable="true"
        @click="planner.selectedIndex = i"
        @dragstart="onDragStart(i)"
        @dragover.prevent
        @drop.prevent="onDrop(i)"
        @dragend="onDragEnd"
      >
        <div class="drill__when">
          <span class="drill__slot">{{ d.time || '—' }}</span>
          <span class="drill__dur">{{ d.duration }}</span>
        </div>

        <div class="drill__what">
          <h2 class="drill__name" data-drill-name>{{ d.name }}</h2>
          <p v-if="d.coachNotes" class="drill__notes">{{ d.coachNotes }}</p>
          <img
            v-if="d.diagramImage" class="drill__diagram" :src="d.diagramImage"
            alt="" data-drill-thumb @click.stop="openDiagram(i)" />
        </div>

        <div class="drill__acts">
          <!-- Buttons as well as the drag: a finger on a phone at training
               cannot drag a list item, and a keyboard cannot drag at all. -->
          <button
            type="button" class="mini" title="Move earlier"
            :disabled="i === 0" data-move-up
            @click.stop="onMove(i, i - 1)"
          >↑</button>
          <button
            type="button" class="mini" title="Move later"
            :disabled="i === items.length - 1" data-move-down
            @click.stop="onMove(i, i + 1)"
          >↓</button>
          <button
            type="button" class="mini" data-drill-diagram
            @click.stop="openDiagram(i)"
          >{{ d.diagramData ? 'Diagram' : '+ Diagram' }}</button>
          <button
            type="button" class="mini" data-drill-edit
            @click.stop="openEdit(i)"
          >Edit</button>
          <button
            type="button" class="mini mini--danger" title="Remove from the plan"
            data-drill-remove
            @click.stop="onRemove(i)"
          >Remove</button>
        </div>
      </li>
    </ol>

    <DrillFormModal
      v-if="isCoach"
      :open="drillOpen" :index="drillIndex"
      @close="drillOpen = false" @save="onDrillSaved" />

    <DrillsBankModal
      v-if="isCoach"
      :open="libraryOpen" :school-id="schoolId"
      @close="libraryOpen = false" @use="onUseFromLibrary" @draw="openLibraryDiagram" />

    <SavePlanModal
      v-if="isCoach"
      :open="plansOpen" :team-id="org.activeTeamId"
      @close="plansOpen = false" />

    <DiagramModal
      v-if="isCoach"
      :open="diagramOpen" :index="diagramIndex" :library-drill="diagramLibraryDrill"
      :team-id="org.activeTeamId" :school-id="schoolId"
      @close="diagramOpen = false" @saved="notice = 'Diagram saved.'" />
  </section>
</template>

<style scoped>
.planner { max-width: 68rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }

.planner__head {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.planner__title { margin: 0; color: #fff; font-size: 1.4rem; }

.planner__sub {
  margin: 0.3rem 0 0;
  max-width: 44rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.88rem;
  line-height: 1.5;
}

.planner__org {
  margin: 0.4rem 0 0;
  color: var(--bhs-cyan-accent);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.planner__acts { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-start; }

.act--go { border-color: var(--bhs-gold-accent); color: var(--bhs-gold-accent); }

.act {
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--bhs-cyan-accent);
  border-radius: 6px;
  background: transparent;
  color: var(--bhs-cyan-accent);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.picker {
  margin-bottom: 1rem;
  padding: 0.5rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 8px;
}

.picker__none { margin: 0.4rem 0.3rem; color: var(--text-muted, #94a3b8); font-size: 0.82rem; }

.picker__row {
  display: flex;
  gap: 0.8rem;
  align-items: baseline;
  justify-content: space-between;
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.picker__row:hover { background: rgba(255, 255, 255, 0.05); }
.picker__meta { color: var(--text-muted, #94a3b8); font-size: 0.75rem; }

.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-bottom: 1rem;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 8px;
}

.bar__label {
  display: block;
  color: var(--text-muted, #94a3b8);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.bar__value { color: var(--bhs-cyan-accent); font-size: 0.95rem; }

.empty { padding: 3rem 1rem; color: var(--text-muted, #94a3b8); text-align: center; line-height: 1.6; }

.list { margin: 0; padding: 0; list-style: none; }

.drill {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  cursor: grab;
}

.drill.is-selected { border-color: var(--bhs-gold-accent); background: rgba(0, 71, 171, 0.18); }

.drill__when { min-width: 9.5rem; }
.drill__slot { display: block; color: #fff; font-size: 0.8rem; white-space: nowrap; }
.drill__dur { color: var(--bhs-cyan-accent); font-size: 0.74rem; }

.drill__what { flex: 1; }
.drill__name { margin: 0; color: #fff; font-size: 0.95rem; }

.drill__notes {
  margin: 0.25rem 0 0;
  color: var(--text-muted, #94a3b8);
  font-size: 0.82rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.drill__acts { display: flex; gap: 0.3rem; align-items: center; }

.drill__diagram {
  display: block;
  margin-top: 0.5rem;
  max-width: 18rem;
  border: 1px solid var(--bhs-gold-accent);
  border-radius: 6px;
  cursor: pointer;
}

.mini {
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.mini:disabled { opacity: 0.35; cursor: default; }
.mini--danger:hover { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }

.notice {
  margin: 0 0 1rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--bhs-cyan-accent);
  border-radius: 6px;
  color: var(--bhs-cyan-accent);
  font-size: 0.85rem;
}

.notice--bad { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }

.notice__x {
  float: right;
  border: 0;
  background: none;
  color: inherit;
  font-size: 1rem;
  cursor: pointer;
}
</style>
