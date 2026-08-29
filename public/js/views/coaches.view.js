/**
 * BHS Soccer - Coaches View and Auth Modal Handlers
 */

Object.assign(BHSSoccerApp.prototype, {

  renderRestrictedAccess(featureName, reason) {
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

  openAuthModal() {
    const currentUser = window.auth.getCurrentUser();
    if (!currentUser || currentUser.role === 'guest') {
      this.openLoginModal();
    } else {
      this.openAdminModal();
    }
  },

  openLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
    const feedback = document.getElementById('authFormFeedback');
    if (feedback) feedback.textContent = '';
  },

  switchAuthTab(tab) {
    const signInForm = document.getElementById('signInForm');
    const registerForm = document.getElementById('registerForm');
    const verifyForm = document.getElementById('verifyForm');
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

  async handleSignIn() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const feedback = document.getElementById('authFormFeedback');

    const res = await window.auth.loginUser(email, password);
    if (res.success) {
      this.updateAuthUI();
      this.renderCurrentView();
      this.closeModals();
      alert(`🎉 Welcome back, ${res.user.name}!`);
    } else {
      if (res.isPendingVerification) {
        this.openVerifyTab(res.user.email);
      } else if (feedback) {
        feedback.innerHTML = `<span style="color: var(--color-danger);">${res.message}</span>`;
      }
    }
  },

  async handleRegister() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const role = document.getElementById('regRole').value;
    const feedback = document.getElementById('authFormFeedback');

    const res = await window.auth.registerUser({ name, email, password, role });
    if (res.success) {
      if (res.requiresVerification) {
        this.openVerifyTab(email);
      } else {
        this.updateAuthUI();
        this.renderCurrentView();
        this.closeModals();
        alert(`🎉 Account created successfully! Welcome, ${res.user.name}.`);
      }
    } else {
      if (feedback) {
        feedback.innerHTML = `<span style="color: var(--color-danger);">${res.message}</span>`;
      }
    }
  },

  openVerifyTab(email) {
    this.switchAuthTab('verify');
    this.pendingVerifyEmail = email;
    const targetEl = document.getElementById('verifyTargetEmail');
    const bannerEl = document.getElementById('simulatedCodeBanner');
    if (targetEl) targetEl.textContent = email;
    if (bannerEl) {
      bannerEl.textContent = 'We emailed you a 6-digit verification code. Enter it below.';
    }
  },

  async handleVerifyOtp() {
    const code = document.getElementById('verifyOtpCode').value;
    const feedback = document.getElementById('authFormFeedback');
    const email = this.pendingVerifyEmail || document.getElementById('regEmail').value || document.getElementById('loginEmail').value;

    const res = await window.auth.verifyUserOtp(email, code);
    if (res.success) {
      this.updateAuthUI();
      this.renderCurrentView();
      if (res.status === 'pending_approval') {
        alert(res.message);
        this.closeModals();
      } else {
        alert(`🎉 Email verified! Account activated for ${res.user.name}.`);
        this.closeModals();
      }
    } else {
      if (feedback) {
        feedback.innerHTML = `<span style="color: var(--color-danger);">${res.message}</span>`;
      }
    }
  },

  async approveUserAccess(userId) {
    const ok = await window.auth.approveUserAccess(userId);
    if (ok) {
      this.updateAuthUI();
      this.renderCurrentView();
      await this.openAdminModal();
      alert('🎉 User access approved successfully!');
    } else {
      alert('Could not complete that request. You may not have permission, or the account may have already been actioned.');
    }
  },

  async rejectUserAccess(userId) {
    const ok = await window.auth.rejectUserAccess(userId);
    if (ok) {
      await this.openAdminModal();
      alert('User request rejected.');
    } else {
      alert('Could not complete that request. You may not have permission, or the account may have already been actioned.');
    }
  }

});
