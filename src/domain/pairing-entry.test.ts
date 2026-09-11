/**
 * 1v1 results, typed the way they are written on the sheet.
 *
 * A coach runs a round robin off a paper sheet printed with recording
 * numbers. Picking twenty-five pairs out of two dropdowns is slower than the
 * paper it replaces, so `1w3` means number 1 beat number 3.
 */
import { describe, it, expect } from 'vitest';
import {
  parsePairing, resolvePairing, readEntries, recordable, hasErrors,
  isParseFailure, playerByNumber, describeRecorded, type PairingParse
} from './pairing-entry';

const PLAYERS = [
  { id: 'p1', name: 'Cesar Aguilar', recordingNumber: 1 },
  { id: 'p3', name: 'Caleb Ruiz', recordingNumber: 3 },
  { id: 'p4', name: 'Dylan Pena', recordingNumber: 4 },
  { id: 'p12', name: 'Angel Reyes', recordingNumber: 12 }
];

const label = (p: any) => `(${p.recordingNumber}) ${p.name}`;
const ok = (r: any) => { expect(isParseFailure(r)).toBe(false); return r as PairingParse; };

describe('reading a line', () => {
  it('reads the winner first, then the loser', () => {
    expect(ok(parsePairing('1w3'))).toEqual({ a: 1, b: 3, tie: false });
  });

  it('reads a tie', () => {
    expect(ok(parsePairing('1t3'))).toEqual({ a: 1, b: 3, tie: true });
  });

  it('does not care about case', () => {
    expect(ok(parsePairing('1W3')).tie).toBe(false);
    expect(ok(parsePairing('1T3')).tie).toBe(true);
  });

  it('allows spaces anywhere, since they are typed under pressure', () => {
    expect(ok(parsePairing('1 w 3'))).toEqual({ a: 1, b: 3, tie: false });
    expect(ok(parsePairing('  1w 3  '))).toEqual({ a: 1, b: 3, tie: false });
    expect(ok(parsePairing('1 W  3'))).toEqual({ a: 1, b: 3, tie: false });
  });

  it('reads two-digit and three-digit numbers', () => {
    // Recording numbers are assigned by the coach in a block and are not
    // capped at nine.
    expect(ok(parsePairing('12w4'))).toEqual({ a: 12, b: 4, tie: false });
    expect(ok(parsePairing('7 t 128'))).toEqual({ a: 7, b: 128, tie: true });
  });

  it('treats a blank box as no entry rather than a mistake', () => {
    // Empty boxes sit at the end of the list the whole time it is being
    // filled in; complaining about them would fill the screen with red.
    expect(parsePairing('')).toBeNull();
    expect(parsePairing('   ')).toBeNull();
  });

  it('refuses a number against itself', () => {
    const r = parsePairing('3w3');
    expect(isParseFailure(r!)).toBe(true);
    expect((r as any).error).toMatch(/cannot play themselves/i);
  });

  /*
   * Anchored on purpose. A line that read the first pairing and dropped the
   * rest would record one result and lose the other with nothing on screen
   * to say so.
   */
  it('refuses a line with more than one result in it', () => {
    expect(isParseFailure(parsePairing('1w3 5w6')!)).toBe(true);
    expect(isParseFailure(parsePairing('1w3, 5w6')!)).toBe(true);
  });

  it('refuses anything that is not a result, and quotes it back', () => {
    const r = parsePairing('cesar beat caleb') as any;
    expect(r.error).toContain('cesar beat caleb');
    expect(r.error).toMatch(/1w3/);
  });

  it('refuses the letters that are not w or t', () => {
    // `l` for lost would invert the result silently, which is the worst
    // possible failure here.
    expect(isParseFailure(parsePairing('1l3')!)).toBe(true);
    expect(isParseFailure(parsePairing('1d3')!)).toBe(true);
    expect(isParseFailure(parsePairing('1v3')!)).toBe(true);
  });

  it('refuses a number with no opponent', () => {
    expect(isParseFailure(parsePairing('1w')!)).toBe(true);
    expect(isParseFailure(parsePairing('w3')!)).toBe(true);
    expect(isParseFailure(parsePairing('13')!)).toBe(true);
  });
});

