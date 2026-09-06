/**
 * The write side of a practice plan.
 *
 * Two traps in the storage shape live here, and both are the kind a faithful
 * rebuild reproduces without noticing.
 *
 * `saveFullPracticePlan` upserts and never deletes, so a drill taken out of
 * the plan locally is still a row in `practice_plans` and comes back on the
 * next reload. `removedItemIds` is what stops that.
 *
 * And an id is only sent when it is a real uuid. A locally generated
 * `p_1724…` has no row behind it, so sending it would try to update nothing.
 */
import { describe, it, expect } from 'vitest';
import { toPlanRows, removedItemIds } from './plan-row';
import { groupPracticePlans } from './practice-plan';
import type { PlanItem } from './practice-plan';

const TEAM = '11111111-2222-3333-4444-555555555555';
const ROW_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ROW_A = ROW_ID;
const ROW_ID_B = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee';

const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  name: 'Rondo', time: '4:00 PM - 4:20 PM', duration: '20 min',
  coachNotes: 'Two touch', ...over
});

describe('the rows a save sends', () => {
  it('writes one row per drill, all under the plan name', () => {
    // A plan IS the rows that share a name; there is no plans table.
    const rows = toPlanRows('Tuesday Session', [item(), item({ name: 'Shooting' })], TEAM);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.name === 'Tuesday Session')).toBe(true);
  });

  it('maps onto the column names the table actually has', () => {
    const [row] = toPlanRows('Tuesday Session', [item()], TEAM);
    expect(row).toMatchObject({
      team_id: TEAM,
      drill: 'Rondo',
      time_slot: '4:00 PM - 4:20 PM',
      duration: '20 min',
      coach_notes: 'Two touch'
    });
  });

  it('sends an id only when it is a real uuid', () => {
    // A locally generated id has no row behind it, so an update would find
    // nothing and the drill would silently never be saved.
    const rows = toPlanRows('S', [item({ id: ROW_ID }), item({ id: 'p_1724567890' })], TEAM);
    expect(rows[0].id).toBe(ROW_ID);
    expect(rows[1].id).toBeUndefined();
  });

  it('carries a diagram, and null when there is none', () => {
    const rows = toPlanRows('S', [
      item({ diagramImage: 'data:image/png;base64,x', diagramData: { pitchType: 'full' } }),
      item()
    ], TEAM);
    expect(rows[0].diagram_image).toBe('data:image/png;base64,x');
    expect(rows[0].diagram_data).toEqual({ pitchType: 'full' });
    expect(rows[1].diagram_image).toBeNull();
    expect(rows[1].diagram_data).toBeNull();
  });

  it('names a drill that has none rather than storing undefined', () => {
    expect(toPlanRows('S', [item({ name: '' })], TEAM)[0].drill).toBeTruthy();
  });

  it('names the plan when it is given nothing', () => {
    expect(toPlanRows('', [item()], TEAM)[0].name).toBeTruthy();
  });

  it('sends nothing for an empty plan', () => {
    // The client refuses one anyway; not building the rows says so earlier.
    expect(toPlanRows('S', [], TEAM)).toEqual([]);
  });
});

describe('what a save leaves behind', () => {
  it('names the rows that are no longer in the plan', () => {
    // The whole reason this exists: the save upserts and never deletes.
    const before = [item({ id: ROW_ID }), item({ id: ROW_ID.replace('a', 'f'), name: 'Gone' })];
    const after = [before[0]];
    expect(removedItemIds(before, after)).toEqual([ROW_ID.replace('a', 'f')]);
  });

  it('ignores a drill that was never saved', () => {
    // Added and removed in one sitting: there is no row to delete.
    const before = [item({ id: 'p_1724567890' })];
    expect(removedItemIds(before, [])).toEqual([]);
  });

  it('ignores a drill with no id at all', () => {
    expect(removedItemIds([item()], [])).toEqual([]);
  });

  it('says nothing was lost in a reorder', () => {
    // The same drills in a different order have lost nobody, and deleting one
    // here would delete a drill the coach only moved.
    const a = item({ id: ROW_ID });
    const b = item({ id: ROW_ID.replace('a', 'f') });
    expect(removedItemIds([a, b], [b, a])).toEqual([]);
  });

  it('says nothing was lost when the plan is untouched', () => {
    const before = [item({ id: ROW_ID })];
    expect(removedItemIds(before, before)).toEqual([]);
  });

  it('copes with an empty before, and with nothing at all', () => {
    expect(removedItemIds([], [item()])).toEqual([]);
    expect(removedItemIds(null as any, null as any)).toEqual([]);
  });
});

describe('the round trip through Postgres', () => {
  // groupPracticePlans is the same algorithm app.core.js uses to read
  // practice_plans, so a plan that survives this round trip is a plan the
  // LEGACY app reads correctly too -- which is the requirement while both
  // apps are live. The two mappings are otherwise tested apart and free to
  // drift.
  const withCreatedAt = (rows: any[]) =>
    rows.map(r => ({ ...r, created_at: '2026-09-01T00:00:00Z' }));

  it('gives back the plan that was written', () => {
    const before = [
      item({ id: ROW_A, name: 'Rondo', time: '4:00 PM - 4:20 PM', duration: '20 min', coachNotes: 'Two touch' }),
      item({ id: ROW_ID_B, name: 'Shooting', time: '4:20 PM - 4:35 PM', duration: '15 min', coachNotes: '' })
    ];
    const rows = withCreatedAt(toPlanRows('Tuesday Session', before, TEAM));
    const [plan] = groupPracticePlans(rows);

    expect(plan.name).toBe('Tuesday Session');
    expect(plan.drills.map(d => d.name)).toEqual(['Rondo', 'Shooting']);
    expect(plan.drills[0]).toMatchObject({
      id: ROW_A, time: '4:00 PM - 4:20 PM', duration: '20 min', coachNotes: 'Two touch'
    });
  });

  it('carries a diagram through unchanged', () => {
    // The blob is the one thing in the planner that cannot be reconstructed
    // if it is mangled.
    const diagram = { pitchType: 'half', keyframes: [{ time: 0, elements: [] }] };
    const rows = withCreatedAt(toPlanRows('S', [item({ diagramData: diagram })], TEAM));

    expect(groupPracticePlans(rows)[0].drills[0].diagramData).toEqual(diagram);
  });

  it('does not invent a plan-name prefix the reader would strip', () => {
    // groupPracticePlans reads "[Plan: X]" out of the notes. Writing notes
    // that happen to start that way would silently rename the plan -- so
    // check a note beginning with a bracket survives as itself.
    const rows = withCreatedAt(
      toPlanRows('Tuesday Session', [item({ coachNotes: '[Warm up] two laps' })], TEAM));
    const [plan] = groupPracticePlans(rows);

    expect(plan.name).toBe('Tuesday Session');
    expect(plan.drills[0].coachNotes).toBe('[Warm up] two laps');
  });
});
