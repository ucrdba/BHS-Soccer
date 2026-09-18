<script setup lang="ts">
/**
 * A whole squad's results for one exercise, entered in one pass.
 *
 * What this screen has to beat is paper. A coach with a clipboard and a
 * stopwatch enters twenty-five times in a row, one hand on the number pad and
 * the other holding the sheet, and reaching for the mouse between every
 * player is the slow part. Three things follow, and they are requirements
 * rather than conveniences:
 *
 *   - Enter moves to the next entry field. Not submit, not nothing.
 *   - It moves in the order shown, which after a sort is not the roster order.
 *   - Typing a value marks the player present; a recorded time is evidence of
 *     attendance and outranks whatever the dropdown said.
 *
 * The jump box scrolls and focuses rather than filtering, because a session is
 * entered for the whole squad and hiding the rest makes it easy to save with
 * players silently left out.
 */
import { ref, computed, watch } from 'vue';
import ToolScreen from '../layout/ToolScreen.vue';
import { supabaseService } from '../../data/supabase';
import { useSessionStore } from '../../stores/session';
import { compareSessionPlayers } from '../../domain/matrix-session';
import { bandFeedback } from '../../domain/band-score';
import { roleGoalFeedback } from '../../domain/role-goal-score';
import { GOAL_ROLES } from '../../domain/goal-bands-draft';
import { roleLabel } from '../../domain/position';
import { entryFormat, entryTally } from '../../domain/session-format';
import {
  blankEntries, entriesFromResults, attendanceAfterInput,
  toSessionResults, presentWithoutResult, startingSessionDate, fillBlankOutcomes, clearOutcomes,
  applyOutcomeLists, type EntryRow, type OutcomeLists
} from '../../domain/session-entry';

