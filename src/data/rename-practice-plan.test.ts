/**
 * Renaming a saved practice plan.
 *
 * Until now the planner named a plan when it was saved and offered no way to
 * change it afterwards, so a typo -- or a paste that landed mid-string, which
 * is how "Standard Varsity 90-Min HighShort Varsity 60-Min High Intensity
 * Intensity" came to exist in the live database -- could only be fixed in the
 * SQL editor.
 *
 * The rule that carries the weight: a plan is NOT a row. `practice_plans` holds
 * one row per drill slot, and a plan is the set of rows sharing a name. So
 * renaming means updating every slot, and renaming ONTO a name another plan
 * already has silently fuses the two into one session with overlapping times.
 * That has to be refused, not performed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';
const OTHER_TEAM = 'e812237b-3cc3-49a7-9805-9e0db40c92d5';

let rows: any[];
let updates: any[];

beforeEach(() => {
  updates = [];
  rows = [
    { id: 'r1', team_id: TEAM, name: 'Monday Session', is_deleted: false },
    { id: 'r2', team_id: TEAM, name: 'Monday Session', is_deleted: false },
    { id: 'r3', team_id: TEAM, name: 'Friday Session', is_deleted: false },
    { id: 'r4', team_id: OTHER_TEAM, name: 'Monday Session', is_deleted: false }
  ];

  svc.isConfigured = () => true;
  svc.client = {
    from() {
      let sel = rows.slice();
      let pending: Record<string, any> | null = null;
      const api: any = {
        select() { return api; },
        // PostgREST really applies this. A no-op stub would let the
        // soft-deleted-collision test pass no matter what the code did.
        or(expr: string) {
          const m = /^(\w+)\.is\.null,\1\.eq\.false$/.exec(expr || '');
          if (m) sel = sel.filter(r => !r[m[1]]);
          return api;
        },
        update(patch: Record<string, any>) { pending = patch; return api; },
        eq(col: string, val: any) {
          sel = sel.filter(r => r[col] === val);
          return api;
        },
        then(res: any) {
          if (pending) sel.forEach(r => updates.push({ id: r.id, ...pending }));
          return Promise.resolve({ data: sel, error: null }).then(res);
        }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('renaming every slot of a plan', () => {
  it('renames all the rows sharing that name', async () => {
    // A plan is the set of rows sharing a name -- renaming one slot would
    // split the plan in two.
    const res = await supabaseService.renamePracticePlan(TEAM, 'Monday Session', 'Monday High Press');
    expect(res.ok).toBe(true);
    expect(updates.map(u => u.id).sort()).toEqual(['r1', 'r2']);
    expect(updates.every(u => u.name === 'Monday High Press')).toBe(true);
  });

  it('reports how many slots moved, so the coach can be told', async () => {
    const res = await supabaseService.renamePracticePlan(TEAM, 'Monday Session', 'Monday High Press');
    expect(res.slots).toBe(2);
  });

  it('leaves another team\'s plan of the same name alone', async () => {
    // Plans are team-scoped; Varsity and JV may both have a "Monday Session".
    await supabaseService.renamePracticePlan(TEAM, 'Monday Session', 'Monday High Press');
    expect(updates.map(u => u.id)).not.toContain('r4');
  });
});

describe('refusing a rename that would fuse two plans', () => {
  it('REFUSES renaming onto a name this team already uses', async () => {
    // This is the whole point. Postgres would accept it happily and the coach
    // would end up with one session containing both plans' slots.
    const res = await supabaseService.renamePracticePlan(TEAM, 'Monday Session', 'Friday Session');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already/i);
    expect(updates).toHaveLength(0);
  });

  it('allows a name another TEAM uses, which is not a collision', async () => {
    rows.push({ id: 'r5', team_id: OTHER_TEAM, name: 'Taken Elsewhere', is_deleted: false });
    const res = await supabaseService.renamePracticePlan(TEAM, 'Monday Session', 'Taken Elsewhere');
    expect(res.ok).toBe(true);
  });

  it('ignores a soft-deleted plan when checking for a collision', async () => {
    rows.push({ id: 'r6', team_id: TEAM, name: 'Retired Plan', is_deleted: true });
    const res = await supabaseService.renamePracticePlan(TEAM, 'Monday Session', 'Retired Plan');
    expect(res.ok).toBe(true);
  });
});

describe('refusing nonsense', () => {
  it('refuses an empty new name', async () => {
    const res = await supabaseService.renamePracticePlan(TEAM, 'Monday Session', '   ');
    expect(res.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it('refuses a rename to the same name', async () => {
    const res = await supabaseService.renamePracticePlan(TEAM, 'Monday Session', 'Monday Session');
    expect(res.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it('refuses a school code where a team id belongs', async () => {
    // The bug this codebase keeps re-learning: 'bhs' into a uuid column fails
    // with 22P02, the service returns null, and the page renders nothing.
    const res = await supabaseService.renamePracticePlan('bhs', 'Monday Session', 'Anything');
    expect(res.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it('refuses when no plan of that name exists rather than reporting success', async () => {
    const res = await supabaseService.renamePracticePlan(TEAM, 'No Such Plan', 'Anything');
    expect(res.ok).toBe(false);
  });

  it('trims the new name rather than storing the spaces', async () => {
    await supabaseService.renamePracticePlan(TEAM, 'Monday Session', '  Monday High Press  ');
    expect(updates[0].name).toBe('Monday High Press');
  });
});
