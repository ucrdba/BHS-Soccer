<script setup lang="ts">
/**
 * 1v1 results, recorded.
 *
 * A `head_to_head` exercise is scored from pairings in `matrix_logs` — one row
 * naming both players and who won — and not from a session, because a session
 * result is one row per player and has nowhere to put the opponent.
 *
 * **Two ways in, because they answer different situations.** Quick entry takes
 * `1w3` — number 1 beat number 3 — a box at a time, which is how a round robin
 * comes off a paper sheet: twenty-five pairings picked out of two dropdowns is
 * slower than the paper it replaces. The picker stays for the coach who has a
 * single result and does not have the sheet in front of them, and for a squad
 * whose recording numbers have not been assigned yet.
 *
 * Players are labelled by recording number throughout, because that is what
 * both the sheet and the quick format are written in.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { roundRobinPlayers, roundRobinLabel, roundRobinPlayed } from '../../domain/round-robin';
import {
  readEntries, recordable, hasErrors, playerByNumber, describeRecorded,
  HOW_TO_ENTER, type RecordedResult
} from '../../domain/pairing-entry';

const props = defineProps<{
  open: boolean;
  teamId: string | null;
  /** The head_to_head exercise being recorded. */
  drillId: string;
  drillName: string;
  players: any[];
  /** Pairings already recorded, to catch a duplicate before it double-counts. */
  logs: any[];
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

/** How many empty boxes a fresh sheet opens with. */
const STARTING_BOXES = 5;

const mode = ref<'quick' | 'pick'>('quick');
const occurredOn = ref('');
const error = ref<string | null>(null);
const saved = ref<string | null>(null);
const saving = ref(false);

/* Quick entry. */
const texts = ref<string[]>([]);

/* The picker. */
const playerAId = ref('');
const playerBId = ref('');
const outcome = ref('');
const scoreText = ref('');
/**
 * The recording number typed beside each dropdown.
 *
 * Kept as the text that was typed rather than derived from the chosen player,
 * so a half-typed number is not rewritten under the coach's fingers and a
 * number nobody carries stays on screen to be corrected.
 */
const numberA = ref('');
const numberB = ref('');

/* The table of what is already recorded. */
const editingId = ref<string | null>(null);
const editOutcome = ref('');
const editDate = ref('');
const editScore = ref('');
/** Which row has been asked to be deleted and is waiting to be told again. */
const confirmingId = ref<string | null>(null);
const rowError = ref<string | null>(null);
const busyId = ref<string | null>(null);

const today = (): string => new Date().toISOString().slice(0, 10);

/** Sorted by recording number and without the deleted, as the sheet reads. */
const roster = computed(() => roundRobinPlayers(props.players));

const numbered = computed(() =>
  roster.value.filter(p => p.recordingNumber !== null && p.recordingNumber !== undefined));

const playerA = computed(() => roster.value.find(p => p.id === playerAId.value) || null);
const playerB = computed(() => roster.value.find(p => p.id === playerBId.value) || null);

/** Pairings already in the database, keyed by the unordered pair. */
const played = computed(() => roundRobinPlayed(props.logs));

// ── quick entry ───────────────────────────────────────────────────────────

const lines = computed(() => readEntries(texts.value, roster.value, roundRobinLabel));

const ready = computed(() => recordable(lines.value).length > 0 && !hasErrors(lines.value));

/**
 * Which typed boxes name a fixture already in the database.
 *
 * Not an error: a replayed fixture is a real thing. Counted and said, because
 * each side is scored separately and a second row moves both players.
 */
const repeats = computed(() =>
  recordable(lines.value).filter(l => !!played.value[l.resolved!.key]));

/** A box is never the last one: there is always somewhere to type next. */
function onInput(index: number, value: string): void {
  const next = texts.value.slice();
  next[index] = value;
  if (index === next.length - 1 && value.trim()) next.push('');
  texts.value = next;
}