const props = defineProps<{
  teamId: string | null;
  schoolId: string | null;
  players: any[];
  /** The exercise being recorded. Chosen before the screen opens. */
  drillId: string;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const session = useSessionStore();

const entries = ref<Record<string, EntryRow>>({});
const occurredOn = ref('');
const notes = ref('');
const error = ref<string | null>(null);
const saving = ref(false);

const jump = ref('');
const jumpError = ref('');

/**
 * The date box, filled rather than left blank.
 *
 * A recorded session opens on its own date and a new one on today. Keyed on
 * the session being opened, so switching exercises re-seeds it and a date the
 * coach has typed over survives every other change on the screen.
 */
watch(
  () => session.editing?.occurred_on || '',
  stored => { occurredOn.value = startingSessionDate(stored); },
  { immediate: true }
);

const sort = ref({ by: 'recordingNumber', reversed: false });
const rowsEl = ref<HTMLElement | null>(null);

const drill = computed(() => session.drills.find((d: any) => d.id === props.drillId) || null);
const measure = computed(() => drill.value?.measure || 'count_high');
const isBanded = computed(() => measure.value === 'time_bands');
const isOutcome = computed(() => measure.value === 'win_loss');
const isRoleGoals = computed(() => measure.value === 'role_goals');

/** The squad-wide results, in the same order as each row's dropdown. */
const FILL_OPTIONS = [
  { value: 'win', label: 'Won' },
  { value: 'draw', label: 'Tie' },
  { value: 'loss', label: 'Lost' }
];

const live = computed(() => (props.players || []).filter(p => !p?.is_deleted && !p?.isDeleted));

/** The order on screen, which the keyboard follows. */
const rows = computed(() =>
  live.value.slice().sort((a, b) => compareSessionPlayers(a, b, sort.value.by, sort.value.reversed)));

function setSort(by: string): void {
  // No draft capture needed: the values are state, not DOM. See the module
  // comment in domain/session-entry.ts.
  sort.value = sort.value.by === by
    ? { by, reversed: !sort.value.reversed }
    : { by, reversed: false };
}

/** Rebuild the grid whenever the exercise or the stored results change. */
watch(
  () => [props.drillId, props.players, session.results] as const,
  () => {
    entries.value = session.results.length
      ? entriesFromResults(props.players, session.results, measure.value)
      : blankEntries(props.players, measure.value);
  },
  { immediate: true, deep: true }
);

const format = computed(() => entryFormat(measure.value));
const tally = computed(() => entryTally(props.players, entries.value, measure.value));

const title = computed(() =>
  session.editingId ? `Edit ${drill.value?.name || 'session'}` : (drill.value?.name || 'Session'));

function onValue(playerId: string, value: string): void {
  const row = entries.value[playerId];
  if (!row) return;
  entries.value[playerId] = {
    ...row, value, attendance: attendanceAfterInput(value, measure.value)
  };
}

function onOutcome(playerId: string, outcome: string): void {
  const row = entries.value[playerId];
  if (!row) return;
  entries.value[playerId] = { ...row, outcome, attendance: outcome ? 'present' : row.attendance };
}

/**
 * One press for the whole sheet.
 *
 * A small-sided session is two sides of the same squad, so the fast entry is
 * "everyone lost" and then a flip of the side that won. It fills blanks only
 * and skips anyone not marked here — see `fillBlankOutcomes`.
 */
function onFillOutcomes(outcome: string): void {
  entries.value = fillBlankOutcomes(entries.value, outcome);
}

/**
 * Empty the Result column, after asking.
 *
 * It sits beside Lost, and a mis-tap would wipe a sheet already entered with
 * nothing on screen to say so -- so it confirms, but only when there is
 * something to lose. Attendance is kept; see `clearOutcomes`.
 */
function onResetOutcomes(): void {
  const set = Object.values(entries.value).filter(r => r.outcome).length;
  if (!set) return;
  const who = `${set} player${set === 1 ? '' : 's'}`;
  if (!window.confirm(`Clear the result for ${who}? Attendance is kept.`)) return;
  entries.value = clearOutcomes(entries.value);
}

/**
 * Goals by role: the role for THIS session. Changing it touches nothing else
 * -- not attendance, and not the roster.
 */
function onRole(playerId: string, role: string): void {
  const row = entries.value[playerId];
  if (!row) return;
  entries.value[playerId] = { ...row, role };
}

function goalFeedback(playerId: string) {
  const row = entries.value[playerId];
  return roleGoalFeedback(row?.value || '', row?.role, session.goalBands as any, drill.value?.points);
}

/** The Won / Tie / Lost boxes, typed as the paper sheet reads. */
const OUTCOME_LISTS: { key: keyof OutcomeLists; label: string; placeholder: string }[] = [
  { key: 'win', label: 'Won', placeholder: 'Recording numbers that won, e.g. 17, 21, 11, 19' },
  { key: 'draw', label: 'Tie', placeholder: 'Recording numbers that tied, e.g. 1, 6, 7, 9' },
  { key: 'loss', label: 'Lost', placeholder: 'Recording numbers that lost, e.g. 21, 22, 23' }
];
const outcomeLists = ref<OutcomeLists>({ win: '', draw: '', loss: '' });
const listsError = ref('');
const listsNotice = ref('');

/**
 * Apply the lists to the grid, all or nothing -- see `applyOutcomeLists`.
 *
 * Only on a press (or Enter), never as the numbers are typed: "17, 2" on the
 * way to "17, 21" would otherwise set player 2 for a moment and leave them set.
 */
function onApplyLists(): void {
  listsError.value = '';
  listsNotice.value = '';
  const res = applyOutcomeLists(props.players, entries.value, outcomeLists.value);
  if (!res.ok) { listsError.value = (res as { error: string }).error; return; }
  entries.value = res.entries;
  if (res.applied) listsNotice.value = `Set ${res.applied} result${res.applied === 1 ? '' : 's'}.`;
}

function onAttendance(playerId: string, attendance: string): void {
  const row = entries.value[playerId];
  if (!row) return;
  entries.value[playerId] = { ...row, attendance: attendance as EntryRow['attendance'] };
}

/**
 * Take a player out of this session.
 *
 * EXCUSED, not no-show: an excused row is in neither the earned nor the
 * available column, so undoing a mistaken entry costs the player nothing.
 * A no-show scores 0 of the weight, which is a penalty for the coach's typo.
 */
function clearRow(playerId: string): void {
  const row = entries.value[playerId];
  if (!row) return;
  entries.value[playerId] = { ...row, value: '', outcome: '', attendance: 'excused' };
}

function earned(playerId: string): string {
  if (!isBanded.value) return '';
  return bandFeedback(entries.value[playerId]?.value || '', session.bands as any).text;
}

function earnedTone(playerId: string): string {
  if (!isBanded.value) return '';
  return bandFeedback(entries.value[playerId]?.value || '', session.bands as any).tone;
}

/** Every entry control, in the order it appears on screen. */
function entryFields(): HTMLElement[] {
  if (!rowsEl.value) return [];
  return Array.from(rowsEl.value.querySelectorAll<HTMLElement>('[data-entry-field]'));
}

/**
 * Enter moves on rather than submitting.
 *
 * Past the last player it goes to Save, not back to the top — looping would
 * overwrite the first entry with the next keystroke, and the coach would not
 * see it happen.
 */
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter') return;
  const el = e.target as HTMLElement;
  if (!el?.hasAttribute?.('data-entry-field')) return;

  e.preventDefault();
  const fields = entryFields();
  const i = fields.indexOf(el);
  if (i === -1) return;

  const next = fields[i + 1];
  if (next) {
    next.focus();
    (next as HTMLInputElement).select?.();
    // On a phone the keyboard covers the lower half, and the next row is
    // usually under it.
    next.scrollIntoView?.({ block: 'center' });
    return;
  }
  saveBtn.value?.focus();
}

