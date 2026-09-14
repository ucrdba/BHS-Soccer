/**
 * The session grid's state, without a DOM.
 *
 * The legacy grid keeps what has been typed in the inputs themselves and
 * reads it back with getElementById, which is why sorting mid-entry has to
 * capture drafts before it re-renders. None of that survives here: the state
 * is the state, and what remains is the defaults, the parsing and the shaping.
 *
 * Two of the assertions below are worth reading twice. Clearing a row excuses
 * the player rather than marking them absent, because an excused row costs
 * them nothing and a no-show costs them the whole weight -- a penalty for the
 * coach's own typo. And a banded time is parsed as mm:ss, because parseFloat
 * reads "4:30" as 4, which fits under every standard.
 */
import { describe, it, expect } from 'vitest';
import {
  blankEntries, entriesFromResults, attendanceAfterInput,
  toSessionResults, presentWithoutResult, startingSessionDate, fillBlankOutcomes, clearOutcomes
} from './session-entry';

const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva', recordingNumber: 1 },
  { id: 'p2', name: 'Tom Budde', recordingNumber: 2 },
  { id: 'p3', name: 'Alain Renteria', recordingNumber: 3 }
];

describe('a fresh grid', () => {
  it('has a row for every player', () => {
    const e = blankEntries(PLAYERS, 'count_high');
    expect(Object.keys(e)).toHaveLength(3);
    expect(e.p2.playerId).toBe('p2');
  });

  it('starts a timed test at no-show', () => {
    // Running it is the whole point, so no time means they did not run.
    // Starting everyone at "here" would have the coach turning twenty-five
    // dropdowns the wrong way to record the two who were missing.
    expect(blankEntries(PLAYERS, 'time_bands').p1.attendance).toBe('unexcused');
    expect(blankEntries(PLAYERS, 'time_low').p1.attendance).toBe('unexcused');
  });

  it('starts everything else at present', () => {
    // Taking part is the normal case and the exceptions are few.
    expect(blankEntries(PLAYERS, 'count_high').p1.attendance).toBe('present');
    expect(blankEntries(PLAYERS, 'win_loss').p1.attendance).toBe('present');
  });

  it('starts with empty boxes', () => {
    const row = blankEntries(PLAYERS, 'count_high').p1;
    expect(row.value).toBe('');
    expect(row.outcome).toBe('');
  });

  it('leaves out a deleted player, spelled either way', () => {
    // Supabase rows carry is_deleted; app state carries isDeleted.
    const e = blankEntries(
      PLAYERS.concat([
        { id: 'p4', name: 'Gone', is_deleted: true } as any,
        { id: 'p5', name: 'Also gone', isDeleted: true } as any
      ]),
      'count_high'
    );
    expect(Object.keys(e).sort()).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('reopening a saved session', () => {
  const RESULTS = [
    { player_id: 'p1', attendance: 'present', raw_value: 250, outcome: null },
    { player_id: 'p2', attendance: 'excused', raw_value: null, outcome: null }
  ];

  it('shows a stored time as the coach would have typed it', () => {
    // Stored as seconds, entered as mm:ss. 250 in the box would be re-saved
    // as four minutes ten if the coach touched nothing.
    expect(entriesFromResults(PLAYERS, RESULTS, 'time_bands').p1.value).toBe('4:10');
  });

  it('shows a stored sprint as the decimal it was', () => {
    // Not 0:05. time_low is seconds, and formatting it as mm:ss would round
    // 4.85 to five seconds on the way back into the box.
    const e = entriesFromResults(
      PLAYERS, [{ player_id: 'p1', attendance: 'present', raw_value: 4.85 }], 'time_low');
    expect(e.p1.value).toBe('4.85');
  });

  it('shows a counted result as its number', () => {
    const e = entriesFromResults(
      PLAYERS, [{ player_id: 'p1', attendance: 'present', raw_value: 2800 }], 'count_high');
    expect(e.p1.value).toBe('2800');
  });

  it('restores an outcome for a small-sided session', () => {
    const e = entriesFromResults(
      PLAYERS, [{ player_id: 'p1', attendance: 'present', outcome: 'win' }], 'win_loss');
    expect(e.p1.outcome).toBe('win');
  });

  it('restores the attendance that was recorded', () => {
    expect(entriesFromResults(PLAYERS, RESULTS, 'time_bands').p2.attendance).toBe('excused');
  });

  it('gives a player added since the session the measure default', () => {
    // p3 has no stored row. They joined after this was recorded, and must not
    // arrive pre-marked as having run something.
    expect(entriesFromResults(PLAYERS, RESULTS, 'time_bands').p3.attendance).toBe('unexcused');
    expect(entriesFromResults(PLAYERS, RESULTS, 'time_bands').p3.value).toBe('');
  });

  it('ignores a stored result for somebody no longer on the squad', () => {
    const e = entriesFromResults(
      PLAYERS, RESULTS.concat([{ player_id: 'gone', attendance: 'present', raw_value: 9 } as any]),
      'time_bands');
    expect(e.gone).toBeUndefined();
  });

  it('copes with no results at all, rather than throwing', () => {
    expect(Object.keys(entriesFromResults(PLAYERS, null as any, 'count_high'))).toHaveLength(3);
  });
});

describe('typing into a row', () => {
  it('marks the player present, whatever the dropdown said', () => {
    // A recorded time is evidence of attendance and outranks the dropdown.
    expect(attendanceAfterInput('4:10', 'time_bands')).toBe('present');
    expect(attendanceAfterInput('12', 'count_high')).toBe('present');
  });

  it('returns the row to the measure default when the value is cleared', () => {
    // So a mistyped entry deleted again does not leave somebody marked
    // present with nothing recorded against them.
    expect(attendanceAfterInput('', 'time_bands')).toBe('unexcused');
    expect(attendanceAfterInput('   ', 'count_high')).toBe('present');
  });
});

describe('what gets saved', () => {
  const entries = (over: Record<string, any> = {}) => {
    const base = blankEntries(PLAYERS, 'time_bands');
    Object.keys(over).forEach(k => { base[k] = { ...base[k], ...over[k] }; });
    return base;
  };

  it('parses a banded time as mm:ss, not as a number', () => {
    // parseFloat("4:30") is 4, which lands under every standard and hands the
    // player full marks for a time they did not run.
    const out = toSessionResults(
      PLAYERS, entries({ p1: { attendance: 'present', value: '4:30' } }), 'time_bands');
    expect(out.find(r => r.playerId === 'p1')!.rawValue).toBe(270);
  });

  it('parses a sprint as decimal seconds, not as minutes', () => {
    // time_low is a sprint or a shuttle: 4.85 is four point eight five
    // seconds. parseTimeToSeconds refuses it outright -- a single-digit
    // seconds field is ambiguous -- so reading time_low as mm:ss would drop
    // every sprint time on the sheet.
    const e = blankEntries(PLAYERS, 'time_low');
    e.p1 = { ...e.p1, attendance: 'present', value: '4.85' };
    expect(toSessionResults(PLAYERS, e, 'time_low').find(r => r.playerId === 'p1')!.rawValue)
      .toBe(4.85);
  });

  it('parses a counted result as a plain number', () => {
    const e = blankEntries(PLAYERS, 'count_high');
    e.p1 = { ...e.p1, value: '2800' };
    expect(toSessionResults(PLAYERS, e, 'count_high').find(r => r.playerId === 'p1')!.rawValue)
      .toBe(2800);
  });

  it('sends no value for an unreadable time rather than a wrong one', () => {
    const out = toSessionResults(
      PLAYERS, entries({ p1: { attendance: 'present', value: '4:5' } }), 'time_bands');
    expect(out.find(r => r.playerId === 'p1')!.rawValue).toBeNull();
  });

  it('sends an outcome for a small-sided session and no value', () => {
    const e = blankEntries(PLAYERS, 'win_loss');
    e.p1 = { ...e.p1, outcome: 'win', value: '9' };
    const row = toSessionResults(PLAYERS, e, 'win_loss').find(r => r.playerId === 'p1')!;
    expect(row.outcome).toBe('win');
    expect(row.rawValue).toBeNull();
  });

  it('strips value and outcome from a row that is not present', () => {
    // Whatever is still in the box: they were not there.
    const e = blankEntries(PLAYERS, 'count_high');
    e.p1 = { ...e.p1, attendance: 'excused', value: '2800', outcome: 'win' };
    const row = toSessionResults(PLAYERS, e, 'count_high').find(r => r.playerId === 'p1')!;
    expect(row.rawValue).toBeNull();
    expect(row.outcome).toBeNull();
  });

  it('sends a row for every player, including the absent ones', () => {
    // An absent row is a recorded fact, and matrix_standings scores a no-show
    // as 0 of the weight. Omitting it would score them as excused instead.
    expect(toSessionResults(PLAYERS, blankEntries(PLAYERS, 'time_bands'), 'time_bands'))
      .toHaveLength(3);
  });
});

describe('present with nothing recorded', () => {
  it('names the players, so the message can say who', () => {
    // The client refuses this save too, but its message carries a uuid.
    const e = blankEntries(PLAYERS, 'count_high');   // all present, all blank
    expect(presentWithoutResult(PLAYERS, e, 'count_high').map(p => p.name))
      .toEqual(['Cesar Alva', 'Tom Budde', 'Alain Renteria']);
  });

  it('is satisfied by a value', () => {
    const e = blankEntries(PLAYERS, 'count_high');
    PLAYERS.forEach(p => { e[p.id] = { ...e[p.id], value: '5' }; });
    expect(presentWithoutResult(PLAYERS, e, 'count_high')).toEqual([]);
  });

  it('is satisfied by an outcome on a small-sided session', () => {
    const e = blankEntries(PLAYERS, 'win_loss');
    PLAYERS.forEach(p => { e[p.id] = { ...e[p.id], outcome: 'loss' }; });
    expect(presentWithoutResult(PLAYERS, e, 'win_loss')).toEqual([]);
  });

  it('counts an unreadable time as nothing recorded', () => {
    // It would be saved as null, so the row is present with no result -- the
    // save would be refused by the client with a uuid in the message.
    const e = blankEntries(PLAYERS, 'time_bands');
    e.p1 = { ...e.p1, attendance: 'present', value: '4:5' };
    expect(presentWithoutResult(PLAYERS, e, 'time_bands').map(p => p.id)).toEqual(['p1']);
  });

  it('does not object to a player who was not there', () => {
    expect(presentWithoutResult(PLAYERS, blankEntries(PLAYERS, 'time_bands'), 'time_bands'))
      .toEqual([]);
  });
});

describe('startingSessionDate', () => {
  it('shows a recorded session its own date', () => {
    // Reopening one from the history and finding the box empty means the
    // coach retypes it -- and typing today silently MOVES the session, which
    // re-attributes every result in it to a day it did not happen on.
    expect(startingSessionDate('2026-09-04')).toBe('2026-09-04');
  });

  it('starts a new session on today', () => {
    const now = new Date(2026, 8, 13, 9, 0);
    expect(startingSessionDate(null, now)).toBe('2026-09-13');
  });

  it('reads today in LOCAL time', () => {
    // A bare toISOString() is UTC: an evening session west of Greenwich would
    // open on tomorrow's date, which is the one day a coach never means.
    const evening = new Date(2026, 8, 12, 23, 30);
    expect(startingSessionDate('', evening)).toBe('2026-09-12');
  });

  it('pads a single-digit month and day', () => {
    expect(startingSessionDate(undefined, new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
  });
});

describe('fillBlankOutcomes', () => {
  const grid = () => blankEntries(PLAYERS, 'win_loss');

  it('gives every untouched player the outcome', () => {
    // The whole point: a small-sided session is two sides, so one press sets
    // the squad and the coach flips the side that won.
    const out = fillBlankOutcomes(grid(), 'loss');
    expect(Object.values(out).map(r => r.outcome)).toEqual(['loss', 'loss', 'loss']);
  });

  it('KEEPS a result the coach has already chosen', () => {
    const e = grid();
    e.p2 = { ...e.p2, outcome: 'win' };
    const out = fillBlankOutcomes(e, 'loss');
    expect(out.p2.outcome).toBe('win');
    expect(out.p1.outcome).toBe('loss');
  });

  it('leaves a player who was not there out of it', () => {
    // Filling an absent row would credit them for a game they did not play,
    // and mark them present into the bargain.
    const e = grid();
    e.p3 = { ...e.p3, attendance: 'excused' };
    const out = fillBlankOutcomes(e, 'win');
    expect(out.p3.outcome).toBe('');
    expect(out.p3.attendance).toBe('excused');
  });

  it('leaves a no-show out of it too', () => {
    const e = grid();
    e.p1 = { ...e.p1, attendance: 'unexcused' };
    expect(fillBlankOutcomes(e, 'draw').p1.outcome).toBe('');
  });

  it('does not mutate the grid it was given', () => {
    const e = grid();
    fillBlankOutcomes(e, 'win');
    expect(e.p1.outcome).toBe('');
  });
});

describe('clearOutcomes', () => {
  it('empties every result on the sheet', () => {
    const e = fillBlankOutcomes(blankEntries(PLAYERS, 'win_loss'), 'loss');
    expect(Object.values(clearOutcomes(e)).map(r => r.outcome)).toEqual(['', '', '']);
  });

  it('leaves attendance exactly as it was', () => {
    // Reset is the Result column. Who was there is a separate fact, and
    // flipping everyone back to the default would undo absences already marked.
    const e = fillBlankOutcomes(blankEntries(PLAYERS, 'win_loss'), 'win');
    e.p2 = { ...e.p2, attendance: 'excused' };
    e.p3 = { ...e.p3, attendance: 'unexcused' };
    expect(Object.values(clearOutcomes(e)).map(r => r.attendance))
      .toEqual(['present', 'excused', 'unexcused']);
  });

  it('does not mutate the grid it was given', () => {
    const e = fillBlankOutcomes(blankEntries(PLAYERS, 'win_loss'), 'draw');
    clearOutcomes(e);
    expect(e.p1.outcome).toBe('draw');
  });
});
