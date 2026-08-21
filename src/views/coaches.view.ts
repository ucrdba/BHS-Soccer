/**
 * BHS Soccer - Coaches View and Auth Modal Handlers
 *
 * Converted from js/views/coaches.view.js.
 */

import { auth } from '../auth';
import { BHSSoccerApp } from '../app.core';

export type AuthTab = 'signin' | 'register' | 'verify';

declare module '../app.core' {
  interface BHSSoccerApp {
    pendingVerifyEmail?: string;

    renderRestrictedAccess(featureName: string, reason: string): string;
    openAuthModal(): void;
    openLoginModal(): void;
    switchAuthTab(tab: AuthTab): void;
    handleSignIn(): Promise<void>;
    handleRegister(): Promise<void>;
    openVerifyTab(email: string): void;
    handleVerifyOtp(): Promise<void>;
    approveUserAccess(userId: string): Promise<void>;
    rejectUserAccess(userId: string): Promise<void>;
  }
}

Object.assign(BHSSoccerApp.prototype, {

  renderRestrictedAccess(this: BHSSoccerApp, featureName: string, reason: string): string {
    return `
      <div class="container">
        <div class="restricted-box">
          <div class="restricted-icon">🔒</div>
          <h2 style="color: #FFF; margin-bottom: 8px;">RESTRICTED TEAM AREA</h2>
          <h4 style="color: var(--bhs-gold-accent); margin-bottom: 16px;">${featureName}</h4>
          <p class="text-muted" style="margin-bottom: 24px; font-size: 0.95rem;">${reason}</p>
          <button class="btn btn-primary" onclick="app.openAuthModal()">🔑 Sign In / Switch Role</button>
        </div>
      </div>
    `;
  },

  openAuthModal(this: BHSSoccerApp): void {
    const currentUser = auth.getCurrentUser();
    if (!currentUser || currentUser.role === 'guest') {
      this.openLoginModal();
    } else {
      this.openAdminModal();
    }
  },

  openLoginModal(this: BHSSoccerApp): void {
    const modal = document.getElementById('loginModal');
    if (modal) { (modal as HTMLElement).style.display = ''; modal.classList.add('active'); }
    const feedback = document.getElementById('authFormFeedback');
    if (feedback) feedback.textContent = '';
  },

  switchAuthTab(this: BHSSoccerApp, tab: AuthTab): void {
    const signInForm = document.getElementById('signInForm') as HTMLElement | null;
    const registerForm = document.getElementById('registerForm') as HTMLElement | null;
    const verifyForm = document.getElementById('verifyForm') as HTMLElement | null;
    const tabSignInBtn = document.getElementById('tabSignInBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');

    if (tab === 'register') {
      if (signInForm) signInForm.style.display = 'none';
      if (registerForm) registerForm.style.display = '';
      if (verifyForm) verifyForm.style.display = 'none';
      if (tabSignInBtn) tabSignInBtn.className = 'btn btn-secondary';
      if (tabRegisterBtn) tabRegisterBtn.className = 'btn btn-cyan';
    } else if (tab === 'verify') {
      if (signInForm) signInForm.style.display = 'none';
      if (registerForm) registerForm.style.display = 'none';
      if (verifyForm) verifyForm.style.display = '';
      if (tabSignInBtn) tabSignInBtn.className = 'btn btn-secondary';
      if (tabRegisterBtn) tabRegisterBtn.className = 'btn btn-secondary';
    } else {
      if (signInForm) signInForm.style.display = '';
      if (registerForm) registerForm.style.display = 'none';
      if (verifyForm) verifyForm.style.display = 'none';
      if (tabSignInBtn) tabSignInBtn.className = 'btn btn-gold';
      if (tabRegisterBtn) tabRegisterBtn.className = 'btn btn-secondary';
    }
  },

  async handleSignIn(this: BHSSoccerApp): Promise<void> {
    const email = (document.getElementById('loginEmail') as HTMLInputElement).value;
    const password = (document.getElementById('loginPassword') as HTMLInputElement).value;
    const feedback = document.getElementById('authFormFeedback');

    const res = await auth.loginUser(email, password);
    if (res.success) {
      this.updateAuthUI();
      this.renderCurrentView();
      this.closeModals();
      alert(`🎉 Welcome back, ${res.user!.name}!`);
    } else {
      if (res.isPendingVerification) {
        this.openVerifyTab(res.user!.email);
      } else if (feedback) {
        feedback.innerHTML = `<span style="color: var(--color-danger);">${res.message}</span>`;
      }
    }
  },

  async handleRegister(this: BHSSoccerApp): Promise<void> {
    const name = (document.getElementById('regName') as HTMLInputElement).value;
    const email = (document.getElementById('regEmail') as HTMLInputElement).value;
    const password = (document.getElementById('regPassword') as HTMLInputElement).value;
    const role = (document.getElementById('regRole') as HTMLSelectElement).value;
    const feedback = document.getElementById('authFormFeedback');

    const res = await auth.registerUser({ name, email, password, role });
    if (res.success) {
      if (res.requiresVerification) {
        this.openVerifyTab(email);
      } else {
        this.updateAuthUI();
        this.renderCurrentView();
        this.closeModals();
        alert(`🎉 Account created successfully! Welcome, ${res.user!.name}.`);
      }
    } else {
      if (feedback) {
        feedback.innerHTML = `<span style="color: var(--color-danger);">${res.message}</span>`;
      }
    }
  },

  openVerifyTab(this: BHSSoccerApp, email: string): void {
    this.switchAuthTab('verify');
    this.pendingVerifyEmail = email;
    const targetEl = document.getElementById('verifyTargetEmail');
    if (targetEl) targetEl.textContent = email;
  },

  async handleVerifyOtp(this: BHSSoccerApp): Promise<void> {
    const code = (document.getElementById('verifyOtpCode') as HTMLInputElement).value;
    const feedback = document.getElementById('authFormFeedback');
    const email = this.pendingVerifyEmail
      || (document.getElementById('regEmail') as HTMLInputElement | null)?.value
      || (document.getElementById('loginEmail') as HTMLInputElement | null)?.value
      || '';

    const res = await auth.verifyUserOtp(email, code);
    if (res.success) {
      this.updateAuthUI();
      this.renderCurrentView();
      if (res.status === 'pending_approval') {
        alert(res.message);
        this.closeModals();
      } else {
        alert(`🎉 Email verified! Account activated for ${res.user!.name}.`);
        this.closeModals();
      }
    } else {
      if (feedback) {
        feedback.innerHTML = `<span style="color: var(--color-danger);">${res.message}</span>`;
      }
    }
  },

  async approveUserAccess(this: BHSSoccerApp, userId: string): Promise<void> {
    const ok = await auth.approveUserAccess(userId);
    if (ok) {
      this.updateAuthUI();
      this.renderCurrentView();
      this.renderAdminModalContent();
      alert('🎉 User access approved successfully!');
    }
  },

  async rejectUserAccess(this: BHSSoccerApp, userId: string): Promise<void> {
    const ok = await auth.rejectUserAccess(userId);
    if (ok) {
      this.renderAdminModalContent();
      alert('User request rejected.');
    }
  }

});
