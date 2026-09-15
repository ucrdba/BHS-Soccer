<script setup lang="ts">
/**
 * The workbook round trip.
 *
 * **Exporting invents nothing.** The eleven tables come from
 * `domain/workbook.ts`, and an empty table exports an empty sheet with its
 * headers — which is what tells a coach the table is empty. The legacy export
 * shipped a hardcoded sample quiz question, a fabricated match result and two
 * made-up user profiles, which a re-import would have written in as real.
 *
 * **Importing previews before it writes.** The legacy importer applies as it
 * reads, so a misread column is found *after* it has overwritten a season.
 * Choosing a file here describes what would change; a second, informed press
 * applies it.
 *
 * **And it never guesses a team.** A spreadsheet names a team as text and the
 * database holds uuids; a row written against the wrong team is a player on a
 * squad they never played for. Unmapped names block the apply outright.
 *
 * `XLSX` and `JSZip` are the CDN globals the legacy app already loads. How
 * they load is Phase 7's business, not this component's.
 */
import { ref, computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import {
  tableDefs, sheetFor, templateFor, type ExportData
} from '../../domain/workbook';
import { planImport, readyToApply, resolveTeam, type ImportPlan } from '../../domain/import-plan';
import { parsePositionCell } from '../../domain/position';

const props = defineProps<{
  open: boolean;
  teamId: string | null;
  schoolId: string | null;
  teams: any[];
  /** Everything the sheets read; the caller has it loaded already. */
  data: ExportData;
}>();

const emit = defineEmits<{ close: []; imported: [] }>();

const plan = ref<ImportPlan | null>(null);
const mapping = ref<Record<string, string>>({});
const busy = ref(false);
const notice = ref<string | null>(null);
const error = ref<string | null>(null);
const result = ref<{ written: number; rejected: number } | null>(null);

const defs = tableDefs();

const canApply = computed(() =>
  !!plan.value && readyToApply(plan.value, mapping.value) && !busy.value);

function libraries(needsZip = false): { ok: boolean; error?: string } {
  if (typeof (window as any).XLSX === 'undefined') {
    // The CDN may not have answered yet. Said, not thrown.
    return { ok: false, error: 'The spreadsheet library has not loaded yet. Wait a moment and try again.' };
  }
  if (needsZip && typeof (window as any).JSZip === 'undefined') {
    return { ok: false, error: 'The zip library has not loaded yet. Wait a moment and try again.' };
  }
  return { ok: true };
}

function saveWorkbook(sheets: { name: string; rows: any[] }[], fileName: string): void {
  const XLSX = (window as any).XLSX;
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name);
  });
  XLSX.writeFile(wb, fileName);
}

function onExportAll(): void {
  const lib = libraries();
  if (!lib.ok) { error.value = lib.error!; return; }

  error.value = null;
  saveWorkbook(
    defs.map(d => ({ name: d.sheetName, rows: sheetFor(d, props.data) })),
    'Soccer_Database_Export.xlsx');
  notice.value = 'Exported every table.';
}

/**
 * One file per table, zipped -- the shape the reference exports are already
 * saved in, so a coach can restore a single table without unpicking a
 * combined workbook. Built from the same `defs` as the other two modes.
 */
async function onExportZip(): Promise<void> {
  const lib = libraries(true);
  if (!lib.ok) { error.value = lib.error!; return; }

  error.value = null;
  busy.value = true;
  try {
    const XLSX = (window as any).XLSX;
    const zip = new ((window as any).JSZip)();

    defs.forEach(d => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb, XLSX.utils.json_to_sheet(sheetFor(d, props.data)), d.sheetName);
      zip.file(d.fileName, XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
    });

    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'Soccer_Database_Export.zip');
    notice.value = 'Exported every table as separate files.';
  } catch {
    error.value = 'The zip could not be built.';
  } finally {
    busy.value = false;
  }
}

function downloadBlob(blob: any, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function onExportOne(key: string): void {
  const lib = libraries();
  if (!lib.ok) { error.value = lib.error!; return; }

  const def = defs.find(d => d.key === key);
  if (!def) return;

  error.value = null;
  saveWorkbook([{ name: def.sheetName, rows: sheetFor(def, props.data) }], def.fileName);
  notice.value = `Exported ${def.sheetName}.`;
}

function onTemplate(key: string): void {
  const lib = libraries();
  if (!lib.ok) { error.value = lib.error!; return; }

  const def = defs.find(d => d.key === key);
  if (!def) return;

  error.value = null;
  saveWorkbook([{ name: def.sheetName, rows: templateFor(def) }], `TEMPLATE_${def.fileName}`);
  notice.value = `Template for ${def.sheetName} downloaded.`;
}

/** Read the file and describe it. Writes nothing. */
async function onFile(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  error.value = null;
  notice.value = null;
  result.value = null;
  plan.value = null;
  mapping.value = {};

  const lib = libraries();
  if (!lib.ok) { error.value = lib.error!; return; }

  busy.value = true;
  try {
    const buffer = await file.arrayBuffer();
    const XLSX = (window as any).XLSX;
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });

    const sheets: Record<string, any[]> = {};
    wb.SheetNames.forEach((name: string) => {
      sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
    });

    plan.value = planImport(sheets, { teams: props.teams || [] });
  } catch {
    error.value = 'That file could not be read as a workbook.';
  } finally {
    busy.value = false;
  }
}

