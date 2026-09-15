# Numbered Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player's position becomes the soccer position number 1–11 (1 goalkeeper, 2–6 defence, 7–11 attack) everywhere it is stored, edited, shown, filtered, exported and imported.

**Architecture:** Migration `0036` converts `team_players.position` from free text to a `smallint` checked 1–11, keeping only the conversions that are certain. One framework-free module, `src/domain/position.ts`, owns the numbers, the roles and every label; the roster screens, filter and spreadsheet read it rather than repeating the ranges.

**Tech Stack:** Postgres (Supabase), Vue 3 `<script setup>`, Pinia, Vitest + @vue/test-utils, `pg` database tests.

**Spec:** `docs/superpowers/specs/2026-09-14-numbered-positions-design.md`

## Global Constraints

- A position is an integer 1–11 or null: **1 = Goalkeeper, 2–6 = Defence, 7–11 = Attack.** There is no midfield role.
- The ranges and labels live only in `src/domain/position.ts`. No other file compares a position to 1, 6 or 7, and nothing matches position text.
- Conversion keeps only certain values: `goalkeeper`, `gk`, `keeper`, `goal keeper` (case-insensitive, trimmed) → 1; text that is already `1`–`11` → that number; everything else → null.
- `0036` must apply to an empty database (the demo rebuild) and must be safe to apply twice.
- Never push, and never write to the production database (`arsigevpgpbqluqbnhjr`). SQL migrations are applied by hand by the owner.
- Never stage `assets/*.jpg`; never `git add -A` or `git add .` — name every file.
- Never hardcode `'bhs'`, `Beaumont` or `Cougars`.
- User-facing messages go in the app's UI, not the console.
- Component styles are scoped and use the ground tokens, never a literal colour (`src/design-tokens.test.ts` enforces it).
- A setup store must not return plain helper functions.
- `typescript` stays on 5.x; `tsconfig.json` stays loose.
- Gates by exit code before each commit: `npm test > /dev/null 2>&1; echo "TEST=$?"`, `npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"`, `npm run build > /dev/null 2>&1; echo "BUILD=$?"` — all `0`. About 10 tests skip (a local Supabase-stack suite); database suites under `src/data/testdb/` must not skip.
- Commit messages follow Conventional Commits and end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0036_numbered_positions.sql` | Create — the type change, conversion and range check |
| `src/data/testdb/migration-0036-numbered-positions.test.ts` | Create — conversion, range, twice |
| `Resouces/SQL/demo/demo_seed.sql`, `src/data/testdb/demo-seed.test.ts` | Demo positions as numbers |
| `src/domain/position.ts`, `src/domain/position.test.ts` | Create — numbers, roles, labels, spreadsheet cell parsing |
| `src/domain/player-row.ts` (+ test), `src/stores/roster.ts` (+ test) | `Player.position: number \| null` |
| `src/domain/roster-view.ts` (+ test), `src/views/RosterView.test.ts` | Keepers / Defence / Attack chips |
| `src/components/roster/PlayerFormModal.vue` (+ new test) | The 1–11 picker |
| `src/components/roster/PlayerCard.vue` (+ new test), `src/components/roster/PlayerDetailModal.vue` (+ test) | Labels |
| `src/domain/workbook.ts` (+ test), `src/domain/import-plan.ts` (+ test), `src/components/admin/ImportExportModal.vue` (+ test) | Export the number; refuse a bad position in the import preview |
| `src/content/help.ts`, `CLAUDE.md`, `docs/runbooks/2026-09-14-accounts-setup-runbook.md` | Docs |

**Out of the map on purpose:** `upsertPlayer` and the diagnostic insert in `src/data/supabase.ts` write `position` to the `players` table, which has had no `position` column since `0005` — they are unaffected by this change and left alone.

---

### Task 1: The migration, and the demo's positions

**Files:**
- Create: `supabase/migrations/0036_numbered_positions.sql`
- Create: `src/data/testdb/migration-0036-numbered-positions.test.ts`
- Modify: `Resouces/SQL/demo/demo_seed.sql:509-519` (the `v_pos` and `j_pos` arrays)
- Modify: `src/data/testdb/demo-seed.test.ts` (one added test)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `team_players.position smallint`, null or 1–11, constraint `team_players_position_range`.

- [ ] **Step 1: Write the failing migration test**

Create `src/data/testdb/migration-0036-numbered-positions.test.ts`:

```ts
/**
 * 0036 — a position is the soccer position number 1-11.
 *
 * The column was free text ("FB", "MF", "Center Midfield", "Goalkeeper"), so
 * nothing could tell an attacker from a defender. Only the certain conversions
 * are kept: a guessed number would put a player in the wrong role for the
 * Goals by role drill without anyone noticing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0036_numbered_positions.sql'), 'utf8');

/** The migration without its own transaction control: withDb has opened one. */
const apply = (c: any) => c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));

/** One organization and team, and a roster entry per text position. */
async function rosterWith(c: any, positions: (string | null)[]) {
  const school = (await c.query(
    `insert into public.schools (code, name, mascot) values ('alpha', 'Alpha', 'A') returning id`)).rows[0].id;
  const team = (await c.query(
    `insert into public.teams (school_id, name) values ($1, 'Varsity') returning id`, [school])).rows[0].id;
  const ids: string[] = [];
  for (const [i, position] of positions.entries()) {
    const player = (await c.query(
      `insert into public.players (name, class_year) values ($1, '2027') returning id`, [`Player ${i}`])).rows[0].id;
    const row = (await c.query(
      `insert into public.team_players (team_id, school_id, player_id, position) values ($1, $2, $3, $4) returning id`,
      [team, school, player, position])).rows[0].id;
    ids.push(row);
  }
  return { school, team, ids };
}

