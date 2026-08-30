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

  /**
   * Adding a player is now two writes with no transaction between them:
   * upsertPlayerIdentity() creates the person (name/classYear/height/photo —
   * the only columns `players` still owns after 0005), then
   * upsertTeamMembership() puts them on the active team (number/position/
   * seasonStats/ratings — everything that varies by team, on `team_players`).
   * If the membership write fails, the person now exists on no team. That is
   * recoverable, not corrupt: searchPlayersByName() finds them, so the coach
   * can finish the job from "Already in the system?" on a second attempt —
   * but it must be said plainly, not swallowed into console.error the way
   * the pre-migration upsertPlayer('bhs', …) call silently was.
   */
  async addPlayer(playerData) {
    if (!window.supabaseService || !window.supabaseService.isConfigured()) {
      window.alert('Cloud database is not configured; cannot add a player.');
      return;
    }

    const teamId = this.activeTeamId;
    const team = (this.data.teams || []).find(t => t.id === teamId);
    if (!teamId || !team) {
      window.alert('No active team selected.');
      return;
    }

    const seasonStats = playerData.position.includes('Goalkeeper')
      ? { saves: parseInt(playerData.stat1 || 0), cleanSheets: parseInt(playerData.stat2 || 0), games: 1 }
      : { goals: parseInt(playerData.stat1 || 0), assists: parseInt(playerData.stat2 || 0), games: 1 };
    const ratings = {
      technical: parseInt(playerData.tech || 80),
      tactical: parseInt(playerData.tact || 80),
      physical: parseInt(playerData.phys || 80),
      mental: parseInt(playerData.ment || 80)
    };

    const identity = await window.supabaseService.upsertPlayerIdentity({
      name: playerData.name,
      classYear: playerData.classYear,
      height: playerData.height || "5'10\"",
      // Stored empty rather than defaulted to a stock photo: assigning a random
      // stranger's face makes a player without a photo look like they have one.
      // The roster and player modal render the silhouette placeholder instead.
      photo: (playerData.photo || '').trim()
    });
    if (!identity || !identity.id) { window.alert('Could not create that player.'); return; }

    const res = await window.supabaseService.upsertTeamMembership(teamId, team.school_id, {
      player_id: identity.id,
      number: parseInt(playerData.number) || null,
      position: playerData.position,
      season_stats: seasonStats,
      ratings: ratings
    });
    if (!res.ok) {
      // The person now exists but is on no team. Say so plainly: the coach can
      // finish the job from the search-first flow rather than creating a duplicate.
      window.alert((res.error || 'Could not add them to this team.') +
        '\n\nThe player was created but is not on a team yet — add them from "Already in the system?".');
      return;
    }

    await this.syncFromSupabase();
    this.renderCurrentView();
    this.closeModals();
  },

  async searchExistingPlayers() {
    const input = document.getElementById('playerSearchInput');
    const out = document.getElementById('playerSearchResults');
    if (!input || !out) return;

    const results = await window.supabaseService.searchPlayersByName(input.value);
    if (!results || results.length === 0) { out.innerHTML = ''; return; }

    // Anyone already on this team is filtered out — adding them again would be
    // rejected by unique (team_id, player_id) and the error would be opaque.
    const onTeam = new Set((this.data.players || []).map(p => p.id));
    const rows = results.filter(r => !onTeam.has(r.id));
    if (rows.length === 0) { out.innerHTML = '<span class="text-muted" style="font-size:0.8rem;">Already on this team.</span>'; return; }

    out.innerHTML = rows.map(r => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border:1px solid var(--bhs-navy-border); border-radius:6px; margin-bottom:4px;">
        <span>${r.name} <span class="text-muted" style="font-size:0.78rem;">${r.class_year || ''}</span></span>
        <button type="button" class="btn-card-edit" onclick="app.addExistingPlayerToTeam('${r.id}')">Add to this team</button>
      </div>`).join('');
  },

  async addExistingPlayerToTeam(playerId) {
    const team = (this.data.teams || []).find(t => t.id === this.activeTeamId);
    if (!team) return;

    const res = await window.supabaseService.upsertTeamMembership(this.activeTeamId, team.school_id, { player_id: playerId });
    if (!res || res.ok === false) {
      // The likeliest cause is unique (school_id, player_id): they are already
      // on another team in this same organization, which the design forbids.
      window.alert((res && res.error) || 'Could not add that player. They may already be on another team in this organization.');
      return;
    }
    await this.syncFromSupabase();
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

  /**
   * Same identity/membership split as addPlayer(): name, classYear, height
   * and photo are the person's, so they go to upsertPlayerIdentity(); number,
   * position, seasonStats and ratings vary by team, so they go to
   * upsertTeamMembership() for the active team only. A failure on either
   * write is surfaced with window.alert() rather than swallowed — the
   * pre-migration upsertPlayer('bhs', …) call errored on columns 0005 drops
   * and left the form looking like it had silently done nothing.
   */
  async saveEditPlayer(playerId, playerData) {
    if (!window.supabaseService || !window.supabaseService.isConfigured()) {
      window.alert('Cloud database is not configured; cannot save changes.');
      return;
    }

    const idx = this.data.players.findIndex(p => p.id === playerId);
    if (idx === -1) return;
    const existing = this.data.players[idx];

    const seasonStats = playerData.position.includes('Goalkeeper')
      ? { saves: parseInt(playerData.stat1), cleanSheets: parseInt(playerData.stat2), games: existing.seasonStats.games || 1 }
      : { goals: parseInt(playerData.stat1), assists: parseInt(playerData.stat2), games: existing.seasonStats.games || 1 };
    const ratings = {
      technical: parseInt(playerData.tech),
      tactical: parseInt(playerData.tact),
      physical: parseInt(playerData.phys),
      mental: parseInt(playerData.ment)
    };

    const identity = await window.supabaseService.upsertPlayerIdentity({
      id: playerId,
      name: playerData.name,
      classYear: playerData.classYear,
      height: playerData.height,
      photo: playerData.photo
    });
    if (!identity || !identity.id) { window.alert("Could not save that player's profile."); return; }

    const team = (this.data.teams || []).find(t => t.id === this.activeTeamId);
    if (!team) { window.alert('No active team selected.'); return; }

    const res = await window.supabaseService.upsertTeamMembership(this.activeTeamId, team.school_id, {
      player_id: identity.id,
      number: parseInt(playerData.number) || null,
      position: playerData.position,
      season_stats: seasonStats,
      ratings: ratings
    });
    if (!res.ok) {
      // The person's profile saved; only this team's jersey number, position
      // and stats did not. Say so rather than letting the coach believe
      // nothing was saved at all.
      window.alert((res.error || 'Could not save this team\'s roster info.') +
        '\n\nTheir profile was updated, but jersey number, position and stats on this team were not.');
      return;
    }

    await this.syncFromSupabase();
    this.renderCurrentView();
    this.closeModals();
  },

  /**
   * Removes the player from THIS team only, by soft-deleting their
   * `team_players` row via `deleteTeamMembership()` — never the shared
   * `players` identity row (`supabaseService.deletePlayer()`, which would
   * drop them from every team they play for, e.g. a club team too). This
   * defeats the whole point of the one-person, multi-team model otherwise.
   */
  async deletePlayer(playerId) {
    const player = this.data.players.find(p => p.id === playerId);
    if (!player) return;

    if (!window.supabaseService || !window.supabaseService.isConfigured()) {
      window.alert('Cloud database is not configured; cannot remove that player.');
      return;
    }
    const teamId = this.activeTeamId;
    if (!teamId) {
      window.alert('No active team selected.');
      return;
    }

    const res = await window.supabaseService.deleteTeamMembership(teamId, playerId);
    if (!res || !res.ok) {
      window.alert((res && res.error) || 'Could not remove that player from this team.');
      return;
    }

    await this.syncFromSupabase();
    this.renderCurrentView();
    this.closeModals();
  }


});
