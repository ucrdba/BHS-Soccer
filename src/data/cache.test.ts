import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readCache, writeCache, backupLegacyBlob } from './cache';

beforeEach(() => localStorage.clear());

describe('cache', () => {
  it('round-trips rows and fetchedAt', () => {
    writeCache('players', [{ id: 'p1' }], 1000);
    expect(readCache('players')).toEqual({ rows: [{ id: 'p1' }], fetchedAt: 1000 });
  });

  it('returns null for a missing collection', () => {
    expect(readCache('players')).toBeNull();
  });

  it('returns null rather than throwing on corrupt JSON', () => {
    localStorage.setItem('bhs.cache.v1.players', '{not json');
    expect(readCache('players')).toBeNull();
  });

  // Storage access itself can throw, not just parsing — a sandboxed iframe or a
  // browser with site data blocked throws SecurityError from getItem.
  it('returns null rather than throwing when storage access itself fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => readCache('players')).not.toThrow();
    expect(readCache('players')).toBeNull();
    spy.mockRestore();
  });

  it('writes under a versioned key', () => {
    writeCache('players', [], 1);
    expect(localStorage.getItem('bhs.cache.v1.players')).not.toBeNull();
  });

  it('caches an empty array as a real value, not as absence', () => {
    writeCache('players', [], 500);
    expect(readCache('players')).toEqual({ rows: [], fetchedAt: 500 });
  });

  it('backs up the legacy blob without importing it, and only once', () => {
    localStorage.setItem('bhs_soccer_app_data', '{"players":[]}');
    const key = backupLegacyBlob();
    expect(key).toMatch(/^bhs_soccer_app_data\.backup\./);
    expect(localStorage.getItem(key!)).toBe('{"players":[]}');
    expect(localStorage.getItem('bhs_soccer_app_data')).toBeNull();
    expect(backupLegacyBlob()).toBeNull();
  });
});