const positionOf = async (c: any, id: string) =>
  (await c.query(`select position from public.team_players where id = $1`, [id])).rows[0].position;

describe.skipIf(!available)('0036: a position is a number 1-11', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('converts only what is certain', async () => {
    await withDb(async (c) => {
      const cases: [string | null, number | null][] = [
        ['Goalkeeper', 1], [' gk ', 1], ['Keeper', 1], ['Goal Keeper', 1],
        ['FB', null], ['MF', null], ['Center Midfield', null], ['FW', null], ['Forward / CAM', null],
        [' 7 ', 7], ['11', 11], ['1', 1], ['12', null], ['0', null], ['', null], [null, null]
      ];
      const { ids } = await rosterWith(c, cases.map(([text]) => text));
      await apply(c);
      for (const [i, [text, expected]] of cases.entries()) {
        expect(await positionOf(c, ids[i]), `from ${JSON.stringify(text)}`).toBe(expected);
      }
    });
  }, 60_000);

  it('stores a number from then on', async () => {
    await withDb(async (c) => {
      await apply(c);
      const { rows } = await c.query(`
        select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'team_players' and column_name = 'position'`);
      expect(rows).toEqual([{ data_type: 'smallint' }]);
    });
  }, 60_000);

  it('refuses a number outside 1-11', async () => {
    await withDb(async (c) => {
      const { ids } = await rosterWith(c, [null]);
      await apply(c);
      await c.query('savepoint try_zero');
      await expect(c.query(`update public.team_players set position = 0 where id = $1`, [ids[0]]))
        .rejects.toThrow(/team_players_position_range/);
      await c.query('rollback to savepoint try_zero');
      await expect(c.query(`update public.team_players set position = 12 where id = $1`, [ids[0]]))
        .rejects.toThrow(/team_players_position_range/);
    });
  }, 60_000);

  it('can be applied a second time without changing anything', async () => {
    await withDb(async (c) => {
      const { ids } = await rosterWith(c, ['Goalkeeper', 'FB', '9']);
      await apply(c);
      await apply(c);
      expect([await positionOf(c, ids[0]), await positionOf(c, ids[1]), await positionOf(c, ids[2])])
        .toEqual([1, null, 9]);
    });
  }, 60_000);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/data/testdb/migration-0036-numbered-positions.test.ts`
Expected: FAIL — `ENOENT … 0036_numbered_positions.sql`. If the suite reports **skipped**, Postgres is not reachable: fix that before continuing.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0036_numbered_positions.sql`:

```sql
-- 0036: a player's position is the soccer position number 1-11
--
-- Spec: docs/superpowers/specs/2026-09-14-numbered-positions-design.md
--
--   1      goalkeeper
--   2-6    defence
--   7-11   attack
--
-- team_players.position was free text -- "FB", "MF", "Center Midfield",
-- "Forward / CAM", "Goalkeeper" -- so nothing could tell an attacker from a
-- defender. Only CERTAIN conversions are kept: the goalkeeper spellings become
-- 1, text that is already 1-11 keeps its number, and everything else is
-- cleared for the coach to set. FB could be 2 or 3 and MF could be 6 or 8; a
-- guessed number would quietly put a player in the wrong role.
--
-- BEFORE APPLYING, run the read-only query in
-- docs/runbooks/2026-09-14-accounts-setup-runbook.md ("Numbered positions")
-- and keep its output: it lists every position this clears.
--
-- Safe to apply twice: the type change runs only while the column is not yet
-- smallint.

begin;

set role postgres;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'team_players'
       and column_name = 'position' and data_type <> 'smallint'
  ) then
    alter table public.team_players
      alter column position type smallint using (
        case
          when lower(trim(position::text)) in ('goalkeeper', 'gk', 'keeper', 'goal keeper') then 1
          when position::text ~ '^\s*([1-9]|1[01])\s*$' then trim(position::text)::smallint
          else null
        end
      );
  end if;
end $$;

alter table public.team_players drop constraint if exists team_players_position_range;
alter table public.team_players add constraint team_players_position_range
  check (position is null or position between 1 and 11);

comment on column public.team_players.position is
  'Soccer position number: 1 goalkeeper, 2-6 defence, 7-11 attack. Null when not set. Meaning lives in src/domain/position.ts.';

commit;
```

- [ ] **Step 4: Run the migration test**

Run: `npx vitest run src/data/testdb/migration-0036-numbered-positions.test.ts`
Expected: PASS, 4 tests. If `alter column … type` fails because a view depends on the column, read the error's view name and report it rather than dropping the view.

- [ ] **Step 5: Give the demo squads numbers, test-first**

Append inside the top-level `describe` in `src/data/testdb/demo-seed.test.ts`:

```ts
  it('gives each demo squad a keeper, defenders and attackers by number', async () => {
    await withDb(async (c) => {
      await build(c);
      await c.query(`select demo_seed_template('2026-09-11'::date)`);
      const { rows } = await c.query(`
        select t.name,
               count(*) filter (where tp.position = 1)::int              as keepers,
               count(*) filter (where tp.position between 2 and 6)::int  as defence,
               count(*) filter (where tp.position between 7 and 11)::int as attack,
               count(*) filter (where tp.position is null)::int          as unset
          from public.team_players tp join public.teams t on t.id = tp.team_id
         group by t.name order by t.name`);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.keepers, r.name).toBeGreaterThan(0);
        expect(r.defence, r.name).toBeGreaterThan(0);
        expect(r.attack, r.name).toBeGreaterThan(0);
        expect(r.unset, r.name).toBe(0);
      }
    });
  }, 60_000);
```

Run: `npx vitest run src/data/testdb/demo-seed.test.ts`
Expected: the new test FAILS — `invalid input syntax for type smallint: "GK"`.

In `Resouces/SQL/demo/demo_seed.sql`, replace the two position arrays (lines 509–510 and 517–518):

```sql
  v_pos   int[]  := array[1, 1, 2, 3, 4, 5, 6, 5, 6, 8,
                          8, 10, 6, 8, 10, 9, 11, 7, 9, 11];
```

```sql
  j_pos   int[]  := array[1, 1, 2, 3, 4, 5, 6, 3, 6,
                          8, 10, 6, 8, 10, 9, 11, 7, 9];
```

(Same lengths as before — 20 and 18 — so every index the loops read still exists.)

Run: `npx vitest run src/data/testdb/demo-seed.test.ts src/data/testdb/demo-accounts.test.ts src/data/testdb/demo-schema-steps.test.ts src/data/testdb/demo-rebuild.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: all `0`. The app still treats position as text until Task 3, and PostgREST returns the new numbers as numbers — `toPlayer` passes whatever it gets, so nothing breaks in between.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0036_numbered_positions.sql src/data/testdb/migration-0036-numbered-positions.test.ts Resouces/SQL/demo/demo_seed.sql src/data/testdb/demo-seed.test.ts
git commit -m "feat: a player's position is a number 1-11, converting only what is certain

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: One place for what a position means

**Files:**
- Create: `src/domain/position.ts`
- Create: `src/domain/position.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `src/domain/position.ts`):
  - `type PositionRole = 'keeper' | 'defend' | 'attack'`
  - `const POSITIONS: readonly number[]` — `[1, 2, …, 11]`
  - `isPosition(value: unknown): value is number`
  - `roleOfPosition(position: number | null | undefined): PositionRole | null`
  - `roleLabel(role: PositionRole): string` — `'Goalkeeper' | 'Defence' | 'Attack'`
  - `positionOptionLabel(position: number): string` — `'4 · Defence'`
  - `positionCardLabel(position: number | null | undefined): string` — `'Defence (4)'`, `''` when not a position
  - `positionBioLabel(position: number | null | undefined): string` — `'Position 4 · Defence'`, `''` when not a position
  - `toPosition(value: unknown): number | null` — a position from anything read back (number or numeric text), else null
  - `parsePositionCell(value: unknown): { ok: true; position: number | null } | { ok: false }`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/position.test.ts`:

```ts
/**
 * A position is the soccer position number 1-11, and this module is the only
 * place that knows what the numbers mean: 1 goalkeeper, 2-6 defence, 7-11
 * attack. There is no midfield role.
 */
