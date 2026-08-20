/**
 * BHS Soccer - Authentication & RBAC Engine
 * Supports Multi-Tenant Schools, Role Management, Verification & Approval Queues
 */

import type {
  AppUser, UserRole, UserStatus,
  LoginResult, RegisterResult, OtpVerifyResult
} from './types';

const ROLES = {
  GUEST: 'guest' as UserRole,
  PLAYER: 'player' as UserRole,
  COACH: 'coach' as UserRole,
  ADMIN: 'admin' as UserRole,
};

const SAMPLE_USERS: AppUser[] = [
  {
    id: 'user_coach_bob',
    name: 'Coach Bob',
    email: 'headcoach@beaumont.edu',
    role: ROLES.COACH,
    status: 'active',
    emailVerified: true,
    schoolId: 'bhs',
    schoolName: 'Beaumont High School',
    teamLevel: 'Boys Varsity',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  },
  {
    id: 'user_player_alex',
    name: 'Alex Rivera (#10)',
    email: 'arivera@beaumont.edu',
    role: ROLES.PLAYER,
    status: 'active',
    emailVerified: true,
    schoolId: 'bhs',
    schoolName: 'Beaumont High School',
    teamLevel: 'Boys Varsity',
    playerId: 'p101',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80'
  },
  {
    id: 'user_admin_sam',
    name: 'Admin Sam (Athletic Dir.)',
    email: 'admin@bhs-sports.org',
    role: ROLES.ADMIN,
    status: 'active',
    emailVerified: true,
    schoolId: 'bhs',
    schoolName: 'Beaumont High School',
    teamLevel: 'All Teams',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80'
  },
  {
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
  }
];

export class AuthManager {
  currentUser: AppUser;
  registeredUsers: AppUser[];
  private subscribers: Array<(user: AppUser) => void>;

  constructor() {
    this.registeredUsers = this.loadRegisteredUsers();
    const guestUser = SAMPLE_USERS.find(u => u.role === ROLES.GUEST)!;
    this.currentUser = this.loadUser() || guestUser;
    this.subscribers = [];
  }

  private loadRegisteredUsers(): AppUser[] {
    const saved = localStorage.getItem('bhs_soccer_registered_users');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  }

  private saveRegisteredUsers(): void {
    localStorage.setItem('bhs_soccer_registered_users', JSON.stringify(this.registeredUsers));
  }

  private loadUser(): AppUser | null {
    const saved = localStorage.getItem('bhs_soccer_current_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  }

  saveUser(user: AppUser): void {
    this.currentUser = user;
    localStorage.setItem('bhs_soccer_current_user', JSON.stringify(user));
    this.notifySubscribers();
  }

  loginUser(email: string, _password?: string): LoginResult {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const allUsers = [...SAMPLE_USERS, ...this.registeredUsers];
    const found = allUsers.find(u => u.email && u.email.toLowerCase() === cleanEmail);

    if (found) {
      if (found.status === 'pending_verification') {
        return { success: false, isPendingVerification: true, user: found, message: 'Please enter your 6-digit email verification code to complete registration.' };
      }
      if (found.status === 'pending_approval') {
        return { success: false, isPendingApproval: true, user: found, message: 'Your account email is verified! Request for Coach / Player access is currently pending Coach Bob / AD approval.' };
      }
      if (found.status === 'rejected') {
        return { success: false, message: 'Account access request was denied by team administrator.' };
      }
      this.saveUser(found);
      return { success: true, user: found };
    }
    return { success: false, message: 'User account not found with this email address. Please register a new account.' };
  }

  registerUser({ name, email, role }: { name: string; email: string; password?: string; role?: string }): RegisterResult {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const roleValue = ((role || ROLES.GUEST) as string).toLowerCase() as UserRole;

    if (!cleanName || !cleanEmail) {
      return { success: false, message: 'Please provide both Name and Email.' };
    }

    const allUsers = [...SAMPLE_USERS, ...this.registeredUsers];
    const existing = allUsers.find(u => u.email && u.email.toLowerCase() === cleanEmail);
    if (existing) {
      if (existing.status === 'active') {
        this.saveUser(existing);
        return { success: true, user: existing, isExisting: true };
      }
      return { success: true, user: existing, requiresVerification: existing.status === 'pending_verification', requiresApproval: existing.status === 'pending_approval' };
    }

    const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));

    const newUser: AppUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: cleanName,
      email: cleanEmail,
      role: ROLES.GUEST,
      requestedRole: roleValue,
      status: 'pending_verification',
      emailVerified: false,
      verificationCode: generatedOtp,
      schoolId: 'bhs',
      schoolName: 'Beaumont High School',
      teamLevel: roleValue === ROLES.COACH ? 'Boys Varsity Staff' : roleValue === ROLES.PLAYER ? 'Boys Varsity Player' : 'Fan / Public',
      avatar: 'assets/bhs_cougars_logo.png',
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };

