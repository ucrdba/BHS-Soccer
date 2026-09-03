/**
 * Recording numbers — what a player writes on a paper score sheet.
 *
 * Not the shirt number. Numbers are allocated in a BLOCK PER SQUAD -- Varsity
 * 1-29, JV 30-59, Fr/So 60-79 -- so a number says which squad as well as which
 * player, which is what keeps a sheet unambiguous when two teams train
 * together. They stay put all season and are unique per team (0021).
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

describe('numbering in a block per squad', () => {
  // Varsity 1-29, JV 30-59, Fr/So 60-79. A recording number identifies the
  // player AND the squad, which is what keeps a paper sheet unambiguous when
  // two teams train together. Starting every squad at 1 would break that.

  it("starts a squad's numbering where its block starts", () => {
    const players = squad();
    const out = makeApp(players).proposeRecordingNumbers(players, 30);
    expect(Array.from(out.values()).sort((a: any, b: any) => a - b)).toEqual([30, 31, 32]);
  });

  it('keeps surname order within the block', () => {
    const players = squad();
    const out = makeApp(players).proposeRecordingNumbers(players, 30);
    expect(out.get('p2')).toBe(30);   // Alva
    expect(out.get('p1')).toBe(31);   // Corona
    expect(out.get('p3')).toBe(32);   // Davila
  });

  it('numbers a third squad from its own block', () => {
    const players = squad();
    const out = makeApp(players).proposeRecordingNumbers(players, 60);
    expect(Array.from(out.values()).sort((a: any, b: any) => a - b)).toEqual([60, 61, 62]);
  });

  it('still starts at 1 when no block is given', () => {
    const players = squad();
    const out = makeApp(players).proposeRecordingNumbers(players);
    expect(Array.from(out.values()).sort((a: any, b: any) => a - b)).toEqual([1, 2, 3]);
  });

  it('fills a gap inside the block rather than running past it', () => {
    const players = squad();
    players[0].recordingNumber = 31;                 // Corona already has 31
    const out = makeApp(players).proposeRecordingNumbers(players, 30);
    expect(out.get('p1')).toBe(31);
    expect(Array.from(out.values()).sort((a: any, b: any) => a - b)).toEqual([30, 31, 32]);
  });
});

describe('continuing a squad already part-numbered', () => {
  it("suggests the squad's own block, not 1", () => {
    // Opening the editor on a half-numbered JV must not offer to renumber it
    // from 1 and walk over the block scheme.
    const players = squad();
    players[0].recordingNumber = 30;
    players[1].recordingNumber = 31;
    expect(makeApp(players).suggestedNumberStart()).toBe(30);
  });

  it('suggests 1 for a squad with no numbers at all', () => {
    expect(makeApp(squad()).suggestedNumberStart()).toBe(1);
  });
});

describe('copying the shirt numbers across', () => {
  // A roster sheet is often written with the squad's recording numbers in a
  // column called "Number", which the importer reads as the shirt number.
  // That is exactly how JV ended up with shirt numbers 30-55 and no recording
  // numbers at all.

  const withShirts = () => [
    { id: 'p1', name: 'Kevin Corona', lastName: 'Corona', number: 30, recordingNumber: null },
    { id: 'p2', name: 'JP Davila', lastName: 'Davila', number: 31, recordingNumber: null },
    { id: 'p3', name: 'Aiden Diaz', lastName: 'Diaz', number: null, recordingNumber: null }
  ];

  it('proposes each shirt number as that player\'s recording number', () => {
    const app = makeApp(withShirts());
    (app as any).renderRecordingNumbersBody = () => {};
    app.useShirtNumbersAsRecording();
    expect(app._recNumDraft.p1).toBe('30');
    expect(app._recNumDraft.p2).toBe('31');
  });

  it('leaves a player with no shirt number blank rather than guessing', () => {
    const app = makeApp(withShirts());
    (app as any).renderRecordingNumbersBody = () => {};
    app.useShirtNumbersAsRecording();
    expect(app._recNumDraft.p3).toBe('');
  });

  it('is only a draft, so nothing is written until it is saved', () => {
    const players = withShirts();
    const app = makeApp(players);
    (app as any).renderRecordingNumbersBody = () => {};
    app.useShirtNumbersAsRecording();
    expect(players[0].recordingNumber).toBeNull();
  });
});

describe('a number the coach assigned never changes', () => {
  /**
   * The standing rule, in the coach's words: "I assign the recording numbers to
   * each player, I don't want them changing." They are written on paper score
   * sheets all season, so silently reassigning one invalidates every sheet
   * already filled in.
   *
   * These run against the real DOM the editor reads, because "already assigned"
   * includes a number typed a moment ago and not yet saved.
   */
  const withShirts = () => [
    { id: 'p1', name: 'Kevin Corona', lastName: 'Corona', number: 30, recordingNumber: null },
    { id: 'p2', name: 'JP Davila', lastName: 'Davila', number: 31, recordingNumber: null },
    { id: 'p3', name: 'Aiden Diaz', lastName: 'Diaz', number: 32, recordingNumber: null }
  ];

  function mount(players: any[], typed: Record<string, string>, start = '30') {
    const app = makeApp(players);
    document.body.innerHTML =
      `<input id="recNumStart" value="${start}" />` +
      players.map(p => `<input id="recNum_${p.id}" value="${typed[p.id] ?? ''}" />`).join('');
    (app as any).renderRecordingNumbersBody = () => {};
    return app;
  }

  it('leaves a typed number alone when filling blanks from shirt numbers', () => {
    const app = mount(withShirts(), { p1: '45' });
    app.useShirtNumbersAsRecording();
    expect(app._recNumDraft.p1).toBe('45');     // the coach's, untouched
    expect(app._recNumDraft.p2).toBe('31');     // filled, was blank
  });

  it('leaves a typed number alone when filling blanks by surname', () => {
    const app = mount(withShirts(), { p1: '45' });
    app.autoNumberRoster();
    expect(app._recNumDraft.p1).toBe('45');
  });

  it('does not hand a typed number out to somebody else', () => {
    // If 45 is taken by hand, nobody else may be proposed 45.
    const app = mount(withShirts(), { p1: '45' });
    app.autoNumberRoster();
    const all = Object.values(app._recNumDraft);
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter(v => v === '45')).toHaveLength(1);
  });

  it('fills the blanks around it from the block start', () => {
    const app = mount(withShirts(), { p1: '45' });
    app.autoNumberRoster();
    expect(app._recNumDraft.p2).toBe('30');
    expect(app._recNumDraft.p3).toBe('31');
  });

  it('leaves a saved number alone too', () => {
    const players = withShirts();
    players[0].recordingNumber = 45;
    const app = mount(players, { p1: '45' });
    app.autoNumberRoster();
    expect(app._recNumDraft.p1).toBe('45');
  });

  it('asks before wiping numbers, since that is work done by hand', () => {
    const players = withShirts();
    players[0].recordingNumber = 45;
    const app = mount(players, { p1: '45' });
    (window as any).confirm = () => false;

    app.clearRecordingNumberDrafts();
    // Declined: nothing wiped. No draft at all, or one that still holds 45 --
    // what must not happen is a draft of blanks.
    expect(app._recNumDraft == null || app._recNumDraft.p1 === '45').toBe(true);
  });

  it('wipes them when that is confirmed', () => {
    const players = withShirts();
    players[0].recordingNumber = 45;
    const app = mount(players, { p1: '45' });
    (window as any).confirm = () => true;

    app.clearRecordingNumberDrafts();
    expect(app._recNumDraft.p1).toBe('');
  });

  it('writes nothing for a player whose number did not move', () => {
    // The save path is what finally protects them: an unchanged row is never
    // written, so it cannot be refused, reordered, or clobbered.
    const app = makeApp(withShirts());
    expect(app.planRecordingNumberWrites([
      { playerId: 'p1', value: 45, current: 45 },
      { playerId: 'p2', value: 31, current: null }
    ])).toEqual([{ playerId: 'p2', value: 31 }]);
  });
});

