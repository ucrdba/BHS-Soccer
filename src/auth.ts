/**
 * BHS Soccer - Authentication & RBAC Engine
 * Backed by Supabase Auth (auth.users) + the `profiles` table for role/status/RBAC.
 * Supports Multi-Tenant Schools, Role Management, Verification & Approval Queues
 */

import type {
  AppUser, UserRole,
  LoginResult, RegisterResult
} from './types';

import { checkEmail } from './auth/email-typo';
// Imported rather than read off `window`. It used to reach for
// window.supabaseService in fifteen places, which meant the Vue entry point
// silently had no auth at all until it published that global, and which
// bypassed the client's real type signatures in favour of the looser ambient
// declaration in globals.d.ts.
import { supabaseService } from './data/supabase';

const ROLES = {
  GUEST: 'guest' as UserRole,
  PLAYER: 'player' as UserRole,
  COACH: 'coach' as UserRole,
  ADMIN: 'admin' as UserRole,
};

const GUEST_USER: AppUser = {
  id: 'user_guest',
  name: 'Public Visitor',
  email: '',
  role: ROLES.GUEST,
  status: 'active',
  emailVerified: true,
  schoolId: null
};

/**
 * A profile row as the app sees it.
 *
 * It used to label every user "Beaumont High School, Boys Varsity" whatever
 * their row said, so a club coach signed in under somebody else's crest. The
 * organization comes from the row now, and nothing substitutes one.
 */
function mapProfileRowToAppUser(row: Record<string, any>): AppUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    requestedRole: row.requested_role || undefined,
    requestedTeamId: row.requested_team_id || undefined,
    status: row.status,
    emailVerified: !!row.email_verified,
    schoolId: row.school_id || null,
    playerId: row.player_id || undefined,
    avatar: row.avatar_url || undefined,
    createdAt: row.created_at
      ? new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : undefined
  };
}

function humanizeAuthError(error?: { message: string } | null): string {
  const msg = error?.message || '';
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/user already registered/i.test(msg)) return 'An account with this email already exists. Try signing in instead.';
  return msg || 'Something went wrong. Please try again.';
}

export class AuthManager {
  currentUser: AppUser;
  private subscribers: Array<(user: AppUser) => void>;
  private recovering = false;
  private purpose: 'reset' | 'setup' = 'reset';

  constructor() {
    this.currentUser = GUEST_USER;
    this.subscribers = [];
  }

  async init(): Promise<void> {
    const sessionResult = await supabaseService.getSession();
    const session = sessionResult?.data?.session;
    this.currentUser = session ? (await this.loadProfileForSession()) || GUEST_USER : GUEST_USER;

    supabaseService.onAuthStateChange((_event, changedSession) => {
      if (_event === 'PASSWORD_RECOVERY') { this.recovering = true; this.purpose = 'reset'; }
      // Deferred via setTimeout: this callback runs while GoTrueClient holds its
      // navigator.locks lock, and loadProfileForSession() awaits another `auth`
      // call (getUser()) — awaiting that here, inside the callback's synchronous
      // frame, is a documented supabase-js v2 re-entrancy hazard that can hang.
      // Deferring to a macrotask lets the lock release first.
      setTimeout(async () => {
        this.currentUser = changedSession ? (await this.loadProfileForSession()) || GUEST_USER : GUEST_USER;
        this.notifySubscribers();
      }, 0);
    });
  }

  private async loadProfileForSession(): Promise<AppUser | null> {
    const row = await supabaseService.fetchOwnProfile();
    return row ? mapProfileRowToAppUser(row) : null;
  }

  private setCurrentUser(user: AppUser): void {
    this.currentUser = user;
    this.notifySubscribers();
  }

  async loginUser(email: string, password: string): Promise<LoginResult> {
    if (!supabaseService.isConfigured()) {
      return { success: false, message: 'Cloud authentication is not configured for this deployment.' };
    }

    const result = await supabaseService.signInUser(String(email || '').trim().toLowerCase(), password);
    if (!result || result.error) {
      return { success: false, message: humanizeAuthError(result?.error) };
    }

    const profile = await this.loadProfileForSession();
    if (!profile) {
      await supabaseService.signOutUser();
      return { success: false, message: 'Account profile could not be loaded. Please try again.' };
    }

    if (profile.status === 'pending_verification') {
      await supabaseService.signOutUser();
      return { success: false, isPendingVerification: true, message: 'Confirm your email first: open the link we sent you, then sign in.' };
    }
    if (profile.status === 'pending_approval') {
      this.setCurrentUser(profile);
      return {
        success: false, isPendingApproval: true, user: profile,
        message: profile.requestedRole === 'coach'
          ? 'Your request to join as a coach is waiting for an admin to approve it.'
          : "Your request is waiting for the team's coach to approve it."
      };
    }
    if (profile.status === 'rejected') {
      await supabaseService.signOutUser();
      return { success: false, message: 'Account access request was denied by team administrator.' };
    }

    this.setCurrentUser(profile);
    return { success: true, user: profile };
  }

