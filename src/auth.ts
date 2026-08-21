/**
 * BHS Soccer - Authentication & RBAC Engine
 * Backed by Supabase Auth (auth.users) + the `profiles` table for role/status/RBAC.
 * Supports Multi-Tenant Schools, Role Management, Verification & Approval Queues
 */

import type {
  AppUser, UserRole,
  LoginResult, RegisterResult, OtpVerifyResult
} from './types';
import './globals';

const ROLES = {
  GUEST: 'guest' as UserRole,
  PLAYER: 'player' as UserRole,
  COACH: 'coach' as UserRole,
  ADMIN: 'admin' as UserRole,
};

const GUEST_USER: AppUser = {
  id: 'user_guest',
  name: 'Public Visitor',
  email: 'guest@cougars-fan.com',
  role: ROLES.GUEST,
  status: 'active',
  emailVerified: true,
  schoolId: 'bhs',
  schoolName: 'Beaumont High School',
  teamLevel: 'Fan',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80'
};

function mapProfileRowToAppUser(row: Record<string, any>): AppUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    requestedRole: row.requested_role || undefined,
    status: row.status,
    emailVerified: !!row.email_verified,
    schoolId: 'bhs',
    schoolName: 'Beaumont High School',
    teamLevel: row.team_level || 'Boys Varsity',
    playerId: row.player_id || undefined,
    avatar: row.avatar_url || 'assets/bhs_cougars_logo.png',
    createdAt: row.created_at
      ? new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : undefined
  };
}

function humanizeAuthError(error?: { message: string } | null): string {
  const msg = error?.message || '';
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email before signing in.';
  if (/user already registered/i.test(msg)) return 'An account with this email already exists. Try signing in instead.';
  return msg || 'Something went wrong. Please try again.';
}

export class AuthManager {
  currentUser: AppUser;
  private subscribers: Array<(user: AppUser) => void>;

  constructor() {
    this.currentUser = GUEST_USER;
    this.subscribers = [];
  }

  async init(): Promise<void> {
    const sessionResult = await window.supabaseService?.getSession();
    const session = sessionResult?.data?.session;
    this.currentUser = session ? (await this.loadProfileForSession()) || GUEST_USER : GUEST_USER;

    window.supabaseService?.onAuthStateChange(async (_event, changedSession) => {
      this.currentUser = changedSession ? (await this.loadProfileForSession()) || GUEST_USER : GUEST_USER;
      this.notifySubscribers();
    });
  }

  private async loadProfileForSession(): Promise<AppUser | null> {
    const row = await window.supabaseService?.fetchOwnProfile();
    return row ? mapProfileRowToAppUser(row) : null;
  }

  private setCurrentUser(user: AppUser): void {
    this.currentUser = user;
    this.notifySubscribers();
  }

  async loginUser(email: string, password: string): Promise<LoginResult> {
    if (!window.supabaseService?.isConfigured()) {
      return { success: false, message: 'Cloud authentication is not configured for this deployment.' };
    }

    const result = await window.supabaseService.signInUser(String(email || '').trim().toLowerCase(), password);
    if (!result || result.error) {
      return { success: false, message: humanizeAuthError(result?.error) };
    }

    const profile = await this.loadProfileForSession();
    if (!profile) {
      await window.supabaseService.signOutUser();
      return { success: false, message: 'Account profile could not be loaded. Please try again.' };
    }

    if (profile.status === 'pending_verification') {
      this.setCurrentUser(profile);
      return { success: false, isPendingVerification: true, user: profile, message: 'Please enter your 6-digit email verification code to complete registration.' };
    }
    if (profile.status === 'pending_approval') {
      this.setCurrentUser(profile);
      return { success: false, isPendingApproval: true, user: profile, message: 'Your account email is verified! Request for Coach / Player access is currently pending Coach Bob / AD approval.' };
    }
    if (profile.status === 'rejected') {
      await window.supabaseService.signOutUser();
      return { success: false, message: 'Account access request was denied by team administrator.' };
    }

    this.setCurrentUser(profile);
    return { success: true, user: profile };
  }

  async registerUser({ name, email, password, role }: { name: string; email: string; password?: string; role?: string }): Promise<RegisterResult> {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const roleValue = ((role || ROLES.GUEST) as string).toLowerCase();

    if (!cleanName || !cleanEmail || !password) {
      return { success: false, message: 'Please provide Name, Email, and Password.' };
    }
    if (!window.supabaseService?.isConfigured()) {
      return { success: false, message: 'Cloud authentication is not configured for this deployment.' };
    }

    const result = await window.supabaseService.signUpUser(cleanEmail, password, { name: cleanName, requested_role: roleValue });
    if (!result || result.error) {
      return { success: false, message: humanizeAuthError(result?.error) };
    }

    return { success: true, requiresVerification: true, message: 'Account created — check your email for a 6-digit verification code.' };
  }

  async verifyUserOtp(email: string, inputCode: string): Promise<OtpVerifyResult> {
    if (!window.supabaseService?.isConfigured()) {
      return { success: false, message: 'Cloud authentication is not configured for this deployment.' };
    }

    const result = await window.supabaseService.verifyOtp(String(email || '').trim().toLowerCase(), String(inputCode || '').trim());
    if (!result || result.error) {
      return { success: false, message: 'Incorrect or expired verification code. Please try again.' };
    }

    const profile = await this.loadProfileForSession();
    if (!profile) {
      return { success: false, message: 'Verification succeeded but the account profile could not be loaded.' };
    }

    this.setCurrentUser(profile);

    return {
      success: true,
      user: profile,
      status: profile.status,
      message: profile.status === 'pending_approval'
        ? `📩 Email verified successfully! Your request for ${(profile.requestedRole || '').toUpperCase()} access is now pending Coach Bob & Athletic Director approval.`
        : `🎉 Email verified! Welcome, ${profile.name}!`
    };
  }

  async approveUserAccess(userId: string): Promise<boolean> {
    const row = await window.supabaseService?.approveProfile(userId);
    if (row) this.notifySubscribers();
    return !!row;
  }

  async rejectUserAccess(userId: string): Promise<boolean> {
    const row = await window.supabaseService?.rejectProfile(userId);
    if (row) this.notifySubscribers();
    return !!row;
  }

  async getPendingApprovals(): Promise<AppUser[]> {
    const rows = await window.supabaseService?.fetchPendingApprovals();
    return (rows || []).map(mapProfileRowToAppUser);
  }

  async logout(): Promise<void> {
    await window.supabaseService?.signOutUser();
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
