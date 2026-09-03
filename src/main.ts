// src/main.ts
import { supabaseService } from './data/supabase';
import { buildInfo, formatBuildStamp, buildStampTitle } from './build-info';
import { auth } from './auth';
import { can, setRoles, type RoleRow } from './auth/permissions';
import { backupLegacyBlob } from './data/cache';
import { resolveActiveTeam } from './data/team-scope';

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
    emailLinkResult?: { outcome: string; message?: string };
    can: typeof can;
    resolveActiveTeam: typeof resolveActiveTeam;
  }
}

window.supabaseService = supabaseService;
window.auth = auth;
window.resolveActiveTeam = resolveActiveTeam;

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
// An emailed confirmation link returns here with its tokens in the URL. This
// has to run BEFORE auth.init() reads the session, or init sees a signed-out
// browser and the player lands on the guest home page having just confirmed
// their account — which is exactly the bug this fixes.
//
// The result is stashed on window rather than acted on here: this module owns
// wiring, and the classic scripts own what the page says. utils.js reads it
// once the app has rendered.
window.authReady = supabaseService.completeEmailLink()
  .then((res) => { window.emailLinkResult = res; })
  .catch((err) => {
    console.warn('Email link completion notice:', err);
    window.emailLinkResult = { outcome: 'none' };
  })
  .then(() => auth.init())
  .then(async () => {
    const rows = await supabaseService.fetchRoles();
    setRoles((rows as RoleRow[]) ?? []);
  })
  .catch((err) => {
    console.error('Auth initialisation failed; continuing as guest.', err);
  });

window.can = can;


/**
 * Show which build is serving this page, in the footer.
 *
 * The formatting lives in build-info.ts so it can be tested without booting
 * the app; this only puts the result on screen and on `window.BUILD`, where a
 * console or a later diagnostics panel can read it without re-deriving it.
 */
function showBuildStamp(): void {
  const info = buildInfo();
  (window as any).BUILD = info;

  const el = document.getElementById('buildStamp');
  if (!el) return;
  el.textContent = formatBuildStamp(info);
  el.setAttribute('title', buildStampTitle(info));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', showBuildStamp);
} else {
  showBuildStamp();
}