/**
 * Enter moves to the next box rather than submitting.
 *
 * The same rule the session grid has, and for the same reason: a coach with a
 * clipboard types a column of these one-handed, and a form that submits on the
 * first Enter records one pairing out of twenty.
 */
function onKeydown(index: number, e: KeyboardEvent): void {
  if (e.key !== 'Enter') return;
  e.preventDefault();

  const boxes = Array.from(
    document.querySelectorAll<HTMLInputElement>('[data-quick-box]'));
  (boxes[index + 1] || boxes[boxes.length - 1])?.focus();
}

// ── the picker ────────────────────────────────────────────────────────────

/**
 * Typing a number picks the player; choosing a player fills the number.
 *
 * Two controls over one value, which is the point: the number is faster when
 * the sheet is to hand, and the list is the only way in when it is not or when
 * the squad has no numbers yet.
 */
function onNumber(side: 'a' | 'b', text: string): void {
  const hit = playerByNumber(roster.value, text);
  if (side === 'a') { numberA.value = text; playerAId.value = hit ? hit.id : ''; }
  else { numberB.value = text; playerBId.value = hit ? hit.id : ''; }
}

function onPick(side: 'a' | 'b', id: string): void {
  const chosen = roster.value.find(p => p.id === id) || null;
  const num = chosen?.recordingNumber;
  const text = num === null || num === undefined ? '' : String(num);
  if (side === 'a') { playerAId.value = id; numberA.value = text; }
  else { playerBId.value = id; numberB.value = text; }
}

/** A number that was typed and matched nobody. Blank is not a miss. */
const missA = computed(() => !!numberA.value.trim() && !playerAId.value);
const missB = computed(() => !!numberB.value.trim() && !playerBId.value);

const sameTwice = computed(() =>
  !!playerAId.value && playerAId.value === playerBId.value);

const pickReady = computed(() =>
  !!playerAId.value && !!playerBId.value && !sameTwice.value && !!outcome.value);

const pickAlreadyPlayed = computed(() => {
  if (!playerAId.value || !playerBId.value) return null;
  return played.value[[playerAId.value, playerBId.value].sort().join('|')] || null;
});

/** What the existing result was, named rather than left as "a" or "b". */
const existingResult = computed(() => {
  const hit = pickAlreadyPlayed.value;
  if (!hit || !hit.outcome) return '';
  if (hit.outcome === 'draw') return 'a draw';

  // The stored outcome names which of the LOGGED pair won, which may be
  // either of the two chosen here.
  const winnerId = hit.outcome === 'a' ? hit.a : hit.b;
  const winner = roster.value.find(p => p.id === winnerId);
  return winner ? `${roundRobinLabel(winner)} winning` : 'a result';
});

const outcomes = computed(() => [
  { value: 'a', label: playerA.value ? `${roundRobinLabel(playerA.value)} won` : 'First player won' },
  { value: 'draw', label: 'Draw' },
  { value: 'b', label: playerB.value ? `${roundRobinLabel(playerB.value)} won` : 'Second player won' }
]);

// ── what is already recorded ──────────────────────────────────────────────

/**
 * Everything logged against this exercise, newest first.
 *
 * Read from the same `logs` the board holds, so a save that reloads the board
 * refreshes this table without it having to fetch anything of its own.
 */
const recorded = computed<RecordedResult[]>(() =>
  describeRecorded(props.logs, roster.value, roundRobinLabel, props.drillId));

/** The three outcomes for one recorded row, named by that row's players. */
function rowOutcomes(row: RecordedResult) {
  return [
    { value: 'a', label: row.playerA ? roundRobinLabel(row.playerA) : 'First' },
    { value: 'draw', label: 'Draw' },
    { value: 'b', label: row.playerB ? roundRobinLabel(row.playerB) : 'Second' }
  ];
}

function startEdit(row: RecordedResult): void {
  editingId.value = row.id;
  editOutcome.value = row.outcome;
  editDate.value = row.occurredOn;
  editScore.value = row.scoreText || '';
  confirmingId.value = null;
  rowError.value = null;
}

