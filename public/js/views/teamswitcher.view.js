/**
 * BHS Soccer — Team Switcher
 * Adds renderTeamSwitcher() to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 */

Object.assign(BHSSoccerApp.prototype, {

  /**
   * The control that changes which team every view is showing.
   *
   * Hidden for a viewer with fewer than two teams: a player on one team should
   * not see a control that cannot do anything, and a signed-out visitor sees
   * only the public default.
   */
  renderTeamSwitcher() {
    const teams = this.data.teams || [];
    if (teams.length < 2) return '';

    // Grouped by organization, because "Varsity" and "U16" mean little without
    // knowing whose they are.
    const byOrg = new Map();
    teams.forEach(t => {
      const key = t.school_name || 'Team';
      if (!byOrg.has(key)) byOrg.set(key, []);
      byOrg.get(key).push(t);
    });

    const groups = Array.from(byOrg.entries()).map(([org, list]) => `
      <optgroup label="${org}">
        ${list.map(t => `
          <option value="${t.id}" ${t.id === this.activeTeamId ? 'selected' : ''}>
            ${t.name}${t.season ? ' (' + t.season + ')' : ''}
          </option>`).join('')}
      </optgroup>`).join('');

    return `
      <select id="teamSwitcher" class="form-control"
              style="max-width:220px; font-size:0.85rem;"
              onchange="app.setActiveTeam(this.value)"
              title="Switch team">
        ${groups}
      </select>`;
  }

});
