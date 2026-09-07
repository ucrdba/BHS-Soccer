<script setup lang="ts">
/**
 * A fixture's team sheet.
 *
 * **It works entirely by clicking.** Pick a player, tap a slot — and drag as
 * well, for anyone who prefers it. Drag-only is the mistake the legacy
 * planner makes: a coach setting a lineup on a phone at the touchline cannot
 * drag a card reliably, and a keyboard cannot drag at all.
 *
 * The pitch is laid out from the formation's own percentage coordinates, so
 * a slot sits where `domain/lineup.ts` says it does rather than where a
 * stylesheet guesses.
 */
import { ref, computed, watch } from 'vue';
import ToolScreen from '../layout/ToolScreen.vue';
import { useLineupStore } from '../../stores/lineup';
import {
  lineupSquad, lineupBench, lineupShortName, lineupGrade
} from '../../domain/lineup';

const props = defineProps<{
  /** The fixture, or null for a sheet not tied to one. */
  matchId: string | null;
  matchLabel?: string;
  /** This squad's own full-match length, from the team record. */
  matchMinutes: number;
  teamId: string | null;
  schoolId: string | null;
  players: any[];
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const lineup = useLineupStore();

/** The player waiting to be placed by a tap. */
const picked = ref<string | null>(null);
const notice = ref<string | null>(null);
const saving = ref(false);

const FORMATIONS = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-4-1-1'];

// Straight from the domain rather than through the store: these are pure
// functions of the players prop, and a store's returned functions are stubbed
// out in component tests.
const squad = computed(() => lineupSquad(props.players));
const bench = computed(() =>
  lineupBench(lineup.assignments, squad.value, lineup.formation, lineup.dressed));
const byId = computed(() => new Map(squad.value.map((p: any) => [p.id, p])));

const title = computed(() => 'Lineup');
const kicker = computed(() =>
  props.matchLabel ? `vs ${props.matchLabel}` : 'No fixture');

watch(() => props.matchId, () => {
  picked.value = null;
  notice.value = null;
  lineup.load(props.teamId, props.matchId);
}, { immediate: true });

function playerIn(slot: string): any {
  return byId.value.get(lineup.assignments[slot]) || null;
}

/**
 * One tap does the obvious thing.
 *
 * With a player picked, the slot takes them. With none, tapping an occupied
 * slot picks that player up — which is how a coach swaps two without going
 * back to the bench.
 */
function onSlot(slot: string): void {
  if (picked.value) {
    lineup.place(picked.value, slot);
    picked.value = null;
    return;
  }
  const there = playerIn(slot);
  if (there) picked.value = there.id;
}

function onBenchPlayer(playerId: string): void {
  picked.value = picked.value === playerId ? null : playerId;
}

function onClearSlot(slot: string): void {
  lineup.clear(slot);
  picked.value = null;
}

/* Drag, for anyone who prefers it. */
const dragId = ref<string | null>(null);
const dragFrom = ref<string | null>(null);

function onDragStart(playerId: string, fromSlot: string | null): void {
  dragId.value = playerId;
  dragFrom.value = fromSlot;
}

function onDropSlot(slot: string): void {
  if (!dragId.value) return;
  lineup.drop({ playerId: dragId.value, fromSlot: dragFrom.value || undefined, overSlot: slot });
  dragId.value = null;
  dragFrom.value = null;
}

function onDropBench(): void {
  if (!dragId.value) return;
  lineup.drop({ playerId: dragId.value, fromSlot: dragFrom.value || undefined, overSquad: true });
  dragId.value = null;
  dragFrom.value = null;
}

async function onSave(): Promise<void> {
  notice.value = null;
  saving.value = true;
  try {
    const res = await lineup.save(props.teamId, props.schoolId, props.players);
    if (!res?.ok) { notice.value = res?.error || 'Could not save that lineup.'; return; }

    emit('saved');
    emit('close');
  } finally {
    saving.value = false;
  }
}

const shortName = lineupShortName;
const grade = lineupGrade;
</script>

<template>
  <ToolScreen
    :title="title" :kicker="kicker"
    :back-to="{ name: 'schedule' }" back-label="Schedule"
  >
    <template #top-right>
      <label class="fld">
        <span class="sr-only">Formation</span>
        <select
          class="formation" data-formation
          :value="lineup.formation"
          @change="lineup.setFormation(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in FORMATIONS" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
    </template>

    <p class="length" data-lineup-length>
      {{ matchMinutes }}-minute match. Every per-match rate divides by it.
    </p>
    <p class="hint" data-lineup-hint>Tap a player, then tap a position. Dragging works too.</p>

    <div class="pitch" data-lineup-pitch @dragover.prevent>
      <div
        v-for="s in lineup.slots" :key="s.slot"
        class="slot" :class="{ 'is-filled': !!playerIn(s.slot), 'is-target': !!picked }"
        :style="{ left: `${s.x}%`, bottom: `${s.y}%` }"
        :data-slot="s.slot"
        draggable="true"
        @click="onSlot(s.slot)"
        @dragstart="onDragStart(lineup.assignments[s.slot], s.slot)"
        @dragover.prevent
        @drop.prevent="onDropSlot(s.slot)"
      >
        <span class="slot__pos">{{ s.slot }}</span>
        <template v-if="playerIn(s.slot)">
          <span class="slot__name" data-slot-name>{{ shortName(playerIn(s.slot)) }}</span>
          <span class="slot__meta">
            <span v-if="playerIn(s.slot).number != null">{{ playerIn(s.slot).number }}</span>
            <span v-if="grade(playerIn(s.slot))" data-slot-grade>· {{ grade(playerIn(s.slot)) }}</span>
          </span>
          <button
            type="button" class="slot__x" aria-label="Clear this position"
            data-slot-clear @click.stop="onClearSlot(s.slot)"
          >&times;</button>
        </template>
      </div>
    </div>

    <p class="kicker bench__h">Bench · tap to place <span class="tnum">{{ bench.length }}</span></p>

    <div class="bench" data-lineup-bench @dragover.prevent @drop.prevent="onDropBench">
      <button
        v-for="p in bench" :key="p.id"
        type="button" class="chip" :class="{ 'is-picked': picked === p.id }"
        :data-bench-player="p.id"
        draggable="true"
        @click="onBenchPlayer(p.id)"
        @dragstart="onDragStart(p.id, null)"
      >
        <span v-if="p.number != null" class="chip__no tnum">{{ p.number }}</span>
        <span class="chip__name">{{ shortName(p) }}</span>
        <span v-if="grade(p)" class="chip__grade">{{ grade(p) }}</span>
      </button>

      <p v-if="bench.length === 0" class="hint">Everyone available is on the pitch.</p>
    </div>

    <label class="fld fld--wide">
      <span class="fld__label">Notes</span>
      <textarea v-model="lineup.notes" class="inp inp--wide" rows="2" data-lineup-notes />
    </label>

    <p v-if="notice" class="hint hint--bad" role="alert" data-lineup-error>{{ notice }}</p>

    <template #foot>
      <button
        type="button" class="toolbtn toolbtn--go" :disabled="saving"
        data-lineup-save @click="onSave"
      >{{ saving ? 'Saving…' : 'Save lineup' }}</button>
      <RouterLink
        v-if="matchId" class="toolbtn" data-lineup-golive
        :to="{ name: 'live', params: { matchId } }"
      >Go live</RouterLink>
    </template>
  </ToolScreen>
</template>

<style scoped>
.fld { display: block; }
.fld--wide { margin-top: var(--space-3); }

.fld__label {
  display: block;
  margin-bottom: 4px;
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.formation {
  appearance: none;
  -webkit-appearance: none;
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--mark);
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.inp {
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
}

.inp--wide { width: 100%; }
.inp:focus-visible { border-color: var(--live); outline-offset: 0; }

.length { font-size: 12px; color: var(--ink-muted); }
.length::first-line { color: var(--ink); }

/*
 * The pitch is a fixed dark green whatever ground the page is on, so its own
 * text colour is pinned rather than taken from --ink. The grid line is the
 * halfway line.
 */
.pitch {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  max-height: 46vh;
  margin: var(--space-3) auto 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  --pitch-ink: #F8FAFC;
  background:
    linear-gradient(to top, color-mix(in srgb, var(--pitch-ink) 5%, transparent) 0 1px, transparent 1px) center 50% / 100% 100% no-repeat,
    #163d16;
  overflow: hidden;
}

.slot {
  position: absolute;
  transform: translate(-50%, 50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 2px 4px;
  border: 1.5px dashed color-mix(in srgb, var(--pitch-ink) 40%, transparent);
  border-radius: 50%;
  background: rgb(0 0 0 / 0.35);
  color: var(--pitch-ink);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.slot.is-filled { border-style: solid; border-color: var(--live); }
.slot.is-target { border-color: var(--mark); }

.slot__pos { font-size: 8.5px; letter-spacing: 0.06em; color: color-mix(in srgb, var(--pitch-ink) 70%, transparent); }
.slot__name { font-family: var(--font-display); font-size: 12px; }
.slot__meta { font-size: 9px; color: color-mix(in srgb, var(--pitch-ink) 70%, transparent); }

.slot__x {
  position: absolute;
  top: -6px;
  right: -6px;
  padding: 1px 5px;
  border: 0;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.7);
  color: var(--pitch-ink);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.bench__h { margin-top: var(--space-4); color: var(--ink-muted); }

.bench {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.chip {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 52px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.chip.is-picked { border-color: var(--mark); }
.chip__no { font-family: var(--font-display); font-size: 17px; color: var(--mark); }
.chip__name { font-size: 12px; line-height: 1.25; min-width: 0; }
.chip__grade { margin-left: auto; font-size: 10px; color: var(--ink-muted); }

.hint { margin-top: var(--space-2); font-size: 12px; line-height: 1.5; color: var(--ink-muted); }
.hint--bad { color: var(--color-warning); }

/* The footer bar's buttons: big enough for a coach watching the game. */
.toolbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 52px;
  padding: 0 var(--space-4);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--ink-muted);
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
}

.toolbtn--go { border: 1.5px solid var(--live); color: var(--live); }
.toolbtn:disabled { opacity: 0.55; cursor: default; }

@media (min-width: 768px) {
  .bench { grid-template-columns: repeat(3, 1fr); }
  .pitch { max-height: 52vh; }
}
</style>