function cancelEdit(): void {
  editingId.value = null;
  rowError.value = null;
}

/**
 * Save one edited row.
 *
 * Every field is sent, not just the changed one: `updateMatrixResult` writes
 * the whole row, so an update carrying only the outcome would null the date,
 * the score and the drill the result belongs to.
 */
async function saveEdit(row: RecordedResult): Promise<void> {
  rowError.value = null;
  busyId.value = row.id;
  try {
    const res = await supabaseService.updateMatrixResult(row.id, {
      playerAId: row.playerA?.id,
      playerBId: row.playerB?.id,
      outcome: editOutcome.value,
      scoreText: editScore.value.trim() || null,
      occurredOn: editDate.value || row.occurredOn,
      drillId: props.drillId
    });

    if (!res?.ok) { rowError.value = res?.error || 'Could not change that result.'; return; }
    editingId.value = null;
    emit('saved');
  } finally {
    busyId.value = null;
  }
}

/**
 * Delete on a second press.
 *
 * The confirm IS the warning here -- unlike the duplicate-pairing case, where
 * the warning is already on screen before the button is reached. There is
 * nothing on a row to say that pressing Delete removes a result, so the row
 * says it itself.
 */
function askDelete(row: RecordedResult): void {
  confirmingId.value = row.id;
  editingId.value = null;
  rowError.value = null;
}

async function confirmDelete(row: RecordedResult): Promise<void> {
  rowError.value = null;
  busyId.value = row.id;
  try {
    const res = await supabaseService.deleteMatrixResult(row.id);
    if (!res?.ok) { rowError.value = res?.error || 'Could not delete that result.'; return; }
    confirmingId.value = null;
    emit('saved');
  } finally {
    busyId.value = null;
  }
}

// ── saving ────────────────────────────────────────────────────────────────

/**
 * Reset on each open, so yesterday's sheet is not half-filled in.
 *
 * `immediate` because this is also what creates the boxes. A watch that only
 * fired on a change would leave a modal mounted already-open with no boxes at
 * all, which is exactly how it is mounted in a test and how it would be
 * mounted by a route that opens straight onto it.
 */
watch(() => props.open, (open) => {
  if (!open) return;
  texts.value = Array(STARTING_BOXES).fill('');
  playerAId.value = '';
  playerBId.value = '';
  numberA.value = '';
  numberB.value = '';
  outcome.value = '';
  scoreText.value = '';
  occurredOn.value = today();
  error.value = null;
  saved.value = null;
  editingId.value = null;
  confirmingId.value = null;
  rowError.value = null;
  // A squad with no recording numbers cannot be typed at, so the picker is
  // the only way in and opening on quick entry would look broken.
  mode.value = numbered.value.length >= 2 ? 'quick' : 'pick';
}, { immediate: true });

async function write(aId: string, bId: string, out: string, score: string | null) {
  return supabaseService.logMatrixResult(props.teamId || '', {
    playerAId: aId, playerBId: bId, outcome: out,
    scoreText: score, occurredOn: occurredOn.value || today(),
    drillId: props.drillId
  });
}

/**
 * Send the typed sheet, one pairing at a time.
 *
 * There is no batch insert and no transaction, so a refusal partway leaves
 * what came before it written. The boxes that landed are cleared and the rest
 * are left exactly as typed, and the count is reported — a coach told "saved"
 * over a half-written sheet would record the remainder a second time.
 */
