# Goals by Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sixth Competitive Matrix measure, `role_goals` ("Goals by role"). Each player records one score from their side of the game, like `3-1`. That score is judged against per-squad, per-role standards: goal difference plus a bonus.

**Architecture:**
- **Postgres is the authority.**
  - Migration `0037_goals_by_role.sql` adds the measure, three result columns and a `drill_goal_bands` table.
  - Bands have no write policy, so the `security definer` function `save_goal_bands` is the only way in. That is what lets the 100% rule span rows.
  - One new CTE in a restated `matrix_exercise_points` does the scoring.
- **The browser holds a deliberate copy of the rule** (`role-goal-score.ts`) for the live preview. It is checked against the SQL through one shared table of cases (`role-goal-cases.ts`).
- **Client changes** follow the `time_bands` precedent at every layer: session sheet, Weights & standards, leaderboard, breakdown and export.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, Vitest + @vue/test-utils, vue-tsc, Supabase (PostgREST RPC, RLS), a real Postgres in `src/data/testdb/`.

**Spec:** `docs/superpowers/specs/2026-09-14-goals-by-role-design.md` (depends on `2026-09-14-numbered-positions-design.md`, already built).

## Global Constraints

**Commands and checks**
- The gates are `npm test`, `npm run typecheck` and `npm run build`. Judge each **by exit code**: `npm test > /dev/null 2>&1; echo "EXIT=$?"`.
- SQL is tested by running it against the real Postgres in `src/data/testdb/`, never by asserting on a file's text.
- Permission questions are asked on an `authenticated` connection (`buildAccountsDb().asUser`), never on the superuser harness.

**Git**
- Never `git add -A` or `git add .`. Stage named files only.
- Never stage `assets/*.jpg`.
- Never push.
- Commit messages are Conventional Commits and end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

**Database**
- Never touch the production database (`arsigevpgpbqluqbnhjr`). The owner applies migrations by hand.
- A migration must apply to an empty database (the nightly demo rebuild runs every file in `supabase/migrations/`). No data statements naming production rows.
- A migration must be safe to apply twice.
- Leave every existing score unchanged.
- It starts `begin; set role postgres;` and ends `commit;`.
- A privileged PL/pgSQL write function fails closed: `coalesce(public.is_team_coach(x), false)`, never a bare comparison.
- Role strings are exactly `'attack' | 'defend' | 'keeper'`, the `PositionRole` values from `src/domain/position.ts`. Nothing else may hardcode position ranges (1, 2–6, 7–11). Use `roleOfPosition`.

**App code**
- Never hardcode `'bhs'`, Beaumont or Cougars. Standards are per team (`teams.id`); the drill library is per organization.
- User-facing failures are shown in the app, not only logged to the console.
- A Pinia setup store must not return plain helper functions. Pure helpers go in `src/domain/` and are called from components.
- Component styles use the ground tokens (`--ink`, `--ink-muted`, `--rule`, `--rule-strong`, `--live`, `--surface-deep`, `--color-warning`, `--color-danger`, `--heading-face`), never a literal colour.
- Do not upgrade `typescript` (pinned 5.x). Do not tighten `tsconfig.json`.

**Behaviour**
- The session grid keeps its three behaviours:
  - Enter moves to the next `[data-entry-field]` in on-screen order.
  - Typing a value marks the player present.
  - Past the last field, focus goes to Save.
- Below-standard emphasis is strictly additive: it never removes a leaderboard row and never disables a sort.

## Rulings made while writing this plan

Each is a reading of the spec where it is silent or conflicts with code that shipped since. If one is wrong, it costs the rework named.

1. **Role labels are `roleLabel()`'s — "Attack", "Defence", "Goalkeeper" — not "Defend".**
   - *Why:* the spec was written before `position.ts` existed. The roster already says "Defence", and CLAUDE.md makes `position.ts` the only place the meaning lives.
   - *If wrong:* one label map changes.
2. **"Choose the squad" is the team selected in the header**, exactly as time bands already work in `WeightsModal`. There is no squad picker inside the modal.
   - *If wrong:* a picker is added to `GoalBandsEditor`.
3. **The per-drill leaderboard shows each player's most recent Goals-by-role result** (role, score, goal difference, base %, bonus %). Points and Of total every session, as for every measure. Below-standard reads that latest result.
   - *Why:* the drill is normally one session, and a role can differ between sessions, so summing scores across them would mix roles.
   - *If wrong:* the aggregation in `exerciseLeaderboard` changes.
4. **The breakdown's "What happened" cell reads `Attack · 3-1 (+2) · 50% + 10%`.** The spec's full line also names the exercise and `1.8 of 3.0 pts`; the modal already shows those in its Exercise, Earned and Of columns, so repeating them in one cell would print them twice.
5. **A Goals-by-role sheet starts everyone "Here"**, as `win_loss` and `count_high` do (`defaultSessionAttendance` is unchanged). Choosing a role does not change attendance; typing a score marks present.
6. **The role select comes before the score box in each row**, and both carry `data-entry-field`, so Enter goes role → score → next row's role.
7. **A stored Goals-by-role result has `raw_value` null.** The view derives `raw_value = goals_for − goals_against`.
8. **`save_goal_bands` bounds a threshold to −9999…9999 and stores `factor` rounded to 3 places** (`numeric(4,3)`). The 100% rule is checked on the rounded values.
   - *Why:* avoids an integer-overflow error in place of a sentence, and a rounding gap between check and storage.

## File map

| File | Task | Responsibility |
| --- | --- | --- |
| `supabase/migrations/0037_goals_by_role.sql` | 1 | measure, result columns, `drill_goal_bands`, `save_goal_bands`, restated views |
| `src/domain/role-goal-cases.ts` | 1 | the shared table of scoring cases (data only) |
| `src/data/testdb/goals-by-role-fixtures.ts` | 1 | committed-fixture helpers for the two DB test files |
| `src/data/testdb/migration-0037-goals-by-role.test.ts` | 1 | applies to empty db, twice, existing points unchanged |
| `src/data/testdb/goals-by-role.test.ts` | 1 | scoring rules, `save_goal_bands` as real visitors |
| `src/domain/goal-score.ts` (+test) | 2 | `parseGoalScore`, `formatGoalScore`, `formatGoalDifference` |
| `src/domain/role-goal-score.ts` (+test) | 2 | `roleGoalFactor`, `roleGoalFeedback`, `goalBandExample`, `percentLabel` |
| `src/domain/goal-bands-draft.ts` (+test) | 2 | editor drafts ↔ bands, local validation |
| `src/data/supabase.ts` | 3 | `MEASURES`, `saveMatrixSession`, reads of new columns, `fetchGoalBands`, `saveGoalBands` |
| `src/data/goal-bands-service.test.ts` | 3 | the two new service methods |
| `src/data/matrix-session-service.test.ts` | 3 | the `role_goals` save path |
| `src/stores/session.ts` (+test) | 3 | `goalBands` loaded for a `role_goals` drill |
| `src/domain/session-entry.ts` (+test) | 4 | the `role_goals` branch |
| `src/domain/session-format.ts` (+test) | 4 | the `3-1` banner |
| `src/components/matrix/SessionEntryScreen.vue` (+test) | 4 | role select, score box, live points |
| `src/components/matrix/GoalBandsEditor.vue` (+test) | 5 | per-role editor |
| `src/components/matrix/WeightsModal.vue` (+test) | 5 | offers the measure, loads and saves goal bands |
| `src/domain/matrix.ts` (+test) | 6 | leaderboard fields and sorts |
| `src/domain/matrix-threshold.ts` (+test) | 6 | per-role standing and shortfall |
| `src/stores/matrix.ts` | 6 | `roleShortfall` |
| `src/components/matrix/ExerciseLeaderboard.vue` (+new test) | 6 | columns, summary, marks |
| `src/domain/matrix-breakdown.ts` (+test) | 6 | breakdown line |
| `src/domain/exercise-export.ts` (+test) | 6 | export columns |
| `src/components/matrix/ProgressModal.vue`, `SquadReportModal.vue` (+tests) | 6 | leave `role_goals` out |
| `src/content/help.ts`, `CLAUDE.md`, `src/domain/position.ts` comment, runbook, spec status | 7 | documentation |

---

### Task 1: Migration 0037 and its database tests

**Files:**
- Create: `supabase/migrations/0037_goals_by_role.sql`
- Create: `src/domain/role-goal-cases.ts`
- Create: `src/data/testdb/goals-by-role-fixtures.ts`
- Create: `src/data/testdb/migration-0037-goals-by-role.test.ts`
- Create: `src/data/testdb/goals-by-role.test.ts`

**Interfaces:**
- Consumes: `buildAccountsDb`, `one`, `uniq`, `makeTeam`, `makeRosterEntry`, `makeCoach`, `makeAdmin` from `src/data/testdb/accounts-db.ts`; `hasTestDb` from `harness.ts`. `buildAccountsDb` runs every file in `supabase/migrations/` on an empty database, so the new file is picked up automatically.
- Produces:
  - SQL `public.save_goal_bands(p_drill_id uuid, p_team_id uuid, p_role text, p_bands jsonb) returns void`.
  - Table `public.drill_goal_bands(drill_id, team_id, role, kind, threshold, factor)`.
  - Columns `matrix_session_results.role text`, `goals_for integer`, `goals_against integer`.
  - View columns `matrix_exercise_points.role`, `goals_for`, `goals_against`, `base_factor`, `bonus_factor`, and `kind = 'role_goals'`.
  - TS `ROLE_GOAL_CASES: RoleGoalCase[]` from `src/domain/role-goal-cases.ts` (Task 2 consumes it).

- [ ] **Step 1: Write the shared cases file**

`src/domain/role-goal-cases.ts`:

```ts
/**
 * One table of Goals-by-role scoring cases, read by BOTH implementations.
 *
 * The rule lives in Postgres (0037's `role_scored` CTE) and, deliberately, in
 * the browser (`role-goal-score.ts`) so a coach sees what a score earns as it
 * is typed. `role-goal-score.test.ts` runs the browser's copy over these cases
 * and `src/data/testdb/goals-by-role.test.ts` runs the database's, so the
 * preview and the stored points cannot disagree without a test failing.
 *
 * Data only: no imports beyond a type, so the database test can read it.
 */
import type { PositionRole } from './position';

export interface CaseBand {
  role: PositionRole;
  kind: 'base' | 'bonus';
  threshold: number;
  factor: number;
}

export interface RoleGoalCase {
  name: string;
  role: PositionRole;
  scored: number;
  conceded: number;
  bands: CaseBand[];
  expected: { base: number; bonus: number; total: number; hasStandards: boolean };
}

const ATTACK: CaseBand[] = [
  { role: 'attack', kind: 'base', threshold: 3, factor: 0.8 },
  { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 },
  { role: 'attack', kind: 'base', threshold: 0, factor: 0.25 },
  { role: 'attack', kind: 'bonus', threshold: 5, factor: 0.2 },
  { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 }
];

const DEFEND: CaseBand[] = [
  { role: 'defend', kind: 'base', threshold: 0, factor: 0.6 },
  { role: 'defend', kind: 'base', threshold: -1, factor: 0.3 },
  { role: 'defend', kind: 'bonus', threshold: 0, factor: 0.4 },
  { role: 'defend', kind: 'bonus', threshold: 1, factor: 0.2 }
];

const KEEPER: CaseBand[] = [
  { role: 'keeper', kind: 'base', threshold: 0, factor: 0.9 },
  { role: 'keeper', kind: 'bonus', threshold: 0, factor: 0.1 }
];

/** Stored directly to prove the cap; save_goal_bands itself would refuse it. */
const OVER: CaseBand[] = [
  { role: 'attack', kind: 'base', threshold: 0, factor: 0.9 },
  { role: 'attack', kind: 'bonus', threshold: 0, factor: 0.9 }
];

export const ROLE_GOAL_CASES: RoleGoalCase[] = [
  { name: 'attack 3-1: base from +2, bonus for 3 scored', role: 'attack', scored: 3, conceded: 1, bands: ATTACK,
    expected: { base: 0.5, bonus: 0.1, total: 0.6, hasStandards: true } },
  { name: 'attack 5-1: the top base and the top bonus', role: 'attack', scored: 5, conceded: 1, bands: ATTACK,
    expected: { base: 0.8, bonus: 0.2, total: 1, hasStandards: true } },
  { name: 'attack 6-7: no base, still the scoring bonus', role: 'attack', scored: 6, conceded: 7, bands: ATTACK,
    expected: { base: 0, bonus: 0.2, total: 0.2, hasStandards: true } },
  { name: 'attack 0-0: a threshold of 0 is met', role: 'attack', scored: 0, conceded: 0, bands: ATTACK,
    expected: { base: 0.25, bonus: 0, total: 0.25, hasStandards: true } },
  { name: 'attack 1-4: nothing met', role: 'attack', scored: 1, conceded: 4, bands: ATTACK,
    expected: { base: 0, bonus: 0, total: 0, hasStandards: true } },
  { name: 'attack bands out of order score the same', role: 'attack', scored: 3, conceded: 1,
    bands: ATTACK.slice().reverse(),
    expected: { base: 0.5, bonus: 0.1, total: 0.6, hasStandards: true } },
  { name: 'defend 0-0: clean sheet bonus', role: 'defend', scored: 0, conceded: 0, bands: DEFEND,
    expected: { base: 0.6, bonus: 0.4, total: 1, hasStandards: true } },
  { name: 'defend 1-2: a negative threshold is met', role: 'defend', scored: 1, conceded: 2, bands: DEFEND,
    expected: { base: 0.3, bonus: 0, total: 0.3, hasStandards: true } },
  { name: 'defend 2-1: gave up at most 1', role: 'defend', scored: 2, conceded: 1, bands: DEFEND,
    expected: { base: 0.6, bonus: 0.2, total: 0.8, hasStandards: true } },
  { name: 'defend 0-3: nothing met', role: 'defend', scored: 0, conceded: 3, bands: DEFEND,
    expected: { base: 0, bonus: 0, total: 0, hasStandards: true } },
  { name: 'keeper 0-1: nothing met', role: 'keeper', scored: 0, conceded: 1, bands: KEEPER,
    expected: { base: 0, bonus: 0, total: 0, hasStandards: true } },
  { name: 'keeper 1-0: both', role: 'keeper', scored: 1, conceded: 0, bands: KEEPER,
    expected: { base: 0.9, bonus: 0.1, total: 1, hasStandards: true } },
  { name: 'base plus bonus is capped at the whole weight', role: 'attack', scored: 1, conceded: 0, bands: OVER,
    expected: { base: 0.9, bonus: 0.9, total: 1, hasStandards: true } },
  { name: 'a role with no bands of its own is not scored', role: 'keeper', scored: 1, conceded: 0, bands: ATTACK,
    expected: { base: 0, bonus: 0, total: 0, hasStandards: false } },
  { name: 'a bonus band alone is not a standard', role: 'attack', scored: 4, conceded: 0,
    bands: [{ role: 'attack', kind: 'bonus', threshold: 0, factor: 0.2 }],
    expected: { base: 0, bonus: 0, total: 0, hasStandards: false } }
];
```

- [ ] **Step 2: Write the fixture helpers**

`src/data/testdb/goals-by-role-fixtures.ts`:

```ts
/// <reference types="node" />
/**
 * Committed fixtures for the Goals-by-role database tests.
 *
 * Built on accounts-db's owner connection (a superuser, so RLS does not stand
 * in the way of arranging data). Every fixture gets its own team and drill, so
 * committed rows from one test can never be scored in another.
 */
import type pg from 'pg';
import { one, uniq, makeTeam, makeRosterEntry } from './accounts-db';

export interface Team { id: string; school_id: string }

export async function makeDrill(owner: pg.Client, team: Team, measure = 'role_goals', points = 1): Promise<string> {
  const row = await one(owner,
    `insert into public.drills_bank (school_id, name, category, points, measure)
     values ($1, $2, 'General', $3, $4) returning id`,
    [team.school_id, `Drill ${uniq()}`, points, measure]);
  return row.id;
}

export async function makeSession(owner: pg.Client, team: Team, drillId: string): Promise<string> {
  const row = await one(owner,
    `insert into public.matrix_sessions (team_id, drill_id, occurred_on) values ($1, $2, current_date) returning id`,
    [team.id, drillId]);
  return row.id;
}

export async function addResult(owner: pg.Client, sessionId: string, playerId: string, r: {
  attendance?: string; rawValue?: number | null; outcome?: string | null;
  role?: string | null; goalsFor?: number | null; goalsAgainst?: number | null;
}): Promise<void> {
  await owner.query(
    `insert into public.matrix_session_results
       (session_id, player_id, attendance, raw_value, outcome, role, goals_for, goals_against)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [sessionId, playerId, r.attendance ?? 'present', r.rawValue ?? null, r.outcome ?? null,
     r.role ?? null, r.goalsFor ?? null, r.goalsAgainst ?? null]);
}

export async function addBand(owner: pg.Client, drillId: string, team: Team, b: {
  role: string; kind: string; threshold: number; factor: number;
}): Promise<void> {
  await owner.query(
    `insert into public.drill_goal_bands (drill_id, team_id, role, kind, threshold, factor)
     values ($1, $2, $3, $4, $5, $6)`,
    [drillId, team.id, b.role, b.kind, b.threshold, b.factor]);
}

/** Every scored line for one player on one drill, numbers as numbers. */
export async function pointsFor(c: pg.Client, drillId: string, playerId: string) {
  const { rows } = await c.query(
    `select kind, raw_value, earned, available, role, goals_for, goals_against, base_factor, bonus_factor
       from public.matrix_exercise_points
      where drill_id = $1 and player_id = $2
      order by kind`, [drillId, playerId]);
  const num = (v: any) => (v === null || v === undefined ? null : Number(v));
  return rows.map(r => ({
    kind: r.kind, role: r.role,
    raw_value: num(r.raw_value), earned: num(r.earned), available: num(r.available),
    goals_for: num(r.goals_for), goals_against: num(r.goals_against),
    base_factor: num(r.base_factor), bonus_factor: num(r.bonus_factor)
  }));
}