/** Which team a row belongs to: resolved, or the coach's mapping. */
function teamFor(row: any): string | null {
  const named = row?.Team;
  if (!named) return props.teamId;
  return resolveTeam(named, props.teams || []) || mapping.value[String(named)] || null;
}

function schoolOf(teamId: string | null): string | null {
  const team = (props.teams || []).find((t: any) => t.id === teamId);
  return team?.school_id || props.schoolId || null;
}

/**
 * Write one sheet.
 *
 * Every writer returns whether the row landed, because the client logs and
 * returns rather than throwing — a bare loop cannot tell a stored row from a
 * refused one, and would report a clean import for rows that never arrived.
 */
async function writeRow(key: string, row: any): Promise<boolean> {
  const teamId = teamFor(row);
  const schoolId = schoolOf(teamId);

  if (key === 'players') {
    if (!teamId || !schoolId) return false;
    // A single Name column is the other shape the handbook documents. Handed
    // over without parts, `upsertPlayerIdentity` splits it with
    // `splitPlayerName`, which reads "Last, First" as well as "First Last".
    const name = [row.FirstName, row.LastName].filter(Boolean).join(' ').trim()
      || String(row.Name || '').trim();
    if (!name) return false;

    const identity = await supabaseService.upsertPlayerIdentity({
      name, first_name: row.FirstName, last_name: row.LastName,
      class_year: row.Class, height: row.Height, photo_url: row.Photo
    });
    if (!identity?.id) return false;

    // readyToApply refuses a plan with a bad position, so a defined cell here
    // is 1-11. An absent column or a blank cell arrives as row.Position ===
    // undefined (cell()'s convention), and must stay undefined rather than
    // become null: upsertTeamMembership skips an undefined field but writes a
    // null one, and a sparse sheet must not wipe a position nobody mentioned.
    const positionCell = parsePositionCell(row.Position);
    const res = await supabaseService.upsertTeamMembership(teamId, schoolId, {
      player_id: identity.id,
      number: row.Number, recording_number: row.RecordingNumber,
      position: row.Position === undefined ? undefined : (positionCell.ok ? positionCell.position : null)
    });
    return !!res?.ok;
  }

  if (key === 'schedule') {
    if (!teamId) return false;
    const res = await supabaseService.upsertMatch(teamId, {
      date: row.Date, time: row.Time, opponent: row.Opponent,
      location: row.Location, venueAddress: row.Address,
      isHome: String(row.Home || '').toLowerCase() === 'home',
      status: row.Status, score: row.Score
    });
    return !!res;
  }

  if (key === 'drills') {
    if (!schoolId) return false;
    return !!(await supabaseService.upsertDrillBankItem(schoolId, {
      name: row.Name, category: row.Category, coachNotes: row.CoachNotes
    }));
  }

  if (key === 'coaches') {
    if (!schoolId) return false;
    return !!(await supabaseService.upsertCoach(schoolId, {
      name: row.Name, level: row.Level, phone: row.Phone, email: row.Email,
      address: row.Address, bio: row.Bio, photo: row.Photo
    }));
  }

  if (key === 'thoughts') {
    if (!teamId) return false;
    const res = await supabaseService.upsertDailyThought(teamId, {
      coachName: row.CoachName, title: row.Title, text: row.ThoughtsText,
      isActive: String(row.IsActive || '').toUpperCase() === 'YES'
    });
    return !res?.error;
  }

  if (key === 'quiz') {
    const res = await supabaseService.upsertQuizQuestion({
      school_id: schoolId,
      question: row.QuestionText,
      option_a: row.OptionA, option_b: row.OptionB,
      option_c: row.OptionC, option_d: row.OptionD,
      correct_option: row.CorrectAnswer, explanation: row.Explanation
    });
    return !!res?.ok;
  }

  if (key === 'categories') {
    // Categories belong to an organization since 0027, so an imported one
    // lands in the importer's own list rather than everybody's.
    const res = await supabaseService.upsertSoccerCategory(props.schoolId!, {
      name: row.Name, description: row.Description
    });
    return !!res?.ok;
  }

  // schools, profiles and plan are written whole rather than row by row, and
  // matrix is export-only. Left for the caller to handle deliberately.
  return false;
}

