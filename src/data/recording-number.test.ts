/**
 * Recording numbers.
 *
 * Matrix results are written on paper during a session, and handwriting is not
 * always readable afterwards. Players write a short number instead of their
 * name. That number is NOT their shirt number: shirts change between seasons,
 * a trialist may have none, and two squads can each have a 9.
 *
 * The lookup is the part that matters. A misread digit must become a visible
 * error naming the number, never a result quietly attributed to whoever happens
 * to hold it -- a wrong 1v1 result changes the Matrix standings, and nobody
 * would know to go looking for it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';
const OTHER = 'e812237b-3cc3-49a7-9805-9e0db40c92d5';

let roster: any[];

beforeEach(() => {
  roster = [
    { team_id: TEAM,  player_id: 'p-alva',   recording_number: 1,  number: null, is_deleted: false, players: { id: 'p-alva',   name: 'Cesar Alva',    first_name: 'Cesar',  last_name: 'Alva' } },
    { team_id: TEAM,  player_id: 'p-carver', recording_number: 6,  number: null, is_deleted: false, players: { id: 'p-carver', name: 'Caleb Carver',  first_name: 'Caleb',  last_name: 'Carver' } },
    { team_id: TEAM,  player_id: 'p-smith',  recording_number: 22, number: null, is_deleted: false, players: { id: 'p-smith',  name: 'Gavin Smith',   first_name: 'Gavin',  last_name: 'Smith' } },
    { team_id: TEAM,  player_id: 'p-gone',   recording_number: 9,  number: null, is_deleted: true,  players: { id: 'p-gone',   name: 'Left Squad',    first_name: 'Left',   last_name: 'Squad' } },
    { team_id: OTHER, player_id: 'p-jv1',    recording_number: 1,  number: null, is_deleted: false, players: { id: 'p-jv1',    name: 'Other Team',    first_name: 'Other',  last_name: 'Team' } }
  ];

  svc.isConfigured = () => true;
  svc.client = {
    from() {
      let sel = roster.slice();
      const api: any = {
        select() { return api; },
        or() { return api; },
        eq(col: string, val: any) { sel = sel.filter(r => r[col] === val); return api; },
        then(res: any) { return Promise.resolve({ data: sel, error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('finding a player by their recording number', () => {
  it('finds the player holding that number on that team', async () => {
    const res = await supabaseService.findPlayerByRecordingNumber(TEAM, 6);
    expect(res.ok).toBe(true);
    expect(res.player.id).toBe('p-carver');
    expect(res.player.name).toBe('Caleb Carver');
  });

  it('reads a number typed as text, which is what a form gives it', async () => {
    const res = await supabaseService.findPlayerByRecordingNumber(TEAM, ' 22 ');
    expect(res.ok).toBe(true);
    expect(res.player.id).toBe('p-smith');
  });

  it('REFUSES an unknown number and says which one', async () => {
    // The whole point. A misread digit must not become a result against
    // whoever happens to hold that number.
    const res = await supabaseService.findPlayerByRecordingNumber(TEAM, 17);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('17');
    expect(res.player).toBeFalsy();
  });

  it('does not reach into another squad holding the same number', async () => {
    // Recording numbers are unique per team, not globally: both squads have a 1.
    const res = await supabaseService.findPlayerByRecordingNumber(TEAM, 1);
    expect(res.player.id).toBe('p-alva');
  });

  it('ignores a player who has left the squad', async () => {
    const res = await supabaseService.findPlayerByRecordingNumber(TEAM, 9);
    expect(res.ok).toBe(false);
  });

  it('refuses something that is not a number at all', async () => {
    for (const bad of ['', 'seven', null, undefined]) {
      const res = await supabaseService.findPlayerByRecordingNumber(TEAM, bad as any);
      expect(res.ok).toBe(false);
    }
  });

  it('refuses without a team rather than searching every squad', async () => {
    const res = await supabaseService.findPlayerByRecordingNumber('bhs', 1);
    expect(res.ok).toBe(false);
  });
});

describe('finding a player by name, for when the writing IS readable', () => {
  it('matches a full name regardless of case and spacing', async () => {
    const res = await supabaseService.findPlayerOnTeam(TEAM, '  caleb   CARVER ');
    expect(res.ok).toBe(true);
    expect(res.player.id).toBe('p-carver');
  });

  it('matches a surname on its own when only one player has it', async () => {
    // Paper sheets are rarely written in full.
    const res = await supabaseService.findPlayerOnTeam(TEAM, 'Smith');
    expect(res.player.id).toBe('p-smith');
  });

  it('refuses a surname two players share rather than guessing', async () => {
    roster.push({
      team_id: TEAM, player_id: 'p-smith2', recording_number: 23, number: null, is_deleted: false,
      players: { id: 'p-smith2', name: 'Ellis Smith', first_name: 'Ellis', last_name: 'Smith' }
    });
    const res = await supabaseService.findPlayerOnTeam(TEAM, 'Smith');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/more than one|two/i);
  });

  it('takes a recording number here too, so one box accepts either', async () => {
    // A coach entering from paper should not have to say which kind it is.
    const res = await supabaseService.findPlayerOnTeam(TEAM, '6');
    expect(res.ok).toBe(true);
    expect(res.player.id).toBe('p-carver');
  });

  it('refuses a name nobody on the squad has, naming what was typed', async () => {
    const res = await supabaseService.findPlayerOnTeam(TEAM, 'Nobody Here');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Nobody Here');
  });
});
