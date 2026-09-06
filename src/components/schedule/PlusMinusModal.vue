<script setup lang="ts">
/**
 * Recording a match live.
 *
 * The clock, the pitch, and the taps that record a plus or a minus. Every
 * figure on it is replayed from the event log rather than counted, which is
 * what makes an undo correct everything downstream of it.
 *
 * **Every gesture has a plain control beside it.** Two fingers and the right
 * mouse button are the fast paths for a minus, and they stay — but a coach
 * holding a phone in one hand, or anyone using a keyboard, needs a button.
 * The same reasoning as the planner's move buttons and the lineup's
 * tap-to-place.
 *
 * The refusal when the clock is stopped is on screen, not in an `alert`: it
 * has to be readable at a touchline and it has to be testable.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { usePlusMinusStore } from '../../stores/plus-minus';
import { usePlusMinusTable } from './use-plus-minus-table';
import { pmResolveTap, pmMaxOnPitch } from '../../domain/plus-minus-court';
import { lineupShortName } from '../../domain/lineup';
import { replay, orderEvents } from '../../data/plus-minus';

const props = defineProps<{
  open: boolean;
  matchId: string | null;
  matchLabel?: string;
  teamId: string | null;
  schoolId: string | null;
  players: any[];
}>();

const emit = defineEmits<{ close: [] }>();

const pm = usePlusMinusStore();

const openError = ref<string | null>(null);
let ticker: any = null;

const squad = computed(() => (props.players || []).filter((p: any) => !p.is_deleted && !p.isDeleted));
const playerIds = computed(() => squad.value.map((p: any) => p.id));
const byId = computed(() => new Map(squad.value.map((p: any) => [p.id, p])));

// Replayed here rather than through the store: it is a pure function of the
// event log and the squad, and a store's returned functions are stubbed out
// in component tests.
const stats = computed(() => replay(orderEvents(pm.events), playerIds.value));
const onPitch = computed(() =>
  pm.onPitch.map(id => byId.value.get(id)).filter(Boolean));
const bench = computed(() =>
  squad.value.filter((p: any) => !pm.onPitch.includes(p.id)));

const title = computed(() =>
  props.matchLabel ? `Plus / Minus — ${props.matchLabel}` : 'Plus / Minus');

const scoreLine = computed(() => {
  const goalsFor = pm.events.filter(e => e.kind === 'goal_for').length;
  const against = pm.events.filter(e => e.kind === 'goal_against').length;
  return `${goalsFor} – ${against}`;
});

watch(() => [props.open, props.matchId] as const, async () => {
  if (!props.open) return;
  openError.value = null;

  const res = await pm.open(props.teamId, props.schoolId, props.matchId, props.matchLabel);
  if (!res?.ok) openError.value = res?.error || 'Could not open that match.';
}, { immediate: true });

// The clock is derived from a timestamp, so something has to ask it the time.
watch(() => props.open, (isOpen) => {
  if (ticker) { clearInterval(ticker); ticker = null; }
  if (isOpen) ticker = setInterval(() => pm.tick(), 1000);
}, { immediate: true });

onBeforeUnmount(() => { if (ticker) clearInterval(ticker); });

function statOf(playerId: string) {
  return stats.value.get(playerId) || { plus: 0, minus: 0, score: 0, goalDiff: 0, secondsPlayed: 0 };
}

/**
 * A tap on a player.
 *
 * The gesture rules are `pmResolveTap` — armed wins, then two fingers or the
 * right button is a minus, then a plain tap is a plus for somebody actually
 * on the pitch. A bench player cannot have made a good play.
 */
async function onTapPlayer(playerId: string, e: MouseEvent | TouchEvent, rightClick = false): Promise<void> {
  const fingers = (e as TouchEvent).touches?.length || 1;
  const decision = pmResolveTap({
    armed: pm.armed,
    fingers,
    rightClick,
    onPitch: pm.onPitch.includes(playerId)
  });

  if (!decision?.kind) return;
  if (decision.disarm) pm.arm(null);
  await pm.append(decision.kind, playerId);
}

const shortName = lineupShortName;
const { columns, sortKey, reversed, rows, sortBy } = usePlusMinusTable(stats, squad);
</script>

