<script setup lang="ts">
/**
 * One exercise at a time.
 *
 * The columns differ by measure because the natural figure does: wins and
 * draws for a head-to-head or small-sided drill, a best count or a best time
 * otherwise. Showing all of them for every exercise fills the table with
 * columns that are always zero.
 *
 * For a `time_bands` exercise there is an extra layer, and it is ADDITIVE.
 * That measure is a fitness standard rather than a competition — it asks
 * whether a player can last a full match, scored against absolute per-squad
 * thresholds — so most of a fit squad landing on full marks is the good
 * outcome, and what is worth seeing is who fell short. The summary and the row
 * marks say so.
 *
 * What this must never do is narrow the table or disable a sort. Every player
 * stays on screen, ordered however the reader chooses. That was the condition
 * on introducing the emphasis at all.
 */
import { computed, ref } from 'vue';
import { useMatrixStore } from '../../stores/matrix';
import { bandStanding, roleGoalStanding, roleShortfallLine } from '../../domain/matrix-threshold';
import { roleLabel } from '../../domain/position';
import { formatGoalDifference } from '../../domain/goal-score';
import { percentLabel } from '../../domain/role-goal-score';
import { exerciseSheet, buildExercisePrintDocument } from '../../domain/exercise-export';
import { useOrganizationStore } from '../../stores/organization';
import { formatSecondsAsTime } from '../../domain/time';

const matrix = useMatrixStore();

const isWinLoss = computed(() =>
  matrix.measure === 'win_loss' || matrix.measure === 'head_to_head');
const isTimed = computed(() =>
  matrix.measure === 'time_low' || matrix.measure === 'time_bands');
const isRoleGoals = computed(() => matrix.measure === 'role_goals');

const bestLabel = computed(() => (isTimed.value ? 'Best time' : 'Best'));
const avgLabel = computed(() => (isTimed.value ? 'Average' : 'Avg'));

const columns = computed(() => [
  { key: 'number', label: '#' },
  { key: 'name', label: 'Player', text: true },
  // The best figure is a ceiling, the average the norm; a player whose only
  // clear run was his fastest reads very differently from one who clears it
  // routinely. A win-loss exercise has no figure to average, and a
  // Goals-by-role one shows its latest result instead.
  ...(isWinLoss.value
    ? [{ key: 'wins', label: 'W-D-L' }]
    : isRoleGoals.value
      ? [
          { key: 'role', label: 'Role', text: true },
          { key: 'score', label: 'Score' },
          { key: 'diff', label: 'Goal diff' },
          { key: 'base', label: 'Base' },
          { key: 'bonus', label: 'Bonus' }
        ]
      : [{ key: 'best', label: bestLabel.value }, { key: 'avg', label: avgLabel.value }]),
  { key: 'earned', label: 'Points' }
]);

function share(v: any): string {
  return v === null || v === undefined ? '—' : percentLabel(v);
}

function arrow(key: string): string {
  if (matrix.exerciseSort.by !== key) return '';
  return matrix.exerciseDescends(key) ? ' ▼' : ' ▲';
}

/** A player's best figure, phrased for the exercise they did it in. */
function best(row: any): string {
  return figure(row, row.best);
}

/** The same phrasing for the average, rounded: a mean second is spurious precision. */
function avg(row: any): string {
  if (row.avg === null || row.avg === undefined) return '—';
  return figure(row, row.timed ? Math.round(row.avg) : Number(row.avg.toFixed(1)));
}

function figure(row: any, v: any): string {
  if (v === null || v === undefined) return '—';
  return row.timed ? formatSecondsAsTime(v) : String(v);
}

const emit = defineEmits<{ openPlayer: [string] }>();

const org = useOrganizationStore();
const exportError = ref<string | null>(null);

/** What both exports describe: this exercise, as the coach has it sorted. */
function exportOptions() {
  return {
    exercise: matrix.selectedDrill?.name || 'Exercise',
    measure: matrix.measure,
    organization: org.branding.name || '',
    team: org.activeTeam?.name || '',
    // Straight off the store, so the order is whatever column the coach
    // sorted by. Re-sorting here would throw away their answer.
    rows: matrix.leaderboard
  };
}

/**
 * Printed through the browser's own dialog, where Save as PDF is one of the
 * destinations. No PDF library -- the practice planner already prints this
 * way, and a library would be a dependency for a worse result.
 */
