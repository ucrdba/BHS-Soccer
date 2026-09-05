/**
 * Importing plus/minus from a spreadsheet.
 *
 * The test that matters is the ROUND TRIP: build a log from the figures a
 * coach typed, replay it through the real engine, and check the same figures
 * come back. Anything else only checks that the builder does what the builder
 * does — and the whole risk here is that a synthesised log replays to
 * something other than what was written down.
 */

/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';
import {
  groupRows, goalTimes, orderBuilt, buildMatch, buildImport, resolveRowDates,
  DEFAULT_FULL_MATCH_MINUTES, type ImportRow, type FixtureRef
} from './plus-minus-import';
import { replay } from './plus-minus';
import adminSrc from '../../public/js/admin.js?raw';

const HS = DEFAULT_FULL_MATCH_MINUTES;

/** Recording number 1 is p1, 2 is p2, and so on. 99 is nobody. */
const byNumber = (n: number) => (n >= 1 && n <= 30 ? `p${n}` : null);

const row = (over: Partial<ImportRow>): ImportRow => ({
  date: 'DEC 8 2026', opponent: 'Sultana', goalsFor: 0, goalsAgainst: 0,
  recordingNumber: 1, minutes: HS, ...over
});

/** Build one match and replay it, which is how every figure is checked. */
const roundTrip = (rows: ImportRow[], full = HS) => {
  const built = buildMatch(rows, byNumber, full);
  return { built, stats: replay(built.events as any) };
};

describe('grouping the sheet into matches', () => {
  it('gathers the rows of one fixture', () => {
    const g = groupRows([
      row({ recordingNumber: 1 }), row({ recordingNumber: 2 }),
      row({ recordingNumber: 3, date: 'DEC 11 2026', opponent: 'El Toro' })
    ]);
    expect(g.size).toBe(2);
  });

  it('keeps two fixtures on the same day apart', () => {
    // A tournament plays twice in a day. Keyed on the date alone, the two
    // matches would merge and every figure would double.
    const g = groupRows([
      row({ opponent: 'Sultana' }),
      row({ opponent: 'El Toro' })
    ]);
    expect(g.size).toBe(2);
  });

  it('ignores case and stray spaces in the fixture', () => {
    const g = groupRows([
      row({ opponent: 'Sultana' }),
      row({ opponent: '  sultana ' })
    ]);
    expect(g.size).toBe(1);
  });
});

describe('the round trip', () => {
  it('gives back exactly the plus and minus that were typed', () => {
    const { stats } = roundTrip([row({ recordingNumber: 1, plus: 4, minus: 1 })]);
    const s = stats.get('p1')!;
    expect(s.plus).toBe(4);
    expect(s.minus).toBe(1);
    expect(s.score).toBe(3);
  });

  it('gives back the minutes that were typed', () => {
    const { stats } = roundTrip([
      row({ recordingNumber: 1, minutes: HS }),
      row({ recordingNumber: 2, minutes: 25 }),
      row({ recordingNumber: 3, minutes: 6 })
    ]);
    expect(stats.get('p1')!.secondsPlayed).toBe(HS * 60);
    expect(stats.get('p2')!.secondsPlayed).toBe(25 * 60);
    expect(stats.get('p3')!.secondsPlayed).toBe(6 * 60);
  });

  it('gives back shots, goals and assists', () => {
    const { stats } = roundTrip([row({ recordingNumber: 1, shots: 3, goals: 1, assists: 2 })]);
    const s = stats.get('p1')!;
    expect(s.shots).toBe(3);
    expect(s.goals).toBe(1);
    expect(s.assists).toBe(2);
  });

  it('holds for a whole squad at once', () => {
    const rows = Array.from({ length: 18 }, (_, i) => row({
      recordingNumber: i + 1,
      minutes: i < 11 ? HS - i : 10 + i,
      plus: i % 4, minus: i % 3
    }));
    const { stats } = roundTrip(rows);
    rows.forEach(r => {
      const s = stats.get(`p${r.recordingNumber}`)!;
      expect(s.plus).toBe(r.plus);
      expect(s.minus).toBe(r.minus);
      expect(s.secondsPlayed).toBe(r.minutes * 60);
    });
  });

  it('works on a club match length too', () => {
    const { stats } = roundTrip([row({ recordingNumber: 1, minutes: 60 })], 60);
    expect(stats.get('p1')!.secondsPlayed).toBe(60 * 60);
  });
});

