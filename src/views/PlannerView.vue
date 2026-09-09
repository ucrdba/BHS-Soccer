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
import RoundRobinModal from '../components/planner/RoundRobinModal.vue';
import { usePlannerStore } from '../stores/planner';
import { useOrganizationStore } from '../stores/organization';
import { useRosterStore } from '../stores/roster';
import { useAuthStore } from '../stores/auth';
import { buildPrintDocument } from '../domain/plan-print';
import { diagramsForPlan } from '../diagram/raster';

const planner = usePlannerStore();
const org = useOrganizationStore();
const roster = useRosterStore();
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
const roundRobinOpen = ref(false);

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
  () => {
    planner.load(org.activeTeamId, schoolId.value);
    // The squad the round robin pairs up.
    if (isCoach.value) roster.load(org.activeTeamId);
  },
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
        <p v-if="org.branding.name" class="planner__org kicker">
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
        <button type="button" class="act" data-open-round-robin @click="roundRobinOpen = true">
          1v1 round robin
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
        <span class="bar__label kicker">Active plan</span>
        <strong class="bar__value">{{ planner.activePlanName || 'Unsaved session' }}</strong>
      </div>
      <div>
        <span class="bar__label kicker">Total session time</span>
        <strong class="bar__value" data-total-time>{{ planner.totalTime }}</strong>
      </div>
      <div>
        <span class="bar__label kicker">Drills</span>
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

    <RoundRobinModal
      v-if="isCoach"
      :open="roundRobinOpen" :team-id="org.activeTeamId" :players="roster.players"
      @close="roundRobinOpen = false" />

    <DiagramModal
      v-if="isCoach"
      :open="diagramOpen" :index="diagramIndex" :library-drill="diagramLibraryDrill"
      :team-id="org.activeTeamId" :school-id="schoolId"
      @close="diagramOpen = false" @saved="notice = 'Diagram saved.'" />
  </section>
</template>

<style scoped>
.planner { padding: var(--space-4) var(--space-4) var(--space-8); }

.planner__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

.planner__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.planner__sub { margin-top: var(--space-1); color: var(--ink-muted); font-size: 14px; line-height: 1.5; }
.planner__org { margin-top: var(--space-1); }
.planner__acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }

/* A control in the header strip. Outlined, like every other action. */
.act {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font-family: var(--heading-face);
  font-size: 14px;
  cursor: pointer;
}
.act:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
.act--go { border-color: var(--live); color: var(--live); }

/* The saved-plan picker. */
.picker { margin: var(--space-4) 0; padding: var(--space-3); border: 1px solid var(--rule); border-radius: var(--radius-md); }
.picker__row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; justify-content: space-between; padding: var(--space-1) 0; }
.picker__meta { color: var(--ink-muted); font-size: 12px; }
.picker__none { margin: var(--space-1) var(--space-1); color: var(--ink-muted); font-size: 13px; }

/* The running total for the session. */
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: baseline;
  margin: var(--space-4) 0;
  padding: var(--space-2) 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.bar__label { color: var(--ink-muted); }
.bar__value { color: var(--ink); font-family: var(--heading-face); font-weight: 500; font-size: 17px; font-variant-numeric: tabular-nums; }

.empty { padding: var(--space-8) var(--space-3); color: var(--ink-muted); text-align: center; line-height: 1.6; }

.list { margin: 0; padding: 0; list-style: none; }

/* A drill in the plan: a hairline row, selected by an accent keyline rather
   than a fill. */
.drill {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: baseline;
  justify-content: space-between;
  padding: var(--space-2);
  border: 1px solid transparent;
  border-bottom-color: var(--rule);
}
.drill.is-selected { border-color: var(--rule-strong); border-radius: var(--radius-md); }
.drill__what { display: flex; flex-direction: column; gap: 2px; }
.drill__name { color: var(--ink); font-size: 14px; }
.drill__when { color: var(--ink-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.drill__dur { color: var(--live); font-size: 12px; font-variant-numeric: tabular-nums; }
.drill__slot { color: var(--ink-muted); font-size: 12px; }
.drill__notes { width: 100%; margin-top: var(--space-1); color: var(--ink-muted); font-size: 13px; line-height: 1.5; }
.drill__diagram { display: inline-flex; align-items: center; gap: 4px; color: var(--live); font-size: 12px; }
.drill__acts { display: flex; gap: var(--space-1); }

/* The smallest control there is: a text button inside a row. */
.mini { padding: 0 var(--space-1); border: 0; background: none; color: var(--ink-muted); font: inherit; font-size: 12px; cursor: pointer; }
.mini:hover { color: var(--ink); }
.mini--danger:hover { color: var(--color-danger); }

.notice {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin: var(--space-3) 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 13px;
}
.notice--bad { border-left-color: var(--color-warning); }
.notice__x { border: 0; background: none; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; }

@media (min-width: 768px) { .planner { max-width: 64rem; margin: 0 auto; } }
</style>
