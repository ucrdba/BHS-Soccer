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
  const recovering = ref(false);
  /** 'setup' after a confirmation link (choose a first password), 'reset' after a reset link. */
  const passwordPurpose = ref<'reset' | 'setup'>('reset');

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
    recovering.value = auth.isRecovering();
    passwordPurpose.value = auth.passwordPurpose();
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

  async function requestPasswordReset(email: string) {
    return auth.requestPasswordReset(email);
  }

  async function completePasswordReset(password: string) {
    const res = await auth.completePasswordReset(password);
    sync();
    return res;
  }

  function cancelPasswordRecovery(): void {
    auth.cancelPasswordRecovery();
    sync();
  }

  return {
    user, role, isLoggedIn, isCoach, isAdmin, canAccessRatings, isGuest, isSignedIn, recovering, passwordPurpose,
    sync, login, register, logout, requestPasswordReset, completePasswordReset, cancelPasswordRecovery
  };
});