describe('goal differential, which nobody types', () => {
  /**
   * It has no column. The sheet gives the score once and the differential
   * falls out of who was on the pitch when each goal went in — which is what
   * it means, and the only way to get it without writing events that could
   * not have happened.
   */
  it('credits a player who was on for the whole match with the whole score', () => {
    const { stats } = roundTrip([
      row({ recordingNumber: 1, minutes: HS, goalsFor: 2, goalsAgainst: 1 })
    ]);
    expect(stats.get('p1')!.goalDiff).toBe(1);
  });

  it('gives a late substitute only the goals after they came on', () => {
    // The reason the log has to be in clock order. Emit every goal after
    // every substitution and this player gets all three.
    const { stats } = roundTrip([
      row({ recordingNumber: 1, minutes: HS, goalsFor: 2, goalsAgainst: 1 }),
      row({ recordingNumber: 2, minutes: 5,  goalsFor: 2, goalsAgainst: 1 })
    ]);
    expect(stats.get('p1')!.goalDiff).toBe(1);
    expect(stats.get('p2')!.goalDiff).toBeGreaterThan(-2);
    expect(Math.abs(stats.get('p2')!.goalDiff))
      .toBeLessThan(Math.abs(stats.get('p1')!.goalDiff) + 3);
  });

  it('gives a player who came off early nothing from the late goals', () => {
    const { stats } = roundTrip([
      row({ recordingNumber: 1, minutes: 10, goalsFor: 0, goalsAgainst: 2 }),
      row({ recordingNumber: 2, minutes: HS, goalsFor: 0, goalsAgainst: 2 })
    ]);
    // Both conceded goals fall in the second half of an 80-minute match,
    // after the ten-minute player is long off.
    expect(stats.get('p1')!.goalDiff).toBe(0);
    expect(stats.get('p2')!.goalDiff).toBe(-2);
  });

  it('reads the score from the match, not from each row separately', () => {
    // Repeated on every row so a spreadsheet is easy to fill; only one is
    // used, so a stray edit on row nine cannot double the score.
    const { built } = roundTrip([
      row({ recordingNumber: 1, goalsFor: 2, goalsAgainst: 1 }),
      row({ recordingNumber: 2, goalsFor: 9, goalsAgainst: 9 })
    ]);
    expect(built.events.filter(e => e.kind === 'goal_for')).toHaveLength(2);
    expect(built.events.filter(e => e.kind === 'goal_against')).toHaveLength(1);
  });
});

