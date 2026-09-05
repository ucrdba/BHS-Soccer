/**
 * BHS Soccer - Utilities (modals, prompt/confirm dialogs, countdown timer)
 * Adds modal helpers and countdown methods to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 * Also contains the initApp() boot function.
 */

Object.assign(BHSSoccerApp.prototype, {

  closeModal(modalId) {
    if (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        return;
      }
    }
    this.closeModals();
  },

  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.classList.remove('active');
      modal.style.display = '';
    });
  },

  showPromptModal({ title, message, defaultValue = '', placeholder = '', confirmText = 'Submit', onConfirm, onCancel }) {
    this._customPromptCallback = onConfirm;
    this._customPromptCancelCallback = onCancel;
    
    const modal = document.getElementById('customPromptModal');
    const titleEl = document.getElementById('customPromptTitle');
    const msgEl = document.getElementById('customPromptMessage');
    const inputEl = document.getElementById('customPromptInput');
    const submitBtn = document.getElementById('customPromptSubmitBtn');
    
    if (modal && titleEl && msgEl && inputEl) {
      titleEl.textContent = title || 'INPUT REQUIRED';
      msgEl.textContent = message || '';
      inputEl.value = defaultValue || '';
      if (placeholder) inputEl.placeholder = placeholder;
      if (submitBtn) submitBtn.textContent = confirmText || 'Submit';
      
      modal.style.display = '';
      modal.classList.add('active');
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 50);
    } else if (onConfirm) {
      const val = prompt(`${title ? title + '\n\n' : ''}${message}`, defaultValue);
      onConfirm(val);
    }
  },

  submitCustomPrompt() {
    const inputEl = document.getElementById('customPromptInput');
    const val = inputEl ? inputEl.value : '';
    const cb = this._customPromptCallback;
    this.closeModals();
    this._customPromptCallback = null;
    this._customPromptCancelCallback = null;
    if (cb) cb(val);
  },

  cancelCustomPrompt() {
    const cb = this._customPromptCancelCallback;
    this.closeModals();
    this._customPromptCallback = null;
    this._customPromptCancelCallback = null;
    if (cb) cb(null);
  },

  showAlertModal(title, message) {
    this.showPromptModal({
      title: title || 'NOTICE',
      message: message || '',
      defaultValue: '',
      confirmText: 'OK',
      onConfirm: () => {}
    });
  },

  showConfirmModal({ title, message, confirmText = 'Confirm', confirmClass = 'btn-gold', onConfirm, onCancel }) {
    this._customConfirmCallback = onConfirm;
    this._customConfirmCancelCallback = onCancel;
    
    const modal = document.getElementById('customConfirmModal');
    const titleEl = document.getElementById('customConfirmTitle');
    const msgEl = document.getElementById('customConfirmMessage');
    const submitBtn = document.getElementById('customConfirmSubmitBtn');
    
    if (modal && titleEl && msgEl && submitBtn) {
      titleEl.textContent = title || 'CONFIRM ACTION';
      msgEl.textContent = message || '';
      submitBtn.textContent = confirmText || 'Confirm';
      submitBtn.className = `btn ${confirmClass || 'btn-gold'}`;
      
      modal.style.display = '';
      modal.classList.add('active');
    } else if (onConfirm) {
      if (window.confirm(`${title ? title + '\n\n' : ''}${message}`)) {
        onConfirm();
      } else if (onCancel) {
        onCancel();
      }
    }
  },

  submitCustomConfirm() {
    const cb = this._customConfirmCallback;
    this.closeModals();
    this._customConfirmCallback = null;
    this._customConfirmCancelCallback = null;
    if (cb) cb();
  },

  cancelCustomConfirm() {
    const cb = this._customConfirmCancelCallback;
    this.closeModals();
    this._customConfirmCallback = null;
    this._customConfirmCancelCallback = null;
    if (cb) cb();
  },

  attachDynamicListeners() {
    // No dynamic listeners at present. Retained because renderCurrentView()
    // calls this after every view swap.
  },

  // The six functions below live in src/domain/schedule.ts and reach this
  // classic script through window, the same way the plus/minus replay engine
  // does. See docs/superpowers/specs/2026-09-05-vue-migration-design.md.

  parseMatchDateTime(dateStr, timeStr) {
    return window.scheduleDomain.parseMatchDateTime(dateStr, timeStr);
  },

  matchDateTime(m) {
    return window.scheduleDomain.matchDateTime(m);
  },

  getNextMatch() {
    return window.scheduleDomain.getNextMatch(this.data.schedule || []);
  },

  scheduleState() {
    return window.scheduleDomain.scheduleState(this.data.schedule || []);
  },

  lastPlayedMatch() {
    return window.scheduleDomain.lastPlayedMatch(this.data.schedule || []);
  },

  // Keeps its original name: index.html and the home view call it by this one.
  getNextMatchCountdown() {
    return window.scheduleDomain.nextMatchCountdown(this.data.schedule || []);
  },

  updateCountdownUI() {
    const daysEl = document.getElementById('cdDays');
    const hoursEl = document.getElementById('cdHours');
    const minsEl = document.getElementById('cdMins');

    if (daysEl && hoursEl && minsEl) {
      const countdown = this.getNextMatchCountdown();
      if (countdown) {
        daysEl.textContent = countdown.days;
        hoursEl.textContent = countdown.hours;
        minsEl.textContent = countdown.mins;
      } else {
        daysEl.textContent = '00';
        hoursEl.textContent = '00';
        minsEl.textContent = '00';
      }
    }
  },

  startCountdownTimer() {
    this.updateCountdownUI();
    setInterval(() => {
      this.updateCountdownUI();
    }, 10000);
  }

});


