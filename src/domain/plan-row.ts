/**
 * The write side of a practice plan.
 *
 * `saveFullPracticePlan` **upserts and never deletes**. It writes the rows it
 * is handed and leaves everything else in the table, so a drill taken out of
 * the plan locally is still a row in `practice_plans` and reappears on the
 * next reload. `removedItemIds` is what the caller uses to soft-delete those
 * rows instead — miss it and a deleted drill is immortal.
 *
 * Extracted from public/js/views/planner.view.js during Phase 4.
 */
import type { PlanItem } from './practice-plan';

/**
 * The same shape `SupabaseService.isUuid` checks.
 *
 * Locally created drills carry an id like `p_1724567890`, which has no row
 * behind it. Sending one as an upsert key tries to update a row that does not
 * exist, and the drill is silently never saved.
 */
function isUuid(value: any): boolean {
  return typeof value === 'string' && value.length === 36 && value.includes('-');
}

/** The rows one named plan writes to `practice_plans`. */
export function toPlanRows(planName: string, items: PlanItem[], teamId: string): any[] {
  return (items || []).map(d => {
    const row: Record<string, any> = {
      team_id: teamId,
      name: planName || 'Standard Practice Plan',
      drill: d?.name || 'Soccer Drill',
      time_slot: d?.time || '',
      duration: d?.duration || '',
      coach_notes: d?.coachNotes || '',
      diagram_image: d?.diagramImage || null,
      diagram_data: d?.diagramData || null
    };
    if (isUuid(d?.id)) row.id = d!.id;
    return row;
  });
}

/**
 * The stored rows the new plan no longer contains.
 *
 * Only real uuids: a drill added and removed in one sitting was never
 * written. And a reorder loses nobody, so the same drills in a different
 * order return nothing — deleting there would delete a drill the coach only
 * moved.
 */
export function removedItemIds(before: PlanItem[], after: PlanItem[]): string[] {
  const kept = new Set((after || []).map(d => d?.id).filter(Boolean));
  return (before || [])
    .map(d => d?.id)
    .filter((id): id is string => isUuid(id) && !kept.has(id));
}
