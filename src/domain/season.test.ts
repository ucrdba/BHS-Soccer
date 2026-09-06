/**
 * The season report's columns, and how long a match is.
 *
 * `seasonFullMatchMinutes` is the reason this file matters. **A match is not
 * ninety minutes.** High school is 80 under NFHS, club age groups play
 * shorter, and every per-match rate on the report divides by this number — so
 * a hardcoded length silently rescales every figure a coach reads. It comes
 * from `teams.match_minutes`, and the fallback is a fallback for a team that
 * has not said, not an assumption about the sport.
 *
 * Ported from the agreement tests that loaded the legacy view, which go with
 * `public/js/`.
 */
import { describe, it, expect } from 'vitest';
import { seasonEsc, seasonFullMatchMinutes, seasonColumns } from './season';
import { DEFAULT_FULL_MATCH_MINUTES } from '../data/season-stats';

const teams = [
  { id: 't1', name: 'Varsity', match_minutes: 80 },
  { id: 't2', name: 'U16 Reds', match_minutes: 70 },
  { id: 't3', name: 'Unstated' }
];

describe('HOW LONG A FULL MATCH IS', () => {
  it('READS IT FROM THE TEAM', () => {
    expect(seasonFullMatchMinutes(teams, 't1')).toBe(80);
  });

  it('gives a different answer for a different team, which is the whole point', () => {
    // One organization can field teams playing different lengths.
    expect(seasonFullMatchMinutes(teams, 't2')).toBe(70);
  });

  it('compares the id as text, since it arrives from an attribute', () => {
    expect(seasonFullMatchMinutes([{ id: 5, match_minutes: 60 }], '5' as any)).toBe(60);
  });

  it('falls back only when the team has not said', () => {
    expect(seasonFullMatchMinutes(teams, 't3')).toBe(DEFAULT_FULL_MATCH_MINUTES);
  });

  it('IS NEVER NINETY by default', () => {
    // The number a reader of the code would assume, and it is wrong here.
    expect(seasonFullMatchMinutes([], 'nope')).not.toBe(90);
    expect(seasonFullMatchMinutes([], 'nope')).toBe(80);
  });

  it('ignores a zero or nonsense length rather than dividing by it', () => {
    expect(seasonFullMatchMinutes([{ id: 't1', match_minutes: 0 }], 't1'))
      .toBe(DEFAULT_FULL_MATCH_MINUTES);
    expect(seasonFullMatchMinutes([{ id: 't1', match_minutes: 'ninety' }], 't1'))
      .toBe(DEFAULT_FULL_MATCH_MINUTES);
    expect(seasonFullMatchMinutes([{ id: 't1', match_minutes: -5 }], 't1'))
      .toBe(DEFAULT_FULL_MATCH_MINUTES);
  });

  it('copes with no teams loaded yet', () => {
    expect(seasonFullMatchMinutes(null as any, 't1')).toBe(DEFAULT_FULL_MATCH_MINUTES);
  });
});

describe('escaping a value for the report', () => {
  it('escapes the five that matter, ampersand first', () => {
    // Ampersand last would double-escape everything it had just written.
    expect(seasonEsc('Tom & <b>"Jerry"</b>'))
      .toBe('Tom &amp; &lt;b&gt;&quot;Jerry&quot;&lt;/b&gt;');
  });

  it('renders null and undefined as nothing, not as the words', () => {
    expect(seasonEsc(null)).toBe('');
    expect(seasonEsc(undefined)).toBe('');
  });

  it('keeps a zero', () => {
    expect(seasonEsc(0)).toBe('0');
  });
});

describe('the report columns', () => {
  const cols = seasonColumns();
  const col = (k: string) => cols.find(c => c.key === k)!;

  it('offers minutes, so a rate is never read without them', () => {
    // Low-minute players are the audience for this report, and a rate on its
    // own hides how few minutes produced it.
    expect(col('mins')).toBeDefined();
    expect(col('mins').get({ minutes: 34 })).toBe(34);
  });

  it('sorts the player column as text and the rest descending', () => {
    expect(col('player').text).toBe(true);
    expect(col('player').desc).toBe(false);
    expect(col('apps').desc).toBe(true);
  });

  it('reads the player name through the name it is given', () => {
    expect(col('player').get({}, 'Cesar Alva')).toBe('cesar alva');
  });

  it('reads zero for a figure a player has none of, rather than blank', () => {
    expect(col('plus').get({})).toBe(0);
    expect(col('gd').get({})).toBe(0);
  });

  it('leaves a rate undefined rather than zero when there is none', () => {
    // Zero is a real rate; "no minutes to divide by" is not.
    expect(col('netrate').get({})).toBeUndefined();
  });
});
