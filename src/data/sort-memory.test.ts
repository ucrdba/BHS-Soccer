/**
 * Remembering how a coach last sorted a table, on this device.
 *
 * A sort is a viewing preference, so it lives in the browser beside the active
 * team rather than in Postgres. Two promises matter: a saved sort comes back,
 * and nothing about the saved value can break a screen -- a column that no
 * longer exists, a garbled value, or storage the browser refuses all fall
 * back to the screen's own starting sort, silently.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readSort, writeSort } from './sort-memory';

const COLUMNS = ['rank', 'name', 'earned'];
const DEFAULT = { by: 'rank', reversed: false };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('a remembered sort', () => {
  it('comes back as it was saved, column and direction', () => {
    writeSort('board', { by: 'earned', reversed: true });
    expect(readSort('board', COLUMNS, DEFAULT)).toEqual({ by: 'earned', reversed: true });
  });

  it('is kept apart from another screen\'s', () => {
    writeSort('board', { by: 'earned', reversed: true });
    expect(readSort('roster', ['number', 'name'], { by: 'number', reversed: false }))
      .toEqual({ by: 'number', reversed: false });
  });

  it('is the default when nothing has been saved', () => {
    expect(readSort('board', COLUMNS, DEFAULT)).toEqual(DEFAULT);
  });

  it('returns a copy, so changing it does not change the default', () => {
    const got = readSort('board', COLUMNS, DEFAULT);
    got.by = 'name';
    expect(DEFAULT.by).toBe('rank');
  });
});

describe('a saved sort that no longer fits', () => {
  it('falls back when its column is not one this screen offers', () => {
    writeSort('board', { by: 'goals', reversed: true });
    expect(readSort('board', COLUMNS, DEFAULT)).toEqual(DEFAULT);
  });

  it('falls back on a garbled value', () => {
    localStorage.setItem('bhs.sort.v1.board', '{not json');
    expect(readSort('board', COLUMNS, DEFAULT)).toEqual(DEFAULT);
    localStorage.setItem('bhs.sort.v1.board', JSON.stringify({ by: 7 }));
    expect(readSort('board', COLUMNS, DEFAULT)).toEqual(DEFAULT);
  });

  it('reads a missing direction as not reversed', () => {
    localStorage.setItem('bhs.sort.v1.board', JSON.stringify({ by: 'name' }));
    expect(readSort('board', COLUMNS, DEFAULT)).toEqual({ by: 'name', reversed: false });
  });
});

describe('storage the browser refuses', () => {
  it('reads as the default rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(readSort('board', COLUMNS, DEFAULT)).toEqual(DEFAULT);
  });

  it('saves nothing rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => writeSort('board', { by: 'name', reversed: false })).not.toThrow();
  });
});
