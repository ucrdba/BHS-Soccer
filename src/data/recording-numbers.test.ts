/**
 * Recording numbers — what a player writes on a paper score sheet.
 *
 * Not the shirt number. It runs 1..N over the squad, stays put all season, and
 * is unique per team in the database (0021).
 *
 * Three rules carry the weight, and each of them failed for real:
 *
 *   A squad imported without the column had NO way to get numbers. The JV
 *   roster sat at 0 of 25 and every screen that leads with the number showed a
 *   dash for the whole team.
 *
 *   Writing them one at a time can collide with the unique index even when the
 *   final state is legal -- swapping two players is the obvious case.
 *
 *   A header that misses is silent: the value arrives undefined, the importer
 *   reads that as "not supplied", and nothing reports a thing.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';
import recNumSrc from '../../public/js/views/recording-numbers.view.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let ctor: any;

beforeAll(() => {
  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;
  ctor = new Function(
    [appCoreSrc, adminSrc, recNumSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

function makeApp(players: any[]): any {
  const app = Object.create(ctor.prototype);
  app.data = { players, teams: [{ id: 't1', school_id: 's1', name: 'JV' }] };
  app.activeTeamId = 't1';
  return app;
}

const squad = () => [
  { id: 'p1', name: 'Kevin Corona', lastName: 'Corona', recordingNumber: null },
  { id: 'p2', name: 'Cesar Alva', lastName: 'Alva', recordingNumber: null },
  { id: 'p3', name: 'JP Davila', lastName: 'Davila', recordingNumber: null }
];

describe('proposing numbers for a squad that has none', () => {
  it('numbers everybody from 1', () => {
    const out = makeApp(squad()).proposeRecordingNumbers(squad());
    expect(Array.from(out.values()).sort((a: any, b: any) => a - b)).toEqual([1, 2, 3]);
  });

  it('follows surname order, which is how a team sheet reads', () => {
    const players = squad();
    const out = makeApp(players).proposeRecordingNumbers(players);
    expect(out.get('p2')).toBe(1);   // Alva
    expect(out.get('p1')).toBe(2);   // Corona
    expect(out.get('p3')).toBe(3);   // Davila
  });

  it('leaves a number that is already set alone', () => {
    // Renumbering mid-season would invalidate every paper sheet already filled
    // in, so an existing number is never reassigned.
    const players = squad();
    players[0].recordingNumber = 9;
    const out = makeApp(players).proposeRecordingNumbers(players);
    expect(out.get('p1')).toBe(9);
  });

  it('fills the gaps around numbers already taken', () => {
    const players = squad();
    players[0].recordingNumber = 1;
    const out = makeApp(players).proposeRecordingNumbers(players);
    expect(out.get('p2')).toBe(2);
    expect(out.get('p3')).toBe(3);
    expect(new Set(out.values()).size).toBe(3);
  });
});

describe('refusing a clash before writing', () => {
  it('names the number two players share', () => {
    const app = makeApp(squad());
    expect(app.duplicateRecordingNumbers([
      { playerId: 'p1', value: 4 }, { playerId: 'p2', value: 4 }, { playerId: 'p3', value: 5 }
    ])).toEqual([4]);
  });

  it('is happy when every number differs', () => {
    const app = makeApp(squad());
    expect(app.duplicateRecordingNumbers([
      { playerId: 'p1', value: 1 }, { playerId: 'p2', value: 2 }
    ])).toEqual([]);
  });

  it('does not treat two blanks as a clash', () => {
    // Blank means "no number yet", and any number of players may have none.
    const app = makeApp(squad());
    expect(app.duplicateRecordingNumbers([
      { playerId: 'p1', value: null }, { playerId: 'p2', value: null }
    ])).toEqual([]);
  });
});

describe('planning the writes', () => {
  const app = () => makeApp(squad());

  it('writes nothing when nothing changed', () => {
    // A squad of 25 opened and closed again must not make 25 writes.
    expect(app().planRecordingNumberWrites([
      { playerId: 'p1', value: 1, current: 1 },
      { playerId: 'p2', value: 2, current: 2 }
    ])).toEqual([]);
  });

  it('writes only the rows that changed', () => {
    const writes = app().planRecordingNumberWrites([
      { playerId: 'p1', value: 1, current: 1 },
      { playerId: 'p2', value: 7, current: 2 }
    ]);
    expect(writes).toEqual([{ playerId: 'p2', value: 7 }]);
  });

  it('clears a number before somebody else takes it', () => {
    // The unique index is per team, so writing p2 = 1 while p1 still holds 1
    // fails even though the end state is legal. p1 is cleared first.
    const writes = app().planRecordingNumberWrites([
      { playerId: 'p1', value: 2, current: 1 },
      { playerId: 'p2', value: 1, current: 2 }
    ]);
    expect(writes[0]).toEqual({ playerId: 'p1', value: null });
    expect(writes[1]).toEqual({ playerId: 'p2', value: null });
    expect(writes.slice(2)).toEqual([
      { playerId: 'p1', value: 2 },
      { playerId: 'p2', value: 1 }
    ]);
  });

  it('never leaves a number set while another row is claiming it', () => {
    // The property that matters, stated directly: at no point in the sequence
    // do two live rows hold the same number.
    const writes = app().planRecordingNumberWrites([
      { playerId: 'p1', value: 2, current: 1 },
      { playerId: 'p2', value: 3, current: 2 },
      { playerId: 'p3', value: 1, current: 3 }
    ]);
    const held = new Map<string, number | null>([['p1', 1], ['p2', 2], ['p3', 3]]);
    for (const w of writes) {
      held.set(w.playerId, w.value);
      const live = Array.from(held.values()).filter(v => v != null);
      expect(new Set(live).size).toBe(live.length);
    }
    expect(Array.from(held.values())).toEqual([2, 3, 1]);
  });

  it('handles clearing a number', () => {
    const writes = app().planRecordingNumberWrites([
      { playerId: 'p1', value: null, current: 4 }
    ]);
    expect(writes).toEqual([{ playerId: 'p1', value: null }]);
  });
});

describe('reading the column whatever the sheet calls it', () => {
  let app: any;
  beforeEach(() => { app = makeApp(squad()); });

  const A = ['recordingnumber', 'recnumber', 'recordno', 'recno', 'rec'];

  it('reads the documented spelling', () => {
    expect(app.pickColumn({ RecordingNumber: 7 }, A)).toBe(7);
  });

  it('reads it with a space, which is what a person types', () => {
    expect(app.pickColumn({ 'Recording Number': 7 }, A)).toBe(7);
  });

  it('reads it with an underscore, which is what the database calls it', () => {
    expect(app.pickColumn({ recording_number: 7 }, A)).toBe(7);
  });

  it('reads it shouted', () => {
    expect(app.pickColumn({ RECORDINGNUMBER: 7 }, A)).toBe(7);
  });

  it('reads "Rec #"', () => {
    expect(app.pickColumn({ 'Rec #': 7 }, A)).toBe(7);
  });

  it('does not confuse it with the shirt number', () => {
    // This is the whole bug: Number is the shirt number and must never be
    // read as the recording number.
    expect(app.pickColumn({ Number: 30 }, A)).toBeUndefined();
  });

  it('ignores a blank cell, so an empty column does not clear a real number', () => {
    expect(app.pickColumn({ RecordingNumber: '   ' }, A)).toBeUndefined();
  });

  it('returns undefined when the column is simply absent', () => {
    expect(app.pickColumn({ Team: 'JV', Last: 'Corona' }, A)).toBeUndefined();
  });
});
