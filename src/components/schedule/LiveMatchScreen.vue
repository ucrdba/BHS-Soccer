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
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import ToolScreen from '../layout/ToolScreen.vue';
import { usePlusMinusStore } from '../../stores/plus-minus';
import { usePlusMinusTable } from './use-plus-minus-table';
import { pmResolveTap, pmMaxOnPitch } from '../../domain/plus-minus-court';
import { lineupShortName } from '../../domain/lineup';
import { replay, orderEvents } from '../../data/plus-minus';

const props = defineProps<{
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

const kicker = computed(() => {
  const half = pm.period === 1 ? '1st half' : pm.period === 2 ? '2nd half' : `Period ${pm.period}`;
  return props.matchLabel ? `${half} · vs ${props.matchLabel}` : half;
});

/** What the strip under the clock says, in three states. */
const clockState = computed(() => {
  if (pm.running) return 'Clock running · recording live';
  return pm.everStarted ? 'Clock stopped' : 'Not started';
});

const gateHint = computed(() => (pm.running ? '' : '± and events are held'));

/**
 * The refusal's heading.
 *
 * The store decides whether an event is refused and words the reason; this
 * only says which of the two situations the coach is in, because the mistake
 * each prevents is different.
 */
const refusalTitle = computed(() =>
  pm.everStarted ? 'The clock is stopped' : "The match hasn't kicked off");

/** Whether a clock-gated control should read as dead. */
const held = computed(() => !pm.running);

const EVENT_KINDS = [
  { kind: 'shot' as const, label: 'Shot' },
  { kind: 'goal' as const, label: 'Goal' },
  { kind: 'assist' as const, label: 'Assist' }
];

/**
 * Arming a kind while the clock is stopped is refused by the store's own
 * door, so the screen asks it rather than deciding for itself.
 */
async function onArm(kind: 'shot' | 'goal' | 'assist'): Promise<void> {
  if (!pm.running) { await pm.append(kind); return; }
  pm.arm(kind);
}

const benchEl = ref<HTMLElement | null>(null);
function onSub(): void {
  benchEl.value?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

const scoreLine = computed(() => {
  const goalsFor = pm.events.filter(e => e.kind === 'goal_for').length;
  const against = pm.events.filter(e => e.kind === 'goal_against').length;
  return `${goalsFor} – ${against}`;
});

watch(() => props.matchId, async () => {
  openError.value = null;
  const res = await pm.open(props.teamId, props.schoolId, props.matchId, props.matchLabel);
  if (!res?.ok) openError.value = res?.error || 'Could not open that match.';
}, { immediate: true });

// The clock is derived from a timestamp, so something has to ask it the time.
onMounted(() => { ticker = setInterval(() => pm.tick(), 1000); });

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
  <ToolScreen
    title="Live ±" :kicker="kicker"
    :back-to="{ name: 'schedule' }" back-label="Schedule"
  >
    <template #top-right>
      <button
        type="button" class="clockbtn" :class="{ 'is-running': pm.running }"
        data-pm-clock-toggle @click="pm.toggleClock()"
      >{{ pm.running ? 'Stop' : pm.everStarted ? 'Restart' : 'Start' }}</button>
    </template>

    <p v-if="openError" class="hint hint--bad" role="alert" data-pm-open-error>{{ openError }}</p>

    <div class="clock">
      <strong class="clock__time tnum" :class="{ 'is-running': pm.running }" data-pm-clock>
        {{ pm.clockText }}
      </strong>
      <span class="clock__score tnum" data-pm-score>{{ scoreLine }}</span>
    </div>

    <div class="status" :class="{ 'is-held': !pm.running }" data-pm-status>
      <span class="status__dot" />
      <span class="status__state">{{ clockState }}</span>
      <span v-if="gateHint" class="status__hint">{{ gateHint }}</span>
    </div>

    <!-- The words are the store's; only the heading is the screen's, and it
         says which of the two mistakes is being prevented. -->
    <div v-if="pm.notice" class="refusal" role="status" data-pm-refusal>
      <p class="refusal__title" data-pm-refusal-title>{{ refusalTitle }}</p>
      <p class="refusal__body" data-pm-notice>{{ pm.notice }}</p>
    </div>

    <div class="overflow">
      <button type="button" class="minor" data-pm-goal-for @click="pm.teamGoal(true)">Goal for us</button>
      <button type="button" class="minor" data-pm-goal-against @click="pm.teamGoal(false)">Goal against</button>
      <button type="button" class="minor" data-pm-end-period @click="pm.endPeriod()">End period</button>
      <button type="button" class="minor" data-pm-undo @click="pm.undo()">Undo</button>
    </div>

    <p class="kicker sec">
      On the pitch <span class="tnum" data-pm-on-count>{{ pm.onPitch.length }} / {{ pmMaxOnPitch() }}</span>
    </p>

    <p v-if="onPitch.length === 0" class="hint" data-pm-empty-pitch>
      Nobody is on yet. Send players on from the bench below — that works
      before kick-off.
    </p>

    <div class="rows">
      <div
        v-for="p in onPitch" :key="p.id"
        class="row" :data-pm-player="p.id"
        @click="onTapPlayer(p.id, $event)"
        @contextmenu.prevent="onTapPlayer(p.id, $event, true)"
      >
        <span class="row__no tnum">{{ p.number ?? '—' }}</span>
        <span class="row__who">
          <span class="row__name">{{ shortName(p) }}</span>
          <span class="row__stat tnum" :data-pm-score-for="p.id">
            {{ Math.round((statOf(p.id).secondsPlayed || 0) / 60) }}′ on ·
            net {{ statOf(p.id).score > 0 ? '+' : '' }}{{ statOf(p.id).score }}
          </span>
        </span>
        <button
          type="button" class="tap" :class="{ 'is-held': held }"
          :data-pm-minus="p.id" aria-label="Minus"
          @click.stop="pm.append('minus', p.id)"
        >&minus;</button>
        <button
          type="button" class="tap tap--plus" :class="{ 'is-held': held }"
          :data-pm-plus="p.id" aria-label="Plus"
          @click.stop="pm.append('plus', p.id)"
        >+</button>
        <button type="button" class="off" :data-pm-off="p.id" @click.stop="pm.movePlayer(p.id, false)">
          Off
        </button>
      </div>
    </div>

    <p ref="benchEl" class="kicker sec">Bench</p>

    <div class="rows">
      <button
        v-for="p in bench" :key="p.id"
        type="button" class="row row--bench" :data-pm-bench="p.id"
        @click="pm.movePlayer(p.id, true)"
      >
        <span class="row__no tnum">{{ p.number ?? '—' }}</span>
        <span class="row__name">{{ shortName(p) }}</span>
        <span class="row__on">On</span>
      </button>
      <p v-if="bench.length === 0" class="hint">Everyone is on the pitch.</p>
    </div>

    <p class="kicker sec">The sheet</p>

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

    <template #foot>
      <button
        v-for="e in EVENT_KINDS" :key="e.kind"
        type="button" class="eventbtn"
        :class="{ 'is-held': held, 'is-armed': pm.armed === e.kind }"
        :data-pm-arm="e.kind" @click="onArm(e.kind)"
      >{{ e.label }}</button>
      <button type="button" class="eventbtn eventbtn--go" data-pm-sub @click="onSub">Sub</button>
    </template>
  </ToolScreen>
</template>

<style scoped>
.clock { display: flex; align-items: baseline; gap: var(--space-3); }

.clock__time {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 33px;
  line-height: 1.15;
  color: var(--color-warning);
}

.clock__time.is-running { color: var(--live); }
.clock__score { font-size: 15px; color: var(--ink); }

.status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-2) calc(var(--space-4) * -1) 0;
  padding: 9px var(--space-4);
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--live);
}

