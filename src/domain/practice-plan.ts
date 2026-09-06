/**
 * A practice session, as data.
 *
 * Two facts about the storage shape drive most of this. There is **no plans
 * table** — `practice_plans` holds one row per drill, and a plan is whatever
 * rows share a `name`, so grouping is the client's job. And older rows carry
 * the plan name in a `[Plan: X]` prefix inside `coach_notes`, from before the
 * column existed.
 *
 * `recalculateTimeline` is the piece that earns its place. A printed plan is
 * read on a touchline against a watch, so the slots have to be contiguous
 * after every add, edit, delete and reorder — which means they are derived,
 * never typed twice.
 *
 * Extracted from public/js/views/planner.view.js and app.core.js during
 * Phase 4.
 */
import { format24hTo12h, format12hTo24h } from './schedule-view';

export interface PlanItem {
  /** The practice_plans row id, when this drill has been saved. */
  id?: string;
  name: string;
  /** The display slot, e.g. "4:00 PM - 4:20 PM". */
  time: string;
  duration: string;
  coachNotes: string;
  diagramImage?: string | null;
  diagramData?: any;
}

export interface SavedPlan {
  id: string;
  name: string;
  date: string;
  drills: PlanItem[];
}

/** Practice starts after school; a default of midnight would print as absurd. */
const DEFAULT_START_MINUTES = 16 * 60;
const DEFAULT_DRILL_MINUTES = 20;

/** A duration a coach typed, as the app stores it. */
export function formatDuration(value: any): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '15 min';

  const lower = trimmed.toLowerCase();
  // A bare "20" breaks every reader downstream that matches digits then unit.
  if (/^\d+$/.test(trimmed) || (!lower.includes('min') && !lower.includes('hr'))) {
    return `${trimmed} min`;
  }
  return trimmed;
}

/** The minutes in a stored duration, or null when it cannot be read. */
export function durationMinutes(value: any): number | null {
  const m = String(value ?? '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * The rows a team's `practice_plans` holds, as the named plans a coach picks
 * from.
 */
export function groupPracticePlans(rows: any[]): SavedPlan[] {
  const byName: Record<string, SavedPlan> = {};

  (rows || []).forEach(row => {
    const notes = row?.coach_notes || '';
    let planName = row?.name || 'Practice Plan';
    let cleanNotes = notes;

    // Older rows put the plan name in the notes. Left in place, the coach
    // reads their own metadata back as coaching.
    const prefixed = notes.match(/^\[Plan:\s*([^\]]+)\]\s*(.*)/i);
    if (prefixed) {
      planName = prefixed[1].trim();
      cleanNotes = prefixed[2].trim();
    }
    if (!planName) return;

    if (!byName[planName]) {
      byName[planName] = {
        id: 'plan_db_' + planName.replace(/\s+/g, '_').toLowerCase(),
        name: planName,
        date: new Date(row?.created_at || Date.now()).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        }).toUpperCase(),
        drills: []
      };
    }

    byName[planName].drills.push({
      id: row?.id,
      name: row?.drill || row?.name || 'Soccer Drill',
      time: row?.time_slot || '',
      duration: row?.duration || '',
      coachNotes: cleanNotes,
      diagramImage: row?.diagram_image || null,
      diagramData: row?.diagram_data || null
    });
  });

  return Object.values(byName);
}

/**
 * How long the session runs.
 *
 * The hours are spelled out past sixty minutes, because "95 min" alone makes
 * a coach do arithmetic to know whether it fits the slot they have.
 */
export function totalSessionTime(items: PlanItem[]): string {
  const total = (items || []).reduce((sum, i) => sum + (durationMinutes(i?.duration) || 0), 0);
  if (total < 60) return `${total} min`;

  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  const hrsText = `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return `${total} min (${hrsText}${mins > 0 ? ` ${mins} min` : ''})`;
}

/** "4:00 PM - 4:20 PM" → the minute of the day it starts, or null. */
function startMinutesOf(slot: string): number | null {
  if (!slot || !slot.includes('-')) return null;
  const as24h = format12hTo24h(slot.split('-')[0].trim());
  if (!as24h || !as24h.includes(':')) return null;

  const [h, m] = as24h.split(':').map(n => parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function slotText(startMins: number, endMins: number): string {
  const at = (total: number) => {
    const h = String(Math.floor(total / 60) % 24).padStart(2, '0');
    const m = String(total % 60).padStart(2, '0');
    return format24hTo12h(`${h}:${m}`);
  };
  return `${at(startMins)} - ${at(endMins)}`;
}

/**
 * Every drill's slot, reflowed from the first one's start plus the durations.
 *
 * Returns a new array: these are held in a store, and mutating in place would
 * skip reactivity and leave the screen showing the old times.
 */
export function recalculateTimeline(items: PlanItem[]): PlanItem[] {
  const list = items || [];
  if (list.length === 0) return [];

  let current = startMinutesOf(list[0]?.time) ?? DEFAULT_START_MINUTES;

  return list.map(drill => {
    const mins = durationMinutes(drill?.duration) ?? DEFAULT_DRILL_MINUTES;
    const end = current + mins;
    const slot = slotText(current, end);
    current = end % (24 * 60);
    return { ...drill, time: slot };
  });
}

export interface MoveResult {
  items: PlanItem[];
  /** Where a selected index ended up after the move. */
  selected: (was: number) => number;
}

/**
 * Move one drill, and say where the selection went.
 *
 * The selection has to follow, because the drill a coach just dragged is
 * still the one they are looking at — and a drill moving past the selected
 * one shifts it by one without either being the drill that moved.
 */
export function moveItem(items: PlanItem[], from: number, to: number): MoveResult {
  const list = (items || []).slice();
  const unchanged: MoveResult = { items: list, selected: (was: number) => was };

  if (from === to) return unchanged;
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return unchanged;

  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);

  return {
    items: list,
    selected: (was: number) => {
      if (was === from) return to;
      if (from < was && to >= was) return was - 1;
      if (from > was && to <= was) return was + 1;
      return was;
    }
  };
}
