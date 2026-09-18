/**
 * The squad report, taken off the screen.
 *
 * One sheet per exercise, because the columns differ by measure: a timed
 * exercise reports a best figure against a standard, a W/D/L one a record.
 * Flattening both into one sheet would put times and records in one column.
 *
 * As with every other export here, the rows arrive in the order the coach
 * sorted them and are never re-sorted.
 */
import { describe, it, expect } from 'vitest';
import { squadReportSheets, buildSquadReportPrintDocument } from './squad-report-export';

const ROWS = [
  {
    drill: { id: 'd1', name: '3-430' },
    timed: true, outcomes: false, threshold: true, standard: 270, shortCount: 1,
    entries: [
      { player: { id: 'p1', name: 'Cesar Alva' }, attempts: 2, best: 250, avg: 255, record: null, short: false },
      { player: { id: 'p2', name: 'Tom Budde' }, attempts: 1, best: 290, avg: 290, record: null, short: true },
      { player: { id: 'p3', name: 'Alain Renteria' }, attempts: 0, best: null, avg: null, record: null, short: false }
    ]
  },
  {
    drill: { id: 'd2', name: 'Flying Fours' },
    timed: false, outcomes: true, threshold: false, standard: null, shortCount: 0,
    entries: [
      { player: { id: 'p1', name: 'Cesar Alva' }, attempts: 3, best: null, record: '1 - 1 - 1', short: false },
      { player: { id: 'p3', name: 'Alain Renteria' }, attempts: 0, best: null, record: '—', short: false }
    ]
  }
];

const OPTS = { organization: 'Beaumont High School', team: 'Varsity', rows: ROWS };

describe('squadReportSheets', () => {
  it('writes one sheet per exercise, named for it', () => {
    expect(squadReportSheets(OPTS).map(s => s.name)).toEqual(['3-430', 'Flying Fours']);
  });

  it('reports a timed exercise as attempts, best and the standard', () => {
    expect(squadReportSheets(OPTS)[0].rows).toEqual([
      { Player: 'Cesar Alva', Attempts: 2, Best: '4:10', Avg: '4:15', Standard: '4:30', Short: '' },
      { Player: 'Tom Budde', Attempts: 1, Best: '4:50', Avg: '4:50', Standard: '4:30', Short: '△ short' },
      { Player: 'Alain Renteria', Attempts: 0, Best: '—', Avg: '—', Standard: '4:30', Short: '' }
    ]);
  });

  it('reports a W/D/L exercise as games and a record, with no standard columns', () => {
    expect(squadReportSheets(OPTS)[1].rows).toEqual([
      { Player: 'Cesar Alva', Games: 3, 'W-D-L': '1 - 1 - 1' },
      { Player: 'Alain Renteria', Games: 0, 'W-D-L': '—' }
    ]);
  });

  it('writes a counted exercise as a plain figure and no standard', () => {
    const counted = [{
      drill: { id: 'd3', name: 'Coopers' },
      timed: false, outcomes: false, threshold: false, standard: null, shortCount: 0,
      entries: [{ player: { id: 'p1', name: 'Cesar Alva' }, attempts: 1, best: 2800, record: null, short: false }]
    }];
    expect(squadReportSheets({ ...OPTS, rows: counted })[0].rows)
      .toEqual([{ Player: 'Cesar Alva', Attempts: 1, Best: '2800' }]);
  });

  it('trims a sheet name Excel would refuse', () => {
    const awkward = [{ ...ROWS[0], drill: { id: 'd4', name: '3-430 / laps [timed] on a very long Tuesday name' } }];
    const name = squadReportSheets({ ...OPTS, rows: awkward })[0].name;
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[:\\/?*\[\]]/);
  });

  it('is empty when there is nothing recorded', () => {
    expect(squadReportSheets({ ...OPTS, rows: [] })).toEqual([]);
  });
});

