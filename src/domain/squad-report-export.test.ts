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
      { player: { id: 'p1', name: 'Cesar Alva' }, attempts: 2, best: 250, record: null, short: false },
      { player: { id: 'p2', name: 'Tom Budde' }, attempts: 1, best: 290, record: null, short: true },
      { player: { id: 'p3', name: 'Alain Renteria' }, attempts: 0, best: null, record: null, short: false }
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
      { Player: 'Cesar Alva', Attempts: 2, Best: '4:10', Standard: '4:30', Short: '' },
      { Player: 'Tom Budde', Attempts: 1, Best: '4:50', Standard: '4:30', Short: '△ short' },
      { Player: 'Alain Renteria', Attempts: 0, Best: '—', Standard: '4:30', Short: '' }
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