function initApp() {
  if (!window.app) {
    window.app = new BHSSoccerApp();
  }
  showEmailLinkOutcome();
}

/**
 * Say what an emailed confirmation link actually did.
 *
 * Without this a player clicks the link in their email, the account is
 * confirmed at Supabase, and the app renders its ordinary guest home page —
 * so the only visible outcome of confirming your account is nothing at all.
 * That was the reported bug; establishing the session was only half of it.
 *
 * src/main.ts sets window.emailLinkResult before the app boots.
 */
function showEmailLinkOutcome() {
  const res = window.emailLinkResult;
  if (!res || res.outcome === 'none') return;

  const copy = {
    // Signed in here: the same browser that registered.
    confirmed: {
      tone: 'ok',
      title: 'Email confirmed',
      body: 'Your account is now waiting for a coach to approve it. You will be able to see your team once they do.'
    },
    // The cross-device case — registered on a laptop, opened the mail on a
    // phone. No session can be created here, but the account IS confirmed, and
    // saying so is the difference between "done" and "nothing happened".
    verified: {
      tone: 'ok',
      title: 'Email confirmed',
      body: 'Sign in with your email and password to finish. A coach still needs to approve your account before you can see your team.'
    },
    error: {
      tone: 'bad',
      title: 'That link did not work',
      body: res.message || 'It may have expired or already been used. Try signing in — if that fails, register again.'
    }
  }[res.outcome];
  if (!copy) return;

  const ok = copy.tone === 'ok';
  const box = document.createElement('div');
  box.setAttribute('role', 'status');
  box.style.cssText = [
    'position:fixed', 'left:50%', 'top:18px', 'transform:translateX(-50%)',
    'z-index:9999', 'max-width:min(92vw,460px)', 'padding:14px 18px',
    'border-radius:8px', 'background:var(--bhs-navy-card,#112240)',
    'border:1px solid ' + (ok ? 'var(--bhs-cyan-accent,#00F0FF)' : 'var(--color-danger,#EF4444)'),
    'border-left-width:4px', 'box-shadow:0 8px 30px rgba(0,0,0,.45)',
    'font-size:0.9rem', 'line-height:1.5'
  ].join(';');
  box.innerHTML =
    '<div style="color:' + (ok ? 'var(--bhs-cyan-accent,#00F0FF)' : 'var(--color-danger,#EF4444)') +
      ';font-weight:700;margin-bottom:4px;">' + copy.title + '</div>' +
    '<div style="color:var(--text-muted,#94A3B8);">' + copy.body + '</div>' +
    '<button type="button" style="position:absolute;top:8px;right:10px;background:none;border:0;' +
      'color:var(--text-muted,#94A3B8);font-size:18px;line-height:1;cursor:pointer;" ' +
      'aria-label="Dismiss">&times;</button>';

  box.querySelector('button').addEventListener('click', () => box.remove());
  document.body.appendChild(box);

  // Long enough to read twice; a coach-approval message the player misses is
  // worse than one that lingers.
  setTimeout(() => box.remove(), 15000);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initApp();
} else {
  document.addEventListener('DOMContentLoaded', initApp);
}

/* ---------------------------------------------------------------------------
   The phone menu.

   Under 640px the nav is a drawer rather than a bar. It used to be a strip
   that scrolled sideways with the scrollbar hidden, which is the worst of both
   worlds: the items are there, and nothing on screen says so.

   Bound through the prototype rather than a listener on the element, because
   the navbar is static markup in index.html and the app is what the inline
   handlers reach.
   --------------------------------------------------------------------------- */

Object.assign(BHSSoccerApp.prototype, {

  toggleNavMenu() {
    const list = document.getElementById('navLinks');
    if (!list) return;
    this.setNavMenuOpen(!list.classList.contains('open'));
  },

  /**
   * aria-expanded is kept in step with the class, not as decoration: the
   * button says nothing about its state otherwise, and a screen reader would
   * announce a closed menu as open.
   */
  setNavMenuOpen(open) {
    const list = document.getElementById('navLinks');
    const btn = document.getElementById('navToggle');
    if (list) list.classList.toggle('open', !!open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  },

  closeNavMenu() { this.setNavMenuOpen(false); }

});

/**
 * Close the drawer on the way out.
 *
 * Escape because that is what a dismissible layer answers to, and a tap
 * outside because a menu that can only be closed by the button it was opened
 * with traps a coach who opened it by accident. Bound once, on the document,
 * so no redraw can lose it.
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && window.app && app.closeNavMenu) app.closeNavMenu();
});

document.addEventListener('click', (e) => {
  const list = document.getElementById('navLinks');
  if (!list || !list.classList.contains('open')) return;
  // Ignore the button itself, or its own click would close what it just opened.
  if (e.target.closest('#navToggle') || e.target.closest('#navLinks')) return;
  if (window.app && app.closeNavMenu) app.closeNavMenu();
});