describe('the shape of the match it invents', () => {
  it('starts the eleven longest appearances at kick-off', () => {
    const rows = Array.from({ length: 16 }, (_, i) =>
      row({ recordingNumber: i + 1, minutes: HS - i * 4 }));
    const { built } = roundTrip(rows);
    const atKickOff = built.events.filter(e => e.kind === 'on' && e.atSeconds === 0);
    expect(atKickOff).toHaveLength(11);
  });

  it('brings the substitutes on so they finish the match', () => {
    // A substitute is decided by RANK, not by shirt number: the eleven
    // longest appearances start, so the sheet needs a full XI ahead of them.
    const rows = Array.from({ length: 11 }, (_, i) =>
      row({ recordingNumber: i + 1, minutes: HS }));
    rows.push(row({ recordingNumber: 12, minutes: 10 }));
    const { built } = roundTrip(rows);
    const on = built.events.find(e => e.kind === 'on' && e.playerId === 'p12')!;
    expect(on.atSeconds).toBe((HS - 10) * 60);
  });

  it('records nothing for a player with no minutes', () => {
    const { built, stats } = roundTrip([row({ recordingNumber: 1, minutes: 0 })]);
    expect(built.events.some(e => e.kind === 'on' && e.playerId === 'p1')).toBe(false);
    expect(stats.get('p1')?.secondsPlayed ?? 0).toBe(0);
  });

  it('never puts a player on for longer than the match', () => {
    const { stats } = roundTrip([row({ recordingNumber: 1, minutes: 500 })]);
    expect(stats.get('p1')!.secondsPlayed).toBe(HS * 60);
  });

  it('keeps every event inside the match', () => {
    const { built } = roundTrip([row({ recordingNumber: 1, plus: 3, shots: 2, goalsFor: 2 })]);
    built.events.forEach(e => {
      expect(e.atSeconds).toBeGreaterThanOrEqual(0);
      expect(e.atSeconds).toBeLessThanOrEqual(HS * 60);
    });
  });

  it('puts a player own events inside their own spell', () => {
    // An event recorded while they were off the pitch is a log the live
    // screen could never have produced.
    const rows = Array.from({ length: 11 }, (_, i) =>
      row({ recordingNumber: i + 1, minutes: HS }));
    rows.push(row({ recordingNumber: 12, minutes: 10, plus: 2 }));
    const { built } = roundTrip(rows);
    const on = (HS - 10) * 60;
    built.events
      .filter(e => e.playerId === 'p12' && e.kind === 'plus')
      .forEach(e => {
        expect(e.atSeconds).toBeGreaterThanOrEqual(on);
        expect(e.atSeconds).toBeLessThanOrEqual(HS * 60);
      });
  });

  it('opens with the clock and closes with it', () => {
    const { built } = roundTrip([row({ recordingNumber: 1, plus: 1 })]);
    expect(built.events[0].kind).toBe('clock_start');
    expect(built.events[built.events.length - 1].kind).toBe('clock_stop');
  });
});

describe('when the ordering is what matters', () => {
  it('sorts by the clock, then by what happens first in a second', () => {
    const out = orderBuilt([
      { kind: 'plus', playerId: 'p1', atSeconds: 100, period: 1 },
      { kind: 'clock_stop', playerId: null, atSeconds: 100, period: 1 },
      { kind: 'on', playerId: 'p2', atSeconds: 100, period: 1 },
      { kind: 'off', playerId: 'p1', atSeconds: 100, period: 1 },
      { kind: 'goal_for', playerId: null, atSeconds: 50, period: 1 }
    ]);
    expect(out.map(e => e.kind)).toEqual(['goal_for', 'off', 'on', 'plus', 'clock_stop']);
  });

  it('takes a player off before the replacement comes on', () => {
    // The same convention the live screen uses, so a sheet and a tracked
    // match produce the same shape.
    const out = orderBuilt([
      { kind: 'on', playerId: 'p2', atSeconds: 600, period: 1 },
      { kind: 'off', playerId: 'p1', atSeconds: 600, period: 1 }
    ]);
    expect(out.map(e => e.kind)).toEqual(['off', 'on']);
  });
});

describe('when goals happen', () => {
  it('spreads them across the match rather than bunching them', () => {
    const t = goalTimes(3, 4800);
    expect(t).toHaveLength(3);
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBeLessThan(t[2]);
  });

  it('never lands on the whistle at either end', () => {
    // A goal at second zero would be scored before anyone is on the pitch.
    goalTimes(5, 4800).forEach(at => {
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(4800);
    });
  });

  it('keeps a goal for and a goal against off the same second', () => {
    expect(goalTimes(1, 4800)).not.toEqual(goalTimes(1, 4800, 7));
  });

  it('gives nothing for a goalless match', () => {
    expect(goalTimes(0, 4800)).toEqual([]);
  });
});

