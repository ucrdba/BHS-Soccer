import type { CacheEntry } from './cache';

export type CollectionStatus = 'loading' | 'ready' | 'stale' | 'error';

export interface CollectionState<T> {
  rows: T[];
  status: CollectionStatus;
  fetchedAt: number | null;
  error: string | null;
}

// Each variant declares the other's key as optional-undefined. This repo's
// tsconfig sets `strict: false` (so the ported JS typechecks without a
// rewrite), and under `strictNullChecks: false` a boolean-literal discriminant
// does NOT narrow a generic union — `result.error` after `if (result.ok)`
// fails to compile. Declaring both keys on both variants makes the access
// resolve while the discriminant still documents intent. Do not "simplify"
// this back to a bare two-member union, and do not turn on `strict` to make
// it work: that would break the ported supabaseClient code.
export type FetchResult<T> =
  | { ok: true; rows: T[]; error?: undefined }
  | { ok: false; rows?: undefined; error: string };

export function initialState<T>(): CollectionState<T> {
  return { rows: [], status: 'loading', fetchedAt: null, error: null };
}

export function resolveFetch<T>(args: {
  result: FetchResult<T>;
  cached: CacheEntry<T> | null;
  sessionValid: boolean;
  now: number;
}): CollectionState<T> {
  const { result, cached, sessionValid, now } = args;

  if (result.ok) {
    // RLS filters SELECTs silently: an expired session returns 200 with zero
    // rows rather than a 403. Without this guard an expired coach session
    // renders as an empty roster instead of an error.
    if (result.rows.length === 0 && !sessionValid) {
      return {
        rows: [], status: 'error', fetchedAt: null,
        error: 'Your session has expired. Sign in again to load this data.',
      };
    }
    // An empty result on a valid session is a real answer. Never fall back.
    return { rows: result.rows, status: 'ready', fetchedAt: now, error: null };
  }

  if (cached) {
    return {
      rows: cached.rows, status: 'stale',
      fetchedAt: cached.fetchedAt, error: result.error,
    };
  }

  return { rows: [], status: 'error', fetchedAt: null, error: result.error };
}
