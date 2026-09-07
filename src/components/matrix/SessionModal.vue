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
import { ref, computed, watch, nextTick } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { useSessionStore } from '../../stores/session';
import { compareSessionPlayers } from '../../domain/matrix-session';
import { bandFeedback } from '../../domain/band-score';
import {
  blankEntries, entriesFromResults, attendanceAfterInput,
  toSessionResults, presentWithoutResult,
  type EntryRow
} from '../../domain/session-entry';

const props = defineProps<{
  open: boolean;
  teamId: string | null;
  schoolId: string | null;
  players: any[];
  /** The exercise being recorded. Chosen before the grid opens. */
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

const sort = ref({ by: 'recordingNumber', reversed: false });
const rowsEl = ref<HTMLElement | null>(null);

const drill = computed(() => session.drills.find((d: any) => d.id === props.drillId) || null);
const measure = computed(() => drill.value?.measure || 'count_high');
const isBanded = computed(() => measure.value === 'time_bands');
const isOutcome = computed(() => measure.value === 'win_loss');

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
  () => [props.open, props.drillId, props.players, session.results] as const,
  () => {
    if (!props.open) return;
    entries.value = session.results.length
      ? entriesFromResults(props.players, session.results, measure.value)
      : blankEntries(props.players, measure.value);
  },
  { immediate: true, deep: true }
);

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
    error.value = `Marked here with no result: ${short.map(p => p.name).join(', ')}. `
      + 'Enter one, or mark them absent.';
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

watch(() => props.open, async (open) => {
  if (!open) return;
  error.value = null;
  jumpError.value = '';
  await nextTick();
});
</script>

<template>
  <BaseModal
    :open="open"
    :title="session.editingId ? `Edit session — ${drill?.name || 'exercise'}` : `Record ${drill?.name || 'a session'}`"
    wide
    @close="emit('close')"
  >
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

    <p v-if="isBanded && session.bands.length === 0" class="hint" data-no-bands>
      No standards set for this squad yet. Times are recorded, and score once
      the standards are entered.
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
            <th class="is-text">{{ isOutcome ? 'Result' : 'Value' }}</th>
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
                <option value="draw">Drew</option>
                <option value="loss">Lost</option>
              </select>

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

    <p v-if="error" class="hint hint--bad" role="alert" data-session-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button
        ref="saveBtn" type="button" class="btn btn--primary"
        :disabled="saving" data-session-save
        @click="onSave"
      >{{ saving ? 'Saving…' : 'Save session' }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-bottom: 0.8rem; }

.fld { display: flex; flex-direction: column; gap: 0.25rem; }
.fld--wide { flex: 1; min-width: 14rem; }

.fld__label {
  color: var(--text-muted, #94a3b8);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.fld__input, .inp {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: var(--bhs-navy-bg);
  color: var(--ink);
  font: inherit;
  font-size: 0.82rem;
}

.inp { max-width: 8.5rem; }
.jump { display: flex; gap: 0.4rem; }

.hint { margin: 0.5rem 0; color: var(--text-muted, #94a3b8); font-size: 0.8rem; line-height: 1.5; }
.hint--bad { color: var(--color-danger, #f87171); }

.wrap { overflow-x: auto; max-height: 60vh; overflow-y: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.85rem; }

.tbl th, .tbl td {
  padding: 0.35rem 0.5rem;
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
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.tabular { font-variant-numeric: tabular-nums; }

.earned { margin-left: 0.4rem; font-size: 0.74rem; }
.earned--good { color: var(--bhs-cyan-accent); }
.earned--none { color: var(--text-muted, #94a3b8); }
.earned--bad { color: var(--color-danger, #f87171); }

.btn {
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.btn--quiet { color: var(--text-muted, #94a3b8); font-size: 0.72rem; }
.btn--primary { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
.btn:disabled { opacity: 0.55; cursor: default; }
</style>
