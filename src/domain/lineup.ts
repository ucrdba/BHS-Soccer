/**
 * The lineup board: formation geometry, squad partitioning and drop rules.
 *
 * Extracted from public/js/views/lineup.view.js during the Vue migration
 * (Phase 0). Behaviour is unchanged; app state arrives as parameters.
 *
 * `assignLineupSlot` and `clearLineupSlot` mutate the assignment map they are
 * given and return it, exactly as the originals mutated `this._lineupAssign`.
 * Returning a fresh object would be tidier and would also be a behavioural
 * change, so it is not done here.
 */

export interface LineupSlot { slot: string; x: number; y: number }
export interface DropTarget {
  playerId: string;
  fromSlot?: string;
  overSlot?: string;
  overSquad?: boolean;
}
export interface DropAction { action: 'none' | 'place' | 'remove'; playerId?: string; slot?: string }
export interface CardDensity { font: number; pad: number; head: number; benchCols: number }

export function lineupFormations(): Record<string, LineupSlot[]> {
  const back4: LineupSlot[] = [
    { slot: 'LB', x: 15, y: 25 }, { slot: 'LCB', x: 38, y: 20 },
    { slot: 'RCB', x: 62, y: 20 }, { slot: 'RB', x: 85, y: 25 }
  ];
  const back3: LineupSlot[] = [
    { slot: 'LCB', x: 25, y: 22 }, { slot: 'CB', x: 50, y: 18 }, { slot: 'RCB', x: 75, y: 22 }
  ];
  // y=6 put the slot's lower half within a couple of percent of the goal
  // line, which the pitch's overflow:hidden clipped on a short viewport.
  const gk: LineupSlot = { slot: 'GK', x: 50, y: 10 };

  return {
    '4-4-2': [gk, ...back4,
      { slot: 'LM', x: 15, y: 55 }, { slot: 'LCM', x: 38, y: 52 },
      { slot: 'RCM', x: 62, y: 52 }, { slot: 'RM', x: 85, y: 55 },
      { slot: 'LST', x: 40, y: 82 }, { slot: 'RST', x: 60, y: 82 }],

    '4-3-3': [gk, ...back4,
      { slot: 'LCM', x: 30, y: 52 }, { slot: 'CM', x: 50, y: 46 }, { slot: 'RCM', x: 70, y: 52 },
      { slot: 'LW', x: 18, y: 82 }, { slot: 'ST', x: 50, y: 86 }, { slot: 'RW', x: 82, y: 82 }],

    '4-2-3-1': [gk, ...back4,
      { slot: 'LDM', x: 38, y: 42 }, { slot: 'RDM', x: 62, y: 42 },
      { slot: 'LAM', x: 20, y: 68 }, { slot: 'CAM', x: 50, y: 66 }, { slot: 'RAM', x: 80, y: 68 },
      { slot: 'ST', x: 50, y: 88 }],

    '3-5-2': [gk, ...back3,
      { slot: 'LWB', x: 10, y: 50 }, { slot: 'LCM', x: 33, y: 50 }, { slot: 'CM', x: 50, y: 45 },
      { slot: 'RCM', x: 67, y: 50 }, { slot: 'RWB', x: 90, y: 50 },
      { slot: 'LST', x: 40, y: 84 }, { slot: 'RST', x: 60, y: 84 }],

    '4-4-1-1': [gk, ...back4,
      { slot: 'LM', x: 15, y: 52 }, { slot: 'LCM', x: 38, y: 48 },
      { slot: 'RCM', x: 62, y: 48 }, { slot: 'RM', x: 85, y: 52 },
      { slot: 'CF', x: 50, y: 72 }, { slot: 'ST', x: 50, y: 90 }]
  };
}

export function lineupSlots(formation: string): LineupSlot[] {
  const all = lineupFormations();
  return all[formation] || all['4-4-2'];
}

