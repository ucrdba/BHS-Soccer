/**
 * The 1v1 round-robin generator.
 *
 * This is where the feature can go quietly wrong. A schedule that drops a
 * pairing, or plays someone twice in one round, produces a tournament that
 * looks fine on paper and is unfair in a way nobody notices until the
 * standings are already built on it.
 *
 * The circle method: fix one player, rotate the rest. Every player meets every
 * other exactly once, and each round is a set of simultaneous matches.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import rrSrc from '../../public/js/views/roundrobin.view.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, rrSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const squad = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `First${i + 1} Last${i + 1}`,
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    recordingNumber: i + 1
  }));

function makeApp(players: any[] = squad(6), logs: any[] = []): any {
  const app = Object.create(ctor.prototype);
  app.data = { players, matrixLogs: logs };
  app.activeTeamId = 'team-1';
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/** Every unordered pair in a schedule, as "a|b" with ids sorted. */
const pairsOf = (rounds: any[]) =>
  rounds.flatMap(r => r.matches
    .filter((m: any) => m.b)
    .map((m: any) => [m.a.id, m.b.id].sort().join('|')));

describe('an even squad', () => {
  it('gives every player every other exactly once', () => {
    const rounds = makeApp(squad(6)).buildRoundRobin();
    const pairs = pairsOf(rounds);
    expect(pairs.length).toBe(15);              // 6 choose 2
    expect(new Set(pairs).size).toBe(15);       // no repeats
  });

  it('uses one fewer round than there are players', () => {
    expect(makeApp(squad(6)).buildRoundRobin()).toHaveLength(5);
    expect(makeApp(squad(24)).buildRoundRobin()).toHaveLength(23);
  });

  it('plays every player once per round, never twice', () => {
    // The failure that makes a tournament unfair without looking wrong.
    for (const r of makeApp(squad(8)).buildRoundRobin()) {
      const ids = r.matches.flatMap((m: any) => [m.a.id, m.b && m.b.id]).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('scales to a full squad without dropping a pairing', () => {
    const pairs = pairsOf(makeApp(squad(24)).buildRoundRobin());
    expect(pairs.length).toBe(276);             // 24 choose 2
    expect(new Set(pairs).size).toBe(276);
  });
});

describe('an odd squad', () => {
  it('gives every player every other exactly once', () => {
    const pairs = pairsOf(makeApp(squad(7)).buildRoundRobin());
    expect(pairs.length).toBe(21);              // 7 choose 2
    expect(new Set(pairs).size).toBe(21);
  });

  it('runs as many rounds as there are players', () => {
    expect(makeApp(squad(7)).buildRoundRobin()).toHaveLength(7);
  });

  it('gives exactly one player a bye each round', () => {
    for (const r of makeApp(squad(7)).buildRoundRobin()) {
      expect(r.matches.filter((m: any) => !m.b)).toHaveLength(1);
    }
  });

  it('rotates the bye rather than resting the same player', () => {
    // Otherwise one player sits out every round and plays nobody.
    const byes = makeApp(squad(7)).buildRoundRobin()
      .map((r: any) => r.matches.find((m: any) => !m.b).a.id);
    expect(new Set(byes).size).toBe(7);
  });
});

describe('too few players', () => {
  it('produces no rounds for a squad of one', () => {
    expect(makeApp(squad(1)).buildRoundRobin()).toEqual([]);
  });

  it('produces no rounds for an empty squad', () => {
    expect(makeApp([]).buildRoundRobin()).toEqual([]);
  });

  it('produces a single match for two players', () => {
    const rounds = makeApp(squad(2)).buildRoundRobin();
    expect(rounds).toHaveLength(1);
    expect(rounds[0].matches.filter((m: any) => m.b)).toHaveLength(1);
  });
});

describe('how a player is labelled', () => {
  it('reads "(1) First1 L." — number, first name, last initial', () => {
    const app = makeApp();
    expect(app.roundRobinLabel(app.data.players[0])).toBe('(1) First1 L.');
  });

  it('marks a player with no recording number rather than hiding it', () => {
    // The sheet cannot identify them, which is worth noticing before printing.
    const app = makeApp();
    expect(app.roundRobinLabel({ name: 'Zach Unassigned', firstName: 'Zach', lastName: 'Unassigned' }))
      .toBe('(—) Zach U.');
  });

  it('falls back to the full name when the parts are missing', () => {
    const app = makeApp();
    expect(app.roundRobinLabel({ name: 'Cesar Alva', recordingNumber: 3 })).toContain('Cesar');
  });
});

describe('matches already played', () => {
  const LOGS = [
    { player_a_id: 'p1', player_b_id: 'p2', outcome: 'a', is_deleted: false },
    { player_a_id: 'p4', player_b_id: 'p3', outcome: 'draw', is_deleted: false },
    { player_a_id: 'p5', player_b_id: 'p6', outcome: 'b', is_deleted: true }
  ];

  it('marks a pairing that has been played, whichever way round it was logged', () => {
    // p4 v p3 was logged in the other order; it is still that pairing.
    const rounds = makeApp(squad(6), LOGS).buildRoundRobin();
    const all = rounds.flatMap((r: any) => r.matches);
    const played = all.filter((m: any) => m.played);
    expect(played.length).toBe(2);
  });

  it('names the winner rather than just saying it was played', () => {
    const rounds = makeApp(squad(6), LOGS).buildRoundRobin();
    const m = rounds.flatMap((r: any) => r.matches)
      .find((m: any) => m.b && [m.a.id, m.b.id].sort().join('|') === 'p1|p2');
    expect(m.result).toMatch(/First1|won|draw/i);
  });

  it('records a draw as a draw', () => {
    const rounds = makeApp(squad(6), LOGS).buildRoundRobin();
    const m = rounds.flatMap((r: any) => r.matches)
      .find((m: any) => m.b && [m.a.id, m.b.id].sort().join('|') === 'p3|p4');
    expect(m.result).toMatch(/draw/i);
  });

  it('ignores a deleted result, which is no longer a played match', () => {
    const rounds = makeApp(squad(6), LOGS).buildRoundRobin();
    const m = rounds.flatMap((r: any) => r.matches)
      .find((m: any) => m.b && [m.a.id, m.b.id].sort().join('|') === 'p5|p6');
    expect(m.played).toBeFalsy();
  });
});

describe('the CSV a coach downloads', () => {
  it('has a header and one row per match', () => {
    const csv = makeApp(squad(4)).roundRobinCsv();
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('Round');
    expect(lines.length).toBe(1 + 6);           // header + 4 choose 2
  });

  it('carries both the label and the full name', () => {
    // The label is for the pitch; the full name is for anyone reading later.
    const csv = makeApp(squad(4)).roundRobinCsv();
    expect(csv).toContain('(1) First1 L.');
    expect(csv).toContain('First1 Last1');
  });

  it('quotes a name containing a comma rather than shifting every column', () => {
    const app = makeApp([
      { id: 'p1', name: 'Smith, Jr., John', firstName: 'John', lastName: 'Smith, Jr.', recordingNumber: 1 },
      { id: 'p2', name: 'Cesar Alva', firstName: 'Cesar', lastName: 'Alva', recordingNumber: 2 }
    ]);
    const line = app.roundRobinCsv().trim().split('\n')[1];
    expect(line).toContain('"');
    expect(line.split('","').length).toBeGreaterThan(1);
  });

  it('leaves the result column empty for a match not yet played', () => {
    // Empty, but still a quoted field -- a bare trailing comma is a ragged row
    // that some readers reject.
    const csv = makeApp(squad(4)).roundRobinCsv();
    expect(csv.trim().split('\n')[1].endsWith('""')).toBe(true);
  });
});
