/**
 * Time-band scoring: three laps against a standard, per squad.
 *
 * `time_low` already scores a timed exercise, but relatively -- percent_rank
 * within the session. This measure is absolute: hit 4:30 and the point is
 * yours whether six team-mates beat you or nobody did.
 *
 * The database does the scoring (0022). What the client owns is the reading
 * and writing of the standards, and the conversion between what a coach types
 * ("4:30") and what the column holds (270). Both have a way of going quietly
 * wrong: text times sort 10:00 before 4:30, and a band saved against the wrong
 * squad silently changes what another team has to beat.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';
const JV = '18c4d4b8-0c0b-413d-ab16-77f027261009';
const DRILL = 'd1111111-1111-1111-1111-111111111111';

let sent: any[];
let deleted: any[];
let bands: any[];

beforeEach(() => {
  sent = []; deleted = [];
  bands = [
    { id: 'b1', drill_id: DRILL, team_id: TEAM, max_seconds: 290, factor: 0.25 },
    { id: 'b2', drill_id: DRILL, team_id: TEAM, max_seconds: 270, factor: 1 },
    { id: 'b3', drill_id: DRILL, team_id: TEAM, max_seconds: 280, factor: 0.5 },
    { id: 'b4', drill_id: DRILL, team_id: JV,   max_seconds: 310, factor: 1 }
  ];

  svc.isConfigured = () => true;
  svc.client = {
    from() {
      let sel = bands.slice();
      const filters: Record<string, any> = {};
      const api: any = {
        select() { return api; },
        order() { return api; },
        eq(col: string, val: any) { filters[col] = val; sel = sel.filter(r => r[col] === val); return api; },
        delete() { api.__deleting = true; return api; },
        insert(rows: any[]) { rows.forEach(r => sent.push(r)); sel = rows; return api; },
        then(res: any) {
          if (api.__deleting) deleted.push({ ...filters });
          return Promise.resolve({ data: sel, error: null }).then(res);
        }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('reading a time a coach typed', () => {
  const secs = (v: string) => supabaseService.parseTimeToSeconds(v);

  it('reads mm:ss', () => {
    expect(secs('4:30')).toBe(270);
    expect(secs('4:50')).toBe(290);
    expect(secs('10:05')).toBe(605);
  });

  it('reads a bare number as seconds', () => {
    expect(secs('270')).toBe(270);
  });

  it('ignores surrounding spaces', () => {
    expect(secs('  4:30  ')).toBe(270);
  });

  it('refuses nonsense rather than storing a wrong time', () => {
    // A silently wrong time scores against the wrong band, and the standings
    // move with nothing to show for it.
    for (const bad of ['', 'fast', '4:', ':30', '4:5:6', '4:75', null, undefined]) {
      expect(secs(bad as any), String(bad)).toBeNull();
    }
  });

  it('formats seconds back for display, zero-padded', () => {
    expect(supabaseService.formatSecondsAsTime(270)).toBe('4:30');
    expect(supabaseService.formatSecondsAsTime(605)).toBe('10:05');
    expect(supabaseService.formatSecondsAsTime(65)).toBe('1:05');
  });

  it('round-trips, which is what the session grid relies on', () => {
    for (const t of ['4:30', '4:40', '4:50', '10:05']) {
      expect(supabaseService.formatSecondsAsTime(secs(t))).toBe(t);
    }
  });
});

describe('reading a squad\'s standards', () => {
  it('returns only that team\'s bands', async () => {
    // A band saved against another squad would change what they have to beat.
    const got = await supabaseService.fetchTimeBands(DRILL, TEAM);
    expect(got!.map((b: any) => b.max_seconds).sort((a: number, b: number) => a - b))
      .toEqual([270, 280, 290]);
  });

  it('orders them tightest first, as a coach reads a standard', async () => {
    const got = await supabaseService.fetchTimeBands(DRILL, TEAM);
    expect(got!.map((b: any) => b.max_seconds)).toEqual([270, 280, 290]);
    expect(got![0].factor).toBe(1);
  });

  it('returns an empty list for a squad with no standards set', async () => {
    // Not an error: that team simply does not run this exercise for points.
    bands = [];
    expect(await supabaseService.fetchTimeBands(DRILL, TEAM)).toEqual([]);
  });

  it('refuses a school code where a team id belongs', async () => {
    expect(await supabaseService.fetchTimeBands(DRILL, 'bhs')).toBeNull();
  });
});

describe('saving a squad\'s standards', () => {
  const three = [
    { time: '4:30', factor: 1 },
    { time: '4:40', factor: 0.5 },
    { time: '4:50', factor: 0.25 }
  ];

  it('stores each band as seconds against that team', async () => {
    const res = await supabaseService.saveTimeBands(DRILL, TEAM, three);
    expect(res.ok).toBe(true);
    expect(sent.map(b => b.max_seconds)).toEqual([270, 280, 290]);
    expect(sent.every(b => b.team_id === TEAM && b.drill_id === DRILL)).toBe(true);
  });

  it('replaces the previous standards rather than adding to them', async () => {
    // Editing 4:30 to 4:25 must change the standard, not create a second one.
    await supabaseService.saveTimeBands(DRILL, TEAM, three);
    expect(deleted[0]).toEqual({ drill_id: DRILL, team_id: TEAM });
  });

  it('ignores a row left entirely blank, which is the spare row in the form', async () => {
    const res = await supabaseService.saveTimeBands(DRILL, TEAM, [
      { time: '4:30', factor: 1 },
      { time: '', factor: '' }
    ]);
    expect(res.ok).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('REFUSES a half-filled row rather than silently dropping the band', async () => {
    // Points typed with no time is a band the coach meant to set. Dropping it
    // quietly would leave them believing a standard exists that does not.
    const res = await supabaseService.saveTimeBands(DRILL, TEAM, [
      { time: '4:30', factor: 1 },
      { time: '', factor: 0.5 }
    ]);
    expect(res.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('REFUSES a band whose time will not parse, naming it', async () => {
    const res = await supabaseService.saveTimeBands(DRILL, TEAM, [
      { time: '4:30', factor: 1 },
      { time: 'four forty', factor: 0.5 }
    ]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('four forty');
    expect(sent).toHaveLength(0);
  });

  it('refuses a factor outside 0 to 1', async () => {
    // The factor multiplies the drill's weight; above 1 would earn more than
    // the exercise is worth.
    const res = await supabaseService.saveTimeBands(DRILL, TEAM, [{ time: '4:30', factor: 1.5 }]);
    expect(res.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('refuses two bands at the same time, which would be ambiguous', async () => {
    const res = await supabaseService.saveTimeBands(DRILL, TEAM, [
      { time: '4:30', factor: 1 },
      { time: '4:30', factor: 0.5 }
    ]);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/twice|same|duplicate/i);
    expect(sent).toHaveLength(0);
  });

  it('clears the standards when given an empty list', async () => {
    const res = await supabaseService.saveTimeBands(DRILL, TEAM, []);
    expect(res.ok).toBe(true);
    expect(deleted).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it('refuses without a team rather than writing unscoped standards', async () => {
    const res = await supabaseService.saveTimeBands(DRILL, 'bhs', three);
    expect(res.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe('what a time would earn, shown as it is typed', () => {
  const three = [
    { max_seconds: 270, factor: 1 },
    { max_seconds: 280, factor: 0.5 },
    { max_seconds: 290, factor: 0.25 }
  ];

  it('takes the tightest band the time fits under', () => {
    // 4:28 satisfies all three; it must earn the 4:30 band, not the 4:50 one.
    expect(supabaseService.factorForTime(268, three)).toBe(1);
  });

  it('counts a time exactly on the threshold as meeting it', () => {
    // "<= 4:30" -- the coach's words. Off-by-one here is a player losing a
    // point they earned.
    expect(supabaseService.factorForTime(270, three)).toBe(1);
    expect(supabaseService.factorForTime(280, three)).toBe(0.5);
    expect(supabaseService.factorForTime(290, three)).toBe(0.25);
  });

  it('gives a time between bands the looser one', () => {
    expect(supabaseService.factorForTime(275, three)).toBe(0.5);
  });

  it('scores nothing for a time slower than every band', () => {
    expect(supabaseService.factorForTime(400, three)).toBe(0);
  });

  it('scores nothing when no standards are set', () => {
    expect(supabaseService.factorForTime(270, [])).toBe(0);
  });
});