const saveBtn = ref<HTMLButtonElement | null>(null);

async function onJump(): Promise<void> {
  jumpError.value = '';
  const typed = jump.value.trim();
  if (!typed) return;
  if (!props.teamId) { jumpError.value = 'Choose a team first.'; return; }

  const res = await supabaseService.findPlayerOnTeam(props.teamId, typed);
  if (!res?.ok || !res.player) {
    jumpError.value = res?.error || 'Could not find that player.';
    return;
  }

  const row = rowsEl.value?.querySelector<HTMLElement>(`[data-grid-row="${res.player.id}"]`);
  if (!row) {
    // On the team but not on screen: they joined after this session was
    // recorded, or the grid is showing a different squad.
    jumpError.value = `${res.player.name} is not in this session's list.`;
    return;
  }

  jump.value = '';
  row.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  row.querySelector<HTMLElement>('[data-entry-field]')?.focus();
}

async function onSave(): Promise<void> {
  error.value = null;

  if (!occurredOn.value) { error.value = 'Pick the date this session happened.'; return; }

  const short = presentWithoutResult(props.players, entries.value, measure.value);
  if (short.length) {
    // Named, because the client's own guard reports a uuid — no use to
    // somebody looking at twenty-five rows.
    const who = short.map(p => p.name).join(', ');
    error.value = isRoleGoals.value
      ? `Needs a role and a score like 3-1: ${who}. Enter both, or mark them absent.`
      : `Marked here with no result: ${who}. Enter one, or mark them absent.`;
    return;
  }

  // Disabled for the duration: a double-click would write two sessions and
  // double everyone's available. Always re-enabled, including on failure, or
  // a refused save strands the coach with a sheet already entered.
  saving.value = true;
  try {
    const res = await session.save(
      props.teamId,
      { drillId: props.drillId, occurredOn: occurredOn.value, notes: notes.value || undefined },
      toSessionResults(props.players, entries.value, measure.value)
    );
    if (!res?.ok) { error.value = res?.error || 'Could not save that session.'; return; }

    emit('saved');
    emit('close');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ToolScreen
    :title="title" kicker="Session entry"
    :back-to="{ name: 'matrix' }" back-label="Ratings"
  >
    <template #top-right>
      <button
        type="button" class="sortbtn" data-grid-sort-toggle
        @click="setSort(sort.by === 'name' ? 'recordingNumber' : 'name')"
      >Sort: {{ sort.by === 'name' ? 'name' : 'recording no.' }} ▾</button>
    </template>

    <p v-if="format" class="format" data-entry-format>
      <span class="format__figure tnum">{{ format.figure }}</span>
      <span class="format__note">{{ format.note }}</span>
    </p>

    <div class="head">
      <label class="fld">
        <span class="fld__label">Date</span>
        <input v-model="occurredOn" type="date" class="fld__input" data-session-date />
      </label>

      <label class="fld fld--wide">
        <span class="fld__label">Jump to player</span>
        <span class="jump">
          <input
            v-model="jump" type="text" class="fld__input"
            placeholder="Recording number or name"
            data-jump-input
            @keydown.enter.prevent="onJump"
          />
          <button type="button" class="btn" data-jump-go @click="onJump">Go</button>
        </span>
      </label>
    </div>

    <p v-if="jumpError" class="hint hint--bad" role="status" data-jump-error>{{ jumpError }}</p>

    <div v-if="isOutcome" class="fill" data-fill>
      <span class="fill__label">Fill the rest</span>
      <button
        v-for="o in FILL_OPTIONS" :key="o.value"
        type="button" class="btn" data-fill-outcome
        @click="onFillOutcomes(o.value)"
      >{{ o.label }}</button>
      <button type="button" class="btn" data-fill-reset @click="onResetOutcomes">Reset</button>
      <span class="fill__note">Players you have already set keep their result.</span>
    </div>

    <div v-if="isOutcome" class="lists" data-outcome-lists>
      <label v-for="l in OUTCOME_LISTS" :key="l.key" class="lists__row">
        <span class="fill__label lists__label">{{ l.label }}</span>
        <input
          v-model="outcomeLists[l.key]" type="text" class="fld__input lists__input"
          inputmode="numeric" :placeholder="l.placeholder" :aria-label="l.placeholder"
          :data-outcome-list="l.key"
          @keydown.enter.prevent="onApplyLists"
        />
      </label>
      <p class="fill__note" data-outcome-lists-hint>
        Optional. Separate numbers with commas or spaces, then press Apply lists. Anyone not
        listed keeps what is in the grid, and you can still set results row by row.
      </p>
      <button type="button" class="btn" data-outcome-lists-apply @click="onApplyLists">Apply lists</button>
      <p v-if="listsError" class="hint hint--bad" role="alert" data-outcome-lists-error>{{ listsError }}</p>
      <p v-else-if="listsNotice" class="hint" role="status" data-outcome-lists-notice>{{ listsNotice }}</p>
    </div>

    <p v-if="isBanded && session.bands.length === 0" class="hint" data-no-bands>
      No standards set for this squad yet. Times are recorded, and score once
      the standards are entered.
    </p>

    <p v-if="isRoleGoals && session.goalBands.length === 0" class="hint" data-no-goal-bands>
      No standards set for this squad yet. Scores are recorded, and count once
      the standards are entered in Weights and standards.
    </p>

    <div class="wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>
              <button type="button" class="th" data-grid-sort="recordingNumber" @click="setSort('recordingNumber')">#</button>
            </th>
            <th class="is-text">
              <button type="button" class="th" data-grid-sort="name" @click="setSort('name')">Player</button>
            </th>
            <th class="is-text">{{ isOutcome ? 'Result' : isRoleGoals ? 'Role · score' : 'Value' }}</th>
            <th class="is-text">Attendance</th>
            <th></th>
          </tr>
        </thead>
        <tbody ref="rowsEl" @keydown="onKeydown">
          <tr v-for="p in rows" :key="p.id" :data-grid-row="p.id">
            <td class="tabular">{{ p.recordingNumber != null ? p.recordingNumber : '—' }}</td>
            <td class="is-text" data-grid-name>{{ p.name }}</td>

            <td class="is-text">
              <select
                v-if="isOutcome"
                class="inp" data-entry-field
                :value="entries[p.id]?.outcome || ''"
                @change="onOutcome(p.id, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">— result —</option>
                <option value="win">Won</option>
                <option value="draw">Tie</option>
                <option value="loss">Lost</option>
              </select>

              <span v-else-if="isRoleGoals" class="goals">
                <select
                  class="inp" data-entry-field data-role-select
                  aria-label="Role this session"
                  :value="entries[p.id]?.role || ''"
                  @change="onRole(p.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">— role —</option>
                  <option v-for="r in GOAL_ROLES" :key="r" :value="r">{{ roleLabel(r) }}</option>
                </select>
                <input
                  class="inp" data-entry-field data-goal-score
                  type="text" placeholder="3-1" aria-label="Score, scored then given up"
                  :value="entries[p.id]?.value || ''"
                  @input="onValue(p.id, ($event.target as HTMLInputElement).value)"
                />
                <span
                  class="earned" :class="`earned--${goalFeedback(p.id).tone}`"
                  data-goal-earned
                >{{ goalFeedback(p.id).text }}</span>
              </span>

              <template v-else>
                <input
                  class="inp" data-entry-field
                  :type="isBanded ? 'text' : 'number'"
                  :step="isBanded ? undefined : 'any'"
                  :placeholder="isBanded ? '4:30 or 4.30' : ''"
                  :value="entries[p.id]?.value || ''"
                  @input="onValue(p.id, ($event.target as HTMLInputElement).value)"
                />
                <span
                  v-if="isBanded" class="earned" :class="`earned--${earnedTone(p.id)}`"
                  data-band-earned
                >{{ earned(p.id) }}</span>
              </template>
            </td>

            <td class="is-text">
              <select
                class="inp" data-attendance
                :value="entries[p.id]?.attendance"
                @change="onAttendance(p.id, ($event.target as HTMLSelectElement).value)"
              >
                <option value="present">Here</option>
                <option value="excused">Excused</option>
                <option value="unexcused">No-show</option>
              </select>
            </td>

            <td>
              <button
                type="button" class="btn btn--quiet" data-grid-clear
                title="Take this player out of the session"
                @click="clearRow(p.id)"
              >Clear</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="error" class="refused" role="alert" data-session-refused>
      <p class="refused__title">Not saved</p>
      <p class="refused__body" data-session-error>{{ error }}</p>
      <p class="refused__note">Your entries are still in the fields above.</p>
    </div>

    <template #foot>
      <p class="tally tnum" data-entry-tally>
        <span class="tally__done">{{ tally.timed }} recorded</span>
        · {{ tally.absent }} absent · {{ tally.remaining }} to go
      </p>
      <button
        ref="saveBtn" type="button" class="savebtn"
        :disabled="saving" data-session-save
        @click="onSave"
      >{{ saving ? 'Saving…' : 'Save session' }}</button>
    </template>
  </ToolScreen>
</template>

<style scoped>
.format {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-md);
}

.format__figure { font-family: var(--heading-face); font-size: 19px; color: var(--rule-strong); }
.format__note { font-size: 11.5px; line-height: 1.4; color: var(--ink); }

.head { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-3); }

