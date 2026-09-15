/**
 * Reading a workbook into a plan, before anything is written.
 *
 * The legacy importer applies as it reads, so a misread column is discovered
 * *after* it has overwritten a season. This produces a description of what
 * would change; the caller shows it and applies on a second, informed press.
 *
 * **A team is never guessed.** A spreadsheet names a team as text — "Varsity",
 * "JV", "Boys Varsity" — and the database holds uuids. A row imported against
 * the wrong team is a player on a squad they never played for, in
 * `team_players`, which is where minutes, ratings and recording numbers live.
 * Names that match nothing are collected for the coach to map.
 *
 * A blank cell becomes `undefined` rather than `''`, so `upsertByKey`'s
 * blank-skip can tell "not supplied" from "supplied empty". That distinction
 * is what stops a sparse sheet wiping columns it never mentioned.
 *
 * Extracted from public/js/admin.js during Phase 6.
 */
import { tableBySheetName, type TableDef } from './workbook';
import { parsePositionCell } from './position';

/** A Position cell that is not 1-11 or blank. Refused rather than guessed. */
export interface BadPosition {
  sheetName: string;
  /** The spreadsheet row: the header is row 1. */
  row: number;
  name: string;
  value: string;
}

export interface PlannedSheet {
  key: string;
  sheetName: string;
  fileName: string;
  rows: Record<string, any>[];
  /** Team names in this sheet that match no known team. */
  unknownTeams: string[];
  /** False for a sheet the importer has no branch for — the Matrix logs. */
  importable: boolean;
  badPositions: BadPosition[];
}

export interface ImportPlan {
  sheets: PlannedSheet[];
  totals: { rows: number; sheets: number };
  /** Sheets that were skipped, and why. */
  warnings: string[];
  /** Every unmapped team name across the workbook, deduplicated. */
  unknownTeams: string[];
  badPositions: BadPosition[];
}

export interface KnownData {
  teams: { id: string; name: string }[];
}

/** Blank becomes undefined. See the module comment. */
export function cell(value: any): string | undefined {
  const s = value === null || value === undefined ? '' : String(value).trim();
  return s === '' ? undefined : s;
}

const normal = (v: any): string =>
  String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** A team by name, case- and space-insensitively. Null rather than a guess. */
export function resolveTeam(name: any, teams: KnownData['teams']): string | null {
  const wanted = normal(name);
  if (!wanted) return null;
  const hit = (teams || []).find(t => normal(t.name) === wanted);
  return hit ? hit.id : null;
}

/**
 * What a workbook would do, sheet by sheet.
 *
 * An unrecognised sheet is warned about rather than ignored: a coach who
 * renamed a tab needs to know that is why nothing happened to it.
 */
export function planImport(
  sheets: Record<string, any[]>, known: KnownData
): ImportPlan {
  const planned: PlannedSheet[] = [];
  const warnings: string[] = [];
  const unknown = new Set<string>();
  const badAll: BadPosition[] = [];

  Object.keys(sheets || {}).forEach(sheetName => {
    const def: TableDef | null = tableBySheetName(sheetName);
    const raw = sheets[sheetName] || [];

    if (!def) {
      warnings.push(
        `"${sheetName}" does not match any table, so it was skipped. `
        + 'Sheet names have to match the export exactly.');
      return;
    }

    // Cells normalised once here, so every consumer sees the same shape.
    const rows = raw.map(row => {
      const out: Record<string, any> = {};
      Object.keys(row || {}).forEach(k => { out[k] = cell(row[k]); });
      return out;
    });

    // A sheet that cannot be written names no teams worth resolving.
    const teamNames = new Set<string>();
    rows.forEach(r => { if (r.Team) teamNames.add(String(r.Team)); });

    const unknownHere: string[] = [];
    teamNames.forEach(name => {
      if (!def.importable) return;
      if (!resolveTeam(name, known?.teams || [])) {
        unknownHere.push(name);
        unknown.add(name);
      }
    });

    // Said out loud rather than skipped in silence: the Matrix sheet is
    // exported and has no import branch, so an admin restoring a backup gets
    // everything back except their Matrix history.
    if (!def.importable) {
      warnings.push(
        `"${sheetName}" is exported but cannot be imported, so it will be left `
        + 'alone. Matrix results are recorded through Player Ratings.');
    }

    // A position the importer would have to guess at is refused rather than
    // guessed: "FB" could be 2 or 3, and a wrong guess puts a player in the
    // wrong role without anyone noticing.
    const badHere: BadPosition[] = [];
    if (def.key === 'players' && def.importable) {
      rows.forEach((r, i) => {
        if (!parsePositionCell(r.Position).ok) {
          badHere.push({
            sheetName: def.sheetName,
            row: i + 2,
            // The same two shapes writeRow reads: parts, or one Name column.
            name: [r.FirstName, r.LastName].filter(Boolean).join(' ').trim() || String(r.Name ?? '').trim(),
            value: String(r.Position)
          });
        }
      });
      badAll.push(...badHere);
    }

    planned.push({
      key: def.key,
      sheetName: def.sheetName,
      fileName: def.fileName,
      rows,
      unknownTeams: unknownHere,
      importable: def.importable,
      badPositions: badHere
    });
  });

  return {
    sheets: planned,
    // Per sheet, because "1,400 rows" says nothing about which table is about
    // to change.
    totals: {
      rows: planned.reduce((n, s) => n + s.rows.length, 0),
      sheets: planned.length
    },
    warnings,
    unknownTeams: Array.from(unknown).sort(),
    badPositions: badAll
  };
}

/**
 * Whether a plan may be applied: every named team has somewhere to go, and no
 * position is one the importer would have to guess at.
 */
export function readyToApply(
  plan: ImportPlan, mapping: Record<string, string>
): boolean {
  return (plan?.unknownTeams || []).every(name => !!mapping?.[name])
    && (plan?.badPositions || []).length === 0;
}