<template>
  <BaseModal :open="open" :title="title" wide @close="emit('close')">
    <p v-if="openError" class="hint hint--bad" role="alert" data-pm-open-error>{{ openError }}</p>

    <div class="clock">
      <strong class="clock__time" data-pm-clock>{{ pm.clockText }}</strong>
      <span class="clock__period">Period {{ pm.period }}</span>
      <span class="clock__score" data-pm-score>{{ scoreLine }}</span>

      <span class="spacer" />

      <button
        type="button" class="btn" :class="{ 'is-on': pm.running }"
        data-pm-clock-toggle @click="pm.toggleClock()"
      >{{ pm.running ? 'Stop clock' : 'Start clock' }}</button>
      <button type="button" class="btn" data-pm-end-period @click="pm.endPeriod()">End period</button>
      <button type="button" class="btn" data-pm-undo @click="pm.undo()">Undo</button>
    </div>

    <!-- Never an alert: this has to be readable at a touchline and testable
         here. -->
    <p v-if="pm.notice" class="hint hint--bad" role="status" data-pm-notice>{{ pm.notice }}</p>

    <div class="goals">
      <button type="button" class="btn" data-pm-goal-for @click="pm.teamGoal(true)">Goal for us</button>
      <button type="button" class="btn" data-pm-goal-against @click="pm.teamGoal(false)">Goal against</button>
    </div>

    <h3 class="sec">
      On the pitch
      <span class="sec__n" data-pm-on-count>{{ pm.onPitch.length }} / {{ pmMaxOnPitch() }}</span>
    </h3>

    <p v-if="onPitch.length === 0" class="hint" data-pm-empty-pitch>
      Nobody is on yet. Send players on from the bench below — that works
      before kick-off.
    </p>

    <div class="chips">
      <div
        v-for="p in onPitch" :key="p.id"
        class="chip chip--on" :data-pm-player="p.id"
        @click="onTapPlayer(p.id, $event)"
        @contextmenu.prevent="onTapPlayer(p.id, $event, true)"
      >
        <span class="chip__name">{{ shortName(p) }}</span>
        <span class="chip__score" :data-pm-score-for="p.id">
          {{ statOf(p.id).score > 0 ? '+' : '' }}{{ statOf(p.id).score }}
        </span>

        <!-- The gesture is the fast path; these are the ones that always work. -->
        <span class="chip__acts">
          <button
            type="button" class="mini" :data-pm-plus="p.id" aria-label="Plus"
            @click.stop="pm.append('plus', p.id)"
          >+</button>
          <button
            type="button" class="mini" :data-pm-minus="p.id" aria-label="Minus"
            @click.stop="pm.append('minus', p.id)"
          >&minus;</button>
          <button
            type="button" class="mini" :data-pm-off="p.id"
            @click.stop="pm.movePlayer(p.id, false)"
          >Off</button>
        </span>
      </div>
    </div>

    <h3 class="sec">Bench</h3>

    <div class="chips">
      <button
        v-for="p in bench" :key="p.id"
        type="button" class="chip" :data-pm-bench="p.id"
        @click="pm.movePlayer(p.id, true)"
      >
        {{ shortName(p) }}
        <span class="chip__on">On</span>
      </button>
      <p v-if="bench.length === 0" class="hint">Everyone is on the pitch.</p>
    </div>

    <h3 class="sec">The sheet</h3>

    <div class="wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key" :class="{ 'is-text': c.text }">
              <button type="button" class="th" :data-pm-sort="c.key" @click="sortBy(c.key)">
                <span v-html="c.label" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.player.id" data-pm-row>
            <td
              v-for="(cell, i) in r.cells" :key="columns[i].key"
              :class="columns[i].text ? 'is-text' : 'tabular'"
              :data-pm-cell="columns[i].key"
            >{{ cell }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.clock {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 8px;
}

.clock__time { color: var(--bhs-cyan-accent); font-size: 1.4rem; font-variant-numeric: tabular-nums; }
.clock__period, .clock__score { color: var(--text-muted, #94a3b8); font-size: 0.78rem; }
.clock__score { color: #fff; font-size: 0.95rem; }
.spacer { flex: 1; }

.goals { display: flex; gap: 0.4rem; margin: 0.6rem 0; }

.sec {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  margin: 0.9rem 0 0.4rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.72rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.sec__n { color: var(--text-muted, #94a3b8); font-size: 0.7rem; }

.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }

.chip {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 8px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  user-select: none;
}

.chip--on { border-color: var(--bhs-cyan-accent); }
.chip__name { font-weight: 600; }
.chip__score { color: var(--bhs-gold-accent); font-variant-numeric: tabular-nums; }
.chip__on { color: var(--text-muted, #94a3b8); font-size: 0.7rem; }
.chip__acts { display: flex; gap: 0.2rem; }

.mini {
  min-width: 1.6rem;
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; }

.tbl th, .tbl td {
  padding: 0.3rem 0.45rem;
  border-bottom: 1px solid var(--bhs-navy-border);
  text-align: right;
}

.tbl th.is-text, .tbl td.is-text { text-align: left; }

.th {
  padding: 0;
  border: 0;
  background: none;
  color: var(--bhs-cyan-accent);
  font: inherit;
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.tabular { font-variant-numeric: tabular-nums; }

.hint { margin: 0.5rem 0; color: var(--text-muted, #94a3b8); font-size: 0.8rem; line-height: 1.5; }
.hint--bad { color: var(--color-danger, #f87171); }

.btn {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.btn.is-on { border-color: var(--bhs-gold-accent); color: var(--bhs-gold-accent); }
</style>
