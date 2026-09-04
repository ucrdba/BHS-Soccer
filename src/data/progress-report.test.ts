/**
 * The player progress report.
 *
 * Answers what the squad report cannot: not "who is fastest" but "is this
 * player getting better".
 *
 * The rule everything rests on: which direction counts as improvement depends
 * on the exercise. On a timed run a FALLING value is better; on a counted one
 * a RISING value is. Getting that backwards inverts the meaning of every chart
 * on the page, and it would still look entirely plausible.
 *
 * So the chart inverts its y axis for a timed exercise: a line that rises
 * means improvement whichever exercise is being read, and a coach scanning
 * twenty charts never has to remember which way each one goes.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import matrixSrc from '../../public/js/views/matrix.view.js?raw';
import reportSrc from '../../public/js/views/report.view.js?raw';
import progressSrc from '../../public/js/views/progress.view.js?raw';
import { supabaseService } from './supabase';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, matrixSrc, reportSrc, progressSrc].map(strip).join('\n;\n')
    + '\nreturn BHSSoccerApp;'
  )();
});

const LAPS = 'd-laps';       // time_bands — faster is better
const COOPERS = 'd-coopers'; // count_high — more is better

const hit = (over: any) => ({
  sessionId: 's1', occurredOn: '2026-09-01', drillId: LAPS,
  playerId: 'p1', attendance: 'present', rawValue: 270, outcome: null, ...over
});

function makeApp(history: any[]): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = 't1';
  app.data = {
    players: [
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 1 },
      { id: 'p2', name: 'Tom Budde', recordingNumber: 4 },
      { id: 'p3', name: 'No Results', recordingNumber: 9 }
    ],
    drillsBank: [
      { id: LAPS, name: '3 Laps', measure: 'time_bands', points: 1 },
      { id: COOPERS, name: 'Coopers', measure: 'count_high', points: 1 }
    ]
  };
  app._sessionHistory = history;
  app._reportBands = { [LAPS]: [{ max_seconds: 270, factor: 1 }] };
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    isConfigured: () => true,
    formatSecondsAsTime: (v: any) => supabaseService.formatSecondsAsTime(v)
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('which way is better', () => {
  it('knows a timed run improves downwards', () => {
    expect(makeApp([]).progressLowerIsBetter('time_bands')).toBe(true);
    expect(makeApp([]).progressLowerIsBetter('time_low')).toBe(true);
  });

  it('knows a counted exercise improves upwards', () => {
    expect(makeApp([]).progressLowerIsBetter('count_high')).toBe(false);
    expect(makeApp([]).progressLowerIsBetter('win_loss')).toBe(false);
  });
});

describe('a player\'s series', () => {
  const history = [
    hit({ occurredOn: '2026-09-03', rawValue: 255 }),
    hit({ occurredOn: '2026-09-01', rawValue: 288 }),
    hit({ occurredOn: '2026-09-02', rawValue: 270 })
  ];

  it('comes back oldest first, whatever order it arrived in', () => {
    expect(makeApp(history).progressSeries('p1', LAPS).map((p: any) => p.value))
      .toEqual([288, 270, 255]);
  });

  it('leaves out another player', () => {
    const h = [...history, hit({ playerId: 'p2', rawValue: 300 })];
    expect(makeApp(h).progressSeries('p1', LAPS)).toHaveLength(3);
  });

  it('leaves out another exercise', () => {
    const h = [...history, hit({ drillId: COOPERS, rawValue: 2600 })];
    expect(makeApp(h).progressSeries('p1', LAPS)).toHaveLength(3);
  });

  it('leaves out a session the player missed', () => {
    // An absence is not a result of zero. Plotting it as one draws a cliff and
    // makes a player who missed a week look like they collapsed.
    const h = [...history, hit({ occurredOn: '2026-09-04', attendance: 'excused', rawValue: null })];
    expect(makeApp(h).progressSeries('p1', LAPS)).toHaveLength(3);
  });

  it('leaves out an absence that still carries a value', () => {
    // The case the attendance check exists for. A row marked excused or
    // no-show can still hold a number — a result entered and then withdrawn,
    // or a row edited after the fact — and plotting it would put a time on the
    // chart for a session the player did not run.
    const h = [
      ...history,
      hit({ occurredOn: '2026-09-04', attendance: 'excused', rawValue: 400 }),
      hit({ occurredOn: '2026-09-05', attendance: 'unexcused', rawValue: 999 })
    ];
    const values = makeApp(h).progressSeries('p1', LAPS).map((p: any) => p.value);
    expect(values).toEqual([288, 270, 255]);
    expect(values).not.toContain(400);
    expect(values).not.toContain(999);
  });

  it('leaves out a present row with no value recorded', () => {
    const h = [...history, hit({ occurredOn: '2026-09-05', rawValue: null })];
    expect(makeApp(h).progressSeries('p1', LAPS)).toHaveLength(3);
  });
});

describe('the trend', () => {
  const app = () => makeApp([]);
  const series = (...vals: number[]) => vals.map((v, i) => ({ on: `2026-09-0${i + 1}`, value: v }));

  it('calls a falling time an improvement', () => {
    expect(app().progressTrend(series(288, 255), true).direction).toBe('better');
  });

  it('calls a rising time worse', () => {
    expect(app().progressTrend(series(255, 288), true).direction).toBe('worse');
  });

  it('calls a rising count an improvement', () => {
    // The same numbers, the opposite verdict. This is the whole point.
    expect(app().progressTrend(series(255, 288), false).direction).toBe('better');
  });

  it('calls a falling count worse', () => {
    expect(app().progressTrend(series(288, 255), false).direction).toBe('worse');
  });

  it('compares first to last, not the last two', () => {
    // A player who improved overall but dipped once has still improved.
    expect(app().progressTrend(series(300, 250, 280), true).direction).toBe('better');
  });

  it('reports no trend from a single session', () => {
    // One result is a baseline, not a direction. An arrow beside it would
    // assert something the data does not say.
    expect(app().progressTrend(series(270), true)).toBeNull();
  });

  it('reports level when nothing changed', () => {
    expect(app().progressTrend(series(270, 270), true).direction).toBe('level');
  });
});

describe('plotting the points', () => {
  const block = (over: any = {}) => ({
    drillId: LAPS, measure: 'time_bands', lowerIsBetter: true, name: '3 Laps',
    standard: null,
    series: [{ on: '2026-09-01', value: 288 }, { on: '2026-09-03', value: 255 }],
    ...over
  });

  it('puts a FASTER time higher on the chart', () => {
    // Inverted deliberately: a rising line means improvement on every chart,
    // so the reader never has to remember which exercise goes which way.
    const geo = makeApp([]).progressPoints(block(), 300, 96, 12);
    const [first, last] = geo.points;
    expect(last.y).toBeLessThan(first.y);       // smaller y is higher up
  });

  it('puts a HIGHER count higher on the chart', () => {
    const geo = makeApp([]).progressPoints(
      block({ lowerIsBetter: false, series: [{ on: 'a', value: 2400 }, { on: 'b', value: 2900 }] }),
      300, 96, 12);
    expect(geo.points[1].y).toBeLessThan(geo.points[0].y);
  });

  it('spreads the points evenly across the width', () => {
    const geo = makeApp([]).progressPoints(block(), 300, 96, 12);
    expect(geo.points[0].x).toBe(12);
    expect(geo.points[1].x).toBe(288);
  });

  it('centres a lone point instead of pinning it to the left edge', () => {
    const geo = makeApp([]).progressPoints(
      block({ series: [{ on: 'a', value: 270 }] }), 300, 96, 12);
    expect(geo.points[0].x).toBe(150);
  });

  it('does not divide by zero when every result is identical', () => {
    const geo = makeApp([]).progressPoints(
      block({ series: [{ on: 'a', value: 270 }, { on: 'b', value: 270 }] }), 300, 96, 12);
    geo.points.forEach((p: any) => expect(Number.isFinite(p.y)).toBe(true));
  });

  it('keeps every point inside the box', () => {
    const geo = makeApp([]).progressPoints(block(), 300, 96, 12);
    geo.points.forEach((p: any) => {
      expect(p.y).toBeGreaterThanOrEqual(12);
      expect(p.y).toBeLessThanOrEqual(84);
    });
  });

  it('places the standard line, and scales to include it', () => {
    // A squad all faster than the standard would otherwise push the line off
    // the top of the chart, hiding the very thing it is drawn for.
    const geo = makeApp([]).progressPoints(block({ standard: 300 }), 300, 96, 12);
    expect(geo.standardY).not.toBeNull();
    expect(geo.standardY).toBeGreaterThanOrEqual(12);
    expect(geo.standardY).toBeLessThanOrEqual(84);
  });
});

describe('the report as a whole', () => {
  const history = [
    hit({ playerId: 'p1', occurredOn: '2026-09-01', rawValue: 288 }),
    hit({ playerId: 'p1', occurredOn: '2026-09-03', rawValue: 255 }),
    hit({ playerId: 'p2', occurredOn: '2026-09-01', rawValue: 300 })
  ];

  it('has a block per player with results', () => {
    expect(makeApp(history).buildProgressReport().map((r: any) => r.player.id))
      .toEqual(['p1', 'p2']);
  });

  it('leaves out a player who has never been recorded', () => {
    expect(makeApp(history).buildProgressReport().map((r: any) => r.player.id))
      .not.toContain('p3');
  });

  it('orders by recording number, which is how the squad is read', () => {
    expect(makeApp(history).buildProgressReport()[0].player.recordingNumber).toBe(1);
  });

  it('gives a player one chart per exercise they have done', () => {
    const h = [...history, hit({ playerId: 'p1', drillId: COOPERS, rawValue: 2600 })];
    const blocks = makeApp(h).buildProgressReport()[0].blocks;
    expect(blocks.map((b: any) => b.drillId).sort()).toEqual([COOPERS, LAPS].sort());
  });

  it('produces nothing when nothing has been recorded', () => {
    expect(makeApp([]).buildProgressReport()).toEqual([]);
  });

  it('shows a time as a time in the summary', () => {
    const b = makeApp(history).buildProgressReport()[0].blocks[0];
    expect(makeApp(history).progressSummary(b)).toContain('4:48');
    expect(makeApp(history).progressSummary(b)).toContain('4:15');
  });

  it('says a single session is a baseline rather than a direction', () => {
    const b = makeApp(history).buildProgressReport()[1].blocks[0];
    expect(makeApp(history).progressSummary(b)).toContain('one session');
  });
});
