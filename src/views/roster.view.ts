/**
 * BHS Soccer - Roster View & Player CRUD
 * Adds renderRosterView(), filterRoster(), addPlayer(), etc. to BHSSoccerApp.prototype.
 *
 * Converted from js/views/roster.view.js.
 */

import type { Player } from '../types';
import { auth } from '../auth';
import { BHSSoccerApp } from '../app.core';

export type RosterFilter = 'ALL' | 'FWD' | 'MID' | 'DEF' | 'GK';

export interface PlayerFormData {
  number: string | number;
  name: string;
  position: string;
  classYear: string;
  height?: string;
  photo?: string;
  stat1?: string | number;
  stat2?: string | number;
  tech?: string | number;
  tact?: string | number;
  phys?: string | number;
  ment?: string | number;
}

declare module '../app.core' {
  interface BHSSoccerApp {
    renderRosterView(): string;
    filterRoster(filter: RosterFilter): void;
    openAddPlayerModal(): void;
    addPlayer(playerData: PlayerFormData): Promise<void>;
    openEditPlayerModal(playerId: string): void;
    saveEditPlayer(playerId: string, playerData: PlayerFormData): Promise<void>;
    deletePlayer(playerId: string): Promise<void>;
    openPlayerModal(playerId: string): void;
  }
}

