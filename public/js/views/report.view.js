/**
 * BHS Soccer — squad performance report.
 *
 * One block per exercise, printable and sized to be pinned to a wall.
 *
 * The distinction the whole report turns on: a COMPETITIVE drill is a ranking —
 * beating your team-mates is the point, and the block is ordered by it. A
 * FITNESS STANDARD is not. It answers "can this player last a full match", so
 * that block lists everyone with met or not yet, ordered by recording number.
 * Ordering those by time would turn a pass/fail check into a league table,
 * which is the opposite of what the drill is for.
 *
 * Classic script — no imports. Extends the prototype defined in app.core.js and
 * uses exerciseLeaderboard() from matrix.view.js, so both must load first.
 */

Object.assign(BHSSoccerApp.prototype, {

  /**
   * The standard for a banded drill: the tightest band, which is the time the
   * exercise actually asks for. Earning a part band is not meeting it -- 4:34
   * against a 4:30 standard scores something and is still not match-fit.
   */
  reportStandardSeconds(drillId) {
    const bands = (this._reportBands || {})[drillId] || [];
    if (!bands.length) return null;
    return Math.min(...bands.map(b => Number(b.max_seconds)));
  },

  /**
   * One exercise's block: its rows, in the order that exercise should be read.
   */
  reportBlock(drillId) {
    const drill = (this.data.drillsBank || []).find(d => d.id === drillId);
    if (!drill) return null;

    const measure = drill.measure || 'count_high';
    const isStandard = measure === 'time_bands';
    const isWinLoss = measure === 'win_loss' || measure === 'head_to_head';
    const timed = measure === 'time_low' || measure === 'time_bands';

    // A standard is read by number so it does not look like a league table;
    // everything else is read as the ranking it is.
    const sortBy = isStandard ? 'number' : (isWinLoss ? 'wins' : 'best');
    const rows = this.exerciseLeaderboard(drillId, sortBy);
    const standard = isStandard ? this.reportStandardSeconds(drillId) : null;

    const out = rows.map(r => ({
      playerId: r.playerId,
      name: r.name,
      recordingNumber: r.recordingNumber,
      earned: r.earned,
      available: r.available,
      // Met the standard means inside the tightest band, not merely scoring.
      met: isStandard && r.best !== null && standard !== null ? r.best <= standard : false,
      figure: isWinLoss
        ? `${r.wins} - ${r.draws} - ${r.losses}`
        : r.best === null || r.best === undefined
          ? '—'
          : (timed ? window.supabaseService.formatSecondsAsTime(r.best) : String(r.best))
    }));

    return {
      drillId,
      name: drill.name,
      weight: Number(drill.points ?? 3),
      measure,
      isStandard,
      isWinLoss,
      standard,
      metCount: out.filter(r => r.met).length,
      rows: out
    };
  },

  /** A block for every exercise that has results. */
  buildSquadReport() {
    const ids = [];
    (this._exercisePoints || []).forEach(r => {
      if (r.drill_id && ids.indexOf(r.drill_id) === -1) ids.push(r.drill_id);
    });

    return ids
      .map(id => this.reportBlock(id))
      .filter(Boolean)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  },

  /** Load the bands for every banded drill, so "met" can be decided. */
  async loadReportBands() {
    this._reportBands = {};
    if (!window.supabaseService?.isConfigured() || !this.activeTeamId) return;

    const banded = (this.data.drillsBank || []).filter(d => d.measure === 'time_bands');
    for (const d of banded) {
      this._reportBands[d.id] =
        (await window.supabaseService.fetchTimeBands(d.id, this.activeTeamId)) || [];
    }
  },

  async openSquadReport() {
    await this.loadReportBands();
    const body = document.getElementById('squadReportBody');
    if (body) body.innerHTML = this.renderSquadReport();
    const modal = document.getElementById('squadReportModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  /** The report on screen. */
  renderSquadReport() {
    const blocks = this.buildSquadReport();
    if (blocks.length === 0) {
      return `<p class="text-muted" style="font-size:0.88rem;">
        No results recorded for this team yet. Record a session or a 1v1 first.</p>`;
    }
    return blocks.map(b => this.renderReportBlock(b)).join('');
  },

  /** The same markup on screen and on paper; only the stylesheet differs. */
  renderReportBlock(b) {
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const heading = b.isStandard
      ? `${esc(b.name)} <span class="report-sub">standard ${window.supabaseService.formatSecondsAsTime(b.standard)} &middot; ${b.metCount} of ${b.rows.length} met it</span>`
      : `${esc(b.name)} <span class="report-sub">weight ${b.weight}</span>`;

    const col = b.isWinLoss ? 'W - D - L' : b.isStandard ? 'Time' : 'Best';

    return `
      <div class="report-block">
        <h3>${heading}</h3>
        <table>
          <thead><tr><th>#</th><th>Player</th><th>${col}</th>
            ${b.isStandard ? '<th>Match fit</th>' : '<th>Points</th>'}</tr></thead>
          <tbody>
            ${b.rows.map(r => `
              <tr>
                <td class="num">${r.recordingNumber != null ? r.recordingNumber : '—'}</td>
                <td>${esc(r.name)}</td>
                <td>${esc(r.figure)}</td>
                ${b.isStandard
                  ? `<td class="${r.met ? 'met' : 'notyet'}">${r.met ? 'Met' : 'Not yet'}</td>`
                  : `<td>${r.earned.toFixed(2)}</td>`}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  },

  /**
   * Print the report, which is also how a PDF is made: every browser's print
   * dialog offers Save as PDF, so there is no PDF library here for one screen.
   *
   * Its own window with its own stylesheet, because the app's dark theme prints
   * as a wall of ink and this is meant to go on a wall.
   */
  printSquadReport() {
    const blocks = this.buildSquadReport();
    if (blocks.length === 0) {
      window.alert('No results recorded for this team yet.');
      return;
    }

    const label = this.activeTeamLabel ? this.activeTeamLabel() : { org: '', team: '' };
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const win = window.open('', '_blank');
    if (!win) {
      window.alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
      return;
    }

    win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>Squad Report — ${esc(label.team || 'Team')}</title>
      <style>
        body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 18mm; color: #111; }
        h1 { font-size: 20pt; margin: 0; }
        .sub { color: #555; font-size: 10pt; margin: 2px 0 18px 0; }
        .report-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 18px; }
        h3 { font-size: 13pt; margin: 0 0 4px 0; border-bottom: 2px solid #111; padding-bottom: 3px; }
        .report-sub { font-weight: 400; font-size: 9pt; color: #555; }
        table { width: 100%; border-collapse: collapse; font-size: 11pt; }
        th { text-align: left; font-size: 8pt; text-transform: uppercase; color: #555; padding: 3px 5px; }
        td { padding: 4px 5px; border-bottom: 1px solid #ddd; }
        .num { width: 34px; color: #777; }
        /* The players who have not met the standard are the reason the sheet
           is on the wall, so they are what reads from across the room. */
        .met { color: #666; }
        .notyet { font-weight: 700; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <h1>${esc(label.org || '')} ${esc(label.team || '')} &mdash; Squad Report</h1>
      <div class="sub">${esc(label.season || '')} &middot; ${new Date().toLocaleDateString()}</div>
      ${blocks.map(b => this.renderReportBlock(b)).join('')}
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

});
