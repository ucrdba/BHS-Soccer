// src/main.ts
import { supabaseService } from './data/supabase';
import { auth } from './auth';

// `window.supabaseService` is already declared (as `SupabaseServiceLike`) in
// src/globals.d.ts, ambient-typing the classic scripts that still read this
// global. `supabaseService` structurally satisfies that interface, so no
// redeclaration is needed here — TS forbids two `declare global` blocks from
// giving the same Window property different types (TS2717). Only the globals
// this file adds (`auth`, `authReady`) are declared below.
declare global {
  interface Window {
    auth: typeof auth;
    authReady: Promise<void>;
  }
}

window.supabaseService = supabaseService;
window.auth = auth;

// Start session restoration immediately, but expose it as a Promise rather
// than blocking module evaluation with a top-level await. Whether top-level
// await delays DOMContentLoaded is subtle enough that the app should not
// depend on it — app.core.js awaits this explicitly instead.
//
// A rejected auth.init() must not take the app down with it: app.core.js awaits
// this promise above bindEvents/renderCurrentView, so an unhandled rejection
// would leave a static shell with no event handlers. Degrade to a guest session.
window.authReady = auth.init().catch((err) => {
  console.error('Auth initialisation failed; continuing as guest.', err);
});
