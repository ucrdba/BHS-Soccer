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
    this.currentUser = this.loadUser() || SAMPLE_USERS[0]; // Default to Coach Bob for full features
    this.subscribers = [];
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

  switchRole(userId) {
    const found = SAMPLE_USERS.find(u => u.id === userId);
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
    // User requirement: "Coaches and players will be the only ones with access to ratings."
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