Object.assign(BHSSoccerApp.prototype, {

  renderRosterView(this: BHSSoccerApp): string {
    const canAccessRatings = auth.canAccessRatings();
    const isCoach = auth.isCoach();

    return `
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">BEAUMONT COUGARS ROSTER</h2>
            <p class="text-muted">2026 Varsity Boys Soccer Squad</p>
          </div>
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            ${isCoach ? `<button class="btn btn-gold" onclick="app.openAddPlayerModal()">+ Add New Player</button>` : ''}
            <div class="filters-bar">
              <span class="filter-chip active" data-filter="ALL" onclick="app.filterRoster('ALL')">All Players</span>
              <span class="filter-chip" data-filter="FWD" onclick="app.filterRoster('FWD')">Forwards</span>
              <span class="filter-chip" data-filter="MID" onclick="app.filterRoster('MID')">Midfielders</span>
              <span class="filter-chip" data-filter="DEF" onclick="app.filterRoster('DEF')">Defenders</span>
              <span class="filter-chip" data-filter="GK" onclick="app.filterRoster('GK')">Goalkeepers</span>
            </div>
          </div>
        </div>

        <div id="rosterGrid" class="roster-grid">
          ${(this.data.players || []).filter(p => !p.isDeleted).map(p => `
            <div class="player-card" data-player-id="${p.id}" data-position="${p.position}">
              <div class="player-card-header" onclick="app.openPlayerModal('${p.id}')">
                <span class="jersey-number">#${p.number}</span>
                <img src="${p.photo}" class="player-photo" alt="${p.name}" />
              </div>
              <div class="player-card-body">
                <h3 class="player-name" style="cursor:pointer;" onclick="app.openPlayerModal('${p.id}')">${p.name}</h3>
                <div class="player-meta">
                  <span class="badge-pos">${p.position}</span>
                  <span class="badge-class">${p.classYear}</span>
                </div>

                <div class="player-stats-row">
                  ${p.seasonStats.goals !== undefined ? `
                    <div class="stat-item"><div class="val">${p.seasonStats.goals}</div><div class="lbl">Goals</div></div>
                    <div class="stat-item"><div class="val">${p.seasonStats.assists}</div><div class="lbl">Assists</div></div>
                  ` : `
                    <div class="stat-item"><div class="val">${p.seasonStats.saves || 0}</div><div class="lbl">Saves</div></div>
                    <div class="stat-item"><div class="val">${p.seasonStats.cleanSheets || 0}</div><div class="lbl">Clean St</div></div>
                  `}
                  <div class="stat-item">
                    <div class="val text-gold">${canAccessRatings ? '#' + p.matrixStats.rank : '🔒'}</div>
                    <div class="lbl">Matrix</div>
                  </div>
                </div>

                ${isCoach ? `
                  <div class="player-card-actions">
                    <button class="btn-card-edit" onclick="event.stopPropagation(); app.openEditPlayerModal('${p.id}')">✏️ Edit</button>
                    <button class="btn-card-delete" onclick="event.stopPropagation(); app.deletePlayer('${p.id}')">🗑️ Delete</button>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  filterRoster(this: BHSSoccerApp, filter: RosterFilter): void {
    // Update active chip styling
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-filter') === filter);
    });

    // Position keyword map
    const filterMap: Record<RosterFilter, string[] | null> = {
      ALL: null,
      FWD: ['forward', 'winger', 'cam', 'striker'],
      MID: ['midfield', 'mid'],
      DEF: ['back', 'defender', 'def'],
      GK:  ['goalkeeper', 'keeper', 'gk']
    };

    const keywords = filterMap[filter];

    document.querySelectorAll<HTMLElement>('#rosterGrid .player-card').forEach(card => {
      if (!keywords) {
        card.style.display = '';
      } else {
        const pos = (card.getAttribute('data-position') || '').toLowerCase();
        const match = keywords.some(kw => pos.includes(kw));
        card.style.display = match ? '' : 'none';
      }
    });
  },

  openAddPlayerModal(this: BHSSoccerApp): void {
    const modal = document.getElementById('addPlayerModal');
    if (modal) { (modal as HTMLElement).style.display = ''; modal.classList.add('active'); }
  },

  async addPlayer(this: BHSSoccerApp, playerData: PlayerFormData): Promise<void> {
    const newPlayer: Player = {
      id: 'p_' + Date.now(),
      number: parseInt(String(playerData.number)),
      name: playerData.name,
      position: playerData.position,
      classYear: playerData.classYear,
      height: playerData.height || "5'10\"",
      photo: playerData.photo || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
      seasonStats: playerData.position.includes('Goalkeeper')
        ? { saves: parseInt(String(playerData.stat1 || 0)), cleanSheets: parseInt(String(playerData.stat2 || 0)), games: 1 }
        : { goals: parseInt(String(playerData.stat1 || 0)), assists: parseInt(String(playerData.stat2 || 0)), games: 1 },
      ratings: {
        technical: parseInt(String(playerData.tech || 80)),
        tactical: parseInt(String(playerData.tact || 80)),
        physical: parseInt(String(playerData.phys || 80)),
        mental: parseInt(String(playerData.ment || 80))
      },
      matrixStats: { wins: 0, losses: 0, points: 0, rank: this.data.players.length + 1, drillScore: 75.0 }
    };

    this.data.players.push(newPlayer);
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.upsertPlayer('bhs', newPlayer);
    }

    this.renderCurrentView();
    this.closeModals();
  },

  openEditPlayerModal(this: BHSSoccerApp, playerId: string): void {
    console.log('[BHS] openEditPlayerModal called with id:', playerId);
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) {
      console.warn('[BHS] Player not found for id:', playerId);
      return;
    }
    console.log('[BHS] Found player:', player.name);

    const fields: Record<string, string | number> = {
      editPlayerId: player.id,
      editPlayerNumber: player.number,
      editPlayerName: player.name,
      editPlayerPosition: player.position,
      editPlayerClass: player.classYear,
      editPlayerHeight: player.height || '',
      editPlayerPhoto: player.photo || '',
      editPlayerStat1: player.seasonStats.goals !== undefined ? player.seasonStats.goals : (player.seasonStats.saves || 0),
      editPlayerStat2: player.seasonStats.assists !== undefined ? player.seasonStats.assists : (player.seasonStats.cleanSheets || 0),
      editPlayerTech: player.ratings ? player.ratings.technical : 80,
      editPlayerTact: player.ratings ? player.ratings.tactical : 80,
      editPlayerPhys: player.ratings ? player.ratings.physical : 80,
      editPlayerMent: player.ratings ? player.ratings.mental : 80
    };

    for (const [id, val] of Object.entries(fields)) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) {
        el.value = String(val);
      } else {
        console.warn('[BHS] DOM element not found:', id);
      }
    }

    const modal = document.getElementById('editPlayerModal');
    if (modal) {
      (modal as HTMLElement).style.display = '';
      modal.classList.add('active');
      console.log('[BHS] Edit modal opened');
    } else {
      console.error('[BHS] editPlayerModal element NOT found in DOM!');
    }
  },

  async saveEditPlayer(this: BHSSoccerApp, playerId: string, playerData: PlayerFormData): Promise<void> {
    const idx = this.data.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const existing = this.data.players[idx];
      existing.number = parseInt(String(playerData.number));
      existing.name = playerData.name;
      existing.position = playerData.position;
      existing.classYear = playerData.classYear;
      existing.height = playerData.height || '';
      existing.photo = playerData.photo || '';

      if (playerData.position.includes('Goalkeeper')) {
        existing.seasonStats = { saves: parseInt(String(playerData.stat1)), cleanSheets: parseInt(String(playerData.stat2)), games: existing.seasonStats.games || 1 };
      } else {
        existing.seasonStats = { goals: parseInt(String(playerData.stat1)), assists: parseInt(String(playerData.stat2)), games: existing.seasonStats.games || 1 };
      }

      existing.ratings = {
        technical: parseInt(String(playerData.tech)),
        tactical: parseInt(String(playerData.tact)),
        physical: parseInt(String(playerData.phys)),
        mental: parseInt(String(playerData.ment))
      };

      this.data.players[idx] = existing;
      this.saveData();

      if (window.supabaseService && window.supabaseService.isConfigured()) {
        await window.supabaseService.upsertPlayer('bhs', existing);
      }

      this.renderCurrentView();
      this.closeModals();
    }
  },

  async deletePlayer(this: BHSSoccerApp, playerId: string): Promise<void> {
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) return;

    // Soft delete player (sets isDeleted = true, preserves record)
    player.isDeleted = true;
    this.data.players = this.data.players.filter(p => p.id !== playerId);
    this.saveData();

    if (window.supabaseService && window.supabaseService.isConfigured()) {
      await window.supabaseService.deletePlayer(playerId);
    }

    this.renderCurrentView();
    this.closeModals();
  }

});