describe('matching it to the squad', () => {
  it('finds both players by recording number', () => {
    const r = resolvePairing({ a: 1, b: 3, tie: false }, PLAYERS) as any;
    expect(r.playerA.id).toBe('p1');
    expect(r.playerB.id).toBe('p3');
  });

  /*
   * The winner is always written first, so `w` always resolves to 'a'. That
   * is what removes the separate "who won" question the dropdown form has to
   * ask, and with it the chance of answering it the wrong way round.
   */
  it('scores the first number as the winner, whichever number it is', () => {
    expect((resolvePairing({ a: 1, b: 3, tie: false }, PLAYERS) as any).outcome).toBe('a');
    expect((resolvePairing({ a: 3, b: 1, tie: false }, PLAYERS) as any).outcome).toBe('a');
  });

  it('scores a tie as a draw', () => {
    expect((resolvePairing({ a: 1, b: 3, tie: true }, PLAYERS) as any).outcome).toBe('draw');
  });

  it('keys the pairing on the unordered pair', () => {
    // "3 beat 1" is the same fixture as "1 beat 3", entered the other way.
    const one = resolvePairing({ a: 1, b: 3, tie: false }, PLAYERS) as any;
    const other = resolvePairing({ a: 3, b: 1, tie: false }, PLAYERS) as any;
    expect(one.key).toBe(other.key);
  });

  it('names the number nobody carries, which is what the coach typed', () => {
    const r = resolvePairing({ a: 1, b: 9, tie: false }, PLAYERS) as any;
    expect(r.error).toContain('9');
    expect(r.error).not.toContain('1 ');
  });

  it('names both when neither is on the squad', () => {
    const r = resolvePairing({ a: 8, b: 9, tie: false }, PLAYERS) as any;
    expect(r.error).toContain('8');
    expect(r.error).toContain('9');
  });
});

describe('reading the whole sheet', () => {
  it('reads each box back in words, so it can be checked without decoding', () => {
    const lines = readEntries(['1w3', '4t12'], PLAYERS, label);
    expect(lines[0].reading).toBe('(1) Cesar Aguilar beat (3) Caleb Ruiz');
    expect(lines[1].reading).toBe('(4) Dylan Pena tied with (12) Angel Reyes');
  });

  /*
   * Two boxes can each be valid and wrong together: each side of a pairing is
   * scored separately, so the same fixture twice counts both players twice.
   * Only reading them together catches it.
   */
  it('catches the same fixture typed twice, in either direction', () => {
    const lines = readEntries(['1w3', '3w1'], PLAYERS, label);
    expect(lines[0].error).toBeNull();
    expect(lines[1].error).toMatch(/already in one of the boxes/i);
  });

  it('blames the second box, not the first', () => {
    // The coach reads down the sheet; the mistake is where they are looking.
    const lines = readEntries(['1w3', '4w12', '1t3'], PLAYERS, label);
    expect(lines[0].error).toBeNull();
    expect(lines[2].error).toBeTruthy();
  });

  it('keeps a blank box quiet between two filled ones', () => {
    const lines = readEntries(['1w3', '', '4w12'], PLAYERS, label);
    expect(lines[1].error).toBeNull();
    expect(lines[1].resolved).toBeNull();
  });

  it('offers only the boxes that would actually be written', () => {
    const lines = readEntries(['1w3', '', 'nonsense', '4w12'], PLAYERS, label);
    expect(recordable(lines).map(l => l.text)).toEqual(['1w3', '4w12']);
  });

  it('reports that something is wrong, so a batch is not sent half-read', () => {
    expect(hasErrors(readEntries(['1w3', '4w12'], PLAYERS, label))).toBe(false);
    expect(hasErrors(readEntries(['1w3', '1w9'], PLAYERS, label))).toBe(true);
  });

  it('survives a squad with no recording numbers yet', () => {
    const lines = readEntries(['1w3'], [{ id: 'x', name: 'New', recordingNumber: null }], label);
    expect(lines[0].error).toMatch(/no player has recording number/i);
  });
});

