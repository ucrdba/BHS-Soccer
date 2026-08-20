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
    quickLogin(email: string, password?: string): void;
    handleSignIn(): void;
    handleRegister(): void;
    openVerifyTab(email: string, otpCode?: string): void;
    handleVerifyOtp(): void;
    approveUserAccess(userId: string): void;
    rejectUserAccess(userId: string): void;
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

  quickLogin(this: BHSSoccerApp, email: string, password?: string): void {
    const emailInput = document.getElementById('loginEmail') as HTMLInputElement | null;
    const passwordInput = document.getElementById('loginPassword') as HTMLInputElement | null;
    if (emailInput) emailInput.value = email;
    if (passwordInput) passwordInput.value = password || 'password';
    this.handleSignIn();
  },

  handleSignIn(this: BHSSoccerApp): void {
    const email = (document.getElementById('loginEmail') as HTMLInputElement).value;
    const password = (document.getElementById('loginPassword') as HTMLInputElement).value;
    const feedback = document.getElementById('authFormFeedback');

    const res = auth.loginUser(email, password);
    if (res.success) {
      this.updateAuthUI();
      this.renderCurrentView();
      this.closeModals();
      alert(`🎉 Welcome back, ${res.user!.name}!`);
    } else {
      if (res.isPendingVerification) {
        this.openVerifyTab(res.user!.email, res.user!.verificationCode);
      } else if (feedback) {
        feedback.innerHTML = `<span style="color: var(--color-danger);">${res.message}</span>`;
      }
    }
  },

  handleRegister(this: BHSSoccerApp): void {
    const name = (document.getElementById('regName') as HTMLInputElement).value;
    const email = (document.getElementById('regEmail') as HTMLInputElement).value;
    const password = (document.getElementById('regPassword') as HTMLInputElement).value;
    const role = (document.getElementById('regRole') as HTMLSelectElement).value;
    const feedback = document.getElementById('authFormFeedback');

    const res = auth.registerUser({ name, email, password, role });
    if (res.success) {
      if (res.requiresVerification) {
        this.openVerifyTab(email, res.otpCode);
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

  openVerifyTab(this: BHSSoccerApp, email: string, otpCode?: string): void {
    this.switchAuthTab('verify');
    this.pendingVerifyEmail = email;
    const targetEl = document.getElementById('verifyTargetEmail');
    const bannerEl = document.getElementById('simulatedCodeBanner');
    if (targetEl) targetEl.textContent = email;
    if (bannerEl && otpCode) {
      bannerEl.innerHTML = `⚡ DEMO VERIFICATION OTP CODE: <span style="font-size:1.1rem; letter-spacing:2px;">${otpCode}</span> (or enter 123456)`;
    }
  },

  handleVerifyOtp(this: BHSSoccerApp): void {
    const code = (document.getElementById('verifyOtpCode') as HTMLInputElement).value;
    const feedback = document.getElementById('authFormFeedback');
    const email = this.pendingVerifyEmail
      || (document.getElementById('regEmail') as HTMLInputElement | null)?.value
      || (document.getElementById('loginEmail') as HTMLInputElement | null)?.value
      || '';

    const res = auth.verifyUserOtp(email, code);
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

  approveUserAccess(this: BHSSoccerApp, userId: string): void {
    const ok = auth.approveUserAccess(userId);
    if (ok) {
      this.updateAuthUI();
      this.renderCurrentView();
      this.renderAdminModalContent();
      alert('🎉 User access approved successfully!');
    }
  },

  rejectUserAccess(this: BHSSoccerApp, userId: string): void {
    const ok = auth.rejectUserAccess(userId);
    if (ok) {
      this.renderAdminModalContent();
      alert('User request rejected.');
    }
  }

});
