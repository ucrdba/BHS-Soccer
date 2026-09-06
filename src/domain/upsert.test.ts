/**
 * The import path's merge rule.
 *
 * This is what decides what a spreadsheet import OVERWRITES, and it had no
 * test of its own — only agreement tests that loaded the legacy script it was
 * cut from. Those go with `public/js/`, so the rules move here.
 *
 * Three of them are load-bearing and none is guessable from the signature:
 *
 * - **A blank cell is skipped, not written.** A sheet listing three columns
 *   must not wipe the twelve it never mentioned.
 * - **`id` is never taken from an import.** A spreadsheet carrying a stale id
 *   would otherwise repoint a row at another record.
 * - **It MUTATES the collection it is given.** Every caller relies on that;
 *   it is preserved deliberately rather than tidied into a pure return.
 */
import { describe, it, expect } from 'vitest';
import { upsertByKey, upsertByName, upsertByDateTime, activeTeamLabel } from './upsert';

const byName = (r: any) => (r ? r.name : '');

describe('matching an incoming row to an existing one', () => {
  it('updates rather than inserting when the key matches', () => {
    const players = [{ id: 'p1', name: 'Cesar Alva', number: 9 }];
    const res = upsertByKey(players, [{ name: 'Cesar Alva', number: 10 }], byName);

    expect(res.updated).toBe(1);
    expect(res.inserted).toBe(0);
    expect(players).toHaveLength(1);
    expect(players[0].number).toBe(10);
  });

  it('ignores case and surrounding space, because a sheet is typed by hand', () => {
    const players: any[] = [{ id: 'p1', name: 'Cesar Alva' }];
    upsertByKey(players, [{ name: '  cesar alva ', number: 10 }], byName);

    expect(players).toHaveLength(1);
    expect(players[0].number).toBe(10);
  });

  it('inserts when nothing matches', () => {
    const players = [{ id: 'p1', name: 'Cesar Alva' }];
    const res = upsertByKey(players, [{ name: 'Tom Budde' }], byName);

    expect(res.inserted).toBe(1);
    expect(players).toHaveLength(2);
  });

  it('MUTATES the collection it was handed', () => {
    // Every caller relies on this. It is the original behaviour, kept.
    const players: any[] = [];
    upsertByKey(players, [{ name: 'Tom Budde' }], byName);
    expect(players).toHaveLength(1);
  });

  it('returns the rows to persist, updates and inserts alike', () => {
    const players = [{ id: 'p1', name: 'Cesar Alva' }];
    const res = upsertByKey(players, [{ name: 'Cesar Alva' }, { name: 'Tom Budde' }], byName);
    expect(res.toPersist).toHaveLength(2);
  });
});

describe('A BLANK CELL IS SKIPPED, NOT WRITTEN', () => {
  it('leaves a column the sheet did not fill in', () => {
    // A sparse sheet must not wipe what it never mentioned.
    const players = [{ id: 'p1', name: 'Cesar Alva', position: 'Forward', height: '5-11' }];
    upsertByKey(players, [{ name: 'Cesar Alva', position: '', height: '   ' }], byName);

    expect(players[0].position).toBe('Forward');
    expect(players[0].height).toBe('5-11');
  });

  it('treats null and undefined the same way', () => {
    const players = [{ id: 'p1', name: 'Cesar Alva', position: 'Forward' }];
    upsertByKey(players, [{ name: 'Cesar Alva', position: null, number: undefined }], byName);
    expect(players[0].position).toBe('Forward');
  });

  it('DOES write a zero, which is a value and not a blank', () => {
    const players = [{ id: 'p1', name: 'Cesar Alva', number: 9 }];
    upsertByKey(players, [{ name: 'Cesar Alva', number: 0 }], byName);
    expect(players[0].number).toBe(0);
  });

  it('writes false too', () => {
    const players = [{ id: 'p1', name: 'Cesar Alva', is_deleted: true }];
    upsertByKey(players, [{ name: 'Cesar Alva', is_deleted: false }], byName);
    expect(players[0].is_deleted).toBe(false);
  });
});

describe('AN IMPORT NEVER REWRITES AN id', () => {
  it('keeps the stored id even when the sheet carries one', () => {
    // A stale id in a spreadsheet would otherwise repoint the row at another
    // record entirely.
    const players = [{ id: 'p1', name: 'Cesar Alva' }];
    upsertByKey(players, [{ id: 'SOMETHING-ELSE', name: 'Cesar Alva' }], byName);
    expect(players[0].id).toBe('p1');
  });
});

describe('a nested object is merged one level deep', () => {
  it('keeps stored keys the sheet does not mention', () => {
    // seasonStats.games is not a column in the roster sheet, and a wholesale
    // replacement would drop it.
    const players = [{ id: 'p1', name: 'Cesar Alva', seasonStats: { goals: 4, games: 12 } }];
    upsertByKey(players, [{ name: 'Cesar Alva', seasonStats: { goals: 6 } }], byName);

    expect(players[0].seasonStats).toEqual({ goals: 6, games: 12 });
  });

  it('skips blanks inside the nested object as well', () => {
    const players = [{ id: 'p1', name: 'Cesar Alva', seasonStats: { goals: 4, assists: 2 } }];
    upsertByKey(players, [{ name: 'Cesar Alva', seasonStats: { goals: 6, assists: '' } }], byName);

    expect(players[0].seasonStats.assists).toBe(2);
  });

  it('replaces outright when the stored value is not an object', () => {
    const rows = [{ name: 'x', thing: 'plain' }];
    upsertByKey(rows, [{ name: 'x', thing: { a: 1 } }], byName);
    expect(rows[0].thing).toEqual({ a: 1 });
  });
});