async function saveQuick(): Promise<void> {
  error.value = null;
  saved.value = null;

  const rows = recordable(lines.value);
  if (rows.length === 0) { error.value = 'Nothing to record yet.'; return; }

  saving.value = true;
  try {
    const done: string[] = [];
    for (const line of rows) {
      const r = line.resolved!;
      const res = await write(r.playerA.id, r.playerB.id, r.outcome, null);
      if (!res?.ok) {
        error.value = done.length
          ? `Recorded ${done.length} of ${rows.length}, then stopped: ${res?.error || 'the write was refused.'}`
          : (res?.error || 'Could not record that result.');
        break;
      }
      done.push(line.text);
    }

    if (done.length) {
      // What landed goes; what did not stays exactly as typed. Blank boxes
      // survive the filter on their own, since only a non-blank line records.
      const left = texts.value.filter(t => !done.includes(t));
      texts.value = left.some(t => !t.trim()) ? left : left.concat(['']);
      emit('saved');
    }

    if (!error.value) {
      saved.value = `Recorded ${done.length} ${done.length === 1 ? 'result' : 'results'}.`;
    }
  } finally {
    saving.value = false;
  }
}

async function savePick(): Promise<void> {
  error.value = null;
  saved.value = null;

  if (sameTwice.value) { error.value = 'A player cannot play themselves.'; return; }
  if (!pickReady.value) { error.value = 'Choose both players and who won.'; return; }

  saving.value = true;
  try {
    const res = await write(
      playerAId.value, playerBId.value, outcome.value, scoreText.value.trim() || null);
    if (!res?.ok) { error.value = res?.error || 'Could not record that result.'; return; }

    emit('saved');
    emit('close');
  } finally {
    saving.value = false;
  }
}

const onSave = () => (mode.value === 'quick' ? saveQuick() : savePick());
</script>