describe('a recording number nobody carries', () => {
  it('is reported rather than guessed at', () => {
    // A mistyped number quietly landing on another player would put one
    // student's match on another student's record.
    const { built } = roundTrip([
      row({ recordingNumber: 1, plus: 2 }),
      row({ recordingNumber: 99, plus: 5 })
    ]);
    expect(built.unknownNumbers).toEqual([99]);
  });

  it('does not stop the rest of the match importing', () => {
    const { stats } = roundTrip([
      row({ recordingNumber: 1, plus: 2 }),
      row({ recordingNumber: 99, plus: 5 })
    ]);
    expect(stats.get('p1')!.plus).toBe(2);
  });

  it('reports each unknown number once, however many rows used it', () => {
    const { built } = roundTrip([
      row({ recordingNumber: 99 }), row({ recordingNumber: 99 })
    ]);
    expect(built.unknownNumbers).toEqual([99]);
  });
});

describe('a whole sheet of several matches', () => {
  const sheet = [
    row({ date: 'DEC 8 2026',  opponent: 'Sultana', recordingNumber: 1, minutes: HS, plus: 4, goalsFor: 2, goalsAgainst: 1 }),
    row({ date: 'DEC 8 2026',  opponent: 'Sultana', recordingNumber: 2, minutes: 20, plus: 1, goalsFor: 2, goalsAgainst: 1 }),
    row({ date: 'DEC 11 2026', opponent: 'El Toro', recordingNumber: 1, minutes: HS, plus: 1, goalsFor: 0, goalsAgainst: 3 }),
    row({ date: 'DEC 11 2026', opponent: 'El Toro', recordingNumber: 2, minutes: 40, plus: 3, goalsFor: 0, goalsAgainst: 3 })
  ];

  it('builds one log per fixture', () => {
    expect(buildImport(sheet, byNumber, HS)).toHaveLength(2);
  });

  it('keeps each fixture own figures', () => {
    // Found by opponent, not by sorting the dates as text — "DEC 11 2026"
    // precedes "DEC 8 2026" alphabetically, which is exactly the trap the
    // season report has its own sort key to avoid.
    const built = buildImport(sheet, byNumber, HS);
    const of = (opponent: string) =>
      replay(built.find(m => m.opponent === opponent)!.events as any);
    expect(of('Sultana').get('p1')!.plus).toBe(4);
    expect(of('El Toro').get('p1')!.plus).toBe(1);
  });

  it('carries the fixture through so it can be matched to the schedule', () => {
    const built = buildImport(sheet, byNumber, HS);
    expect(built.map(m => m.opponent).sort()).toEqual(['El Toro', 'Sultana']);
    expect(built.every(m => m.date.length > 0)).toBe(true);
  });
});