async function onApply(): Promise<void> {
  if (!plan.value || !canApply.value) return;

  busy.value = true;
  error.value = null;
  let written = 0;
  let rejected = 0;

  try {
    for (const sheet of plan.value.sheets) {
      if (!sheet.importable) continue;
      for (const row of sheet.rows) {
        if (await writeRow(sheet.key, row)) written += 1;
        else rejected += 1;
      }
    }

    result.value = { written, rejected };
    notice.value = rejected === 0
      ? `Imported ${written} rows.`
      : `Imported ${written} rows. ${rejected} were refused and are unchanged.`;

    // Consumed, so a second press cannot write it all again.
    plan.value = null;
    mapping.value = {};
    emit('imported');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" title="Import and export" wide @close="emit('close')">
    <section class="block">
      <h3 class="block__h kicker">Export</h3>
      <p class="hint">
        A backup contains exactly what is in the database. A table with nothing
        in it exports as an empty sheet — that is how you can tell.
      </p>

      <button type="button" class="btn btn--go" data-export-all @click="onExportAll">
        Export everything
      </button>
      <button type="button" class="btn" data-export-zip @click="onExportZip">
        Every table as separate files (.zip)
      </button>

      <div class="tables">
        <div v-for="d in defs" :key="d.key" class="table hrow" data-export-row>
          <span class="table__name">{{ d.sheetName }}</span>
          <span v-if="!d.importable" class="tag" data-export-only>export only</span>
          <button type="button" class="mini" :data-export-one="d.key" @click="onExportOne(d.key)">
            Export
          </button>
          <button type="button" class="mini" :data-template="d.key" @click="onTemplate(d.key)">
            Template
          </button>
        </div>
      </div>
    </section>

    <section class="block">
      <h3 class="block__h kicker">Import</h3>
      <p class="hint">
        Choosing a file shows what it would change. Nothing is written until
        you press Apply.
      </p>

      <input type="file" accept=".xlsx,.xls,.csv" data-import-file @change="onFile" />

      <template v-if="plan">
        <h4 class="sub kicker" data-preview>What this would do</h4>

        <div v-for="s in plan.sheets" :key="s.sheetName" class="row hrow" data-preview-sheet>
          <span class="row__name">{{ s.sheetName }}</span>
          <span class="row__n" :data-preview-rows="s.key">{{ s.rows.length }} rows</span>
          <span v-if="!s.importable" class="tag" data-preview-skipped>not imported</span>
        </div>

        <p v-for="(w, i) in plan.warnings" :key="i" class="hint hint--warn" data-preview-warning>
          {{ w }}
        </p>

        <template v-if="plan.unknownTeams.length">
          <h4 class="sub kicker">Teams this file names that do not exist here</h4>
          <p class="hint hint--warn" data-preview-unknown>
            Nothing is imported until each of these has a squad to go to — a row
            written against the wrong team is a player on a squad they never
            played for.
          </p>

          <div v-for="name in plan.unknownTeams" :key="name" class="row hrow" data-unknown-team>
            <span class="row__name">{{ name }}</span>
            <select v-model="mapping[name]" class="input" :data-map-team="name">
              <option value="">— pick a squad —</option>
              <option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
        </template>

        <template v-if="plan.badPositions.length">
          <h4 class="sub kicker">Positions this file gives that are not 1–11</h4>
          <p class="hint hint--warn" data-preview-bad-positions>
            A position is the number 1–11 (1 goalkeeper, 2–6 defence, 7–11 attack),
            or blank. Nothing is imported until these are fixed in the file.
          </p>
          <div v-for="b in plan.badPositions" :key="`${b.sheetName}-${b.row}`" class="row hrow" data-bad-position>
            <span class="row__name">Row {{ b.row }} · {{ b.name || 'No name' }}</span>
            <span class="tag">{{ b.value }}</span>
          </div>
        </template>

        <button
          type="button" class="btn btn--go" :disabled="!canApply"
          data-import-apply @click="onApply"
        >{{ busy ? 'Importing…' : `Apply — ${plan.totals.rows} rows` }}</button>
      </template>

      <p v-if="result" class="hint" data-import-result>
        {{ result.written }} written, {{ result.rejected }} refused.
      </p>
    </section>

    <p v-if="notice" class="hint hint--good" role="status" data-ie-notice>{{ notice }}</p>
    <p v-if="error" class="hint hint--bad" role="alert" data-ie-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.block { padding-bottom: var(--space-3); margin-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.block:last-of-type { border-bottom: 0; }

.block__h { margin: 0 0 var(--space-1); }

.sub { margin: var(--space-3) 0 var(--space-1); }

.hint { margin: 0 0 var(--space-2); max-width: 42rem; color: var(--ink-muted); font-size: 13px; line-height: 1.5; }
.hint--warn { color: var(--color-warning); }
.hint--bad { color: var(--color-danger); }
.hint--good { color: var(--live); }

.tables { margin-top: var(--space-3); }

.table, .row { align-items: center; }

.table__name, .row__name { flex: 1; color: var(--ink); }
.row__n { color: var(--ink-muted); font-size: 12px; }

.mini {
  padding: 0.2rem 0.45rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
</style>
