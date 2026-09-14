/**
 * The signed-in profile, as components see it.
 *
 * Wraps the existing `auth` singleton rather than replacing it: src/auth.ts is
 * real Supabase Auth over auth.users joined to public.profiles, and the legacy
 * app uses the same instance. This store is only the reactive surface.
 *
 * The flags are plain refs re-read on every auth change, not computeds that
 * call the singleton. Two reasons: a computed calling out to a non-reactive
 * object never invalidates on its own, and refs can be seeded directly in a
 * component test without mocking the auth module.
 *
 * Every flag additionally requires `status === 'active'` -- that is enforced
 * inside AuthManager and not repeated here. Signup lands in a pending-approval
 * state that a coach or admin clears.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { auth } from '../auth';
import { checkEmail, type EmailCheck } from '../auth/email-typo';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<any>(null);
  const role = ref<string>('guest');
  const isLoggedIn = ref(false);
  const isCoach = ref(false);
  const isAdmin = ref(false);
  const canAccessRatings = ref(false);
  /** True for a signed-out visitor, a fan, or an account still awaiting approval. */
  const isGuest = ref(true);
  const isSignedIn = ref(false);

  function sync(): void {
    const u = auth.getCurrentUser();
    user.value = u;
    role.value = auth.getRole();
    isLoggedIn.value = auth.isLoggedIn();
    isCoach.value = auth.isCoach();
    isAdmin.value = auth.isAdmin();
    canAccessRatings.value = auth.canAccessRatings();
    isGuest.value = !u || u.role === 'guest';
    isSignedIn.value = !!u && u.id !== 'user_guest';
  }

  sync();
  // Fires on every auth change. The legacy app re-renders the whole current
  // view from this; here it updates seven refs and Vue does the rest.
  auth.subscribe(sync);

  // ── Actions ───────────────────────────────────────────────────────────────
  // Thin wrappers over AuthManager, which is real Supabase Auth. Nothing here
  // authenticates anything; it calls and then re-reads.

  async function login(email: string, password: string) {
    const res = await auth.loginUser(email, password);
    sync();
    return res;
  }

  async function register(f: { name: string; email: string; password: string; role: string; teamId: string | null }) {
    const res = await auth.registerUser(f);
    sync();
    return res;
  }

  async function logout(): Promise<void> {
    await auth.logout();
    sync();
  }

  /**
   * Inspect an address before registering with it.
   *
   * checkEmail has been imported into src/auth.ts and never called, and
   * coaches.view.js branches on a `res.emailSuggestion` that RegisterResult
   * never carries -- so this tested module has never actually run. Wired up
   * here, at the point registration happens.
   *
   * A suggestion is an OFFER, never a verdict. An unfamiliar domain is
   * ordinary for a club coach and unknowable from here, so the caller must
   * leave keeping the typed address an equally easy path.
   */
  function inspectEmail(email: string): EmailCheck {
    return checkEmail(email);
  }

  return {
    user, role, isLoggedIn, isCoach, isAdmin, canAccessRatings, isGuest, isSignedIn,
    sync, login, register, logout, inspectEmail
  };
});
