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
 *
 * **A timed exercise draws each player's progress** beside their best, on one
 * scale for the whole exercise so the graphs read down the table and the
 * standard sits at one height. See `domain/sparkline.ts`.
 *
 * **The overall ratings come first**: the Player Ratings board, built by the
 * board's own `matrixBoardRows`, so the two cannot rank anyone differently.
 * Every column sorts, and the section sorts on its own.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { useMatrixStore } from '../../stores/matrix';
import { reportStandardSeconds, outcomeRecord } from '../../domain/report';
import { sortSquadEntries, squadSortDescends } from '../../domain/squad-report';
import { squadReportSheets, buildSquadReportPrintDocument } from '../../domain/squad-report-export';
import { useOrganizationStore } from '../../stores/organization';
import { formatTimeFor } from '../../domain/time';
import { isThresholdMeasure } from '../../domain/matrix-threshold';
import { progressSeries } from '../../domain/progress';
import { sparkRange, sparkline, sparkLabel } from '../../domain/sparkline';
import { matrixBoardRows, boardSortDescends, BOARD_SORT_KEYS } from '../../domain/matrix';
import { readSort, writeSort } from '../../data/sort-memory';

const props = defineProps<{ open: boolean; teamId: string | null }>();
const emit = defineEmits<{
  close: [];
  /** A graph was chosen: the progress chart for that player on that exercise. */
  openProgress: [{ playerId: string; drillId: string }];
}>();

const matrix = useMatrixStore();
const org = useOrganizationStore();

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
      return {
        player: p, attempts: record.games, best: null, avg: null, record: record.label,
        wins: record.wins, draws: record.draws, losses: record.losses, short: false
      };
    }

    // Oldest first; the same readings the Progress window draws.
    const readings = progressSeries(history.value, p.id, d.id).map(pt => pt.value);

    const best = readings.length
      ? (lower ? Math.min(...readings) : Math.max(...readings))
      : null;
    // Timed exercises only: an average of a count is not a figure anyone reads here.
    const avg = timed && readings.length
      ? readings.reduce((sum, v) => sum + v, 0) / readings.length
      : null;

    return {
      player: p,
      attempts: readings.length,
      best,
      avg,
      record: null,
      progress: timed ? readings : [],
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
    // One range for every graph in the exercise, standard included.
    range: timed ? sparkRange(entries.map((e: any) => e.progress || []), standard) : null,
    threshold: isThresholdMeasure(d.measure),
    entries,
    shortCount: entries.filter((e: any) => e.short).length,
    untried: entries.filter((e: any) => e.attempts === 0).length
  };
}));

/**
 * How each exercise is sorted, kept per drill: reading the Cooper's by best
 * figure must not reorder the small-sided section above it. Each is also
 * remembered on the device, so the report reopens as the coach left it.
 */
const sorts = ref<Record<string, { by: string; reversed: boolean }>>({});

const SECTION_SORT_KEYS = ['name', 'attempts', 'best', 'avg', 'record'];
const sectionSortName = (drillId: string) => `squad.exercise.${drillId}`;

function sortOf(drillId: string) {
  return sorts.value[drillId]
    || readSort(sectionSortName(drillId), SECTION_SORT_KEYS, { by: '', reversed: false });
}

function setSort(drillId: string, by: string): void {
  const now = sortOf(drillId);
  const next = now.by === by ? { by, reversed: !now.reversed } : { by, reversed: false };
  sorts.value = { ...sorts.value, [drillId]: next };
  writeSort(sectionSortName(drillId), next);
}

function arrow(drillId: string, by: string): string {
  const now = sortOf(drillId);
  if (now.by !== by) return '';
  // squadSortDescends says which way a FIRST click reads; reversing flips it.
  return squadSortDescends(by) !== now.reversed ? ' ▼' : ' ▲';
}

/** The sections as they appear on screen, which is what the exports take. */
const sortedRows = computed(() => rows.value.map((row: any) => {
  const { by, reversed } = sortOf(row.drill.id);
  return {
    ...row,
    entries: sortSquadEntries(row.entries, by, reversed, { timed: row.timed, outcomes: row.outcomes })
  };
}));

