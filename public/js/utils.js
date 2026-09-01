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

  /**
   * The next match by DATE, not by row order.
   *
   * This used to be `schedule.find(m => m.status !== 'COMPLETED')`, which
   * returns whichever row happens to sit first in the array. fetchSchedule
   * orders by created_at, so that was really "the fixture typed in first" --
   * and match_date is a TEXT column, so even ordering by it would put SEP 11
   * before SEP 4. A match that had already been played but never marked
   * COMPLETED stayed pinned as "next" forever, with the countdown reading
   * 00/00/00 because its target was in the past.
   */
  /**
   * When a fixture happens, as a Date.
   *
   * Prefers match_on/kickoff_time, which a database trigger derives from the
   * text columns (migration 0008) and which are therefore already normalised.
   * Falls back to parsing the free text, so the app still works against a
   * database where 0008 has not been applied.
   */
  matchDateTime(m) {
    if (!m) return null;
    if (m.matchOn) {
      const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(m.matchOn));
      if (d) {
        // Split rather than new Date(iso): a bare ISO date parses as UTC and
        // lands on the previous evening west of Greenwich, which would show
        // the wrong day for every fixture.
        const t = /^(\d{2}):(\d{2})/.exec(String(m.kickoffTime || ''));
        return new Date(
          Number(d[1]), Number(d[2]) - 1, Number(d[3]),
          t ? Number(t[1]) : 18, t ? Number(t[2]) : 0
        );
      }
    }
    return this.parseMatchDateTime(m.date, m.time);
  },

  getNextMatch() {
    const candidates = (this.data.schedule || []).filter(m => m && m.status !== 'COMPLETED');
    if (candidates.length === 0) return null;

    // A match stays "next" for a few hours after kickoff, so the site does not
    // flip to the following fixture while the game is still being played.
    const GRACE_MS = 3 * 60 * 60 * 1000;
    const now = Date.now();

    const dated = [];
    const undated = [];
    candidates.forEach(m => {
      const t = this.matchDateTime(m);
      if (t) dated.push({ m, t: t.getTime() });
      else undated.push(m);
    });

    const upcoming = dated.filter(x => x.t + GRACE_MS > now).sort((a, b) => a.t - b.t);
    if (upcoming.length) return upcoming[0].m;

    // Nothing we could read is still ahead. A row whose date would not parse
    // might be, so it beats announcing the season is over on a parse failure.
    return undated.length ? undated[0] : null;
  },

  /**
   * Why there is no next match, when there isn't one.
   *
   * The home page used to have two states -- a fixture, or "SEASON COMPLETE"
   * -- so every other reason read as the season being over. At the start of a
   * season, with one past friendly on the books and the rest of the fixtures
   * not yet entered, that is precisely backwards.
   *
   * @returns 'upcoming' | 'empty' | 'complete' | 'stale'
   */
  scheduleState() {
    const schedule = (this.data.schedule || []).filter(m => m);
    if (this.getNextMatch()) return 'upcoming';
    if (schedule.length === 0) return 'empty';
    // Every fixture on record has been played AND written up.
    if (schedule.every(m => m.status === 'COMPLETED')) return 'complete';
    // Fixtures exist and are in the past, but were never marked COMPLETED.
    // The season is not over; the schedule has just run out.
    return 'stale';
  },

  /** The most recent match already played, for the 'stale' message. */
  lastPlayedMatch() {
    const dated = (this.data.schedule || [])
      .filter(m => m)
      .map(m => ({ m, t: this.matchDateTime(m) }))
      .filter(x => x.t)
      .sort((a, b) => b.t - a.t);
    return dated.length ? dated[0].m : null;
  },

  getNextMatchCountdown() {
    const nextMatch = this.getNextMatch();
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