function onPrint(): void {
  exportError.value = null;
  const html = buildExercisePrintDocument(exportOptions());
  if (!html) { exportError.value = 'There is nothing to print yet.'; return; }

  const win = window.open('', '_blank');
  if (!win) {
    // A blocked pop-up is silent otherwise, and the coach just sees nothing
    // happen when they press print.
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
    // The CDN may not have answered yet. Said, not thrown.
    exportError.value = 'The spreadsheet library has not loaded yet. Wait a moment and try again.';
    return;
  }

  const opts = exportOptions();
  const rows = exerciseSheet(opts);
  if (rows.length === 0) { exportError.value = 'There is nothing to export yet.'; return; }

  const wb = XLSX.utils.book_new();
  // A sheet name may not carry : \ / ? * [ ] and is capped at 31 characters,
  // so an exercise called "3-430 / laps" would throw rather than save.
  const sheetName = opts.exercise.replace(/[:\/?*\[\]]/g, '-').slice(0, 31) || 'Exercise';
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
  XLSX.writeFile(wb, `${sheetName.replace(/\s+/g, '_')}.xlsx`);
}

/**
 * How consistently, beside whether at all.
 *
 * The standard is judged on the fastest run — one clear run proves the player
 * can do it — so a player who ran 4:29 and 4:40 against a 4:30 bar reads as
 * met. That alone would hide the 4:40, which is the thing a coach picking a
 * squad wants to see. Shown only where there is something to say: a player who
 * cleared every run he made needs no ratio.
 */
function runs(row: any): string {
  const met = Number(row?.metRuns) || 0;
  const short = Number(row?.shortRuns) || 0;
  const total = met + short;
  if (total === 0 || short === 0) return '';
  return `${met} of ${total}`;
}

function standing(row: any): string {
  return matrix.isThreshold ? bandStanding(row) : 'met';
}
</script>

<template>
  <div>
    <header v-if="matrix.selectedDrill" class="lb__head">
      <div>
        <p class="kicker">Exercise · {{ matrix.measure.replace('_', ' ') }}</p>
        <h2 class="lb__name">{{ matrix.selectedDrill.name }}</h2>
      </div>
      <!-- Beside the exercise's own name, because they export THIS table --
           as it is sorted, not the board behind it. -->
      <div v-if="matrix.leaderboard.length" class="lb__acts">
        <button type="button" class="btn btn--small" data-export-print @click="onPrint">
          Print / PDF
        </button>
        <button type="button" class="btn btn--small" data-export-excel @click="onExcel">
          Excel
        </button>
      </div>
    </header>

    <p v-if="exportError" class="note note--bad" role="alert" data-export-error>
      {{ exportError }}
    </p>

    <!--
      Only for a standard. A competitive exercise gets no summary, because
      spread across the squad is the point there rather than a shortfall.
    -->
    <div
      v-if="matrix.isThreshold && matrix.leaderboard.length"
      class="standard" data-standard-summary
    >
      <p class="kicker standard__kicker">Match-readiness standard, not a ranking</p>
      <p class="standard__line">
        <!-- "measured" no longer fits the denominator: a player who never ran
             it is counted here, and he is precisely the unmeasured one. -->
        <template v-if="matrix.shortOfStandard.length">
          <span class="standard__count tnum">{{ matrix.shortOfStandard.length }}</span>
          of {{ matrix.measuredCount }}
          {{ matrix.shortOfStandard.length === 1 ? 'player has' : 'players have' }}
          not met the standard — slower, or not yet run. The rest have cleared it.
        </template>
        <template v-else>
          All {{ matrix.measuredCount }}
          {{ matrix.measuredCount === 1 ? 'player has' : 'players have' }}
          cleared the standard.
        </template>
      </p>
    </div>

    <!-- Goals by role: a standard per role, counted per role. Emphasis only. -->
    <div
      v-if="isRoleGoals && matrix.roleShortfall.length"
      class="standard" data-role-standard-summary
    >
      <p class="kicker standard__kicker">Standards per role, not a ranking</p>
      <p
        v-for="s in matrix.roleShortfall" :key="s.role"
        class="standard__line" :data-role-shortfall="s.role"
      >{{ roleShortfallLine(s) }}</p>
    </div>

    <p v-if="matrix.leaderboard.length === 0" class="empty" data-leaderboard-empty>
      No results recorded for
      {{ matrix.selectedDrill ? matrix.selectedDrill.name : 'this exercise' }} yet.
    </p>

    <div v-else class="wrap">
      <table class="lb" data-exercise-leaderboard>
        <thead>
          <tr>
            <th
              v-for="c in columns" :key="c.key"
              :class="{ 'is-text': c.text }"
              :title="`Sort by ${c.label}`"
              :aria-sort="matrix.exerciseSort.by === c.key
                ? (matrix.exerciseDescends(c.key) ? 'descending' : 'ascending')
                : undefined"
            >
              <button
                type="button" class="th-btn"
                :data-exercise-sort="c.key" @click="matrix.setExerciseSort(c.key)"
              >{{ c.label }}{{ arrow(c.key) }}</button>
            </th>
            <th title="Points available from this exercise">Of</th>
            <th v-if="matrix.isThreshold || isRoleGoals">Standard</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="r in matrix.leaderboard" :key="r.playerId"
            :data-standing="isRoleGoals ? roleGoalStanding(r) : standing(r)"
            data-leaderboard-row
          >
            <td class="tnum muted">{{ r.recordingNumber != null ? r.recordingNumber : '—' }}</td>
            <td class="is-text">
              <button
                type="button" class="who" data-leaderboard-player
                title="See this player's sessions for this exercise"
                @click="emit('openPlayer', r.playerId)"
              >{{ r.name }}</button>
            </td>
            <template v-if="isWinLoss">
              <td class="tnum">{{ r.wins }} - {{ r.draws }} - {{ r.losses }}</td>
            </template>
            <template v-else-if="isRoleGoals">
              <td class="is-text" data-goal-role>{{ r.role ? roleLabel(r.role) : '—' }}</td>
              <td class="tnum" data-goal-score>{{ r.goalsFor != null && r.goalsAgainst != null ? `${r.goalsFor}-${r.goalsAgainst}` : '—' }}</td>
              <td class="tnum">{{ r.diff != null ? formatGoalDifference(r.diff) : '—' }}</td>
              <td class="tnum muted">{{ share(r.baseFactor) }}</td>
              <td class="tnum muted">{{ share(r.bonusFactor) }}</td>
            </template>
            <template v-else>
              <td class="tnum">{{ best(r) }}</td>
              <td class="tnum muted" data-exercise-avg>{{ avg(r) }}</td>
            </template>
            <td class="tnum points">{{ r.earned.toFixed(2) }}</td>
            <td class="tnum muted">{{ r.available.toFixed(2) }}</td>
            <td v-if="matrix.isThreshold" class="tnum">
              <span
                v-if="standing(r) === 'below' || standing(r) === 'missed'"
                class="mark mark--short" data-below-standard
              >{{ standing(r) === 'missed' ? 'no band' : '△ below' }}</span>
              <span v-else-if="standing(r) === 'met'" class="mark">
                met<span
                  v-if="runs(r)" class="mark__runs" data-standard-runs
                  :title="`Cleared the standard on ${runs(r)} runs`"
                > · {{ runs(r) }}</span>
              </span>
              <!-- Never run. Marked apart from a slow run because it asks
                   something different of a coach, but counted with it. -->
              <span v-else class="mark mark--short" data-no-runs>△ no runs</span>
            </td>
            <td v-if="isRoleGoals" class="tnum">
              <span
                v-if="roleGoalStanding(r) === 'below'"
                class="mark mark--short" data-below-standard
              >△ below</span>
              <span v-else-if="roleGoalStanding(r) === 'met'" class="mark">met</span>
              <span v-else class="mark mark--none">—</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="foot">
        Below-standard players are marked in words as well as colour, and stay
        where the sort puts them. The table is never narrowed — a squad where
        everyone passes is a fit squad, not a broken exercise.
      </p>
    </div>
  </div>
