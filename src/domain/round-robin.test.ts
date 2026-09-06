/**
 * Every player against every other, exactly once.
 *
 * The circle method — fix one seat, rotate the rest — which is what
 * guarantees no player appears twice in a round. That property is the whole
 * value of the schedule: a coach runs these on a pitch, and a player drawn
 * into two matches in the same round cannot play them.
 *
 * An odd squad gets a bye seat that rotates, so nobody sits out twice while
 * somebody else never does.
 *
 * Results are keyed on the SORTED id pair, because "p4 beat p3" is the same
 * fixture as "p3 v p4" — reading it one way round leaves half the schedule
 * looking unplayed.
 *
 * Ported from the agreement tests that loaded the legacy view.
 */
import { describe, it, expect } from 'vitest';
import {
  roundRobinLabel, roundRobinPlayers, roundRobinPlayed,
  roundRobinResultText, buildRoundRobin, roundRobinCsv
} from './round-robin';

const squad = [
  { id: 'p1', name: 'Cesar Alva', recordingNumber: 1 },
  { id: 'p2', name: 'Tom Budde', recordingNumber: 2 },
  { id: 'p3', name: 'Alex Reyes', recordingNumber: 3 },
  { id: 'p4', name: 'Sam Diaz', recordingNumber: 4 }
];

/** Every unordered pair the schedule produced. */
const pairs = (rounds: any[]) => {
  const out: string[] = [];
  rounds.forEach(r => r.matches.forEach((m: any) => {
    if (!m.bye) out.push([m.a.id, m.b.id].sort().join('|'));
  }));
  return out;
};

describe('how a player is labelled on the sheet', () => {
  it('is the recording number and a surname initial', () => {
    expect(roundRobinLabel(squad[0])).toBe('(1) Cesar A.');
  });

  it('prefers the stored first and last name over splitting the full one', () => {
    expect(roundRobinLabel({ firstName: 'Cesar', lastName: 'Alva', recordingNumber: 7 }))
      .toBe('(7) Cesar A.');
  });

  it('says so when there is no recording number, rather than printing nothing', () => {
    expect(roundRobinLabel({ name: 'Cesar Alva' })).toBe('(—) Cesar A.');
  });

  it('copes with a one-word name', () => {
    expect(roundRobinLabel({ name: 'Pelé', recordingNumber: 10 })).toBe('(10) Pelé');
  });

  it('is empty for nobody', () => {
    expect(roundRobinLabel(null)).toBe('');
  });
});

