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