describe('uniform numbers, alongside the recording numbers', () => {
  /**
   * Two different things in one editor: the recording number is written on a
   * paper score sheet, the uniform number is the shirt the public sees on the
   * roster and on a lineup card. They may hold different values, and editing
   * one must never disturb the other.
   */
  const withBoth = () => [
    { id: 'p1', name: 'Kevin Corona', lastName: 'Corona', number: 7, recordingNumber: 30 },
    { id: 'p2', name: 'JP Davila', lastName: 'Davila', number: null, recordingNumber: 31 }
  ];

  function mount(players: any[], rec: Record<string, string>, uni: Record<string, string>) {
    const app = makeApp(players);
    document.body.innerHTML =
      '<input id="recNumStart" value="30" />' +
      players.map(p =>
        `<input id="recNum_${p.id}" value="${rec[p.id] ?? ''}" />` +
        `<input id="uniNum_${p.id}" value="${uni[p.id] ?? ''}" />`
      ).join('');
    (app as any).renderRecordingNumbersBody = () => {};
    return app;
  }

  it('reads both columns off the screen', () => {
    const app = mount(withBoth(), { p1: '30' }, { p1: '7' });
    app.captureRecordingNumberDrafts();
    expect(app._recNumDraft.p1).toBe('30');
    expect(app._uniNumDraft.p1).toBe('7');
  });

  it('leaves the uniform column alone when filling recording blanks', () => {
    // The fill buttons are about the recording column. Rebuilding the drafts
    // without carrying the uniform ones would silently blank them on save.
    const app = mount(withBoth(), { p1: '30' }, { p1: '7', p2: '9' });
    app.autoNumberRoster();
    expect(app._uniNumDraft.p1).toBe('7');
    expect(app._uniNumDraft.p2).toBe('9');
  });

  it('leaves the uniform column alone when clearing recording numbers', () => {
    (window as any).confirm = () => true;
    const app = mount(withBoth(), { p1: '30' }, { p1: '7' });
    app.clearRecordingNumberDrafts();
    expect(app._recNumDraft.p1).toBe('');
    expect(app._uniNumDraft.p1).toBe('7');
  });

  it('fills a recording blank from the uniform number ON SCREEN', () => {
    // Not from the saved roster: the coach may have typed a shirt number in
    // this same sitting and not saved it yet.
    const app = mount(withBoth(), { p2: '' }, { p2: '9' });
    app.useShirtNumbersAsRecording();
    expect(app._recNumDraft.p2).toBe('9');
  });

  it('refuses two players sharing a uniform number', () => {
    const app = mount(withBoth(), {}, { p1: '7', p2: '7' });
    const uniforms = [
      { playerId: 'p1', value: 7 }, { playerId: 'p2', value: 7 }
    ];
    expect(app.duplicateRecordingNumbers(uniforms)).toEqual([7]);
  });
});
