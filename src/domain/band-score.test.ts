/**
 * What a time earns against a squad's standards.
 *
 * This is the only scoring the browser does at all — everywhere else the
 * points come from Postgres. It exists so a coach entering times sees what
 * each one is worth as they type it, rather than after saving twenty-five
 * rows.
 *
 * Because it is a second implementation of something the database also does,
 * the agreement block at the bottom is not optional. A reading that differs
 * from the client's hands a player marks for a time they did not run.
 */
import { describe, it, expect } from 'vitest';
import { factorForTime, bandFeedback } from './band-score';
import { supabaseService } from '../data/supabase';

/** A 4:30 / 4:40 / 4:50 set, as a coach would write it. */
const BANDS = [
  { max_seconds: 270, factor: 1 },
  { max_seconds: 280, factor: 0.5 },
  { max_seconds: 290, factor: 0.25 }
];

describe('factorForTime', () => {
  it('takes the tightest band a time fits, not the loosest', () => {
    // 4:05 is under all three. Paying the 0.25 would make the standards
    // meaningless: everyone who beat the hardest one would earn the easiest.
    expect(factorForTime(245, BANDS)).toBe(1);
  });

  it('takes the next band down when the tightest is missed', () => {
    expect(factorForTime(275, BANDS)).toBe(0.5);
    expect(factorForTime(285, BANDS)).toBe(0.25);
  });

  it('counts a time exactly on a threshold as inside it', () => {
    // A standard of 4:30 means 4:30 passes. Anything else makes the published
    // number a lie by one second.
    expect(factorForTime(270, BANDS)).toBe(1);
    expect(factorForTime(290, BANDS)).toBe(0.25);
  });

  it('earns nothing for a time over every band', () => {
    // Not a failure to record — a real result that met no standard.
    expect(factorForTime(291, BANDS)).toBe(0);
  });

  it('resolves the tightest band however the rows arrive', () => {
    // fetchTimeBands sorts, but a draft being edited has not been saved yet.
    const shuffled = [BANDS[2], BANDS[0], BANDS[1]];
    expect(factorForTime(245, shuffled)).toBe(1);
  });

  it('reads numbers held as strings', () => {
    // PostgREST returns numeric columns as strings often enough to matter.
    expect(factorForTime('275', [{ max_seconds: '280', factor: '0.5' }])).toBe(0.5);
  });

  it('earns nothing rather than NaN for an unreadable time', () => {
    expect(factorForTime('quick', BANDS)).toBe(0);
  });

  it('earns nothing for an absent value, rather than the top band', () => {
    // Number(null) and Number('') are both 0, which fits under every standard.
    // Left alone, a row with no time recorded would earn full marks.
    expect(factorForTime(null, BANDS)).toBe(0);
    expect(factorForTime(undefined, BANDS)).toBe(0);
    expect(factorForTime('', BANDS)).toBe(0);
  });

  it('earns nothing when the squad has no standards set', () => {
    expect(factorForTime(245, [])).toBe(0);
  });
});

describe('bandFeedback', () => {
  it('says nothing at all for an empty box', () => {
    // Nothing typed yet is not an error, and a red hint on every blank row
    // in a twenty-five row grid is noise.
    expect(bandFeedback('', BANDS)).toEqual({ text: '', tone: 'empty' });
    expect(bandFeedback('   ', BANDS).tone).toBe('empty');
  });

  it('names an unreadable time before the save does', () => {
    // "4:5" is refused by the parser — it could be 4:05 or 4:50. Finding that
    // out at save time means re-reading a sheet of twenty-five entries.
    expect(bandFeedback('4:5', BANDS)).toEqual({ text: 'mm:ss?', tone: 'bad' });
  });

  it('says what the time earns', () => {
    expect(bandFeedback('4:35', BANDS)).toEqual({ text: 'earns 0.5', tone: 'good' });
  });

  it('distinguishes met no standard from mistyped', () => {
    // The time was read perfectly well; it simply met no band. Telling a coach
    // their entry looks wrong when the player was just slow is worse than
    // useless — they would retype a correct time.
    expect(bandFeedback('5:10', BANDS)).toEqual({ text: 'no band', tone: 'none' });
  });

  it('accepts a dot the way the rest of the app does', () => {
    // "4.30" is four minutes thirty, not four-point-three seconds.
    expect(bandFeedback('4.35', BANDS)).toEqual({ text: 'earns 0.5', tone: 'good' });
  });

  it('reads a bare number of seconds', () => {
    expect(bandFeedback('275', BANDS).text).toBe('earns 0.5');
  });

  it('does not print a factor to a silly number of places', () => {
    expect(bandFeedback('4:35', [{ max_seconds: 280, factor: 0.3333333 }]).text)
      .toBe('earns 0.33');
  });
});

describe('agreement with the Supabase client', () => {
  // src/data/supabase.ts has its own factorForTime, used when a session is
  // scored on the way in. Two readings of "the tightest band it fits" that
  // disagree would show a coach one number and store another.
  const CASES: [any, any[]][] = [
    [245, BANDS], [270, BANDS], [275, BANDS], [280, BANDS],
    [285, BANDS], [290, BANDS], [291, BANDS], [0, BANDS],
    [245, []], [null, BANDS], [undefined, BANDS], ['', BANDS], ['quick', BANDS],
    [275, [BANDS[2], BANDS[0], BANDS[1]]],
    [275, [{ max_seconds: '280', factor: '0.5' }]]
  ];

  it.each(CASES)('reads %p the same way', (seconds, bands) => {
    expect(factorForTime(seconds, bands as any))
      .toBe(supabaseService.factorForTime(seconds, bands as any));
  });
});