<template>
  <BaseModal :open="open" :title="`Record a 1v1 — ${drillName}`" wide @close="emit('close')">
    <div class="form">
      <nav class="modes" role="group" aria-label="How to enter results">
        <button
          type="button" class="mode" :class="{ 'is-on': mode === 'quick' }"
          :disabled="numbered.length < 2"
          :title="numbered.length < 2
            ? 'Assign recording numbers to the squad to type results this way.'
            : HOW_TO_ENTER"
          data-mode-quick @click="mode = 'quick'"
        >Type results</button>
        <button
          type="button" class="mode" :class="{ 'is-on': mode === 'pick' }"
          title="Choose two players and who won. One result at a time."
          data-mode-pick @click="mode = 'pick'"
        >Pick players</button>
      </nav>

      <label class="field date">
        <span class="field__label">Date</span>
        <input v-model="occurredOn" type="date" class="input" data-result-date />
      </label>

      <!-- ── typing them ─────────────────────────────────────────────── -->
      <template v-if="mode === 'quick'">
        <!--
          The format is stated on screen as well as in the tooltip. A tooltip
          is the only explanation on a desktop and no explanation at all on the
          phone a coach is holding at the side of a pitch.
        -->
        <p class="how" :title="HOW_TO_ENTER" data-quick-help>
          <strong>1w3</strong> — number 1 beat number 3. <strong>1t3</strong> — they tied.
          Capitals and spaces are fine. Enter moves to the next box.
        </p>

        <ol class="boxes">
          <li v-for="(t, i) in texts" :key="i" class="box">
            <input
              :value="t" type="text" class="input box__input"
              inputmode="text" autocomplete="off" spellcheck="false"
              :placeholder="i === 0 ? '1w3' : ''"
              :aria-label="`Result ${i + 1}`" :title="HOW_TO_ENTER"
              :class="{ 'is-bad': !!lines[i]?.error }"
              data-quick-box
              @input="onInput(i, ($event.target as HTMLInputElement).value)"
              @keydown="onKeydown(i, $event)" />

            <span
              v-if="lines[i]?.error" class="box__say box__say--bad"
              role="alert" data-quick-error
            >{{ lines[i].error }}</span>
            <span
              v-else-if="lines[i]?.reading" class="box__say" data-quick-reading
            >{{ lines[i].reading }}</span>
          </li>
        </ol>

        <!--
          Each side of a pairing is scored separately, so a second row for a
          fixture moves both players. Said, not refused: a replay is real, and
          only the coach knows which this is.
        -->
        <p v-if="repeats.length" class="note note--warn" role="status" data-quick-repeats>
          {{ repeats.length === 1 ? 'One of these pairings has' : `${repeats.length} of these pairings have` }}
          already been recorded ({{ repeats.map(r => r.text.trim()).join(', ') }}).
          Recording again counts both times.
        </p>

        <p class="tally" data-quick-tally>
          {{ recordable(lines).length }} to record.
        </p>
      </template>

      <!-- ── picking them ────────────────────────────────────────────── -->
      <template v-else>
        <!--
          A number and a list over one value. The number is faster when the
          sheet is to hand; the list is the only way in when it is not, or
          when the squad has no recording numbers yet.
        -->
        <div class="pair">
          <div class="field">
            <span class="field__label">Player</span>
            <div class="who">
              <input
                :value="numberA" type="text" class="input who__num"
                inputmode="numeric" autocomplete="off"
                placeholder="No." aria-label="Player by recording number"
                title="Type the player's recording number, or choose the name beside it."
                :class="{ 'is-bad': missA }"
                data-result-number-a
                @input="onNumber('a', ($event.target as HTMLInputElement).value)" />
              <select
                :value="playerAId" class="input" aria-label="Player"
                data-result-player-a
                @change="onPick('a', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Choose a player</option>
                <option v-for="p in roster" :key="p.id" :value="p.id">{{ roundRobinLabel(p) }}</option>
              </select>
            </div>
          </div>

          <span class="pair__v" aria-hidden="true">v</span>

          <div class="field">
            <span class="field__label">Opponent</span>
            <div class="who">
              <input
                :value="numberB" type="text" class="input who__num"
                inputmode="numeric" autocomplete="off"
                placeholder="No." aria-label="Opponent by recording number"
                title="Type the opponent's recording number, or choose the name beside it."
                :class="{ 'is-bad': missB }"
                data-result-number-b
                @input="onNumber('b', ($event.target as HTMLInputElement).value)" />
              <select
                :value="playerBId" class="input" aria-label="Opponent"
                data-result-player-b
                @change="onPick('b', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Choose a player</option>
                <option v-for="p in roster" :key="p.id" :value="p.id">{{ roundRobinLabel(p) }}</option>
              </select>
            </div>
          </div>
        </div>

        <p v-if="missA || missB" class="note note--bad" role="alert" data-result-missing>
          No player has recording number
          {{ [missA ? numberA.trim() : null, missB ? numberB.trim() : null].filter(Boolean).join(' or ') }}.
        </p>

        <p v-if="sameTwice" class="note note--bad" role="alert" data-result-same>
          A player cannot play themselves.
        </p>

        <fieldset class="outcomes">
          <legend class="field__label">Result</legend>
          <button
            v-for="o in outcomes" :key="o.value"
            type="button" class="outcome" :class="{ 'is-on': outcome === o.value }"
            :aria-pressed="outcome === o.value"
            :data-result-outcome="o.value" @click="outcome = o.value"
          >{{ o.label }}</button>
        </fieldset>

        <label class="field">
          <!--
            Free text, not a pair of numbers: 1v1s are scored on the outcome
            alone, and a score is a note about how it went.
          -->
          <span class="field__label">Score <span class="field__hint">optional</span></span>
          <input
            v-model="scoreText" type="text" class="input"
            placeholder="e.g. 3-1" data-result-score />
        </label>

        <p v-if="pickAlreadyPlayed" class="note note--warn" role="status" data-result-duplicate>
          These two are already recorded against each other, with
          {{ existingResult }}. Recording another counts both pairings, which is
          right for a replay and wrong for a second entry of the same one.
        </p>
      </template>

      <p v-if="saved" class="note note--good" role="status" data-result-saved>{{ saved }}</p>
      <p v-if="error" class="note note--bad" role="alert" data-result-error>{{ error }}</p>

      <!--
        What has been recorded against this exercise, under both tabs.
        Whichever way a result went in, this is where it is checked and put
        right -- and the coach who just typed twenty of them is the one most
        likely to need that.
      -->
      <section class="done" aria-labelledby="recorded-heading">
        <h3 id="recorded-heading" class="done__head">
          Recorded
          <span v-if="recorded.length" class="done__count">{{ recorded.length }}</span>
        </h3>

        <p v-if="!recorded.length" class="done__empty" data-recorded-empty>
          Nothing recorded for this exercise yet.
        </p>

        <ol v-else class="rows" data-recorded>
          <li v-for="row in recorded" :key="row.id" class="row" data-recorded-row>
            <template v-if="editingId === row.id">
              <div class="row__edit">
                <div class="row__outcomes">
                  <button
                    v-for="o in rowOutcomes(row)" :key="o.value"
                    type="button" class="outcome" :class="{ 'is-on': editOutcome === o.value }"
                    :aria-pressed="editOutcome === o.value"
                    :data-edit-outcome="o.value" @click="editOutcome = o.value"
                  >{{ o.label }}</button>
                </div>

                <div class="row__fields">
                  <input
                    v-model="editDate" type="date" class="input"
                    aria-label="Date" data-edit-date />
                  <input
                    v-model="editScore" type="text" class="input"
                    placeholder="Score" aria-label="Score" data-edit-score />
                </div>

                <div class="row__acts">
                  <button
                    type="button" class="btn btn--small" :disabled="busyId === row.id"
                    data-edit-save @click="saveEdit(row)"
                  >Save</button>
                  <button
                    type="button" class="btn btn--small btn--plain"
                    data-edit-cancel @click="cancelEdit"
                  >Cancel</button>
                </div>
              </div>
              <!--
                Which players played is not editable: that identity IS the row.
                Correcting it is a delete and a re-entry, which is also what
                keeps the round-robin sheet honest about what has been played.
              -->
              <p class="row__hint">To change who played, delete this and enter it again.</p>
            </template>

            <template v-else>
              <span class="row__when">{{ row.occurredOn }}</span>
              <span class="row__what" data-recorded-reading>{{ row.reading }}</span>
              <span v-if="row.scoreText" class="row__score">{{ row.scoreText }}</span>

              <span class="row__acts">
                <template v-if="confirmingId === row.id">
                  <button
                    type="button" class="btn btn--small btn--danger" :disabled="busyId === row.id"
                    data-recorded-confirm @click="confirmDelete(row)"
                  >Delete it</button>
                  <button
                    type="button" class="btn btn--small btn--plain"
                    data-recorded-keep @click="confirmingId = null"
                  >Keep</button>
                </template>
                <template v-else>
                  <button
                    type="button" class="btn btn--small btn--plain"
                    data-recorded-edit @click="startEdit(row)"
                  >Edit</button>
                  <button
                    type="button" class="btn btn--small btn--plain"
                    data-recorded-delete @click="askDelete(row)"
                  >Delete</button>
                </template>
              </span>
            </template>
          </li>
        </ol>

        <p v-if="rowError" class="note note--bad" role="alert" data-recorded-error>{{ rowError }}</p>
      </section>
    </div>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">
        {{ mode === 'quick' ? 'Done' : 'Cancel' }}
      </button>
      <button
        v-if="mode === 'quick'"
        type="button" class="btn btn--go" :disabled="saving || !ready"
        data-result-save @click="onSave"
      >{{ saving ? 'Recording…' : `Record ${recordable(lines).length || ''}`.trim() }}</button>
      <button
        v-else
        type="button" class="btn btn--go" :disabled="saving || !pickReady"
        data-result-save @click="onSave"
      >{{ saving ? 'Recording…' : (pickAlreadyPlayed ? 'Record anyway' : 'Record result') }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
/*
 * Capped rather than filling the wide modal. The modal is wide so a typed
 * line and its reading sit side by side; a dropdown stretched to 460px is
 * just a longer distance for the eye to travel to the same three words.
 */
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 34rem;
}

