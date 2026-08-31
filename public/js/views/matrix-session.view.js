/**
 * Matrix session entry and exercise weighting.
 *
 * Separate from matrix.view.js, which owns the leaderboard. These are the two
 * write surfaces: what an exercise is worth, and what happened in one.
 *
 * Classic script — no imports. Extends the prototype defined in app.core.js,
 * so index.html must load this AFTER that file.
 */
Object.assign(BHSSoccerApp.prototype, {

  async openWeightsModal() {
    const err = document.getElementById('matrixWeightsError');
    if (err) err.textContent = '';
    if (window.supabaseService?.isConfigured()) {
      this._weightDrills = (await window.supabaseService.fetchDrillsForWeighting('bhs')) || [];
    } else {
      this._weightDrills = this._weightDrills || [];
    }
    const rows = document.getElementById('matrixWeightsRows');
    if (rows) rows.innerHTML = this.renderWeightsRows();
    const modal = document.getElementById('matrixWeightsModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  renderWeightsRows() {
    const drills = this._weightDrills || [];
    if (drills.length === 0) {
      return '<p class="text-muted" style="font-size:0.85rem;">No exercises yet. Add drills in the practice planner first.</p>';
    }
    const measures = [
      ['head_to_head', '1v1 (pairings)'],
      ['win_loss', 'Small-sided (W/D/L)'],
      ['count_high', 'Counted, high wins'],
      ['time_low', 'Timed, low wins']
    ];
    return drills.map(d => `
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
        <span style="flex:1; color:#FFF; font-size:0.85rem;">${d.name}
          <span class="text-muted" style="font-size:0.75rem;">${d.category || ''}</span>
        </span>
        <input type="number" id="weightPoints_${d.id}" class="form-control"
               step="0.5" min="0" max="10" style="max-width:80px; font-size:0.8rem;"
               value="${Number(d.points ?? 3)}" />
        <select id="weightMeasure_${d.id}" class="form-control" style="max-width:190px; font-size:0.8rem;">
          ${measures.map(([v, label]) =>
            `<option value="${v}"${(d.measure || 'head_to_head') === v ? ' selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>`).join('');
  },

  async saveWeights() {
    const err = document.getElementById('matrixWeightsError');
    const set = (m, ok = false) => {
      if (!err) return;
      err.textContent = m;
      err.style.color = ok ? 'var(--bhs-cyan-accent)' : 'var(--color-danger)';
    };
    const rows = (this._weightDrills || []).map(d => ({
      id: d.id,
      points: parseFloat(document.getElementById(`weightPoints_${d.id}`)?.value),
      measure: document.getElementById(`weightMeasure_${d.id}`)?.value || 'head_to_head'
    }));
    if (rows.length === 0) return set('Nothing to save.');

    set('Saving…');
    const res = await window.supabaseService.updateDrillWeights(rows);
    if (!res.ok) return set(res.error || 'Could not save those weights.');

    // Weights are looked up live, so every past result is re-scored. Re-sync
    // rather than patch, or the leaderboard on screen contradicts the database.
    await this.syncFromSupabase();
    this.renderCurrentView();
    set(`Saved ${res.updated} exercise${res.updated === 1 ? '' : 's'}. Standings re-scored.`, true);
  }

});
