<script setup lang="ts">
/**
 * The squad against each exercise.
 *
 * **Every player is in it**, including one who has attempted nothing.
 * Unlimited substitution and a rotating squad mean a coach reads this to
 * decide who to work with, so the players with no attempts are part of the
 * answer rather than clutter in front of it.
 *
 * **A threshold is not a ranking.** For a `time_bands` exercise the standard
 * is the tightest band, and the useful reading is who is short of it — not
 * who is fastest. Nothing here suggests tightening a standard or presents a
 * bunched result as a problem: seventeen of nineteen meeting the mark is the
 * good outcome.
 *
 * An exercise with no bands set for this squad is **not counted at all**
 * rather than scored as universally failed.
 *
 * **A W/D/L exercise is read as a record.** A small-sided game or a Flying
 * Fours stores won/drew/lost and no number, so counting readings gave every
 * player 0 attempts and a dash -- the exercise took a heading and said nothing
 * about the sessions behind it. Those sections count games and show the record.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { useMatrixStore } from '../../stores/matrix';
import { reportStandardSeconds, outcomeRecord } from '../../domain/report';
import { formatSecondsAsTime } from '../../domain/time';
import { isThresholdMeasure } from '../../domain/matrix-threshold';

const props = defineProps<{ open: boolean; teamId: string | null }>();
const emit = defineEmits<{ close: [] }>();

const matrix = useMatrixStore();

const history = ref<any[]>([]);
const bandsByDrill = ref<Record<string, any[]>>({});
const loading = ref(false);
const loadError = ref<string | null>(null);

const players = computed(() => matrix.players || []);

/** Only the exercises this squad has actually done. */
const drills = computed(() => {
  const used = new Set(history.value.map(r => r.drillId));
  // Goals by role has no single reading per session to report; left out, as in the progress chart.
  return (matrix.drillsBank || []).filter((d: any) => used.has(d.id) && d.measure !== 'role_goals');
});

/**
 * One row per player per exercise: their best reading, and whether it clears
 * the standard when there is one.
 */
const rows = computed(() => drills.value.map((d: any) => {
  const standard = reportStandardSeconds(bandsByDrill.value, d.id);
  const timed = d.measure === 'time_low' || d.measure === 'time_bands';
  const lower = timed;
  const outcomes = d.measure === 'win_loss';

  const entries = players.value.map((p: any) => {
    if (outcomes) {
      const record = outcomeRecord(history.value, d.id, p.id);
      return { player: p, attempts: record.games, best: null, record: record.label, short: false };
    }

    const readings = history.value
      .filter(r => r.playerId === p.id && r.drillId === d.id
        && r.attendance === 'present'
        && r.rawValue !== null && r.rawValue !== undefined && Number.isFinite(Number(r.rawValue)))
      .map(r => Number(r.rawValue));

    const best = readings.length
      ? (lower ? Math.min(...readings) : Math.max(...readings))
      : null;

    return {
      player: p,
      attempts: readings.length,
      best,
      record: null,
      // Null standard means the exercise is not scored for this squad at all,
      // which is not the same as everybody failing it.
      short: standard !== null && best !== null && best > standard
    };
  });

  return {
    drill: d,
    timed,
    outcomes,
    standard,
    threshold: isThresholdMeasure(d.measure),
    entries,
    shortCount: entries.filter((e: any) => e.short).length,
    untried: entries.filter((e: any) => e.attempts === 0).length
  };
}));

const shown = (row: any, value: number | null) =>
  value === null ? '—' : (row.timed ? formatSecondsAsTime(value) : String(value));

watch(() => [props.open, props.teamId] as const, async () => {
  if (!props.open) return;
  loadError.value = null;

  if (!props.teamId) { loadError.value = 'Choose a team first.'; return; }

  loading.value = true;
  try {
    const rowsRead = await supabaseService.fetchTeamSessionHistory(props.teamId);
    if (rowsRead === null) {
      loadError.value = 'Could not load the session history.';
      history.value = [];
      return;
    }
    history.value = rowsRead;

    // Only the banded exercises have standards; the rest have none by design.
    const banded = (matrix.drillsBank || []).filter((d: any) => d.measure === 'time_bands');
    const next: Record<string, any[]> = {};
    for (const d of banded) {
      next[d.id] = (await supabaseService.fetchTimeBands(d.id, props.teamId)) || [];
    }
    bandsByDrill.value = next;
  } finally {
    loading.value = false;
  }
}, { immediate: true });
</script>

<template>
  <BaseModal :open="open" title="Squad report" wide @close="emit('close')">
    <p class="lede">
      Every player against every exercise the squad has done. A player with no
      attempts is listed with a dash rather than left out — who has not done
      an exercise is part of what this answers.
    </p>

    <p v-if="loading" class="state">Loading…</p>
    <p v-else-if="loadError" class="state state--bad" role="alert" data-squad-error>{{ loadError }}</p>

    <p v-else-if="rows.length === 0" class="state" data-squad-empty>
      No sessions recorded yet. Record one from Player Ratings and it appears here.
    </p>

    <section v-for="row in rows" :key="row.drill.id" class="ex" data-squad-exercise>
      <h3 class="ex__h">
        {{ row.drill.name }}
        <span v-if="row.standard !== null" class="ex__std" data-squad-standard>
          standard {{ shown(row, row.standard) }}
        </span>
        <span v-else-if="row.threshold" class="ex__none" data-squad-no-standard>
          no standard set for this squad — not scored
        </span>
      </h3>

      <p v-if="row.standard !== null" class="ex__short" data-squad-short>
        {{ row.shortCount }} short of the standard
      </p>

      <div class="wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th class="is-text">Player</th>
              <th>{{ row.outcomes ? 'Games' : 'Attempts' }}</th>
              <th>{{ row.outcomes ? 'W-D-L' : 'Best' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in row.entries" :key="e.player.id"
              :class="{ 'is-short': e.short }" data-squad-row
            >
              <td class="is-text" data-squad-player>{{ e.player.name }}</td>
              <td class="tabular" data-squad-attempts>{{ e.attempts }}</td>
              <td class="tabular" data-squad-best>{{ row.outcomes ? e.record : shown(row, e.best) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.lede {
  margin: 0 0 0.9rem;
  max-width: 42rem;
  color: var(--ink-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.state { padding: 2rem 0; color: var(--ink-muted); text-align: center; font-size: 0.88rem; }
.state--bad { color: var(--color-danger); }

.ex { margin-bottom: 1.4rem; }

.ex__h {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
  margin: 0 0 0.3rem;
  color: var(--live);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ex__std { color: var(--rule-strong); font-size: 0.7rem; letter-spacing: 0; text-transform: none; }
.ex__none { color: var(--ink-muted); font-size: 0.7rem; letter-spacing: 0; text-transform: none; }

.ex__short { margin: 0 0 0.4rem; color: var(--ink-muted); font-size: 0.78rem; }

.wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.83rem; }

.tbl th, .tbl td {
  padding: 0.28rem 0.5rem;
  border-bottom: 1px solid var(--rule);
  text-align: right;
}

.tbl th.is-text, .tbl td.is-text { text-align: left; }

.tbl th {
  color: var(--live);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* A row that fell short of the standard -- below-standard, not decorative. */
.tbl tr.is-short td { color: var(--color-warning); }

.tabular { font-variant-numeric: tabular-nums; }

.btn {
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}
</style>
