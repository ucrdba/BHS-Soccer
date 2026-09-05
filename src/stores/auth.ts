/**
 * The signed-in profile, as components see it.
 *
 * Wraps the existing `auth` singleton rather than replacing it: src/auth.ts is
 * real Supabase Auth over auth.users joined to public.profiles, and the legacy
 * app uses the same instance. This store is only the reactive surface.
 *
 * Every guard here additionally requires `status === 'active'` -- that is
 * enforced inside AuthManager, not repeated here. Signup lands in a
 * pending-approval state that a coach or admin clears.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { auth } from '../auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(auth.getCurrentUser());

  /**
   * auth.subscribe fires on every auth change. The legacy app re-renders the
   * whole current view from it; here it updates one ref and Vue does the rest,
   * which is most of the reason for the migration.
   */
  auth.subscribe(() => { user.value = auth.getCurrentUser(); });

  return {
    user,
    role: computed(() => auth.getRole()),
    isLoggedIn: computed(() => auth.isLoggedIn()),
    isCoach: computed(() => auth.isCoach()),
    isAdmin: computed(() => auth.isAdmin()),
    canAccessRatings: computed(() => auth.canAccessRatings()),

    /** True for a signed-out visitor or an unapproved account. */
    isGuest: computed(() => {
      const u = auth.getCurrentUser();
      return !u || u.role === 'guest';
    })
  };
});
