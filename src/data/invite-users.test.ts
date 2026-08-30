/**
 * Tests for the pure parts of scripts/invite-users.mjs.
 *
 * The network calls are deliberately not mocked — the script's dry run is how
 * those get verified, and a mocked invite would only assert that the mock was
 * called. What is worth testing is everything that decides WHETHER a batch runs
 * and WHO ends up in it: a mis-parsed CSV or a role that slips through
 * validation would invite the wrong people or grant the wrong access.
 */

import { describe, it, expect } from 'vitest';
import { parseCsv, normaliseRows, isServiceRoleKey, VALID_ROLES } from '../../scripts/invite-users.mjs';

// btoa rather than Buffer: this tsconfig does not pick up @types/node, and
// setting "types" would exclude the type packages the other suites rely on.
const jwt = (payload: object) => `header.${btoa(JSON.stringify(payload))}.signature`;

describe('parseCsv', () => {
  it('reads a simple sheet into objects keyed by the header', () => {
    const rows = parseCsv('Name,Email,Role\nCesar Alva,cesar@example.test,player\n');
    expect(rows).toEqual([{ Name: 'Cesar Alva', Email: 'cesar@example.test', Role: 'player' }]);
  });

  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('Name,Email,Role\n"Alva, Cesar",cesar@example.test,player\n');
    expect(rows[0].Name).toBe('Alva, Cesar');
  });

  it('handles escaped double quotes inside a quoted field', () => {
    const rows = parseCsv('Name,Email,Role\n"Cesar ""Chuy"" Alva",c@example.test,player\n');
    expect(rows[0].Name).toBe('Cesar "Chuy" Alva');
  });

  it('tolerates CRLF line endings and a UTF-8 BOM', () => {
    const rows = parseCsv('﻿Name,Email,Role\r\nCesar,c@example.test,player\r\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe('Cesar');
  });

  it('ignores blank lines and a missing trailing newline', () => {
    const rows = parseCsv('Name,Email,Role\nA,a@example.test,player\n\nB,b@example.test,coach');
    expect(rows).toHaveLength(2);
  });

  it('returns nothing for a header-only or empty file', () => {
    expect(parseCsv('Name,Email,Role\n')).toEqual([]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('normaliseRows', () => {
  const rows = (...rs: Record<string, string>[]) => rs;

  it('accepts a valid row and lowercases the email and role', () => {
    const { people, errors } = normaliseRows(rows({ Name: 'Cesar Alva', Email: 'Cesar@Example.Test', Role: 'Player' }));
    expect(errors).toEqual([]);
    expect(people).toEqual([{ name: 'Cesar Alva', email: 'cesar@example.test', role: 'player' }]);
  });

  it('rejects a role outside the allowed set rather than defaulting it', () => {
    // Defaulting an unrecognised role would silently grant whatever the default
    // is — the one mistake here that hands out access nobody asked for.
    const { people, errors } = normaliseRows(rows({ Name: 'X', Email: 'x@example.test', Role: 'admin' }));
    expect(people).toHaveLength(0);
    expect(errors[0]).toContain('must be one of');
    expect(VALID_ROLES).not.toContain('admin');
  });

  it('reports every problem instead of stopping at the first', () => {
    const { errors } = normaliseRows(rows(
      { Name: '', Email: 'a@example.test', Role: 'player' },
      { Name: 'B', Email: 'not-an-email', Role: 'coach' },
      { Name: 'C', Email: 'c@example.test', Role: 'wizard' }
    ));
    expect(errors).toHaveLength(3);
  });

  it('keeps the good rows when other rows are bad', () => {
    const { people, errors } = normaliseRows(rows(
      { Name: 'Good', Email: 'good@example.test', Role: 'player' },
      { Name: 'Bad', Email: 'nope', Role: 'player' }
    ));
    expect(people.map(p => p.email)).toEqual(['good@example.test']);
    expect(errors).toHaveLength(1);
  });

  it('flags a duplicate email rather than inviting it twice', () => {
    const { people, errors } = normaliseRows(rows(
      { Name: 'First', Email: 'dup@example.test', Role: 'player' },
      { Name: 'Second', Email: 'DUP@example.test', Role: 'coach' }
    ));
    expect(people).toHaveLength(1);
    expect(errors[0]).toContain('more than once');
  });

  it('skips wholly blank rows without complaining', () => {
    const { people, errors } = normaliseRows(rows({ Name: '', Email: '', Role: '' }));
    expect(people).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('numbers errors by spreadsheet line, counting the header', () => {
    const { errors } = normaliseRows(rows(
      { Name: 'Fine', Email: 'fine@example.test', Role: 'player' },
      { Name: 'Bad', Email: 'nope', Role: 'player' }
    ));
    expect(errors[0]).toContain('line 3');
  });
});

describe('isServiceRoleKey', () => {
  it('accepts a service_role key', () => {
    expect(isServiceRoleKey(jwt({ role: 'service_role' }))).toBe(true);
  });

  it('rejects the anon key', () => {
    // The anon key cannot create users. Catching it up front turns a confusing
    // per-row permission failure into one clear message before anything runs.
    expect(isServiceRoleKey(jwt({ role: 'anon' }))).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    expect(isServiceRoleKey('')).toBe(false);
    expect(isServiceRoleKey('not-a-jwt')).toBe(false);
    expect(isServiceRoleKey('a.!!!not-base64!!!.c')).toBe(false);
    expect(isServiceRoleKey(undefined as unknown as string)).toBe(false);
  });
});