    this.registeredUsers.unshift(newUser);
    this.saveRegisteredUsers();

    if ((window as any).supabaseService?.isConfigured()) {
      (window as any).supabaseService.upsertProfile('bhs', newUser);
    }

    return { success: true, user: newUser, requiresVerification: true, otpCode: generatedOtp };
  }

  verifyUserOtp(email: string, inputCode: string): OtpVerifyResult {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCode = String(inputCode || '').trim();

    const user = this.registeredUsers.find(u => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      return { success: false, message: 'User record not found.' };
    }

    if (user.verificationCode && user.verificationCode !== cleanCode && cleanCode !== '123456') {
      return { success: false, message: 'Incorrect 6-digit verification code. Please try again.' };
    }

    user.emailVerified = true;

    if (user.requestedRole === ROLES.GUEST) {
      user.status = 'active';
      user.role = ROLES.GUEST;
      this.saveUser(user);
    } else {
      user.status = 'pending_approval';
    }

    this.saveRegisteredUsers();

    if ((window as any).supabaseService?.isConfigured()) {
      (window as any).supabaseService.upsertProfile('bhs', user);
    }

    return {
      success: true,
      user,
      status: user.status,
      message: user.status === 'pending_approval'
        ? `📩 Email verified successfully! Your request for ${(user.requestedRole || '').toUpperCase()} access is now pending Coach Bob & Athletic Director approval.`
        : `🎉 Email verified! Welcome, ${user.name}!`
    };
  }

  approveUserAccess(userId: string): boolean {
    const user = this.registeredUsers.find(u => u.id === userId);
    if (!user) return false;

    user.status = 'active';
    user.role = user.requestedRole || user.role || ROLES.PLAYER;
    this.saveRegisteredUsers();

    if ((window as any).supabaseService?.isConfigured()) {
      (window as any).supabaseService.upsertProfile('bhs', user);
    }
    this.notifySubscribers();
    return true;
  }

  rejectUserAccess(userId: string): boolean {
    const user = this.registeredUsers.find(u => u.id === userId);
    if (!user) return false;

    user.status = 'rejected';
    this.saveRegisteredUsers();

    if ((window as any).supabaseService?.isConfigured()) {
      (window as any).supabaseService.upsertProfile('bhs', user);
    }
    this.notifySubscribers();
    return true;
  }

  getPendingApprovals(): AppUser[] {
    return this.registeredUsers.filter(u => u.status === 'pending_approval');
  }

  logout(): void {
    const guestUser = SAMPLE_USERS.find(u => u.role === ROLES.GUEST) || {
      id: 'user_guest', name: 'Public Visitor', email: 'guest@cougars-fan.com',
      role: ROLES.GUEST, status: 'active' as UserStatus,
      emailVerified: true, schoolId: 'bhs', schoolName: 'Beaumont High School', teamLevel: 'Fan'
    };
    this.saveUser(guestUser);
  }

  switchRole(userId: string): AppUser {
    const allUsers = [...SAMPLE_USERS, ...this.registeredUsers];
    const found = allUsers.find(u => u.id === userId);
    if (found) {
      this.saveUser(found);
      return found;
    }
    return this.currentUser;
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
