/**
 * The reports group: round robin, season, progress, squad report and
 * recording numbers.
 *
 * Held in one file because each module is a handful of functions and they
 * share no state; splitting them five ways would be five headers over three
 * assertions each.
 */
import { describe, it, expect } from 'vitest';
import {
  roundRobinLabel, roundRobinPlayers, roundRobinPlayed,
  roundRobinResultText, buildRoundRobin, roundRobinCsv
} from './round-robin';
import { seasonEsc, seasonFullMatchMinutes, seasonColumns } from './season';
import { progressLowerIsBetter, progressSeries, progressTrend } from './progress';
import { reportStandardSeconds } from './report';
import {
  rosterForNumbering, suggestedNumberStart, proposeRecordingNumbers
} from './recording-numbers';

const player = (id: string, name: string, recordingNumber: any = null) =>
  ({ id, name, recordingNumber });

// ── Round robin ────────────────────────────────────────────────────────────

describe('roundRobinLabel', () => {
  it('reads as the sheet does: number, first name, surname initial', () => {
    expect(roundRobinLabel(player('p1', 'Cesar Alva', 7))).toBe('(7) Cesar A.');
  });

  it('shows a dash for a player with no number', () => {
    expect(roundRobinLabel(player('p1', 'Cesar Alva'))).toBe('(—) Cesar A.');
  });

  it('prefers the split name columns when they exist', () => {
    expect(roundRobinLabel({ id: 'p1', name: 'ignored', firstName: 'Tom', lastName: 'Budde', recordingNumber: 4 }))
      .toBe('(4) Tom B.');
  });

  it('copes with a single-word name', () => {
    expect(roundRobinLabel(player('p1', 'Ronaldinho', 10))).toBe('(10) Ronaldinho');
  });

  it('is empty for no player', () => {
    expect(roundRobinLabel(null)).toBe('');
  });
});

describe('roundRobinPlayed', () => {
  it('keys on the unordered pair, so either direction is found', () => {
    // "p4 beat p3" is the same fixture as "p3 v p4".
    const played = roundRobinPlayed([{ player_a_id: 'p4', player_b_id: 'p3', outcome: 'a' }]);
    expect(played['p3|p4']).toBeTruthy();
  });

  it('reads the camelCase columns too', () => {
    expect(roundRobinPlayed([{ playerAId: 'a', playerBId: 'b', outcome: 'draw' }])['a|b'])
      .toBeTruthy();
  });

  it('ignores a deleted log and a half-filled pair', () => {
    expect(roundRobinPlayed([
      { player_a_id: 'a', player_b_id: 'b', is_deleted: true },
      { player_a_id: 'c', player_b_id: null }
    ])).toEqual({});
  });
});

describe('roundRobinResultText', () => {
  const a = player('p1', 'Cesar Alva', 7);
  const b = player('p2', 'Tom Budde', 4);

  it('names the winner even when the log stored the pair the other way round', () => {
    expect(roundRobinResultText(a, b, { a: 'p2', b: 'p1', outcome: 'a' }))
      .toBe('(4) Tom B. won');
  });

  it('says Draw', () => {
    expect(roundRobinResultText(a, b, { a: 'p1', b: 'p2', outcome: 'draw' })).toBe('Draw');
  });

  it('is empty with no result', () => {
    expect(roundRobinResultText(a, b, null)).toBe('');
  });
});

