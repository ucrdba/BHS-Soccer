/**
 * BHS Soccer — 1v1 round-robin tournament.
 *
 * Builds a full round robin from the active squad: every player meets every
 * other exactly once. Nothing is stored. The schedule is generated fresh each
 * time from the roster, and which pairings have already been played is derived
 * from matrix_logs — the same rows the Matrix scores from — so there is no
 * second copy of "who played whom" to fall out of step with the first.
 *
 * Classic script — no imports. Extends the prototype defined in app.core.js,
 * so index.html must load this AFTER that file.
 */

Object.assign(BHSSoccerApp.prototype, {

  /**
   * How a player appears on the sheet: "(1) Cesar A."
   *
   * Recording number rather than shirt number, because the sheet is written and
   * read alongside the paper Matrix sheets, which carry recording numbers.
   * A player without one shows as (—) rather than being hidden: the sheet
   * cannot identify them, and that is worth noticing before it is printed.
   */
  // The schedule and its formatting live in src/domain/round-robin.ts.
  roundRobinLabel(p) {
    return window.roundRobinDomain.roundRobinLabel(p);
  },

  /** The squad a tournament is drawn from, in recording-number order. */
  roundRobinPlayers() {
    return window.roundRobinDomain.roundRobinPlayers(this.data.players || []);
  },

  /**
   * Results already recorded, keyed by the unordered pair.
   *
   * Keyed on the sorted id pair because a result logged as "p4 beat p3" is the
   * same fixture as "p3 v p4" — reading it one way round would leave half the
   * schedule looking unplayed.
   */
  roundRobinPlayed() {
    return window.roundRobinDomain.roundRobinPlayed(this.data.matrixLogs || []);
  },

  /**
   * The full schedule: every player against every other, exactly once.
   *
   * The circle method — fix the first player, rotate the rest — which is what
   * guarantees no player appears twice in a round. An odd squad gets a bye
   * seat that rotates, so nobody sits out more than once.
   */
  buildRoundRobin() {
    return window.roundRobinDomain.buildRoundRobin(
      this.data.players || [], this.data.matrixLogs || []);
  },

  /** "Cesar A. won" / "Drew", from the stored outcome. */
  roundRobinResultText(a, b, hit) {
    return window.roundRobinDomain.roundRobinResultText(a, b, hit);
  },

  /**
   * The schedule as CSV.
   *
   * Carries both the sheet label and the full name: the label is what is read
   * on the pitch, the full name is what makes the file legible to anyone
   * opening it later.
   */
  roundRobinCsv() {
    return window.roundRobinDomain.roundRobinCsv(this.buildRoundRobin());
  },

  /** Download the schedule as a CSV file. */
  downloadRoundRobinCsv() {
    const team = (this.data.teams || []).find(t => t.id === this.activeTeamId);
    const name = `1v1_round_robin_${String((team && team.name) || 'team').replace(/\s+/g, '_')}.csv`;
    const blob = new Blob([this.roundRobinCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * The schedule as printable HTML, one block per round with room to write.
   *
   * Opened in its own window and printed, which is also how a PDF is produced:
   * every browser's print dialog offers "Save as PDF", and that avoids carrying
   * a PDF library for one screen.
   */
  printRoundRobin() {
    const rounds = this.buildRoundRobin();
    if (rounds.length === 0) {
      window.alert('At least two players are needed for a round robin.');
      return;
    }

    const team = (this.data.teams || []).find(t => t.id === this.activeTeamId);
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const body = rounds.map(r => `
      <div class="round">
        <h2>Round ${r.round}</h2>
        <table>
          <thead><tr><th>#</th><th>Match</th><th>Result</th></tr></thead>
          <tbody>
            ${r.matches.map((m, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${m.bye
                  ? `${esc(this.roundRobinLabel(m.a))} &mdash; bye`
                  : `${esc(this.roundRobinLabel(m.a))} vs ${esc(this.roundRobinLabel(m.b))}`}</td>
                <td class="result">${m.played ? esc(m.result) : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`).join('');

    const win = window.open('', '_blank');
    if (!win) {
      window.alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
      return;
    }

    win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>1v1 Round Robin — ${esc((team && team.name) || 'Team')}</title>
      <style>
        body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 24px; color: #111; }
        h1 { font-size: 18pt; margin: 0 0 2px 0; }
        .sub { color: #555; font-size: 10pt; margin-bottom: 16px; }
        .round { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14px; }
        h2 { font-size: 12pt; margin: 0 0 4px 0; border-bottom: 1px solid #999; padding-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; font-size: 10pt; }
        th { text-align: left; font-size: 8pt; text-transform: uppercase; color: #555; padding: 2px 4px; }
        td { padding: 3px 4px; border-bottom: 1px solid #ddd; }
        td:first-child { width: 28px; color: #777; }
        /* Room to write the result in by hand, which is the point of printing. */
        .result { width: 34%; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <h1>1v1 Round Robin &mdash; ${esc((team && team.name) || 'Team')}</h1>
      <div class="sub">
        ${rounds.length} rounds &middot;
        ${rounds.reduce((n, r) => n + r.matches.filter(m => !m.bye).length, 0)} matches &middot;
        generated ${new Date().toLocaleDateString()}
      </div>
      ${body}
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  },

  /** The schedule on screen, with what has already been played marked off. */
  renderRoundRobin() {
    const rounds = this.buildRoundRobin();
    const container = document.getElementById('roundRobinBody');
    if (!container) return;

    if (rounds.length === 0) {
      container.innerHTML = `
        <p class="text-muted" style="font-size:0.9rem;">
          At least two players are needed. Add them to this team's roster first.
        </p>`;
      return;
    }

    const total = rounds.reduce((n, r) => n + r.matches.filter(m => !m.bye).length, 0);
    const done = rounds.reduce((n, r) => n + r.matches.filter(m => m.played).length, 0);
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    container.innerHTML = `
      <p class="text-muted" style="font-size:0.82rem; margin:0 0 10px 0;">
        ${rounds.length} rounds &middot; ${total} matches &middot;
        <strong style="color:var(--bhs-cyan-accent);">${done} played</strong>.
        Results are read from the Matrix, so this marks itself off as you record them.
      </p>
      <div style="max-height:420px; overflow-y:auto; padding-right:4px;">
        ${rounds.map(r => `
          <div style="margin-bottom:12px;">
            <div style="color:var(--bhs-gold-accent); font-size:0.8rem; font-weight:700; margin-bottom:4px;">
              Round ${r.round}
            </div>
            ${r.matches.map(m => `
              <div style="display:flex; gap:8px; align-items:center; font-size:0.82rem; padding:3px 6px;
                          border-bottom:1px solid var(--bhs-navy-border); ${m.played ? 'opacity:.65;' : ''}">
                <span style="flex:1; color:#FFF;">
                  ${m.bye
                    ? `${esc(this.roundRobinLabel(m.a))} <span class="text-muted">&mdash; bye</span>`
                    : `${esc(this.roundRobinLabel(m.a))} <span class="text-muted">vs</span> ${esc(this.roundRobinLabel(m.b))}`}
                </span>
                <span class="text-muted" style="font-size:0.78rem;">${m.played ? esc(m.result) : ''}</span>
              </div>`).join('')}
          </div>`).join('')}
      </div>`;
  },

  openRoundRobinModal() {
    this.renderRoundRobin();
    const modal = document.getElementById('roundRobinModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  }

});
