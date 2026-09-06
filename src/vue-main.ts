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
 * AuthManager reaches for `window.supabaseService`, in fifteen places.
 *
 * It predates this entry point and was written for the legacy app, where
 * `src/main.ts` publishes the service as a global. Without this line every
 * auth call here silently degrades to a guest — `window.supabaseService?.…`
 * optional-chains to undefined — and signing in reports "Cloud authentication
 * is not configured" with nothing in the console to say why.
 *
 * The tidier fix is for auth.ts to import the service directly, but it is
 * shared code with fifteen call sites and both apps depend on it, so that
 * wants its own change rather than being folded in here.
 */
(window as any).supabaseService = supabaseService;

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
