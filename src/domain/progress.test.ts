/**
 * A player's progress across repeated sessions of the same exercise.
 *
 * Two rules carry this file, and both are about not inventing a story.
 *
 * **A session a player missed is dropped, not read as zero.** An absence is
 * not a result of nothing, and plotting it as one draws a collapse that never
 * happened — on a chart a coach uses to decide who is improving.
 *
 * **One reading is not a trend.** Below two results the answer is null rather
 * than "level", because "level" is a verdict on a player who has done the
 * exercise once.
 *
 * And low-minute or rarely-present players stay in: they are the ones these
 * views exist to look at.
 *
 * Ported from the agreement tests that loaded the legacy view.
 */
import { describe, it, expect } from 'vitest';
import { progressLowerIsBetter, progressSeries, progressTrend } from './progress';

const history = [
  { playerId: 'p1', drillId: 'd1', attendance: 'present', rawValue: 300, occurredOn: '2026-01-08' },
  { playerId: 'p1', drillId: 'd1', attendance: 'present', rawValue: 280, occurredOn: '2026-01-01' },
  { playerId: 'p1', drillId: 'd1', attendance: 'absent', rawValue: null, occurredOn: '2026-01-15' },
  { playerId: 'p1', drillId: 'd2', attendance: 'present', rawValue: 12, occurredOn: '2026-01-01' },
  { playerId: 'p2', drillId: 'd1', attendance: 'present', rawValue: 250, occurredOn: '2026-01-01' }
];

describe('which way the measure runs', () => {
  it('reads a lower time as better', () => {
    expect(progressLowerIsBetter('time_low')).toBe(true);
    expect(progressLowerIsBetter('time_bands')).toBe(true);
  });

  it('reads a higher count as better', () => {
    expect(progressLowerIsBetter('count_high')).toBe(false);
    expect(progressLowerIsBetter('head_to_head')).toBe(false);
    expect(progressLowerIsBetter('win_loss')).toBe(false);
  });
});

describe('one player, one exercise', () => {
  it('returns that player and that exercise only', () => {
    const s = progressSeries(history, 'p1', 'd1');
    expect(s.map(p => p.value)).toEqual([280, 300]);
  });

  it('is OLDEST FIRST, whatever order the rows arrived in', () => {
    const s = progressSeries(history, 'p1', 'd1');
    expect(s.map(p => p.on)).toEqual(['2026-01-01', '2026-01-08']);
  });

  it('returns nothing for a player with no results', () => {
    expect(progressSeries(history, 'nobody', 'd1')).toEqual([]);
  });

  it('copes with no history at all', () => {
    expect(progressSeries(null as any, 'p1', 'd1')).toEqual([]);
  });
});

describe('AN ABSENCE IS NOT A ZERO', () => {
  it('drops a session the player missed rather than plotting it', () => {
    // Plotting it as zero draws a collapse that never happened.
    const s = progressSeries(history, 'p1', 'd1');
    expect(s).toHaveLength(2);
    expect(s.some(p => p.value === 0)).toBe(false);
  });

  it('drops a present session with no value recorded', () => {
    const rows = [
      { playerId: 'p1', drillId: 'd1', attendance: 'present', rawValue: null, occurredOn: '2026-01-01' },
      { playerId: 'p1', drillId: 'd1', attendance: 'present', rawValue: 300, occurredOn: '2026-01-08' }
    ];
    expect(progressSeries(rows, 'p1', 'd1')).toHaveLength(1);
  });

  it('drops a value that is not a number', () => {
    const rows = [
      { playerId: 'p1', drillId: 'd1', attendance: 'present', rawValue: 'DNF', occurredOn: '2026-01-01' }
    ];
    expect(progressSeries(rows, 'p1', 'd1')).toEqual([]);
  });

  it('KEEPS A GENUINE ZERO, which is a result', () => {
    const rows = [
      { playerId: 'p1', drillId: 'd1', attendance: 'present', rawValue: 0, occurredOn: '2026-01-01' }
    ];
    expect(progressSeries(rows, 'p1', 'd1')).toEqual([{ on: '2026-01-01', value: 0 }]);
  });

  it('keeps a player who has attended only once', () => {
    // Rarely-present players are the audience for this view, not noise in it.
    const rows = [
      { playerId: 'p9', drillId: 'd1', attendance: 'present', rawValue: 320, occurredOn: '2026-01-01' }
    ];
    expect(progressSeries(rows, 'p9', 'd1')).toHaveLength(1);
  });
});

describe('the trend, first reading against last', () => {
  const faster = [{ on: 'a', value: 300 }, { on: 'b', value: 280 }];
  const slower = [{ on: 'a', value: 280 }, { on: 'b', value: 300 }];

  it('reads a falling time as better when lower is better', () => {
    expect(progressTrend(faster, true)).toEqual({
      direction: 'better', delta: 20, first: 300, last: 280
    });
  });

  it('reads the same numbers as WORSE when higher is better', () => {
    // The same series means opposite things for a sprint and a rep count.
    expect(progressTrend(faster, false)!.direction).toBe('worse');
    expect(progressTrend(slower, false)!.direction).toBe('better');
  });

  it('ignores the readings in between', () => {
    const wobble = [{ on: 'a', value: 300 }, { on: 'b', value: 400 }, { on: 'c', value: 280 }];
    expect(progressTrend(wobble, true)!.direction).toBe('better');
    expect(progressTrend(wobble, true)!.delta).toBe(20);
  });

  it('reports level when the two ends match', () => {
    const same = [{ on: 'a', value: 300 }, { on: 'b', value: 300 }];
    expect(progressTrend(same, true)).toEqual({
      direction: 'level', delta: 0, first: 300, last: 300
    });
  });

  it('ONE READING IS NOT A TREND', () => {
    // "Level" would be a verdict on a player who has done it once.
    expect(progressTrend([{ on: 'a', value: 300 }], true)).toBeNull();
  });

  it('is null for no readings at all', () => {
    expect(progressTrend([], true)).toBeNull();
    expect(progressTrend(null as any, true)).toBeNull();
  });
});
