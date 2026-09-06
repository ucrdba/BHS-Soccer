/**
 * A fixture's team sheet.
 *
 * The rules themselves are `domain/lineup.ts` and tested there. What is
 * asserted here is the state around them, and two things in particular.
 *
 * Changing formation keeps the players it can: a 4-4-2 to 4-3-3 move is a few
 * slots changing, not a sheet thrown away, and a coach adjusting shape
 * mid-thought must not lose ten placements.
 *
 * And saveLineup needs a team AND an organization. It refuses without either
 * and says so only in a console warning, so a bare call leaves a sheet that
 * looks saved and is gone on reload.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const fetchLineup = vi.fn();
const saveLineup = vi.fn();
const fetchTeamLineups = vi.fn();

vi.mock('../data/supabase', () => ({
  supabaseService: {
    fetchLineup: (...a: any[]) => fetchLineup(...a),
    saveLineup: (...a: any[]) => saveLineup(...a),
    fetchTeamLineups: (...a: any[]) => fetchTeamLineups(...a)
  }
}));

const { useLineupStore } = await import('./lineup');

const TEAM = '11111111-2222-3333-4444-555555555555';
const MATCH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const PLAYERS = [
  { id: 'p1', name: 'Alva', number: 1 },
  { id: 'p2', name: 'Budde', number: 2 },
  { id: 'p3', name: 'Renteria', number: 3 },
  { id: 'p4', name: 'Frias', number: 4 }
];

const STORED = {
  id: 'l1', team_id: TEAM, match_id: MATCH, formation: '4-3-3', notes: 'Press high',
  players: [
    { player_id: 'p1', role: 'starter', slot: 'GK', sort_order: 0 },
    { player_id: 'p2', role: 'starter', slot: 'LB', sort_order: 1 },
    { player_id: 'p3', role: 'bench', slot: null, sort_order: 100 }
  ]
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  fetchLineup.mockResolvedValue(null);
  saveLineup.mockResolvedValue({ ok: true, id: 'l1' });
  fetchTeamLineups.mockResolvedValue([{ id: 'l1', match_id: MATCH }]);
});

describe('loading', () => {
  it('reads the sheet for the fixture', async () => {
    fetchLineup.mockResolvedValue(STORED);
    const s = useLineupStore();
    await s.load(TEAM, MATCH);

    expect(fetchLineup).toHaveBeenCalledWith(TEAM, MATCH);
    expect(s.formation).toBe('4-3-3');
    expect(s.notes).toBe('Press high');
  });

  it('puts the starters back in their slots', async () => {
    fetchLineup.mockResolvedValue(STORED);
    const s = useLineupStore();
    await s.load(TEAM, MATCH);

    expect(s.assignments).toEqual({ GK: 'p1', LB: 'p2' });
  });

  it('leaves the bench off the pitch', async () => {
    // A bench row has no slot; putting it somewhere would invent a position.
    fetchLineup.mockResolvedValue(STORED);
    const s = useLineupStore();
    await s.load(TEAM, MATCH);

    expect(Object.values(s.assignments)).not.toContain('p3');
  });

  it('starts blank for a fixture with no sheet yet', async () => {
    const s = useLineupStore();
    await s.load(TEAM, MATCH);

    expect(s.assignments).toEqual({});
    expect(s.formation).toBe('4-4-2');
  });

  it('clears the previous fixture\'s sheet', async () => {
    // Otherwise last Friday's XI is on this Tuesday's card.
    fetchLineup.mockResolvedValue(STORED);
    const s = useLineupStore();
    await s.load(TEAM, MATCH);

    fetchLineup.mockResolvedValue(null);
    await s.load(TEAM, 'other-match');
    expect(s.assignments).toEqual({});
  });

  it('refuses to read without a team', async () => {
    const s = useLineupStore();
    await s.load(null, MATCH);
    expect(fetchLineup).not.toHaveBeenCalled();
  });
});

describe('changing the formation', () => {
  it('KEEPS the players whose slots still exist', async () => {
    // A coach adjusting shape mid-thought must not lose ten placements.
    const s = useLineupStore();
    s.place('p1', 'GK');
    s.place('p2', 'LB');
    s.setFormation('4-3-3');

    // Both slots exist in 4-3-3.
    expect(s.assignments).toEqual({ GK: 'p1', LB: 'p2' });
  });

  it('takes a player off the pitch when their slot is gone', async () => {
    // 4-4-2 has LM; 4-3-3 does not. They go to the bench, which is where a
    // coach changing shape expects to find them -- not out of the squad.
    const s = useLineupStore();
    s.place('p1', 'LM');
    s.setFormation('4-3-3');

    expect(s.assignments.LM).toBeUndefined();
    expect(s.bench(PLAYERS).map((p: any) => p.id)).toContain('p1');
  });

  it('offers the new formation\'s slots', () => {
    const s = useLineupStore();
    s.setFormation('3-5-2');
    expect(s.slots.map((x: any) => x.slot)).toContain('LWB');
  });
});

describe('placing players', () => {
  it('puts a player in a slot', () => {
    const s = useLineupStore();
    s.place('p1', 'GK');
    expect(s.assignments.GK).toBe('p1');
  });

  it('MOVES a player rather than duplicating them', () => {
    // A slot holds one player and a player holds one slot; two copies would
    // print a card with twelve names.
    const s = useLineupStore();
    s.place('p1', 'GK');
    s.place('p1', 'LB');

    expect(s.assignments).toEqual({ LB: 'p1' });
  });

  it('displaces whoever was in the slot', () => {
    const s = useLineupStore();
    s.place('p1', 'GK');
    s.place('p2', 'GK');

    expect(s.assignments.GK).toBe('p2');
    expect(s.bench(PLAYERS).map((p: any) => p.id)).toContain('p1');
  });

  it('clears a slot', () => {
    const s = useLineupStore();
    s.place('p1', 'GK');
    s.clear('GK');
    expect(s.assignments.GK).toBeUndefined();
  });

  it('says which slot a player holds', () => {
    const s = useLineupStore();
    s.place('p1', 'LB');
    expect(s.slotOf('p1')).toBe('LB');
    expect(s.slotOf('p2')).toBeNull();
  });
});

describe('dropping', () => {
  it('places a player dropped on a slot', () => {
    const s = useLineupStore();
    expect(s.drop({ playerId: 'p1', overSlot: 'GK' })).toBe(true);
    expect(s.assignments.GK).toBe('p1');
  });

  it('takes a starter dropped on the squad list off the pitch', () => {
    const s = useLineupStore();
    s.place('p1', 'GK');
    s.drop({ playerId: 'p1', fromSlot: 'GK', overSquad: true });

    expect(s.assignments.GK).toBeUndefined();
  });

  it('treats a drop back on the same slot as a cancelled drag', () => {
    const s = useLineupStore();
    s.place('p1', 'GK');
    expect(s.drop({ playerId: 'p1', fromSlot: 'GK', overSlot: 'GK' })).toBe(false);
    expect(s.assignments.GK).toBe('p1');
  });

  it('does nothing for a drag of nobody', () => {
    const s = useLineupStore();
    expect(s.drop({ playerId: '', overSlot: 'GK' } as any)).toBe(false);
  });
});

describe('the starters and the bench', () => {
  it('lists the XI in the formation\'s own order', () => {
    const s = useLineupStore();
    s.place('p2', 'LB');
    s.place('p1', 'GK');

    // GK is first in every formation, whatever order they were placed in.
    expect(s.starters(PLAYERS)[0].player.id).toBe('p1');
  });

  it('puts everyone else on the bench', () => {
    const s = useLineupStore();
    s.place('p1', 'GK');

    expect(s.bench(PLAYERS).map((p: any) => p.id)).toEqual(['p2', 'p3', 'p4']);
  });

  it('keeps a squad in shirt-number order, unnumbered last', () => {
    const s = useLineupStore();
    const squad = s.squadOf(PLAYERS.concat([{ id: 'p9', name: 'Aaron', number: null } as any]));
    expect(squad[squad.length - 1].id).toBe('p9');
  });
});

describe('saving', () => {
  it('sends the formation, the slots and the notes', async () => {
    const s = useLineupStore();
    await s.load(TEAM, MATCH);
    s.place('p1', 'GK');
    s.notes = 'Press high';
    await s.save(TEAM, 's1', PLAYERS);

    const [team, school, match, formation, rows, notes] = saveLineup.mock.calls[0];
    expect(team).toBe(TEAM);
    expect(school).toBe('s1');
    expect(match).toBe(MATCH);
    expect(formation).toBe('4-4-2');
    expect(notes).toBe('Press high');
    expect(rows.find((r: any) => r.player_id === 'p1')).toMatchObject({ role: 'starter', slot: 'GK' });
  });

  it('sends the bench as well as the XI', async () => {
    // A team sheet is who is dressed, not only who starts.
    const s = useLineupStore();
    s.place('p1', 'GK');
    await s.save(TEAM, 's1', PLAYERS);

    const rows = saveLineup.mock.calls[0][4];
    expect(rows.filter((r: any) => r.role === 'bench')).toHaveLength(3);
  });

  it('REFUSES without an organization rather than saving nothing', async () => {
    // saveLineup refuses too, but only to the console -- the sheet would look
    // saved and be gone on reload.
    const s = useLineupStore();
    const res = await s.save(TEAM, null, PLAYERS);

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/organization/i);
    expect(saveLineup).not.toHaveBeenCalled();
  });

  it('refuses without a team', async () => {
    const s = useLineupStore();
    expect((await s.save(null, 's1', PLAYERS)).ok).toBe(false);
    expect(saveLineup).not.toHaveBeenCalled();
  });

  it('reports the database\'s own refusal', async () => {
    saveLineup.mockResolvedValue({ ok: false, error: 'The database refused that change. You must coach this team.' });
    const s = useLineupStore();
    const res = await s.save(TEAM, 's1', PLAYERS);

    expect(res.error).toMatch(/must coach this team/i);
  });

  it('re-reads the index, so the fixture stops being marked', async () => {
    const s = useLineupStore();
    await s.save(TEAM, 's1', PLAYERS);
    expect(fetchTeamLineups).toHaveBeenCalledWith(TEAM);
  });
});

describe('the index of saved sheets', () => {
  it('reads every lineup the team has', async () => {
    const s = useLineupStore();
    await s.loadIndex(TEAM);
    expect(s.index).toHaveLength(1);
  });

  it('asks for nothing without a team', async () => {
    const s = useLineupStore();
    await s.loadIndex(null);
    expect(fetchTeamLineups).not.toHaveBeenCalled();
  });
});