.fill {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.fill__label {
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.fill__note { font-size: 11.5px; color: var(--ink-soft); }

.lists { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
.lists__row { display: flex; align-items: center; gap: var(--space-2); }
.lists__label { width: 3.5rem; flex: none; }
.lists__input { flex: 1; min-width: 0; }
.lists .btn { align-self: flex-start; }

.fld { display: flex; flex-direction: column; gap: 4px; }
.fld--wide { flex: 1; min-width: 14rem; }

.fld__label {
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.fld__input {
  min-height: 40px;
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
}

.fld__input:focus-visible { border-color: var(--live); outline-offset: 0; }
.jump { display: flex; gap: var(--space-2); }

.wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }

.tbl th, .tbl td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
}

.tbl th { border-bottom-color: var(--rule-strong); }
.tbl th.is-text, .tbl td.is-text { text-align: left; }

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
.tabular { font-variant-numeric: tabular-nums; }

/*
 * 48px, right-aligned, in the heading face: a coach enters twenty-five of
 * these one-handed while holding a clipboard, and the field is the whole
 * point of the screen.
 */
.inp {
  width: 84px;
  height: 48px;
  box-sizing: border-box;
  padding: 0 9px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--surface-deep);
  color: var(--ink);
  font-family: var(--heading-face);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.inp:focus-visible { border-color: var(--live); outline-offset: 0; }
select.inp { width: auto; min-width: 96px; font-size: 14px; text-align: left; }

.goals { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }

.earned { margin-left: var(--space-2); font-size: 11px; }
.earned--good { color: var(--live); }
.earned--none { color: var(--ink-muted); }
.earned--bad { color: var(--color-warning); }

.hint { margin: var(--space-2) 0; font-size: 12px; line-height: 1.5; color: var(--ink-muted); }
.hint--bad { color: var(--color-warning); }

.refused {
  margin-top: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-warning);
  border-left-width: 4px;
  border-radius: var(--radius-md);
}

.refused__title {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-warning);
}

.refused__body { margin-top: 6px; font-size: 13px; line-height: 1.5; color: var(--ink); }
.refused__note { margin-top: 6px; font-size: 12px; color: var(--ink-muted); }

.btn {
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.btn--quiet { color: var(--ink-muted); font-size: 12px; }

.sortbtn {
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--live);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.tally { flex: 1; align-self: center; font-size: 11.5px; line-height: 1.4; color: var(--ink-muted); }
.tally__done { color: var(--ink); }

.savebtn {
  min-height: 48px;
  padding: 0 var(--space-4);
  border: 1.5px solid var(--live);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--live);
  font-family: var(--heading-face);
  font-size: 16px;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.savebtn:disabled { opacity: 0.55; cursor: default; }
</style>
