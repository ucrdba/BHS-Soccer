/**
 * The overall board, taken off the screen.
 *
 * The same bargain the exercise export makes: the rows arrive in the order the
 * coach sorted them and are never re-sorted, because that order is their
 * answer. A player who has taken part in nothing keeps the dash the board
 * shows rather than becoming a rank of 999 in a spreadsheet.
 */
import { describe, it, expect } from 'vitest';
import { boardSheet, buildBoardPrintDocument } from './board-export';

const ROWS = [
  { playerId: 'p1', rank: 1, name: 'Oliver Heitritter', recordingNumber: 11, exercises: 6,
    wins: 4, draws: 1, losses: 1, earned: 12.5, available: 18, share: 69.4 },
  { playerId: 'p2', rank: 2, name: 'Tom Budde', recordingNumber: 1, exercises: 5,
    wins: 2, draws: 0, losses: 3, earned: 8, available: 18, share: 44.4 },
  { playerId: 'p3', rank: 999, name: 'Newly Added', recordingNumber: null, exercises: 0,
    wins: 0, draws: 0, losses: 0, earned: 0, available: 0, share: null }
];

const OPTS = { organization: 'Beaumont High School', team: 'Varsity', rows: ROWS };

describe('boardSheet', () => {
  it('writes the board columns, in the order the coach sorted them', () => {
    expect(boardSheet(OPTS)).toEqual([
      { Rank: 1, Player: 'Oliver Heitritter', 'No': 11, Ex: 6, 'W-D-L': '4 - 1 - 1',
        Pts: '12.50', Of: '18.00', Share: '69.4%' },
      { Rank: 2, Player: 'Tom Budde', 'No': 1, Ex: 5, 'W-D-L': '2 - 0 - 3',
        Pts: '8.00', Of: '18.00', Share: '44.4%' },
      { Rank: '—', Player: 'Newly Added', 'No': '', Ex: 0, 'W-D-L': '0 - 0 - 0',
        Pts: '0.00', Of: '0.00', Share: '' }
    ]);
  });

  it('is empty for no rows, so a caller can refuse rather than write a blank file', () => {
    expect(boardSheet({ ...OPTS, rows: [] })).toEqual([]);
  });
});

describe('buildBoardPrintDocument', () => {
  it('returns nothing to print when there are no rows', () => {
    expect(buildBoardPrintDocument({ ...OPTS, rows: [] })).toBeNull();
  });

  it('names the organization and the team, and says what the board is', () => {
    const html = buildBoardPrintDocument(OPTS)!;
    expect(html).toContain('Player ratings');
    expect(html).toContain('Beaumont High School');
    expect(html).toContain('Varsity');
  });

  it('prints the rows in the order given', () => {
    const html = buildBoardPrintDocument(OPTS)!;
    expect(html.indexOf('Oliver Heitritter')).toBeLessThan(html.indexOf('Tom Budde'));
  });

  it('escapes what a coach typed', () => {
    const html = buildBoardPrintDocument({
      ...OPTS, team: '<script>alert(1)</script>'
    })!;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('is a complete document the browser can print on its own', () => {
    const html = buildBoardPrintDocument(OPTS)!;
    expect(html.trim().startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });
});
