/**
 * BHS Soccer — player progress report.
 *
 * One block per player, with a small chart per exercise showing their result
 * at each session. The question it answers is the one the squad report cannot:
 * not "who is fastest" but "is this player getting better".
 *
 * Which way is better depends on the exercise, and getting it wrong inverts
 * the meaning of every chart: on a timed run a falling line is improvement, on
 * a counted exercise it is decline. That distinction is carried explicitly
 * rather than inferred from the numbers.
 *
 * The charts are inline SVG. No library: it is a few dozen lines, it prints at
 * any size without going fuzzy, and adding a charting dependency to an app
 * whose only dependency is the database client is a poor trade for one screen.
 *
 * Classic script — no imports. Extends the prototype from app.core.js, so
 * index.html must load this after it.
 */

Object.assign(BHSSoccerApp.prototype, {

  /** Lower is better for a time; higher is better for anything counted. */
  progressLowerIsBetter(measure) {
    return measure === 'time_low' || measure === 'time_bands';
  },

  /**
   * One player's results for one exercise, oldest first.
   *
   * Only sessions they actually took part in. An absence is not a result of
   * zero — plotting it as one would draw a cliff into the chart and make a
   * player who missed a week look like they collapsed.
   */
  progressSeries(playerId, drillId) {
    return (this._sessionHistory || [])
      .filter(r => r.playerId === playerId
        && r.drillId === drillId
        && r.attendance === 'present'
        && r.rawValue !== null && r.rawValue !== undefined && Number.isFinite(Number(r.rawValue)))
      .map(r => ({ on: r.occurredOn, value: Number(r.rawValue) }))
      .sort((a, b) => String(a.on).localeCompare(String(b.on)));
  },

  /**
   * How a series has moved, from first recorded result to last.
   *
   * Returns null for a single point: one session is not a trend, and drawing
   * an arrow next to it would assert something the data does not say.
   */
  progressTrend(series, lowerIsBetter) {
    if (!series || series.length < 2) return null;
    const first = series[0].value;
    const last = series[series.length - 1].value;
    if (first === last) return { direction: 'level', delta: 0, first, last };

    const improved = lowerIsBetter ? last < first : last > first;
    return {
      direction: improved ? 'better' : 'worse',
      delta: Math.abs(last - first),
      first, last
    };
  },

  /** Format a value the way its exercise is read. */
  progressValueLabel(value, measure) {
    if (this.progressLowerIsBetter(measure) || measure === 'time_low') {
      return window.supabaseService.formatSecondsAsTime(value);
    }
    return String(value);
  },

  /**
   * A player's blocks: one per exercise they have results for.
   *
   * Exercises with a single result are kept. The chart shows one dot and no
   * trend, which is honest — the coach can see a baseline exists and that
   * there is nothing to compare it to yet.
   */
  progressBlocksFor(playerId) {
    const drills = [];
    (this._sessionHistory || []).forEach(r => {
      if (r.playerId === playerId && drills.indexOf(r.drillId) === -1) drills.push(r.drillId);
    });

    return drills.map(drillId => {
      const drill = (this.data.drillsBank || []).find(d => d.id === drillId);
      if (!drill) return null;
      const measure = drill.measure || 'count_high';
      const series = this.progressSeries(playerId, drillId);
      if (series.length === 0) return null;

      const lowerIsBetter = this.progressLowerIsBetter(measure);
      return {
        drillId, measure, lowerIsBetter,
        name: drill.name,
        series,
        standard: measure === 'time_bands' ? this.reportStandardSeconds(drillId) : null,
        trend: this.progressTrend(series, lowerIsBetter)
      };
    }).filter(Boolean);
  },

  /** Every player who has any recorded result, in squad order. */
  buildProgressReport() {
    const seen = new Set((this._sessionHistory || []).map(r => r.playerId));
    return (this.data.players || [])
      .filter(p => !p.is_deleted && !p.isDeleted && seen.has(p.id))
      .slice()
      .sort((a, b) => {
        const na = a.recordingNumber == null ? NaN : Number(a.recordingNumber);
        const nb = b.recordingNumber == null ? NaN : Number(b.recordingNumber);
        const ga = Number.isFinite(na), gb = Number.isFinite(nb);
        // Unnumbered last: Number(null) is 0 and would lead the report.
        if (ga !== gb) return ga ? -1 : 1;
        if (ga && na !== nb) return na - nb;
        return String(a.name || '').localeCompare(String(b.name || ''));
      })
      .map(p => ({ player: p, blocks: this.progressBlocksFor(p.id) }))
      .filter(row => row.blocks.length > 0);
  },

  /**
   * Where each point sits in the box, as a fraction from 0 to 1.
   *
   * Split out from the drawing so the geometry can be tested. y is inverted
   * for a timed exercise, so a faster time sits HIGHER on the chart: a line
   * that rises means improvement whichever exercise is being read, and a coach
   * scanning twenty charts should never have to remember which way each one
   * goes.
   */
  progressPoints(block, width, height, pad) {
    const values = block.series.map(p => p.value);
    if (block.standard != null) values.push(block.standard);

    let lo = Math.min(...values);
    let hi = Math.max(...values);
    // A flat series would divide by zero; give it a band so the line sits in
    // the middle rather than on an edge.
    if (hi === lo) { lo -= 1; hi += 1; }

    const span = hi - lo;
    const usableW = width - pad * 2;
    const usableH = height - pad * 2;
    const n = block.series.length;

    const yFor = (v) => {
      const frac = (v - lo) / span;                  // 0 at the lowest value
      const good = block.lowerIsBetter ? 1 - frac : frac;
      return pad + (1 - good) * usableH;
    };

    return {
      lo, hi,
      standardY: block.standard != null ? yFor(block.standard) : null,
      points: block.series.map((p, i) => ({
        ...p,
        // A single point sits in the middle rather than hard against the left.
        x: pad + (n === 1 ? usableW / 2 : (i / (n - 1)) * usableW),
        y: yFor(p.value)
      }))
    };
  },

  /** One exercise's chart, as inline SVG. */
  renderProgressChart(block, forPrint) {
    const W = 300, H = 96, PAD = 12;
    const geo = this.progressPoints(block, W, H, PAD);
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const line = geo.points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const stroke = forPrint ? '#111' : 'var(--bhs-cyan-accent)';
    const dot = forPrint ? '#111' : 'var(--bhs-gold-accent)';
    const rule = forPrint ? '#999' : 'rgba(255,255,255,0.35)';

    const standard = geo.standardY != null
      ? `<line x1="${PAD}" y1="${geo.standardY.toFixed(1)}" x2="${W - PAD}" y2="${geo.standardY.toFixed(1)}"
              stroke="${rule}" stroke-width="1" stroke-dasharray="4 3" />
         <text x="${W - PAD}" y="${(geo.standardY - 3).toFixed(1)}" text-anchor="end"
               font-size="8" fill="${rule}">standard</text>`
      : '';

    return `
      <svg viewBox="0 0 ${W} ${H}" class="progress-chart" role="img"
           aria-label="${esc(block.name)}: ${block.series.length} result${block.series.length === 1 ? '' : 's'}">
        ${standard}
        ${geo.points.length > 1
          ? `<polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="2"
                       stroke-linejoin="round" stroke-linecap="round" />`
          : ''}
        ${geo.points.map(p => `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${dot}">
            <title>${esc(p.on)}: ${esc(this.progressValueLabel(p.value, block.measure))}</title>
          </circle>`).join('')}
        <text x="${PAD}" y="${H - 2}" font-size="8" fill="${rule}">${esc(block.series[0].on)}</text>
        ${block.series.length > 1
          ? `<text x="${W - PAD}" y="${H - 2}" text-anchor="end" font-size="8" fill="${rule}">${esc(block.series[block.series.length - 1].on)}</text>`
          : ''}
      </svg>`;
  },

  /** The words beside the chart: where they started, where they are, which way. */
  progressSummary(block) {
    const from = this.progressValueLabel(block.series[0].value, block.measure);
    const to = this.progressValueLabel(block.series[block.series.length - 1].value, block.measure);

    if (!block.trend) return `${from} · one session so far`;
    if (block.trend.direction === 'level') return `${from} → ${to} · unchanged`;

    const word = block.trend.direction === 'better' ? 'improved' : 'slower';
    // "slower" only reads correctly for a time; a counted exercise went down.
    const worse = block.lowerIsBetter ? 'slower' : 'down';
    return `${from} → ${to} · ${block.trend.direction === 'better' ? word : worse}`;
  },

  async openProgressReport() {
    this._sessionHistory = [];
    if (window.supabaseService?.isConfigured() && this.activeTeamId) {
      this._sessionHistory =
        (await window.supabaseService.fetchTeamSessionHistory(this.activeTeamId)) || [];
      await this.loadReportBands();
    }
    const body = document.getElementById('progressReportBody');
    if (body) body.innerHTML = this.renderProgressReport();
    const modal = document.getElementById('progressReportModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  renderProgressReport(forPrint) {
    const rows = this.buildProgressReport();
    if (rows.length === 0) {
      return `<p class="text-muted" style="font-size:0.88rem;">
        No session results recorded for this team yet. Record a session first, then a
        second one, and the trend appears here.</p>`;
    }
    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return rows.map(({ player, blocks }) => `
      <div class="progress-player">
        <h3>
          <span class="progress-num">${player.recordingNumber != null ? esc(player.recordingNumber) : '—'}</span>
          ${esc(player.name)}
        </h3>
        <div class="progress-blocks">
          ${blocks.map(b => `
            <div class="progress-block">
              <div class="progress-title">${esc(b.name)}</div>
              ${this.renderProgressChart(b, forPrint)}
              <div class="progress-summary ${b.trend ? 'trend-' + b.trend.direction : ''}">
                ${esc(this.progressSummary(b))}
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('');
  },

  /**
   * Print it. Its own window and stylesheet, as with the squad report: the
   * app's dark theme prints as a wall of ink.
   *
   * Not squeezed onto one sheet — unlike the lineup card, this is a document
   * you read through rather than a card handed over, and a squad of
   * twenty-five legitimately runs to several pages. Each player is kept whole
   * on a page instead.
   */
  printProgressReport() {
    const rows = this.buildProgressReport();
    if (rows.length === 0) {
      window.alert('No session results recorded for this team yet.');
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
      <title>Progress — ${esc(label.team || 'Team')}</title>
      <style>
        @page { margin: 12mm; }
        body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; color: #111; }
        h1 { font-size: 17pt; margin: 0; }
        .sub { color: #555; font-size: 9pt; margin: 2px 0 14px 0; }
        /* A player never splits across a page — half a trend is worse than a
           page with space left on it. */
        .progress-player { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14px; }
        .progress-player h3 {
          font-size: 11pt; margin: 0 0 4px 0;
          border-bottom: 1px solid #111; padding-bottom: 2px;
        }
        .progress-num { color: #666; margin-right: 6px; font-variant-numeric: tabular-nums; }
        .progress-blocks { display: flex; flex-wrap: wrap; gap: 14px; }
        .progress-block { width: 300px; }
        .progress-title { font-size: 8pt; text-transform: uppercase; color: #555; }
        .progress-chart { width: 300px; height: 96px; }
        .progress-summary { font-size: 9pt; color: #333; }
      </style></head><body>
      <h1>${esc(label.org || '')} ${esc(label.team || '')} &mdash; Player Progress</h1>
      <div class="sub">${esc(label.season || '')} &middot; ${new Date().toLocaleDateString()}</div>
      ${this.renderProgressReport(true)}
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

});
