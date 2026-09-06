/**
 * Reading a spreadsheet somebody else made.
 *
 * The parser is hand-rolled rather than a comma split because the schedules
 * coaches paste in carry quoted opponents with commas in them, and a naive
 * split turns one fixture into two half-fixtures.
 *
 * `pickColumn` normalises BOTH sides. Only the row's key used to be, so an
 * alias list written the way the sheet spells the column — `['Opponent']`
 * rather than `['opponent']` — matched nothing and every row silently lost
 * that column. Nothing in the signature said which form was expected, and the
 * first caller to guess wrong lost an entire import.
 *
 * Ported from the agreement tests that loaded the legacy admin script.
 */
import { describe, it, expect } from 'vitest';
import { parseCsvText, pickColumn, compareMatrixPlayers } from './csv';

describe('parsing a pasted CSV', () => {
  it('keys each row by the header row', () => {
    const rows = parseCsvText('Date,Opponent\n2026-03-01,Yucaipa');
    expect(rows).toEqual([{ Date: '2026-03-01', Opponent: 'Yucaipa' }]);
  });

  it('KEEPS A QUOTED COMMA INSIDE ONE FIELD', () => {
    // The reason this is not a comma split: one fixture, not two halves.
    const rows = parseCsvText('Date,Location\n2026-03-01,"Beaumont, CA"');
    expect(rows[0].Location).toBe('Beaumont, CA');
  });

  it('reads a doubled quote as one literal quote', () => {
    const rows = parseCsvText('Name\n"He said ""go"""');
    expect(rows[0].Name).toBe('He said "go"');
  });

  it('keeps a newline inside a quoted field', () => {
    const rows = parseCsvText('Note\n"line one\nline two"');
    expect(rows).toHaveLength(1);
    expect(rows[0].Note).toContain('line one');
  });

  it('strips a byte order mark, which Excel writes', () => {
    // Left in, the first header becomes an unmatchable key.
    const rows = parseCsvText('﻿Date,Opponent\n2026-03-01,Yucaipa');
    expect(Object.keys(rows[0])).toContain('Date');
  });

  it('handles CRLF line endings', () => {
    const rows = parseCsvText('Date,Opponent\r\n2026-03-01,Yucaipa\r\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].Opponent).toBe('Yucaipa');
  });

  it('DOES NOT READ A TRAILING NEWLINE AS A RECORD', () => {
    const rows = parseCsvText('Date,Opponent\n2026-03-01,Yucaipa\n');
    expect(rows).toHaveLength(1);
  });

  it('drops a wholly blank line in the middle', () => {
    const rows = parseCsvText('Date\n2026-03-01\n\n2026-03-08');
    expect(rows).toHaveLength(2);
  });

  it('trims each header and each value', () => {
    const rows = parseCsvText(' Date , Opponent \n 2026-03-01 , Yucaipa ');
    expect(rows[0].Date).toBe('2026-03-01');
    expect(rows[0].Opponent).toBe('Yucaipa');
  });

  it('fills a short row with blanks rather than undefined', () => {
    const rows = parseCsvText('Date,Opponent,Score\n2026-03-01,Yucaipa');
    expect(rows[0].Score).toBe('');
  });

  it('returns nothing for an empty input', () => {
    expect(parseCsvText('')).toEqual([]);
    expect(parseCsvText(null as any)).toEqual([]);
  });

  it('returns nothing for a header row on its own', () => {
    expect(parseCsvText('Date,Opponent')).toEqual([]);
  });
});

describe('picking a column whatever the sheet called it', () => {
  const row = { 'Opponent Name': 'Yucaipa', 'kick_off': '15:00', Score: '' };

  it('NORMALISES BOTH SIDES', () => {
    // An alias spelled the way the sheet spells it must match, and used not to.
    expect(pickColumn(row, ['Opponent Name'])).toBe('Yucaipa');
    expect(pickColumn(row, ['opponentname'])).toBe('Yucaipa');
    expect(pickColumn(row, ['OPPONENT_NAME'])).toBe('Yucaipa');
  });

  it('ignores punctuation and spacing on either side', () => {
    expect(pickColumn(row, ['kick off'])).toBe('15:00');
    expect(pickColumn(row, ['Kick-Off'])).toBe('15:00');
  });

  it('takes the first alias that has a value', () => {
    expect(pickColumn(row, ['nope', 'Opponent Name'])).toBe('Yucaipa');
  });

  it('SKIPS A COLUMN THAT IS PRESENT BUT EMPTY', () => {
    // Otherwise a blank column shadows a filled alias later in the list.
    expect(pickColumn(row, ['Score'])).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(pickColumn(row, ['Referee'])).toBeUndefined();
  });

  it('copes with no row and no aliases', () => {
    expect(pickColumn(null as any, ['a'])).toBeUndefined();
    expect(pickColumn(row, null as any)).toBeUndefined();
  });
});

describe('ordering players on the matrix', () => {
  it('SORTS BY SURNAME, the way a team sheet reads', () => {
    // On the full name "Ashton Lanza" sorts before "Cesar Alva", which is
    // alphabetical by first name and not how anyone looks a player up.
    const alva = { name: 'Cesar Alva', lastName: 'Alva' };
    const lanza = { name: 'Ashton Lanza', lastName: 'Lanza' };
    expect(compareMatrixPlayers(alva, lanza, 'name')).toBeLessThan(0);
  });

  it('falls back to the full name when there is no surname', () => {
    expect(compareMatrixPlayers({ name: 'Adam' }, { name: 'Zoe' }, 'name')).toBeLessThan(0);
  });

  it('sorts by RECORDING number, not the shirt number', () => {
    const a = { name: 'A', number: 99, recordingNumber: 2 };
    const b = { name: 'B', number: 1, recordingNumber: 9 };
    expect(compareMatrixPlayers(a, b, 'number')).toBeLessThan(0);
  });

  it('puts a player with no recording number last', () => {
    const a = { name: 'A', recordingNumber: 9 };
    const b = { name: 'B', recordingNumber: null };
    expect(compareMatrixPlayers(a, b, 'number')).toBeLessThan(0);
    expect(compareMatrixPlayers(b, a, 'number')).toBeGreaterThan(0);
  });

  it('falls back to the name when two share a recording number', () => {
    const a = { name: 'Zoe', recordingNumber: 4 };
    const b = { name: 'Adam', recordingNumber: 4 };
    expect(compareMatrixPlayers(a, b, 'number')).toBeGreaterThan(0);
  });
});
