/**
 * A practice session, as data.
 *
 * The assertion set that matters most is `recalculateTimeline`. The printed
 * plan is read on a touchline against a watch, so a timeline whose third
 * drill starts before the second one ends is worse than no times at all --
 * and every add, edit, delete and reorder has to reflow it.
 *
 * `groupPracticePlans` carries the other awkward fact: there is no plans
 * table. A plan is whatever practice_plans rows share a name, and some older
 * rows carry that name in a prefix inside the coach's notes instead.
 */
import { describe, it, expect } from 'vitest';
import {
  groupPracticePlans, totalSessionTime, recalculateTimeline,
  moveItem, formatDuration, durationMinutes, sessionStartMinutes,
  type PlanItem
} from './practice-plan';

const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  name: 'Rondo', time: '4:00 PM - 4:20 PM', duration: '20 min', coachNotes: '', ...over
});

describe('grouping the rows into plans', () => {
  const row = (over: any = {}) => ({
    id: 'r1', name: 'Tuesday Session', drill: 'Rondo', time_slot: '4:00 PM - 4:20 PM',
    duration: '20 min', coach_notes: 'Two touch', created_at: '2026-09-01T00:00:00Z',
    diagram_image: null, diagram_data: null, ...over
  });

  it('gathers rows that share a name into one plan', () => {
    // There is no plans table: a plan IS the rows that share a name.
    const plans = groupPracticePlans([row(), row({ id: 'r2', drill: 'Shooting' })]);
    expect(plans).toHaveLength(1);
    expect(plans[0].drills).toHaveLength(2);
  });

  it('keeps separate plans apart', () => {
    const plans = groupPracticePlans([row(), row({ id: 'r2', name: 'Friday Session' })]);
    expect(plans.map(p => p.name).sort()).toEqual(['Friday Session', 'Tuesday Session']);
  });

  it('reads a plan name out of an older row prefix', () => {
    // Rows written before `name` carried the plan put it in the notes.
    const plans = groupPracticePlans([
      row({ name: 'Practice Plan', coach_notes: '[Plan: Warmups] Two touch only' })
    ]);
    expect(plans[0].name).toBe('Warmups');
  });

  it('strips that prefix out of the notes', () => {
    // Otherwise the coach reads their own metadata back as coaching.
    const plans = groupPracticePlans([
      row({ coach_notes: '[Plan: Warmups] Two touch only' })
    ]);
    expect(plans[0].drills[0].coachNotes).toBe('Two touch only');
  });

  it('maps the stored column names onto the shape the app uses', () => {
    const plans = groupPracticePlans([row({
      diagram_image: 'data:image/png;base64,x', diagram_data: { pitchType: 'full' }
    })]);
    const drill = plans[0].drills[0];
    expect(drill.time).toBe('4:00 PM - 4:20 PM');
    expect(drill.coachNotes).toBe('Two touch');
    expect(drill.diagramImage).toBe('data:image/png;base64,x');
    expect(drill.diagramData).toEqual({ pitchType: 'full' });
  });

  it('keeps the row id, which is what makes an edit an update', () => {
    expect(groupPracticePlans([row()])[0].drills[0].id).toBe('r1');
  });

  it('names a drill that has none rather than rendering undefined', () => {
    expect(groupPracticePlans([row({ drill: null })])[0].drills[0].name).toBeTruthy();
  });

  it('copes with no rows at all', () => {
    expect(groupPracticePlans([])).toEqual([]);
    expect(groupPracticePlans(null as any)).toEqual([]);
  });
});

describe('the total session time', () => {
  it('sums the drills', () => {
    expect(totalSessionTime([item(), item({ duration: '15 min' })])).toBe('35 min');
  });

  it('says the hours too, once there are any', () => {
    // "95 min" alone makes a coach do arithmetic to know if it fits the slot.
    expect(totalSessionTime([item({ duration: '95 min' })])).toBe('95 min (1 hr 35 min)');
  });

  it('does not say a stray zero minutes on the hour', () => {
    expect(totalSessionTime([item({ duration: '120 min' })])).toBe('120 min (2 hrs)');
  });

  it('ignores a duration it cannot read rather than reporting NaN', () => {
    expect(totalSessionTime([item(), item({ duration: 'a while' })])).toBe('20 min');
  });

  it('is zero for an empty plan', () => {
    expect(totalSessionTime([])).toBe('0 min');
  });
});

describe('reflowing the timeline', () => {
  it('starts each drill when the previous one ends', () => {
    // The whole point: a printed plan is read against a watch.
    const out = recalculateTimeline([
      item({ time: '4:00 PM - 4:20 PM', duration: '20 min' }),
      item({ time: 'nonsense', duration: '30 min' })
    ]);
    expect(out[0].time).toBe('4:00 PM - 4:20 PM');
    expect(out[1].time).toBe('4:20 PM - 4:50 PM');
  });

  it('keeps the first drill\'s own start', () => {
    const out = recalculateTimeline([item({ time: '5:30 PM - 5:45 PM', duration: '15 min' })]);
    expect(out[0].time).toBe('5:30 PM - 5:45 PM');
  });

  it('defaults to 4:00 PM when the first drill has no slot', () => {
    // Practice starts after school. A default of midnight would be absurd on
    // every printed plan that had not been given a time yet.
    const out = recalculateTimeline([item({ time: '', duration: '20 min' })]);
    expect(out[0].time).toBe('4:00 PM - 4:20 PM');
  });

  it('gives a drill with no readable duration twenty minutes', () => {
    const out = recalculateTimeline([item({ time: '4:00 PM - 4:20 PM', duration: '' })]);
    expect(out[0].time).toBe('4:00 PM - 4:20 PM');
  });

  it('wraps past midnight instead of reaching 25:00', () => {
    const out = recalculateTimeline([
      item({ time: '11:30 PM - 11:50 PM', duration: '20 min' }),
      item({ duration: '30 min' })
    ]);
    expect(out[1].time).toBe('11:50 PM - 12:20 AM');
  });

  it('leaves an empty plan alone', () => {
    expect(recalculateTimeline([])).toEqual([]);
  });

  it('does not mutate what it was given', () => {
    // The store holds these; a mutation in place would skip Vue's reactivity
    // and leave the screen showing the old times.
    const items = [item({ time: 'nonsense' })];
    recalculateTimeline(items);
    expect(items[0].time).toBe('nonsense');
  });
});