</template>

<style scoped>
.lb__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.lb__name {
  margin-top: 6px;
  font-family: var(--heading-face);
  font-weight: 400;
  font-size: 25px;
  line-height: 1.15;
  color: var(--ink);
}

.standard {
  margin-bottom: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-md);
}

.standard__kicker { color: var(--rule-strong); }
.standard__line { margin-top: 8px; font-size: 13.5px; line-height: 1.4; color: var(--ink); }
.standard__count { font-family: var(--heading-face); font-size: 34px; line-height: 1; margin-right: 6px; }

.wrap { overflow-x: auto; }
.lb { width: 100%; border-collapse: collapse; font-size: 13px; }

.lb th, .lb td {
  padding: 9px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  white-space: nowrap;
}

.lb th { border-bottom-color: var(--rule-strong); }
.lb th.is-text, .lb td.is-text { text-align: left; }

.lb th {
  color: var(--ink-muted);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.th-btn {
  padding: 0; border: 0; background: none; color: inherit;
  font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer;
}

.th-btn:hover { color: var(--ink); }

.tnum { font-variant-numeric: tabular-nums; }
.muted { color: var(--ink-muted); }
.points { font-family: var(--heading-face); font-size: 16px; color: var(--ink); }

/* Marked, never moved: the row stays exactly where the chosen sort puts it. */
.mark { font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-muted); }
.mark--short { color: var(--color-warning); }
.mark--none { color: var(--ink-muted); }

.foot {
  padding: var(--space-3) 0 0;
  font-size: 11.5px;
  line-height: 1.55;
  font-style: italic;
  color: var(--ink-muted);
}

.empty { padding: var(--space-8) var(--space-3); text-align: center; color: var(--ink-muted); }

@media (max-width: 767.98px) {
  .lb td.is-text, .lb th.is-text { position: sticky; left: 0; background: var(--ground); }
}

/* The same affordance the board gives a name: a button that does not look
   like one until you reach it. */
.who {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.who:hover, .who:focus-visible { color: var(--live); }

/* The ratio is context for the verdict beside it, not a second verdict. */
.mark__runs { color: var(--ink-muted); }

.lb__acts { display: flex; gap: var(--space-2); flex: none; }
</style>
