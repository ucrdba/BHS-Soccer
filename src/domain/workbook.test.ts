/**
 * The eleven tables of the XLSX round trip.
 *
 * The block that matters most is "an export invents nothing", and it is not a
 * style point. An export is a backup: a coach who exports, sees a plausible
 * workbook and re-imports it later would, with the legacy export, inject a
 * fabricated quiz question, two made-up user profiles and a match that never
 * happened into their own database -- and every club would get Beaumont's
 * name on its config sheet.
 *
 * An empty table exports an empty sheet with its headers. That is what tells
 * a coach the table is empty, and it is the honest answer.
 */
import { describe, it, expect } from 'vitest';
import {
  tableDefs, sheetFor, templateFor, tableByKey, tableBySheetName
} from './workbook';
import { toRoster } from './player-row';

const rowsOf = (key: string, data: any) => sheetFor(tableByKey(key)!, data);

describe('the definitions', () => {
  it('covers all eleven tables', () => {
    expect(tableDefs()).toHaveLength(11);
  });

  it('is defined ONCE, so the three export modes cannot drift', () => {
    // exportXLSX writes these out three times in the legacy panel -- for the
    // zip, the single workbook and each file -- and they have already drifted.
    const keys = tableDefs().map(d => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the file names a coach already has saved', () => {
    expect(tableByKey('players')!.fileName).toBe('3_Roster_Players.xlsx');
    expect(tableByKey('quiz')!.fileName).toBe('10_Quiz_Questions.xlsx');
  });

  it('finds a table by its sheet name, however it is cased', () => {
    expect(tableBySheetName('Players')!.key).toBe('players');
    expect(tableBySheetName('  players  ')!.key).toBe('players');
    expect(tableBySheetName('Nonsense')).toBeNull();
  });
});

describe('AN EXPORT INVENTS NOTHING', () => {
  it('exports NO quiz question when the bank is empty', () => {
    // The legacy export shipped one hardcoded sample question every time,
    // whatever the organization had actually written.
    expect(rowsOf('quiz', { quiz: [] })).toEqual([]);
  });

  it('exports the REAL questions when there are some', () => {
    const rows = rowsOf('quiz', {
      quiz: [{
        question: 'Where does the ball go?',
        answers: [
          { letter: 'A', answer_text: 'Wide', is_correct: false },
          { letter: 'B', answer_text: 'Through the lines', is_correct: true }
        ],
        explanation: 'Break the line.'
      }]
    });

    expect(rows[0].QuestionText).toBe('Where does the ball go?');
    expect(rows[0].OptionB).toBe('Through the lines');
    expect(rows[0].CorrectAnswer).toBe('B');
  });

  it('exports NO match result when a team has no logs', () => {
    // The legacy export substituted "Sample Player / 1v1 Gauntlet / WIN",
    // which a re-import would have written in as a real result.
    expect(rowsOf('matrix', { matrixLogs: [] })).toEqual([]);
  });

  it('exports NO user profiles when none are loaded', () => {
    // The legacy fallback shipped coach_bob and sam_admin.
    expect(rowsOf('profiles', {})).toEqual([]);
    expect(rowsOf('profiles', { profiles: [] })).toEqual([]);
  });

  it('exports NO organization row rather than a Beaumont-shaped one', () => {
    expect(rowsOf('schools', {})).toEqual([]);
  });

  it('leaves an unstated field BLANK rather than defaulting it', () => {
    // A club with no league gets an empty cell, not somebody else's.
    const [row] = rowsOf('schools', { school: { code: 'lfc', name: 'Legends FC' } });

    expect(row.Name).toBe('Legends FC');
    expect(row.League).toBe('');
    expect(row.Mascot).toBe('');
  });

  it('carries NO Beaumont, Cougars or bhs anywhere', () => {
    // Asserted across every sheet at once, because the legacy defaults were
    // scattered through all three copies of the export.
    const everything = JSON.stringify(
      tableDefs().map(d => ({ def: d.headers, rows: sheetFor(d, {}) })));

    expect(everything).not.toMatch(/beaumont|cougars|bhs|coach bob|sample player/i);
  });
});

describe('the rows', () => {
  it('maps a player, in both the shapes the app holds', () => {
    const [row] = rowsOf('players', {
      teamName: 'Varsity',
      players: [{
        number: 9, recordingNumber: 3, firstName: 'Cesar', lastName: 'Alva',
        position: 9, classYear: 'Senior',
        seasonStats: { goals: 4 }, ratings: { technical: 8 }
      }]
    });

    expect(row).toMatchObject({
      Team: 'Varsity', Number: 9, RecordingNumber: 3,
      FirstName: 'Cesar', LastName: 'Alva', Class: 'Senior', Goals: 4, Tech: 8
    });
  });

  it('exports the position number, and a blank for none', () => {
    const def = tableDefs().find(d => d.key === 'players')!;
    const rows = def.toRows({ teamName: 'Varsity', players: [
      { firstName: 'A', lastName: 'B', position: 9 },
      { firstName: 'C', lastName: 'D', position: null }
    ] } as any);
    expect(rows.map((r: any) => r.Position)).toEqual([9, '']);
  });

  it('reads a Player, so a roster row goes through toRoster first', () => {
    // `fetchTeamRoster` nests the person under `players`. This sheet once
    // guessed at a flat snake_case row no read ever returns, and so exported
    // the real one with every name blank.
    const players = toRoster([{
      id: 'm1', number: 9, recording_number: 3, position: 7,
      players: {
        id: 'p1', first_name: 'Tom', last_name: 'Budde', class_year: 'Junior',
        height: '5\'9"', photo_url: 'img/tom.jpg'
      }
    }]);
    const [row] = rowsOf('players', { players });
    expect(row).toMatchObject({
      FirstName: 'Tom', LastName: 'Budde', Class: 'Junior', Height: '5\'9"',
      Photo: 'img/tom.jpg', Number: 9, RecordingNumber: 3, Position: 7
    });
  });

  it('writes Home or Away rather than a boolean', () => {
    const rows = rowsOf('schedule', {
      schedule: [{ opponent: 'Yucaipa', isHome: true }, { opponent: 'Redlands', isHome: false }]
    });
    expect(rows.map(r => r.Home)).toEqual(['Home', 'Away']);
  });

  it('writes IsDeleted for every table that has it, since the importer reads it', () => {
    tableDefs().forEach(def => {
      if (!def.headers.includes('IsDeleted')) return;
      const rows = sheetFor(def, {
        school: { code: 'x' }, profiles: [{}], players: [{}], schedule: [{}],
        drillsBank: [{}], practicePlan: [{}], matrixLogs: [{}], coaches: [{}],
        thoughts: [{}], quiz: [{}], categories: [{}]
      });
      if (rows.length) expect(rows[0].IsDeleted, def.key).toBe('FALSE');
    });
  });

  it('marks a retired row as deleted', () => {
    const [row] = rowsOf('coaches', { coaches: [{ name: 'Gone', is_deleted: true }] });
    expect(row.IsDeleted).toBe('TRUE');
  });
});

describe('a template', () => {
  it('carries every header and no rows of data', () => {
    const def = tableByKey('players')!;
    const [blank] = templateFor(def);

    expect(Object.keys(blank)).toEqual(def.headers);
    expect(Object.values(blank).every(v => v === '')).toBe(true);
  });

  it('has the same columns an export writes, so the two interchange', () => {
    // A coach fills in a template and re-imports it; a mismatch there is a
    // whole sheet that silently does nothing.
    tableDefs().forEach(def => {
      const rows = sheetFor(def, {
        school: { code: 'x' }, profiles: [{}], players: [{}], schedule: [{}],
        drillsBank: [{}], practicePlan: [{}], matrixLogs: [{}], coaches: [{}],
        thoughts: [{}], quiz: [{}], categories: [{}]
      });
      if (rows.length) expect(Object.keys(rows[0]).sort(), def.key).toEqual(def.headers.slice().sort());
    });
  });
});