describe('defaults for an inserted row', () => {
  it('fills a property the row does not have', () => {
    const players: any[] = [];
    upsertByKey(players, [{ name: 'Tom Budde' }], byName, { position: 'Midfielder' });
    expect(players[0].position).toBe('Midfielder');
  });

  it('does not overwrite one the row supplies', () => {
    const players: any[] = [];
    upsertByKey(players, [{ name: 'Tom Budde', position: 'Keeper' }], byName, { position: 'Midfielder' });
    expect(players[0].position).toBe('Keeper');
  });

  it('GIVES EACH INSERTED ROW ITS OWN COPY of an object default', () => {
    // Sharing one reference means an edit to one player's stats silently
    // changes every other player imported in the same pass.
    const players: any[] = [];
    upsertByKey(players, [{ name: 'A' }, { name: 'B' }], byName, { seasonStats: { goals: 0 } });

    players[0].seasonStats.goals = 5;
    expect(players[1].seasonStats.goals).toBe(0);
  });

  it('is not applied to an update', () => {
    const players: any[] = [{ id: 'p1', name: 'Cesar Alva' }];
    upsertByKey(players, [{ name: 'Cesar Alva' }], byName, { position: 'Midfielder' });
    expect(players[0].position).toBeUndefined();
  });
});

describe('a row with no key at all', () => {
  it('is inserted rather than dropped', () => {
    const rows: any[] = [];
    upsertByKey(rows, [{ name: '' }], byName);
    expect(rows).toHaveLength(1);
  });

  it('DOES NOT SWALLOW THE NEXT ONE', () => {
    // Indexing a blank key would make every later blank-key row merge into
    // the first, so a sheet of unnamed rows would import as one.
    const rows: any[] = [];
    const res = upsertByKey(rows, [{ name: '' }, { name: '  ' }], byName);

    expect(res.inserted).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it('does not match an existing row whose key is also blank', () => {
    const rows: any[] = [{ id: 'r1', name: '' }];
    const res = upsertByKey(rows, [{ name: '' }], byName);
    expect(res.inserted).toBe(1);
  });
});

describe('upsertByName', () => {
  it('keys on the name column', () => {
    const coaches = [{ id: 'c1', name: 'Coach Miller', phone: '555' }];
    upsertByName(coaches, [{ name: 'Coach Miller', phone: '111' }]);
    expect(coaches).toHaveLength(1);
    expect(coaches[0].phone).toBe('111');
  });

  it('copes with a row that is not an object', () => {
    const rows: any[] = [];
    expect(() => upsertByName(rows, [null])).not.toThrow();
  });
});

describe('upsertByDateTime', () => {
  it('KEYS ON KICK-OFF, NOT ON THE OPPONENT', () => {
    // A season meets the same opponent home and away, and keying on the name
    // would merge the two fixtures into one.
    const schedule = [{ id: 'm1', date: '2026-03-01', time: '15:00', opponent: 'Yucaipa' }];
    const res = upsertByDateTime(schedule, [
      { date: '2026-04-12', time: '15:00', opponent: 'Yucaipa' }
    ]);

    expect(res.inserted).toBe(1);
    expect(schedule).toHaveLength(2);
  });

  it('updates the fixture at the same date and time', () => {
    const schedule: any[] = [{ id: 'm1', date: '2026-03-01', time: '15:00', opponent: 'Yucaipa' }];
    upsertByDateTime(schedule, [{ date: '2026-03-01', time: '15:00', score: '2-1' }]);

    expect(schedule).toHaveLength(1);
    expect(schedule[0].score).toBe('2-1');
  });
});

describe('naming the active team in a heading', () => {
  const teams = [
    { id: 't1', name: 'Varsity', season: '2026', school_name: 'Beaumont High School' },
    { id: 't2', name: 'U16 Reds', season: '2026', school_name: 'Legends FC' }
  ];

  it('READS THE ORGANIZATION FROM THE TEAM, not from one hardcoded name', () => {
    // Every heading used to be hardcoded, so a club U16 roster read
    // "BEAUMONT COUGARS ROSTER".
    expect(activeTeamLabel(teams, { name: 'Beaumont High School' }, 't2')).toEqual({
      org: 'Legends FC', team: 'U16 Reds', season: '2026'
    });
  });

  it('falls back to the school record when no team is resolved', () => {
    // A signed-out visitor mid-load sees a heading rather than a blank.
    expect(activeTeamLabel(teams, { name: 'Legends FC' }, 'nope'))
      .toEqual({ org: 'Legends FC', team: '', season: '' });
  });

  it('copes with no teams at all', () => {
    expect(activeTeamLabel([], { name: 'Legends FC' }, 't1').org).toBe('Legends FC');
  });
});