export { makeTeam, makeRosterEntry };
```

- [ ] **Step 3: Write the failing database tests**

`src/data/testdb/goals-by-role.test.ts`:

```ts
/**
 * 0037 — Goals by role, scored by Postgres and saved through one function.
 *
 * Scoring questions read the view on the owner connection. Every question
 * about who may save standards runs on an `authenticated` connection with the
 * caller's id as the JWT subject: the superuser harness would pass them all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb } from './harness';
import { buildAccountsDb, makeCoach, makeAdmin, type AccountsDb } from './accounts-db';
import {
  makeTeam, makeRosterEntry, makeDrill, makeSession, addResult, addBand, pointsFor
} from './goals-by-role-fixtures';
import { ROLE_GOAL_CASES } from '../../domain/role-goal-cases';

const available = await hasTestDb();

describe.skipIf(!available)('0037: Goals by role', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  describe('scoring agrees with the shared cases', () => {
    it.each(ROLE_GOAL_CASES)('$name', async (c) => {
      const team = await makeTeam(db.owner);
      const drill = await makeDrill(db.owner, team, 'role_goals', 1);
      for (const b of c.bands) await addBand(db.owner, drill, team, b);
      const player = await makeRosterEntry(db.owner, team);
      const session = await makeSession(db.owner, team, drill);
      await addResult(db.owner, session, player, { role: c.role, goalsFor: c.scored, goalsAgainst: c.conceded });

      const lines = await pointsFor(db.owner, drill, player);
      if (!c.expected.hasStandards) {
        expect(lines).toEqual([]);
        return;
      }
      expect(lines).toEqual([{
        kind: 'role_goals', role: c.role,
        raw_value: c.scored - c.conceded, earned: c.expected.total, available: 1,
        goals_for: c.scored, goals_against: c.conceded,
        base_factor: c.expected.base, bonus_factor: c.expected.bonus
      }]);
    }, 30_000);
  });

  it('multiplies the drill weight', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team, 'role_goals', 3);
    await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 });
    await addBand(db.owner, drill, team, { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 });
    const player = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, player, { role: 'attack', goalsFor: 3, goalsAgainst: 1 });

    const [line] = await pointsFor(db.owner, drill, player);
    expect(line.earned).toBeCloseTo(1.8, 6);
    expect(line.available).toBe(3);
  });

  it('leaves out a role with no base bands while another role in the session still scores', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team);
    await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 0, factor: 1 });
    const attacker = await makeRosterEntry(db.owner, team);
    const defender = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, attacker, { role: 'attack', goalsFor: 2, goalsAgainst: 1 });
    await addResult(db.owner, session, defender, { role: 'defend', goalsFor: 0, goalsAgainst: 0 });

    expect((await pointsFor(db.owner, drill, attacker)).map(l => l.kind)).toEqual(['role_goals']);
    expect(await pointsFor(db.owner, drill, defender)).toEqual([]);
  });

  it('does not score a present result with no role or no score', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team);
    await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 0, factor: 1 });
    const noRole = await makeRosterEntry(db.owner, team);
    const noScore = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, noRole, { goalsFor: 2, goalsAgainst: 1 });
    await addResult(db.owner, session, noScore, { role: 'attack' });

    expect(await pointsFor(db.owner, drill, noRole)).toEqual([]);
    expect(await pointsFor(db.owner, drill, noScore)).toEqual([]);
  });

  it('charges a no-show and a player not entered 0 of the weight when the squad has base bands', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team, 'role_goals', 2);
    await addBand(db.owner, drill, team, { role: 'defend', kind: 'base', threshold: 0, factor: 1 });
    const noShow = await makeRosterEntry(db.owner, team);
    const notEntered = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, noShow, { attendance: 'unexcused' });

    expect(await pointsFor(db.owner, drill, noShow)).toMatchObject([{ kind: 'absent', earned: 0, available: 2 }]);
    expect(await pointsFor(db.owner, drill, notEntered)).toMatchObject([{ kind: 'not_entered', earned: 0, available: 2 }]);
  });

  it('charges nobody when the squad has no base bands for any role of the drill', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team);
    await addBand(db.owner, drill, team, { role: 'attack', kind: 'bonus', threshold: 0, factor: 0.2 });
    const noShow = await makeRosterEntry(db.owner, team);
    const notEntered = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, noShow, { attendance: 'unexcused' });

    expect(await pointsFor(db.owner, drill, noShow)).toEqual([]);
    expect(await pointsFor(db.owner, drill, notEntered)).toEqual([]);
  });

  it("does not count another squad's bands", async () => {
    const team = await makeTeam(db.owner);
    const other = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team);
    await addBand(db.owner, drill, other, { role: 'attack', kind: 'base', threshold: 0, factor: 1 });
    const player = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, player, { role: 'attack', goalsFor: 2, goalsAgainst: 0 });

    expect(await pointsFor(db.owner, drill, player)).toEqual([]);
  });

  describe('save_goal_bands', () => {
    const call = (c: any, drill: string, team: string, role: string, bands: any) =>
      c.query(`select public.save_goal_bands($1, $2, $3, $4::jsonb)`, [drill, team, role, JSON.stringify(bands)]);

    const bandsOf = async (c: any, drill: string, team: string) =>
      (await c.query(
        `select role, kind, threshold, factor::float8 as factor from public.drill_goal_bands
          where drill_id = $1 and team_id = $2 order by role, kind, threshold`, [drill, team])).rows;

    it("replaces one role's bands and leaves the other roles alone", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 });
      await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 3, factor: 0.8 });
      await addBand(db.owner, drill, team, { role: 'defend', kind: 'base', threshold: 0, factor: 0.6 });

      await db.asUser(coach, async (c) => {
        await call(c, drill, team.id, 'attack', [
          { kind: 'base', threshold: 2, factor: 0.7 },
          { kind: 'bonus', threshold: 4, factor: 0.3 }
        ]);
        expect(await bandsOf(c, drill, team.id)).toEqual([
          { role: 'attack', kind: 'base', threshold: 2, factor: 0.7 },
          { role: 'attack', kind: 'bonus', threshold: 4, factor: 0.3 },
          { role: 'defend', kind: 'base', threshold: 0, factor: 0.6 }
        ]);
      });
    });

    it('clears a role when sent an empty list', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await addBand(db.owner, drill, team, { role: 'keeper', kind: 'base', threshold: 0, factor: 1 });
      await db.asUser(coach, async (c) => {
        await call(c, drill, team.id, 'keeper', []);
        expect(await bandsOf(c, drill, team.id)).toEqual([]);
      });
    });

    it('lets an admin set any squad\'s standards', async () => {
      const team = await makeTeam(db.owner);
      const admin = await makeAdmin(db.owner);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(admin, async (c) => {
        await call(c, drill, team.id, 'defend', [{ kind: 'base', threshold: 0, factor: 1 }]);
        expect(await bandsOf(c, drill, team.id)).toHaveLength(1);
      });
    });

    it('refuses a best base plus best bonus over 100%', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'attack', [
          { kind: 'base', threshold: 1, factor: 0.7 },
          { kind: 'base', threshold: 0, factor: 0.2 },
          { kind: 'bonus', threshold: 3, factor: 0.4 }
        ])).rejects.toThrow('The top goal-difference band (70%) and the top bonus band (40%) add up to more than 100% of the weight');
      });
    });

    it('accepts exactly 100%', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await call(c, drill, team.id, 'attack', [
          { kind: 'base', threshold: 1, factor: 0.8 },
          { kind: 'bonus', threshold: 3, factor: 0.2 }
        ]);
        expect(await bandsOf(c, drill, team.id)).toHaveLength(2);
      });
    });

    it('refuses two bands in one list at the same threshold', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'attack', [
          { kind: 'base', threshold: 1, factor: 0.5 },
          { kind: 'base', threshold: 1, factor: 0.3 }
        ])).rejects.toThrow('Two goal-difference bands share the threshold 1');
      });
    });

    it('allows a base band and a bonus band at the same threshold', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await call(c, drill, team.id, 'defend', [
          { kind: 'base', threshold: 0, factor: 0.6 },
          { kind: 'bonus', threshold: 0, factor: 0.4 }
        ]);
        expect(await bandsOf(c, drill, team.id)).toHaveLength(2);
      });
    });

    it('refuses a percentage outside 0-100', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'attack', [{ kind: 'base', threshold: 1, factor: 1.5 }]))
          .rejects.toThrow('A percentage must be between 0 and 100 (found 150)');
      });
    });

    it('refuses a threshold that is not a whole number', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'attack', [{ kind: 'base', threshold: 1.5, factor: 0.5 }]))
          .rejects.toThrow('A threshold must be a whole number (found 1.5)');
        await expect(call(c, drill, team.id, 'attack', [{ kind: 'base', factor: 0.5 }]))
          .rejects.toThrow('A threshold must be a whole number (found nothing)');
      });
    });

    it('refuses a drill measured some other way', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team, 'win_loss');
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'attack', [{ kind: 'base', threshold: 0, factor: 1 }]))
          .rejects.toThrow('That exercise is not measured as Goals by role');
      });
    });

    it('refuses a role that is not attack, defend or keeper', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'midfield', []))
          .rejects.toThrow('Standards are set for Attack, Defence or Goalkeeper');
      });
    });

    it('refuses a coach of another squad', async () => {
      const mine = await makeTeam(db.owner);
      const theirs = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, mine);
      const drill = await makeDrill(db.owner, theirs);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, theirs.id, 'attack', [{ kind: 'base', threshold: 0, factor: 1 }]))
          .rejects.toThrow('Only a coach of this team can set its standards');
      });
    });

    it('refuses a signed-in caller with no profile at all', async () => {
      // current_profile_role() and is_team_coach() both return NULL for them;
      // a bare `if not is_team_coach(...)` would skip the raise and let them in.
      const team = await makeTeam(db.owner);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(randomUUID(), async (c) => {
        await expect(call(c, drill, team.id, 'attack', [{ kind: 'base', threshold: 0, factor: 1 }]))
          .rejects.toThrow('Only a coach of this team can set its standards');
      });
    });

    it('is not callable signed out', async () => {
      const team = await makeTeam(db.owner);
      const drill = await makeDrill(db.owner, team);
      await db.asAnon(async (c) => {
        await expect(call(c, drill, team.id, 'attack', [])).rejects.toThrow(/permission denied/);
      });
    });

    it('is the only way in: a coach cannot insert a band directly', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(c.query(
          `insert into public.drill_goal_bands (drill_id, team_id, role, kind, threshold, factor)
           values ($1, $2, 'attack', 'base', 0, 1)`, [drill, team.id]))
          .rejects.toThrow(/permission denied|row-level security/);
      });
    });

    it('lets anyone read the standards', async () => {
      const team = await makeTeam(db.owner);
      const drill = await makeDrill(db.owner, team);
      await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 0, factor: 1 });
      await db.asAnon(async (c) => {
        expect(await bandsOf(c, drill, team.id)).toHaveLength(1);
      });
    });
  });
});
```

`src/data/testdb/migration-0037-goals-by-role.test.ts`:

```ts
/**
 * 0037 as a migration: it applies to the empty database the demo rebuild
 * starts from (buildAccountsDb runs every migration on one), it applies a
 * second time without error, and it leaves every existing measure's points
 * exactly as 0022's view scored them.
 *
 * Nothing here commits a role_goals drill: re-applying 0022 inside a rolled-back
 * transaction re-adds the five-measure constraint, which such a drill would break.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb } from './harness';
import { buildAccountsDb, one, type AccountsDb } from './accounts-db';
import { makeTeam, makeRosterEntry, makeDrill, makeSession, addResult } from './goals-by-role-fixtures';

const available = await hasTestDb();

const read = (file: string) => readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8')
  .replace(/^\s*(begin|commit)\s*;\s*$/gim, '');

/** 0022's columns only, so the comparison is about scores rather than new columns. */
const SCORED = `
  select team_id, player_id, drill_id, exercise, occurred_on, kind, opponent_id,
         raw_value::text, detail, attendance, weight::text, earned::text, available::text,
         w, dr, ls, exercise_count
    from public.matrix_exercise_points
   where team_id = $1
   order by player_id, drill_id, kind, opponent_id nulls first`;

describe.skipIf(!available)('0037 as a migration', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  it('applied to an empty database, with everything it adds in place', async () => {
    const c = db.owner;
    expect((await one(c, `select to_regclass('public.drill_goal_bands') as t`)).t).toBe('drill_goal_bands');
    expect((await one(c,
      `select to_regprocedure('public.save_goal_bands(uuid,uuid,text,jsonb)') is not null as ok`)).ok).toBe(true);
    const cols = (await c.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'matrix_session_results'
          and column_name in ('role', 'goals_for', 'goals_against') order by 1`)).rows.map(r => r.column_name);
    expect(cols).toEqual(['goals_against', 'goals_for', 'role']);
    const viewCols = (await c.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'matrix_exercise_points'
          and column_name in ('role', 'goals_for', 'goals_against', 'base_factor', 'bonus_factor')`)).rows;
    expect(viewCols).toHaveLength(5);
  });

  it('refuses a result role or score outside the allowed values', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const drill = await makeDrill(c, team, 'count_high');
      const player = await makeRosterEntry(c, team);
      const session = await makeSession(c, team, drill);
      await c.query('savepoint s');
      await expect(addResult(c, session, player, { role: 'midfield' }))
        .rejects.toThrow(/matrix_session_results_role_check/);
      await c.query('rollback to savepoint s');
      await expect(addResult(c, session, player, { goalsFor: 100 }))
        .rejects.toThrow(/matrix_session_results_goals_for_check/);
      await c.query('rollback to savepoint s');
      await expect(addResult(c, session, player, { goalsAgainst: -1 }))
        .rejects.toThrow(/matrix_session_results_goals_against_check/);
    } finally {
      await c.query('rollback');
    }
  });

  it('can be applied a second time, keeping stored standards', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const drill = await makeDrill(c, team, 'count_high');
      await c.query(`update public.drills_bank set measure = 'role_goals' where id = $1`, [drill]);
      await c.query(
        `insert into public.drill_goal_bands (drill_id, team_id, role, kind, threshold, factor)
         values ($1, $2, 'attack', 'base', 0, 1)`, [drill, team.id]);
      await c.query(read('0037_goals_by_role.sql'));
      expect((await one(c, `select count(*)::int as n from public.drill_goal_bands where drill_id = $1`, [drill])).n)
        .toBe(1);
    } finally {
      await c.query('rollback');
    }
  }, 60_000);

  it("leaves every existing measure's points exactly as 0022 scored them", async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const [a, b, gone] = [await makeRosterEntry(c, team), await makeRosterEntry(c, team), await makeRosterEntry(c, team)];

      const h2h = await makeDrill(c, team, 'head_to_head', 3);
      await c.query(
        `insert into public.matrix_logs (school_id, team_id, player_a_id, player_b_id, outcome, drill_id, occurred_on)
         values ($1, $2, $3, $4, 'a', $5, current_date), ($1, $2, $4, $3, 'draw', $5, current_date)`,
        [team.school_id, team.id, a, b, h2h]);

      const count = await makeDrill(c, team, 'count_high', 1.5);
      const s1 = await makeSession(c, team, count);
      await addResult(c, s1, a, { rawValue: 40 });
      await addResult(c, s1, b, { rawValue: 55 });
      await addResult(c, s1, gone, { attendance: 'unexcused' });

      const sprint = await makeDrill(c, team, 'time_low', 1);
      const s2 = await makeSession(c, team, sprint);
      await addResult(c, s2, a, { rawValue: 4.85 });
      await addResult(c, s2, b, { rawValue: 5.1 });

      const laps = await makeDrill(c, team, 'time_bands', 2);
      await c.query(
        `insert into public.drill_time_bands (drill_id, team_id, max_seconds, factor)
         values ($1, $2, 270, 1), ($1, $2, 290, 0.5)`, [laps, team.id]);
      const s3 = await makeSession(c, team, laps);
      await addResult(c, s3, a, { rawValue: 265 });
      await addResult(c, s3, b, { rawValue: 285 });

      const small = await makeDrill(c, team, 'win_loss', 2.5);
      const s4 = await makeSession(c, team, small);
      await addResult(c, s4, a, { outcome: 'win' });
      await addResult(c, s4, b, { outcome: 'draw' });
      // `gone` has no row in s2-s4: not_entered.

      const after = (await c.query(SCORED, [team.id])).rows;
      expect(after.length).toBeGreaterThan(10);

      await c.query(read('0022_time_band_scoring.sql'));
      const before = (await c.query(SCORED, [team.id])).rows;

      expect(after).toEqual(before);
    } finally {
      await c.query('rollback');
    }
  }, 60_000);
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/data/testdb/goals-by-role.test.ts src/data/testdb/migration-0037-goals-by-role.test.ts`
Expected: FAIL. `drill_goal_bands` does not exist and `save_goal_bands` is not found (or the insert into `matrix_session_results` fails on column `role`). If they are reported as **skipped**, no Postgres is answering. Stop and say so; do not continue as if they passed.

- [ ] **Step 5: Write the migration**

`supabase/migrations/0037_goals_by_role.sql`. The view body is 0022's, restated with every existing CTE and union branch **unchanged**, except for four things:
- one new CTE (`role_scored`);
- one new union branch;
- five null columns added to every existing branch;
- the `role_goals` exclusion in `absent` and `not_entered`.

```sql
-- 0037: Goals by role -- a sixth Matrix measure, scored per player against
-- per-squad, per-role standards on the score from their side of the game.
--
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT. The client selects the new
-- view columns, and PostgREST answers 42703 for a column that is not there,
-- which would empty the Ratings board. Applying early changes nothing for the
-- deployed app: no existing drill uses the new measure, and every existing
-- column of both views is unchanged.
--
-- Spec: docs/superpowers/specs/2026-09-14-goals-by-role-design.md
--
-- ── What is scored ────────────────────────────────────────────────────────
--
-- A player records one score for the drill from their own side: 3-1 is scored
-- 3, gave up 1. Their role for that session -- attack, defend or keeper -- is
-- stored with the result; the app pre-fills it from the roster position number
-- (src/domain/position.ts) and the coach may change it for the day.
--
--   base   the highest factor among the role's BASE bands whose threshold the
--          goal difference (scored - given up) meets or beats
--   bonus  the highest factor among the role's BONUS bands the player meets:
--          attack on goals scored (at least), defend and keeper on goals given
--          up (at most). Independent of the base -- an attacker who lost 6-7
--          still earns the bonus for scoring six.
--   earned weight x least(1, base + bonus)
--
-- "Highest factor met" rather than "tightest threshold met", so a band list
-- entered out of order still scores the way it reads.
--
-- A role with no base bands for the squad is LEFT OUT, as a squad with no time
-- bands is: scoring it 0 would drag players down because standards were not
-- set, with nothing on screen to say why. A no-show, or a rostered player
-- nobody entered, is charged 0 of the weight -- unless the squad has no base
-- bands for ANY role of the drill, when they are left out too. A player who was
-- not there has no role for the session, so the per-role rule cannot be applied
-- to them; the squad-level one keeps "unset standards cost nobody".
--
-- ── Why writes go through a function ──────────────────────────────────────
--
-- The 100% rule -- a role's best base band plus its best bonus band may not
-- exceed the whole weight -- spans rows, which a check constraint cannot see.
-- drill_goal_bands therefore has NO write policy, and save_goal_bands is the
-- only way in. A refused save raises before anything is deleted, so the old
-- standards stay in place.
--
-- ── Safe to apply twice ───────────────────────────────────────────────────
--
-- Constraints are dropped before they are added, the table and columns use
-- IF NOT EXISTS, the function is CREATE OR REPLACE and the views are rebuilt.

begin;

set role postgres;

-- ─── The new measure ───────────────────────────────────────────────────────

alter table public.drills_bank drop constraint if exists drills_bank_measure_check;
alter table public.drills_bank add constraint drills_bank_measure_check
  check (measure in ('head_to_head', 'win_loss', 'count_high', 'time_low', 'time_bands', 'role_goals'));

-- ─── The result ────────────────────────────────────────────────────────────
--
-- Null for every other measure. A database check cannot know a result's
-- measure (it lives on the drill), so "a present Goals-by-role result has all
-- three" is enforced by saveMatrixSession and the sheet. A present row missing
-- any of them is simply not scored -- which is also what happens to results
-- recorded before a drill was switched to this measure.

alter table public.matrix_session_results
  add column if not exists role          text,
  add column if not exists goals_for     integer,
  add column if not exists goals_against integer;

alter table public.matrix_session_results drop constraint if exists matrix_session_results_role_check;
alter table public.matrix_session_results add constraint matrix_session_results_role_check
  check (role is null or role in ('attack', 'defend', 'keeper'));

alter table public.matrix_session_results drop constraint if exists matrix_session_results_goals_for_check;
alter table public.matrix_session_results add constraint matrix_session_results_goals_for_check
  check (goals_for is null or goals_for between 0 and 99);

alter table public.matrix_session_results drop constraint if exists matrix_session_results_goals_against_check;
alter table public.matrix_session_results add constraint matrix_session_results_goals_against_check
  check (goals_against is null or goals_against between 0 and 99);

-- ─── The standards ─────────────────────────────────────────────────────────
--
-- Per squad, per drill, per role, per kind. Varsity and U14 can hold the same
-- drill to different standards, for the reason 0022 gives for time bands.