describe('moving a drill', () => {
  const three = [item({ name: 'A' }), item({ name: 'B' }), item({ name: 'C' })];
  const names = (list: PlanItem[]) => list.map(d => d.name);

  it('puts the drill at the target index', () => {
    expect(names(moveItem(three, 0, 2).items)).toEqual(['B', 'C', 'A']);
  });

  it('moves backwards too', () => {
    expect(names(moveItem(three, 2, 0).items)).toEqual(['C', 'A', 'B']);
  });

  it('carries the selection with the drill that moved', () => {
    // The coach dragged the drill they were looking at; it is still the one
    // they are looking at.
    expect(moveItem(three, 0, 2).selected(0)).toBe(2);
  });

  it('shifts the selection when another drill moves past it', () => {
    // A moved above it: what was index 1 is now index 0.
    expect(moveItem(three, 0, 2).selected(1)).toBe(0);
  });

  it('shifts the selection the other way as well', () => {
    // C moved to the top: what was index 0 is now index 1.
    expect(moveItem(three, 2, 0).selected(0)).toBe(1);
  });

  it('leaves a selection outside the move alone', () => {
    expect(moveItem([...three, item({ name: 'D' })], 0, 1).selected(3)).toBe(3);
  });

  it('does nothing for a move onto itself', () => {
    expect(names(moveItem(three, 1, 1).items)).toEqual(['A', 'B', 'C']);
  });

  it('refuses an index off the end rather than dropping a drill', () => {
    expect(names(moveItem(three, 0, 9).items)).toEqual(['A', 'B', 'C']);
    expect(names(moveItem(three, -1, 1).items)).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate the array it was given', () => {
    const list = [...three];
    moveItem(list, 0, 2);
    expect(names(list)).toEqual(['A', 'B', 'C']);
  });
});

describe('reading and writing a duration', () => {
  it('adds the unit to a bare number', () => {
    // A coach typing "20" means twenty minutes, and "20" alone breaks every
    // reader downstream that matches on the digits then the word.
    expect(formatDuration('20')).toBe('20 min');
  });

  it('leaves one that already says its unit', () => {
    expect(formatDuration('20 min')).toBe('20 min');
    expect(formatDuration('1 hr')).toBe('1 hr');
  });

  it('has a default rather than an empty box', () => {
    expect(formatDuration('')).toBe('15 min');
  });

  it('reads the minutes back out', () => {
    expect(durationMinutes('20 min')).toBe(20);
    expect(durationMinutes('45')).toBe(45);
  });

  it('returns null for a duration it cannot read', () => {
    // Distinct from zero: the caller decides what an unreadable one is worth.
    expect(durationMinutes('a while')).toBeNull();
    expect(durationMinutes('')).toBeNull();
  });
});

describe('when the session starts', () => {
  it('reads the start off the first drill', () => {
    expect(sessionStartMinutes([item({ time: '5:30 PM - 5:45 PM' })])).toBe(17 * 60 + 30);
  });

  it('defaults to 4:00 PM for a plan with no times yet', () => {
    expect(sessionStartMinutes([item({ time: '' })])).toBe(16 * 60);
    expect(sessionStartMinutes([])).toBe(16 * 60);
  });

  it('holds the session still when the first drill moves', () => {
    // The bug this exists to stop: the start belongs to the SESSION, not to
    // whichever drill happens to sit at the top. Reflowing off the new first
    // drill moves practice itself -- move the 4:00 drill down and the session
    // starts at 4:20 instead. The legacy planner does exactly that.
    const before = [
      item({ name: 'A', time: '4:00 PM - 4:20 PM', duration: '20 min' }),
      item({ name: 'B', time: '4:20 PM - 4:35 PM', duration: '15 min' })
    ];
    const start = sessionStartMinutes(before);
    const moved = moveItem(before, 0, 1).items;

    const out = recalculateTimeline(moved, start);
    expect(out[0].time).toBe('4:00 PM - 4:15 PM');
    expect(out[1].time).toBe('4:15 PM - 4:35 PM');
  });

  it('holds it still when the first drill is removed too', () => {
    const before = [
      item({ time: '4:00 PM - 4:20 PM', duration: '20 min' }),
      item({ time: '4:20 PM - 4:35 PM', duration: '15 min' })
    ];
    const start = sessionStartMinutes(before);
    const out = recalculateTimeline(before.slice(1), start);

    expect(out[0].time).toBe('4:00 PM - 4:15 PM');
  });
});