/* A shade tighter than the page's own fields: this is a form to get through,
   not one to dwell on. */
.form :deep(.input) { min-height: 32px; font-size: 13px; }

.modes { display: flex; flex-wrap: wrap; gap: var(--space-1); }

.mode {
  min-height: 30px;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.mode.is-on { border-color: var(--live); color: var(--live); }
.mode:disabled { opacity: 0.4; cursor: not-allowed; }

.date { max-width: 10rem; }

.how {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--surface-deep);
  color: var(--ink-muted);
  font-size: 12px;
  line-height: 1.6;
}

.how strong {
  color: var(--ink);
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-weight: 400;
}

.boxes {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.box { display: grid; grid-template-columns: 5.5rem 1fr; gap: var(--space-2); align-items: center; }

.box__input {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 14px;
  letter-spacing: 0.06em;
  text-align: center;
}

.box__input.is-bad { border-color: var(--color-danger); }

/* Said back in words, so a typed line can be checked without decoding it. */
.box__say { color: var(--ink-soft); font-size: 12px; line-height: 1.4; }
.box__say--bad { color: var(--color-danger); }

.tally { margin: 0; color: var(--ink-soft); font-size: 12px; }

.pair {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--space-2);
  align-items: end;
}

/* The number, then the name it resolves to. */
.who { display: grid; grid-template-columns: 3.5rem 1fr; gap: var(--space-1); }