/** Everyone available to pick, in the order a team sheet reads. */
export function lineupSquad(players: any[]): any[] {
  return (players || [])
    .filter(p => !p.is_deleted && !p.isDeleted)
    .slice()
    .sort((a, b) => {
      const na = a.number == null ? NaN : Number(a.number);
      const nb = b.number == null ? NaN : Number(b.number);
      const ga = Number.isFinite(na), gb = Number.isFinite(nb);
      // Unnumbered players last: Number(null) is 0, which would put them on
      // top of the squad list.
      if (ga !== gb) return ga ? -1 : 1;
      if (ga && na !== nb) return na - nb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

/**
 * Put the selected player in a slot.
 *
 * A slot holds one player and a player holds one slot, so assigning either
 * side displaces whatever was there. Silently allowing two players in one
 * slot would print a card with twelve names.
 */
export function assignLineupSlot(
  assignments: Record<string, string>, slot: string, playerId: string
): Record<string, string> {
  const asg = assignments || {};
  // Take the player off any slot they already hold.
  Object.keys(asg).forEach(k => { if (asg[k] === playerId) delete asg[k]; });
  if (playerId) asg[slot] = playerId; else delete asg[slot];
  return asg;
}

export function clearLineupSlot(assignments: Record<string, string>, slot: string): void {
  if (assignments) delete assignments[slot];
}

/** The XI, in the formation's own order. */
export function lineupStarters(
  assignments: Record<string, string>, squad: any[], formation: string
): any[] {
  const asg = assignments || {};
  const byId = new Map((squad || []).map(p => [p.id, p]));
  return lineupSlots(formation)
    .map((s, i) => {
      const p = byId.get(asg[s.slot]);
      return p ? { ...s, sort_order: i, player: p } : null;
    })
    .filter(Boolean);
}

/** Everyone dressed but not starting. */
export function lineupBench(
  assignments: Record<string, string>, squad: any[], formation: string,
  dressed: Record<string, boolean> | null
): any[] {
  const starting = new Set(lineupStarters(assignments, squad, formation).map(r => r.player.id));
  return (squad || []).filter(p =>
    !starting.has(p.id) && (dressed == null || dressed[p.id]));
}

/** Rows in the shape saveLineup expects. */
export function lineupRowsForSave(
  assignments: Record<string, string>, squad: any[], formation: string,
  dressed: Record<string, boolean> | null
): any[] {
  const starters = lineupStarters(assignments, squad, formation).map(r => ({
    player_id: r.player.id, role: 'starter', slot: r.slot,
    x: r.x, y: r.y, sort_order: r.sort_order
  }));
  const bench = lineupBench(assignments, squad, formation, dressed).map((p, i) => ({
    player_id: p.id, role: 'bench', slot: null,
    x: null, y: null, sort_order: 100 + i
  }));
  return starters.concat(bench);
}

/**
 * What a drop should do, decided without touching the DOM.
 *
 * Kept separate from the pointer plumbing so the rules can be tested: the
 * plumbing is browser behaviour, but "dropping a starter on the squad list
 * takes them off the pitch" is a rule, and a rule that only exists inside an
 * event handler is a rule nobody can check.
 */
export function resolveLineupDrop(
  { playerId, fromSlot, overSlot, overSquad }: DropTarget
): DropAction {
  if (!playerId) return { action: 'none' };

  if (overSlot) {
    // Dropping a player back on the slot they came from changes nothing --
    // it is how a drag is cancelled.
    if (overSlot === fromSlot) return { action: 'none' };
    return { action: 'place', playerId, slot: overSlot };
  }

  // Off the pitch. Dragging a starter to the squad list removes them; doing
  // the same with somebody who was never on it is simply a cancelled drag.
  if (overSquad && fromSlot) return { action: 'remove', slot: fromSlot };
  return { action: 'none' };
}

/** Carry out a resolved drop. */
export function applyLineupDrop(
  assignments: Record<string, string>, drop: DropAction | null
): boolean {
  if (!drop || drop.action === 'none') return false;
  if (drop.action === 'place') { assignLineupSlot(assignments, drop.slot, drop.playerId); return true; }
  if (drop.action === 'remove') { clearLineupSlot(assignments, drop.slot); return true; }
  return false;
}

export function lineupShortName(p: any): string {
  const parts = String(p.name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '.';
}

/**
 * Grade, shortened for the card.
 *
 * The roster holds these in several shapes — "12", "Senior", "Senior (2027)"
 * — because they arrived from different imports. The card has room for a
 * couple of characters, so a known word becomes its year and anything else
 * is passed through as written rather than guessed at.
 */
export function lineupGrade(p: any): string {
  const raw = String(p.classYear || p.class_year || '').trim();
  if (!raw) return '';
  const word = raw.toLowerCase();
  if (word.startsWith('fresh')) return '9';
  if (word.startsWith('soph')) return '10';
  if (word.startsWith('jun')) return '11';
  if (word.startsWith('sen')) return '12';
  const m = raw.match(/\b(9|10|11|12)\b/);
  return m ? m[1] : raw;
}

export function fixturesWithoutLineup(schedule: any[], lineupIndex: any[]): any[] {
  const has = new Set((lineupIndex || [])
    .filter(r => r.match_id).map(r => r.match_id));
  return (schedule || [])
    .filter(m => !m.is_deleted && !m.isDeleted && m.id && !has.has(m.id));
}

/**
 * How tightly the printed card has to pack.
 *
 * Takes counts, not arrays: the caller already knows how many starters and
 * bench players there are, and passing the lists would invite this to start
 * reading them.
 */
export function lineupCardDensity(starters: number, bench: number): CardDensity {
  const benchCols = bench > 8 ? 2 : 1;
  // What actually drives the height: the bench contributes half its rows
  // once it is in two columns.
  const rows = starters + Math.ceil(bench / benchCols);

  if (rows <= 16) return { font: 11.5, pad: 4.5, head: 17, benchCols };
  if (rows <= 20) return { font: 10.5, pad: 3.5, head: 16, benchCols };
  if (rows <= 24) return { font: 9.5,  pad: 2.8, head: 15, benchCols };
  if (rows <= 28) return { font: 8.5,  pad: 2.2, head: 14, benchCols };
  // Beyond this the squad is larger than any bench a match allows, but the
  // card must still print rather than overflow.
  return { font: 7.5, pad: 1.6, head: 13, benchCols };
}
