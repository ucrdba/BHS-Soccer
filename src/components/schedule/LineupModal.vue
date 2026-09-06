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
import BaseModal from '../ui/BaseModal.vue';
import { useLineupStore } from '../../stores/lineup';
import { lineupShortName, lineupGrade } from '../../domain/lineup';

const props = defineProps<{
  open: boolean;
  /** The fixture, or null for a sheet not tied to one. */
  matchId: string | null;
  matchLabel?: string;
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

const squad = computed(() => lineup.squadOf(props.players));
const bench = computed(() => lineup.bench(props.players));
const byId = computed(() => new Map(squad.value.map((p: any) => [p.id, p])));

const title = computed(() =>
  props.matchLabel ? `Lineup — ${props.matchLabel}` : 'Lineup');

watch(() => [props.open, props.matchId] as const, () => {
  if (!props.open) return;
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
  <BaseModal :open="open" :title="title" wide @close="emit('close')">
    <div class="head">
      <label class="fld">
        <span class="fld__label">Formation</span>
        <select
          class="inp" data-formation
          :value="lineup.formation"
          @change="lineup.setFormation(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in FORMATIONS" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>

      <p class="hint" data-lineup-hint>
        Tap a player, then tap a position. Dragging works too.
      </p>
    </div>

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

    <h3 class="bench__h">
      Bench
      <span class="bench__n">{{ bench.length }}</span>
    </h3>

    <div class="bench" data-lineup-bench @dragover.prevent @drop.prevent="onDropBench">
      <button
        v-for="p in bench" :key="p.id"
        type="button" class="chip" :class="{ 'is-picked': picked === p.id }"
        :data-bench-player="p.id"
        draggable="true"
        @click="onBenchPlayer(p.id)"
        @dragstart="onDragStart(p.id, null)"
      >
        <span v-if="p.number != null" class="chip__no">{{ p.number }}</span>
        {{ shortName(p) }}
        <span v-if="grade(p)" class="chip__grade">{{ grade(p) }}</span>
      </button>

      <p v-if="bench.length === 0" class="hint">Everyone available is on the pitch.</p>
    </div>

    <label class="fld fld--wide">
      <span class="fld__label">Notes</span>
      <textarea v-model="lineup.notes" class="inp inp--wide" rows="2" data-lineup-notes />
    </label>

    <p v-if="notice" class="hint hint--bad" role="alert" data-lineup-error>{{ notice }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button
        type="button" class="btn btn--primary" :disabled="saving"
        data-lineup-save @click="onSave"
      >{{ saving ? 'Saving…' : 'Save lineup' }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; gap: 0.9rem; align-items: flex-end; margin-bottom: 0.7rem; }

.fld { display: block; }
.fld--wide { margin-top: 0.7rem; }

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

.pitch {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  max-height: 60vh;
  margin: 0 auto;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 8px;
  background:
    linear-gradient(to top, rgba(255,255,255,0.05) 0 1px, transparent 1px) center 50% / 100% 100% no-repeat,
    #163d16;
  overflow: hidden;
}

.slot {
  position: absolute;
  transform: translate(-50%, 50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 3.6rem;
  padding: 0.2rem 0.3rem;
  border: 1px dashed rgba(255, 255, 255, 0.4);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}

.slot.is-filled { border-style: solid; border-color: var(--bhs-cyan-accent); }
.slot.is-target { border-color: var(--bhs-gold-accent); }

.slot__pos { color: var(--text-muted, #94a3b8); font-size: 0.6rem; letter-spacing: 0.06em; }
.slot__name { font-size: 0.72rem; }
.slot__meta { color: var(--text-muted, #94a3b8); font-size: 0.6rem; }

.slot__x {
  position: absolute;
  top: -0.4rem;
  right: -0.4rem;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 0.7rem;
  line-height: 1;
  padding: 0.1rem 0.28rem;
  cursor: pointer;
}

.bench__h {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  margin: 0.9rem 0 0.4rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.72rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.bench__n { color: var(--text-muted, #94a3b8); font-size: 0.7rem; }

.bench { display: flex; flex-wrap: wrap; gap: 0.3rem; min-height: 2.2rem; }

.chip {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}

.chip.is-picked { border-color: var(--bhs-gold-accent); color: var(--bhs-gold-accent); }
.chip__no { color: var(--bhs-cyan-accent); font-variant-numeric: tabular-nums; }
.chip__grade { color: var(--text-muted, #94a3b8); font-size: 0.68rem; }

.hint { margin: 0; color: var(--text-muted, #94a3b8); font-size: 0.78rem; line-height: 1.5; }
.hint--bad { margin-top: 0.6rem; color: var(--color-danger, #f87171); }

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
.btn:disabled { opacity: 0.55; cursor: default; }
</style>