.status.is-held { background: #1c1608; color: var(--color-warning); }

.status__dot {
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
}

.status__hint {
  margin-left: auto;
  font-family: var(--font-body);
  font-size: 11.5px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--ink-muted);
}

.refusal {
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-3);
  border: 1px solid var(--color-warning);
  border-left-width: 4px;
  border-radius: var(--radius-lg);
  background: #241c07;
}

.refusal__title {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-warning);
}

.refusal__body { margin-top: 6px; font-size: 13px; line-height: 1.5; color: var(--ink); }

.overflow { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }

.minor {
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.minor:hover { color: var(--ink); }

.sec { margin-top: var(--space-4); color: var(--ink-muted); }
.sec .tnum { color: var(--ink-muted); }

.rows { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  user-select: none;
}

.row__no { width: 26px; flex: none; font-family: var(--font-display); font-size: 19px; color: var(--mark); }
.row__who { flex: 1; min-width: 0; }
.row__name { display: block; font-size: 13px; line-height: 1.2; }
.row__stat { display: block; font-size: 10.5px; color: var(--ink-muted); }
.row--bench .row__name { flex: 1; }
.row__on { margin-left: auto; font-size: 11px; color: var(--live); }

/* 54px, because a coach taps these while watching the game rather than the phone. */
.tap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  flex: none;
  border: 1.5px solid var(--rule);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 24px;
  cursor: pointer;
}

.tap--plus { border-color: var(--live); color: var(--live); }
.tap.is-held { border-style: dashed; border-color: var(--rule); color: var(--ink-soft); }

.off {
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.wrap { overflow-x: auto; margin-top: var(--space-2); }
.tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }

.tbl th, .tbl td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  white-space: nowrap;
}

.tbl th.is-text, .tbl td.is-text { text-align: left; }

.th {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-muted);
  font: inherit;
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.tabular { font-variant-numeric: tabular-nums; }

.hint { margin-top: var(--space-2); font-size: 12px; line-height: 1.5; color: var(--ink-muted); }
.hint--bad { color: var(--color-warning); }

.clockbtn {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1.5px solid var(--live);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--live);
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.clockbtn.is-running { border-color: var(--color-warning); color: var(--color-warning); }

.eventbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 56px;
  border: 1.5px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.eventbtn.is-held { border-style: dashed; background: transparent; color: var(--ink-soft); }
.eventbtn.is-armed { border-color: var(--mark); color: var(--mark); }
.eventbtn--go { border: 1.5px solid var(--live); background: transparent; color: var(--live); }

@media (min-width: 768px) {
  .rows { display: grid; grid-template-columns: 1fr 1fr; }
}
</style>