import { describe, it, expect } from 'vitest';
import {
  POSITIONS, isPosition, roleOfPosition, roleLabel, positionOptionLabel,
  positionCardLabel, positionBioLabel, toPosition, parsePositionCell
} from './position';

describe('the numbers', () => {
  it('are 1 to 11', () => {
    expect(POSITIONS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('accept only whole numbers 1-11', () => {
    expect([1, 6, 7, 11].every(isPosition)).toBe(true);
    expect([0, 12, 1.5, -1, NaN, '4', null, undefined].some(isPosition)).toBe(false);
  });
});

describe('roleOfPosition', () => {
  it('1 is the goalkeeper, 2-6 defence, 7-11 attack', () => {
    expect(POSITIONS.map(roleOfPosition)).toEqual([
      'keeper', 'defend', 'defend', 'defend', 'defend', 'defend',
      'attack', 'attack', 'attack', 'attack', 'attack'
    ]);
  });

  it('has no role for anything that is not a position', () => {
    for (const v of [null, undefined, 0, 12, 1.5]) expect(roleOfPosition(v as any)).toBeNull();
  });
});

describe('labels', () => {
  it('names each role', () => {
    expect([roleLabel('keeper'), roleLabel('defend'), roleLabel('attack')])
      .toEqual(['Goalkeeper', 'Defence', 'Attack']);
  });

  it('labels a picker option with its number and role', () => {
    expect([1, 4, 9].map(positionOptionLabel)).toEqual(['1 · Goalkeeper', '4 · Defence', '9 · Attack']);
  });

  it('labels the card and the bio, and says nothing for no position', () => {
    expect(positionCardLabel(4)).toBe('Defence (4)');
    expect(positionBioLabel(9)).toBe('Position 9 · Attack');
    expect(positionCardLabel(null)).toBe('');
    expect(positionBioLabel(undefined)).toBe('');
  });
});

describe('toPosition', () => {
  it('reads a number or numeric text, and nothing else', () => {
    expect([toPosition(4), toPosition('4'), toPosition(' 11 ')]).toEqual([4, 4, 11]);
    for (const v of ['FB', '', null, undefined, 12, '1.5']) expect(toPosition(v)).toBeNull();
  });
});

describe('parsePositionCell', () => {
  it('treats a blank cell as no position', () => {
    for (const v of ['', '   ', null, undefined]) expect(parsePositionCell(v)).toEqual({ ok: true, position: null });
  });

  it('accepts 1-11 as a number or text', () => {
    expect(parsePositionCell(4)).toEqual({ ok: true, position: 4 });
    expect(parsePositionCell('4')).toEqual({ ok: true, position: 4 });
    expect(parsePositionCell(' 11 ')).toEqual({ ok: true, position: 11 });
  });

  it('refuses anything else, rather than guessing', () => {
    for (const v of ['FB', 'Goalkeeper', 12, '0', '1.5', 'four']) expect(parsePositionCell(v)).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/position.test.ts`
Expected: FAIL — cannot resolve `./position`.

- [ ] **Step 3: Write the module**

Create `src/domain/position.ts`:

```ts
/**
 * What a position number means.
 *
 * A player's position is the soccer position number 1-11, stored in
 * team_players.position since 0036:
 *
 *   1      goalkeeper
 *   2-6    defence
 *   7-11   attack
 *
 * There is no midfield role. This module is the ONLY place those ranges are
 * written down -- the roster filter, the labels, the spreadsheet import and the
 * Goals by role drill all ask it -- so a change to the rule is one edit.
 *
 * The role strings are the ones the Goals by role drill stores, so the two can
 * never disagree about what "defend" means.
 */

export type PositionRole = 'keeper' | 'defend' | 'attack';

export const POSITIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 11;
}

export function roleOfPosition(position: number | null | undefined): PositionRole | null {
  if (!isPosition(position)) return null;
  if (position === 1) return 'keeper';
  return position <= 6 ? 'defend' : 'attack';
}

const ROLE_LABELS: Record<PositionRole, string> = {
  keeper: 'Goalkeeper',
  defend: 'Defence',
  attack: 'Attack'
};

export function roleLabel(role: PositionRole): string {
  return ROLE_LABELS[role];
}

/** "4 · Defence" — the roster form's picker. */
export function positionOptionLabel(position: number): string {
  const role = roleOfPosition(position);
  return role ? `${position} · ${roleLabel(role)}` : String(position);
}

/** "Defence (4)" — the roster card. Empty when there is no position. */
export function positionCardLabel(position: number | null | undefined): string {
  const role = roleOfPosition(position);
  return role ? `${roleLabel(role)} (${position})` : '';
}

/**
 * "Position 4 · Defence" — the bio. The word "Position" is what keeps it from
 * being read as the shirt number, which the bio already shows as "No. 9".
 */
export function positionBioLabel(position: number | null | undefined): string {
  const role = roleOfPosition(position);
  return role ? `Position ${position} · ${roleLabel(role)}` : '';
}

/** A position from a value read back — a number, or numeric text — else null. */
export function toPosition(value: unknown): number | null {
  if (isPosition(value)) return value;
  if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) {
    const n = Number(value.trim());
    return isPosition(n) ? n : null;
  }
  return null;
}

/**
 * A spreadsheet's Position cell.
 *
 * Blank is "no position". A number 1-11, or text that is one, is that number.
 * Anything else is refused rather than guessed: "FB" could be 2 or 3, and a
 * guess would put the player in the wrong role without anyone noticing.
 */
export function parsePositionCell(value: unknown): { ok: true; position: number | null } | { ok: false } {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { ok: true, position: null };
  }
  const position = toPosition(value);
  return position === null ? { ok: false } : { ok: true, position };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/domain/position.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Run the gates, then commit**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
git add src/domain/position.ts src/domain/position.test.ts
git commit -m "feat: one module for what a position number means

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The roster reads and filters by number

**Files:**
- Modify: `src/domain/player-row.ts` (`Player.position`, `toPlayer`) and `src/domain/player-row.test.ts`
- Modify: `src/stores/roster.ts` (`PlayerForm.position`, `membershipFrom`) and `src/stores/roster.test.ts`
- Modify: `src/domain/roster-view.ts` and `src/domain/roster-view.test.ts`
- Modify: `src/views/RosterView.test.ts` (fixtures, chip labels)

**Interfaces:**
- Consumes: `toPosition`, `roleOfPosition`, `type PositionRole` (Task 2).
- Produces: `Player.position: number | null`; `PlayerForm.position?: number | null`; `ROSTER_FILTERS: { key: 'ALL' | 'GK' | 'DEF' | 'FWD'; label: string; role: PositionRole | null }[]`; `filterRoster(players, filter)` and `rosterFilters(players)` unchanged in signature.

- [ ] **Step 1: Write the failing tests**

In `src/domain/player-row.test.ts`, change the fixture's `position: 'Midfielder'` to `position: 8` and the assertion `expect(p.position).toBe('Midfielder')` to `expect(p.position).toBe(8)`, and add:

```ts
  it('reads a position that is not 1-11 as no position', () => {
    // Before 0036 is applied the column still holds text; after, only numbers.
    expect(toPlayer({ id: 'm', position: 'FB', players: { id: 'p', name: 'A' } }).position).toBeNull();
    expect(toPlayer({ id: 'm', position: null, players: { id: 'p', name: 'A' } }).position).toBeNull();
    expect(toPlayer({ id: 'm', position: 11, players: { id: 'p', name: 'A' } }).position).toBe(11);
  });
```

(`toPlayer` is imported from `./player-row` at the top of that file; add it to the import if it is not.)

Replace `src/domain/roster-view.test.ts` with:

```ts
/**
 * Narrowing the roster to a position group.
 *
 * A group is a role, and a role comes from the position number (0036): 1 the
 * goalkeeper, 2-6 defence, 7-11 attack. No text is matched, and there is no
 * midfield group because the numbering has no midfield role.
 */
import { describe, it, expect } from 'vitest';
import { filterRoster, rosterFilters, ROSTER_FILTERS } from './roster-view';

const p = (id: string, position: number | null) => ({ id, name: id, position } as any);

const squad = [p('gk', 1), p('cb', 4), p('lb', 3), p('dm', 6), p('rw', 7), p('st', 9), p('none', null)];

describe('filterRoster', () => {
  it('returns everyone for ALL', () => {
    expect(filterRoster(squad, 'ALL')).toHaveLength(squad.length);
  });

  it('finds the keeper at 1', () => {
    expect(filterRoster(squad, 'GK').map(x => x.id)).toEqual(['gk']);
  });

  it('finds defence at 2-6', () => {
    expect(filterRoster(squad, 'DEF').map(x => x.id)).toEqual(['cb', 'lb', 'dm']);
  });

  it('finds attack at 7-11', () => {
    expect(filterRoster(squad, 'FWD').map(x => x.id)).toEqual(['rw', 'st']);
  });

  it('leaves a player with no position out of every group but ALL', () => {
    for (const key of ['GK', 'DEF', 'FWD']) {
      expect(filterRoster(squad, key).some(x => x.id === 'none'), key).toBe(false);
    }
  });

  it('shows everyone for an unknown filter rather than nobody', () => {
    expect(filterRoster(squad, 'MID')).toHaveLength(squad.length);
  });
});

describe('rosterFilters', () => {
  it('offers All, Keepers, Defence and Attack — no Midfield', () => {
    expect(ROSTER_FILTERS.map(f => f.label)).toEqual(['All', 'Keepers', 'Defence', 'Attack']);
  });

  it('counts each chip, including an empty one', () => {
    expect(rosterFilters([p('a', 9), p('b', null)])).toEqual([
      { key: 'ALL', label: 'All', count: 2 },
      { key: 'GK', label: 'Keepers', count: 0 },
      { key: 'DEF', label: 'Defence', count: 0 },
      { key: 'FWD', label: 'Attack', count: 1 }
    ]);
  });
});
```

In `src/stores/roster.test.ts`: change the `row()` fixture's `position: 'Midfielder'` → `position: 8`, the `'Striker'` → `9` and `'Center Back'` → `4` overrides, and the `form` constant's `position: 'Midfielder'` → `position: 8`. Add, inside `describe('adding a player', …)`:

```ts
  it('writes the position as a number, and a blank one as null', async () => {
    const s = useRosterStore();
    await s.addPlayer({ ...form, position: 8 }, 't1', 's1');
    expect(upsertTeamMembership.mock.calls.at(-1)![2]).toMatchObject({ position: 8 });
    await s.addPlayer({ ...form, position: null }, 't1', 's1');
    expect(upsertTeamMembership.mock.calls.at(-1)![2]).toMatchObject({ position: null });
  });
```

In `src/views/RosterView.test.ts`: change `position: 'Midfielder'` → `8`, `'Striker'` → `9`, `'Center Back'` → `4`, and replace the body of `'offers a chip per position group, with counts'` with:

```ts
    const w = mountRoster();
    expect(w.findAll('[data-filter-chip]').map(c => c.text().replace(/\s+/g, ' ').trim()))
      .toEqual(expect.arrayContaining([expect.stringContaining('Defence'), expect.stringContaining('Attack')]));
    expect(w.text()).not.toMatch(/Midfield/);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/player-row.test.ts src/domain/roster-view.test.ts src/stores/roster.test.ts src/views/RosterView.test.ts`
Expected: FAIL — roster-view still matches text and offers Midfield; `toPlayer` returns `'FB'`.

- [ ] **Step 3: Implement**

`src/domain/player-row.ts`: add `import { toPosition } from './position';`, change the field to

```ts
  /** The soccer position number 1-11, or null (0036). Meaning: domain/position.ts. */
  position: number | null;
```

and in `toPlayer` replace `position: m?.position,` with `position: toPosition(m?.position),`.

`src/stores/roster.ts`: change `position?: string;` in `PlayerForm` to `position?: number | null;` and in `membershipFrom` replace `position: f.position,` with `position: f.position ?? null,`.

Replace `src/domain/roster-view.ts` with:

```ts
/**
 * Narrowing the roster to a position group.
 *
 * A group is a role, and a role comes from the position number -- see
 * domain/position.ts: 1 the goalkeeper, 2-6 defence, 7-11 attack. No text is
 * matched. There is no midfield group because the numbering has no midfield
 * role; a player with no position appears under All only.
 *
 * Sorting stays in src/domain/roster.ts.
 */
import type { Player } from './player-row';
import { roleOfPosition, type PositionRole } from './position';

export interface RosterFilter {
  key: 'ALL' | 'GK' | 'DEF' | 'FWD';
  label: string;
  /** null means "everyone" rather than "match nothing". */
  role: PositionRole | null;
}

export const ROSTER_FILTERS: RosterFilter[] = [
  { key: 'ALL', label: 'All', role: null },
  { key: 'GK', label: 'Keepers', role: 'keeper' },
  { key: 'DEF', label: 'Defence', role: 'defend' },
  { key: 'FWD', label: 'Attack', role: 'attack' }
];

export function filterRoster(players: Player[], filter: string): Player[] {
  const rows = players || [];
  const found = ROSTER_FILTERS.find(f => f.key === filter);

  // An unknown filter shows everyone rather than nobody: an empty roster
  // reads as "there are no players", which would be a lie.
  if (!found || !found.role) return rows.slice();

  return rows.filter(p => roleOfPosition(p?.position) === found.role);
}

/**
 * The chips, with how many each would show.
 *
 * An empty group is shown as zero rather than hidden, so the set of chips does
 * not move around.
 */
export function rosterFilters(players: Player[]): { key: string; label: string; count: number }[] {
  return ROSTER_FILTERS.map(f => ({
    key: f.key,
    label: f.label,
    count: filterRoster(players, f.key).length
  }));
}
```

If `src/stores/roster.ts` persists a chosen filter (for example `'MID'`), no change is needed: an unknown filter shows everyone.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/domain/player-row.test.ts src/domain/roster-view.test.ts src/stores/roster.test.ts src/views/RosterView.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: all `0`. Typecheck will flag every remaining reader of `position` as a string — `PlayerCard.vue`, `PlayerDetailModal.vue`, `PlayerFormModal.vue`, `workbook.ts` — which Tasks 4 and 5 change. If typecheck fails ONLY on those files, make the smallest temporary fix that keeps behaviour (e.g. `String(player.position ?? '')`) so the gate is green, and note it in the commit body; Tasks 4 and 5 replace it.

- [ ] **Step 6: Commit**

```bash
git add src/domain/player-row.ts src/domain/player-row.test.ts src/stores/roster.ts src/stores/roster.test.ts src/domain/roster-view.ts src/domain/roster-view.test.ts src/views/RosterView.test.ts
git commit -m "feat: the roster reads positions as numbers and groups them by role

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(Add any file given a temporary typecheck fix in Step 5 to the `git add`.)

---

### Task 4: The form picker, the card and the bio

**Files:**
- Modify: `src/components/roster/PlayerFormModal.vue`
- Create: `src/components/roster/PlayerFormModal.test.ts`
- Modify: `src/components/roster/PlayerCard.vue:36-37`
- Create: `src/components/roster/PlayerCard.test.ts`
- Modify: `src/components/roster/PlayerDetailModal.vue:48-53` and `src/components/roster/PlayerDetailModal.test.ts`

**Interfaces:**
- Consumes: `POSITIONS`, `positionOptionLabel`, `positionCardLabel`, `positionBioLabel` (Task 2); `Player.position: number | null`, `PlayerForm.position?: number | null` (Task 3).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

Create `src/components/roster/PlayerFormModal.test.ts`:

```ts
/**
 * The roster form's position is a picker of the numbers 1-11, each labelled
 * with its role, plus a blank for "not set". Free text is gone: it is what let
 * "FB", "MF" and "Center Midfield" into the column.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PlayerFormModal from './PlayerFormModal.vue';

const PLAYER = {
  id: 'p1', membershipId: 'm1', name: 'Cesar Alva', firstName: 'Cesar', lastName: 'Alva',
  classYear: 'Senior', height: '5-10', photo: '', number: 9, recordingNumber: 3,
  position: 4, seasonStats: {}, ratings: {}
};

function mountForm(player: any = null) {
  return mount(PlayerFormModal, { props: { open: true, player }, attachTo: document.body });
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('the position picker', () => {
  it('offers blank, then 1-11 labelled with their role', () => {
    const w = mountForm();
    const options = w.findAll('[data-field="position"] option').map(o => o.text().trim());
    expect(options).toEqual([
      '—', '1 · Goalkeeper', '2 · Defence', '3 · Defence', '4 · Defence', '5 · Defence', '6 · Defence',
      '7 · Attack', '8 · Attack', '9 · Attack', '10 · Attack', '11 · Attack'
    ]);
  });

  it("opens on the player's position when editing", () => {
    const w = mountForm(PLAYER);
    expect((w.find('[data-field="position"]').element as HTMLSelectElement).value).toBe('4');
  });

  it('saves the position as a number', async () => {
    const w = mountForm(PLAYER);
    await w.find('[data-field="position"]').setValue('9');
    await w.find('form').trigger('submit');
    expect((w.emitted('save') as any[])[0][0].position).toBe(9);
  });

  it('saves a blank position as null', async () => {
    const w = mountForm(PLAYER);
    await w.find('[data-field="position"]').setValue('');
    await w.find('form').trigger('submit');
    expect((w.emitted('save') as any[])[0][0].position).toBeNull();
  });
});
```

Create `src/components/roster/PlayerCard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlayerCard from './PlayerCard.vue';

const base = {
  id: 'p1', membershipId: 'm1', name: 'Cesar Alva', firstName: 'Cesar', lastName: 'Alva',
  classYear: 'Senior', height: '', photo: '', number: 9, recordingNumber: 3,
  seasonStats: {}, ratings: {}
};

describe('the card', () => {
  it('shows the role with the position number', () => {
    const w = mount(PlayerCard, { props: { player: { ...base, position: 4 }, canEdit: false } });
    expect(w.text()).toContain('Defence (4)');
  });

  it('says the position is not recorded when there is none', () => {
    const w = mount(PlayerCard, { props: { player: { ...base, position: null }, canEdit: false } });
    expect(w.text()).toContain('Position not recorded');
  });
});
```

In `src/components/roster/PlayerDetailModal.test.ts`, change the `PLAYER` fixture's `position: 'Striker'` to `position: 9`, and in `'reads number and class year as the kicker, and position and height under the name'` change `expect(w.text()).toContain('Striker');` to `expect(w.text()).toContain('Position 9 · Attack');`. Add inside `describe('PlayerDetailModal', …)`:

```ts
  it('shows no position when the player has none', () => {
    const w = mountWith({ ...PLAYER, position: null });
    expect(w.text()).not.toContain('Position');
    expect(w.text()).toContain('5′ 11″');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/roster/PlayerFormModal.test.ts src/components/roster/PlayerCard.test.ts src/components/roster/PlayerDetailModal.test.ts`
Expected: FAIL — the form has a text input; the card shows `4`; the bio shows `9`.

- [ ] **Step 3: Implement**

`PlayerFormModal.vue` script: add `import { POSITIONS, positionOptionLabel } from '../../domain/position';`. In `blank()` change `position: ''` to `position: null`; in the edit branch change `position: p.position || '',` to `position: p.position ?? null,`.

Replace the position `<label class="field">` block with:

```vue
      <label class="field">
        <span class="kicker" title="The soccer position number: 1 goalkeeper, 2-6 defence, 7-11 attack">
          Position
        </span>
        <select v-model="f.position" class="input" data-field="position">
          <option :value="null">—</option>
          <option v-for="n in POSITIONS" :key="n" :value="n">{{ positionOptionLabel(n) }}</option>
        </select>
      </label>
```

`PlayerCard.vue`: add `import { positionCardLabel } from '../../domain/position';` to its script, and replace

```vue
          <template v-if="player.position">{{ player.position }}</template>
```

with

```vue
          <template v-if="positionCardLabel(player.position)">{{ positionCardLabel(player.position) }}</template>
```

`PlayerDetailModal.vue`: add `import { positionBioLabel } from '../../domain/position';` and in the `line` computed replace `if (props.player?.position) parts.push(props.player.position);` with

```ts
  const position = positionBioLabel(props.player?.position);
  if (position) parts.push(position);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/roster/PlayerFormModal.test.ts src/components/roster/PlayerCard.test.ts src/components/roster/PlayerDetailModal.test.ts src/views/RosterView.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gates, then commit**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
git add src/components/roster/PlayerFormModal.vue src/components/roster/PlayerFormModal.test.ts src/components/roster/PlayerCard.vue src/components/roster/PlayerCard.test.ts src/components/roster/PlayerDetailModal.vue src/components/roster/PlayerDetailModal.test.ts
git commit -m "feat: pick a position number on the roster, and show its role

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The spreadsheet exports the number and refuses a bad one

**Files:**
- Modify: `src/domain/workbook.ts:116` and `src/domain/workbook.test.ts`
- Modify: `src/domain/import-plan.ts` and `src/domain/import-plan.test.ts`
- Modify: `src/components/admin/ImportExportModal.vue` and `src/components/admin/ImportExportModal.test.ts`

**Interfaces:**
- Consumes: `parsePositionCell` (Task 2); `Player.position: number | null` (Task 3).
- Produces: `PlannedSheet.badPositions: BadPosition[]`; `ImportPlan.badPositions: BadPosition[]`; `interface BadPosition { sheetName: string; row: number; name: string; value: string }`; `readyToApply(plan, mapping)` also requires `plan.badPositions.length === 0`.

- [ ] **Step 1: Write the failing tests**

In `src/domain/workbook.test.ts`, change the fixture's `position: 'Striker'` to `position: 9`, and add next to the existing players-sheet export test:

```ts
  it('exports the position number, and a blank for none', () => {
    const def = tableDefs().find(d => d.key === 'players')!;
    const rows = def.toRows({ teamName: 'Varsity', players: [
      { firstName: 'A', lastName: 'B', position: 9 },
      { firstName: 'C', lastName: 'D', position: null }
    ] } as any);
    expect(rows.map((r: any) => r.Position)).toEqual([9, '']);
  });
```

(Use the file's existing import of the table definitions; `tableDefs` is exported from `./workbook`.)

In `src/domain/import-plan.test.ts`, add:

```ts
describe('positions', () => {
  const known = { teams: [{ id: 't1', name: 'Varsity' }] };

  it('lists a Position that is not 1-11 or blank, naming the row and player', () => {
    const plan = planImport({ Players: [
      { Team: 'Varsity', FirstName: 'Ann', LastName: 'Bell', Position: '4' },
      { Team: 'Varsity', FirstName: 'Cy', LastName: 'Dunn', Position: 'FB' },
      { Team: 'Varsity', FirstName: 'Ed', LastName: 'Fox', Position: '' },
      { Team: 'Varsity', FirstName: 'Gil', LastName: 'Hart', Position: 12 }
    ] }, known);
    expect(plan.badPositions).toEqual([
      { sheetName: 'Players', row: 3, name: 'Cy Dunn', value: 'FB' },
      { sheetName: 'Players', row: 5, name: 'Gil Hart', value: '12' }
    ]);
  });

  it('will not apply while a position is refused', () => {
    const plan = planImport({ Players: [{ Team: 'Varsity', FirstName: 'Cy', Position: 'MF' }] }, known);
    expect(readyToApply(plan, {})).toBe(false);
  });

  it('applies when every position is 1-11 or blank', () => {
    const plan = planImport({ Players: [{ Team: 'Varsity', FirstName: 'Cy', Position: '9' }] }, known);
    expect(readyToApply(plan, {})).toBe(true);
  });
});
```

(`row` is the spreadsheet row: the header is row 1, so the first data row is row 2.)

In `src/components/admin/ImportExportModal.test.ts`, add a describe using the file's existing `stubXLSX`, `mountIE`, `choose` and `flush` helpers:

```ts
describe('A BAD POSITION BLOCKS THE IMPORT', () => {
  const sheet = { Players: [{ Team: 'Varsity', FirstName: 'Cy', LastName: 'Dunn', Position: 'FB' }] };

  it('lists it in the preview, with the row and the player', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, sheet);
    const text = w.find('[data-bad-position]').text();
    expect(text).toContain('Cy Dunn');
    expect(text).toContain('FB');
    expect(text).toContain('2');
  });

  it('REFUSES to apply', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, sheet);
    expect((w.find('[data-import-apply]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('writes a good position as a number', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, { Players: [{ Team: 'Varsity', FirstName: 'Cy', LastName: 'Dunn', Position: '7' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();
    expect(upsertTeamMembership).toHaveBeenCalledWith('t1', 's1', expect.objectContaining({ position: 7 }));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/workbook.test.ts src/domain/import-plan.test.ts src/components/admin/ImportExportModal.test.ts`
Expected: FAIL — export writes `'9'` through `t()`, `badPositions` is undefined, there is no `[data-bad-position]`.

- [ ] **Step 3: Implement**

`src/domain/workbook.ts`: in the players `toRows`, replace `Position: t(p.position),` with `Position: p.position ?? '',`.

`src/domain/import-plan.ts`:
- add `import { parsePositionCell } from './position';`
- add the interface above `PlannedSheet`:

```ts
/** A Position cell that is not 1-11 or blank. Refused rather than guessed. */
export interface BadPosition {
  sheetName: string;
  /** The spreadsheet row: the header is row 1. */
  row: number;
  name: string;
  value: string;
}
```

- add `badPositions: BadPosition[];` to `PlannedSheet` and to `ImportPlan`;
- in `planImport`, declare `const badAll: BadPosition[] = [];` beside `unknown`; after `rows` is built, compute

```ts
    const badHere: BadPosition[] = [];
    if (def.key === 'players' && def.importable) {
      rows.forEach((r, i) => {
        if (!parsePositionCell(r.Position).ok) {
          badHere.push({
            sheetName: def.sheetName,
            row: i + 2,
            name: [r.FirstName, r.LastName].filter(Boolean).join(' '),
            value: String(r.Position)
          });
        }
      });
      badAll.push(...badHere);
    }
```

  push `badPositions: badHere` into the planned sheet object, and return `badPositions: badAll` in the plan;
- change `readyToApply` to

```ts
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
```

`src/components/admin/ImportExportModal.vue`:
- add `import { parsePositionCell } from '../../domain/position';`
- in `writeRow`'s players branch replace `position: row.Position` with

```ts
      // readyToApply refuses a plan with a bad position, so this is 1-11 or null.
      position: (() => { const cell = parsePositionCell(row.Position); return cell.ok ? cell.position : null; })()
```

- in the preview template, after the unknown-teams `<template>` block and before the apply button, add:

```vue
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/domain/workbook.test.ts src/domain/import-plan.test.ts src/components/admin/ImportExportModal.test.ts`
Expected: PASS. Existing modal tests whose players rows have no `Position` stay green (blank is fine).

- [ ] **Step 5: Run the gates, then commit**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
git add src/domain/workbook.ts src/domain/workbook.test.ts src/domain/import-plan.ts src/domain/import-plan.test.ts src/components/admin/ImportExportModal.vue src/components/admin/ImportExportModal.test.ts
git commit -m "feat: the spreadsheet carries the position number and refuses one it would guess at

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

If a temporary typecheck fix from Task 3 remains anywhere, remove it in this commit and name the file.

---

### Task 6: Help, CLAUDE.md and the rollout note

**Files:**
- Modify: `src/content/help.ts` (the roster entry that mentions position, around line 144)
- Modify: `CLAUDE.md`
- Modify: `docs/runbooks/2026-09-14-accounts-setup-runbook.md`

**Interfaces:** documentation only.

- [ ] **Step 1: Help**

In `src/content/help.ts`, in the roster entry that says the jersey number, position and stats are stored per team, add one sentence in the same HTML style:
"A position is the soccer position number — 1 is the goalkeeper, 2 to 6 are defence, 7 to 11 are attack — and the Keepers, Defence and Attack filters use it."
If `src/domain/help-search.test.ts` (or another help test) counts entries or snapshots text, keep it green.

- [ ] **Step 2: CLAUDE.md**

- In the SQL files list, change "…through `supabase/migrations/0035_account_invitations.sql`" to "…through `supabase/migrations/0036_numbered_positions.sql`".
- Add this section under `## The rules that are not guessable from the code`, directly before `### Recording numbers are assigned by the coach, in a block`:

```markdown
### A position is a number, 1 to 11

Since `0036_numbered_positions.sql`. `team_players.position` is a `smallint`, null or 1–11: **1 goalkeeper, 2–6 defence, 7–11 attack.** There is no midfield role. It was free text ("FB", "MF", "Center Midfield") until then, and the conversion kept only what was certain — goalkeeper spellings became 1, everything ambiguous was cleared for the coach — because a guessed number puts a player in the wrong role without anyone noticing.

The meaning lives **only** in `src/domain/position.ts` (`roleOfPosition`, the labels, `parsePositionCell`). The roster filter, the card and bio, the spreadsheet import and the Goals by role drill all ask it; nothing compares a position to 1, 6 or 7 or matches its text. The spreadsheet import refuses a Position that is not 1–11 or blank, listing the row, the way it refuses an unmapped team.

The position number is **not the shirt number** (`team_players.number`) and not the recording number. The bio says "Position 9 · Attack" for that reason.
```

- [ ] **Step 3: Rollout note**

In `docs/runbooks/2026-09-14-accounts-setup-runbook.md`, step "Before applying" gains an item after the existing ones:

```markdown
f. **Numbered positions (0036).** This release also turns roster positions into
   numbers 1–11. Run this and keep the output — it lists every position the
   migration will clear, so you can set them from the roster afterwards:

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
```

and the step that applies the migration says to run `0035_account_invitations.sql` **and then** `0036_numbered_positions.sql`, each pasted whole, before `notify pgrst, 'reload schema';` and the push. In the verification query block, add:

```sql
   select data_type from information_schema.columns
    where table_name = 'team_players' and column_name = 'position';            -- smallint
```

and in the final "prove" step add: "Open a player's Edit form: Position is a picker of 1–11; set the positions the pre-check listed."

- [ ] **Step 4: Run the gates, then commit**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
git add src/content/help.ts CLAUDE.md docs/runbooks/2026-09-14-accounts-setup-runbook.md
git commit -m "docs: positions are numbers 1-11, and 0036 rolls out with 0035

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
