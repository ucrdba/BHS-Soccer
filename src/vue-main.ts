/**
 * The Vue application's entry point.
 *
 * Deliberately separate from src/main.ts, which wires the legacy app. The two
 * share src/domain/, src/data/ and src/auth.ts, and nothing else: they never
 * run in the same document, and neither publishes globals the other reads.
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { auth } from './auth';
import { supabaseService } from './data/supabase';
import { setRoles, type RoleRow } from './auth/permissions';

/**
 * This app publishes no globals.
 *
 * It briefly had to: AuthManager read `window.supabaseService` in fifteen
 * places, having been written for the legacy app where `src/main.ts` publishes
 * it — so without that line every auth call here optional-chained to undefined
 * and degraded to a guest, reporting "Cloud authentication is not configured"
 * with nothing to say why. auth.ts now imports the service directly, so the
 * dependency is a real one the compiler can see and the line is gone.
 *
 * `src/main.ts` still publishes it, because the classic scripts under
 * public/js cannot import.
 */

const app = createApp(App);
app.use(createPinia());
app.use(router);

/**
 * Restore the session before the first render.
 *
 * The legacy app exposes this as `window.authReady` and awaits it inside
 * app.core.js. Here the mount simply waits, so no route guard can run against
 * a session that has not loaded yet and bounce a signed-in coach to the home
 * page — which is what would happen if the guards ran first.
 *
 * Every step degrades to a guest rather than taking the app down: a failed
 * auth call must not leave a blank page.
 */
async function boot(): Promise<void> {
  // An emailed confirmation link returns here with its tokens in the URL, and
  // this has to run BEFORE auth.init() reads the session -- otherwise init
  // sees a signed-out browser and the player lands on the guest home page
  // having just confirmed their account.
  try {
    await supabaseService.completeEmailLink();
  } catch (err) {
    console.warn('Email link completion notice:', err);
  }

  try {
    await auth.init();
    const rows = await supabaseService.fetchRoles();
    setRoles((rows as RoleRow[]) ?? []);
  } catch (err) {
    console.error('Auth initialisation failed; continuing as guest.', err);
  }

  app.mount('#vue-app');
}

boot();
