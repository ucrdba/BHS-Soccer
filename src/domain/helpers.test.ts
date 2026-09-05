/**
 * The shared helpers: roster ordering, CSV reading, and the import merge.
 *
 * upsertByKey is the most consequential function in Phase 0 — every import
 * runs through it — and its failure modes are all silent: a duplicate row, an
 * overwritten id, or a stored value wiped by a sheet that never mentioned it.
 */
import { describe, it, expect } from 'vitest';
import { comparePlayers, sortedPlayers } from './roster';
import { parseCsvText, pickColumn, compareMatrixPlayers } from './csv';
import { upsertByKey, upsertByName, upsertByDateTime, activeTeamLabel } from './upsert';

// ── Roster ─────────────────────────────────────────────────────────────────

describe('roster ordering', () => {
  const squad = [
    { id: 'p1', name: 'Cesar Alva', number: 7 },
    { id: 'p2', name: 'Tom Budde', number: 2 },
    { id: 'p3', name: 'Alain Renteria', number: null }
  ];

  it('sorts by shirt number', () => {
    expect(sortedPlayers(squad, 'number').map(p => p.id)).toEqual(['p2', 'p1', 'p3']);
  });

  it('puts an unnumbered player last', () => {
    expect(sortedPlayers(squad, 'number')[2].id).toBe('p3');
  });

  it('sorts by name when asked', () => {
    expect(sortedPlayers(squad, 'name').map(p => p.id)).toEqual(['p3', 'p1', 'p2']);
  });

  it('ignores case when comparing names', () => {
    expect(comparePlayers({ name: 'alva' }, { name: 'Alva' }, 'name')).toBe(0);
  });

  it('omits deleted players', () => {
    const withGone = squad.concat([{ id: 'x', name: 'Gone', number: 1, is_deleted: true } as any]);
    expect(sortedPlayers(withGone, 'number').some(p => p.id === 'x')).toBe(false);
  });

  it('treats an unknown sort as by number', () => {
    expect(sortedPlayers(squad, 'nonsense').map(p => p.id)).toEqual(['p2', 'p1', 'p3']);
  });
});

// ── CSV ────────────────────────────────────────────────────────────────────

