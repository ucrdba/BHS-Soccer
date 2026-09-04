/**
 * BHS Soccer - Schedule View & Match CRUD
 * Adds renderScheduleView(), addMatch(), deleteMatch(), etc. to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 */

Object.assign(BHSSoccerApp.prototype, {

  /**
   * A fixture date, as text, whatever is actually stored.
   *
   * A date-typed cell in a spreadsheet is a NUMBER underneath — days since
   * 1899-12-30 — so a row that reached the database before the importer
   * understood that holds "46365" rather than a date. Rendering it raw shows a
   * five-digit number where a date belongs, and the fixture looks corrupted
   * even though the day is recoverable.
   *
   * Everything is put through the same reader the importer uses, so display
   * and import can never disagree about what a stored value means. Anything
   * unreadable is shown as written rather than blanked: a coach can correct
   * what they can see.
   */
  displayMatchDate(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    const normal = window.supabaseService?.parseScheduleDate
      ? window.supabaseService.parseScheduleDate(raw)
      : null;
    if (!normal) return raw;

    // "DEC 8 2026" with the day of the week, which is what the schedule is
    // read for — a coach checks which day a fixture falls on far more often
    // than the date itself.
    const dow = window.supabaseService.scheduleDayOfWeek(normal);
    return dow ? `${normal} (${dow})` : normal;
  },

  renderScheduleView() {
    const label = this.activeTeamLabel();
    // Every control that writes to the schedule is gated on this. isCoach()
    // is true for coach AND admin, and only while the profile is active, so
    // it is the whole of "admins and coaches".
    //
    // These are affordances, not enforcement: the schedule_write RLS policy
    // in supabase_migration_auth.sql already refuses a write from anyone
    // else, so a guest who calls app.deleteMatch() from a console gets a
    // refusal from Postgres. What this fixes is a guest being SHOWN buttons
    // that cannot work.
    const canManage = window.auth.isCoach();

    // The header row and the cards are separate flex containers, so a title
    // only sits over its column if BOTH use the same track widths. Fixed
    // widths rather than flex:1 — the cards carry a badge, a status and two
    // buttons that the header does not, so anything that grows to fill the
    // remainder grows by a different amount in each and the titles drift off
    // their columns.
    const col = { date: '150px', opponent: '170px', location: '190px' };
    // Shrink allowed as a last resort, so a phone narrower than one track
    // does not scroll sideways; the cards wrap before it ever comes to that.
    const track = w => `flex:0 1 ${w}; min-width:0;`;
    return `
      <div class="container">
        <div class="section-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 class="section-title">SCHEDULE &amp; GAME RESULTS</h2>
            <p class="text-muted">${label.org}${label.team ? " &mdash; " + label.team : ""} Season Fixtures &amp; Match Results</p>
          </div>
          ${canManage ? `<div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-gold" onclick="app.openAddMatchModal()" style="font-weight:700;">➕ Add New Match</button>
            <button class="btn btn-secondary" onclick="app.openLineupModal(null)"
                    title="A default shape for this squad, not tied to a fixture">⚽ Default lineup</button>
          </div>` : ''}
        </div>

        <div class="schedule-head">
          <div class="sched-label" style="${track(col.date)}">Date</div>
          <div class="sched-label" style="${track(col.opponent)}">Opponent</div>
          <div class="sched-label" style="${track(col.location)}">Location</div>
        </div>

        <div class="schedule-list" style="display:flex; flex-direction:column; gap:12px;">
          ${(this.data.schedule || []).filter(m => !m.is_deleted && !m.isDeleted).map(m => `
            <div class="schedule-card" style="display:flex; justify-content:flex-start; align-items:center; flex-wrap:wrap; gap:12px; background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px 18px; border-radius: 10px;">
              <div class="game-date" style="${track(col.date)}">
                <strong style="color:var(--bhs-gold-accent); font-size:1rem; display:block;">${this.displayMatchDate(m.date)}</strong>
                <div class="time text-muted" style="font-size:0.82rem;">⏱️ ${m.time}</div>
              </div>
              <div class="game-matchup" style="${track(col.opponent)}">
                <div>
                  <div class="opponent-name" style="font-weight:700; color:#FFF; font-size:1.05rem;">${m.opponent}</div>
                </div>
              </div>
              <div class="game-venue" style="${track(col.location)}">
                ${m.location
                  ? `<div class="location-tag text-muted" style="font-size:0.9rem;">📍 ${m.location}</div>`
                  : `<div class="text-muted" style="font-size:0.9rem;" title="No location recorded for this fixture">&mdash;</div>`}
              </div>
              <div>
                ${m.isHome === null || m.isHome === undefined
                  ? `<span class="badge badge-coach" style="font-weight:700;" title="No Home or Away recorded for this fixture">&mdash;</span>`
                  : `<span class="badge ${m.isHome ? 'badge-win' : 'badge-role'}" style="font-weight:700;">${m.isHome ? '🏠 HOME' : '✈️ AWAY'}</span>`}
              </div>
              <div>
                ${m.status === 'COMPLETED' ? `
                  <div class="result-badge result-win" style="background:rgba(40,167,69,0.2); color:var(--color-success); border:1px solid rgba(40,167,69,0.5); padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.85rem;">FINAL: ${m.score || m.result || 'W'}</div>
                ` : `
                  <div class="result-badge result-upcoming" style="background:rgba(0,71,171,0.2); color:var(--bhs-cyan-accent); border:1px solid var(--bhs-blue-electric); padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.85rem;">UPCOMING</div>
                `}
              </div>
              ${canManage ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-left:auto;">
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem;"
                        title="Set the XI for this fixture and print the card"
                        onclick="app.openLineupModal('${m.id}')">⚽ Lineup</button>
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem;"
                        title="Track plus/minus live during this match"
                        onclick="app.openPlusMinus('${m.id}')">± Plus/Minus</button>
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="app.openEditMatchModal('${m.id}')">✏️ Edit</button>
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem; background:rgba(239, 68, 68, 0.2); color:var(--color-danger); border-color:rgba(239, 68, 68, 0.4);" onclick="app.deleteMatch('${m.id}')">🗑️ Delete</button>
              </div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  formatIsoToDisplayDate(isoStr) {
    if (!isoStr) return '';
    if (!isoStr.includes('-') && isoStr.length < 15) return isoStr;
    const d = new Date(isoStr + 'T00:00:00');
    if (isNaN(d.getTime())) return isoStr;
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  },

  formatDisplayDateToIso(displayStr) {
    if (!displayStr) return '';
    if (displayStr.includes('-') && displayStr.length === 10) return displayStr;
    const d = new Date(displayStr);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  format24hTo12h(timeStr) {
    if (!timeStr) return '';
    if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) return timeStr;
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hrs = parseInt(parts[0], 10);
    const mins = parts[1];
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12;
    if (hrs === 0) hrs = 12;
    return `${hrs}:${mins} ${ampm}`;
  },

  format12hTo24h(timeStr) {
    if (!timeStr) return '';
    if (timeStr.includes(':') && !timeStr.toLowerCase().includes('am') && !timeStr.toLowerCase().includes('pm')) return timeStr;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return '';
    let hrs = parseInt(match[1], 10);
    const mins = match[2];
    const ampm = (match[3] || '').toUpperCase();
    if (ampm === 'PM' && hrs < 12) hrs += 12;
    if (ampm === 'AM' && hrs === 12) hrs = 0;
    return `${String(hrs).padStart(2, '0')}:${mins}`;
  },

  openAddMatchModal() {
    ['newMatchDate','newMatchTime','newMatchOpponent','newMatchLocation','newMatchScore'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const dateEl = document.getElementById('newMatchDate');
    if (dateEl) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dateEl.value = `${yyyy}-${mm}-${dd}`;
    }

    const timeEl = document.getElementById('newMatchTime');
    if (timeEl) timeEl.value = '18:30';

    const statusEl = document.getElementById('newMatchStatus');
    if (statusEl) statusEl.value = 'UPCOMING';
    const homeEl = document.getElementById('newMatchIsHome');
    if (homeEl) homeEl.value = 'true';

    const modal = document.getElementById('addMatchModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  async addMatch(matchData) {
    const displayDate = this.formatIsoToDisplayDate(matchData.date);
    const displayTime = this.format24hTo12h(matchData.time);

    const newMatch = {
      id: 'm_' + Date.now(),
      date: displayDate || (matchData.date || '').toUpperCase(),
      rawDate: matchData.date,
      time: displayTime || matchData.time,
      rawTime: matchData.time,
      opponent: matchData.opponent,
      location: matchData.location,
      status: matchData.status,
      isHome: matchData.isHome === 'true' || matchData.isHome === true,
      score: matchData.score || null,
      result: matchData.status === 'COMPLETED' ? (matchData.score || '') : null
    };

    this.data.schedule.push(newMatch);
    this.saveData();

    let saved = true;
    if (window.supabaseService && window.supabaseService.isConfigured()) {
      const cloudRes = await window.supabaseService.upsertMatch(this.activeTeamId, newMatch);
      if (cloudRes && cloudRes.id) newMatch.id = cloudRes.id;
      else saved = false;
    }

    this.renderCurrentView();
    this.closeModals();
    alert(saved
      ? `✅ SUCCESS!\n\nMatch vs "${newMatch.opponent}" added to Schedule & Database!`
      : `⚠️ Match vs "${newMatch.opponent}" was added to this screen but NOT saved to the database.\n\nIt will disappear on reload. Check the browser console.`);
  },

  openEditMatchModal(matchId) {
    const match = (this.data.schedule || []).find(m => String(m.id) === String(matchId));
    if (!match) return;

    const idEl = document.getElementById('editMatchId');
    const dateEl = document.getElementById('editMatchDate');
    const timeEl = document.getElementById('editMatchTime');
    const oppEl = document.getElementById('editMatchOpponent');
    const locEl = document.getElementById('editMatchLocation');
    const statusEl = document.getElementById('editMatchStatus');
    const homeEl = document.getElementById('editMatchIsHome');
    const scoreEl = document.getElementById('editMatchScore');

    if (idEl) idEl.value = match.id;
    if (dateEl) dateEl.value = match.rawDate || this.formatDisplayDateToIso(match.date) || '';
    if (timeEl) timeEl.value = match.rawTime || this.format12hTo24h(match.time) || '';
    if (oppEl) oppEl.value = match.opponent || '';
    if (locEl) locEl.value = match.location || '';
    if (statusEl) statusEl.value = match.status || 'UPCOMING';
    if (homeEl) homeEl.value = String(match.isHome);
    if (scoreEl) scoreEl.value = match.score || '';

    const modal = document.getElementById('editMatchModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  async saveEditMatch(matchData) {
    const idx = (this.data.schedule || []).findIndex(m => String(m.id) === String(matchData.id));
    if (idx !== -1) {
      const displayDate = this.formatIsoToDisplayDate(matchData.date);
      const displayTime = this.format24hTo12h(matchData.time);

      const updated = {
        ...this.data.schedule[idx],
        date: displayDate || (matchData.date || '').toUpperCase(),
        rawDate: matchData.date,
        time: displayTime || matchData.time,
        rawTime: matchData.time,
        opponent: matchData.opponent,
        location: matchData.location,
        status: matchData.status,
        isHome: matchData.isHome === 'true' || matchData.isHome === true,
        score: matchData.score || null,
        result: matchData.status === 'COMPLETED' ? (matchData.score || '') : null
      };
      this.data.schedule[idx] = updated;
      this.saveData();

      let saved = true;
      if (window.supabaseService && window.supabaseService.isConfigured()) {
        const cloudRes = await window.supabaseService.upsertMatch(this.activeTeamId, updated);
        if (!(cloudRes && cloudRes.id)) saved = false;
      }

      this.renderCurrentView();
      this.closeModals();
      alert(saved
        ? `✅ SUCCESS!\n\nMatch changes for vs "${updated.opponent}" saved to Schedule & Database!`
        : `⚠️ Match changes for vs "${updated.opponent}" were applied to this screen but NOT saved to the database.\n\nThey will be lost on reload. Check the browser console.`);
    }
  },

  submitEditMatch() {
    const matchData = {
      id: document.getElementById('editMatchId')?.value,
      date: document.getElementById('editMatchDate')?.value,
      time: document.getElementById('editMatchTime')?.value,
      opponent: document.getElementById('editMatchOpponent')?.value,
      location: document.getElementById('editMatchLocation')?.value,
      status: document.getElementById('editMatchStatus')?.value,
      isHome: document.getElementById('editMatchIsHome')?.value,
      score: document.getElementById('editMatchScore')?.value
    };
    this.saveEditMatch(matchData);
  },

  async deleteMatch(matchId) {
    const match = (this.data.schedule || []).find(m => String(m.id) === String(matchId));
    if (!match) return;

    this.showConfirmModal({
      title: '🗑️ DELETE MATCH',
      message: `Are you sure you want to delete the match vs "${match.opponent}" on ${this.displayMatchDate(match.date)}?`,
      confirmText: '🗑️ Delete Match',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        this.data.schedule = this.data.schedule.filter(m => String(m.id) !== String(matchId));
        this.saveData();

        if (window.supabaseService && window.supabaseService.isConfigured()) {
          await window.supabaseService.deleteMatch(matchId);
        }

        this.renderCurrentView();
        this.showAlertModal('Match Deleted', `🗑️ Match vs "${match.opponent}" removed from Schedule & Database.`);
      }
    });
  }


});
