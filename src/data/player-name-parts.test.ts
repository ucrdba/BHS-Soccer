/**
 * First and last name on a player.
 *
 * `players.name` is kept and maintained by a database trigger, because 37
 * places across 9 files read it. So the property worth protecting here is not
 * "the full name is composed correctly" -- Postgres does that -- but that the
 * PARTS actually reach the database. A write that sent only `name` would leave
 * first_name and last_name null, and the roster editor would show blank fields
 * for a player whose name renders fine everywhere else.
 *
 * The splitting helper matters for the import path: a spreadsheet written
 * before this change has one `Name` column, and it has to keep working.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

let sent: Record<string, any>[];

beforeEach(() => {
  sent = [];
  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      let rows: any[] = [];
      const api: any = {
        select() { return api; },
        upsert(newRows: any[]) {
          newRows.forEach(r => sent.push({ table, ...r }));
          rows = newRows.map((r, i) => ({ id: r.id || `new-${i}`, ...r }));
          return api;
        },
        then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('splitting a full name into parts', () => {
  const split = (full: string) => supabaseService.splitPlayerName(full);

  it('splits an ordinary two-word name', () => {
    expect(split('Mateo Herrera')).toEqual({ firstName: 'Mateo', lastName: 'Herrera' });
  });

  it('keeps a compound surname together', () => {
    // Splitting on the LAST space would reduce this surname to 'Gomez'.
    expect(split('Ana Maria Rodriguez Gomez'))
      .toEqual({ firstName: 'Ana', lastName: 'Maria Rodriguez Gomez' });
  });

  it('puts a single word in the first name and leaves no surname', () => {
    // The migration must not invent a surname nobody recorded.
    expect(split('Ronaldinho')).toEqual({ firstName: 'Ronaldinho', lastName: '' });
  });

  it('ignores stray whitespace', () => {
    expect(split('  Kai   Nakamura  ')).toEqual({ firstName: 'Kai', lastName: 'Nakamura' });
  });

  it('survives an empty value rather than throwing', () => {
    expect(split('')).toEqual({ firstName: '', lastName: '' });
    expect(split(null as any)).toEqual({ firstName: '', lastName: '' });
  });
});

describe('saving a player', () => {
  it('sends first_name and last_name, not just the full name', async () => {
    // The whole point: a write that sent only `name` leaves the parts null and
    // the roster editor shows empty fields for a player who looks fine on the
    // roster card.
    await supabaseService.upsertPlayerIdentity({
      firstName: 'Mateo', lastName: 'Herrera', classYear: 'Sophomore'
    });
    const row = sent.find(r => r.table === 'players')!;
    expect(row.first_name).toBe('Mateo');
    expect(row.last_name).toBe('Herrera');
  });

  it('composes the full name too, so a reader never sees it blank', async () => {
    // The database trigger would do this anyway, but sending it keeps the row
    // correct even if the migration has not been applied yet.
    await supabaseService.upsertPlayerIdentity({ firstName: 'Kai', lastName: 'Nakamura' });
    expect(sent.find(r => r.table === 'players')!.name).toBe('Kai Nakamura');
  });

  it('accepts a legacy full name and splits it', async () => {
    // The XLSX import and any caller not yet updated still pass `name`.
    await supabaseService.upsertPlayerIdentity({ name: 'Owen Blackwell' });
    const row = sent.find(r => r.table === 'players')!;
    expect(row.first_name).toBe('Owen');
    expect(row.last_name).toBe('Blackwell');
    expect(row.name).toBe('Owen Blackwell');
  });

  it('prefers the explicit parts over a full name given alongside them', async () => {
    await supabaseService.upsertPlayerIdentity({
      name: 'Stale Value', firstName: 'Finn', lastName: 'Gallagher'
    });
    const row = sent.find(r => r.table === 'players')!;
    expect(row.first_name).toBe('Finn');
    expect(row.name).toBe('Finn Gallagher');
  });

  it('refuses a player with no name at all rather than writing a blank row', async () => {
    const res = await supabaseService.upsertPlayerIdentity({ classYear: 'Senior' });
    expect(res).toBeNull();
    expect(sent).toHaveLength(0);
  });
});
