/**
 * BHS Soccer - Schedule View & Match CRUD
 * Adds renderScheduleView(), addMatch(), deleteMatch(), etc. to BHSSoccerApp.prototype.
 *
 * Converted from js/views/schedule.view.js.
 */

import type { Match, MatchStatus } from '../types';
import { BHSSoccerApp } from '../app.core';

export interface MatchFormData {
  id?: string;
  date: string;
  time: string;
  opponent: string;
  location: string;
  status: MatchStatus;
  isHome: string | boolean;
  score?: string;
}

declare module '../app.core' {
  interface BHSSoccerApp {
    renderScheduleView(): string;
    formatIsoToDisplayDate(isoStr: string | undefined | null): string;
    formatDisplayDateToIso(displayStr: string | undefined | null): string;
    format24hTo12h(timeStr: string | undefined | null): string;
    format12hTo24h(timeStr: string | undefined | null): string;
    openAddMatchModal(): void;
    addMatch(matchData: MatchFormData): Promise<void>;
    openEditMatchModal(matchId: string): void;
    saveEditMatch(matchData: MatchFormData): Promise<void>;
    submitEditMatch(): void;
    deleteMatch(matchId: string): Promise<void>;
  }
}

Object.assign(BHSSoccerApp.prototype, {

  renderScheduleView(this: BHSSoccerApp): string {
    return `
      <div class="container">
        <div class="section-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 class="section-title">SCHEDULE &amp; GAME RESULTS</h2>
            <p class="text-muted">Beaumont High School Cougars Season Fixtures &amp; Match Results</p>
          </div>
          <button class="btn btn-gold" onclick="app.openAddMatchModal()" style="font-weight:700;">➕ Add New Match</button>
        </div>

        <div class="schedule-list" style="display:flex; flex-direction:column; gap:12px;">
          ${(this.data.schedule || []).filter(m => !m.isDeleted).map(m => `
            <div class="schedule-card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background: rgba(0,0,0,0.25); border: 1px solid var(--bhs-navy-border); padding: 14px 18px; border-radius: 10px;">
              <div class="game-date" style="min-width:120px;">
                <strong style="color:var(--bhs-gold-accent); font-size:1rem; display:block;">${m.date}</strong>
                <div class="time text-muted" style="font-size:0.82rem;">⏱️ ${m.time}</div>
              </div>
              <div class="game-matchup" style="flex:1; min-width:180px;">
                <div>
                  <div class="opponent-name" style="font-weight:700; color:#FFF; font-size:1.05rem;">${m.opponent}</div>
                  <div class="location-tag text-muted" style="font-size:0.82rem;">📍 ${m.location}</div>
                </div>
              </div>
              <div>
                <span class="badge ${m.isHome ? 'badge-win' : 'badge-role'}" style="font-weight:700;">${m.isHome ? '🏠 HOME' : '✈️ AWAY'}</span>
              </div>
              <div>
                ${m.status === 'COMPLETED' ? `
                  <div class="result-badge result-win" style="background:rgba(40,167,69,0.2); color:var(--color-success); border:1px solid rgba(40,167,69,0.5); padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.85rem;">FINAL: ${m.score || m.result || 'W'}</div>
                ` : `
                  <div class="result-badge result-upcoming" style="background:rgba(0,71,171,0.2); color:var(--bhs-cyan-accent); border:1px solid var(--bhs-blue-electric); padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.85rem;">UPCOMING</div>
                `}
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="app.openEditMatchModal('${m.id}')">✏️ Edit</button>
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem; background:rgba(239, 68, 68, 0.2); color:var(--color-danger); border-color:rgba(239, 68, 68, 0.4);" onclick="app.deleteMatch('${m.id}')">🗑️ Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  formatIsoToDisplayDate(this: BHSSoccerApp, isoStr: string | undefined | null): string {
    if (!isoStr) return '';
    if (!isoStr.includes('-') && isoStr.length < 15) return isoStr;
    const d = new Date(isoStr + 'T00:00:00');
    if (isNaN(d.getTime())) return isoStr;
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  },

  formatDisplayDateToIso(this: BHSSoccerApp, displayStr: string | undefined | null): string {
    if (!displayStr) return '';
    if (displayStr.includes('-') && displayStr.length === 10) return displayStr;
    const d = new Date(displayStr);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  format24hTo12h(this: BHSSoccerApp, timeStr: string | undefined | null): string {
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

  format12hTo24h(this: BHSSoccerApp, timeStr: string | undefined | null): string {
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

  openAddMatchModal(this: BHSSoccerApp): void {
    ['newMatchDate','newMatchTime','newMatchOpponent','newMatchLocation','newMatchScore'].forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = '';
    });

    const dateEl = document.getElementById('newMatchDate') as HTMLInputElement | null;
    if (dateEl) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dateEl.value = `${yyyy}-${mm}-${dd}`;
    }

    const timeEl = document.getElementById('newMatchTime') as HTMLInputElement | null;
    if (timeEl) timeEl.value = '18:30';

    const statusEl = document.getElementById('newMatchStatus') as HTMLSelectElement | null;
    if (statusEl) statusEl.value = 'UPCOMING';
    const homeEl = document.getElementById('newMatchIsHome') as HTMLSelectElement | null;
    if (homeEl) homeEl.value = 'true';

    const modal = document.getElementById('addMatchModal');
    if (modal) { (modal as HTMLElement).style.display = ''; modal.classList.add('active'); }
  },

  async addMatch(this: BHSSoccerApp, matchData: MatchFormData): Promise<void> {
    const displayDate = this.formatIsoToDisplayDate(matchData.date);
    const displayTime = this.format24hTo12h(matchData.time);

    const newMatch: Match = {
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

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      // PHASE 2: this passes a school CODE where a team id belongs. The
      // service now refuses a non-uuid outright, so activating this file
      // unchanged would silently save no fixtures at all. Pass
      // this.activeTeamId when it is wired into the module graph.
      const cloudRes = await window.supabaseService.upsertMatch(this.data.school?.code || 'bhs', newMatch);
      if (cloudRes && cloudRes.id) newMatch.id = cloudRes.id;
    }

    this.renderCurrentView();
    this.closeModals();
    alert(`✅ SUCCESS!\n\nMatch vs "${newMatch.opponent}" added to Schedule & Database!`);
  },

  openEditMatchModal(this: BHSSoccerApp, matchId: string): void {
    const match = (this.data.schedule || []).find(m => String(m.id) === String(matchId));
    if (!match) return;

    const idEl = document.getElementById('editMatchId') as HTMLInputElement | null;
    const dateEl = document.getElementById('editMatchDate') as HTMLInputElement | null;
    const timeEl = document.getElementById('editMatchTime') as HTMLInputElement | null;
    const oppEl = document.getElementById('editMatchOpponent') as HTMLInputElement | null;
    const locEl = document.getElementById('editMatchLocation') as HTMLInputElement | null;
    const statusEl = document.getElementById('editMatchStatus') as HTMLSelectElement | null;
    const homeEl = document.getElementById('editMatchIsHome') as HTMLSelectElement | null;
    const scoreEl = document.getElementById('editMatchScore') as HTMLInputElement | null;

    if (idEl) idEl.value = match.id;
    if (dateEl) dateEl.value = match.rawDate || this.formatDisplayDateToIso(match.date) || '';
    if (timeEl) timeEl.value = match.rawTime || this.format12hTo24h(match.time) || '';
    if (oppEl) oppEl.value = match.opponent || '';
    if (locEl) locEl.value = match.location || '';
    if (statusEl) statusEl.value = match.status || 'UPCOMING';
    if (homeEl) homeEl.value = String(match.isHome);
    if (scoreEl) scoreEl.value = match.score || '';

    const modal = document.getElementById('editMatchModal');
    if (modal) { (modal as HTMLElement).style.display = ''; modal.classList.add('active'); }
  },

  async saveEditMatch(this: BHSSoccerApp, matchData: MatchFormData): Promise<void> {
    const idx = (this.data.schedule || []).findIndex(m => String(m.id) === String(matchData.id));
    if (idx !== -1) {
      const displayDate = this.formatIsoToDisplayDate(matchData.date);
      const displayTime = this.format24hTo12h(matchData.time);

      const updated: Match = {
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

      if (window.supabaseService && window.supabaseService.isConfigured()) {
        // PHASE 2: a school code where a team id belongs -- see the note on
        // the add path above.
        await window.supabaseService.upsertMatch(this.data.school?.code || 'bhs', updated);
      }

      this.renderCurrentView();
      this.closeModals();
      alert(`✅ SUCCESS!\n\nMatch changes for vs "${updated.opponent}" saved to Schedule & Database!`);
    }
  },

  submitEditMatch(this: BHSSoccerApp): void {
    const matchData: MatchFormData = {
      id: (document.getElementById('editMatchId') as HTMLInputElement | null)?.value,
      date: (document.getElementById('editMatchDate') as HTMLInputElement | null)?.value || '',
      time: (document.getElementById('editMatchTime') as HTMLInputElement | null)?.value || '',
      opponent: (document.getElementById('editMatchOpponent') as HTMLInputElement | null)?.value || '',
      location: (document.getElementById('editMatchLocation') as HTMLInputElement | null)?.value || '',
      status: ((document.getElementById('editMatchStatus') as HTMLSelectElement | null)?.value || 'UPCOMING') as MatchStatus,
      isHome: (document.getElementById('editMatchIsHome') as HTMLSelectElement | null)?.value || 'false',
      score: (document.getElementById('editMatchScore') as HTMLInputElement | null)?.value
    };
    this.saveEditMatch(matchData);
  },

  async deleteMatch(this: BHSSoccerApp, matchId: string): Promise<void> {
    const match = (this.data.schedule || []).find(m => String(m.id) === String(matchId));
    if (!match) return;

    this.showConfirmModal({
      title: '🗑️ DELETE MATCH',
      message: `Are you sure you want to delete the match vs "${match.opponent}" on ${match.date}?`,
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
