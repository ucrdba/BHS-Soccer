/**
 * People in the program who are on no team.
 *
 * `players` is the person and `team_players` is the membership, so removing
 * someone from a squad leaves the person behind -- deliberately, since they may
 * play for a club side too. The consequence is a set of people no screen shows:
 * twelve of the thirty-one rows in the live database at the time of writing.
 *
 * They are mostly harmless, and keeping them is what lets a returning player
 * bring their history back. But they accumulate, they are invisible, and a
 * duplicate hides among them ("Cesar Alva" exists twice, one copy on a team and
 * one not).
 *
 * The count of results each one owns is the load-bearing part: retiring a
 * person who still owns Matrix results would orphan that history, so the UI has
 * to know before it offers the button.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

let tables: Record<string, any[]>;
let updates: Record<string, any>[];

beforeEach(() => {
  updates = [];
  tables = {
    players: [
      { id: 'p-onteam',  name: 'Kai Nakamura',  first_name: 'Kai',   last_name: 'Nakamura',  class_year: 'Junior',    is_deleted: false },
      { id: 'p-orphan',  name: 'Caleb Carver',  first_name: 'Caleb', last_name: 'Carver',    class_year: 'Senior',    is_deleted: false },
      { id: 'p-results', name: 'Cesar Alva',    first_name: 'Cesar', last_name: 'Alva',      class_year: 'Sophomore', is_deleted: false },
      { id: 'p-gone',    name: 'Old Player',    first_name: 'Old',   last_name: 'Player',    class_year: 'Senior',    is_deleted: true }
    ],
    team_players: [
      { player_id: 'p-onteam', team_id: 't1', is_deleted: false },
      { player_id: 'p-orphan', team_id: 't1', is_deleted: true }   // left the team
    ],
    matrix_logs: [
      { player_a_id: 'p-results', player_b_id: 'p-onteam', is_deleted: false }
    ],
    matrix_session_results: [
      { player_id: 'p-results', is_deleted: false }
    ]
  };

  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      let rows = (tables[table] || []).slice();
      let pending: Record<string, any> | null = null;
      const api: any = {
        select() { return api; },
        // PostgREST really applies this, and the soft-delete filter is the
        // whole reason a retired person stays out of the list -- a no-op stub
        // would let that assertion pass no matter what the code did.
        or(expr: string) {
          const m = /^(\w+)\.is\.null,\1\.eq\.false$/.exec(expr || '');
          if (m) rows = rows.filter(r => r[m[1]] === null || r[m[1]] === undefined || r[m[1]] === false);
          return api;
        },
        order() { return api; },
        update(patch: Record<string, any>) { pending = patch; return api; },
        eq(col: string, val: any) {
          rows = rows.filter(r => r[col] === val);
          if (pending) rows.forEach(r => updates.push({ table, id: r.id, ...pending }));
          return api;
        },
        then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('listing people on no team', () => {
  it('includes someone whose only membership was soft-deleted', async () => {
    // This is the everyday case: removed from the roster, still a person.
    const list = await supabaseService.fetchUnassignedPlayers();
    expect(list!.map((p: any) => p.id)).toContain('p-orphan');
  });

  it('excludes someone still on a team', async () => {
    const list = await supabaseService.fetchUnassignedPlayers();
    expect(list!.map((p: any) => p.id)).not.toContain('p-onteam');
  });

  it('excludes a person who has already been retired', async () => {
    const list = await supabaseService.fetchUnassignedPlayers();
    expect(list!.map((p: any) => p.id)).not.toContain('p-gone');
  });

  it('carries the name parts, so the list reads like the roster does', async () => {
    const list = await supabaseService.fetchUnassignedPlayers();
    const caleb = list!.find((p: any) => p.id === 'p-orphan');
    expect(caleb.first_name).toBe('Caleb');
    expect(caleb.last_name).toBe('Carver');
  });
});

describe('knowing what each person would take with them', () => {
  it('counts the Matrix results a person owns', async () => {
    // Retiring someone who owns results would orphan that history, so the
    // count is what decides whether the UI offers the button at all.
    const list = await supabaseService.fetchUnassignedPlayers();
    const cesar = list!.find((p: any) => p.id === 'p-results');
    expect(cesar.resultCount).toBe(2);   // one head-to-head log, one session result
  });

  it('reports zero for someone with no history', async () => {
    const list = await supabaseService.fetchUnassignedPlayers();
    const caleb = list!.find((p: any) => p.id === 'p-orphan');
    expect(caleb.resultCount).toBe(0);
  });

  it('counts a result whether the person was player A or player B', async () => {
    tables.matrix_logs.push({ player_a_id: 'p-onteam', player_b_id: 'p-orphan', is_deleted: false });
    const list = await supabaseService.fetchUnassignedPlayers();
    expect(list!.find((p: any) => p.id === 'p-orphan').resultCount).toBe(1);
  });

  it('ignores a deleted result', async () => {
    tables.matrix_logs.push({ player_a_id: 'p-orphan', player_b_id: 'p-onteam', is_deleted: true });
    const list = await supabaseService.fetchUnassignedPlayers();
    expect(list!.find((p: any) => p.id === 'p-orphan').resultCount).toBe(0);
  });
});

describe('retiring a person', () => {
  it('soft deletes the identity rather than removing the row', async () => {
    await supabaseService.deletePlayer('p-orphan');
    const write = updates.find(u => u.table === 'players');
    expect(write!.is_deleted).toBe(true);
  });
});
