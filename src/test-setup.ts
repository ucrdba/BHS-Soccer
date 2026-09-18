/**
 * Runs before every test file.
 *
 * Sorts are remembered on the device (`data/sort-memory.ts`), so a test that
 * clicks a column would otherwise leave the next test in its file opening on
 * that sort. Only the remembered sorts are cleared: other tests set their own
 * storage deliberately.
 */
import { beforeEach } from 'vitest';

beforeEach(() => {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('bhs.sort.'))
      .forEach(k => localStorage.removeItem(k));
  } catch {
    // A test that has stubbed storage to throw restores it itself.
  }
});
