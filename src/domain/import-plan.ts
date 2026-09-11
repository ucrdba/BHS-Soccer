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
 * **The Schools row is planned field by field**, by `planSchoolRow`, because
 * it is the organization's own profile rather than one row among many: the
 * preview says exactly what it would change, and refuses the row outright
 * rather than write something wrong into every heading on the site.
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
import { safeImageUrl } from './theme';
import { parseColour } from './colour';

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
  /** The Schools sheet only: each row's plan, in the same order as `rows`. */
  schoolRows?: SchoolRowPlan[];
}

export interface FieldChange {
  /** The sheet's header, which is what the coach is looking at. */
  field: string;
  from: string;
  to: string;
}

export interface SchoolRowPlan {
  /** What to write against: the loaded organization's code, which `upsertSchool` keys on. */
  code: string | null;
  /** What `upsertSchool` is handed, or null when the row is refused. */
  school: Record<string, any> | null;
  /** Why nothing will be written, or null. */
  refused: string | null;
  /** Every field that would change, in header order. */
  changes: FieldChange[];
  /** What the preview says about a field the row leaves alone. */
  notes: string[];
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
  /**
   * The active organization's row exactly as `fetchSchool` loaded it. That
   * is `select *`, so a column this database has is a key on it and one it
   * lacks is not -- which is how `planSchoolRow` knows what it may name.
   */
  school?: any;
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

/** The two image columns, and the migration that adds each. */
const IMAGE_COLUMNS = [
  { header: 'LogoUrl', column: 'logo_url', key: 'logoUrl', noun: 'logo', migration: '0028' },
  { header: 'HeroUrl', column: 'hero_url', key: 'heroUrl', noun: 'photo', migration: '0030' }
] as const;

const COUNTS = [['Wins', 'wins'], ['Losses', 'losses'], ['Draws', 'draws']] as const;

const text = (v: any): string => (v === null || v === undefined ? '' : String(v));

/**
 * One Schools row, as the write `upsertSchool` would make and what it changes.
 *
 * A blank cell keeps what the organization has, as everywhere in the import.
 * `upsertSchool` writes the name, mascot, city, colours and record whether or
 * not they are supplied, so each is merged over the loaded row here rather
 * than left to its defaults -- which are Beaumont's.
 *
 * Refused outright, with the reason, rather than written in part:
 * - **another organization's code**, or none. A backup restores the
 *   organization it was taken from, and `upsertSchool` would create or
 *   overwrite whichever one the cell names.
 * - **a name, mascot or city blank on both sides**, since `upsertSchool`
 *   fills each with Beaumont's.
 * - **a colour or a count it cannot read.**
 * - **an image address the public page would not show.** Both are rendered
 *   into an <img> on the public home page, and `safeImageUrl` would drop the
 *   value on read; stored anyway, the admin would see it in the profile form
 *   and visitors would see nothing.
 *
 * The image addresses are named only when the loaded row has the column.
 * Until 0028 (logo) or 0030 (photo) is applied, naming it makes PostgREST
 * refuse the whole save with 42703 -- the same rule the profile form keeps.
 */
export function planSchoolRow(row: Record<string, any>, current: any): SchoolRowPlan {
  const refuse = (reason: string): SchoolRowPlan =>
    ({ code: null, school: null, refused: reason, changes: [], notes: [] });

  if (!current || !current.code) {
    return refuse('This organization has not loaded, so there is nothing to compare the row with.');
  }
  const code = String(current.code);

  if (!row.Code) {
    return refuse(`The row names no organization. A backup restores only the one it came from, so its Code must read "${code}".`);
  }
  if (normal(row.Code) !== normal(code)) {
    return refuse(`The row is for organization "${row.Code}", not this one ("${code}"). A backup restores only the organization it was taken from.`);
  }

  const name = row.Name ?? text(current.name);
  const mascot = row.Mascot ?? text(current.mascot);
  const city = row.City ?? text(current.city);
  const league = row.League ?? text(current.league);

  for (const [label, value] of [['name', name], ['mascot', mascot], ['city', city]]) {
    if (!value.trim()) {
      return refuse(`A ${label} is needed: the row leaves it blank and so does the organization, and saving a blank ${label} would fill in another organization's.`);
    }
  }

  const colors: Record<string, any> = { ...(current.colors && typeof current.colors === 'object' ? current.colors : {}) };
  for (const [header, key, label] of [['PrimaryColor', 'primary', 'Primary'], ['SecondaryColor', 'secondary', 'Secondary']]) {
    const value = row[header];
    if (value === undefined) continue;
    if (!parseColour(value)) {
      return refuse(`${label} colour "${value}" is not a colour this app can read.`);
    }
    colors[key] = value;
  }

  const was = current.record && typeof current.record === 'object' ? current.record : {};
  const before: Record<string, number> = {};
  const record: Record<string, number> = {};
  for (const [header, key] of COUNTS) {
    const n = Number(was[key]);
    before[key] = Number.isInteger(n) && n >= 0 ? n : 0;
    const value = row[header];
    if (value === undefined) { record[key] = before[key]; continue; }
    if (!/^\d+$/.test(value)) return refuse(`${header} "${value}" is not a whole number.`);
    record[key] = Number(value);
  }

  const images: Record<string, string> = {};
  const notes: string[] = [];
  for (const img of IMAGE_COLUMNS) {
    const value = row[img.header];
    const hasColumn = img.column in current;
    if (value === undefined) {
      // Blank keeps, as elsewhere -- said, since this is the one blank that
      // looks as though it ought to clear something.
      if (hasColumn && text(current[img.column])) {
        notes.push(`The file leaves the ${img.noun} address blank, so the current one is kept. Clear it in Organization profile instead.`);
      }
      continue;
    }
    if (!hasColumn) {
      notes.push(`The ${img.noun} address is not imported: this database has no column for it until migration ${img.migration} is applied.`);
      continue;
    }
    if (!safeImageUrl(value)) {
      return refuse(`The ${img.noun} address "${value}" is not one the public page will show. It must start with https://, http:// or / (a file shipped with the app).`);
    }
    images[img.key] = value;
  }

  const changes: FieldChange[] = [];
  const diff = (field: string, from: any, to: any): void => {
    if (text(from) !== text(to)) changes.push({ field, from: text(from), to: text(to) });
  };
  diff('Name', current.name, name);
  diff('Mascot', current.mascot, mascot);
  diff('City', current.city, city);
  diff('League', current.league, league);
  diff('PrimaryColor', current.colors?.primary, colors.primary);
  diff('SecondaryColor', current.colors?.secondary, colors.secondary);
  for (const img of IMAGE_COLUMNS) {
    if (img.key in images) diff(img.header, current[img.column], images[img.key]);
  }
  for (const [header, key] of COUNTS) diff(header, before[key], record[key]);

  return {
    code,
    school: { name, mascot, city, league, ...images, colors, record },
    refused: null,
    changes,
    notes
  };
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
      badPositions: badHere,
      ...(def.key === 'schools'
        ? { schoolRows: rows.map(r => planSchoolRow(r, known?.school)) }
        : {})
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