describe('buildRoundRobin', () => {
  const four = [player('p1', 'A', 1), player('p2', 'B', 2), player('p3', 'C', 3), player('p4', 'D', 4)];

  it('needs at least two players', () => {
    expect(buildRoundRobin([player('p1', 'A', 1)], [])).toEqual([]);
    expect(buildRoundRobin([], [])).toEqual([]);
  });

  it('runs one fewer round than there are players, for an even squad', () => {
    expect(buildRoundRobin(four, [])).toHaveLength(3);
  });

  it('pairs every player exactly once against every other', () => {
    const seen = new Set<string>();
    for (const r of buildRoundRobin(four, [])) {
      for (const m of r.matches) {
        if (m.bye) continue;
        seen.add([m.a.id, m.b.id].sort().join('|'));
      }
    }
    // Four players: six distinct pairings.
    expect(seen.size).toBe(6);
  });

  it('never puts a player in two matches in one round', () => {
    for (const r of buildRoundRobin(four, [])) {
      const ids = r.matches.flatMap(m => m.bye ? [m.a.id] : [m.a.id, m.b.id]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('never pairs a player with themselves', () => {
    for (const r of buildRoundRobin(four, [])) {
      for (const m of r.matches) {
        if (!m.bye) expect(m.a.id).not.toBe(m.b.id);
      }
    }
  });

  it('gives an odd squad exactly one bye per round, and never twice to one player', () => {
    const five = four.concat([player('p5', 'E', 5)]);
    const byes: string[] = [];
    for (const r of buildRoundRobin(five, [])) {
      const inRound = r.matches.filter(m => m.bye);
      expect(inRound).toHaveLength(1);
      byes.push(inRound[0].a.id);
    }
    expect(new Set(byes).size).toBe(byes.length);
  });

  it('marks a pairing already played, and carries its result', () => {
    const rounds = buildRoundRobin(four, [
      { player_a_id: 'p1', player_b_id: 'p2', outcome: 'a' }
    ]);
    const hit = rounds.flatMap(r => r.matches)
      .find(m => !m.bye && [m.a.id, m.b.id].sort().join('|') === 'p1|p2');
    expect(hit.played).toBe(true);
    expect(hit.result).toContain('won');
  });
});

describe('roundRobinCsv', () => {
  const rounds = buildRoundRobin(
    [player('p1', 'Cesar Alva', 1), player('p2', 'Tom Budde', 2)], []);

  it('has a header and one row per match', () => {
    const lines = roundRobinCsv(rounds).trim().split('\n');
    expect(lines[0]).toBe('Round,Match,PlayerA,PlayerAName,PlayerB,PlayerBName,Result');
    expect(lines).toHaveLength(2);
  });

  it('carries both the sheet label and the full name', () => {
    const csv = roundRobinCsv(rounds);
    expect(csv).toContain('(1) Cesar A.');
    expect(csv).toContain('Cesar Alva');
  });

  it('doubles a quote inside a value rather than breaking the row', () => {
    const odd = buildRoundRobin(
      [player('p1', 'A "Ace" B', 1), player('p2', 'C D', 2)], []);
    expect(roundRobinCsv(odd)).toContain('""Ace""');
  });

  it('writes BYE for the empty side', () => {
    const three = buildRoundRobin(
      [player('p1', 'A', 1), player('p2', 'B', 2), player('p3', 'C', 3)], []);
    expect(roundRobinCsv(three)).toContain('BYE');
  });
});

// ── Season ─────────────────────────────────────────────────────────────────

describe('season', () => {
  it('escapes the four characters that would break the markup', () => {
    expect(seasonEsc('a & b < c > d "e"'))
      .toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });

  it('treats null as an empty string', () => {
    expect(seasonEsc(null)).toBe('');
  });

  it('reads the match length from the active team', () => {
    const teams = [{ id: 't1', match_minutes: 70 }, { id: 't2', match_minutes: 80 }];
    expect(seasonFullMatchMinutes(teams, 't1')).toBe(70);
  });

  it('falls back to the default when the team says nothing usable', () => {
    const fallback = seasonFullMatchMinutes([], 'nothing');
    expect(fallback).toBeGreaterThan(0);
    expect(seasonFullMatchMinutes([{ id: 't1', match_minutes: 0 }], 't1')).toBe(fallback);
    expect(seasonFullMatchMinutes([{ id: 't1', match_minutes: null }], 't1')).toBe(fallback);
  });

  it('offers the nine columns the report draws', () => {
    expect(seasonColumns().map(c => c.key)).toEqual(
      ['player', 'apps', 'mins', 'plus', 'minus', 'net', 'gd', 'netrate', 'gdrate']);
  });
});

// ── Progress ───────────────────────────────────────────────────────────────

describe('progress', () => {
  const history = [
    { playerId: 'p1', drillId: 'd1', attendance: 'present', rawValue: 200, occurredOn: '2026-09-01' },
    { playerId: 'p1', drillId: 'd1', attendance: 'present', rawValue: 180, occurredOn: '2026-09-08' },
    { playerId: 'p1', drillId: 'd1', attendance: 'unexcused', rawValue: null, occurredOn: '2026-09-15' },
    { playerId: 'p2', drillId: 'd1', attendance: 'present', rawValue: 300, occurredOn: '2026-09-01' }
  ];

  it('knows a faster time is better and a higher count is', () => {
    expect(progressLowerIsBetter('time_low')).toBe(true);
    expect(progressLowerIsBetter('time_bands')).toBe(true);
    expect(progressLowerIsBetter('count_high')).toBe(false);
  });

  it('returns one player\'s readings for one exercise, oldest first', () => {
    expect(progressSeries(history, 'p1', 'd1').map(s => s.value)).toEqual([200, 180]);
  });

  it('drops an absence rather than plotting it as zero', () => {
    // A session a player missed is not a result of nothing.
    expect(progressSeries(history, 'p1', 'd1')).toHaveLength(2);
  });

  it('is empty for a player with no readings', () => {
    expect(progressSeries(history, 'nobody', 'd1')).toEqual([]);
  });

  it('calls a falling time an improvement', () => {
    const t = progressTrend([{ on: 'a', value: 200 }, { on: 'b', value: 180 }], true);
    expect(t.direction).toBe('better');
    expect(t.delta).toBe(20);
  });

  it('calls the same fall a decline for a counted exercise', () => {
    expect(progressTrend([{ on: 'a', value: 200 }, { on: 'b', value: 180 }], false).direction)
      .toBe('worse');
  });

  it('reports level when nothing changed', () => {
    expect(progressTrend([{ on: 'a', value: 5 }, { on: 'b', value: 5 }], false).direction)
      .toBe('level');
  });

  it('gives no verdict on a single reading', () => {
    // One result is not a trend.
    expect(progressTrend([{ on: 'a', value: 5 }], false)).toBeNull();
    expect(progressTrend([], false)).toBeNull();
  });
});

// ── Squad report ───────────────────────────────────────────────────────────

describe('reportStandardSeconds', () => {
  it('takes the fastest band as the standard', () => {
    expect(reportStandardSeconds(
      { d1: [{ max_seconds: 300 }, { max_seconds: 240 }] }, 'd1')).toBe(240);
  });

  it('is null when no bands are set', () => {
    // The exercise is not counted for this squad, not failed by everyone.
    expect(reportStandardSeconds({}, 'd1')).toBeNull();
    expect(reportStandardSeconds({ d1: [] }, 'd1')).toBeNull();
  });
});

// ── Recording numbers ──────────────────────────────────────────────────────

describe('recording numbers', () => {
  const roster = [
    { id: 'p1', name: 'Cesar Alva', lastName: 'Alva', recordingNumber: null },
    { id: 'p2', name: 'Tom Budde', lastName: 'Budde', recordingNumber: null },
    { id: 'p3', name: 'Alain Renteria', lastName: 'Renteria', recordingNumber: null }
  ];

  it('omits deleted players from the roster it numbers', () => {
    expect(rosterForNumbering(roster.concat([{ id: 'x', name: 'Gone', is_deleted: true } as any])))
      .toHaveLength(3);
  });

  it('numbers in surname order from the given start', () => {
    const out = proposeRecordingNumbers(roster, 10);
    expect(out.get('p1')).toBe(10);   // Alva
    expect(out.get('p2')).toBe(11);   // Budde
    expect(out.get('p3')).toBe(12);   // Renteria
  });

  /**
   * The rule the whole feature turns on: numbers are assigned by the coach in
   * a block per squad, and the paper sheets carry them through a season. A
   * number that changed on its own would disagree with every sheet already
   * written.
   */
  it('never renumbers a player who already has one', () => {
    const mixed = [
      { id: 'p1', name: 'Cesar Alva', lastName: 'Alva', recordingNumber: 47 },
      { id: 'p2', name: 'Tom Budde', lastName: 'Budde', recordingNumber: null }
    ];
    expect(proposeRecordingNumbers(mixed, 1).get('p1')).toBe(47);
  });

  it('proposes without touching the roster it was given', () => {
    const before = JSON.parse(JSON.stringify(roster));
    proposeRecordingNumbers(roster, 5);
    expect(roster).toEqual(before);
  });

  it('steps over a number already taken rather than duplicating it', () => {
    const mixed = [
      { id: 'p1', name: 'A A', lastName: 'A', recordingNumber: null },
      { id: 'p2', name: 'B B', lastName: 'B', recordingNumber: 1 },
      { id: 'p3', name: 'C C', lastName: 'C', recordingNumber: null }
    ];
    const out = proposeRecordingNumbers(mixed, 1);
    expect(new Set(Array.from(out.values())).size).toBe(3);
    expect(out.get('p2')).toBe(1);
  });

  it('starts a fresh squad at one', () => {
    expect(suggestedNumberStart(roster)).toBe(1);
  });

  it('starts an already-numbered squad at its lowest number, so a re-run does not shift the block', () => {
    expect(suggestedNumberStart([
      { id: 'p1', name: 'A', recordingNumber: 21 },
      { id: 'p2', name: 'B', recordingNumber: 25 }
    ])).toBe(21);
  });

  it('treats a start below one as one', () => {
    expect(proposeRecordingNumbers(roster, 0).get('p1')).toBe(1);
  });
});
