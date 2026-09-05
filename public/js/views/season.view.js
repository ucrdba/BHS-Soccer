/**
 * BHS Soccer — the season plus/minus report.
 *
 * Adds openSeasonReport() and its rendering to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 *
 * ── What this is for ──────────────────────────────────────────────────────
 *
 * Plus/minus is recorded one match at a time. This adds them up, and — more
 * usefully — plots each player's rate across the season so a coach can see
 * who is getting better.
 *
 * Every figure is per FULL MATCH, and a full match is whatever this team
 * plays — 80 minutes for a high school fixture, and club sides vary by age
 * group. Not per 90: that professional convention would inflate an 80-minute
 * game by an eighth, so a player who was on the whole time would show a rate
 * higher than what they actually did, breaking the one number a coach can
 * check against their memory of the match.
 *
 * Raw totals are shown too, but the rate is what the report is sorted and
 * read by: raw totals mostly measure who got picked, so a substitute working
 * into the side shows a rising line without having played any better.
 *
 * ── Short outings are shown, never filtered ───────────────────────────────
 *
 * A rate off five minutes is wild by construction — one plus in an 80-minute
 * game reads as +16. The usual answer is a minutes threshold. That is wrong
 * here.
 * High school soccer allows unlimited substitution and re-entry, so much of
 * the squad plays well short of a full match, and the coach reads this to
 * decide who to give MORE minutes to. A threshold would hide exactly the
 * players the report exists to inform a decision about.
 *
 * So the uncertainty is drawn instead of hidden: each point is sized and
 * faded by the minutes behind it, and the minutes are printed beside it. A
 * faint little dot at +16 reads as what it is.
 *
 * The charts are inline SVG for the same reasons as the fitness report: it is
 * a few dozen lines, it prints at any size, and an app with no build-time
 * dependency on a charting library should not acquire one for two shapes.
 */

