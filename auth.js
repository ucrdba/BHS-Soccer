/**
 * Beaumont High School Soccer - Authentication & RBAC Engine
 * Supports Multi-Tenant Schools, Role Management, & Permission Controls
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
      this.saveUser(existing);
      return { success: true, user: existing, isExisting: true };
    }

    const newUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: cleanName,
      email: cleanEmail,
      role: roleValue,
      schoolId: 'bhs',
      schoolName: 'Beaumont High School',
      teamLevel: roleValue === ROLES.COACH ? 'Boys Varsity Staff' : roleValue === ROLES.PLAYER ? 'Boys Varsity Player' : 'Fan / Public',
      avatar: 'assets/bhs_cougars_logo.png'
    };

    this.registeredUsers.unshift(newUser);
    this.saveRegisteredUsers();
    this.saveUser(newUser);

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      window.supabaseService.upsertProfile('bhs', newUser);
    }

    return { success: true, user: newUser };
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
    return this.currentUser && this.currentUser.role !== ROLES.GUEST;
  }

  isCoach() {
    return this.getRole() === ROLES.COACH || this.getRole() === ROLES.ADMIN;
  }

  isPlayer() {
    return this.getRole() === ROLES.PLAYER || this.isCoach();
  }

  isAdmin() {
    return this.getRole() === ROLES.ADMIN;
  }

  canAccessRatings() {
    return this.getRole() === ROLES.COACH || this.getRole() === ROLES.PLAYER || this.getRole() === ROLES.ADMIN;
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