describe('parseCsvText', () => {
  it('keys each row by the header', () => {
    expect(parseCsvText('a,b\n1,2\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('keeps a comma inside a quoted field', () => {
    // A naive split turns one fixture into two half-fixtures.
    expect(parseCsvText('opponent,date\n"Yucaipa, CA",SEP 4\n'))
      .toEqual([{ opponent: 'Yucaipa, CA', date: 'SEP 4' }]);
  });

  it('reads a doubled quote as one literal quote', () => {
    expect(parseCsvText('name\n"A ""Ace"" B"\n')).toEqual([{ name: 'A "Ace" B' }]);
  });

  it('drops the empty row a trailing newline leaves behind', () => {
    expect(parseCsvText('a\n1\n')).toHaveLength(1);
  });

  it('drops a blank line in the middle', () => {
    expect(parseCsvText('a\n1\n\n2\n')).toEqual([{ a: '1' }, { a: '2' }]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsvText('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('strips a byte-order mark', () => {
    expect(parseCsvText('﻿a\n1\n')).toEqual([{ a: '1' }]);
  });

  it('trims whitespace around values and headers', () => {
    expect(parseCsvText(' a , b \n 1 , 2 \n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('is empty for empty input', () => {
    expect(parseCsvText('')).toEqual([]);
  });

  it('fills a short row with empty strings', () => {
    expect(parseCsvText('a,b\n1\n')).toEqual([{ a: '1', b: '' }]);
  });
});

describe('pickColumn', () => {
  it('finds a column however either side is spelled', () => {
    // Both sides are normalised: an alias list written the way the sheet
    // spells it used to match nothing and lose the column silently.
    expect(pickColumn({ 'Opponent': 'Yucaipa' }, ['opponent'])).toBe('Yucaipa');
    expect(pickColumn({ 'opponent': 'Yucaipa' }, ['Opponent'])).toBe('Yucaipa');
  });

  it('ignores punctuation and spacing in a header', () => {
    expect(pickColumn({ 'Match Date': 'SEP 4' }, ['match_date'])).toBe('SEP 4');
  });

  it('skips an alias whose value is blank and tries the next', () => {
    expect(pickColumn({ opponent: '   ', rival: 'Yucaipa' }, ['opponent', 'rival']))
      .toBe('Yucaipa');
  });

  it('is undefined when nothing matches', () => {
    expect(pickColumn({ a: '1' }, ['b'])).toBeUndefined();
    expect(pickColumn({}, ['a'])).toBeUndefined();
  });
});

describe('compareMatrixPlayers', () => {
  it('sorts by SURNAME, the way a team sheet reads', () => {
    // Sorting on the full name puts "Ashton Lanza" before "Cesar Alva".
    const lanza = { name: 'Ashton Lanza', lastName: 'Lanza' };
    const alva = { name: 'Cesar Alva', lastName: 'Alva' };
    expect(compareMatrixPlayers(lanza, alva, 'name')).toBeGreaterThan(0);
  });

  it('sorts by recording number otherwise, unnumbered last', () => {
    expect(compareMatrixPlayers({ recordingNumber: null, name: 'A' }, { recordingNumber: 9, name: 'B' }, ''))
      .toBeGreaterThan(0);
  });
});

// ── The import merge ───────────────────────────────────────────────────────

describe('upsertByKey', () => {
  it('inserts a row whose key is new', () => {
    const coll: any[] = [];
    const r = upsertByKey(coll, [{ name: 'Alva' }], x => x.name);
    expect(r.inserted).toBe(1);
    expect(r.updated).toBe(0);
    expect(coll).toHaveLength(1);
  });

  it('updates a row whose key already exists, in place', () => {
    const coll = [{ id: 'p1', name: 'Alva', number: 1 }];
    const r = upsertByKey(coll, [{ name: 'Alva', number: 7 }], x => x.name);
    expect(r.updated).toBe(1);
    expect(coll).toHaveLength(1);
    expect(coll[0].number).toBe(7);
    expect(coll[0].id).toBe('p1');
  });

  it('matches keys case- and whitespace-insensitively', () => {
    const coll = [{ id: 'p1', name: 'Alva' }];
    expect(upsertByKey(coll, [{ name: '  ALVA ' }], x => x.name).updated).toBe(1);
  });

  it('never lets an import rewrite an id', () => {
    const coll = [{ id: 'real', name: 'Alva' }];
    upsertByKey(coll, [{ id: 'forged', name: 'Alva' }], x => x.name);
    expect(coll[0].id).toBe('real');
  });

  it('ignores a blank incoming value rather than wiping a stored one', () => {
    const coll = [{ id: 'p1', name: 'Alva', position: 'GK' }];
    upsertByKey(coll, [{ name: 'Alva', position: '' }], x => x.name);
    expect(coll[0].position).toBe('GK');
  });

  it('merges one level deep so keys the sheet never mentions survive', () => {
    const coll = [{ id: 'p1', name: 'Alva', seasonStats: { games: 12, goals: 3 } }];
    upsertByKey(coll, [{ name: 'Alva', seasonStats: { goals: 5 } }], x => x.name);
    expect(coll[0].seasonStats).toEqual({ games: 12, goals: 5 });
  });

  it('inserts every blank-key row separately rather than merging them', () => {
    // Indexing a blank key would make every later blank-key row merge into
    // the first one.
    const coll: any[] = [];
    const r = upsertByKey(coll, [{ name: '' }, { name: '' }], x => x.name);
    expect(r.inserted).toBe(2);
    expect(coll).toHaveLength(2);
  });

  it('gives each inserted row its own copy of an object default', () => {
    // Sharing the reference means one in-place edit silently changes several
    // records at once.
    const coll: any[] = [];
    upsertByKey(coll, [{ name: 'A' }, { name: 'B' }], x => x.name, { stats: { games: 0 } });
    coll[0].stats.games = 9;
    expect(coll[1].stats.games).toBe(0);
  });

  it('does not apply a default over a value the row already has', () => {
    const coll: any[] = [];
    upsertByKey(coll, [{ name: 'A', position: 'GK' }], x => x.name, { position: 'MID' });
    expect(coll[0].position).toBe('GK');
  });

  it('returns every touched row to persist', () => {
    const coll = [{ id: 'p1', name: 'Alva' }];
    const r = upsertByKey(coll, [{ name: 'Alva' }, { name: 'Budde' }], x => x.name);
    expect(r.toPersist).toHaveLength(2);
    expect(r.updated).toBe(1);
    expect(r.inserted).toBe(1);
  });

  it('merges two incoming rows sharing a key into one record', () => {
    const coll: any[] = [];
    const r = upsertByKey(coll, [{ name: 'Alva', number: 1 }, { name: 'Alva', number: 7 }], x => x.name);
    expect(coll).toHaveLength(1);
    expect(coll[0].number).toBe(7);
    expect(r.inserted).toBe(1);
    expect(r.updated).toBe(1);
  });
});

describe('the keyed wrappers', () => {
  it('upsertByName keys on the name column', () => {
    const coll: any[] = [{ id: 'd1', name: 'Coopers' }];
    expect(upsertByName(coll, [{ name: 'Coopers', category: 'Fitness' }]).updated).toBe(1);
    expect(coll[0].category).toBe('Fitness');
  });

  it('upsertByDateTime keys on kickoff, so the same opponent twice is two fixtures', () => {
    // A season can meet the same opponent home and away.
    const coll: any[] = [];
    const r = upsertByDateTime(coll, [
      { opponent: 'Yucaipa', date: 'SEP 4 2026', time: '6:00 PM' },
      { opponent: 'Yucaipa', date: 'OCT 2 2026', time: '6:00 PM' }
    ]);
    expect(r.inserted).toBe(2);
  });

  it('upsertByDateTime updates a fixture at the same kickoff', () => {
    const coll: any[] = [{ id: 'm1', opponent: 'Yucaipa', date: 'SEP 4 2026', time: '6:00 PM' }];
    upsertByDateTime(coll, [{ date: 'SEP 4 2026', time: '6:00 PM', status: 'COMPLETED' }]);
    expect(coll).toHaveLength(1);
    expect(coll[0].status).toBe('COMPLETED');
  });
});

describe('activeTeamLabel', () => {
  const teams = [{ id: 't1', name: 'Varsity', season: '2026', school_name: 'Legends FC' }];

  it('names the organization the active team belongs to, not a hardcoded school', () => {
    expect(activeTeamLabel(teams, { name: 'Beaumont High School' }, 't1'))
      .toEqual({ org: 'Legends FC', team: 'Varsity', season: '2026' });
  });

  it('falls back to the school record when no team resolves', () => {
    // A signed-out visitor mid-load must not see an empty heading.
    expect(activeTeamLabel([], { name: 'Beaumont High School' }, 'nothing'))
      .toEqual({ org: 'Beaumont High School', team: '', season: '' });
  });

  it('does not throw when there is no school either', () => {
    expect(() => activeTeamLabel([], null, 'nothing')).not.toThrow();
  });
});
