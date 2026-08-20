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
    // Role switcher choices inside modal
    document.querySelectorAll('.role-switch-card').forEach(card => {
      card.addEventListener('click', () => {
        const userId = card.getAttribute('data-userid');
        window.auth.switchRole(userId);
        this.closeModals();
      });
    });
  },

  parseMatchDateTime(dateStr, timeStr) {
    if (!dateStr) return null;
    const combined = `${dateStr} ${timeStr || ''}`.trim();
    const parsed = new Date(combined);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    try {
      const months = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
      const parts = dateStr.replace(/,/g, '').split(/\s+/);
      if (parts.length >= 3) {
        const monthIndex = months[parts[0].substring(0,3).toUpperCase()];
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        let hours = 18, minutes = 0;
        if (timeStr) {
          const timeMatch = timeStr.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
          if (timeMatch) {
            hours = parseInt(timeMatch[1]);
            minutes = parseInt(timeMatch[2] || 0);
            const ampm = (timeMatch[3] || '').toUpperCase();
            if (ampm === 'PM' && hours < 12) hours += 12;
            if (ampm === 'AM' && hours === 12) hours = 0;
          }
        }
        if (monthIndex !== undefined && !isNaN(day) && !isNaN(year)) {
          return new Date(year, monthIndex, day, hours, minutes);
        }
      }
    } catch(e) {}
    return null;
  },

  getNextMatchCountdown() {
    const nextMatch = this.data.schedule.find(m => m.status !== 'COMPLETED');
    if (!nextMatch) return null;

    const targetDate = this.parseMatchDateTime(nextMatch.date, nextMatch.time);
    if (!targetDate) return null;

    const now = new Date();
    const diffMs = targetDate - now;

    if (diffMs <= 0) {
      return { days: '00', hours: '00', mins: '00' };
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);

    return {
      days: String(days).padStart(2, '0'),
      hours: String(hours).padStart(2, '0'),
      mins: String(mins).padStart(2, '0')
    };
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
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initApp();
} else {
  document.addEventListener('DOMContentLoaded', initApp);
}
