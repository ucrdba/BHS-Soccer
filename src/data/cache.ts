const PREFIX = 'bhs.cache.v1.';
const LEGACY_KEY = 'bhs_soccer_app_data';

export type CacheEntry<T> = { rows: T[]; fetchedAt: number };

export function readCache<T>(name: string): CacheEntry<T> | null {
  const raw = localStorage.getItem(PREFIX + name);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return { rows: parsed.rows as T[], fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

export function writeCache<T>(name: string, rows: T[], fetchedAt: number): void {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify({ rows, fetchedAt }));
  } catch {
    // Quota exceeded or storage disabled. A cache miss is survivable; a crash is not.
  }
}

/**
 * Renames the pre-migration monolithic blob out of the way exactly once.
 * Deliberately does NOT import it: that data is seed-contaminated and
 * re-importing it would re-pollute Postgres. Returns the backup key, or
 * null if there was nothing to back up.
 */
export function backupLegacyBlob(): string | null {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (raw === null) return null;
  const key = `${LEGACY_KEY}.backup.${new Date().toISOString().slice(0, 10)}`;
  localStorage.setItem(key, raw);
  localStorage.removeItem(LEGACY_KEY);
  return key;
}
