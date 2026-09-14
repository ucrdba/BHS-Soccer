/**
 * Backing out of a password reset.
 *
 * Opening a reset link sets AuthManager.recovering, which AuthModal reads to
 * route straight to "Set a new password" -- with no way out until this fix.
 * These pin the two ways `recovering` must clear again: an explicit cancel,
 * and signing out (a stale flag would reopen the password prompt for the
 * next person on a shared machine).
 *
 * Lives outside src/data/testdb/ deliberately: the AuthManager tests already
 * living there (src/data/testdb/vue-auth-wiring.test.ts) run against a real
 * local Supabase stack and are skipped when one is not answering, which is
 * the common case. This file mocks src/data/supabase.ts instead, so it runs
 * every time, with no stack required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./data/supabase', () => ({
  supabaseService: {
    signOutUser: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn(),
    isConfigured: () => true
  }
}));

import { AuthManager } from './auth';

describe('password recovery', () => {
  let auth: AuthManager;

  beforeEach(() => {
    auth = new AuthManager();
  });

  it('cancelPasswordRecovery clears the flag beginPasswordRecovery set', () => {
    auth.beginPasswordRecovery();
    expect(auth.isRecovering()).toBe(true);

    auth.cancelPasswordRecovery();
    expect(auth.isRecovering()).toBe(false);
  });

  it('beginPasswordSetup asks for a password, for choosing one rather than resetting it', () => {
    auth.beginPasswordSetup();
    expect(auth.isRecovering()).toBe(true);
    expect(auth.passwordPurpose()).toBe('setup');
  });

  it('beginPasswordRecovery is a reset, even after a setup was begun', () => {
    auth.beginPasswordSetup();
    auth.cancelPasswordRecovery();
    auth.beginPasswordRecovery();
    expect(auth.isRecovering()).toBe(true);
    expect(auth.passwordPurpose()).toBe('reset');
  });

  it('signing out clears recovery too, so it cannot leak to the next person', async () => {
    auth.beginPasswordRecovery();
    expect(auth.isRecovering()).toBe(true);

    await auth.logout();
    expect(auth.isRecovering()).toBe(false);
  });
});