/** The overall ratings, the board's rows, sorted on their own. */
const OVERALL_COLUMNS = [
  { key: 'rank', label: 'Rank' },
  { key: 'name', label: 'Player', text: true },
  { key: 'recordingNumber', label: 'No', title: 'Recording number, not the shirt number' },
  { key: 'exercises', label: 'Ex', title: 'Exercises taken part in' },
  { key: 'wdl', label: 'W-D-L' },
  { key: 'earned', label: 'Pts' },
  { key: 'available', label: 'Of', title: 'Points available' },
  { key: 'share', label: 'Share' }
];

const overallSort = ref(readSort('squad.overall', BOARD_SORT_KEYS, { by: 'rank', reversed: false }));

const overallRows = computed(() =>
  matrixBoardRows(players.value, overallSort.value.by, overallSort.value.reversed));

function setOverallSort(by: string): void {
  const now = overallSort.value;
  overallSort.value = now.by === by ? { by, reversed: !now.reversed } : { by, reversed: false };
  writeSort('squad.overall', overallSort.value);
}

function overallArrow(by: string): string {
  const now = overallSort.value;
  if (now.by !== by) return '';
  return boardSortDescends(by) !== now.reversed ? ' ▼' : ' ▲';
}

const exportError = ref<string | null>(null);

function exportOptions() {
  return {
    organization: org.branding.name || '',
    team: org.activeTeam?.name || '',
    rows: sortedRows.value,
    overall: overallRows.value
  };
}

function onPrint(): void {
  exportError.value = null;
  const html = buildSquadReportPrintDocument(exportOptions());
  if (!html) { exportError.value = 'There is nothing to print yet.'; return; }

  const win = window.open('', '_blank');
  if (!win) {
    exportError.value = 'Your browser blocked the print window. Allow pop-ups for this site and try again.';
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function onExcel(): void {
  exportError.value = null;
  const XLSX = (window as any).XLSX;
  if (typeof XLSX === 'undefined') {
    exportError.value = 'The spreadsheet library has not loaded yet. Wait a moment and try again.';
    return;
  }

  const sheets = squadReportSheets(exportOptions());
  if (sheets.length === 0) { exportError.value = 'There is nothing to export yet.'; return; }

  // One sheet per exercise: the columns differ by measure.
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name));
  XLSX.writeFile(wb, 'Squad_report.xlsx');
}

const shown = (row: any, value: number | null) =>
  value === null || value === undefined ? '—' : (row.timed ? formatTimeFor(value, row.drill?.measure) : String(value));

/** A player's graph for a timed exercise, or null when they have no reading. */
const spark = (row: any, e: any) =>
  sparkline(e.progress || [], row.range, { lowerIsBetter: true, standard: row.standard });

