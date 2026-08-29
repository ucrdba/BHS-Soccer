// src/main.ts
import { supabaseService } from './data/supabase';
import { auth } from './auth';
import { can, setRoles, type RoleRow } from './auth/permissions';
import { backupLegacyBlob } from './data/cache';

// `window.supabaseService` is already declared (as `SupabaseServiceLike`) in
// src/globals.d.ts, ambient-typing the classic scripts that still read this
// global. `supabaseService` structurally satisfies that interface, so no
// redeclaration is needed here — TS forbids two `declare global` blocks from
// giving the same Window property different types (TS2717). Only the globals
// this file adds (`auth`, `authReady`, `can`) are declared below.
declare global {
  interface Window {
    auth: typeof auth;
    authReady: Promise<void>;
    can: typeof can;
  }
}

window.supabaseService = supabaseService;
window.auth = auth;

// The pre-migration monolithic localStorage blob is seed-contaminated (it was
// written by the old loadData() that substituted DEFAULT_BHS_DATA into empty
// collections). Back it up under a dated key and remove the original so it
// can never be read back in — Postgres, via the cache in src/data/cache.ts,
// is now the only source of truth.
const backedUp = backupLegacyBlob();
if (backedUp) {
  console.info(`Legacy local data preserved at "${backedUp}". Postgres is now authoritative.`);
}

// Start session restoration immediately, but expose it as a Promise rather
// than blocking module evaluation with a top-level await. Whether top-level
// await delays DOMContentLoaded is subtle enough that the app should not
// depend on it — app.core.js awaits this explicitly instead.
//
// A rejected auth.init() must not take the app down with it: app.core.js awaits
// this promise above bindEvents/renderCurrentView, so an unhandled rejection
// would leave a static shell with no event handlers. Degrade to a guest session.
//
// The roles load is chained via `.then()` BEFORE the `.catch()` below, so that
// a roles-load failure is caught too. Appending `.then()` after `.catch()`
// would let a rejected fetchRoles() reject window.authReady itself and
// reproduce the exact bug the `.catch()` exists to prevent.
window.authReady = auth.init()
  .then(async () => {
    const rows = await supabaseService.fetchRoles();
    setRoles((rows as RoleRow[]) ?? []);
  })
  .catch((err) => {
    console.error('Auth initialisation failed; continuing as guest.', err);
  });

window.can = can;
