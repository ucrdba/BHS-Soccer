<script setup lang="ts">
/**
 * The season table — every player's minutes and plus/minus across the season.
 *
 * **Nobody is filtered out for playing few minutes.** High school soccer
 * allows unlimited substitution and re-entry, so much of the roster finishes
 * any fixture well under a full match — and a coach reads this table to
 * decide who to give more minutes to. Hiding the fringe players removes
 * exactly the players it exists to inform a decision about.
 *
 * The answer to a rate built on five minutes is to **print the minutes beside
 * it**, which is what the Mins column is doing next to every per-match
 * figure. A coach can read a noisy number as noisy; the report must not make
 * that judgement for them.
 *
 * And a match is not ninety minutes. `teams.match_minutes` holds this squad's
 * own length — high school is 80, club age groups vary — and every rate here
 * divides by it. A per-90 rate would inflate every figure from an 80-minute
 * game by an eighth, breaking the one number a coach can check against their
 * memory of the match.
 */
import { ref, computed, watch } from 'vue';
import { readSort, writeSort, clearSort } from '../../data/sort-memory';
import SortReset from '../ui/SortReset.vue';
import ToolScreen from '../layout/ToolScreen.vue';
import { supabaseService } from '../../data/supabase';
import { seasonColumns, seasonFullMatchMinutes } from '../../domain/season';
import { replay, orderEvents } from '../../data/plus-minus';
import { seasonTotals, toMinutes, type MatchStats } from '../../data/season-stats';

const props = defineProps<{
  teamId: string | null;
  teams: any[];
  players: any[];
}>();

const rows = ref<any[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const columns = seasonColumns();

// Minutes, most first, until the coach sorts it otherwise on this device.
const saved = readSort('season-report', columns.map(c => c.key), { by: 'mins', reversed: false });
const sortKey = ref(saved.by);
const reversed = ref(saved.reversed);

/** This squad's own full-match length, never a constant. */
const fullMatch = computed(() =>
  seasonFullMatchMinutes(props.teams, props.teamId || ''));

const nameOf = computed(() =>
  new Map((props.players || []).map((p: any) => [p.id, p.name])));

async function load(): Promise<void> {
  if (!props.teamId) { loadError.value = 'Choose a team first.'; return; }

  loading.value = true;
  try {
    const data = await supabaseService.fetchSeasonStats(props.teamId);
    if (!data) {
      loadError.value = 'Could not load the season statistics.';
      rows.value = [];
      return;
    }

    const playerIds = (props.players || []).map((p: any) => p.id);
    const matches: MatchStats[] = (data.sessions || []).map((s: any) => ({
      id: s.id,
      label: s.label,
      createdAt: s.created_at,
      stats: replay(orderEvents((data.eventsBySession[s.id] || []) as any), playerIds)
    })) as any;

    const totals = seasonTotals(matches, fullMatch.value);
    rows.value = Array.from(totals.values())
      .map(t => ({ ...t, name: nameOf.value.get(t.playerId) || 'Unknown player' }));

    loadError.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => props.teamId, () => { load(); }, { immediate: true });

const sorted = computed(() => {
  const col = columns.find(c => c.key === sortKey.value) || columns[2];
  const list = rows.value.slice().sort((a, b) => {
    const av = col.get(a, a.name);
    const bv = col.get(b, b.name);

    // Nulls last whichever way it is sorted: a player with no rate has not
    // played enough for one, which is not the same as the worst rate.
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;

    if (typeof av === 'string') return av.localeCompare(String(bv));
    return col.desc ? Number(bv) - Number(av) : Number(av) - Number(bv);
  });
  return reversed.value ? list.reverse() : list;
});

function sortBy(key: string): void {
  if (sortKey.value === key) {
    reversed.value = !reversed.value;
  } else {
    sortKey.value = key;
    reversed.value = false;
  }
  writeSort('season-report', { by: sortKey.value, reversed: reversed.value });
}

const sortChanged = computed(() => sortKey.value !== 'mins' || reversed.value);

function resetSort(): void {
  sortKey.value = 'mins';
  reversed.value = false;
  clearSort('season-report');
}

const fmt = (v: any) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
</script>

<template>
  <ToolScreen
    title="Season report" :kicker="`${fullMatch}-minute match`"
    :back-to="{ name: 'schedule' }" back-label="Schedule"
  >
    <p class="lede">
      Every player who has taken the pitch this season. Per-match rates are
      scaled to this squad's own {{ fullMatch }}-minute match, and the minutes
      behind each one are in the Mins column — a rate built on five minutes
      swings, and it is worth reading it as such.
    </p>

    <p v-if="loading" class="state">Loading…</p>
    <p v-else-if="loadError" class="state state--bad" role="alert" data-season-error>
      {{ loadError }}
    </p>
    <p v-else-if="rows.length === 0" class="state" data-season-empty>
      No tracked matches yet. Record a match with Plus/Minus and it appears here.
    </p>

    <div v-else class="wrap">
      <p v-if="sortChanged" class="resetrow">
        <SortReset data-season-sort-reset @click="resetSort" />
      </p>
      <table class="tbl">
        <thead>
          <tr>
            <th
              v-for="c in columns" :key="c.key"
              :class="{ 'is-text': c.text }"
            >
              <button
                type="button" class="th" :data-season-sort="c.key"
                @click="sortBy(c.key)"
              ><span v-html="c.label" /></button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in sorted" :key="r.playerId" data-season-row>
            <td class="is-text" data-season-player>{{ r.name }}</td>
            <td class="tabular">{{ r.appearances }}</td>
            <td class="tabular" data-season-mins>{{ r.minutes }}</td>
            <td class="tabular">{{ r.plus }}</td>
            <td class="tabular">{{ r.minus }}</td>
            <td class="tabular"><strong>{{ r.score }}</strong></td>
            <td class="tabular">{{ r.goalDiff }}</td>
            <td class="tabular" data-season-netrate>{{ fmt(r.scorePerMatch) }}</td>
            <td class="tabular">{{ fmt(r.goalDiffPerMatch) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </ToolScreen>
</template>

<style scoped>
/* Reset sort, above the table's right edge, only while it is re-sorted. */
.resetrow { margin: 0 0 var(--space-2); text-align: right; }

.lede {
  max-width: 44rem;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--ink-muted);
}

.state { padding: var(--space-8) 0; text-align: center; font-size: 13px; color: var(--ink-muted); }
.state--bad { color: var(--color-warning); }

.wrap { overflow-x: auto; margin-top: var(--space-4); }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }

.tbl th, .tbl td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  white-space: nowrap;
}

.tbl th { border-bottom-color: var(--rule-strong); }
.tbl th.is-text, .tbl td.is-text { text-align: left; }
.tbl td.is-text { font-family: var(--font-body); }

.th {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-muted);
  font: inherit;
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.th:hover { color: var(--ink); }
.tabular { font-variant-numeric: tabular-nums; font-family: var(--heading-face); font-size: 15px; }

/* The name column stays put while the figures scroll under a narrow screen. */
@media (max-width: 767.98px) {
  .tbl td.is-text, .tbl th.is-text {
    position: sticky;
    left: 0;
    background: var(--ground);
  }
}
</style>
