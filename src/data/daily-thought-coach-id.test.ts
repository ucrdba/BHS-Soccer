/**
 * daily_thoughts.coach_id points at the STAFF table, not at the signed-in user.
 *
 * `coach_id UUID REFERENCES public.coaches(id)` -- the display roster of staff
 * ("Coach Bob Ayers", "Barry Steele"). The thought form was sending the signed-in
 * user's PROFILE id, which is a different id space entirely, so Postgres
 * rejected every save with:
 *
 *   insert or update on table "daily_thoughts" violates foreign key
 *   constraint "daily_thoughts_coach_id_fkey"
 *
 * and the coach was told to check that the table exists. The import path was
 * worse: it sent the literal 'c1'.
 *
 * Nothing reads coach_id. Every surface displays coach_name, which is stored
 * beside it as text. So the fix is to write the reference only when it really
 * is a staff row, and null otherwise -- which loses nothing and cannot fail.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';
const STAFF_ROW = 'd67bf034-2f9e-46bc-affc-f8982a9d4d23';   // a real coaches.id
const PROFILE_ID = 'f2ad9dd0-58b2-4227-aafe-8319b51f6f63'; // a signed-in user

let sent: any[];

beforeEach(() => {
  sent = [];
  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      let rows: any[] = table === 'coaches' ? [{ id: STAFF_ROW }] : [];
      const api: any = {
        select() { return api; },
        or() { return api; },
        eq(col: string, val: any) { rows = rows.filter(r => r[col] === val); return api; },
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        insert(newRows: any[]) { newRows.forEach(r => sent.push({ table, ...r })); rows = newRows; return api; },
        update(patch: any) { sent.push({ table, ...patch }); return api; },
        upsert(newRows: any[]) { newRows.forEach(r => sent.push({ table, ...r })); rows = newRows; return api; },
        then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const thought = (over: any = {}) => ({
  coachName: 'Coach Bob Ayers', text: 'Press high today.', isActive: true, ...over
});

describe('the coach reference on a daily thought', () => {
  it('does NOT send a signed-in user id, which is not a staff row', async () => {
    // The bug: this id is a valid uuid and a real person, but it belongs to
    // profiles, and the foreign key points at coaches.
    await supabaseService.upsertDailyThought(TEAM, thought({ coachId: PROFILE_ID }));
    const row = sent.find(r => r.table === 'daily_thoughts');
    expect(row.coach_id).toBeNull();
  });

  it('does not send the literal "c1" the import used', async () => {
    await supabaseService.upsertDailyThought(TEAM, thought({ coachId: 'c1' }));
    expect(sent.find(r => r.table === 'daily_thoughts').coach_id).toBeNull();
  });

  it('keeps a genuine staff id when one is given', async () => {
    // The column stays meaningful for a caller that really has a coaches row.
    await supabaseService.upsertDailyThought(TEAM, thought({ coachId: STAFF_ROW }));
    expect(sent.find(r => r.table === 'daily_thoughts').coach_id).toBe(STAFF_ROW);
  });

  it('still stores the coach name, which is what every screen displays', async () => {
    await supabaseService.upsertDailyThought(TEAM, thought({ coachId: PROFILE_ID }));
    expect(sent.find(r => r.table === 'daily_thoughts').coach_name).toBe('Coach Bob Ayers');
  });

  it('saves successfully rather than reporting a foreign key error', async () => {
    const res = await supabaseService.upsertDailyThought(TEAM, thought({ coachId: PROFILE_ID }));
    expect(res.error).toBeFalsy();
  });
});