Object.assign(BHSSoccerApp.prototype, {

  /** Escape for HTML text and double-quoted attributes. */
  seasonEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  /**
   * How long a full match is for the active team.
   *
   * Read from the team rather than assumed: a school plays 80 minutes and a
   * club side may play 60, 70 or 80 by age group, and this database holds
   * both. Falls back to the module default when the team has not said, which
   * is a fallback and not a claim about the sport.
   */
  seasonFullMatchMinutes() {
    const team = (this.data.teams || []).find(t => String(t.id) === String(this.activeTeamId));
    const stated = team && Number(team.match_minutes);
    return stated && stated > 0 ? stated : window.seasonStats.DEFAULT_FULL_MATCH_MINUTES;
  },

  /**
   * Load every tracked session for the active team and replay each one.
   *
   * The fixture's date and opponent come from this.data.schedule rather than
   * from another round trip: the schedule is already in memory, and a session
   * always belongs to a team whose schedule has been loaded.
   */
  async loadSeasonStats() {
    this._seasonError = '';
    this._seasonMatches = null;

    const svc = window.supabaseService;
    if (!svc || !svc.isConfigured()) {
      this._seasonError = 'The cloud database is not configured, so there is nothing to report on.';
      return;
    }

    const res = await svc.fetchSeasonStats(this.activeTeamId);
    if (!res) {
      // Null is not "no matches": these tables are readable only by a coach
      // of this team, so a refusal and an empty season look identical unless
      // they are told apart here.
      this._seasonError = 'Could not read the tracked matches. You must coach this team to see them.';
      return;
    }

    const byId = new Map((this.data.schedule || []).map(m => [String(m.id), m]));
    this._seasonMatches = res.sessions.map(s => {
      const fixture = s.match_id ? byId.get(String(s.match_id)) : null;
      const date = fixture ? fixture.date : (s.label || '');
      return {
        statMatchId: s.id,
        matchId: s.match_id || null,
        date,
        sortKey: (svc.parseScheduleDate && svc.parseScheduleDate(date))
          ? this.seasonSortKey(svc.parseScheduleDate(date))
          : null,
        opponent: fixture ? fixture.opponent : (s.label || 'Untitled match'),
        stats: window.plusMinus.replay(res.eventsBySession[s.id] || [])
      };
    });
  },

  /**
   * "DEC 8 2026" to "2026-12-08", so matches sort chronologically.
   *
   * The displayed text cannot be compared directly — "JAN 6 2027" sorts ahead
   * of "DEC 8 2026" as a string, which would run the season backwards across
   * the new year, and every running total with it.
   */
  seasonSortKey(display) {
    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const m = String(display || '').trim().toUpperCase().match(/^([A-Z]{3})\s+(\d{1,2})\s+(\d{4})/);
    if (!m) return null;
    const month = MONTHS.indexOf(m[1]);
    if (month < 0) return null;
    return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  },

  /** A rate for display: one decimal, always signed, or a dash. */
  seasonRate(v) {
    if (v == null) return '&mdash;';
    const r = Math.round(v * 10) / 10;
    return `${r > 0 ? '+' : ''}${r.toFixed(1)}`;
  },

  /** One player's chart for one metric, as inline SVG. */
  renderSeasonChart(points, key, toDateKey, label) {
    const W = 320, H = 110, PAD = 16;
    const full = this.seasonFullMatchMinutes();
    const esc = v => this.seasonEsc(v);

    const values = [];
    points.forEach(p => {
      if (p[key] != null) values.push(p[key]);
      if (p[toDateKey] != null) values.push(p[toDateKey]);
    });
    values.push(0);                       // zero is always in frame: it is the
                                          // line between helping and not.
    let lo = Math.min(...values), hi = Math.max(...values);
    if (hi === lo) { lo -= 1; hi += 1; }
    const span = hi - lo;

    const usableW = W - PAD * 2, usableH = H - PAD * 2;
    const n = points.length;
    const xAt = i => PAD + (n === 1 ? usableW / 2 : (i / (n - 1)) * usableW);
    const yAt = v => PAD + (1 - (v - lo) / span) * usableH;

    const zeroY = yAt(0);
    const runLine = points
      .filter(p => p[toDateKey] != null)
      .map((p, i) => `${xAt(points.indexOf(p)).toFixed(1)},${yAt(p[toDateKey]).toFixed(1)}`)
      .join(' ');

    return `
      <svg viewBox="0 0 ${W} ${H}" class="season-chart" role="img"
           aria-label="${esc(label)} per ${full} minutes across ${n} appearance${n === 1 ? '' : 's'}">
        <line x1="${PAD}" y1="${zeroY.toFixed(1)}" x2="${W - PAD}" y2="${zeroY.toFixed(1)}"
              stroke="rgba(255,255,255,0.28)" stroke-width="1" stroke-dasharray="4 3" />
        <text x="${W - PAD}" y="${(zeroY - 3).toFixed(1)}" text-anchor="end"
              font-size="8" fill="rgba(255,255,255,0.4)">0</text>

        ${runLine
          ? `<polyline points="${runLine}" fill="none" stroke="var(--bhs-cyan-accent)"
                       stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`
          : ''}

        ${points.map((p, i) => {
          if (p[key] == null) return '';
          // Size and opacity carry the minutes. A five-minute cameo is a faint
          // speck at +18; a full match is a solid dot. Neither is hidden.
          const w = window.seasonStats.pointWeight(p.minutes, full);
          const r = (2 + w * 3).toFixed(1);
          return `
            <circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p[key]).toFixed(1)}" r="${r}"
                    fill="var(--bhs-gold-accent)" opacity="${(0.3 + w * 0.7).toFixed(2)}">
              <title>${esc(p.opponent)} &middot; ${esc(p.date)}: ${this.seasonRate(p[key]).replace('&mdash;','—')} per ${full} min, off ${Math.round(p.minutes)} min</title>
            </circle>`;
        }).join('')}

        <text x="${PAD}" y="${H - 3}" font-size="8" fill="rgba(255,255,255,0.4)">${esc(points[0].date)}</text>
        ${n > 1
          ? `<text x="${W - PAD}" y="${H - 3}" text-anchor="end" font-size="8"
                   fill="rgba(255,255,255,0.4)">${esc(points[n - 1].date)}</text>`
          : ''}
      </svg>`;
  },

  /**
   * How each column of the season table is read, and which way it sorts first.
   *
   * Every figure but the name reads highest-first: the question a coach brings
   * to this table is who is doing well, and one click should answer it.
   *
   * The rate columns can be null — a player who has not been on the pitch has
   * no rate, which is different from a rate of zero.
   */
  seasonColumns() {
    return [
      { key: 'player',  label: 'Player',  desc: false, text: true,
        get: (t, name) => String(name || '').toLowerCase() },
      { key: 'apps',    label: 'Apps',    desc: true,  get: t => t.appearances || 0 },
      { key: 'mins',    label: 'Mins',    desc: true,  get: t => t.minutes || 0 },
      { key: 'plus',    label: '+',       desc: true,  get: t => t.plus || 0 },
      { key: 'minus',   label: '&minus;', desc: true,  get: t => t.minus || 0 },
      { key: 'net',     label: 'Net',     desc: true,  get: t => t.score || 0 },
      { key: 'gd',      label: 'GD',      desc: true,  get: t => t.goalDiff || 0 },
      { key: 'netrate', label: 'Net',     desc: true,  get: t => t.scorePerMatch },
      { key: 'gdrate',  label: 'GD',      desc: true,  get: t => t.goalDiffPerMatch }
    ];
  },

  /**
   * Click a heading to sort by it; click again to reverse.
   *
   * The rate per full match is the default, because that is the comparison the
   * report exists to make: raw totals mostly measure who got picked.
   */
  setSeasonSort(key) {
    if ((this._seasonSort || 'netrate') === key) {
      this._seasonSortReversed = !this._seasonSortReversed;
    } else {
      this._seasonSort = key;
      this._seasonSortReversed = false;
    }
    const body = document.getElementById('seasonReportBody');
    // Re-render from what is already loaded rather than fetching a season
    // again to reorder rows that are sitting in memory.
    if (body) body.innerHTML = this.renderSeasonReport();
  },

  /** The table's rows, in the order the chosen column asks for. */
  seasonSortedRows(totals, nameOf) {
    const key = this._seasonSort || 'netrate';
    const cols = this.seasonColumns();
    const col = cols.find(c => c.key === key) || cols.find(c => c.key === 'netrate');
    const flip = (col.desc ? -1 : 1) * (this._seasonSortReversed ? -1 : 1);

    return [...totals.values()].sort((a, b) => {
      const x = col.get(a, nameOf(a.playerId));
      const y = col.get(b, nameOf(b.playerId));

      // A player with no rate has never been on the pitch. They sink
      // whichever way the column is pointed rather than topping it: absent is
      // not the same as best, and it is not the same as worst either.
      const xn = x == null, yn = y == null;
      if (xn || yn) {
        if (xn && yn) return String(nameOf(a.playerId)).localeCompare(String(nameOf(b.playerId)));
        return xn ? 1 : -1;
      }

      if (col.text) return flip * String(x).localeCompare(String(y));
      if (x !== y) return flip * (x - y);
      // A tie falls back to the name, so the order does not shuffle between
      // redraws.
      return String(nameOf(a.playerId)).localeCompare(String(nameOf(b.playerId)));
    });
  },

  /** The whole report. */
  renderSeasonReport() {
    const esc = v => this.seasonEsc(v);
    if (this._seasonError) {
      return `<p class="text-danger" style="padding:14px;">${esc(this._seasonError)}</p>`;
    }
    const matches = this._seasonMatches || [];
    if (matches.length === 0) {
      return `<p class="text-muted" style="padding:14px;">
        No matches have been tracked yet. Open a fixture&rsquo;s
        <strong>&plusmn; Plus/Minus</strong> from the schedule to start one.</p>`;
    }

    const full = this.seasonFullMatchMinutes();
    const totals = window.seasonStats.seasonTotals(matches, full);
    const nameOf = id => {
      const p = (this.data.players || []).find(x => String(x.id) === String(id));
      return p ? p.name : 'Unknown player';
    };
    const numberOf = id => {
      const p = (this.data.players || []).find(x => String(x.id) === String(id));
      return p && p.number != null ? p.number : null;
    };

    // Sorted by whichever heading was last clicked, defaulting to the rate:
    // that is the comparison the report exists to make, since raw totals
    // mostly measure who got picked.
    const rows = this.seasonSortedRows(totals, nameOf);
    const active = this._seasonSort || 'netrate';

    const table = `
      <div style="overflow-x:auto;">
      <table class="data-table season-table">
        <thead><tr>${this.seasonColumns().map(col => {
          const on = col.key === active;
          // The arrow shows the order in force, not merely that a column is
          // the sorted one.
          const desc = col.desc !== !!this._seasonSortReversed;
          const arrow = on ? (desc ? ' ▼' : ' ▲') : '';
          // The two rate columns say what they are a rate OF, since "Net" and
          // "Net / 80" side by side are otherwise the same word twice.
          const label = col.key === 'netrate' || col.key === 'gdrate'
            ? `${col.label} / ${full}` : col.label;
          return `<th class="sortable${col.text ? ' col-text' : ''}${on ? ' sorted' : ''}"
                      title="Sort by ${label.replace(/&minus;/g, 'minus')}"
                      onclick="app.setSeasonSort('${col.key}')">${label}${arrow}</th>`;
        }).join('')}</tr></thead>
        <tbody>
          ${rows.map(t => `
            <tr>
              <td>${numberOf(t.playerId) != null
                    ? `<span class="season-num">${esc(numberOf(t.playerId))}</span> ` : ''}${esc(nameOf(t.playerId))}</td>
              <td>${t.appearances}</td>
              <td>${Math.round(t.minutes)}</td>
              <td>${t.plus}</td>
              <td>${t.minus}</td>
              <td>${t.score > 0 ? '+' : ''}${t.score}</td>
              <td>${t.goalDiff > 0 ? '+' : ''}${t.goalDiff}</td>
              <td class="season-rate">${this.seasonRate(t.scorePerMatch)}</td>
              <td class="season-rate">${this.seasonRate(t.goalDiffPerMatch)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>`;

    const blocks = rows.map(t => {
      const points = window.seasonStats.seasonSeries(matches, t.playerId, full);
      if (points.length === 0) return '';
      const trend = window.seasonStats.seasonTrend(points, 'scorePerMatchToDate');
      const arrow = trend === 'up' ? '▲ improving'
                  : trend === 'down' ? '▼ falling'
                  : trend === 'flat' ? '▬ steady'
                  : `${points.length} appearance${points.length === 1 ? '' : 's'} &mdash; too few to call`;
      return `
        <div class="season-block">
          <div class="season-block-head">
            <strong>${numberOf(t.playerId) != null
                       ? `<span class="season-num">${esc(numberOf(t.playerId))}</span> ` : ''}${esc(nameOf(t.playerId))}</strong>
            <span class="season-trend season-trend-${trend || 'none'}">${arrow}</span>
            <span class="text-muted">${Math.round(t.minutes)} min over ${t.appearances} app${t.appearances === 1 ? '' : 's'}</span>
          </div>
          <div class="season-charts">
            <figure>
              <figcaption>Net score per ${full} min</figcaption>
              ${this.renderSeasonChart(points, 'scorePerMatch', 'scorePerMatchToDate', 'Net score')}
            </figure>
            <figure>
              <figcaption>Goal differential per ${full} min</figcaption>
              ${this.renderSeasonChart(points, 'goalDiffPerMatch', 'goalDiffPerMatchToDate', 'Goal differential')}
            </figure>
          </div>
        </div>`;
    }).join('');

    return `
      <p class="text-muted" style="font-size:0.82rem; margin:0 0 12px;">
        ${matches.length} tracked match${matches.length === 1 ? '' : 'es'}.
        Every rate is per ${full} minutes &mdash; a full match for this team &mdash;
        so a substitute and a starter compare directly.
        Dots are single matches, sized by how long the player was on;
        the line is their running rate for the season, which steadies as minutes build up.
      </p>
      ${table}
      <h4 style="margin:22px 0 10px; color:#FFF;">Player by player</h4>
      ${blocks || '<p class="text-muted">Nobody has been on the pitch yet.</p>'}`;
  },

  /** Open the report, loading it first. */
  async openSeasonReport() {
    const modal = document.getElementById('seasonReportModal');
    const body = document.getElementById('seasonReportBody');
    if (!modal || !body) return;

    body.innerHTML = '<p class="text-muted" style="padding:14px;">Reading the season&hellip;</p>';
    modal.style.display = '';
    modal.classList.add('active');

    await this.loadSeasonStats();
    body.innerHTML = this.renderSeasonReport();
  }
});
