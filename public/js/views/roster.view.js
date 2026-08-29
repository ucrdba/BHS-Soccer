/**
 * BHS Soccer - Roster View & Player CRUD
 * Adds renderRosterView(), filterRoster(), addPlayer(), etc. to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 */

Object.assign(BHSSoccerApp.prototype, {

  renderRosterView() {
    const canAccessRatings = window.auth.canAccessRatings();
    const isCoach = window.auth.isCoach();
    
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
              <span class="filter-chip ${this.rosterSort !== 'name' ? 'active' : ''}" data-sort="number" onclick="app.sortRoster('number')" title="Sort by jersey number">#&nbsp;Number</span>
              <span class="filter-chip ${this.rosterSort === 'name' ? 'active' : ''}" data-sort="name" onclick="app.sortRoster('name')" title="Sort alphabetically">A&ndash;Z&nbsp;Name</span>
            </div>
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
          ${this.sortedPlayers().map(p => `
            <div class="player-card" data-player-id="${p.id}" data-position="${p.position}" data-number="${p.number || 0}" data-name="${(p.name || '').replace(/"/g, '&quot;')}">
              <div class="player-card-header" onclick="app.openPlayerModal('${p.id}')">
                <span class="jersey-number">#${p.number}</span>
                <img src="${this.photoOrPlaceholder(p.photo)}" class="player-photo" alt="${p.name}" />
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

  /**
   * Compare two players by the current sort. Unnumbered players (0, blank or
   * missing) always sort last regardless of direction — a squad list led by a
   * run of #0 cards reads as broken data rather than as a roster.
   */
  comparePlayers(a, b, by) {
    if (by === 'name') {
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    }
    const na = parseInt(a.number, 10) || 0;
    const nb = parseInt(b.number, 10) || 0;
    if (!na !== !nb) return na ? -1 : 1;   // exactly one is unnumbered — it goes last
    if (na !== nb) return na - nb;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  },

  /** Live players in the currently selected order. Defaults to jersey number. */
  sortedPlayers() {
    const by = this.rosterSort === 'name' ? 'name' : 'number';
    return (this.data.players || [])
      .filter(p => !p.is_deleted && !p.isDeleted)
      .slice()
      .sort((a, b) => this.comparePlayers(a, b, by));
  },

  /**
   * Reorders the cards already in the DOM rather than re-rendering, so the
   * active position filter — which lives in each card's inline display style —
   * survives a sort change.
   */
  sortRoster(by) {
    this.rosterSort = (by === 'name') ? 'name' : 'number';

    document.querySelectorAll('.filter-chip[data-sort]').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-sort') === this.rosterSort);
    });

    const grid = document.getElementById('rosterGrid');
    if (!grid) return;

    Array.from(grid.querySelectorAll('.player-card'))
      .map(card => ({
        card,
        name: card.getAttribute('data-name') || '',
        number: parseInt(card.getAttribute('data-number'), 10) || 0
      }))
      .sort((a, b) => this.comparePlayers(a, b, this.rosterSort))
      .forEach(entry => grid.appendChild(entry.card));
  },

  filterRoster(filter) {
    // Update active chip styling
    document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-filter') === filter);
    });

    // Position keyword map
    const filterMap = {
      ALL: null,
      FWD: ['forward', 'winger', 'cam', 'striker'],
      MID: ['midfield', 'mid'],
      DEF: ['back', 'defender', 'def'],
      GK:  ['goalkeeper', 'keeper', 'gk']
    };

    const keywords = filterMap[filter];

    document.querySelectorAll('#rosterGrid .player-card').forEach(card => {
      if (!keywords) {
        card.style.display = '';
      } else {
        const pos = (card.getAttribute('data-position') || '').toLowerCase();
        const match = keywords.some(kw => pos.includes(kw));
        card.style.display = match ? '' : 'none';
      }
    });
  },

  openAddPlayerModal() {
    const modal = document.getElementById('addPlayerModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  async addPlayer(playerData) {
    const newPlayer = {
      id: 'p_' + Date.now(),
      number: parseInt(playerData.number),
      name: playerData.name,
      position: playerData.position,
      classYear: playerData.classYear,
      height: playerData.height || "5'10\"",
      // Stored empty rather than defaulted to a stock photo: assigning a random
      // stranger's face makes a player without a photo look like they have one.
      // The roster and player modal render the silhouette placeholder instead.
      photo: (playerData.photo || '').trim(),
      seasonStats: playerData.position.includes('Goalkeeper') ? { saves: parseInt(playerData.stat1 || 0), cleanSheets: parseInt(playerData.stat2 || 0), games: 1 } : { goals: parseInt(playerData.stat1 || 0), assists: parseInt(playerData.stat2 || 0), games: 1 },
      ratings: {
        technical: parseInt(playerData.tech || 80),
        tactical: parseInt(playerData.tact || 80),
        physical: parseInt(playerData.phys || 80),
        mental: parseInt(playerData.ment || 80)
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

  openEditPlayerModal(playerId) {
    console.log('[BHS] openEditPlayerModal called with id:', playerId);
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) {
      console.warn('[BHS] Player not found for id:', playerId);
      return;
    }
    console.log('[BHS] Found player:', player.name);

    const fields = {
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
      const el = document.getElementById(id);
      if (el) {
        el.value = val;
      } else {
        console.warn('[BHS] DOM element not found:', id);
      }
    }

    const modal = document.getElementById('editPlayerModal');
    if (modal) {
      modal.style.display = '';
      modal.classList.add('active');
      console.log('[BHS] Edit modal opened');
    } else {
      console.error('[BHS] editPlayerModal element NOT found in DOM!');
    }
  },

  async saveEditPlayer(playerId, playerData) {
    const idx = this.data.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const existing = this.data.players[idx];
      existing.number = parseInt(playerData.number);
      existing.name = playerData.name;
      existing.position = playerData.position;
      existing.classYear = playerData.classYear;
      existing.height = playerData.height;
      existing.photo = playerData.photo;

      if (playerData.position.includes('Goalkeeper')) {
        existing.seasonStats = { saves: parseInt(playerData.stat1), cleanSheets: parseInt(playerData.stat2), games: existing.seasonStats.games || 1 };
      } else {
        existing.seasonStats = { goals: parseInt(playerData.stat1), assists: parseInt(playerData.stat2), games: existing.seasonStats.games || 1 };
      }

      existing.ratings = {
        technical: parseInt(playerData.tech),
        tactical: parseInt(playerData.tact),
        physical: parseInt(playerData.phys),
        mental: parseInt(playerData.ment)
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

  async deletePlayer(playerId) {
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) return;

    // Soft delete player (sets is_deleted = true in database, preserves record)
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
