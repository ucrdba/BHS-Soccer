# Numbered positions — design

**Status:** awaiting sign-off
**Date:** 2026-09-14
**Followed by:** `2026-09-14-goals-by-role-design.md`, which reads a player's role from this number.

## Problem

A player's position is free text. `team_players.position` holds whatever a
spreadsheet or a coach typed — in production today "Goalkeeper" ×3, "FB" ×4,
"MF" ×5, "Center Midfield" ×3, "FW" ×1, "Forward / CAM" ×1, and blank for 40 of
the 57 roster entries. The roster's position filter therefore guesses by keyword
(`src/domain/roster-view.ts`), and nothing can reliably tell an attacker from a
defender — which the Goals by role drill needs.

The owner's rule: **a position is the soccer position number 1–11.**

| Number | Role |
| --- | --- |
| 1 | Goalkeeper |
| 2–6 | Defence |
| 7–11 | Attack |

There is no midfield role. A position may be blank — not every rostered player
has one.

## Decisions

Settled with the owner before this was written.

| Question | Decision |
| --- | --- |
| Packaging | **Its own spec, built first.** Goals by role is amended to read the number. |
| Existing text positions | **Convert only the certain ones:** goalkeeper spellings → 1; text that is already a number 1–11 → that number; everything else → blank for the coach to set. A guessed number would put a player in the wrong role without anyone noticing. |
| Where the drill's role comes from | **This number, changeable per session** on the drill's sheet (specified in the Goals by role spec). |

## Storage — `0036_numbered_positions.sql`

`team_players.position` becomes `smallint`, null allowed, `check (position between 1 and 11)`.

Conversion, applied once:

- `lower(trim(position))` in `('goalkeeper', 'gk', 'keeper', 'goal keeper')` → `1`;
- text matching `^\s*([1-9]|1[01])\s*$` → that number;
- everything else, including blank → `null`.

**It must be safe to apply twice**, as applying a migration to production by
hand effectively is: the type change runs only while the column is still text
(checked in `information_schema.columns` inside a `do` block), and the check
constraint is added with `drop constraint if exists` first.

**It must apply to an empty database** (the demo rebuild), with no data
statements naming production rows.

**Before applying**, the runbook has the owner run a read-only query listing
every roster entry whose position would be cleared — team, player name, current
text — so the list is seen before it is lost:

```sql
select t.name as team, p.name as player, tp.position as will_be_cleared
  from public.team_players tp
  join public.teams t on t.id = tp.team_id
  join public.players p on p.id = tp.player_id
 where tp.position is not null
   and lower(trim(tp.position)) not in ('goalkeeper', 'gk', 'keeper', 'goal keeper')
   and tp.position !~ '^\s*([1-9]|1[01])\s*$'
 order by t.name, p.name;
```

The owner keeps that output and sets those positions from the roster after the
deploy.

**Demo data.** `Resouces/SQL/demo/demo_seed.sql` assigns positions from text
arrays (`v_pos`, `j_pos`); they become integer arrays with a realistic spread
(a keeper, defenders 2–6, attackers 7–11) so the demo shows every filter chip
populated.

## One place for the meaning — `src/domain/position.ts`

```ts
export type PositionRole = 'keeper' | 'defend' | 'attack';

export const POSITIONS: number[];                 // 1..11
export function isPosition(value: unknown): value is number;   // integer 1..11
export function roleOfPosition(position: number | null | undefined): PositionRole | null;
export function roleLabel(role: PositionRole): string;          // 'Goalkeeper' | 'Defence' | 'Attack'
export function positionOptionLabel(position: number): string;  // '1 · Goalkeeper', '4 · Defence', '9 · Attack'
export function parsePositionCell(value: unknown): { ok: true; position: number | null } | { ok: false };
```

- `roleOfPosition`: 1 → `keeper`, 2–6 → `defend`, 7–11 → `attack`, anything
  else (including null) → `null`.
- `parsePositionCell` (spreadsheet import): blank/null/undefined → `{ ok: true,
  position: null }`; a number or numeric text 1–11 → that number; anything else
  → `{ ok: false }`.

**No other file hardcodes the ranges.** The roster filter, the labels, the
import and the Goals by role drill all call this module.

## The app

**Types and mapping.** `Player.position` (`src/domain/player-row.ts`) becomes
`number | null`; `toPlayer` maps the column as a number. The roster store's
form field (`src/stores/roster.ts`) becomes `number | null`.

**Writers.** Every write of `position` sends a number or null:
`upsertTeamMembership`, `upsertPlayer`, and the diagnostic test insert in
`src/data/supabase.ts` (which sends `'MID'` today and would be refused).

**Roster edit form** (`PlayerFormModal.vue`) — the text box becomes a select:
a blank option ("—"), then `1 · Goalkeeper`, `2 · Defence` … `6 · Defence`,
`7 · Attack` … `11 · Attack`, built from `POSITIONS` and `positionOptionLabel`.

**Player card** (`PlayerCard.vue`) — shows `Defence (4)`; nothing when blank.

**Bio** (`PlayerDetailModal.vue`) — shows `Position 4 · Defence`. The word
"Position" is what keeps it from being read as the shirt number, which already
shows as `No. 9`.

**Roster filter** (`src/domain/roster-view.ts`) — chips **All**, **Keepers**
(1), **Defence** (2–6), **Attack** (7–11), each with its count, grouped by
`roleOfPosition`. The **Midfield** chip is removed. A player with no position
appears under All only. The module's comment about keyword matching is replaced
with the numbering rule.

**Spreadsheet** (`src/domain/workbook.ts`, `ImportExportModal.vue`, the import
preview):

- Export writes the number (blank when null).
- Import reads the Position column with `parsePositionCell`. A value it refuses
  is listed in the preview — sheet, row, player name, the value — and applying
  is refused while any remain, the same way unmapped team names are handled.

**Help** (`src/content/help.ts`) — the roster entries that describe position
say it is the position number 1–11 and what the ranges mean.

**CLAUDE.md** — a short rule under "The rules that are not guessable from the
code": positions are 1–11 with the three roles, defined only in
`domain/position.ts`; do not match text.

## Out of scope

- The lineup screen's formation slots — pitch spots for a match, stored
  separately.
- Secondary positions.
- Changing the shirt number (`team_players.number`).

## Testing

**Database** (`src/data/testdb/`, real Postgres):

- conversion of each production value: `Goalkeeper` → 1, `FB` → null, `MF` →
  null, `Center Midfield` → null, `FW` → null, `Forward / CAM` → null, `' 7 '`
  → 7, `'11'` → 11, `'12'` → null, blank → null, null → null;
- the check refuses 0 and 12;
- applying twice changes nothing and does not error;
- applies to an empty database via the rebuild steps;
- the demo seed builds with integer positions, and includes at least one of each role.

**App** (Vitest):

- `position.ts`: every number's role and option label; `roleOfPosition` for
  null, 0, 12, 1.5; `parsePositionCell` for blank, `4`, `'4'`, `' 4 '`, `'FB'`,
  `12`, `'1.5'`;
- roster filter: counts per chip, a blank position only in All, no Midfield chip;
- form: the select offers blank plus 1–11 with their labels and saves a number;
- card and bio labels, and nothing shown when blank;
- import preview lists a refused position with its row and blocks apply;
- export writes the number.
