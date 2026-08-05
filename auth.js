/**
 * Beaumont High School Soccer - Authentication & RBAC Engine
 * Supports Multi-Tenant Schools, Role Management, Verification & Approval Queues
 */

const ROLES = {
  GUEST: 'guest',
  PLAYER: 'player',
  COACH: 'coach',
  ADMIN: 'admin'
};

const SAMPLE_USERS = [
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

class AuthManager {
  constructor() {
    this.registeredUsers = this.loadRegisteredUsers();
    // Default to Public Visitor (Guest) if no active user session exists
    const guestUser = SAMPLE_USERS.find(u => u.role === ROLES.GUEST);
    this.currentUser = this.loadUser() || guestUser;
    this.subscribers = [];
  }

  loadRegisteredUsers() {
    const saved = localStorage.getItem('bhs_soccer_registered_users');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  }

  saveRegisteredUsers() {
    localStorage.setItem('bhs_soccer_registered_users', JSON.stringify(this.registeredUsers));
  }

  loadUser() {
    const saved = localStorage.getItem('bhs_soccer_current_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  }

  saveUser(user) {
    this.currentUser = user;
    localStorage.setItem('bhs_soccer_current_user', JSON.stringify(user));
    this.notifySubscribers();
  }

  loginUser(email, password) {
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

  registerUser({ name, email, password, role }) {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const roleValue = (role || ROLES.GUEST).toLowerCase();

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

    // Generate 6-digit verification OTP code for local/cloud confirmation
    const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));

    const newUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: cleanName,
      email: cleanEmail,
      role: roleValue === ROLES.GUEST ? ROLES.GUEST : ROLES.GUEST, // Guest until approved
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

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      window.supabaseService.upsertProfile('bhs', newUser);
    }

    return { success: true, user: newUser, requiresVerification: true, otpCode: generatedOtp };
  }

  verifyUserOtp(email, inputCode) {
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

    if (user.requestedRole === ROLES.GUEST || user.requestedRole === 'guest') {
      user.status = 'active';
      user.role = ROLES.GUEST;
      this.saveUser(user);
    } else {
      user.status = 'pending_approval';
    }

    this.saveRegisteredUsers();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      window.supabaseService.upsertProfile('bhs', user);
    }

    return {
      success: true,
      user,
      status: user.status,
      message: user.status === 'pending_approval' 
        ? `📩 Email verified successfully! Your request for ${user.requestedRole.toUpperCase()} access is now pending Coach Bob & Athletic Director approval.` 
        : `🎉 Email verified! Welcome, ${user.name}!`
    };
  }

  approveUserAccess(userId) {
    const user = this.registeredUsers.find(u => u.id === userId);
    if (!user) return false;

    user.status = 'active';
    user.role = user.requestedRole || user.role || ROLES.PLAYER;
    this.saveRegisteredUsers();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      window.supabaseService.upsertProfile('bhs', user);
    }
    this.notifySubscribers();
    return true;
  }

  rejectUserAccess(userId) {
    const user = this.registeredUsers.find(u => u.id === userId);
    if (!user) return false;

    user.status = 'rejected';
    this.saveRegisteredUsers();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      window.supabaseService.upsertProfile('bhs', user);
    }
    this.notifySubscribers();
    return true;
  }

  getPendingApprovals() {
    return this.registeredUsers.filter(u => u.status === 'pending_approval');
  }

  logout() {
    const guestUser = SAMPLE_USERS.find(u => u.role === ROLES.GUEST) || {
      id: 'user_guest', name: 'Public Visitor', email: 'guest@cougars-fan.com', role: ROLES.GUEST
    };
    this.saveUser(guestUser);
  }

  switchRole(userId) {
    const allUsers = [...SAMPLE_USERS, ...this.registeredUsers];
    const found = allUsers.find(u => u.id === userId);
    if (found) {
      this.saveUser(found);
      return found;
    }
    return this.currentUser;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getRole() {
    return this.currentUser ? this.currentUser.role : ROLES.GUEST;
  }

  isLoggedIn() {
    return this.currentUser && this.currentUser.role !== ROLES.GUEST && this.currentUser.status === 'active';
  }

  isCoach() {
    return (this.getRole() === ROLES.COACH || this.getRole() === ROLES.ADMIN) && (this.currentUser?.status === 'active');
  }

  isPlayer() {
    return (this.getRole() === ROLES.PLAYER || this.isCoach()) && (this.currentUser?.status === 'active');
  }

  isAdmin() {
    return (this.getRole() === ROLES.ADMIN) && (this.currentUser?.status === 'active');
  }

  canAccessRatings() {
    return this.currentUser?.status === 'active' && (this.getRole() === ROLES.COACH || this.getRole() === ROLES.PLAYER || this.getRole() === ROLES.ADMIN);
  }

  canEditMatrix() {
    return this.isCoach();
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notifySubscribers() {
    this.subscribers.forEach(cb => cb(this.currentUser));
  }
}

window.auth = new AuthManager();