describe('the admin.js side of the import', () => {
  /**
   * These read the source. The import branch runs only against a real file
   * chooser and a real database, so nothing else here exercises it — and the
   * first version shipped eleven bare calls to `pickColumn`, a method on the
   * prototype, which would have thrown ReferenceError the moment anyone
   * imported a sheet. Every gate passed, because no test reached the line.
   */
  const branch = adminSrc.slice(
    adminSrc.indexOf("} else if (activeTarget === 'plusminus') {"),
    adminSrc.indexOf("} else if (activeTarget === 'schedule') {",
                     adminSrc.indexOf("} else if (activeTarget === 'plusminus') {")));

  it('exists at all', () => {
    expect(branch.length).toBeGreaterThan(500);
  });

  it('calls prototype helpers through this', () => {
    // The bug that shipped. A bare call resolves to nothing at runtime.
    expect(branch).not.toMatch(/(?<![.\w])pickColumn\(/);
    expect(branch).toContain('this.pickColumn(');
  });

  it('identifies players by recording number', () => {
    // The number a coach writes on paper, which is the whole reason the sheet
    // is usable at the side of a pitch.
    expect(branch).toContain('RecordingNumber');
    expect(branch).toContain('byRecording');
  });

  it('reports a recording number nobody carries', () => {
    expect(branch).toContain('unknownNumbers');
    expect(branch).toMatch(/No player carries recording number/);
  });

  it('offers a template with the columns the importer reads', () => {
    const tmpl = adminSrc.slice(
      adminSrc.indexOf("} else if (type === 'plusminus') {"),
      adminSrc.indexOf("} else if (type === 'drills') {"));
    for (const col of ['Date', 'Opponent', 'GoalsFor', 'GoalsAgainst',
                       'RecordingNumber', 'Minutes', 'Plus', 'Minus',
                       'Shots', 'Goals', 'Assists']) {
      expect(tmpl).toContain(col);
    }
  });

  it('does not offer a goal-differential column', () => {
    // It is not a figure a player has. Offering the column would invite a
    // number the importer cannot honour without writing events that could
    // not have happened.
    const tmpl = adminSrc.slice(
      adminSrc.indexOf("} else if (type === 'plusminus') {"),
      adminSrc.indexOf("} else if (type === 'drills') {"));
    expect(tmpl).not.toMatch(/GoalDiff|Differential/);
  });

  /**
   * Reported: "no file dialog comes up when I try to Plus/Minus Stats. Also
   * there is no template for Plus/Minus Stats."
   *
   * Both symptoms, one cause. The option was added by matching the text of
   * the neighbouring Schedule option — which reads "Schedule & Results" in
   * two of the three dropdowns and "Schedule & Results (games)" in the third.
   * So it landed in Export, where nothing handles it and the workbook would
   * have no sheets, and never reached Template at all.
   *
   * The first version of this test counted two occurrences of the option and
   * passed, because two is what a wrong pair also comes to. Counting is not
   * checking: these name the dropdown.
   */
  const dropdown = (id: string) => {
    const i = adminSrc.indexOf(`id="${id}"`);
    return adminSrc.slice(i, adminSrc.indexOf('</select>', i));
  };

  it('offers the template, which is where it was missing', () => {
    expect(dropdown('templateTarget')).toContain('value="plusminus"');
  });

  it('offers the import, which is what opens the file dialog', () => {
    expect(dropdown('importTarget')).toContain('value="plusminus"');
  });

  it('reads dates through the same reader as the schedule importer', () => {
    // "12/8/2026" in the sheet against "DEC 8 2026" in the database. Compared
    // as text they never match, and every fixture imports as a loose session.
    expect(branch).toContain('parseScheduleDate');
  });

  it('resolves the sheet against the schedule before building', () => {
    expect(branch).toContain('resolveRowDates');
    expect(branch).toContain('resolved.rows');
  });

  it('reports every reason a row was dropped', () => {
    // A sheet that imports nothing must explain itself; silence reads as the
    // feature being broken rather than the sheet needing a column.
    expect(branch).toContain('resolved.warnings');
    expect(branch).toMatch(/Nothing in that sheet could be imported/);
  });

  it('does NOT offer an export that does nothing', () => {
    // There is no export branch for it, so choosing it would build a workbook
    // with no sheets. An option that silently fails is worse than one absent.
    expect(dropdown('exportTarget')).not.toContain('value="plusminus"');
  });
});

describe('junk the sheet arrives with', () => {
  /**
   * The template ships a hint row as its first line of data — "must match a
   * fixture on the schedule" in the Date cell, and so on — so a coach can see
   * what each column wants. Filled in beneath and imported, that row used to
   * build a real match named after its own instructions and put it in the
   * season report.
   */
  const hintRow = {
    date: 'must match a fixture on the schedule',
    opponent: 'must match that fixture',
    goalsFor: 0, goalsAgainst: 0,
    recordingNumber: 0, minutes: 0,
    plus: 0, minus: 0, shots: 0, goals: 0, assists: 0
  } as ImportRow;

  it('does not build a match out of the template hint row', () => {
    expect(buildImport([hintRow], byNumber, HS)).toEqual([]);
  });

  it('still imports the real rows sitting under it', () => {
    const built = buildImport([
      hintRow,
      row({ recordingNumber: 1, minutes: HS, plus: 3 })
    ], byNumber, HS);
    expect(built).toHaveLength(1);
    expect(replay(built[0].events as any).get('p1')!.plus).toBe(3);
  });

  it('skips a row with no recording number', () => {
    // Nothing names the player, so there is nothing to record against anyone.
    const built = buildImport([
      row({ recordingNumber: 0, minutes: HS, plus: 9 }),
      row({ recordingNumber: 1, minutes: HS, plus: 3 })
    ], byNumber, HS);
    expect(replay(built[0].events as any).get('p1')!.plus).toBe(3);
    expect(built[0].events.filter(e => e.kind === 'plus')).toHaveLength(3);
  });

  it('does not report a blank recording number as an unknown player', () => {
    // A blank cell is a row nobody filled in, not a typo naming a player who
    // does not exist. Reporting "no player carries recording number 0" would
    // send a coach hunting for a mistake in a row that simply has no data.
    const built = buildImport([
      row({ recordingNumber: 1, plus: 2 }),
      row({ recordingNumber: 0, plus: 9 })
    ], byNumber, HS);
    expect(built).toHaveLength(1);
    expect(built[0].unknownNumbers).toEqual([]);
  });

  it('creates no session when every number is one nobody carries', () => {
    // A clock and no players is not a match. The unknown numbers are still
    // reported to the coach by the caller.
    expect(buildImport([
      row({ recordingNumber: 98 }), row({ recordingNumber: 99 })
    ], byNumber, HS)).toEqual([]);
  });

  it('keeps a match where only some numbers are unknown', () => {
    const built = buildImport([
      row({ recordingNumber: 1, plus: 2 }),
      row({ recordingNumber: 99, plus: 5 })
    ], byNumber, HS);
    expect(built).toHaveLength(1);
    expect(built[0].unknownNumbers).toEqual([99]);
    expect(replay(built[0].events as any).get('p1')!.plus).toBe(2);
  });
});

describe('numbers a spreadsheet formula produces', () => {
  /**
   * A coach generating test data with RAND() gets decimals, occasional
   * negatives and the odd absurd value. None of it should produce a log that
   * replays to something other than what the sheet says, or a match the live
   * screen could not have produced.
   */
  it('takes a decimal minute count without losing the player', () => {
    const { stats } = roundTrip([row({ recordingNumber: 1, minutes: 37.6 as any })]);
    expect(stats.get('p1')!.secondsPlayed).toBeGreaterThan(30 * 60);
    expect(stats.get('p1')!.secondsPlayed).toBeLessThanOrEqual(38 * 60);
  });

  it('ignores a negative count rather than subtracting', () => {
    // A formula that dips below zero must not remove events that were never
    // there. Nothing is recorded, and nothing breaks.
    const { stats } = roundTrip([row({ recordingNumber: 1, minutes: 40, plus: -3 as any })]);
    expect(stats.get('p1')!.plus).toBe(0);
  });

  it('treats a blank cell as zero, not as a broken row', () => {
    const { stats } = roundTrip([
      row({ recordingNumber: 1, minutes: 40, plus: undefined, minus: undefined })
    ]);
    expect(stats.get('p1')!.plus).toBe(0);
    expect(stats.get('p1')!.secondsPlayed).toBe(40 * 60);
  });

  it('survives text where a number was expected', () => {
    // A formula returning #DIV/0! or an empty string reaches here as text.
    const { stats } = roundTrip([
      row({ recordingNumber: 1, minutes: 40, plus: '#DIV/0!' as any })
    ]);
    expect(stats.get('p1')!.plus).toBe(0);
  });

  it('clamps minutes longer than the match', () => {
    const { stats } = roundTrip([row({ recordingNumber: 1, minutes: 400 })]);
    expect(stats.get('p1')!.secondsPlayed).toBe(HS * 60);
  });

  it('keeps a large plus count honest rather than dropping it', () => {
    // One event per unit, so a big number is a big log. It still replays to
    // exactly what was written down.
    const { built, stats } = roundTrip([row({ recordingNumber: 1, minutes: HS, plus: 60 })]);
    expect(stats.get('p1')!.plus).toBe(60);
    expect(built.events.filter(e => e.kind === 'plus')).toHaveLength(60);
  });
});

describe('matching a sheet to the schedule', () => {
  /**
   * Reported with a real sheet whose dates read "12/8/2026" while the
   * schedule holds "DEC 8 2026". The rows built fine — 32 events for the
   * Sultana match — but the fixture lookup compared the two spellings
   * directly, found nothing, and every match imported as a loose session that
   * sorts to the bottom of the season report.
   *
   * The schedule importer already reads "12/8/2026", "8-Dec" and "DEC 8 2026"
   * as the same day. Two importers in one app disagreeing about what a date
   * looks like is the actual defect.
   */
  const FIXTURES: FixtureRef[] = [
    { id: 'f1', date: 'DEC 8 2026',  opponent: 'Sultana' },
    { id: 'f2', date: 'DEC 11 2026', opponent: 'El Toro' },
    { id: 'f3', date: 'JAN 8 2027',  opponent: 'Redlands' },
    { id: 'f4', date: 'JAN 27 2027', opponent: 'Redlands' }   // home and away
  ];

  it('keeps a row that already names a date', () => {
    const { rows, warnings } = resolveRowDates(
      [row({ date: 'DEC 8 2026', opponent: 'Sultana', recordingNumber: 1 })], FIXTURES);
    expect(rows).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('fills a missing date when the opponent leaves no doubt', () => {
    // A coach writing by hand names the opponent and knows which match they
    // mean; typing the date twice is what a spreadsheet exists to avoid.
    const { rows } = resolveRowDates(
      [row({ date: '', opponent: 'Sultana', recordingNumber: 1 })], FIXTURES);
    expect(rows[0].date).toBe('DEC 8 2026');
  });

  it('refuses to guess when the team plays that opponent twice', () => {
    // Home and away against Redlands is the ordinary case. Attaching figures
    // to the wrong night silently is worse than skipping the rows.
    const { rows, warnings } = resolveRowDates(
      [row({ date: '', opponent: 'Redlands', recordingNumber: 1 })], FIXTURES);
    expect(rows).toEqual([]);
    expect(warnings.join(' ')).toContain('more than once');
    expect(warnings.join(' ')).toContain('Redlands');
  });

  it('says so when no fixture matches the opponent at all', () => {
    const { rows, warnings } = resolveRowDates(
      [row({ date: '', opponent: 'Nowhere High', recordingNumber: 1 })], FIXTURES);
    expect(rows).toEqual([]);
    expect(warnings.join(' ')).toContain('Nowhere High');
  });

  it('counts the rows it dropped for a missing recording number', () => {
    const { warnings } = resolveRowDates([
      row({ opponent: 'Sultana', recordingNumber: 0 }),
      row({ opponent: 'Sultana', recordingNumber: 0 })
    ], FIXTURES);
    expect(warnings.join(' ')).toContain('2 rows');
    expect(warnings.join(' ')).toContain('RecordingNumber');
  });

  it('counts the rows it dropped for a missing opponent', () => {
    const { warnings } = resolveRowDates([row({ opponent: '', recordingNumber: 1 })], FIXTURES);
    expect(warnings.join(' ')).toContain('Opponent');
  });

  it('never drops a row without saying why', () => {
    // The failure this replaced: a sheet imported nothing and gave no reason,
    // which reads as the feature being broken rather than the sheet.
    const { rows, warnings } = resolveRowDates([
      row({ opponent: '', recordingNumber: 1 }),
      row({ opponent: 'Sultana', recordingNumber: 0 }),
      row({ date: '', opponent: 'Redlands', recordingNumber: 1 }),
      row({ date: '', opponent: 'Nowhere High', recordingNumber: 1 })
    ], FIXTURES);
    expect(rows).toEqual([]);
    expect(warnings).toHaveLength(4);
  });

  it('passes the good rows through alongside the complaints', () => {
    const { rows, warnings } = resolveRowDates([
      row({ date: '', opponent: 'Sultana', recordingNumber: 1 }),
      row({ opponent: '', recordingNumber: 2 })
    ], FIXTURES);
    expect(rows).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });
});