describe('buildSquadReportPrintDocument', () => {
  it('returns nothing to print when there is nothing recorded', () => {
    expect(buildSquadReportPrintDocument({ ...OPTS, rows: [] })).toBeNull();
  });

  it('prints every exercise, in the order shown, under one heading', () => {
    const html = buildSquadReportPrintDocument(OPTS)!;
    expect(html).toContain('Squad report');
    expect(html).toContain('Beaumont High School');
    expect(html.indexOf('3-430')).toBeLessThan(html.indexOf('Flying Fours'));
    expect(html).toContain('Cesar Alva');
  });

  it('carries the standard and how many are short of it', () => {
    const html = buildSquadReportPrintDocument(OPTS)!;
    expect(html).toContain('standard 4:30');
    expect(html).toContain('1 short of the standard');
  });

  it('is a complete document, and escapes what a coach typed', () => {
    const html = buildSquadReportPrintDocument({
      ...OPTS, rows: [{ ...ROWS[0], drill: { id: 'd1', name: '<script>alert(1)</script>' } }]
    })!;
    expect(html.trim().startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('the progress graphs', () => {
  // The screen's timed section carries each player's readings, oldest first,
  // and the range every graph in the exercise shares.
  const timed = {
    ...ROWS[0],
    range: { min: 250, max: 290 },
    entries: [
      { ...ROWS[0].entries[0], progress: [260, 250] },
      { ...ROWS[0].entries[1], progress: [290] },
      { ...ROWS[0].entries[2], progress: [] }
    ]
  };
  const opts = { ...OPTS, rows: [timed, ROWS[1]] };

  it('are printed, one per player who has a reading', () => {
    const html = buildSquadReportPrintDocument(opts)!;
    expect(html).toContain('<th>Progress</th>');
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Improving — 4:20 to 4:10 across 2 readings"');
    expect(html).toContain('aria-label="One reading: 4:50"');
  });

  it('print a dash for a player with no readings, who stays in the table', () => {
    const html = buildSquadReportPrintDocument(opts)!;
    const renteria = html.split('<tr>').find(r => r.includes('Alain Renteria'))!;
    // Best, Avg, Progress, then an empty Short.
    expect(renteria).toContain('<td>—</td><td>—</td><td>—</td><td></td>');
  });

  it('print the standard across each graph', () => {
    expect(buildSquadReportPrintDocument(opts)!).toContain('stroke-dasharray');
  });

  it('are left out of a W/D/L section', () => {
    const html = buildSquadReportPrintDocument(opts)!;
    const flying = html.slice(html.indexOf('Flying Fours'));
    expect(flying).not.toContain('Progress');
  });

  it('are left out of the spreadsheet, which stays figures', () => {
    expect(Object.keys(squadReportSheets(opts)[0].rows[0])).not.toContain('Progress');
  });
});

describe('the printed columns', () => {
  it('print a timed exercise as best, average, progress and who is short', () => {
    const html = buildSquadReportPrintDocument(OPTS)!;
    const laps = html.slice(html.indexOf('3-430'), html.indexOf('Flying Fours'));
    const heads = [...laps.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);
    expect(heads).toEqual(['Player', 'Attempts', 'Best', 'Avg', 'Progress', 'Short']);
  });

  it('leave the standard to the line under the heading, not a column', () => {
    const html = buildSquadReportPrintDocument(OPTS)!;
    expect(html).not.toContain('<th>Standard</th>');
    expect(html).toContain('standard 4:30 — 1 short of the standard');
  });

  it('print the average as the screen shows it', () => {
    const html = buildSquadReportPrintDocument(OPTS)!;
    const alva = html.split('<tr>').find(r => r.includes('Cesar Alva'))!;
    expect(alva).toContain('<td>4:10</td><td>4:15</td>');
  });

  it('keep the standard in the spreadsheet', () => {
    expect(Object.keys(squadReportSheets(OPTS)[0].rows[0]))
      .toEqual(['Player', 'Attempts', 'Best', 'Avg', 'Standard', 'Short']);
  });
});

describe('the printed page', () => {
  it('sizes each table to its contents rather than the page', () => {
    expect(buildSquadReportPrintDocument(OPTS)!).toMatch(/table \{ width: auto;/);
  });
});