describe('finding a player by typed number', () => {
  // The picker offers this beside the dropdown: on a squad of twenty-five,
  // typing 12 beats hunting a name down a list.
  it('finds the player carrying that recording number', () => {
    expect(playerByNumber(PLAYERS, '12').id).toBe('p12');
    expect(playerByNumber(PLAYERS, ' 3 ').id).toBe('p3');
  });

  it('is nothing for a number nobody carries', () => {
    expect(playerByNumber(PLAYERS, '99')).toBeNull();
  });

  it('is nothing for a box not filled in yet, which is not a mistake', () => {
    expect(playerByNumber(PLAYERS, '')).toBeNull();
    expect(playerByNumber(PLAYERS, '   ')).toBeNull();
  });

  it('refuses anything that is not a plain number', () => {
    // "1w3" in the number box is a pairing typed into the wrong tab, not
    // player 1.
    expect(playerByNumber(PLAYERS, '1w3')).toBeNull();
    expect(playerByNumber(PLAYERS, '3a')).toBeNull();
    expect(playerByNumber(PLAYERS, '-3')).toBeNull();
  });
});

describe('reading back what is recorded', () => {
  const LOGS = [
    { id: 'l1', drill_id: 'd1', occurred_on: '2026-09-01', player_a_id: 'p1', player_b_id: 'p3', outcome: 'a', score_text: '3-1' },
    { id: 'l2', drill_id: 'd1', occurred_on: '2026-09-08', player_a_id: 'p4', player_b_id: 'p12', outcome: 'draw', score_text: null },
    { id: 'l3', drill_id: 'd1', occurred_on: '2026-09-05', player_a_id: 'p1', player_b_id: 'p4', outcome: 'b', score_text: null }
  ];

  it('says who beat whom, whichever side is stored as the winner', () => {
    const rows = describeRecorded(LOGS, PLAYERS, label, 'd1');
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(byId.l1.reading).toBe('(1) Cesar Aguilar beat (3) Caleb Ruiz');
    expect(byId.l2.reading).toBe('(4) Dylan Pena tied with (12) Angel Reyes');
    // Stored as 'b', so the SECOND player is the winner.
    expect(byId.l3.reading).toBe('(4) Dylan Pena beat (1) Cesar Aguilar');
  });

  it('puts the newest first, which is what a coach just entered', () => {
    const rows = describeRecorded(LOGS, PLAYERS, label, 'd1');
    expect(rows.map(r => r.id)).toEqual(['l2', 'l3', 'l1']);
  });

  it('carries the id, the date and the score, so a row can be edited', () => {
    const [, , oldest] = describeRecorded(LOGS, PLAYERS, label, 'd1');
    expect(oldest.id).toBe('l1');
    expect(oldest.occurredOn).toBe('2026-09-01');
    expect(oldest.scoreText).toBe('3-1');
    expect(oldest.outcome).toBe('a');
  });

  /*
   * A pairing with no drill scores at weight 1.0 and belongs to no exercise.
   * Listing one here would offer the coach the chance to edit a result that
   * is not the one they are looking at.
   */
  it('shows only the exercise being recorded', () => {
    const mixed = LOGS.concat([
      { id: 'other', drill_id: 'd2', occurred_on: '2026-09-09', player_a_id: 'p1', player_b_id: 'p3', outcome: 'a', score_text: null },
      { id: 'none', drill_id: null, occurred_on: '2026-09-09', player_a_id: 'p1', player_b_id: 'p3', outcome: 'a', score_text: null }
    ] as any);

    expect(describeRecorded(mixed, PLAYERS, label, 'd1').map(r => r.id))
      .toEqual(['l2', 'l3', 'l1']);
  });

  it('leaves out what has been deleted', () => {
    const withDeleted = LOGS.concat([
      { id: 'gone', drill_id: 'd1', occurred_on: '2026-09-09', player_a_id: 'p1', player_b_id: 'p3', outcome: 'a', score_text: null, is_deleted: true }
    ] as any);

    expect(describeRecorded(withDeleted, PLAYERS, label, 'd1').map(r => r.id))
      .not.toContain('gone');
  });

  it('still shows a result for a player who has left the squad', () => {
    // The row is still being scored, and a coach reconciling a sheet needs to
    // see it. Only the name is missing.
    const rows = describeRecorded(
      [{ id: 'l9', drill_id: 'd1', occurred_on: '2026-09-01', player_a_id: 'gone', player_b_id: 'p3', outcome: 'a' }],
      PLAYERS, label, 'd1'
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].reading).toBe('a former player beat (3) Caleb Ruiz');
  });

  it('is empty when nothing has been recorded yet', () => {
    expect(describeRecorded([], PLAYERS, label, 'd1')).toEqual([]);
    expect(describeRecorded(null as any, PLAYERS, label, 'd1')).toEqual([]);
  });
});
