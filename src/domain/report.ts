/**
 * The squad report's shared helpers.
 *
 * Extracted from public/js/views/report.view.js during the Vue migration
 * (Phase 0). buildSquadReport stays in the view: it is built out of
 * reportBlock, which reads the exercise-points cache and formats through the
 * Supabase client, so it is not pure and cannot be made so by passing
 * parameters.
 */

/**
 * The standard a timed exercise is measured against.
 *
 * The fastest band, because bands are "at or under X earns Y" and the tightest
 * one is the target. Null when no bands are set, which means the exercise is
 * not counted for this squad at all rather than that everyone failed it.
 */
export function reportStandardSeconds(
  bandsByDrill: Record<string, any[]>, drillId: string
): number | null {
  const bands = (bandsByDrill || {})[drillId] || [];
  if (!bands.length) return null;
  return Math.min(...bands.map(b => Number(b.max_seconds)));
}
