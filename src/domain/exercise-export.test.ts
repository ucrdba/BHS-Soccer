/**
 * One exercise's leaderboard, taken off the screen.
 *
 * A coach reads the board sorted the way the question needs — fastest first
 * to pick a squad, slowest first to plan a session — and then wants that,
 * printed or in a spreadsheet. So the export takes the rows it is given, in
 * the order it is given them, and never re-sorts: the sort already happened
 * on screen and is the coach's answer, not a detail to normalise away.
 */
import { describe, it, expect } from 'vitest';
import { exerciseSheet, buildExercisePrintDocument } from './exercise-export';

const ROWS = [
  {
    playerId: 'p1', recordingNumber: 12, name: 'Ashton Lanza', timed: true,
    best: 269, avg: 275, earned: 1.5, available: 3,
    attempts: 2, metRuns: 1, shortRuns: 1, wins: 0, draws: 0, losses: 0
  },
  {
    playerId: 'p2', recordingNumber: 7, name: 'Ashton Earls', timed: true,
    best: 274, avg: 274, earned: 0.5, available: 3,
    attempts: 1, metRuns: 0, shortRuns: 1, wins: 0, draws: 0, losses: 0
  },
  {
    playerId: 'p3', recordingNumber: 10, name: 'Gael Guerrero', timed: true,
    best: null, avg: null, earned: 0, available: 3,
    attempts: 0, metRuns: 0, shortRuns: 0, wins: 0, draws: 0, losses: 0
  }
];

const OPTS = {
  exercise: '3-430',
  measure: 'time_bands',
  organization: 'Beaumont High School',
  team: 'Varsity',
  rows: ROWS
};

describe('exerciseSheet', () => {
  it('keeps the order it was given, which is the coach\'s sort', () => {
    const sheet = exerciseSheet(OPTS);
    expect(sheet.map(r => r.Player)).toEqual(['Ashton Lanza', 'Ashton Earls', 'Gael Guerrero']);

    const reversed = exerciseSheet({ ...OPTS, rows: [...ROWS].reverse() });
    expect(reversed.map(r => r.Player)).toEqual(['Gael Guerrero', 'Ashton Earls', 'Ashton Lanza']);
  });

  it('writes times as times, not as seconds', () => {
    // 269 seconds is 4:29. A spreadsheet full of raw seconds is not the
    // sheet a coach was reading.
    const sheet = exerciseSheet(OPTS);
    expect(sheet[0]['Best time']).toBe('4:29');
    expect(sheet[0].Average).toBe('4:35');
  });

  it('carries the standard verdict and how consistent it was', () => {
    const sheet = exerciseSheet(OPTS);
    expect(sheet[0].Standard).toBe('met');
    expect(sheet[0].Runs).toBe('1 of 2');
    expect(sheet[1].Standard).toBe('below');
    expect(sheet[2].Standard).toBe('no runs');
  });

  it('says nothing rather than zero for a player who never ran', () => {
    // A dash reads as "not measured". A 0:00 reads as a time he ran.
    const sheet = exerciseSheet(OPTS);
    expect(sheet[2]['Best time']).toBe('—');
    expect(sheet[2].Average).toBe('—');
  });

  it('drops the standard columns for an exercise not scored against one', () => {
    const sheet = exerciseSheet({ ...OPTS, measure: 'count_high' });
    expect(Object.keys(sheet[0])).not.toContain('Standard');
    expect(Object.keys(sheet[0])).not.toContain('Runs');
  });

  it('reports a win-loss exercise by record, having no time to report', () => {
    const sheet = exerciseSheet({
      ...OPTS,
      measure: 'win_loss',
      rows: [{ ...ROWS[0], timed: false, best: null, avg: null, wins: 3, draws: 1, losses: 2 }]
    });
    expect(sheet[0]['W-D-L']).toBe('3 - 1 - 2');
    expect(Object.keys(sheet[0])).not.toContain('Best time');
  });

  it('is empty for no rows, so a caller can refuse rather than write a blank file', () => {
    expect(exerciseSheet({ ...OPTS, rows: [] })).toEqual([]);
  });
});

describe('buildExercisePrintDocument', () => {
  it('returns nothing to print when there are no rows', () => {
    expect(buildExercisePrintDocument({ ...OPTS, rows: [] })).toBeNull();
  });

  it('names the exercise, the organization and the team', () => {
    const html = buildExercisePrintDocument(OPTS)!;
    expect(html).toContain('3-430');
    expect(html).toContain('Beaumont High School');
    expect(html).toContain('Varsity');
  });

  it('prints the rows in the order given', () => {
    const html = buildExercisePrintDocument(OPTS)!;
    expect(html.indexOf('Ashton Lanza')).toBeLessThan(html.indexOf('Gael Guerrero'));
  });

  it('says what the standard means, so a printed sheet stands alone', () => {
    // Off screen there is no summary box to explain the verdict column.
    const html = buildExercisePrintDocument(OPTS)!;
    expect(html).toMatch(/match-readiness/i);
  });

  /*
   * A player called `Rondo <3v1>` would otherwise close the cell and take the
   * rest of the page with it — the same hazard plan-print.ts escapes for.
   */
  it('escapes what a coach typed', () => {
    const html = buildExercisePrintDocument({
      ...OPTS,
      exercise: '3 Laps <fast>',
      rows: [{ ...ROWS[0], name: 'Bobby <script>alert(1)</script>' }]
    })!;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('3 Laps &lt;fast&gt;');
  });

  it('is a complete document the browser can print on its own', () => {
    const html = buildExercisePrintDocument(OPTS)!;
    expect(html.trim().startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });
});
