/**
 * The squad performance report — the sheet that goes on the locker-room wall.
 *
 * One block per drill, each showing what that drill is actually for. The
 * distinction that matters:
 *
 *   Competitive drills (1v1, small-sided) ARE a ranking. Beating your
 *   team-mates is the point, and the block is ordered by it.
 *
 *   Fitness standards are NOT. They answer "can this player last a full
 *   match", so the block lists everyone with met or not yet, ordered by
 *   recording number. Ordering those by time would turn a pass/fail check into
 *   a league table, which is the opposite of what the drill is for.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import matrixSrc from '../../public/js/views/matrix.view.js?raw';
import reportSrc from '../../public/js/views/report.view.js?raw';
import { supabaseService } from './supabase';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, matrixSrc, reportSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const LAPS = 'd-laps';
const GAUNTLET = 'd-1v1';
const COOPERS = 'd-coopers';

const point = (over: any) => ({
  player_id: 'p1', drill_id: LAPS, exercise: '3 Laps', kind: 'time_band',
  raw_value: null, weight: 1, earned: 0, available: 1,
  w: 0, dr: 0, ls: 0, exercise_count: 1, ...over
});

function makeApp(points: any[]): any {
  const app = Object.create(ctor.prototype);
  app.data = {
    teams: [{ id: 't1', name: 'Varsity', school_id: 's1' }],
    players: [
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 1 },
      { id: 'p2', name: 'Ashton Earls', recordingNumber: 7 },
      { id: 'p3', name: 'Juan Marcias', recordingNumber: 14 }
    ],
    drillsBank: [
      { id: LAPS, name: '3 Laps', points: 1, measure: 'time_bands' },
      { id: GAUNTLET, name: '1v1 Gauntlet', points: 3, measure: 'head_to_head' },
      { id: COOPERS, name: 'Coopers', points: 1, measure: 'count_high' }
    ]
  };
  app.activeTeamId = 't1';
  app._exercisePoints = points;
  // The tightest band is the standard: 4:30.
  app._reportBands = { [LAPS]: [
    { max_seconds: 270, factor: 1 }, { max_seconds: 280, factor: 0.5 }, { max_seconds: 290, factor: 0.25 }
  ] };
  app.activeTeamLabel = () => ({ team: 'Varsity', org: 'Beaumont', season: '2026' });
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    isConfigured: () => true,
    formatSecondsAsTime: (v: any) => supabaseService.formatSecondsAsTime(v),
    factorForTime: (s: any, b: any) => supabaseService.factorForTime(s, b)
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('a fitness standard', () => {
  // The times deliberately run OPPOSITE to the recording numbers, so a block
  // ordered by time and a block ordered by number are distinguishable. With
  // both running the same way the ordering test cannot tell them apart.
  const points = [
    point({ player_id: 'p1', raw_value: 288, earned: 0.25 }),   // #1  — 4:48, not yet
    point({ player_id: 'p2', raw_value: 274, earned: 0.5 }),    // #7  — 4:34, not yet
    point({ player_id: 'p3', raw_value: 255, earned: 1 })       // #14 — 4:15, met
  ];

  it('lists everyone, not just those who passed', () => {
    const block = makeApp(points).reportBlock(LAPS);
    expect(block.rows).toHaveLength(3);
  });

  it('marks who met the standard and who has not yet', () => {
    const rows = makeApp(points).reportBlock(LAPS).rows;
    expect(rows.find((r: any) => r.playerId === 'p3').met).toBe(true);
    expect(rows.find((r: any) => r.playerId === 'p2').met).toBe(false);
  });

  it('measures against the TIGHTEST band, which is the standard', () => {
    // Earning a part band is not meeting the standard: 4:34 scores 0.5 and is
    // still not match-fit.
    const rows = makeApp(points).reportBlock(LAPS).rows;
    expect(rows.find((r: any) => r.playerId === 'p2').earned).toBe(0.5);
    expect(rows.find((r: any) => r.playerId === 'p2').met).toBe(false);
  });

  it('is NOT ordered by time, which would make it a ranking', () => {
    // The whole point: this drill answers "are they fit", not "who is fastest".
    const rows = makeApp(points).reportBlock(LAPS).rows;
    expect(rows.map((r: any) => r.recordingNumber)).toEqual([1, 7, 14]);
  });

  it('says it is a standard rather than a ranking', () => {
    expect(makeApp(points).reportBlock(LAPS).isStandard).toBe(true);
  });

  it('counts how many met it, for the heading', () => {
    const block = makeApp(points).reportBlock(LAPS);
    expect(block.metCount).toBe(1);
    expect(block.rows.length).toBe(3);
  });

  it('shows the time as a time', () => {
    const rows = makeApp(points).reportBlock(LAPS).rows;
    expect(rows.find((r: any) => r.playerId === 'p3').figure).toBe('4:15');
  });

  it('includes a player with no result, so the sheet is complete', () => {
    const rows = makeApp([
      point({ player_id: 'p1', raw_value: 255, earned: 1 }),
      point({ player_id: 'p2', kind: 'not_entered', raw_value: null, earned: 0 })
    ]).reportBlock(LAPS).rows;

    const p2 = rows.find((r: any) => r.playerId === 'p2');
    expect(p2.figure).toBe('—');
    expect(p2.met).toBe(false);
  });
});

describe('a competitive drill', () => {
  const points = [
    point({ drill_id: GAUNTLET, kind: 'head_to_head', player_id: 'p1', w: 3, weight: 3, earned: 9, available: 9 }),
    point({ drill_id: GAUNTLET, kind: 'head_to_head', player_id: 'p2', w: 5, weight: 3, earned: 15, available: 15 })
  ];

  it('IS ordered as a ranking, because beating team-mates is the point', () => {
    const rows = makeApp(points).reportBlock(GAUNTLET).rows;
    expect(rows[0].playerId).toBe('p2');
  });

  it('shows the win-draw-loss record as the figure', () => {
    const rows = makeApp(points).reportBlock(GAUNTLET).rows;
    expect(rows[0].figure).toBe('5 - 0 - 0');
  });

  it('is not marked as a standard', () => {
    expect(makeApp(points).reportBlock(GAUNTLET).isStandard).toBe(false);
  });
});

describe('a counted drill', () => {
  const points = [
    point({ drill_id: COOPERS, kind: 'measured', player_id: 'p1', raw_value: 2600, earned: 0.6 }),
    point({ drill_id: COOPERS, kind: 'measured', player_id: 'p2', raw_value: 2900, earned: 1 })
  ];

  it('ranks on the best figure, highest first', () => {
    const rows = makeApp(points).reportBlock(COOPERS).rows;
    expect(rows[0].playerId).toBe('p2');
    expect(rows[0].figure).toBe('2900');
  });
});

describe('the whole report', () => {
  it('has a block for every drill with results, and none for drills without', () => {
    const blocks = makeApp([
      point({ player_id: 'p1', raw_value: 255, earned: 1 }),
      point({ drill_id: GAUNTLET, kind: 'head_to_head', player_id: 'p1', w: 1, earned: 3 })
    ]).buildSquadReport();

    expect(blocks.map((b: any) => b.drillId).sort()).toEqual([GAUNTLET, LAPS].sort());
  });

  it('produces nothing when no results have been recorded', () => {
    expect(makeApp([]).buildSquadReport()).toEqual([]);
  });
});

describe('sorting a block', () => {
  const points = [
    point({ player_id: 'p1', raw_value: 288, earned: 0.25 }),   // #1  Cesar Alva   4:48
    point({ player_id: 'p2', raw_value: 274, earned: 0.5 }),    // #7  Ashton Earls 4:34
    point({ player_id: 'p3', raw_value: 255, earned: 1 })       // #14 Juan Marcias 4:15
  ];

  const sorted = (by: string, times = 1) => {
    const app = makeApp(points);
    (app as any).renderSquadReport = () => '';   // no DOM in this test
    for (let i = 0; i < times; i++) app.setReportSort(LAPS, by, true);
    return app.reportBlock(LAPS).rows;
  };

  it('opens as a checklist, before anything is clicked', () => {
    // The default still matters: a fitness standard asks "is this player match
    // fit", so it starts in recording-number order rather than as a ranking.
    expect(makeApp(points).reportBlock(LAPS).rows.map((r: any) => r.recordingNumber))
      .toEqual([1, 7, 14]);
  });

  it('sorts by time when the coach asks for it', () => {
    expect(sorted('figure').map((r: any) => r.recordingNumber)).toEqual([14, 7, 1]);
  });

  it('puts the fastest first on a timed column, in one click', () => {
    // Not blind ascending: a first click gives the order the column is read in.
    expect(sorted('figure')[0].figure).toBe('4:15');
  });

  it('reverses when the same column is clicked again', () => {
    expect(sorted('figure', 2).map((r: any) => r.recordingNumber)).toEqual([1, 7, 14]);
  });

  it('compares times as numbers, not as the text shown', () => {
    // "10:00" sorts before "9:00" as text. This is why the raw value is kept.
    const app = makeApp([
      point({ player_id: 'p1', raw_value: 540, earned: 0 }),    // 9:00
      point({ player_id: 'p2', raw_value: 600, earned: 0 })     // 10:00
    ]);
    (app as any).renderSquadReport = () => '';
    app.setReportSort(LAPS, 'figure', true);
    expect(app.reportBlock(LAPS).rows.map((r: any) => r.figure)).toEqual(['9:00', '10:00']);
  });

  it('sorts by name', () => {
    expect(sorted('name').map((r: any) => r.name))
      .toEqual(['Ashton Earls', 'Cesar Alva', 'Juan Marcias']);
  });

  it('sorts by recording number', () => {
    expect(sorted('number').map((r: any) => r.recordingNumber)).toEqual([1, 7, 14]);
  });

  it('sorts a standard by whether the player met it', () => {
    const rows = sorted('points');
    expect(rows[0].met).toBe(true);
  });

  it('sinks a player with no result to the bottom, ascending', () => {
    // They are not the fastest and not the slowest -- they did not run it.
    const app = makeApp([
      point({ player_id: 'p1', raw_value: 288, earned: 0.25 }),
      point({ player_id: 'p2', kind: 'not_entered', raw_value: null, earned: 0 })
    ]);
    (app as any).renderSquadReport = () => '';
    app.setReportSort(LAPS, 'figure', true);
    expect(app.reportBlock(LAPS).rows[1].playerId).toBe('p2');
  });

  it('keeps them at the bottom when reversed too', () => {
    const app = makeApp([
      point({ player_id: 'p1', raw_value: 288, earned: 0.25 }),
      point({ player_id: 'p2', kind: 'not_entered', raw_value: null, earned: 0 })
    ]);
    (app as any).renderSquadReport = () => '';
    app.setReportSort(LAPS, 'figure', true);
    app.setReportSort(LAPS, 'figure', true);
    expect(app.reportBlock(LAPS).rows[1].playerId).toBe('p2');
  });

  it('sorts a competitive drill by wins, most first', () => {
    const app = makeApp([
      point({ drill_id: GAUNTLET, kind: 'head_to_head', player_id: 'p1', w: 3, weight: 3, earned: 9 }),
      point({ drill_id: GAUNTLET, kind: 'head_to_head', player_id: 'p2', w: 5, weight: 3, earned: 15 })
    ]);
    (app as any).renderSquadReport = () => '';
    app.setReportSort(GAUNTLET, 'figure', false);
    expect(app.reportBlock(GAUNTLET).rows[0].playerId).toBe('p2');
  });

  it('sorts each block on its own', () => {
    // Two exercises are two questions; sorting one must not disturb the other.
    const app = makeApp([
      point({ player_id: 'p1', raw_value: 288, earned: 0.25 }),
      point({ player_id: 'p3', raw_value: 255, earned: 1 }),
      point({ drill_id: COOPERS, kind: 'measured', player_id: 'p1', raw_value: 2600, earned: 0.6 }),
      point({ drill_id: COOPERS, kind: 'measured', player_id: 'p3', raw_value: 2900, earned: 1 })
    ]);
    (app as any).renderSquadReport = () => '';
    app.setReportSort(LAPS, 'name', true);

    expect(app.reportBlock(LAPS).sort.by).toBe('name');
    expect(app.reportBlock(COOPERS).sort).toBeNull();
  });

  it('remembers the sort, so printing gives what is on screen', () => {
    const app = makeApp(points);
    (app as any).renderSquadReport = () => '';
    app.setReportSort(LAPS, 'figure', true);
    // buildSquadReport is what the print path uses.
    const block = app.buildSquadReport().find((b: any) => b.drillId === LAPS);
    expect(block.rows.map((r: any) => r.recordingNumber)).toEqual([14, 7, 1]);
  });
});
