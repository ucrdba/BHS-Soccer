/**
 * A player's progress across repeated sessions of the same exercise.
 *
 * Extracted from public/js/views/progress.view.js during the Vue migration
 * (Phase 0). progressBlocksFor and buildProgressReport stay in the view: they
 * reach across to report.view.js for reportStandardSeconds and read
 * drillsBank, so moving them would drag two more views along.
 */

export interface ProgressPoint { on: string; value: number }
export interface ProgressTrend {
  direction: 'better' | 'worse' | 'level'; delta: number; first: number; last: number;
}

/** A faster time is an improvement; a higher count is. */
export function progressLowerIsBetter(measure: string): boolean {
  return measure === 'time_low' || measure === 'time_bands';
}

/**
 * One player's readings for one exercise, oldest first.
 *
 * Absences and unfilled sessions are dropped rather than read as zero: a
 * session a player missed is not a result of nothing, and plotting it as one
 * would draw a collapse that never happened.
 */
export function progressSeries(
  sessionHistory: any[], playerId: string, drillId: string
): ProgressPoint[] {
  return (sessionHistory || [])
    .filter(r => r.playerId === playerId
      && r.drillId === drillId
      && r.attendance === 'present'
      && r.rawValue !== null && r.rawValue !== undefined && Number.isFinite(Number(r.rawValue)))
    .map(r => ({ on: r.occurredOn, value: Number(r.rawValue) }))
    .sort((a, b) => String(a.on).localeCompare(String(b.on)));
}

/**
 * First reading against last, in the direction the measure runs.
 *
 * Null below two readings: a single result is not a trend, and calling it
 * "level" would put a verdict on a player who has done the exercise once.
 */
export function progressTrend(
  series: ProgressPoint[], lowerIsBetter: boolean
): ProgressTrend | null {
  if (!series || series.length < 2) return null;
  const first = series[0].value;
  const last = series[series.length - 1].value;
  if (first === last) return { direction: 'level', delta: 0, first, last };

  const improved = lowerIsBetter ? last < first : last > first;
  return {
    direction: improved ? 'better' : 'worse',
    delta: Math.abs(last - first),
    first, last
  };
}
