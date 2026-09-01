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

  /**
   * @param acceptTypedEmail true when the person has already been shown a
   *        suggested correction and chosen to keep what they typed.
   */
  async handleRegister(acceptTypedEmail = false) {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const role = document.getElementById('regRole').value;
    const feedback = document.getElementById('authFormFeedback');

    const res = await window.auth.registerUser({ name, email, password, role, acceptTypedEmail });

    // A near-miss for a common provider. Offered, never enforced: an
    // unfamiliar domain is ordinary for a club coach, and someone may
    // genuinely own an address one character from Gmail.
    if (!res.success && res.emailSuggestion) {
      this.showEmailSuggestion(res.emailSuggestion);
      return;
    }
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

  /**
   * Offer a corrected address with both answers equally available.
   *
   * Making "use what I typed" a plain link rather than a buried option matters:
   * the check cannot know every legitimate domain, so the person overruling it
   * must be an easy path, not a fight.
   */
  showEmailSuggestion(suggestion) {
    const feedback = document.getElementById('authFormFeedback');
    if (!feedback) return;
    feedback.innerHTML = `
      <div style="background:rgba(255,215,0,0.08); border:1px solid var(--bhs-gold-accent);
                  border-radius:6px; padding:10px 12px; text-align:left;">
        <div style="color:var(--bhs-gold-accent); font-size:0.85rem; margin-bottom:8px;">
          Did you mean <strong>${suggestion}</strong>?
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-gold" style="padding:4px 12px; font-size:0.8rem;"
                  onclick="app.useSuggestedEmail('${suggestion}')">Yes, use that</button>
          <button type="button" class="btn btn-secondary" style="padding:4px 12px; font-size:0.8rem;"
                  onclick="app.handleRegister(true)">No, use what I typed</button>
        </div>
      </div>`;
  },

  useSuggestedEmail(suggestion) {
    const field = document.getElementById('regEmail');
    if (field) field.value = suggestion;
    // Already corrected, so do not offer again — the corrected address could
    // itself be one character from another provider and loop.
    this.handleRegister(true);
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