create table if not exists public.drill_goal_bands (
  id         uuid primary key default gen_random_uuid(),
  drill_id   uuid not null references public.drills_bank(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  role       text not null check (role in ('attack', 'defend', 'keeper')),
  kind       text not null check (kind in ('base', 'bonus')),
  threshold  integer not null,
  factor     numeric(4,3) not null check (factor >= 0 and factor <= 1),
  created_at timestamptz not null default now(),
  unique (drill_id, team_id, role, kind, threshold)
);

alter table public.drill_goal_bands enable row level security;

drop policy if exists "drill_goal_bands_select" on public.drill_goal_bands;
create policy "drill_goal_bands_select" on public.drill_goal_bands
  for select using (true);

-- Read for everyone, like drill_time_bands. No insert, update or delete policy
-- and no write grant: see "Why writes go through a function" above.
revoke all on table public.drill_goal_bands from anon, authenticated;
grant select on table public.drill_goal_bands to anon, authenticated;

-- ─── Saving standards ──────────────────────────────────────────────────────
--
-- Replaces one role's bands for one squad on one drill. p_bands is a JSON
-- array of { "kind": "base" | "bonus", "threshold": int, "factor": 0..1 }.
-- Every refusal is a sentence the app shows as it is.

create or replace function public.save_goal_bands(
  p_drill_id uuid, p_team_id uuid, p_role text, p_bands jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_measure   text;
  v_band      jsonb;
  v_factor    numeric;
  v_dup       record;
  v_max_base  numeric;
  v_max_bonus numeric;
begin
  -- Fail closed. A signed-in caller with no profile makes is_team_coach()
  -- return NULL, and a NULL condition skips the raise instead of tripping it.
  -- is_team_coach() is true for an admin on any team.
  if not coalesce(public.is_team_coach(p_team_id), false) then
    raise exception 'Only a coach of this team can set its standards.';
  end if;

  if coalesce(p_role, '') not in ('attack', 'defend', 'keeper') then
    raise exception 'Standards are set for Attack, Defence or Goalkeeper.';
  end if;

  select d.measure into v_measure
    from public.drills_bank d
   where d.id = p_drill_id and not coalesce(d.is_deleted, false);
  if not found then
    raise exception 'That exercise does not exist.';
  end if;
  if v_measure is distinct from 'role_goals' then
    raise exception 'That exercise is not measured as Goals by role. Save its measure first.';
  end if;

  if p_bands is null or jsonb_typeof(p_bands) <> 'array' then
    raise exception 'The standards must be sent as a list.';
  end if;

  for v_band in select value from jsonb_array_elements(p_bands) loop
    if coalesce(v_band->>'kind', '') not in ('base', 'bonus') then
      raise exception 'Each standard is a goal-difference band or a bonus band.';
    end if;
    -- coalesce: a missing key gives jsonb_typeof NULL, and NULL <> 'number'
    -- is NULL, which would skip the raise.
    if coalesce(jsonb_typeof(v_band->'threshold'), '') <> 'number'
       or (v_band->>'threshold') !~ '^-?[0-9]{1,4}$' then
      raise exception 'A threshold must be a whole number (found %).', coalesce(v_band->>'threshold', 'nothing');
    end if;
    if coalesce(jsonb_typeof(v_band->'factor'), '') <> 'number' then
      raise exception 'Each standard needs a percentage.';
    end if;
    v_factor := (v_band->>'factor')::numeric;
    if v_factor < 0 or v_factor > 1 then
      raise exception '%', format('A percentage must be between 0 and 100 (found %s).', (v_factor * 100)::float8);
    end if;
  end loop;

  select e->>'kind' as kind, (e->>'threshold')::integer as threshold
    into v_dup
    from jsonb_array_elements(p_bands) e
   group by 1, 2
  having count(*) > 1
   limit 1;
  if found then
    raise exception '%', format(
      'Two %s bands share the threshold %s. Two bands at one threshold cannot both apply.',
      case v_dup.kind when 'base' then 'goal-difference' else 'bonus' end, v_dup.threshold);
  end if;

  -- Checked on the values as they will be stored (numeric(4,3)).
  select coalesce(max(round((e->>'factor')::numeric, 3)) filter (where e->>'kind' = 'base'), 0),
         coalesce(max(round((e->>'factor')::numeric, 3)) filter (where e->>'kind' = 'bonus'), 0)
    into v_max_base, v_max_bonus
    from jsonb_array_elements(p_bands) e;
  if v_max_base + v_max_bonus > 1 then
    raise exception '%', format(
      'The top goal-difference band (%s%%) and the top bonus band (%s%%) add up to more than 100%% of the weight. Lower one of them.',
      (v_max_base * 100)::float8, (v_max_bonus * 100)::float8);
  end if;

  delete from public.drill_goal_bands
   where drill_id = p_drill_id and team_id = p_team_id and role = p_role;

  insert into public.drill_goal_bands (drill_id, team_id, role, kind, threshold, factor)
  select p_drill_id, p_team_id, p_role, e->>'kind', (e->>'threshold')::integer,
         round((e->>'factor')::numeric, 3)
    from jsonb_array_elements(p_bands) e;
end;
$$;

revoke all on function public.save_goal_bands(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_goal_bands(uuid, uuid, text, jsonb) to authenticated;
```

Then the views, still in the same file, before `commit`. Copy from `supabase/migrations/0022_time_band_scoring.sql` the block that starts at `drop view if exists public.matrix_standings;` and runs to `grant select on public.matrix_standings to anon, authenticated;`. Keep its comments, then make exactly these edits:

1. Above the drops, replace 0022's "Rebuilt from 0011" comment with: `-- Rebuilt from 0022 with one CTE and one branch added, five nullable columns on every branch, and the role_goals exclusion in absent and not_entered. Everything else is unchanged.`
2. Add this CTE between `banded` and `win_loss`:

```sql
role_scored as (
  -- Goals by role. See the header. A role with no base bands for the squad is
  -- excluded by the EXISTS; bonus bands alone are not a standard.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on,
         r.role, r.goals_for, r.goals_against,
         coalesce((
           select max(b.factor)
             from public.drill_goal_bands b
            where b.drill_id = s.drill_id and b.team_id = s.team_id
              and b.role = r.role and b.kind = 'base'
              and r.goals_for - r.goals_against >= b.threshold
         ), 0)::numeric as base_factor,
         coalesce((
           select max(b.factor)
             from public.drill_goal_bands b
            where b.drill_id = s.drill_id and b.team_id = s.team_id
              and b.role = r.role and b.kind = 'bonus'
              and case when r.role = 'attack' then r.goals_for >= b.threshold
                       else r.goals_against <= b.threshold end
         ), 0)::numeric as bonus_factor
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure = 'role_goals'
     and r.role is not null
     and r.goals_for is not null
     and r.goals_against is not null
     and exists (
       select 1 from public.drill_goal_bands b
        where b.drill_id = s.drill_id and b.team_id = s.team_id
          and b.role = r.role and b.kind = 'base'
     )
),
```

3. In **both** `absent` (after `and r.attendance = 'unexcused'`) and `not_entered` (after its `not exists (...)`), append:

```sql
     -- A role_goals drill charges nobody while the squad has no base bands.
     and (d.measure is distinct from 'role_goals' or exists (
       select 1 from public.drill_goal_bands b
        where b.drill_id = s.drill_id and b.team_id = s.team_id and b.kind = 'base'
     ))
```

4. In the final `select … from h2h` branch, after `1 as exercise_count`, add:

```sql
       , null::text as role, null::integer as goals_for, null::integer as goals_against,
       null::numeric as base_factor, null::numeric as bonus_factor
```

   Add the same five columns, without aliases, to the end of the `ranked`, `banded`, `win_loss`, `absent` and `not_entered` branches:

```sql
       , null::text, null::integer, null::integer, null::numeric, null::numeric
```

5. Add this branch after the `banded` branch (before `win_loss`):

```sql
union all
-- least(1, ...) is defence in depth: save_goal_bands already refuses a pair of
-- bands over 100%, but a row written some other way must not pay out more
-- than the exercise is worth.
select team_id, player_id, drill_id, exercise, occurred_on,
       'role_goals'::text, null::uuid, (goals_for - goals_against)::numeric, null::text, 'present'::text,
       weight, weight * least(1, base_factor + bonus_factor), weight, 0, 0, 0, 1,
       role, goals_for, goals_against, base_factor, bonus_factor
  from role_scored
```

6. `matrix_standings` and both `grant select` lines stay exactly as in 0022.

End the file with:

```sql
-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  n integer;
begin
  if to_regclass('public.drill_goal_bands') is null then
    raise exception 'drill_goal_bands was not created';
  end if;
  if to_regprocedure('public.save_goal_bands(uuid,uuid,text,jsonb)') is null then
    raise exception 'save_goal_bands was not created';
  end if;
  -- Dropping the views above and failing to rebuild them would leave the
  -- standings page empty with no error anywhere.
  if to_regclass('public.matrix_exercise_points') is null then
    raise exception 'matrix_exercise_points was not rebuilt';
  end if;
  if to_regclass('public.matrix_standings') is null then
    raise exception 'matrix_standings was not rebuilt';
  end if;

  select count(*) into n from public.matrix_standings;
  raise notice 'Goals by role installed. matrix_standings returns % row(s).', n;
end $$;

commit;

-- Verify:
--   select column_name from information_schema.columns
--    where table_name = 'matrix_exercise_points'
--      and column_name in ('role','goals_for','goals_against','base_factor','bonus_factor');  -- 5 rows
--   select to_regprocedure('public.save_goal_bands(uuid,uuid,text,jsonb)');                 -- not null
--   notify pgrst, 'reload schema';
--
-- Rollback: docs/runbooks/2026-09-14-accounts-setup-runbook.md, "Undoing 0037".
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/data/testdb/goals-by-role.test.ts src/data/testdb/migration-0037-goals-by-role.test.ts`
Expected: PASS, with none skipped. The "leaves every existing measure's points exactly as 0022 scored them" test is the proof that step 5's copy changed nothing else. If it fails, diff the view text against 0022's, not the test.

Then run the other suites that build from the migrations. They also prove the file applies to an empty database:
Run: `npx vitest run src/data/testdb/demo-schema-steps.test.ts src/data/testdb/demo-rebuild.test.ts src/data/testdb/demo-seed.test.ts src/data/testdb/account-rpc.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0037_goals_by_role.sql src/domain/role-goal-cases.ts src/data/testdb/goals-by-role-fixtures.ts src/data/testdb/goals-by-role.test.ts src/data/testdb/migration-0037-goals-by-role.test.ts
git commit -m "feat: score Goals by role in Postgres, with standards saved through one function" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The browser's copy of the rule, the score parser and the editor drafts

**Files:**
- Create: `src/domain/goal-score.ts`, `src/domain/goal-score.test.ts`
- Create: `src/domain/role-goal-score.ts`, `src/domain/role-goal-score.test.ts`
- Create: `src/domain/goal-bands-draft.ts`, `src/domain/goal-bands-draft.test.ts`

**Interfaces:**
- Consumes: `ROLE_GOAL_CASES` (Task 1); `PositionRole`, `roleLabel` from `src/domain/position.ts`.
- Produces:
  - `goal-score.ts`:
    - `interface GoalScore { scored: number; conceded: number }`
    - `parseGoalScore(text: unknown): GoalScore | null`
    - `formatGoalScore(score: GoalScore | null): string`
    - `formatGoalDifference(diff: number): string`
  - `role-goal-score.ts`:
    - `interface GoalBand { role: string; kind: string; threshold: number | string; factor: number | string }`
    - `interface RoleGoalFactor { base: number; bonus: number; total: number; hasStandards: boolean }`
    - `roleGoalFactor(score: GoalScore | null, role: string | null | undefined, bands: GoalBand[]): RoleGoalFactor`
    - `percentLabel(factor: number): string`
    - `roleGoalFeedback(raw: string, role: string | null | undefined, bands: GoalBand[], weight: number | string | null | undefined): { text: string; tone: 'good' | 'none' | 'bad' | 'empty' }`
    - `goalBandExample(role: PositionRole, bands: GoalBand[]): string`
  - `goal-bands-draft.ts`:
    - `interface GoalBandDraft { threshold: string; percent: string }`
    - `interface GoalRoleDrafts { base: GoalBandDraft[]; bonus: GoalBandDraft[] }`
    - `type GoalBandDrafts = Record<PositionRole, GoalRoleDrafts>`
    - `GOAL_ROLES: PositionRole[]` (`['attack', 'defend', 'keeper']`)
    - `emptyGoalDrafts(): GoalBandDrafts`
    - `goalDraftsFromBands(rows: any[]): GoalBandDrafts`
    - `draftsToGoalBands(drafts: GoalRoleDrafts): { ok: true; bands: { kind: 'base' | 'bonus'; threshold: number; factor: number }[] } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing tests**

`src/domain/goal-score.test.ts`:

```ts
/**
 * A Goals-by-role score is typed in one box, from the player's side.
 *
 * Refusing is the point: "3" could be three scored or three given up, and a
 * guess would score a defender as an attacker's result without anyone seeing.
 */
import { describe, it, expect } from 'vitest';
import { parseGoalScore, formatGoalScore, formatGoalDifference } from './goal-score';

describe('parseGoalScore', () => {
  it.each([
    ['3-1', 3, 1], ['3:1', 3, 1], ['3 1', 3, 1], [' 3 - 1 ', 3, 1],
    ['0-0', 0, 0], ['12-11', 12, 11], ['99-0', 99, 0], ['3  1', 3, 1]
  ])('reads %j as scored %i, gave up %i', (text, scored, conceded) => {
    expect(parseGoalScore(text)).toEqual({ scored, conceded });
  });

  it.each(['', '3', '3-', '-1', 'a-b', '3-1-2', '100-0', '3.5-1', null, undefined])(
    'refuses %j', (text) => {
      expect(parseGoalScore(text)).toBeNull();
    });
});

describe('formatting', () => {
  it('writes a score the way it is typed', () => {
    expect(formatGoalScore({ scored: 3, conceded: 1 })).toBe('3-1');
    expect(formatGoalScore(null)).toBe('');
  });

  it('signs a positive goal difference and leaves zero and negatives alone', () => {
    expect(formatGoalDifference(2)).toBe('+2');
    expect(formatGoalDifference(0)).toBe('0');
    expect(formatGoalDifference(-1)).toBe('-1');
  });
});
```

`src/domain/role-goal-score.test.ts`:

```ts
/**
 * What a Goals-by-role score earns, in the browser.
 *
 * A second implementation of 0037's `role_scored` CTE, kept so the sheet can
 * show the points as a score is typed. The agreement block runs the SAME cases
 * the database test runs (role-goal-cases.ts): the two cannot drift silently.
 */
import { describe, it, expect } from 'vitest';
import { roleGoalFactor, roleGoalFeedback, goalBandExample, percentLabel } from './role-goal-score';
import { ROLE_GOAL_CASES } from './role-goal-cases';

const ATTACK = [
  { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 },
  { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 }
];

describe('agreement with the database (shared cases)', () => {
  it.each(ROLE_GOAL_CASES)('$name', (c) => {
    const got = roleGoalFactor({ scored: c.scored, conceded: c.conceded }, c.role, c.bands);
    expect(got.hasStandards).toBe(c.expected.hasStandards);
    expect(got.base).toBeCloseTo(c.expected.base, 9);
    expect(got.bonus).toBeCloseTo(c.expected.bonus, 9);
    expect(got.total).toBeCloseTo(c.expected.total, 9);
  });
});

describe('roleGoalFactor', () => {
  it('reads thresholds and factors held as strings', () => {
    const bands = [{ role: 'attack', kind: 'base', threshold: '1', factor: '0.500' }];
    expect(roleGoalFactor({ scored: 2, conceded: 1 }, 'attack', bands).base).toBe(0.5);
  });

  it('earns nothing, but still reports the standards, for no score', () => {
    expect(roleGoalFactor(null, 'attack', ATTACK)).toEqual({ base: 0, bonus: 0, total: 0, hasStandards: true });
  });

  it('has no standards without a role', () => {
    expect(roleGoalFactor({ scored: 3, conceded: 1 }, null, ATTACK).hasStandards).toBe(false);
  });

  it('does not print floating-point noise in the total', () => {
    const bands = [
      { role: 'defend', kind: 'base', threshold: 0, factor: 0.7 },
      { role: 'defend', kind: 'bonus', threshold: 0, factor: 0.1 }
    ];
    expect(roleGoalFactor({ scored: 0, conceded: 0 }, 'defend', bands).total).toBe(0.8);
  });
});

describe('percentLabel', () => {
  it('writes a factor as a percentage without spurious places', () => {
    expect(percentLabel(0.5)).toBe('50%');
    expect(percentLabel(0.125)).toBe('12.5%');
    expect(percentLabel(0)).toBe('0%');
  });
});

describe('roleGoalFeedback', () => {
  it('says nothing for an empty box', () => {
    expect(roleGoalFeedback('', 'attack', ATTACK, 3)).toEqual({ text: '', tone: 'empty' });
  });

  it('shows base, bonus, total and points', () => {
    expect(roleGoalFeedback('3-1', 'attack', ATTACK, 3))
      .toEqual({ text: '50% + 10% = 60% · 1.8 pts', tone: 'good' });
  });

  it('names an unreadable score before the save does', () => {
    expect(roleGoalFeedback('3', 'attack', ATTACK, 3)).toEqual({ text: 'score? e.g. 3-1', tone: 'bad' });
  });

  it('asks for a role when there is none', () => {
    expect(roleGoalFeedback('3-1', '', ATTACK, 3)).toEqual({ text: 'choose a role', tone: 'bad' });
  });

  it('says when the squad has no standards for the role', () => {
    expect(roleGoalFeedback('1-0', 'keeper', ATTACK, 3))
      .toEqual({ text: 'no standards for Goalkeeper', tone: 'none' });
  });

  it('distinguishes met nothing from mistyped', () => {
    expect(roleGoalFeedback('0-4', 'attack', ATTACK, 3))
      .toEqual({ text: '0% + 0% = 0% · 0 pts', tone: 'none' });
  });
});

describe('goalBandExample', () => {
  it("works an attacker's example from the tab's own top bands", () => {
    const bands = [
      { role: 'attack', kind: 'base', threshold: 2, factor: 0.5 },
      { role: 'attack', kind: 'base', threshold: 0, factor: 0.2 },
      { role: 'attack', kind: 'bonus', threshold: 5, factor: 0.1 }
    ];
    expect(goalBandExample('attack', bands)).toBe('+2 with 5 scored → 50% + 10% = 60%');
  });

  it("works a defender's example on goals given up", () => {
    const bands = [
      { role: 'defend', kind: 'base', threshold: 0, factor: 0.6 },
      { role: 'defend', kind: 'bonus', threshold: 1, factor: 0.2 }
    ];
    expect(goalBandExample('defend', bands)).toBe('0 with 1 given up → 60% + 20% = 80%');
  });

  it('asks for a goal-difference band when a role has none', () => {
    expect(goalBandExample('keeper', ATTACK)).toBe('Add a goal-difference band to score Goalkeeper.');
  });
});
```

`src/domain/goal-bands-draft.test.ts`:

```ts
/**
 * The standards editor's drafts, turned into what save_goal_bands takes.
 *
 * Every refusal here is also made by the database; checking first lets the
 * editor say what is wrong beside the boxes, before a round trip.
 */
import { describe, it, expect } from 'vitest';
import { draftsToGoalBands, goalDraftsFromBands, emptyGoalDrafts, GOAL_ROLES } from './goal-bands-draft';

const d = (threshold: string, percent: string) => ({ threshold, percent });

describe('draftsToGoalBands', () => {
  it('turns percentages into factors and text into whole numbers', () => {
    expect(draftsToGoalBands({ base: [d('2', '50'), d(' -1 ', '12.5')], bonus: [d('5', '10')] })).toEqual({
      ok: true,
      bands: [
        { kind: 'base', threshold: 2, factor: 0.5 },
        { kind: 'base', threshold: -1, factor: 0.125 },
        { kind: 'bonus', threshold: 5, factor: 0.1 }
      ]
    });
  });

  it('skips an untouched blank row', () => {
    expect(draftsToGoalBands({ base: [d('', ''), d('1', '50')], bonus: [d('  ', '')] }))
      .toEqual({ ok: true, bands: [{ kind: 'base', threshold: 1, factor: 0.5 }] });
  });

  it('allows a role with no bands at all', () => {
    expect(draftsToGoalBands({ base: [], bonus: [] })).toEqual({ ok: true, bands: [] });
  });

  it('refuses a threshold that is not a whole number', () => {
    expect(draftsToGoalBands({ base: [d('1.5', '50')], bonus: [] })).toEqual({
      ok: false, error: '"1.5" is not a whole number. A threshold is a count of goals, like 2 or -1.'
    });
  });

  it('refuses a percentage outside 0-100, or missing', () => {
    expect(draftsToGoalBands({ base: [d('1', '150')], bonus: [] })).toEqual({
      ok: false, error: 'A percentage must be between 0 and 100 (found "150").'
    });
    expect(draftsToGoalBands({ base: [d('1', '')], bonus: [] })).toEqual({
      ok: false, error: 'A percentage must be between 0 and 100 (found "").'
    });
  });

  it('refuses two bands in one list at one threshold', () => {
    expect(draftsToGoalBands({ base: [d('1', '50'), d('1', '30')], bonus: [] })).toEqual({
      ok: false, error: 'Two goal-difference bands share the threshold 1. Two bands at one threshold cannot both apply.'
    });
  });

  it('refuses a top base plus top bonus over 100%', () => {
    expect(draftsToGoalBands({ base: [d('1', '70'), d('0', '20')], bonus: [d('3', '40')] })).toEqual({
      ok: false,
      error: 'The top goal-difference band (70%) and the top bonus band (40%) add up to more than 100% of the weight. Lower one of them.'
    });
  });

  it('accepts exactly 100%', () => {
    expect(draftsToGoalBands({ base: [d('1', '80')], bonus: [d('3', '20')] }).ok).toBe(true);
  });
});

describe('goalDraftsFromBands', () => {
  it('splits stored bands by role and kind, as percentages, highest first', () => {
    const drafts = goalDraftsFromBands([
      { role: 'attack', kind: 'base', threshold: 0, factor: '0.250' },
      { role: 'attack', kind: 'base', threshold: 2, factor: 0.5 },
      { role: 'defend', kind: 'bonus', threshold: 0, factor: 0.4 }
    ]);
    expect(drafts.attack.base).toEqual([d('2', '50'), d('0', '25')]);
    expect(drafts.defend.bonus).toEqual([d('0', '40')]);
    expect(drafts.keeper).toEqual({ base: [], bonus: [] });
  });

  it('starts every role empty', () => {
    expect(emptyGoalDrafts()).toEqual({
      attack: { base: [], bonus: [] }, defend: { base: [], bonus: [] }, keeper: { base: [], bonus: [] }
    });
    expect(GOAL_ROLES).toEqual(['attack', 'defend', 'keeper']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/goal-score.test.ts src/domain/role-goal-score.test.ts src/domain/goal-bands-draft.test.ts`
Expected: FAIL, with "Failed to resolve import './goal-score'" (and the same for the other two).

- [ ] **Step 3: Write the implementations**

`src/domain/goal-score.ts`:

```ts
/**
 * A Goals-by-role score, as typed on the session sheet.
 *
 * One box, from the player's own side: "3-1" is scored three, gave up one.
 * "3:1" and "3 1" mean the same, because a phone keyboard's number pad may not
 * offer a dash. Each side is a whole number 0-99, matching the database check.
 *
 * Anything else is refused rather than guessed. "3" could be three scored or
 * three given up, and reading it either way would score a result that did not
 * happen without anything on screen looking wrong.
 */

export interface GoalScore {
  scored: number;
  conceded: number;
}

const SCORE = /^\s*(\d{1,2})\s*[-:\s]\s*(\d{1,2})\s*$/;

export function parseGoalScore(text: unknown): GoalScore | null {
  if (typeof text !== 'string') return null;
  const m = SCORE.exec(text);
  return m ? { scored: Number(m[1]), conceded: Number(m[2]) } : null;
}

export function formatGoalScore(score: GoalScore | null): string {
  return score ? `${score.scored}-${score.conceded}` : '';
}

/** "+2", "0", "-1": a positive difference is signed so it cannot be read as a score. */
export function formatGoalDifference(diff: number): string {
  return diff > 0 ? `+${diff}` : String(diff);
}
```

`src/domain/role-goal-score.ts`:

```ts
/**
 * What a Goals-by-role score earns against a squad's standards.
 *
 * The database is the authority -- 0037's `role_scored` CTE. This copy exists
 * so a coach sees what each score is worth as it is typed, not after a save
 * and a reload, the same reason band-score.ts duplicates factorForTime.
 * role-goal-score.test.ts and src/data/testdb/goals-by-role.test.ts both run
 * the cases in role-goal-cases.ts, so the two cannot disagree silently.
 *
 *   base   the highest factor among the role's base bands whose threshold the
 *          goal difference meets or beats
 *   bonus  the highest factor among the role's bonus bands met: attack on goals
 *          scored (at least), defend and keeper on goals given up (at most)
 *   total  base + bonus, capped at 1
 *
 * A role with no base bands has no standards: the database leaves it out.
 */
import { roleLabel, type PositionRole } from './position';
import { parseGoalScore, formatGoalDifference, type GoalScore } from './goal-score';

export interface GoalBand {
  role: string;
  kind: string;
  threshold: number | string;
  factor: number | string;
}

export interface RoleGoalFactor {
  base: number;
  bonus: number;
  total: number;
  hasStandards: boolean;
}

export type GoalFeedbackTone = 'good' | 'none' | 'bad' | 'empty';

function best(bands: GoalBand[], meets: (threshold: number) => boolean): number {
  return bands
    .filter(b => meets(Number(b.threshold)))
    .reduce((top, b) => Math.max(top, Number(b.factor) || 0), 0);
}

export function roleGoalFactor(
  score: GoalScore | null, role: string | null | undefined, bands: GoalBand[]
): RoleGoalFactor {
  const mine = (bands || []).filter(b => b.role === role);
  const base = mine.filter(b => b.kind === 'base');
  const bonus = mine.filter(b => b.kind === 'bonus');
  const hasStandards = !!role && base.length > 0;
  if (!hasStandards || !score) return { base: 0, bonus: 0, total: 0, hasStandards };

  const diff = score.scored - score.conceded;
  const b = best(base, t => diff >= t);
  const bo = best(bonus, t => (role === 'attack' ? score.scored >= t : score.conceded <= t));
  // Rounded to the database's three places, so 0.7 + 0.1 reads 0.8.
  const total = Math.min(1, Math.round((b + bo) * 1000) / 1000);
  return { base: b, bonus: bo, total, hasStandards };
}

export function percentLabel(factor: number): string {
  return `${+(Number(factor) * 100).toFixed(1)}%`;
}

/**
 * What sits beside the score box as it is typed.
 *
 * `bad` means the entry could not be used as it stands; `none` means it was
 * read and earned nothing, or cannot score yet. The two must not look alike:
 * telling a coach a correct score looks wrong would have them retype it.
 */
export function roleGoalFeedback(
  raw: string, role: string | null | undefined, bands: GoalBand[], weight: number | string | null | undefined
): { text: string; tone: GoalFeedbackTone } {
  const typed = String(raw ?? '').trim();
  if (!typed) return { text: '', tone: 'empty' };

  const score = parseGoalScore(typed);
  if (!score) return { text: 'score? e.g. 3-1', tone: 'bad' };
  if (!role) return { text: 'choose a role', tone: 'bad' };

  const f = roleGoalFactor(score, role, bands);
  if (!f.hasStandards) return { text: `no standards for ${roleLabel(role as PositionRole)}`, tone: 'none' };

  const points = +((Number(weight) || 0) * f.total).toFixed(2);
  return {
    text: `${percentLabel(f.base)} + ${percentLabel(f.bonus)} = ${percentLabel(f.total)} · ${points} pts`,
    tone: f.total > 0 ? 'good' : 'none'
  };
}

/**
 * A worked example for the editor, from the role's own bands.
 *
 * It takes the best-paying base band's threshold as the goal difference and
 * the best-paying bonus band's threshold as goals scored (attack) or given up
 * (defend, keeper), then scores that result with the rule above -- so the
 * line always shows what the bands on screen would really pay.
 */
export function goalBandExample(role: PositionRole, bands: GoalBand[]): string {
  const mine = (bands || []).filter(b => b.role === role);
  const base = mine.filter(b => b.kind === 'base');
  if (!base.length) return `Add a goal-difference band to score ${roleLabel(role)}.`;

  const top = (list: GoalBand[]) => list.reduce((a, b) => (Number(b.factor) > Number(a.factor) ? b : a));
  const diff = Number(top(base).threshold);
  const bonus = mine.filter(b => b.kind === 'bonus');
  const bonusThreshold = bonus.length ? Number(top(bonus).threshold) : 0;

  let scored: number;
  let conceded: number;
  if (role === 'attack') {
    scored = Math.max(bonusThreshold, diff, 0);
    conceded = scored - diff;
  } else {
    conceded = Math.max(bonusThreshold, 0);
    scored = conceded + diff;
    if (scored < 0) { scored = 0; conceded = -diff; }
  }

  const f = roleGoalFactor({ scored, conceded }, role, mine);
  const what = role === 'attack' ? `${scored} scored` : `${conceded} given up`;
  return `${formatGoalDifference(scored - conceded)} with ${what} → `
    + `${percentLabel(f.base)} + ${percentLabel(f.bonus)} = ${percentLabel(f.total)}`;
}
```

`src/domain/goal-bands-draft.ts`:

```ts
/**
 * The Goals-by-role standards editor's drafts.
 *
 * A draft is what is in the boxes: a threshold and a percentage, as text. The
 * database stores a whole-number threshold and a factor 0-1, and save_goal_bands
 * refuses anything else in words. These refusals are the same ones, made first,
 * so the editor can say what is wrong beside the boxes.
 */
import type { PositionRole } from './position';

export interface GoalBandDraft { threshold: string; percent: string }
export interface GoalRoleDrafts { base: GoalBandDraft[]; bonus: GoalBandDraft[] }
export type GoalBandDrafts = Record<PositionRole, GoalRoleDrafts>;

export const GOAL_ROLES: PositionRole[] = ['attack', 'defend', 'keeper'];

export type ParsedGoalBand = { kind: 'base' | 'bonus'; threshold: number; factor: number };

export function emptyGoalDrafts(): GoalBandDrafts {
  return { attack: { base: [], bonus: [] }, defend: { base: [], bonus: [] }, keeper: { base: [], bonus: [] } };
}

/** Stored bands, grouped for the editor: best-paying first in each list. */
export function goalDraftsFromBands(rows: any[]): GoalBandDrafts {
  const out = emptyGoalDrafts();
  const sorted = (rows || []).slice().sort((a, b) =>
    Number(b.factor) - Number(a.factor) || Number(b.threshold) - Number(a.threshold));
  sorted.forEach(r => {
    const role = out[r?.role as PositionRole];
    if (!role || (r.kind !== 'base' && r.kind !== 'bonus')) return;
    role[r.kind as 'base' | 'bonus'].push({
      threshold: String(Number(r.threshold)),
      percent: String(+(Number(r.factor) * 100).toFixed(1))
    });
  });
  return out;
}

const WHOLE = /^\s*-?\d{1,4}\s*$/;

export function draftsToGoalBands(
  drafts: GoalRoleDrafts
): { ok: true; bands: ParsedGoalBand[] } | { ok: false; error: string } {
  const bands: ParsedGoalBand[] = [];

  for (const kind of ['base', 'bonus'] as const) {
    for (const row of drafts?.[kind] || []) {
      const t = String(row?.threshold ?? '');
      const p = String(row?.percent ?? '');
      if (!t.trim() && !p.trim()) continue;   // an untouched blank row

      if (!WHOLE.test(t)) {
        return { ok: false, error: `"${t.trim()}" is not a whole number. A threshold is a count of goals, like 2 or -1.` };
      }
      const percent = p.trim() === '' ? NaN : Number(p);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return { ok: false, error: `A percentage must be between 0 and 100 (found "${p.trim()}").` };
      }

      const threshold = Number(t.trim());
      if (bands.some(b => b.kind === kind && b.threshold === threshold)) {
        const name = kind === 'base' ? 'goal-difference' : 'bonus';
        return { ok: false, error: `Two ${name} bands share the threshold ${threshold}. Two bands at one threshold cannot both apply.` };
      }
      bands.push({ kind, threshold, factor: Math.round(percent * 10) / 1000 });
    }
  }

  const top = (kind: 'base' | 'bonus') =>
    bands.filter(b => b.kind === kind).reduce((m, b) => Math.max(m, b.factor), 0);
  const base = top('base');
  const bonus = top('bonus');
  if (Math.round((base + bonus) * 1000) > 1000) {
    return {
      ok: false,
      error: `The top goal-difference band (${+(base * 100).toFixed(1)}%) and the top bonus band `
        + `(${+(bonus * 100).toFixed(1)}%) add up to more than 100% of the weight. Lower one of them.`
    };
  }

  return { ok: true, bands };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/goal-score.test.ts src/domain/role-goal-score.test.ts src/domain/goal-bands-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/goal-score.ts src/domain/goal-score.test.ts src/domain/role-goal-score.ts src/domain/role-goal-score.test.ts src/domain/goal-bands-draft.ts src/domain/goal-bands-draft.test.ts
git commit -m "feat: the browser's copy of the Goals by role rule, checked against the database's cases" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The data layer and the session store

**Files:**
- Modify: `src/data/supabase.ts`
  - `MEASURES` (~line 1976)
  - `saveMatrixSession` (~2057–2134)
  - `fetchPlayerBreakdown` (~2151)
  - `fetchTeamExercisePoints` (~2174)
  - `fetchMatrixSessionResults` (~2436)
  - new methods after `saveTimeBands`
- Create: `src/data/goal-bands-service.test.ts`
- Modify: `src/data/matrix-session-service.test.ts`
- Modify: `src/stores/session.ts`, `src/stores/session.test.ts`

**Interfaces:**
- Consumes: the SQL objects from Task 1; `AccountResult` from `src/types.ts`.
- Produces:
  - `supabaseService.fetchGoalBands(drillId: string, teamId: string): Promise<Record<string, any>[] | null>`. Rows are `{ id, drill_id, team_id, role, kind, threshold, factor }`.
  - `supabaseService.saveGoalBands(drillId: string, teamId: string, role: string, bands: { kind: string; threshold: number; factor: number }[]): Promise<AccountResult<unknown>>`
  - `saveMatrixSession`'s result items gain `role?: string | null; goalsFor?: number | null; goalsAgainst?: number | null`.
  - `fetchMatrixSessionResults` rows gain `role, goals_for, goals_against`.
  - `fetchPlayerBreakdown` and `fetchTeamExercisePoints` rows gain `role, goals_for, goals_against, base_factor, bonus_factor`.
  - The session store gains `goalBands: Ref<any[]>`, filled by `loadBands` for a `role_goals` drill.

- [ ] **Step 1: Write the failing tests**

`src/data/goal-bands-service.test.ts`:

```ts
/// <reference types="vite/client" />
/**
 * Goals-by-role standards: read from the table, written only through
 * save_goal_bands. These pin the argument names -- a renamed parameter reaches
 * PostgREST as "function not found" -- and that a refusal comes back as the
 * database's own sentence.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;
const DRILL = '11111111-1111-1111-1111-111111111111';
const TEAM = '22222222-2222-2222-2222-222222222222';

let rpcCalls: { fn: string; args: any }[];
let rpcResult: { data: any; error: any };
let fromCalls: { table: string; eqs: [string, any][] }[];
let fromRows: any[] | null;
let fromError: any;

beforeEach(() => {
  rpcCalls = [];
  rpcResult = { data: null, error: null };
  fromCalls = [];
  fromRows = [];
  fromError = null;
  svc.isConfigured = () => true;
  svc.client = {
    rpc(fn: string, args: any) { rpcCalls.push({ fn, args }); return Promise.resolve(rpcResult); },
    from(table: string) {
      const call = { table, eqs: [] as [string, any][] };
      fromCalls.push(call);
      const api: any = {
        select() { return api; },
        eq(col: string, v: any) { call.eqs.push([col, v]); return api; },
        then(res: any) { return Promise.resolve({ data: fromError ? null : fromRows, error: fromError }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('fetchGoalBands', () => {
  it("reads one squad's bands for one drill, grouped by role and kind", async () => {
    fromRows = [
      { role: 'defend', kind: 'base', threshold: 0, factor: 0.6 },
      { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 },
      { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 }
    ];
    const rows = await svc.fetchGoalBands(DRILL, TEAM);
    expect(fromCalls).toEqual([{ table: 'drill_goal_bands', eqs: [['drill_id', DRILL], ['team_id', TEAM]] }]);
    expect(rows.map((r: any) => `${r.role}/${r.kind}`)).toEqual(['attack/base', 'attack/bonus', 'defend/base']);
  });

  it('is null, not empty, when the read fails', async () => {
    fromError = { message: 'boom' };
    expect(await svc.fetchGoalBands(DRILL, TEAM)).toBeNull();
  });

  it('does not query without real ids', async () => {
    expect(await svc.fetchGoalBands('', TEAM)).toBeNull();
    expect(await svc.fetchGoalBands(DRILL, 'team')).toBeNull();
    expect(fromCalls).toHaveLength(0);
  });
});

describe('saveGoalBands', () => {
  it('calls save_goal_bands with the argument names the database declares', async () => {
    const res = await svc.saveGoalBands(DRILL, TEAM, 'attack', [{ kind: 'base', threshold: 1, factor: 0.5 }]);
    expect(rpcCalls).toEqual([{
      fn: 'save_goal_bands',
      args: { p_drill_id: DRILL, p_team_id: TEAM, p_role: 'attack', p_bands: [{ kind: 'base', threshold: 1, factor: 0.5 }] }
    }]);
    expect(res.ok).toBe(true);
  });

  it("returns the database's sentence when it refuses", async () => {
    rpcResult = { data: null, error: { message: 'Only a coach of this team can set its standards.' } };
    expect(await svc.saveGoalBands(DRILL, TEAM, 'attack', []))
      .toEqual({ ok: false, error: 'Only a coach of this team can set its standards.' });
  });

  it('refuses without a drill or a team, before any call', async () => {
    expect(await svc.saveGoalBands('', TEAM, 'attack', [])).toEqual({ ok: false, error: 'No drill given.' });
    expect(await svc.saveGoalBands(DRILL, '', 'attack', [])).toEqual({ ok: false, error: 'No team selected.' });
    expect(rpcCalls).toHaveLength(0);
  });
});
```

Append to `src/data/matrix-session-service.test.ts`. It uses the file's existing `captured`, `tableRows` and `supabaseService`:

```ts
describe('saveMatrixSession for a Goals-by-role drill', () => {
  beforeEach(() => { tableRows = { drills_bank: [{ measure: 'role_goals' }] }; });

  it('writes the role and both goal counts, and no raw value', async () => {
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-09-14' },
      [
        { playerId: 'p1', attendance: 'present', role: 'attack', goalsFor: 3, goalsAgainst: 1 },
        { playerId: 'p2', attendance: 'excused', role: 'defend', goalsFor: 2, goalsAgainst: 2 }
      ]
    );
    expect(res.ok).toBe(true);
    const results = captured.find(c => c.table === 'matrix_session_results')!;
    expect(results.rows).toEqual([
      { session_id: 'sess-1', player_id: 'p1', attendance: 'present', raw_value: null, outcome: null,
        role: 'attack', goals_for: 3, goals_against: 1 },
      { session_id: 'sess-1', player_id: 'p2', attendance: 'excused', raw_value: null, outcome: null,
        role: null, goals_for: null, goals_against: null }
    ]);
  });

  it.each([
    ['no role', { role: null, goalsFor: 3, goalsAgainst: 1 }],
    ['a role the database refuses', { role: 'midfield', goalsFor: 3, goalsAgainst: 1 }],
    ['no score', { role: 'attack', goalsFor: null, goalsAgainst: null }],
    ['a count over 99', { role: 'attack', goalsFor: 100, goalsAgainst: 1 }]
  ])('refuses a present player with %s, naming them', async (_label, r) => {
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-09-14' },
      [{ playerId: 'p1', attendance: 'present', ...r }]
    );
    expect(res.ok).toBe(false);
    expect(res.error).toBe('p1 is marked present but needs a role and a score like 3-1. Enter both, or mark them absent.');
    expect(captured).toHaveLength(0);
  });
});

describe('saveMatrixSession for other measures', () => {
  it('writes the Goals-by-role columns as null', async () => {
    tableRows = { drills_bank: [{ measure: 'count_high' }] };
    await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-09-14' },
      [{ playerId: 'p1', attendance: 'present', rawValue: 40, role: 'attack', goalsFor: 1, goalsAgainst: 0 }]
    );
    const results = captured.find(c => c.table === 'matrix_session_results')!;
    expect(results.rows![0]).toMatchObject({ raw_value: 40, role: null, goals_for: null, goals_against: null });
  });
});
```

In `src/stores/session.test.ts`:
- Add `const fetchGoalBands = vi.fn();` beside the other mocks.
- Add `fetchGoalBands: (...a: any[]) => fetchGoalBands(...a),` to the mocked `supabaseService`.
- Add `const GOALS = 'd-goals';` and `{ id: GOALS, name: '1v1 Attack', measure: 'role_goals', points: 3 }` to `DRILLS`.
- Append:

```ts
describe('Goals-by-role standards', () => {
  it('loads goal bands, not time bands, for a role_goals drill', async () => {
    fetchGoalBands.mockResolvedValue([{ role: 'attack', kind: 'base', threshold: 0, factor: 1 }]);
    const s = useSessionStore();
    s.drills = DRILLS;
    await s.loadBands(GOALS, 't1');
    expect(fetchGoalBands).toHaveBeenCalledWith(GOALS, 't1');
    expect(fetchTimeBands).not.toHaveBeenCalled();
    expect(s.goalBands).toHaveLength(1);
    expect(s.bands).toEqual([]);
  });

  it('clears the goal bands when switching to another exercise', async () => {
    fetchGoalBands.mockResolvedValue([{ role: 'attack', kind: 'base', threshold: 0, factor: 1 }]);
    const s = useSessionStore();
    s.drills = DRILLS;
    await s.loadBands(GOALS, 't1');
    await s.loadBands(SMALL, 't1');
    expect(s.goalBands).toEqual([]);
  });

  it('treats a failed read as no standards rather than throwing', async () => {
    fetchGoalBands.mockResolvedValue(null);
    const s = useSessionStore();
    s.drills = DRILLS;
    await s.loadBands(GOALS, 't1');
    expect(s.goalBands).toEqual([]);
  });
});
```

If an existing test in `session.test.ts` asserts the exact length or contents of `DRILLS`, update it to include `GOALS`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/goal-bands-service.test.ts src/data/matrix-session-service.test.ts src/stores/session.test.ts`
Expected: FAIL. `svc.fetchGoalBands is not a function`, the role_goals save writes no `role` column and is not refused, and `s.goalBands` is undefined.

- [ ] **Step 3: Implement in `src/data/supabase.ts`**

(a) Change `MEASURES`:

```ts
  private static readonly MEASURES = ['head_to_head', 'win_loss', 'count_high', 'time_low', 'time_bands', 'role_goals'];
```

(b) Add after `saveTimeBands`:

```ts
  /**
   * The Goals-by-role standards one squad is held to on one drill, every role.
   *
   * Grouped by role, then kind, then threshold, so the editor and the live
   * preview read them in a stable order. Null is a failed read.
   */
  async fetchGoalBands(drillId: string, teamId: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    if (!drillId || !this.isUuid(drillId)) return null;
    if (!teamId || !this.isUuid(teamId)) return null;

    const { data, error } = await this.client!
      .from('drill_goal_bands')
      .select('id, drill_id, team_id, role, kind, threshold, factor')
      .eq('drill_id', drillId)
      .eq('team_id', teamId);
    if (error) { report('fetchGoalBands', error.message); return null; }

    return (data || []).slice().sort((a: any, b: any) =>
      String(a.role).localeCompare(String(b.role))
      || String(a.kind).localeCompare(String(b.kind))
      || Number(a.threshold) - Number(b.threshold));
  }

  /**
   * Replace one role's Goals-by-role standards for one squad.
   *
   * Only through save_goal_bands (0037): drill_goal_bands has no write policy,
   * because the 100% rule spans rows. The function checks the caller and every
   * band, and its refusals are sentences shown as they are.
   */
  async saveGoalBands(
    drillId: string, teamId: string, role: string,
    bands: { kind: string; threshold: number; factor: number }[]
  ): Promise<AccountResult<unknown>> {
    if (!drillId || !this.isUuid(drillId)) return { ok: false, error: 'No drill given.' };
    if (!teamId || !this.isUuid(teamId)) return { ok: false, error: 'No team selected.' };
    return this.accountRpc('save_goal_bands', {
      p_drill_id: drillId,
      p_team_id: teamId,
      p_role: role,
      p_bands: (bands || []).map(b => ({ kind: b.kind, threshold: b.threshold, factor: b.factor }))
    });
  }
```

(c) Replace `saveMatrixSession`'s signature, validation and row mapping. Keep the doc comment, and add the paragraph shown. The measure lookup moves **before** the validation loop, because the loop now depends on it:

```ts
  async saveMatrixSession(
    teamId: string,
    session: { id?: string; drillId: string; occurredOn: string; notes?: string },
    results: {
      playerId: string; attendance: string; rawValue?: number | null; outcome?: string | null;
      role?: string | null; goalsFor?: number | null; goalsAgainst?: number | null;
    }[]
  ): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!teamId) return { ok: false, error: 'No team selected.' };
    if (!session?.drillId) return { ok: false, error: 'Pick the exercise this session was.' };
    if (!session?.occurredOn) return { ok: false, error: 'Pick the date this session happened.' };

    // The drill decides how the session is scored, so a head_to_head drill has
    // no session shape at all. Checked here rather than trusting the picker:
    // the same day's competition must not be countable twice. Read before the
    // results are checked, because a Goals-by-role result is a different shape.
    const { data: dRows } = await this.client!
      .from('drills_bank').select('measure').eq('id', session.drillId).limit(1);
    const measure = dRows && dRows[0] ? dRows[0].measure : null;
    if (measure === 'head_to_head') {
      return { ok: false, error: 'That exercise is recorded as 1v1 pairings, not as a session. Use Record Result instead.' };
    }
    const roleGoals = measure === 'role_goals';
    const isGoalCount = (n: any) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 99;

    for (const r of results || []) {
      if (r.attendance !== 'present') continue;
      if (roleGoals) {
        // 0037 scores a present row only with all three; one missing any is
        // silently left out of the standings, which is not what "here" meant.
        if (!['attack', 'defend', 'keeper'].includes(r.role as string)
            || !isGoalCount(r.goalsFor) || !isGoalCount(r.goalsAgainst)) {
          return { ok: false, error: `${r.playerId} is marked present but needs a role and a score like 3-1. Enter both, or mark them absent.` };
        }
        continue;
      }
      const hasValue = r.rawValue !== null && r.rawValue !== undefined && Number.isFinite(Number(r.rawValue));
      const hasOutcome = !!r.outcome;
      if (!hasValue && !hasOutcome) {
        return { ok: false, error: `${r.playerId} is marked present but has no result. Enter one, or mark them absent.` };
      }
    }
```

Keep the `sessionRow` build and upsert unchanged. Replace the `rows` mapping with:

```ts
    const sessionId = sData[0].id;
    const rows = (results || []).map(r => {
      const present = r.attendance === 'present';
      return {
        session_id: sessionId,
        player_id: r.playerId,
        attendance: r.attendance,
        raw_value: present && !roleGoals && r.rawValue !== null && r.rawValue !== undefined
          ? Number(r.rawValue) : null,
        outcome: present && !roleGoals ? (r.outcome || null) : null,
        role: present && roleGoals ? (r.role as string) : null,
        goals_for: present && roleGoals ? Number(r.goalsFor) : null,
        goals_against: present && roleGoals ? Number(r.goalsAgainst) : null
      };
    });
```

The results upsert, the hand-rolled rollback and the return stay as they are.

(d) The three reads. Only the `select` strings change:

```ts
      // fetchPlayerBreakdown
      .select('drill_id, exercise, occurred_on, kind, detail, raw_value, attendance, weight, earned, available, opponent_id, role, goals_for, goals_against, base_factor, bonus_factor')
```
```ts
      // fetchTeamExercisePoints
      .select('player_id, drill_id, exercise, kind, raw_value, weight, earned, available, w, dr, ls, occurred_on, role, goals_for, goals_against, base_factor, bonus_factor')
```
```ts
      // fetchMatrixSessionResults
      .select('player_id, attendance, raw_value, outcome, role, goals_for, goals_against')
```

Before the `fetchPlayerBreakdown` select, add this comment line: `// role .. bonus_factor since 0037, which must be applied before this client is deployed.`

- [ ] **Step 4: Implement in `src/stores/session.ts`**

Add `const goalBands = ref<any[]>([]);` beside `bands`. Replace `loadBands`:

```ts
  /**
   * The standards this squad is held to on this exercise.
   *
   * `time_bands` has time bands and `role_goals` has goal bands; nothing else
   * has any. Fetching for another measure is a wasted round trip whose empty
   * result would then read as "no standards set" for a drill that cannot have
   * them.
   */
  async function loadBands(drillId: string, teamId: string | null): Promise<void> {
    bands.value = [];
    goalBands.value = [];
    if (!drillId || !teamId) return;

    const drill = drillById(drillId);
    if (drill?.measure === 'role_goals') {
      goalBands.value = (await supabaseService.fetchGoalBands(drillId, teamId)) || [];
      return;
    }
    // Unknown drill: the library may not be loaded yet, and a banded exercise
    // with no standards on screen is worse than one extra read.
    if (drill && drill.measure !== 'time_bands') return;

    bands.value = (await supabaseService.fetchTimeBands(drillId, teamId)) || [];
  }
```

Add `goalBands` to the returned object, after `bands`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/data/goal-bands-service.test.ts src/data/matrix-session-service.test.ts src/stores/session.test.ts src/data/time-bands.test.ts`
Expected: PASS. Existing `saveMatrixSession` tests still pass: the mocked `drills_bank` answer carries no `measure`, so they take the original branch.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

```bash
git add src/data/supabase.ts src/data/goal-bands-service.test.ts src/data/matrix-session-service.test.ts src/stores/session.ts src/stores/session.test.ts
git commit -m "feat: save and read Goals by role results and standards" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The session sheet

**Files:**
- Modify: `src/domain/session-entry.ts`, `src/domain/session-entry.test.ts`
- Modify: `src/domain/session-format.ts`, `src/domain/session-format.test.ts`
- Modify: `src/components/matrix/SessionEntryScreen.vue`, `src/components/matrix/SessionEntryScreen.test.ts`

**Interfaces:**
- Consumes:
  - `parseGoalScore`, `formatGoalScore` (Task 2);
  - `roleGoalFeedback` (Task 2);
  - `GOAL_ROLES` (Task 2);
  - `roleOfPosition`, `roleLabel` from `position.ts`;
  - `session.goalBands` (Task 3);
  - `saveMatrixSession` result shape (Task 3).
- Produces:
  - `EntryRow` gains `role?: string`: set, possibly `''`, only for `role_goals`. `value` holds the typed score text.
  - `SessionResult` gains optional `role`, `goalsFor`, `goalsAgainst`.
  - `presentWithoutResult(players, entries, 'role_goals')` returns players missing a role or a readable score.
  - `entryFormat('role_goals')` returns `{ figure: '3-1', note }`.

- [ ] **Step 1: Write the failing domain tests**

Append to `src/domain/session-entry.test.ts`:

```ts
describe('a Goals-by-role grid', () => {
  const SQUAD = [
    { id: 'k', name: 'Keeper Kay', position: 1 },
    { id: 'd', name: 'Defender Dee', position: 4 },
    { id: 'a', name: 'Attacker Ash', position: 9 },
    { id: 'n', name: 'No Position', position: null }
  ];

  it('pre-fills each role from the roster position number', () => {
    const e = blankEntries(SQUAD, 'role_goals');
    expect([e.k.role, e.d.role, e.a.role, e.n.role]).toEqual(['keeper', 'defend', 'attack', '']);
    expect(e.a.attendance).toBe('present');
    expect(e.a.value).toBe('');
  });

  it('gives other measures no role at all', () => {
    expect(blankEntries(SQUAD, 'count_high').a.role).toBeUndefined();
  });

  it('reopens with the role stored with the result, not the roster', () => {
    const e = entriesFromResults(SQUAD, [
      { player_id: 'a', attendance: 'present', role: 'defend', goals_for: 0, goals_against: 2 },
      { player_id: 'd', attendance: 'excused', role: null, goals_for: null, goals_against: null }
    ], 'role_goals');
    expect(e.a).toMatchObject({ role: 'defend', value: '0-2', attendance: 'present' });
    expect(e.d).toMatchObject({ role: 'defend', value: '', attendance: 'excused' });
  });

  it('shapes the payload with the role and both counts', () => {
    const e = blankEntries(SQUAD, 'role_goals');
    e.a = { ...e.a, value: ' 3 - 1 ' };
    e.k = { ...e.k, attendance: 'unexcused', value: '0-1' };
    const out = toSessionResults(SQUAD, e, 'role_goals');
    expect(out.find(r => r.playerId === 'a')).toEqual({
      playerId: 'a', attendance: 'present', rawValue: null, outcome: null, role: 'attack', goalsFor: 3, goalsAgainst: 1
    });
    expect(out.find(r => r.playerId === 'k')).toEqual({
      playerId: 'k', attendance: 'unexcused', rawValue: null, outcome: null, role: null, goalsFor: null, goalsAgainst: null
    });
  });

  it('names who is here without a role or a readable score', () => {
    const e = blankEntries(SQUAD, 'role_goals');
    e.k = { ...e.k, value: '0-1' };             // complete
    e.d = { ...e.d, value: '3' };               // unreadable
    e.a = { ...e.a, value: '' };                // no score
    e.n = { ...e.n, value: '2-2' };             // no role
    expect(presentWithoutResult(SQUAD, e, 'role_goals').map(p => p.id)).toEqual(['d', 'a', 'n']);
  });
});
```

Append to `src/domain/session-format.test.ts`:

```ts
describe('the Goals-by-role banner', () => {
  it('shows the score shape and says whose side it is from', () => {
    const f = entryFormat('role_goals');
    expect(f?.figure).toBe('3-1');
    expect(f?.note).toMatch(/player's side/);
  });

  it('counts a typed score as recorded', () => {
    const t = entryTally(
      [{ id: 'p1' }, { id: 'p2' }],
      { p1: { playerId: 'p1', attendance: 'present', value: '3-1', outcome: '', role: 'attack' },
        p2: { playerId: 'p2', attendance: 'present', value: '', outcome: '', role: 'defend' } },
      'role_goals');
    expect(t).toEqual({ timed: 1, absent: 0, remaining: 1 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/domain/session-entry.test.ts src/domain/session-format.test.ts`
Expected: FAIL. The role is `undefined` and `entryFormat('role_goals')` is null.

- [ ] **Step 3: Implement the domain changes**

In `src/domain/session-entry.ts`:

Add imports:

```ts
import { roleOfPosition } from './position';
import { parseGoalScore, formatGoalScore } from './goal-score';
```

Extend the interfaces:

```ts
export interface EntryRow {
  playerId: string;
  attendance: Attendance;
  /** As typed. Parsed on the way out, not on every keystroke. For role_goals, the score: "3-1". */
  value: string;
  outcome: string;
  /**
   * Goals by role only: 'attack' | 'defend' | 'keeper', or '' for none chosen.
   * Absent for every other measure, so their rows are unchanged.
   */
  role?: string;
}

export interface SessionResult {
  playerId: string;
  attendance: Attendance;
  rawValue: number | null;
  outcome: string | null;
  role?: string | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
}
```

In `blankEntries`, build the row this way:

```ts
  live(players).forEach(p => {
    const row: EntryRow = {
      playerId: p.id,
      attendance: defaultSessionAttendance(measure),
      value: '',
      outcome: ''
    };
    // Pre-filled from the roster position number and changeable for this
    // session only; nothing is written back to the roster.
    if (measure === 'role_goals') row.role = roleOfPosition(p.position) || '';
    out[p.id] = row;
  });
```

In `entriesFromResults`, replace the assignment inside the loop:

```ts
    out[r.player_id] = measure === 'role_goals'
      ? {
          ...row,
          attendance: (r.attendance as Attendance) || row.attendance,
          // The role stored with the result, not the roster's current one: a
          // player who defended in that session defended, whatever the roster
          // says now. An absence stored no role, so the roster's stands.
          role: r.role || row.role,
          value: r.goals_for != null && r.goals_against != null
            ? formatGoalScore({ scored: Number(r.goals_for), conceded: Number(r.goals_against) })
            : '',
          outcome: ''
        }
      : {
          ...row,
          attendance: (r.attendance as Attendance) || row.attendance,
          value: formatValue(r.raw_value, measure),
          outcome: r.outcome || ''
        };
```

In `toSessionResults`, handle `role_goals` first inside the `map`:

```ts
    const row = entries?.[p.id];
    const attendance: Attendance = row?.attendance || 'present';

    if (measure === 'role_goals') {
      if (attendance !== 'present') {
        return { playerId: p.id, attendance, rawValue: null, outcome: null, role: null, goalsFor: null, goalsAgainst: null };
      }
      const score = parseGoalScore(row?.value || '');
      return {
        playerId: p.id, attendance, rawValue: null, outcome: null,
        role: row?.role || null,
        goalsFor: score ? score.scored : null,
        goalsAgainst: score ? score.conceded : null
      };
    }
```

The rest of the function is unchanged. In `presentWithoutResult`, replace the filter's last line:

```ts
    if (!r || r.attendance !== 'present') return false;
    // A Goals-by-role row needs both: the database scores neither half alone.
    if (measure === 'role_goals') return !r.role || r.goalsFor == null || r.goalsAgainst == null;
    return r.rawValue === null && !r.outcome;
```

`attendanceAfterInput` needs no change: the score text is `value`, so typing one marks the player present exactly as a time does.

In `src/domain/session-format.ts`, add to `FORMATS`:

```ts
  role_goals: {
    figure: '3-1',
    note: "Scored, then given up, from the player's side — 3-1. Roles are filled from the roster position; change one for today if needed."
  }
```

- [ ] **Step 4: Run the domain tests**

Run: `npx vitest run src/domain/session-entry.test.ts src/domain/session-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing screen tests**

In `src/components/matrix/SessionEntryScreen.test.ts`:

(a) Let `mountGrid` take the squad, the stored results and the goal bands:
- Change its options type to `{ drillId?: string; measure?: string; editing?: any; players?: any[]; results?: any[]; goalBands?: any[] }`.
- Destructure `players = PLAYERS, results = [], goalBands = GOAL_BANDS`.
- Pass `players` in `props`.
- Add `goalBands, results` to the `session` initial state, beside `bands: BANDS`.

(b) Add these fixtures near `BANDS`:

```ts
/** Attack only: +1 earns 50%, three scored earns a 10% bonus. No keeper standards. */
const GOAL_BANDS = [
  { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 },
  { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 },
  { role: 'defend', kind: 'base', threshold: 0, factor: 1 }
];

const SQUAD = [
  { id: 'g1', name: 'Kay Keeper', recordingNumber: 1, position: 1 },
  { id: 'g2', name: 'Dee Defender', recordingNumber: 2, position: 4 },
  { id: 'g3', name: 'Ash Attacker', recordingNumber: 3, position: 9 },
  { id: 'g4', name: 'Nat Noposition', recordingNumber: 4, position: null }
];

/** COOPERS, measured as Goals by role, weight 2. */
const goalsGrid = (over: any = {}) =>
  mountGrid({ drillId: COOPERS, measure: 'role_goals', players: SQUAD, ...over });

const rowOf = (w: any, id: string) => w.find(`[data-grid-row="${id}"]`);
```

(c) Append:

```ts
describe('a Goals-by-role exercise', () => {
  it('pre-fills each role from the position number', async () => {
    const w = await goalsGrid();
    const roles = SQUAD.map(p => (rowOf(w, p.id).find('[data-role-select]').element as HTMLSelectElement).value);
    expect(roles).toEqual(['keeper', 'defend', 'attack', '']);
    expect(rowOf(w, 'g2').find('[data-role-select]').text()).toContain('Defence');
  });

  it('keeps a role the coach changed while the score is typed', async () => {
    const w = await goalsGrid();
    await rowOf(w, 'g2').find('[data-role-select]').setValue('attack');
    await rowOf(w, 'g2').find('[data-goal-score]').setValue('3-1');
    expect((rowOf(w, 'g2').find('[data-role-select]').element as HTMLSelectElement).value).toBe('attack');
  });

  it('reopens a saved session with the role stored with the result', async () => {
    const w = await goalsGrid({
      editing: { id: 's1', drill_id: COOPERS, occurred_on: '2026-09-10' },
      results: [{ player_id: 'g3', attendance: 'present', role: 'defend', goals_for: 0, goals_against: 2 }]
    });
    expect((rowOf(w, 'g3').find('[data-role-select]').element as HTMLSelectElement).value).toBe('defend');
    expect((rowOf(w, 'g3').find('[data-goal-score]').element as HTMLInputElement).value).toBe('0-2');
  });

  it('moves role → score → next row on Enter, in on-screen order', async () => {
    const w = await goalsGrid();
    const f = fields(w);
    expect(f[0].attributes('data-role-select')).toBeDefined();
    expect(f[1].attributes('data-goal-score')).toBeDefined();
    (f[0].element as HTMLElement).focus();
    await f[0].trigger('keydown', { key: 'Enter' });
    expect(document.activeElement).toBe(f[1].element);
    await f[1].trigger('keydown', { key: 'Enter' });
    expect(document.activeElement).toBe(rowOf(w, 'g2').find('[data-role-select]').element);
  });

  it('marks a player present when a score is typed', async () => {
    const w = await goalsGrid();
    await rowOf(w, 'g3').find('[data-attendance]').setValue('excused');
    await rowOf(w, 'g3').find('[data-goal-score]').setValue('2-0');
    expect((rowOf(w, 'g3').find('[data-attendance]').element as HTMLSelectElement).value).toBe('present');
  });

  it('shows what a score earns as it is typed', async () => {
    const w = await goalsGrid();
    await rowOf(w, 'g3').find('[data-goal-score]').setValue('3-1');
    expect(rowOf(w, 'g3').find('[data-goal-earned]').text()).toBe('50% + 10% = 60% · 1.2 pts');
  });

  it('says when the squad has no standards for the role', async () => {
    const w = await goalsGrid();
    await rowOf(w, 'g1').find('[data-goal-score]').setValue('1-0');
    expect(rowOf(w, 'g1').find('[data-goal-earned]').text()).toBe('no standards for Goalkeeper');
  });

  it('refuses to save a present row without a role or a readable score, naming who', async () => {
    const w = await goalsGrid();
    await rowOf(w, 'g1').find('[data-goal-score]').setValue('0-1');
    await rowOf(w, 'g2').find('[data-goal-score]').setValue('3');
    await rowOf(w, 'g3').find('[data-goal-score]').setValue('2-1');
    await rowOf(w, 'g4').find('[data-goal-score]').setValue('1-1');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    const msg = w.find('[data-session-error]').text();
    expect(msg).toContain('Dee Defender');
    expect(msg).toContain('Nat Noposition');
    expect(msg).not.toContain('Ash Attacker');
    expect(msg).toMatch(/role and a score like 3-1/);
    expect(saveMatrixSession).not.toHaveBeenCalled();
  });

  it('saves each role and both counts', async () => {
    const w = await goalsGrid({ players: SQUAD.slice(0, 3) });
    await rowOf(w, 'g1').find('[data-goal-score]').setValue('0-1');
    await rowOf(w, 'g2').find('[data-goal-score]').setValue('1-1');
    await rowOf(w, 'g3').find('[data-goal-score]').setValue('3:1');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    const rows = saveMatrixSession.mock.calls[0][2];
    expect(rows.find((r: any) => r.playerId === 'g3')).toEqual({
      playerId: 'g3', attendance: 'present', rawValue: null, outcome: null, role: 'attack', goalsFor: 3, goalsAgainst: 1
    });
  });

  it('says so when the squad has no standards yet, and only then', async () => {
    expect((await goalsGrid({ goalBands: [] })).find('[data-no-goal-bands]').exists()).toBe(true);
    expect((await goalsGrid()).find('[data-no-goal-bands]').exists()).toBe(false);
  });
});
```

If `mountGrid` already sets `results` from `editing` elsewhere, keep that behaviour: the new `results` option only supplies the initial state.

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run src/components/matrix/SessionEntryScreen.test.ts`
Expected: the new `a Goals-by-role exercise` tests FAIL (no `[data-role-select]`); every existing test still PASSES.

- [ ] **Step 7: Implement in `SessionEntryScreen.vue`**

Script additions:

```ts
import { roleGoalFeedback } from '../../domain/role-goal-score';
import { GOAL_ROLES } from '../../domain/goal-bands-draft';
import { roleLabel } from '../../domain/position';
```

```ts
const isRoleGoals = computed(() => measure.value === 'role_goals');
```

```ts
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
```

In `onSave`, replace the `short.length` message:

```ts
  if (short.length) {
    // Named, because the client's own guard reports a uuid — no use to
    // somebody looking at twenty-five rows.
    const who = short.map(p => p.name).join(', ');
    error.value = isRoleGoals.value
      ? `Needs a role and a score like 3-1: ${who}. Enter both, or mark them absent.`
      : `Marked here with no result: ${who}. Enter one, or mark them absent.`;
    return;
  }
```

In the template:

1. After the `data-no-bands` hint, add:

```html
    <p v-if="isRoleGoals && session.goalBands.length === 0" class="hint" data-no-goal-bands>
      No standards set for this squad yet. Scores are recorded, and count once
      the standards are entered in Weights and standards.
    </p>
```

2. Change the value column heading to `{{ isOutcome ? 'Result' : isRoleGoals ? 'Role · score' : 'Value' }}`.

3. In the value cell, between the `v-if="isOutcome"` select and `<template v-else>`, add:

```html
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
```

4. In `<style scoped>`, add:

```css
.goals { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
```

The existing `.earned--good/none/bad` classes cover the tones. `.earned--empty` needs no style.

- [ ] **Step 8: Run the screen tests and typecheck**

Run: `npx vitest run src/components/matrix/SessionEntryScreen.test.ts src/domain/session-entry.test.ts src/domain/session-format.test.ts`
Expected: PASS.
Run: `npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 9: Commit**

```bash
git add src/domain/session-entry.ts src/domain/session-entry.test.ts src/domain/session-format.ts src/domain/session-format.test.ts src/components/matrix/SessionEntryScreen.vue src/components/matrix/SessionEntryScreen.test.ts
git commit -m "feat: record Goals by role on the session sheet, with live points" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Setting the standards — `GoalBandsEditor` inside Weights and standards

**Files:**
- Create: `src/components/matrix/GoalBandsEditor.vue`, `src/components/matrix/GoalBandsEditor.test.ts`
- Modify: `src/components/matrix/WeightsModal.vue`, `src/components/matrix/WeightsModal.test.ts`

**Interfaces:**
- Consumes:
  - `GOAL_ROLES`, `GoalBandDrafts`, `GoalRoleDrafts`, `emptyGoalDrafts`, `goalDraftsFromBands` and `draftsToGoalBands` (Task 2);
  - `goalBandExample` (Task 2);
  - `roleLabel`;
  - `supabaseService.fetchGoalBands` and `supabaseService.saveGoalBands` (Task 3).
- Produces:
  - `GoalBandsEditor.vue`:
    - props `{ drillId: string; rows: GoalBandDrafts }`
    - emits `'update:rows'` with `GoalBandDrafts`
    - markup:

| Attribute | Element |
| --- | --- |
| `data-goal-bands="<drillId>"` | root |
| `data-goal-role-tab="<role>"` | role tab |
| `data-goal-kind="base\|bonus"` | list |
| `data-goal-band-row` | band row |
| `data-goal-threshold` | threshold box |
| `data-goal-percent` | percentage box |
| `data-goal-remove` | Remove button |
| `data-goal-add="base\|bonus"` | add button |
| `data-goal-example` | worked example |
| `data-goal-problem` | problem message |

  - `BandsEditor.vue` is **not** changed.

- [ ] **Step 1: Write the failing editor test**

`src/components/matrix/GoalBandsEditor.test.ts`:

```ts
/**
 * The Goals-by-role standards for one squad on one drill, a tab per role.
 *
 * The worked example is the check a coach actually reads: it scores a result
 * with the bands on screen, so a pair that pays too much or too little is
 * visible before the save.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import GoalBandsEditor from './GoalBandsEditor.vue';
import { emptyGoalDrafts } from '../../domain/goal-bands-draft';

function drafts() {
  const d = emptyGoalDrafts();
  d.attack.base = [{ threshold: '2', percent: '50' }];
  d.attack.bonus = [{ threshold: '5', percent: '10' }];
  d.defend.base = [{ threshold: '0', percent: '60' }];
  return d;
}

const mountEditor = (rows = drafts()) =>
  mount(GoalBandsEditor, { props: { drillId: 'd1', rows } });

/** The last rows the editor emitted. */
const emitted = (w: any) => w.emitted('update:rows').at(-1)[0];

describe('GoalBandsEditor', () => {
  it('opens on Attack with both lists and a worked example', async () => {
    const w = mountEditor();
    expect(w.find('[data-goal-role-tab="attack"]').attributes('aria-selected')).toBe('true');
    expect(w.find('[data-goal-kind="base"]').text()).toMatch(/Goal difference at least/);
    expect(w.find('[data-goal-kind="bonus"]').text()).toMatch(/Goals scored at least/);
    expect(w.find('[data-goal-example]').text()).toBe('+2 with 5 scored → 50% + 10% = 60%');
  });

  it("words a defender's bonus on goals given up", async () => {
    const w = mountEditor();
    await w.find('[data-goal-role-tab="defend"]').trigger('click');
    expect(w.find('[data-goal-kind="bonus"]').text()).toMatch(/Goals given up at most/);
    expect(w.find('[data-goal-example]').text()).toBe('0 with 0 given up → 60% + 0% = 60%');
  });

  it('labels the tabs with the roster words', () => {
    const tabs = mountEditor().findAll('[data-goal-role-tab]').map(t => t.text());
    expect(tabs).toEqual(['Attack', 'Defence', 'Goalkeeper']);
  });

  it('always leaves one row of boxes in an empty list', async () => {
    const w = mountEditor();
    await w.find('[data-goal-role-tab="keeper"]').trigger('click');
    expect(w.find('[data-goal-kind="base"]').findAll('[data-goal-band-row]')).toHaveLength(1);
    expect(w.find('[data-goal-example]').text()).toBe('Add a goal-difference band to score Goalkeeper.');
  });

  it('emits an edit to the active role only', async () => {
    const w = mountEditor();
    await w.find('[data-goal-kind="base"] [data-goal-percent]').setValue('40');
    const rows = emitted(w);
    expect(rows.attack.base).toEqual([{ threshold: '2', percent: '40' }]);
    expect(rows.defend.base).toEqual([{ threshold: '0', percent: '60' }]);
  });

  it('adds and removes rows in one list', async () => {
    const w = mountEditor();
    await w.find('[data-goal-add="bonus"]').trigger('click');
    expect(emitted(w).attack.bonus).toHaveLength(2);
    await w.setProps({ rows: emitted(w) });
    await w.find('[data-goal-kind="bonus"] [data-goal-remove]').trigger('click');
    expect(emitted(w).attack.bonus).toEqual([{ threshold: '', percent: '' }]);
  });

  it('shows the 100% rule beside the boxes instead of an example', async () => {
    const d = drafts();
    d.attack.bonus = [{ threshold: '5', percent: '60' }];
    const w = mountEditor(d);
    expect(w.find('[data-goal-example]').exists()).toBe(false);
    expect(w.find('[data-goal-problem]').text()).toMatch(/add up to more than 100%/);
  });

  it('shows a duplicate threshold beside the boxes', async () => {
    const d = drafts();
    d.attack.base = [{ threshold: '2', percent: '50' }, { threshold: '2', percent: '30' }];
    expect(mountEditor(d).find('[data-goal-problem]').text()).toMatch(/share the threshold 2/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/matrix/GoalBandsEditor.test.ts`
Expected: FAIL. `Failed to resolve import "./GoalBandsEditor.vue"`.

- [ ] **Step 3: Write `GoalBandsEditor.vue`**

```vue
<script setup lang="ts">
/**
 * The Goals-by-role standards one squad is held to on one exercise.
 *
 * A tab per role, because each role is judged on its own terms: an attacker on
 * goal difference with a bonus for goals scored, a defender or goalkeeper on
 * goal difference with a bonus for goals given up. Each tab has two lists of
 * bands -- a threshold and the share of the exercise's weight it earns.
 *
 * The worked example scores a result with the bands on screen, and the rules
 * save_goal_bands will enforce (the 100% rule, duplicate thresholds, whole
 * numbers) are shown here first, in the same words.
 *
 * Per squad: the team selected in the header, as for time bands.
 */
import { ref, computed } from 'vue';
import { roleLabel, type PositionRole } from '../../domain/position';
import { goalBandExample } from '../../domain/role-goal-score';
import {
  GOAL_ROLES, draftsToGoalBands, type GoalBandDraft, type GoalBandDrafts
} from '../../domain/goal-bands-draft';

const props = defineProps<{ drillId: string; rows: GoalBandDrafts }>();
const emit = defineEmits<{ 'update:rows': [GoalBandDrafts] }>();

type Kind = 'base' | 'bonus';
const KINDS: Kind[] = ['base', 'bonus'];
const BLANK: GoalBandDraft = { threshold: '', percent: '' };

const active = ref<PositionRole>('attack');

function list(kind: Kind): GoalBandDraft[] {
  return props.rows?.[active.value]?.[kind] || [];
}

function shown(kind: Kind): GoalBandDraft[] {
  const rows = list(kind);
  return rows.length ? rows : [{ ...BLANK }];
}

function kindLabel(kind: Kind): string {
  return kind === 'base' ? 'Goal difference (scored − given up)' : 'Bonus';
}

function condition(kind: Kind): string {
  if (kind === 'base') return 'Goal difference at least';
  return active.value === 'attack' ? 'Goals scored at least' : 'Goals given up at most';
}

function write(kind: Kind, next: GoalBandDraft[]): void {
  const role = props.rows[active.value];
  emit('update:rows', { ...props.rows, [active.value]: { ...role, [kind]: next } });
}

function set(kind: Kind, index: number, field: keyof GoalBandDraft, value: string): void {
  write(kind, shown(kind).map((r, i) => (i === index ? { ...r, [field]: value } : r)));
}

function add(kind: Kind): void {
  write(kind, shown(kind).concat([{ ...BLANK }]));
}

function remove(kind: Kind, index: number): void {
  const kept = shown(kind).filter((_, i) => i !== index);
  write(kind, kept.length ? kept : [{ ...BLANK }]);
}

const check = computed(() => draftsToGoalBands(props.rows?.[active.value] || { base: [], bonus: [] }));

const example = computed(() => {
  const c = check.value;
  if (!c.ok) return '';
  return goalBandExample(active.value, c.bands.map(b => ({ ...b, role: active.value })));
});

const problem = computed(() => (check.value.ok ? '' : (check.value as { error: string }).error));
</script>

<template>
  <div class="goals" :data-goal-bands="props.drillId">
    <p class="goals__head">
      Standards for this squad, per role. Each band earns a share of the
      exercise's weight; the best goal-difference band plus the best bonus
      band may not add up to more than 100%.
    </p>

    <div class="tabs" role="tablist">
      <button
        v-for="r in GOAL_ROLES" :key="r"
        type="button" role="tab" class="tab" :class="{ 'tab--on': active === r }"
        :aria-selected="active === r ? 'true' : 'false'"
        :data-goal-role-tab="r"
        @click="active = r"
      >{{ roleLabel(r) }}</button>
    </div>

    <section v-for="kind in KINDS" :key="kind" class="list" :data-goal-kind="kind">
      <p class="list__label">{{ kindLabel(kind) }}</p>
      <div v-for="(row, i) in shown(kind)" :key="i" class="list__row" data-goal-band-row>
        <span class="cond">{{ condition(kind) }}</span>
        <input
          class="inp" type="text" inputmode="numeric" placeholder="2"
          :aria-label="condition(kind)"
          :value="row.threshold" data-goal-threshold
          @input="set(kind, i, 'threshold', ($event.target as HTMLInputElement).value)"
        />
        <span class="cond">earns</span>
        <input
          class="inp" type="number" min="0" max="100" step="5" placeholder="50"
          aria-label="Percent of the weight"
          :value="row.percent" data-goal-percent
          @input="set(kind, i, 'percent', ($event.target as HTMLInputElement).value)"
        />
        <span class="cond">%</span>
        <button type="button" class="btn" data-goal-remove @click="remove(kind, i)">Remove</button>
      </div>
      <button type="button" class="btn" :data-goal-add="kind" @click="add(kind)">+ Add a band</button>
    </section>

    <p v-if="problem" class="problem" role="alert" data-goal-problem>{{ problem }}</p>
    <p v-else class="example" data-goal-example>{{ example }}</p>
  </div>
</template>

<style scoped>
.goals {
  margin: 0.4rem 0 0.2rem 1rem;
  padding: 0.5rem 0.7rem;
  border-left: 2px solid var(--rule);
}

.goals__head { margin: 0 0 0.45rem; max-width: 36rem; color: var(--ink-muted); font-size: 0.74rem; line-height: 1.5; }

.tabs { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }

.tab {
  padding: 0.22rem 0.6rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 0.74rem;
  cursor: pointer;
}

.tab--on { border-color: var(--live); color: var(--live); }

.list { margin-bottom: 0.45rem; }
.list__label { margin: 0 0 0.3rem; color: var(--ink); font-size: 0.74rem; }
.list__row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 0.35rem; }
.cond { color: var(--ink-muted); font-size: 0.74rem; }

.inp {
  max-width: 4.5rem;
  padding: 0.28rem 0.45rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: var(--surface-deep);
  color: var(--ink);
  font: inherit;
  font-size: 0.8rem;
}

.btn {
  padding: 0.22rem 0.55rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.example { margin: 0.3rem 0 0; color: var(--ink); font-size: 0.76rem; font-variant-numeric: tabular-nums; }
.problem { margin: 0.3rem 0 0; color: var(--color-danger); font-size: 0.76rem; }
</style>
```

- [ ] **Step 4: Run the editor test**

Run: `npx vitest run src/components/matrix/GoalBandsEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing WeightsModal tests**

In `src/components/matrix/WeightsModal.test.ts`:
- Add `const fetchGoalBands = vi.fn();` and `const saveGoalBands = vi.fn();`.
- Add both to the mocked `supabaseService`.
- In `beforeEach`, add `fetchGoalBands.mockResolvedValue(GOAL_BANDS);` and `saveGoalBands.mockResolvedValue({ ok: true });`.
- Change the `'offers all five measures'` test to `'offers all six measures'`, expecting `['head_to_head', 'win_loss', 'count_high', 'time_low', 'time_bands', 'role_goals']`.
- Add the fixtures and tests below.

```ts
const GOALS = 'd-goals';
const GOAL_DRILLS = [...DRILLS, { id: GOALS, name: '1v1 Attack', category: 'Finishing', measure: 'role_goals', points: 3 }];
const GOAL_BANDS = [
  { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 },
  { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 },
  { role: 'defend', kind: 'base', threshold: 0, factor: 1 }
];

describe('Goals by role', () => {
  it('shows the per-role editor for a Goals-by-role exercise only', async () => {
    const w = await mountWeights(GOAL_DRILLS);
    expect(w.find(`[data-goal-bands="${GOALS}"]`).exists()).toBe(true);
    expect(w.find(`[data-goal-bands="${LAPS}"]`).exists()).toBe(false);
    expect(fetchGoalBands).toHaveBeenCalledWith(GOALS, 't1');
    expect(w.find(`[data-goal-bands="${GOALS}"] [data-goal-example]`).text()).toBe('+1 with 3 scored → 50% + 10% = 60%');
  });

  it("saves every role's bands for the ACTIVE SQUAD, as factors", async () => {
    const w = await mountWeights(GOAL_DRILLS);
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(saveGoalBands).toHaveBeenCalledTimes(3);
    expect(saveGoalBands).toHaveBeenCalledWith(GOALS, 't1', 'attack', [
      { kind: 'base', threshold: 1, factor: 0.5 },
      { kind: 'bonus', threshold: 3, factor: 0.1 }
    ]);
    expect(saveGoalBands).toHaveBeenCalledWith(GOALS, 't1', 'defend', [{ kind: 'base', threshold: 0, factor: 1 }]);
    expect(saveGoalBands).toHaveBeenCalledWith(GOALS, 't1', 'keeper', []);
  });

  it('names the exercise and the role when the database refuses', async () => {
    const w = await mountWeights(GOAL_DRILLS);
    saveGoalBands.mockResolvedValueOnce({ ok: false, error: 'Only a coach of this team can set its standards.' });
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(w.find('[data-weights-error]').text())
      .toBe('Weights saved. Attack standards for 1v1 Attack: Only a coach of this team can set its standards.');
  });

  it('refuses a pair over 100% without sending it', async () => {
    const w = await mountWeights(GOAL_DRILLS);
    await w.find(`[data-goal-bands="${GOALS}"] [data-goal-kind="bonus"] [data-goal-percent]`).setValue('60');
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(saveGoalBands).not.toHaveBeenCalled();
    expect(w.find('[data-weights-error]').text()).toMatch(/Attack standards for 1v1 Attack: .*more than 100%/);
  });

  it('does not write goal standards when the weights were refused', async () => {
    const w = await mountWeights(GOAL_DRILLS);
    updateDrillWeights.mockResolvedValue({ ok: false, error: 'no', updated: 0 });
    await w.find('[data-weights-save]').trigger('click');
    await flush();
    expect(saveGoalBands).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run src/components/matrix/WeightsModal.test.ts`
Expected: the `Goals by role` tests and "offers all six measures" FAIL. The other existing tests PASS.

- [ ] **Step 7: Implement in `WeightsModal.vue`**

Imports:

```ts
import GoalBandsEditor from './GoalBandsEditor.vue';
import { roleLabel } from '../../domain/position';
import {
  GOAL_ROLES, emptyGoalDrafts, goalDraftsFromBands, draftsToGoalBands, type GoalBandDrafts
} from '../../domain/goal-bands-draft';
```

Add `['role_goals', 'Goals by role']` as the last entry of `MEASURES`.

State and helpers, beside `bandDrafts`:

```ts
/** Per drill, per role; kept when the measure is switched away and back, like bandDrafts. */
const goalDrafts = ref<Record<string, GoalBandDrafts>>({});

const goalDrilled = computed(() => drafts.value.filter(d => d.measure === 'role_goals'));

function goalDraftsFor(id: string): GoalBandDrafts {
  return goalDrafts.value[id] || emptyGoalDrafts();
}

function setGoalDrafts(id: string, rows: GoalBandDrafts): void {
  goalDrafts.value = { ...goalDrafts.value, [id]: rows };
}
```

At the end of `load()`, after the time-bands loop:

```ts
  for (const d of goalDrilled.value) {
    const rows = await supabaseService.fetchGoalBands(d.id, props.teamId);
    goalDrafts.value = { ...goalDrafts.value, [d.id]: goalDraftsFromBands(rows || []) };
  }
```

In `onSave`, after the time-bands loop and before the notice:

```ts
    for (const d of goalDrilled.value) {
      if (!props.teamId) {
        error.value = 'Weights saved, but standards need a team. Choose one in the header.';
        return;
      }
      const roles = goalDraftsFor(d.id);
      for (const role of GOAL_ROLES) {
        // Checked here first so a bad row is named beside nothing else having
        // been sent; save_goal_bands makes the same refusals in the same words.
        const parsed = draftsToGoalBands(roles[role]);
        const label = `${roleLabel(role)} standards for ${d.name}`;
        if (!parsed.ok) {
          error.value = `Weights saved. ${label}: ${(parsed as { error: string }).error}`;
          return;
        }
        const res = await supabaseService.saveGoalBands(d.id, props.teamId, role, parsed.bands);
        if (!res?.ok) {
          error.value = `Weights saved. ${label}: ${res?.error || 'could not be saved.'}`;
          return;
        }
      }
      const fresh = await supabaseService.fetchGoalBands(d.id, props.teamId);
      goalDrafts.value = { ...goalDrafts.value, [d.id]: goalDraftsFromBands(fresh || []) };
    }
```

Template: after the `<BandsEditor … />`, add:

```html
      <GoalBandsEditor
        v-if="d.measure === 'role_goals'"
        :drill-id="d.id" :rows="goalDraftsFor(d.id)"
        @update:rows="setGoalDrafts(d.id, $event)"
      />
```

The `refuses a pair over 100%` test sends nothing for any role. That is correct: Attack is checked first, and the save stops there.

- [ ] **Step 8: Run the tests and typecheck**

Run: `npx vitest run src/components/matrix/WeightsModal.test.ts src/components/matrix/GoalBandsEditor.test.ts`
Expected: PASS.
Run: `npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 9: Commit**

```bash
git add src/components/matrix/GoalBandsEditor.vue src/components/matrix/GoalBandsEditor.test.ts src/components/matrix/WeightsModal.vue src/components/matrix/WeightsModal.test.ts
git commit -m "feat: set Goals by role standards per squad and role in Weights and standards" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Player Ratings — leaderboard, below-standard, breakdown, export, report pickers

**Files:**
- Modify: `src/domain/matrix.ts`, `src/domain/matrix.test.ts`
- Modify: `src/domain/matrix-threshold.ts`, `src/domain/matrix-threshold.test.ts`
- Modify: `src/stores/matrix.ts`
- Modify: `src/components/matrix/ExerciseLeaderboard.vue`
- Create: `src/components/matrix/ExerciseLeaderboard.test.ts`
- Modify: `src/domain/matrix-breakdown.ts`, `src/domain/matrix-breakdown.test.ts`
- Modify: `src/domain/exercise-export.ts`, `src/domain/exercise-export.test.ts`
- Modify: `src/components/matrix/ProgressModal.vue`, `src/components/matrix/ProgressModal.test.ts`
- Modify: `src/components/matrix/SquadReportModal.vue`, `src/components/matrix/SquadReportModal.test.ts`

**Interfaces:**
- Consumes:
  - view columns `role, goals_for, goals_against, base_factor, bonus_factor` and `kind = 'role_goals'` (Tasks 1 and 3);
  - `percentLabel` (Task 2);
  - `formatGoalDifference` (Task 2);
  - `GOAL_ROLES` (Task 2);
  - `roleLabel`.
- Produces:
  - Leaderboard rows gain `role: string | null`, `goalsFor: number | null`, `goalsAgainst: number | null`, `diff: number | null`, `baseFactor: number | null`, `bonusFactor: number | null`, `latestOn: string`. These come from the player's latest `role_goals` line.
  - Sort keys `'role' | 'score' | 'diff' | 'base' | 'bonus'`.
  - `roleGoalStanding(row): 'met' | 'below' | 'none'`
  - `roleGoalShortfall(rows): { role: PositionRole; below: number; of: number }[]`
  - `roleShortfallLine(s): string`
  - Store: `matrix.roleShortfall`.

- [ ] **Step 1: Write the failing domain tests**

Append to `src/domain/matrix.test.ts`. It uses the file's `ctx` and `row` helpers. Add `{ id: GOALS, name: '1v1 Attack', measure: 'role_goals' }` to `ctx`'s `drillsBank` and `const GOALS = 'd-goals';` beside the other ids:

```ts
describe('a Goals-by-role leaderboard', () => {
  const g = (over: any) => row({
    drill_id: GOALS, kind: 'role_goals', weight: 3, available: 3, ...over
  });

  it("shows each player's latest result and totals the points", () => {
    const rows = exerciseLeaderboard(ctx([
      g({ player_id: 'p1', occurred_on: '2026-09-01', role: 'defend', goals_for: 0, goals_against: 2,
          raw_value: -2, base_factor: 0, bonus_factor: 0, earned: 0 }),
      g({ player_id: 'p1', occurred_on: '2026-09-08', role: 'attack', goals_for: 3, goals_against: 1,
          raw_value: 2, base_factor: '0.500', bonus_factor: '0.100', earned: 1.8 })
    ]), GOALS);
    expect(rows[0]).toMatchObject({
      role: 'attack', goalsFor: 3, goalsAgainst: 1, diff: 2, baseFactor: 0.5, bonusFactor: 0.1,
      earned: 1.8, available: 6
    });
  });

  it('leaves the figures empty for a player with only a no-show', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ drill_id: GOALS, kind: 'absent', player_id: 'p2', weight: 3, available: 3 })
    ]), GOALS);
    expect(rows[0]).toMatchObject({ role: null, goalsFor: null, diff: null, baseFactor: null });
  });

  it('sorts by goal difference, highest first, with blanks last either way', () => {
    const points = [
      g({ player_id: 'p1', role: 'attack', goals_for: 1, goals_against: 1, raw_value: 0, base_factor: 0.2, bonus_factor: 0 }),
      g({ player_id: 'p2', role: 'attack', goals_for: 4, goals_against: 1, raw_value: 3, base_factor: 0.8, bonus_factor: 0 }),
      row({ drill_id: GOALS, kind: 'not_entered', player_id: 'p3', weight: 3, available: 3 })
    ];
    expect(exerciseLeaderboard(ctx(points), GOALS, 'diff', false).map(r => r.playerId)).toEqual(['p2', 'p1', 'p3']);
    expect(exerciseLeaderboard(ctx(points), GOALS, 'diff', true).map(r => r.playerId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('sorts by role alphabetically and by base, bonus and score', () => {
    const points = [
      g({ player_id: 'p1', role: 'defend', goals_for: 0, goals_against: 0, raw_value: 0, base_factor: 0.6, bonus_factor: 0.4 }),
      g({ player_id: 'p2', role: 'attack', goals_for: 5, goals_against: 1, raw_value: 4, base_factor: 0.8, bonus_factor: 0.2 })
    ];
    expect(exerciseLeaderboard(ctx(points), GOALS, 'role', false).map(r => r.playerId)).toEqual(['p2', 'p1']);
    expect(exerciseLeaderboard(ctx(points), GOALS, 'base', false).map(r => r.playerId)).toEqual(['p2', 'p1']);
    expect(exerciseLeaderboard(ctx(points), GOALS, 'bonus', false).map(r => r.playerId)).toEqual(['p1', 'p2']);
    expect(exerciseLeaderboard(ctx(points), GOALS, 'score', false).map(r => r.playerId)).toEqual(['p2', 'p1']);
  });

  it('reads role ascending and the figures descending on first click', () => {
    expect(exerciseSortDescends('role', false)).toBe(false);
    for (const by of ['score', 'diff', 'base', 'bonus']) expect(exerciseSortDescends(by, false)).toBe(true);
  });
});
```

Append to `src/domain/matrix-threshold.test.ts`. Extend the import with `roleGoalStanding, roleGoalShortfall, roleShortfallLine`:

```ts
describe('Goals-by-role standing', () => {
  it('is below the standard when the base earned nothing, whatever the bonus', () => {
    expect(roleGoalStanding({ role: 'attack', baseFactor: 0, bonusFactor: 0.2 })).toBe('below');
    expect(roleGoalStanding({ role: 'attack', baseFactor: 0.25, bonusFactor: 0 })).toBe('met');
    expect(roleGoalStanding({ role: null, baseFactor: null })).toBe('none');
  });

  it('counts per role, in role order, leaving out roles nobody played and players with no result', () => {
    const rows = [
      { role: 'attack', baseFactor: 0 }, { role: 'attack', baseFactor: 0.5 }, { role: 'attack', baseFactor: 0 },
      { role: 'keeper', baseFactor: 0.9 },
      { role: null, baseFactor: null }
    ];
    expect(roleGoalShortfall(rows as any)).toEqual([
      { role: 'attack', below: 2, of: 3 },
      { role: 'keeper', below: 0, of: 1 }
    ]);
  });

  it('words each count', () => {
    expect(roleShortfallLine({ role: 'attack', below: 2, of: 6 })).toBe('2 of 6 attackers below the standard');
    expect(roleShortfallLine({ role: 'defend', below: 1, of: 1 })).toBe('1 of 1 defender below the standard');
    expect(roleShortfallLine({ role: 'keeper', below: 0, of: 2 })).toBe('0 of 2 goalkeepers below the standard');
  });
});
```

Append to `src/domain/matrix-breakdown.test.ts`:

```ts
describe('a Goals-by-role result', () => {
  it('reads role, score, goal difference and the two shares', () => {
    expect(detail({ kind: 'role_goals', role: 'attack', goals_for: 3, goals_against: 1,
      base_factor: '0.500', bonus_factor: '0.100', raw_value: 2 }))
      .toBe('Attack · 3-1 (+2) · 50% + 10%');
  });

  it('signs nothing for an even game and names a defender in roster words', () => {
    expect(detail({ kind: 'role_goals', role: 'defend', goals_for: 1, goals_against: 1,
      base_factor: 0.6, bonus_factor: 0, raw_value: 0 }))
      .toBe('Defence · 1-1 (0) · 60% + 0%');
  });
});
```

Append to `src/domain/exercise-export.test.ts`:

```ts
describe('a Goals-by-role exercise', () => {
  const GOAL_ROWS = [
    { playerId: 'p1', recordingNumber: 9, name: 'Ash Attacker', role: 'attack', goalsFor: 3, goalsAgainst: 1,
      diff: 2, baseFactor: 0.5, bonusFactor: 0.1, earned: 1.8, available: 3 },
    { playerId: 'p2', recordingNumber: 4, name: 'Dee Defender', role: 'defend', goalsFor: 0, goalsAgainst: 3,
      diff: -3, baseFactor: 0, bonusFactor: 0, earned: 0, available: 3 },
    { playerId: 'p3', recordingNumber: 1, name: 'Absent Al', role: null, goalsFor: null, goalsAgainst: null,
      diff: null, baseFactor: null, bonusFactor: null, earned: 0, available: 3 }
  ];
  const opts = { exercise: '1v1 Attack', measure: 'role_goals', organization: 'Org', rows: GOAL_ROWS };

  it('exports role, score, goal difference, both shares and the standard', () => {
    expect(exerciseSheet(opts)).toEqual([
      { '#': 9, Player: 'Ash Attacker', Role: 'Attack', Score: '3-1', 'Goal difference': '+2',
        'Base %': '50%', 'Bonus %': '10%', Points: '1.80', Of: '3.00', Standard: 'met' },
      { '#': 4, Player: 'Dee Defender', Role: 'Defence', Score: '0-3', 'Goal difference': '-3',
        'Base %': '0%', 'Bonus %': '0%', Points: '0.00', Of: '3.00', Standard: 'below' },
      { '#': 1, Player: 'Absent Al', Role: '', Score: '', 'Goal difference': '',
        'Base %': '', 'Bonus %': '', Points: '0.00', Of: '3.00', Standard: '' }
    ]);
  });

  it('explains the standard on the printed sheet', () => {
    expect(buildExercisePrintDocument(opts)).toMatch(/per role, not a ranking/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/domain/matrix.test.ts src/domain/matrix-threshold.test.ts src/domain/matrix-breakdown.test.ts src/domain/exercise-export.test.ts`
Expected: FAIL. `roleGoalStanding` is not exported, the rows have no `role`, and the breakdown reads `2`.

- [ ] **Step 3: Implement the domain changes**

**`src/domain/matrix.ts`**

In `exerciseLeaderboard`, add these fields to the accumulator's initial object:

```ts
      role: null, goalsFor: null, goalsAgainst: null, diff: null,
      baseFactor: null, bonusFactor: null, latestOn: '',
```

At the top of the `forEach` body, straight after `a.available += …` and **before** the `raw_value` early return, add:

```ts
    // Goals by role: the figures shown are the player's LATEST result. A role
    // can change between sessions, so adding scores across them would mix an
    // attacker's goals with a defender's. Points above still total every one.
    if (r.kind === 'role_goals' && String(r.occurred_on || '') >= a.latestOn) {
      const num = (v: any) => (v === null || v === undefined ? null : Number(v));
      a.latestOn = String(r.occurred_on || '');
      a.role = r.role ?? null;
      a.goalsFor = num(r.goals_for);
      a.goalsAgainst = num(r.goals_against);
      a.diff = a.goalsFor !== null && a.goalsAgainst !== null ? a.goalsFor - a.goalsAgainst : null;
      a.baseFactor = num(r.base_factor);
      a.bonusFactor = num(r.bonus_factor);
    }
```

In `compareExerciseRows`, add this before the `if (by === 'name')` block:

```ts
  if (by === 'role') {
    if (x.role === null || y.role === null) {
      if (x.role === y.role) return 0;
      return x.role === null ? 1 : -1;
    }
    return flip * String(x.role).localeCompare(String(y.role));
  }

  // Goals by role's figures: highest first, blanks last whichever way.
  const GOAL_FIELDS: Record<string, string> = { score: 'goalsFor', diff: 'diff', base: 'baseFactor', bonus: 'bonusFactor' };
  if (GOAL_FIELDS[by]) {
    const f = GOAL_FIELDS[by];
    if (x[f] === null || x[f] === undefined || y[f] === null || y[f] === undefined) {
      const xn = x[f] === null || x[f] === undefined;
      const yn = y[f] === null || y[f] === undefined;
      if (xn === yn) return 0;
      return xn ? 1 : -1;
    }
    if (y[f] !== x[f]) return flip * (y[f] - x[f]);
    return flip * (y.earned - x.earned);
  }
```

In `exerciseSortDescends`, change the first line to `if (by === 'name' || by === 'number' || by === 'role') return false;`.

**`src/domain/matrix-threshold.ts`**

Add `import type { PositionRole } from './position';` at the top. Append:

```ts
/**
 * Goals by role: is this player's latest result below the standard for their role?
 *
 * Below means the BASE -- goal difference -- met no band. The bonus is extra
 * credit, not the standard, so a 6-7 attacker who took the scoring bonus is
 * still below. 'none' is a player with no scored result: a no-show, a row
 * nobody entered, or a role this squad has no standards for (the database
 * leaves those out), and none of them is counted against a role.
 *
 * Emphasis only, like bandStanding: nothing here removes a row or a sort.
 */
export type RoleGoalStanding = 'met' | 'below' | 'none';

export function roleGoalStanding(row: any): RoleGoalStanding {
  if (!row?.role || row.baseFactor === null || row.baseFactor === undefined) return 'none';
  return Number(row.baseFactor) > 0 ? 'met' : 'below';
}

export interface RoleShortfall { role: PositionRole; below: number; of: number }

const ROLE_ORDER: PositionRole[] = ['attack', 'defend', 'keeper'];

/** "2 of 6 attackers": per role, in role order, only roles someone played. */
export function roleGoalShortfall(rows: any[]): RoleShortfall[] {
  return ROLE_ORDER
    .map(role => {
      const mine = (rows || []).filter(r => r?.role === role && roleGoalStanding(r) !== 'none');
      return { role, below: mine.filter(r => roleGoalStanding(r) === 'below').length, of: mine.length };
    })
    .filter(s => s.of > 0);
}

const ROLE_NOUNS: Record<PositionRole, [string, string]> = {
  attack: ['attacker', 'attackers'],
  defend: ['defender', 'defenders'],
  keeper: ['goalkeeper', 'goalkeepers']
};

export function roleShortfallLine(s: RoleShortfall): string {
  const [one, many] = ROLE_NOUNS[s.role];
  return `${s.below} of ${s.of} ${s.of === 1 ? one : many} below the standard`;
}
```

(`ROLE_ORDER` repeats `GOAL_ROLES` rather than importing `goal-bands-draft.ts` into this module. That keeps `matrix-threshold` free of editor code, and the test pins the order.)

**`src/domain/matrix-breakdown.ts`**

Add imports:

```ts
import { roleLabel, type PositionRole } from './position';
import { formatGoalDifference } from './goal-score';
import { percentLabel } from './role-goal-score';
```

Add this branch before `if (row.kind === 'absent')`:

```ts
  if (row.kind === 'role_goals') {
    // The exercise and "1.8 of 3.0" sit in the modal's own columns; this cell
    // says what the player did and which shares it earned.
    const parts = [row.role ? roleLabel(row.role as PositionRole) : 'no role'];
    if (row.goals_for != null && row.goals_against != null) {
      const gf = Number(row.goals_for);
      const ga = Number(row.goals_against);
      parts.push(`${gf}-${ga} (${formatGoalDifference(gf - ga)})`);
    }
    parts.push(`${percentLabel(Number(row.base_factor) || 0)} + ${percentLabel(Number(row.bonus_factor) || 0)}`);
    return parts.join(' · ');
  }
```

**`src/domain/exercise-export.ts`**

Add imports:

```ts
import { roleGoalStanding } from './matrix-threshold';
import { roleLabel, type PositionRole } from './position';
import { formatGoalDifference } from './goal-score';
import { percentLabel } from './role-goal-score';
```

(Merge `roleGoalStanding` into the existing `matrix-threshold` import line.)

In `exerciseSheet`, add `const roleGoals = options.measure === 'role_goals';` and replace the `if (winLoss) … else …` block:

```ts
    if (winLoss) {
      out['W-D-L'] = `${r.wins || 0} - ${r.draws || 0} - ${r.losses || 0}`;
    } else if (roleGoals) {
      const has = (v: any) => v !== null && v !== undefined;
      out.Role = r.role ? roleLabel(r.role as PositionRole) : '';
      out.Score = has(r.goalsFor) && has(r.goalsAgainst) ? `${r.goalsFor}-${r.goalsAgainst}` : '';
      out['Goal difference'] = has(r.diff) ? formatGoalDifference(r.diff) : '';
      out['Base %'] = has(r.baseFactor) ? percentLabel(r.baseFactor) : '';
      out['Bonus %'] = has(r.bonusFactor) ? percentLabel(r.bonusFactor) : '';
    } else {
      out['Best time'] = figure(r, r.best);
      out.Average = figure(r, r.avg);
    }
```

After the `if (threshold) {…}` block, add:

```ts
    if (roleGoals) {
      const s = roleGoalStanding(r);
      out.Standard = s === 'none' ? '' : s;
    }
```

In `buildExercisePrintDocument`:
- Change the `textual` set to `new Set(['Player', 'Standard', 'Runs', 'W-D-L', 'Role', 'Score'])`.
- Change `standardNote` to:

```ts
  const standardNote = isThresholdMeasure(options.measure)
    ? `<p class="note">A match-readiness standard, not a ranking. A player meets it
       once his fastest run clears the bar; “runs” says how many of his runs did.
       “No runs” means the exercise has not been attempted.</p>`
    : options.measure === 'role_goals'
      ? `<p class="note">Scored against standards per role, not a ranking. Each row is the
         player’s latest result; “below” means the goal difference met no band for their role.
         Points total every session.</p>`
      : '';
```

- [ ] **Step 4: Run the domain tests**

Run: `npx vitest run src/domain/matrix.test.ts src/domain/matrix-threshold.test.ts src/domain/matrix-breakdown.test.ts src/domain/exercise-export.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing component tests**

Create `src/components/matrix/ExerciseLeaderboard.test.ts`:

```ts
/**
 * One exercise's leaderboard, for a Goals-by-role drill.
 *
 * The below-standard emphasis is additive: every player stays on screen in the
 * order chosen. The per-role count is the headline a coach reads.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import ExerciseLeaderboard from './ExerciseLeaderboard.vue';

vi.mock('../../data/supabase', () => ({ supabaseService: {} }));

const GOALS = 'd-goals';
const players = [
  { id: 'p1', name: 'Ash Attacker', recordingNumber: 9 },
  { id: 'p2', name: 'Bo Attacker', recordingNumber: 10 },
  { id: 'p3', name: 'Dee Defender', recordingNumber: 4 },
  { id: 'p4', name: 'Absent Al', recordingNumber: 1 }
];
const line = (over: any) => ({
  drill_id: GOALS, kind: 'role_goals', weight: 3, available: 3, w: 0, dr: 0, ls: 0,
  occurred_on: '2026-09-14', ...over
});
const exercisePoints = [
  line({ player_id: 'p1', role: 'attack', goals_for: 3, goals_against: 1, raw_value: 2, base_factor: 0.5, bonus_factor: 0.1, earned: 1.8 }),
  line({ player_id: 'p2', role: 'attack', goals_for: 6, goals_against: 7, raw_value: -1, base_factor: 0, bonus_factor: 0.2, earned: 0.6 }),
  line({ player_id: 'p3', role: 'defend', goals_for: 0, goals_against: 0, raw_value: 0, base_factor: 0.6, bonus_factor: 0.4, earned: 3 }),
  line({ player_id: 'p4', kind: 'absent', raw_value: null, earned: 0 })
];

function mountBoard() {
  return mount(ExerciseLeaderboard, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn, stubActions: false,
        initialState: {
          matrix: {
            players, exercisePoints, exerciseFilter: GOALS,
            drillsBank: [{ id: GOALS, name: '1v1 Attack', measure: 'role_goals' }]
          },
          organization: {}
        }
      })]
    }
  });
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('a Goals-by-role leaderboard', () => {
  it('has the role columns and no best or average', () => {
    const heads = mountBoard().findAll('[data-exercise-sort]').map(b => b.attributes('data-exercise-sort'));
    expect(heads).toEqual(['number', 'name', 'role', 'score', 'diff', 'base', 'bonus', 'earned']);
  });

  it("shows each player's role, score, goal difference and shares", () => {
    const w = mountBoard();
    const ash = w.findAll('[data-leaderboard-row]').find(r => r.text().includes('Ash Attacker'))!;
    expect(ash.text()).toContain('Attack');
    expect(ash.text()).toContain('3-1');
    expect(ash.text()).toContain('+2');
    expect(ash.text()).toContain('50%');
    expect(ash.text()).toContain('10%');
  });

  it('counts below-standard players per role and marks them, removing nobody', () => {
    const w = mountBoard();
    expect(w.findAll('[data-leaderboard-row]')).toHaveLength(4);
    expect(w.find('[data-role-shortfall="attack"]').text()).toBe('1 of 2 attackers below the standard');
    expect(w.find('[data-role-shortfall="defend"]').text()).toBe('0 of 1 defender below the standard');
    const marked = w.findAll('[data-below-standard]').map(m => m.element.closest('tr')!.textContent);
    expect(marked).toHaveLength(1);
    expect(marked[0]).toContain('Bo Attacker');
  });

  it('keeps every sort available', async () => {
    const w = mountBoard();
    await w.find('[data-exercise-sort="diff"]').trigger('click');
    expect(w.findAll('[data-leaderboard-row]')).toHaveLength(4);
    expect(w.findAll('[data-leaderboard-row]')[0].text()).toContain('Ash Attacker');
  });
});
```

(If `useOrganizationStore`'s state needs fields beyond `{}` to render — `branding.name`, `activeTeam` — set `organization: { branding: { name: '' } }` there. `exportOptions` is only read on a click.)

In `src/components/matrix/ProgressModal.test.ts`, add `{ id: 'd-goals', name: '1v1 Attack', measure: 'role_goals' }` to `DRILLS` and append:

```ts
describe('Goals by role', () => {
  it('is not offered: the chart plots one value per session, which this measure does not have', async () => {
    const w = await mountProgress();
    const offered = w.find('[data-progress-drill]').findAll('option').map((o: any) => o.text());
    expect(offered).not.toContain('1v1 Attack');
    expect(offered).toContain('Coopers');
  });
});
```

In `src/components/matrix/SquadReportModal.test.ts`, add `const GOALS = 'd-goals';` and `{ id: GOALS, name: '1v1 Attack', measure: 'role_goals' }` to `DRILLS`. Append:

```ts
describe('Goals by role', () => {
  it('is left out of the report even when the squad has recorded it', async () => {
    const w = await mountReport({
      history: [...HISTORY, { drillId: GOALS, playerId: 'p1', attendance: 'present', rawValue: null, occurredOn: '2026-09-14' }]
    });
    const names = w.findAll('[data-squad-exercise]').map((s: any) => s.text());
    expect(names.some((t: string) => t.includes('1v1 Attack'))).toBe(false);
    expect(names.some((t: string) => t.includes('3 Laps'))).toBe(true);
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run src/components/matrix/ExerciseLeaderboard.test.ts src/components/matrix/ProgressModal.test.ts src/components/matrix/SquadReportModal.test.ts`
Expected: the new tests FAIL; existing tests PASS.

- [ ] **Step 7: Implement the store and components**

**`src/stores/matrix.ts`**

Extend the threshold import with `roleGoalShortfall`, then add:

```ts
  /**
   * Goals by role: "2 of 6 attackers below the standard", per role.
   *
   * Emphasis only. Players in a role the squad has no standards for have no
   * scored line, so they are not counted.
   */
  const roleShortfall = computed(() =>
    measure.value === 'role_goals' ? roleGoalShortfall(leaderboard.value) : []);
```

Add `roleShortfall` to the returned object, beside `shortOfStandard`.

**`src/components/matrix/ExerciseLeaderboard.vue`**

Script:

```ts
import { bandStanding, roleGoalStanding, roleShortfallLine } from '../../domain/matrix-threshold';
import { roleLabel } from '../../domain/position';
import { formatGoalDifference } from '../../domain/goal-score';
import { percentLabel } from '../../domain/role-goal-score';
```

(Replace the existing `bandStanding` import line with the first line.)

```ts
const isRoleGoals = computed(() => matrix.measure === 'role_goals');
```

Replace `columns`:

```ts
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
```

Template:

1. After the `data-standard-summary` block, add:

```html
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
```

2. Change the header's standard cell to `<th v-if="matrix.isThreshold || isRoleGoals">Standard</th>`.

3. In the row, replace `<template v-else>` (best/avg) with a `v-else-if` for role goals, followed by the original `v-else`:

```html
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
```

4. After the existing `<td v-if="matrix.isThreshold" …>…</td>`, add:

```html
            <td v-if="isRoleGoals" class="tnum">
              <span
                v-if="roleGoalStanding(r) === 'below'"
                class="mark mark--short" data-below-standard
              >△ below</span>
              <span v-else-if="roleGoalStanding(r) === 'met'" class="mark">met</span>
              <span v-else class="mark mark--none">—</span>
            </td>
```

5. Change `data-standing` on the row to `:data-standing="isRoleGoals ? roleGoalStanding(r) : standing(r)"`.

**`src/components/matrix/ProgressModal.vue`**

Replace `const drills = computed(() => matrix.drillsBank || []);` with:

```ts
/**
 * Every exercise except Goals by role: this chart plots one raw value per
 * session, and a Goals-by-role result is a role and two counts. Left out
 * rather than shown as an empty chart.
 */
const drills = computed(() => (matrix.drillsBank || []).filter((d: any) => d.measure !== 'role_goals'));
```

**`src/components/matrix/SquadReportModal.vue`**

In the `drills` computed, change the filter to `.filter((d: any) => used.has(d.id) && d.measure !== 'role_goals')`. Add a one-line comment: `// Goals by role has no single reading per session to report; left out, as in the progress chart.`

- [ ] **Step 8: Run the tests, typecheck and build**

Run: `npx vitest run src/components/matrix src/domain src/stores src/views/MatrixView.test.ts`
Expected: PASS.
Run: `npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"` then `npm run build > /dev/null 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0` both.

- [ ] **Step 9: Commit**

```bash
git add src/domain/matrix.ts src/domain/matrix.test.ts src/domain/matrix-threshold.ts src/domain/matrix-threshold.test.ts src/stores/matrix.ts src/components/matrix/ExerciseLeaderboard.vue src/components/matrix/ExerciseLeaderboard.test.ts src/domain/matrix-breakdown.ts src/domain/matrix-breakdown.test.ts src/domain/exercise-export.ts src/domain/exercise-export.test.ts src/components/matrix/ProgressModal.vue src/components/matrix/ProgressModal.test.ts src/components/matrix/SquadReportModal.vue src/components/matrix/SquadReportModal.test.ts
git commit -m "feat: show Goals by role on the leaderboard, breakdown and export" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation — handbook, CLAUDE.md, runbook, spec status

**Files:**
- Modify: `src/content/help.ts` (the Weights section, ~lines 346–362; the "Recording a session" steps, ~lines 389–396)
- Modify: `CLAUDE.md`
- Modify: `src/domain/position.ts` (module comment only)
- Modify: `docs/runbooks/2026-09-14-accounts-setup-runbook.md`
- Modify: `docs/superpowers/specs/2026-09-14-goals-by-role-design.md` (status line)

**Interfaces:**
- Consumes: everything above, by name.
- Produces: nothing code depends on.

- [ ] **Step 1: The handbook (`src/content/help.ts`)**

(a) In the "A reasonable starting point" table, add this row after `['1v1 gauntlet', '3.0', '1v1'],`:

```ts
            ['1v1 attackers against defenders', '3.0', 'Goals by role'],
```

(b) After the `${N('Standards are per squad', …)}` note and before `${N('Changing a weight re-scores history', …)}`, insert:

```ts
          <h4>Goals by role</h4>
          <p>For a 1v1 &mdash; or a 2v2 with attackers against defenders &mdash; choose
          <b>Goals by role</b>. Each player records one score for the whole drill from their own
          side: <b>3-1</b> is three scored, one given up. They are judged against the standards for
          their role: <b>Attack</b> on goal difference, with a bonus for goals scored;
          <b>Defence</b> and <b>Goalkeeper</b> on goal difference, with a bonus for goals given up.
          The role comes from the roster position number (1 goalkeeper, 2&ndash;6 defence,
          7&ndash;11 attack) and can be changed on the session sheet for that day.</p>
          ${N('The best band plus the best bonus is at most 100%', `<p>Both are a share of the
            exercise&rsquo;s weight, so a goal-difference band worth 80% leaves room for a bonus
            worth 20%. Save refuses a pair that adds up to more. Standards are per squad and per
            role; a role with no goal-difference band is not counted for that squad, and neither is
            a no-show while the squad has none at all.</p>`)}
```

Do **not** state the ranges as numbers anywhere else in the app's code. This sentence is handbook prose, the same as the existing roster help.

(c) In "Recording a session", change the third step's sentence `For a small-sided game, pick won, drew or lost instead.` to:

```
For a small-sided game, pick won, drew or lost instead. For <b>Goals by role</b>, check each player&rsquo;s role and type their score as <code>3-1</code>.
```

Run: `npx vitest run src/content src/domain/help-search.test.ts`
Expected: PASS.

- [ ] **Step 2: `src/domain/position.ts` comment**

In the module comment:
- Replace `and the Goals by role drill will read it too --` with `and the Goals by role session sheet reads it to pre-fill each player's role --`.
- Replace the last paragraph with:

```
 * The role strings are the ones the Goals by role drill stores
 * (matrix_session_results.role, drill_goal_bands.role, since 0037), so the two
 * can never disagree about what "defend" means.
```

- [ ] **Step 3: `CLAUDE.md`**

(a) In "A position is a number, 1 to 11", replace `and the Goals by role drill will read it too — that drill is designed but not built; nothing compares a position to 1, 6 or 7 or matches its text.` with `and the Goals by role session sheet reads it to pre-fill each player's role; nothing compares a position to 1, 6 or 7 or matches its text.`

(b) Directly after that section, add:

```markdown
### Goals by role is scored per role, against standards

Since `0037_goals_by_role.sql`. The sixth Matrix measure, `role_goals`, is for a 1v1 or attackers-against-defenders drill: each player records **one score for the whole drill from their own side** (`3-1`), with their **role for that session** — pre-filled from the position number by `roleOfPosition`, changeable on the sheet, never written back to the roster. Like `time_bands` it is a standard, not a ranking.

- **The rule** — per squad, per drill, per role, `drill_goal_bands` holds `base` bands (goal difference at least T) and `bonus` bands (attack: goals scored at least T; defend and keeper: goals given up at most T). A player earns the **highest** factor among the base bands met plus the highest among the bonus bands met, capped at 1, times the weight. "Highest met", not "tightest threshold", so a list typed out of order scores the way it reads.
- **A role with no base bands for the squad is left out**, as a squad with no time bands is. A no-show or an unentered player is charged 0 — unless the squad has no base bands for any role of that drill, when they are left out too.
- **Standards are written only through `save_goal_bands`.** `drill_goal_bands` has no write policy, because the 100% rule (a role's best base plus best bonus ≤ 100%) spans rows. The function fails closed with `coalesce(public.is_team_coach(...), false)` and refuses in sentences the app shows as they are; `goal-bands-draft.ts` makes the same refusals first so the editor can show them beside the boxes.
- **The browser holds a copy of the rule on purpose** — `domain/role-goal-score.ts`, for the live points on the sheet and the editor's worked example. `domain/role-goal-cases.ts` is one table of cases that both `role-goal-score.test.ts` and `src/data/testdb/goals-by-role.test.ts` run, so the preview and the stored points cannot disagree without a test failing. Change the rule in both, and add the case to the table.
- **A present Goals-by-role result needs a role and both counts**; the database cannot know a result's measure, so `saveMatrixSession` and the sheet refuse it instead. A present row missing any of them is silently not scored.
- **The leaderboard shows each player's latest result** (a role can change between sessions); points total every session. Below the standard means the base earned nothing — the bonus is extra credit.
- **The progress chart and squad report leave `role_goals` out**: they plot one raw value per session, which this measure does not have.
```

(c) In "`time_bands` is a standard, not a ranking", change `Four of the five Matrix measures` to `Four of the six Matrix measures`, and append this sentence to that first paragraph: `` `role_goals` is a standard too, per role — see *Goals by role* below. ``

(d) In "SQL files", change `…through \`supabase/migrations/0036_numbered_positions.sql\`.` to `…through \`supabase/migrations/0037_goals_by_role.sql\`.`

- [ ] **Step 4: The runbook**

In `docs/runbooks/2026-09-14-accounts-setup-runbook.md`:

(a) In section 4, insert a new step between step 4 (0036) and step 5 (Verify). Renumber the later steps (Verify → 6, notify → 7, push → 8):

```markdown
5. Paste the whole of `supabase/migrations/0037_goals_by_role.sql` and run it.
   It adds the Goals by role measure, its standards table and function, and
   rebuilds the two scoring views. Unlike 0036 it is safe on the older app —
   additive, and every column the older app reads is unchanged — but the new
   app **needs** it: it reads the new view columns, and without them the
   Ratings board loads empty. If it errors, its own transaction rolls it back;
   do not push until it has applied cleanly.
```

(b) In the Verify block, add:

```sql
   select to_regprocedure('public.save_goal_bands(uuid,uuid,text,jsonb)') is not null; -- true
   select count(*) from information_schema.columns
    where table_name = 'matrix_exercise_points'
      and column_name in ('role','goals_for','goals_against','base_factor','bonus_factor'); -- 5
```

(c) In the "Rollback" intro paragraph, append: `A third, the other way round: **0037** must stay applied while the new client is live (it reads 0037's view columns), so undo 0037 only **after** the client has been rolled back.`

(d) At the end of the file, append:

```markdown
### Undoing 0037 (Goals by role)

Run this only **after** the client has been rolled back: the newer client
selects columns this removes from `matrix_exercise_points`.

1. Supabase → the production project → SQL Editor. Run:

   ```sql
   begin;
   set role postgres;
   drop function if exists public.save_goal_bands(uuid, uuid, text, jsonb);
   drop view if exists public.matrix_standings;
   drop view if exists public.matrix_exercise_points;
   ```

2. In the same editor tab, **before committing**, paste the section of
   `supabase/migrations/0022_time_band_scoring.sql` from
   `create view public.matrix_exercise_points` through
   `grant select on public.matrix_standings to anon, authenticated;` and run it.
3. Then run:

   ```sql
   drop table if exists public.drill_goal_bands;
   commit;
   notify pgrst, 'reload schema';
   ```

The measure constraint and the three result columns (`role`, `goals_for`,
`goals_against`) are left in place: they are harmless to the older app, and
dropping them would destroy recorded Goals-by-role results. Under 0022's view
those sessions score nothing for players who were there, and still charge a
no-show or an unentered player 0 of the weight. Change such drills to another
measure, or delete those sessions, if that matters.
```

- [ ] **Step 5: The spec's status**

In `docs/superpowers/specs/2026-09-14-goals-by-role-design.md`, change `**Status:** awaiting sign-off` to `**Status:** approved and implemented (2026-09-14)`.

- [ ] **Step 6: All three gates, by exit code**

Run:
```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: `TEST=0`, `TYPECHECK=0`, `BUILD=0`. Any non-zero is a real failure. Run the failing command with its output to find it; do not report success.

- [ ] **Step 7: Commit**

```bash
git add src/content/help.ts CLAUDE.md src/domain/position.ts docs/runbooks/2026-09-14-accounts-setup-runbook.md docs/superpowers/specs/2026-09-14-goals-by-role-design.md
git commit -m "docs: Goals by role in the handbook, CLAUDE.md and the rollout runbook" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

**Spec coverage**
- Measure and label → Task 3 (`MEASURES`), Task 5 (`MEASURES` label list).
- Session sheet role pre-fill, change per session, stored role on reopen → Task 4.
- Score parsing (`3-1`, `3:1`, `3 1`, 0–99; refusals) → Task 2 (`parseGoalScore`), Task 4.
- Enter order; typing marks present; a present row needs both; `saveMatrixSession` refuses → Tasks 3 and 4.
- Live points text, and "no standards for …" → Task 2 (`roleGoalFeedback`), Task 4.
- Standards per squad, drill and role; base and bonus; whole numbers; 0–100 → Task 1 (table and function), Task 2 (drafts).
- Scoring: highest met; bonus independent; cap; role without base bands left out; no-show and not-entered rule → Task 1 (CTE + tests), Task 2 (browser copy + shared cases).
- Editor: tabs, two lists, worked example, refusals (100%, 0–100, whole number, duplicate, not coach, admin allowed) → Task 5, Task 1 (function tests).
- Leaderboard columns, sort, per-role below-standard, additive → Task 6.
- Breakdown line → Task 6 (Ruling 4).
- Export columns → Task 6.
- Progress and squad report leave `role_goals` out → Task 6.
- Schema: columns, checks, table, RLS select-only, function with EXECUTE to `authenticated` only → Task 1.
- Testing list (database and domain/component) → Tasks 1, 2, 4, 5, 6.
- Applies to an empty db and twice; existing points unchanged; direct insert refused → Task 1.

**Deliberate readings:** see "Rulings made while writing this plan".
