/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;
const FROM = 'team-varsity';
const TO_SAME_ORG = 'team-jv';
const TO_OTHER_ORG = 'team-u16';

let inserted: Record<string, any>[];
let tables: Record<string, any[]>;

beforeEach(() => {
  inserted = [];
  tables = {
    practice_plans: [
      { id: 'r1', team_id: FROM, name: 'Standard 90', time_slot: '4:00 PM', duration: '15 min',
        drill: 'Dynamic Warmup', coach_notes: 'sharp', diagram_image: null, diagram_data: {} },
      { id: 'r2', team_id: FROM, name: 'Standard 90', time_slot: '4:15 PM', duration: '20 min',
        drill: '1v1 Gauntlet', coach_notes: '', diagram_image: null, diagram_data: {} }
    ],
    daily_thoughts: [
      { id: 't1', team_id: FROM, coach_name: 'Coach Bob', thoughts_text: 'Press high.', is_active: true }
    ],
    teams: [
      { id: FROM, school_id: 's-bhs', name: 'Varsity' },
      { id: TO_SAME_ORG, school_id: 's-bhs', name: 'JV' },
      { id: TO_OTHER_ORG, school_id: 's-legends', name: 'U16 Boys' }
    ],
    drills_bank: [
      { id: 'd1', school_id: 's-bhs', name: 'Dynamic Warmup' },
      { id: 'd2', school_id: 's-bhs', name: '1v1 Gauntlet' }
    ]
  };

  svc.isConfigured = () => true;
  svc.client = {
    // teamsCoachedBy reads the session to find the signed-in coach. Without
    // this stub it throws on `client.auth` before reaching anything testable.
    auth: { getSession: async () => ({ data: { session: { user: { id: 'coach-1' } } } }) },
    from(table: string) {
      let rows = (tables[table] || []).slice();
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        limit() { return api; },
        eq(col: string, val: any) { rows = rows.filter(r => r[col] === val); return api; },
        in(col: string, vals: any[]) { rows = rows.filter(r => vals.includes(r[col])); return api; },
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        single: async () => ({ data: rows[0] || null, error: null }),
        insert(newRows: any[]) {
          newRows.forEach(r => inserted.push({ table, ...r }));
          rows = newRows;
          return api;
        },
        // saveFullPracticePlan / savePracticePlanItem write with upsert(), not
        // insert() -- mirror the same recording behaviour so the B1 write-path
        // tests below can assert on the payload that reached the "database".
        upsert(newRows: any[]) {
          newRows.forEach(r => inserted.push({ table, ...r }));
          rows = newRows;
          return api;
        },
        then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('copying a practice plan', () => {
  it('duplicates every slot in the plan', async () => {
    // A plan is rows sharing a name; copying half a session is meaningless.
    const res = await supabaseService.copyPracticePlan('Standard 90', FROM, TO_SAME_ORG);
    expect(res.ok).toBe(true);
    expect(inserted.filter(r => r.table === 'practice_plans')).toHaveLength(2);
  });

  it('assigns the copies to the destination team', async () => {
    await supabaseService.copyPracticePlan('Standard 90', FROM, TO_SAME_ORG);
    const copies = inserted.filter(r => r.table === 'practice_plans');
    expect(copies.every(r => r.team_id === TO_SAME_ORG)).toBe(true);
  });

  it('creates independent rows, carrying no id from the original', async () => {
    // A copy that reused an id would overwrite the source on the next save.
    await supabaseService.copyPracticePlan('Standard 90', FROM, TO_SAME_ORG);
    const copies = inserted.filter(r => r.table === 'practice_plans');
    expect(copies.every(r => r.id === undefined)).toBe(true);
  });

  it('carries the slot content across', async () => {
    await supabaseService.copyPracticePlan('Standard 90', FROM, TO_SAME_ORG);
    const copies = inserted.filter(r => r.table === 'practice_plans');
    expect(copies.map(r => r.drill).sort()).toEqual(['1v1 Gauntlet', 'Dynamic Warmup']);
    expect(copies.some(r => r.coach_notes === 'sharp')).toBe(true);
  });

  it('does not write school_id on the copy (dropped by migration 0015)', async () => {
    await supabaseService.copyPracticePlan('Standard 90', FROM, TO_SAME_ORG);
    const copies = inserted.filter(r => r.table === 'practice_plans');
    expect(copies.every(r => !('school_id' in r))).toBe(true);
  });

  it('REFUSES a copy to another organization, naming the drills', async () => {
    // The drill library is per-organization, so the copies would point at
    // drills that team cannot see. Half-copying would be silent corruption.
    const res = await supabaseService.copyPracticePlan('Standard 90', FROM, TO_OTHER_ORG);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Dynamic Warmup');
    expect(inserted.filter(r => r.table === 'practice_plans')).toHaveLength(0);
  });

  it('refuses a plan that does not exist rather than copying nothing quietly', async () => {
    const res = await supabaseService.copyPracticePlan('No Such Plan', FROM, TO_SAME_ORG);
    expect(res.ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it('refuses a copy onto the same team', async () => {
    // Two identically named plans on one team cannot be told apart in the picker.
    const res = await supabaseService.copyPracticePlan('Standard 90', FROM, FROM);
    expect(res.ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

describe('copying a daily thought', () => {
  it('creates an independent copy on the destination team', async () => {
    const res = await supabaseService.copyDailyThought('t1', TO_SAME_ORG);
    expect(res.ok).toBe(true);
    const copy = inserted.find(r => r.table === 'daily_thoughts');
    expect(copy!.team_id).toBe(TO_SAME_ORG);
    expect(copy!.thoughts_text).toBe('Press high.');
    expect(copy!.id).toBeUndefined();
  });

  it('does not carry the active flag across', async () => {
    // The source is active for ITS team; making the copy active would silently
    // replace whatever message the destination team is currently showing.
    await supabaseService.copyDailyThought('t1', TO_SAME_ORG);
    expect(inserted.find(r => r.table === 'daily_thoughts')!.is_active).toBe(false);
  });

  it('copies across organizations, because a thought references no drills', async () => {
    const res = await supabaseService.copyDailyThought('t1', TO_OTHER_ORG);
    expect(res.ok).toBe(true);
  });
});

// ─── Ruling B: team-scope the practice-plan WRITE paths ─────────────────────
//
// Task 2 team-scoped fetchPracticePlans(teamId) to `.eq('team_id', teamId)`,
// but before this task every write path still wrote school_id and no
// team_id at all -- so a coach could save a plan, see success, and find it
// gone on reload (invisible to the only read that exists). These tests
// assert the payload that reaches the database, not merely that the call
// resolved without throwing.
describe('team-scoping the practice-plan write paths', () => {
  // Shaped like a real uuid (36 chars, contains '-') so it passes isUuid().
  const TEAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const SCHOOL_CODE = 'bhs'; // a leftover school code -- not a uuid

  describe('saveFullPracticePlan', () => {
    it('writes team_id and never school_id, using the (teamId, name, drills[]) convention', async () => {
      const res = await supabaseService.saveFullPracticePlan(TEAM, 'Standard 90', [
        { name: 'Dynamic Warmup', time: '4:00 PM', duration: '15 min', coachNotes: 'sharp' }
      ]);
      expect(res.success).toBe(true);
      const rows = inserted.filter(r => r.table === 'practice_plans');
      expect(rows).toHaveLength(1);
      expect(rows[0].team_id).toBe(TEAM);
      expect('school_id' in rows[0]).toBe(false);
    });

    it('writes team_id and never school_id, using the (teamId, {name, items}) convention', async () => {
      const res = await supabaseService.saveFullPracticePlan(TEAM, {
        name: 'Standard 90',
        items: [{ name: 'Dynamic Warmup', time: '4:00 PM', duration: '15 min' }]
      });
      expect(res.success).toBe(true);
      const rows = inserted.filter(r => r.table === 'practice_plans');
      expect(rows).toHaveLength(1);
      expect(rows[0].team_id).toBe(TEAM);
      expect('school_id' in rows[0]).toBe(false);
    });

    it('refuses a school code instead of a team uuid, writing nothing', async () => {
      const res = await supabaseService.saveFullPracticePlan(SCHOOL_CODE, 'Standard 90', [
        { name: 'Dynamic Warmup' }
      ]);
      expect(res.success).toBe(false);
      expect(inserted.filter(r => r.table === 'practice_plans')).toHaveLength(0);
    });

    it('refuses when no team is passed at all, writing nothing', async () => {
      const res = await supabaseService.saveFullPracticePlan(undefined as any, 'Standard 90', [
        { name: 'Dynamic Warmup' }
      ]);
      expect(res.success).toBe(false);
      expect(inserted.filter(r => r.table === 'practice_plans')).toHaveLength(0);
    });
  });

  describe('savePracticePlanItem', () => {
    it('writes team_id and never school_id', async () => {
      const saved = await supabaseService.savePracticePlanItem(TEAM, { name: 'Dynamic Warmup', time: '4:00 PM' });
      expect(saved).toBeTruthy();
      const rows = inserted.filter(r => r.table === 'practice_plans');
      expect(rows).toHaveLength(1);
      expect(rows[0].team_id).toBe(TEAM);
      expect('school_id' in rows[0]).toBe(false);
    });

    it('refuses a school code instead of a team uuid, writing nothing', async () => {
      const saved = await supabaseService.savePracticePlanItem(SCHOOL_CODE, { name: 'Dynamic Warmup' });
      expect(saved).toBeNull();
      expect(inserted.filter(r => r.table === 'practice_plans')).toHaveLength(0);
    });
  });

  describe('upsertPracticePlanItem (thin wrapper)', () => {
    it('delegates to savePracticePlanItem, writing team_id and never school_id', async () => {
      const saved = await supabaseService.upsertPracticePlanItem(TEAM, { name: 'Dynamic Warmup' });
      expect(saved).toBeTruthy();
      const rows = inserted.filter(r => r.table === 'practice_plans');
      expect(rows).toHaveLength(1);
      expect(rows[0].team_id).toBe(TEAM);
      expect('school_id' in rows[0]).toBe(false);
    });

    it('refuses a school code instead of a team uuid, writing nothing', async () => {
      const saved = await supabaseService.upsertPracticePlanItem(SCHOOL_CODE, { name: 'Dynamic Warmup' });
      expect(saved).toBeNull();
      expect(inserted.filter(r => r.table === 'practice_plans')).toHaveLength(0);
    });
  });
});