.who__num {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  text-align: center;
}

.who__num.is-bad { border-color: var(--color-danger); }

.pair__v {
  padding-bottom: var(--space-2);
  color: var(--ink-soft);
  font-size: 13px;
  font-style: italic;
}

.field__label {
  color: var(--ink-muted);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.field__hint { color: var(--ink-soft); letter-spacing: 0; text-transform: none; }

/*
 * `flex-direction` is stated rather than left to the default. This carried
 * `class="field outcomes"` at first, and .field sets `flex-direction: column`
 * -- which turned `flex: 1 1 8rem` into a HEIGHT and stretched every outcome
 * into a 180px slab. The .field class is gone; the explicit direction is here
 * so re-adding it could not do that again.
 */
.outcomes {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  border: 0;
}

.outcome {
  flex: 1 1 7rem;
  min-height: 32px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.3;
  cursor: pointer;
}

.outcome.is-on { border-color: var(--live); color: var(--live); }

/* ── what is already recorded ───────────────────────────────────────────── */

.done { border-top: 1px solid var(--rule); padding-top: var(--space-3); }

.done__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  color: var(--ink-muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.done__count { color: var(--ink-soft); }
.done__empty { margin: 0; color: var(--ink-soft); font-size: 12px; }

.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* A hairline between, not a box around each: this is a list to read down. */
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--rule);
  font-size: 13px;
}

.row:last-child { border-bottom: 0; }

.row__when {
  color: var(--ink-soft);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.row__what { flex: 1; min-width: 12rem; color: var(--ink); }
.row__score { color: var(--ink-muted); font-size: 12px; }
.row__acts { display: flex; gap: var(--space-1); margin-left: auto; }

.row__edit { display: flex; flex-wrap: wrap; gap: var(--space-2); width: 100%; align-items: center; }

/* Its own line. Three outcomes plus a date plus a score do not fit across the
   capped form, and letting them wrap strands one button under the other two. */
.row__outcomes { display: flex; gap: var(--space-1); width: 100%; }
.row__fields { display: flex; gap: var(--space-1); }
.row__fields .input { max-width: 9rem; }

.row__hint { width: 100%; margin: var(--space-1) 0 0; color: var(--ink-soft); font-size: 11px; }

.note--warn { color: var(--color-warning); }

@media (max-width: 520px) {
  .pair { grid-template-columns: 1fr; }
  .pair__v { padding: 0; }
  .box { grid-template-columns: 1fr; gap: var(--space-1); }
}
</style>
