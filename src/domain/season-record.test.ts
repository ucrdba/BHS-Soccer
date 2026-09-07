/**
 * The season record, from the score column.
 *
 * Scores are free text a coach typed, in whatever shape the sheet they copied
 * used: "BHS 3 – 1", "2-0", "3:1". Anything that cannot be read as two numbers
 * is not counted at all, because guessing at a malformed score puts a
 * fictional result in the record, and a wrong record is worse than a short one.
 */
import { describe, it, expect } from 'vitest';
import { seasonRecord, parseScore } from './season-record';

const match = (score: string, status = 'COMPLETED') => ({ status, score });

describe('seasonRecord', () => {
  it('counts a win, a draw and a loss', () => {
    const r = seasonRecord([match('3 - 1'), match('2 - 2'), match('0 - 1')]);
    expect(r.wins).toBe(1);
    expect(r.draws).toBe(1);
    expect(r.losses).toBe(1);
  });

  it('reads the hyphen, the en dash, the em dash and the colon alike', () => {
    expect(seasonRecord([
      match('3 - 1'), match('3 – 1'), match('3 — 1'), match('3:1')
    ]).wins).toBe(4);
  });

  it('reads a score with no spaces', () => {
    expect(seasonRecord([match('3-1')]).wins).toBe(1);
  });

  it('strips any leading team name, not just one organization\'s', () => {
    // The original hardcoded /BHS\s*/i, which says nothing useful about a
    // club's scoreline -- and club coaches use this application.
    expect(seasonRecord([match('BHS 3 - 1')]).wins).toBe(1);
    expect(seasonRecord([match('LEGENDS FC 3 - 1')]).wins).toBe(1);
  });

  it('counts goals for and against', () => {
    const r = seasonRecord([match('3 - 1'), match('2 - 0')]);
    expect(r.goalsFor).toBe(5);
    expect(r.goalsAgainst).toBe(1);
  });

  it('counts a clean sheet only when nothing was conceded', () => {
    expect(seasonRecord([match('2 - 0'), match('2 - 1')]).cleanSheets).toBe(1);
  });

  it('counts a goalless draw as a clean sheet', () => {
    expect(seasonRecord([match('0 - 0')]).cleanSheets).toBe(1);
  });

  it('ignores a fixture that is not completed', () => {
    expect(seasonRecord([match('3 - 1', 'SCHEDULED')]).gamesPlayed).toBe(0);
  });

  it('ignores a completed fixture with no score', () => {
    expect(seasonRecord([{ status: 'COMPLETED', score: '' }]).gamesPlayed).toBe(0);
  });

  it('ignores a score it cannot read as two numbers', () => {
    expect(seasonRecord([match('postponed')]).gamesPlayed).toBe(0);
    expect(seasonRecord([match('3')]).gamesPlayed).toBe(0);
  });

  it('does not throw on a null row or a missing schedule', () => {
    expect(() => seasonRecord([null as any])).not.toThrow();
    expect(() => seasonRecord(undefined as any)).not.toThrow();
  });

  it('reads the record as wins - losses - draws', () => {
    expect(seasonRecord([match('3 - 1'), match('0 - 1'), match('2 - 2')]).recordText)
      .toBe('1 - 1 - 1');
  });

  it('averages goals per game to two places', () => {
    expect(seasonRecord([match('3 - 1'), match('2 - 0')]).goalsPerGame).toBe('2.50');
  });

  it('reads 0.00 goals per game with nothing played, rather than dividing by zero', () => {
    const r = seasonRecord([]);
    expect(r.goalsPerGame).toBe('0.00');
    expect(r.recordText).toBe('0 - 0 - 0');
    expect(r.gamesPlayed).toBe(0);
  });

  it('counts only the fixtures it could actually read', () => {
    const r = seasonRecord([match('3 - 1'), match('postponed'), match('1 - 0')]);
    expect(r.gamesPlayed).toBe(2);
  });
});

describe('parseScore', () => {
  it('reads the two numbers whatever the separator', () => {
    expect(parseScore('3 - 1')).toEqual({ goalsFor: 3, goalsAgainst: 1 });
    expect(parseScore('3–1')).toEqual({ goalsFor: 3, goalsAgainst: 1 });
    expect(parseScore('0:2')).toEqual({ goalsFor: 0, goalsAgainst: 2 });
  });

  it('strips a leading team name rather than one organization\'s', () => {
    expect(parseScore('Legends 2-2')).toEqual({ goalsFor: 2, goalsAgainst: 2 });
  });

  it('refuses anything that does not yield two numbers', () => {
    expect(parseScore('W')).toBeNull();
    expect(parseScore('3')).toBeNull();
    expect(parseScore('')).toBeNull();
    expect(parseScore(null)).toBeNull();
  });
});