const sparkText = (row: any, e: any) =>
  sparkLabel(e.progress || [], true, v => shown(row, v));

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

    <section v-if="!loading && !loadError && rows.length" class="ex" data-squad-overall>
      <h3 class="ex__h">Overall ratings</h3>
      <p class="ex__short">
        Every exercise recorded, weighted — as on the Player Ratings board. A dash
        means a player has taken part in nothing yet.
      </p>

      <div class="wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th v-for="c in OVERALL_COLUMNS" :key="c.key" :class="{ 'is-text': c.text }" :title="c.title">
                <button
                  type="button" class="th-btn" :data-overall-sort="c.key"
                  @click="setOverallSort(c.key)"
                >{{ c.label }}{{ overallArrow(c.key) }}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in overallRows" :key="m.playerId" data-overall-row>
              <td class="tabular" data-overall-rank>{{ m.exercises === 0 ? '—' : m.rank }}</td>
              <td class="is-text" data-overall-player>{{ m.name }}</td>
              <td class="tabular">{{ m.recordingNumber != null ? m.recordingNumber : '—' }}</td>
              <td class="tabular">{{ m.exercises }}</td>
              <td class="tabular">{{ m.wins }} - {{ m.draws }} - {{ m.losses }}</td>
              <td class="tabular">{{ m.earned.toFixed(2) }}</td>
              <td class="tabular">{{ m.available.toFixed(2) }}</td>
              <td class="tabular">{{ m.share === null ? '—' : `${m.share.toFixed(1)}%` }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-for="row in sortedRows" :key="row.drill.id" class="ex" data-squad-exercise>
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
              <th class="is-text">
                <button
                  type="button" class="th-btn" data-squad-sort="name"
                  @click="setSort(row.drill.id, 'name')"
                >Player{{ arrow(row.drill.id, 'name') }}</button>
              </th>
              <th>
                <button
                  type="button" class="th-btn" data-squad-sort="attempts"
                  @click="setSort(row.drill.id, 'attempts')"
                >{{ row.outcomes ? 'Games' : 'Attempts' }}{{ arrow(row.drill.id, 'attempts') }}</button>
              </th>
              <th>
                <button
                  type="button" class="th-btn"
                  :data-squad-sort="row.outcomes ? 'record' : 'best'"
                  @click="setSort(row.drill.id, row.outcomes ? 'record' : 'best')"
                >{{ row.outcomes ? 'W-D-L' : 'Best' }}{{ arrow(row.drill.id, row.outcomes ? 'record' : 'best') }}</button>
              </th>
              <th v-if="row.timed">
                <button
                  type="button" class="th-btn" data-squad-sort="avg"
                  @click="setSort(row.drill.id, 'avg')"
                >Avg{{ arrow(row.drill.id, 'avg') }}</button>
              </th>
              <th v-if="row.timed" class="is-text">Progress</th>
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
              <td v-if="row.timed" class="tabular" data-squad-avg>{{ shown(row, e.avg) }}</td>
              <td v-if="row.timed" class="is-text spark-cell" data-squad-progress>
                <button
                  v-if="spark(row, e)" type="button" class="spark-btn"
                  :aria-label="`Progress for ${e.player.name} on ${row.drill.name}: ${sparkText(row, e)}`"
                  data-squad-spark-open
                  @click="emit('openProgress', { playerId: e.player.id, drillId: row.drill.id })"
                >
                  <svg
                    class="spark" role="img"
                    :viewBox="`0 0 ${spark(row, e)!.width} ${spark(row, e)!.height}`"
                    :width="spark(row, e)!.width" :height="spark(row, e)!.height"
                    :aria-label="sparkText(row, e)" data-squad-spark
                  >
                    <title>{{ sparkText(row, e) }}</title>
                    <line
                      v-if="spark(row, e)!.standardY !== null" class="spark__std"
                      x1="0" :y1="spark(row, e)!.standardY!" :x2="spark(row, e)!.width" :y2="spark(row, e)!.standardY!"
                      data-squad-spark-standard
                    />
                    <polyline v-if="spark(row, e)!.line" class="spark__line" :points="spark(row, e)!.line" />
                    <circle class="spark__dot" :cx="spark(row, e)!.last.x" :cy="spark(row, e)!.last.y" r="1.8" />
                  </svg>
                </button>
                <template v-else>—</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <p v-if="exportError" class="state state--bad" role="alert" data-squad-export-error>
      {{ exportError }}
    </p>

    <template #footer>
      <button
        v-if="rows.length" type="button" class="btn"
        data-squad-print @click="onPrint"
      >Print / PDF</button>
      <button
        v-if="rows.length" type="button" class="btn"
        data-squad-excel @click="onExcel"
      >Excel</button>
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
/* Sized to its contents rather than the modal: at full width the Player
   column took all the slack and pushed the figures away from the names. */
.tbl { width: auto; min-width: min(100%, 26rem); border-collapse: collapse; font-size: 0.83rem; }

.th-btn {
  padding: 0; border: 0; background: none; color: inherit;
  font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer;
}

.th-btn:hover { color: var(--ink); }

.tbl th, .tbl td {
  padding: 0.28rem 0.75rem;
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

/* The progress graph. Its own colours, not the row's: a short row's warning
   colour would otherwise run through the line and read as a verdict on it. */
.spark-cell { width: 1%; padding-top: 0.15rem; padding-bottom: 0.15rem; white-space: nowrap; }
.spark { display: block; overflow: visible; }
.spark__std { stroke: var(--rule-strong); stroke-width: 0.8; stroke-dasharray: 2 2; }
.spark__line {
  fill: none; stroke: var(--ink-muted); stroke-width: 1.2;
  stroke-linejoin: round; stroke-linecap: round;
}
.spark__dot { fill: var(--mark); }

/* The graph opens the progress chart; it should look like the graph, and say
   it can be pressed only on hover and focus. */
.spark-btn {
  display: block;
  padding: 2px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  cursor: pointer;
}
.spark-btn:hover { border-color: var(--rule); }
.spark-btn:focus-visible { outline: 2px solid var(--mark); outline-offset: 1px; }

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