  async registerUser(
    { name, email, password, role, teamId }:
    { name: string; email: string; password?: string; role?: string; teamId?: string | null }
  ): Promise<RegisterResult> {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const roleValue = ((role || ROLES.GUEST) as string).toLowerCase();

    if (!cleanName || !cleanEmail || !password) {
      return { success: false, message: 'Please provide a name, an email and a password.' };
    }
    if (roleValue !== ROLES.GUEST && !teamId) {
      return { success: false, message: 'Choose the team you are joining.' };
    }
    if (!supabaseService.isConfigured()) {
      return { success: false, message: 'Cloud authentication is not configured for this deployment.' };
    }

    const metadata: Record<string, string> = { name: cleanName, requested_role: roleValue };
    if (roleValue !== ROLES.GUEST && teamId) metadata.requested_team_id = teamId;

    const result = await supabaseService.signUpUser(cleanEmail, password, metadata);
    if (!result || result.error) {
      return { success: false, message: humanizeAuthError(result?.error) };
    }

    return { success: true, requiresVerification: true, message: 'Check your email for a link to confirm your account. When you open it you will choose your password.' };
  }

  async logout(): Promise<void> {
    await supabaseService.signOutUser();
    this.recovering = false;
    this.setCurrentUser(GUEST_USER);
  }

  getCurrentUser(): AppUser {
    return this.currentUser;
  }

  getRole(): UserRole {
    return this.currentUser ? this.currentUser.role : ROLES.GUEST;
  }

  isLoggedIn(): boolean {
    return this.currentUser && this.currentUser.role !== ROLES.GUEST && this.currentUser.status === 'active';
  }

  isCoach(): boolean {
    return (this.getRole() === ROLES.COACH || this.getRole() === ROLES.ADMIN) && (this.currentUser?.status === 'active');
  }

  isPlayer(): boolean {
    return (this.getRole() === ROLES.PLAYER || this.isCoach()) && (this.currentUser?.status === 'active');
  }

  isAdmin(): boolean {
    return (this.getRole() === ROLES.ADMIN) && (this.currentUser?.status === 'active');
  }

  canAccessRatings(): boolean {
    return this.currentUser?.status === 'active' &&
      (this.getRole() === ROLES.COACH || this.getRole() === ROLES.PLAYER || this.getRole() === ROLES.ADMIN);
  }

  canEditMatrix(): boolean {
    return this.isCoach();
  }

  /** A password reset link was opened: the next thing to ask for is a new password. */
  beginPasswordRecovery(): void {
    this.recovering = true;
    this.purpose = 'reset';
    this.notifySubscribers();
  }

  /**
   * A confirmation link was opened. Confirming clears the password typed at
   * sign-up (0035's handle_user_confirmed: whoever signed up first with an
   * address set it, and it may not have been the owner), so the next thing to
   * ask for is the password they will sign in with.
   */
  beginPasswordSetup(): void {
    this.recovering = true;
    this.purpose = 'setup';
    this.notifySubscribers();
  }

  isRecovering(): boolean {
    return this.recovering;
  }

  /** Whether the password prompt is a reset or the first password after confirming. */
  passwordPurpose(): 'reset' | 'setup' {
    return this.purpose;
  }

  /** The person opened a reset link but backed out without setting a password. */
  cancelPasswordRecovery(): void {
    this.recovering = false;
    this.notifySubscribers();
  }

  /**
   * Send a reset link.
   *
   * The answer is the same whether or not the address has an account: this
   * form must not be a way to find out who is registered.
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return { success: false, message: 'Enter the email address you signed up with.' };
    if (!supabaseService.isConfigured()) {
      return { success: false, message: 'Cloud authentication is not configured for this deployment.' };
    }
    const res = await supabaseService.requestPasswordReset(clean);
    if (!res.ok && /rate limit|too many/i.test(res.error || '')) {
      return { success: false, message: 'Too many reset emails were asked for. Wait a few minutes and try again.' };
    }
    if (!res.ok) return { success: false, message: 'The reset email could not be sent. Try again in a moment.' };
    return { success: true, message: `If ${clean} has an account, a link to set a new password is on its way.` };
  }

  async completePasswordReset(password: string): Promise<{ success: boolean; message: string }> {
    if (String(password || '').length < 6) return { success: false, message: 'Use at least 6 characters.' };
    const res = await supabaseService.updatePassword(password);
    if (!res.ok) return { success: false, message: res.error || 'That password could not be set.' };
    const purpose = this.purpose;
    this.recovering = false;
    this.notifySubscribers();
    return {
      success: true,
      message: purpose === 'setup' ? 'Password set. You are signed in.' : 'Password changed. You are signed in.'
    };
  }

  subscribe(callback: (user: AppUser) => void): void {
    this.subscribers.push(callback);
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(cb => cb(this.currentUser));
  }
}

// Global singleton — maintained for backward compatibility with inline HTML handlers
export const auth = new AuthManager();
(window as any).auth = auth;