describe('who is in the draw', () => {
  it('is ordered by recording number, which is what the sheets carry', () => {
    const shuffled = [squad[2], squad[0], squad[3], squad[1]];
    expect(roundRobinPlayers(shuffled).map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('puts a player with no recording number last, not first', () => {
    const rows = [{ id: 'x', name: 'No Number' }, ...squad];
    expect(roundRobinPlayers(rows).pop()!.id).toBe('x');
  });

  it('drops a deleted player, in either spelling', () => {
    const rows = [...squad, { id: 'z', name: 'Gone', is_deleted: true }];
    expect(roundRobinPlayers(rows).map(p => p.id)).not.toContain('z');
  });

  it('does not mutate the array it was given', () => {
    const rows = [squad[2], squad[0]];
    roundRobinPlayers(rows);
    expect(rows[0].id).toBe('p3');
  });
});

describe('EVERY PLAYER MEETS EVERY OTHER EXACTLY ONCE', () => {
  it('produces every pair, with no repeats', () => {
    const all = pairs(buildRoundRobin(squad, []));
    expect(all).toHaveLength(6);            // 4 choose 2
    expect(new Set(all).size).toBe(6);
  });

  it('NEVER DRAWS A PLAYER TWICE IN ONE ROUND', () => {
    // A player in two matches of the same round cannot play them: this is the
    // property the circle method exists for.
    buildRoundRobin(squad, []).forEach(r => {
      const seen: string[] = [];
      r.matches.forEach((m: any) => {
        if (m.a) seen.push(m.a.id);
        if (m.b) seen.push(m.b.id);
      });
      expect(new Set(seen).size).toBe(seen.length);
    });
  });

  it('runs for one round fewer than there are players', () => {
    expect(buildRoundRobin(squad, [])).toHaveLength(3);
  });

  it('covers every pair for an ODD squad too', () => {
    const five = [...squad, { id: 'p5', name: 'Kai Long', recordingNumber: 5 }];
    const all = pairs(buildRoundRobin(five, []));
    expect(all).toHaveLength(10);           // 5 choose 2
    expect(new Set(all).size).toBe(10);
  });

  it('gives an odd squad a bye that ROTATES, so nobody sits out twice', () => {
    const five = [...squad, { id: 'p5', name: 'Kai Long', recordingNumber: 5 }];
    const byes = buildRoundRobin(five, [])
      .flatMap((r: any) => r.matches.filter((m: any) => m.bye).map((m: any) => m.a.id));

    expect(byes).toHaveLength(5);
    expect(new Set(byes).size).toBe(5);
  });

  it('is nothing at all below two players', () => {
    expect(buildRoundRobin([squad[0]], [])).toEqual([]);
    expect(buildRoundRobin([], [])).toEqual([]);
  });
});

describe('WHAT HAS ALREADY BEEN PLAYED', () => {
  const logs = [
    { player_a_id: 'p4', player_b_id: 'p3', outcome: 'a' },
    { player_a_id: 'p1', player_b_id: 'p2', outcome: 'draw' }
  ];

  it('MATCHES A RESULT LOGGED THE OTHER WAY ROUND', () => {
    // "p4 beat p3" is the same fixture as "p3 v p4"; reading it one way round
    // leaves half the schedule looking unplayed.
    const played = roundRobinPlayed(logs);
    expect(played['p3|p4']).toBeDefined();
  });

  it('reads the camelCase spelling too', () => {
    const played = roundRobinPlayed([{ playerAId: 'p1', playerBId: 'p2', outcome: 'a' }]);
    expect(played['p1|p2']).toBeDefined();
  });

  it('ignores a deleted log', () => {
    expect(roundRobinPlayed([{ ...logs[0], is_deleted: true }])).toEqual({});
  });

  it('ignores a log missing one of the players', () => {
    expect(roundRobinPlayed([{ player_a_id: 'p1', outcome: 'a' }])).toEqual({});
  });

  it('marks the fixture played in the schedule', () => {
    const rounds = buildRoundRobin(squad, logs);
    const all = rounds.flatMap((r: any) => r.matches);
    const p3p4 = all.find((m: any) => !m.bye && [m.a.id, m.b.id].sort().join('|') === 'p3|p4')!;

    expect(p3p4.played).toBe(true);
    expect(p3p4.result).toContain('won');
  });

  it('leaves an unplayed fixture blank rather than guessing', () => {
    const rounds = buildRoundRobin(squad, []);
    rounds.forEach((r: any) => r.matches.forEach((m: any) => {
      if (!m.bye) { expect(m.played).toBe(false); expect(m.result).toBe(''); }
    }));
  });
});

describe('naming the winner of a logged result', () => {
  const a = squad[0], b = squad[1];

  it('NAMES THE WINNER FROM THE LOGGED PAIR, not from the display order', () => {
    // outcome says which of the LOGGED pair won, and the log may have them
    // the other way round — so 'a' does not mean the left-hand player here.
    const hit = { a: 'p2', b: 'p1', outcome: 'a' };
    expect(roundRobinResultText(a, b, hit)).toContain('Tom B.');
  });

  it('says Draw', () => {
    expect(roundRobinResultText(a, b, { a: 'p1', b: 'p2', outcome: 'draw' })).toBe('Draw');
  });

  it('says nothing for a fixture with no result', () => {
    expect(roundRobinResultText(a, b, null)).toBe('');
    expect(roundRobinResultText(a, b, { a: 'p1', b: 'p2' })).toBe('');
  });
});

describe('the schedule as CSV', () => {
  const csv = roundRobinCsv(buildRoundRobin(squad, []));

  it('carries BOTH the sheet label and the full name', () => {
    // The label is what is read on the pitch; the full name is what makes the
    // file legible to anyone else.
    expect(csv.split('\n')[0])
      .toBe('Round,Match,PlayerA,PlayerAName,PlayerB,PlayerBName,Result');
    expect(csv).toContain('Cesar Alva');
    expect(csv).toContain('(1) Cesar A.');
  });

  it('has a line per match plus the header', () => {
    expect(csv.trim().split('\n')).toHaveLength(7);   // 6 matches + header
  });

  it('marks a bye as one', () => {
    const five = [...squad, { id: 'p5', name: 'Kai Long', recordingNumber: 5 }];
    expect(roundRobinCsv(buildRoundRobin(five, []))).toContain('BYE');
  });

  it('escapes a quote in a name rather than breaking the row', () => {
    const odd = [
      { id: 'a', name: 'Bob "The Wall" Smith', recordingNumber: 1 },
      { id: 'b', name: 'Al Jones', recordingNumber: 2 }
    ];
    expect(roundRobinCsv(buildRoundRobin(odd, []))).toContain('""The Wall""');
  });

  it('is just the header for an empty schedule', () => {
    expect(roundRobinCsv([]).trim().split('\n')).toHaveLength(1);
  });
});
