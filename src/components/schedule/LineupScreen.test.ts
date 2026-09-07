/**
 * A fixture's team sheet.
 *
 * The assertion that matters most is that the whole sheet can be set by
 * clicking. Drag-only is the mistake the legacy planner makes: a coach
 * setting a lineup on a phone at the touchline cannot drag a card reliably,
 * and a keyboard cannot drag at all. The drag path is kept beside it, not
 * instead of it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import LineupScreen from './LineupScreen.vue';

const fetchLineup = vi.fn();
const saveLineup = vi.fn();
const fetchTeamLineups = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchLineup: (...a: any[]) => fetchLineup(...a),
    saveLineup: (...a: any[]) => saveLineup(...a),
    fetchTeamLineups: (...a: any[]) => fetchTeamLineups(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';
const MATCH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva', number: 1, class_year: 'Senior' },
  { id: 'p2', name: 'Tom Budde', number: 2, class_year: 'Freshman' },
  { id: 'p3', name: 'Alain Renteria', number: 3 },
  { id: 'p4', name: 'Frias', number: 4 }
];

const flush = () => new Promise(r => setTimeout(r, 0));

async function mountLineup(props: any = {}) {
  const w = mount(LineupScreen, {
    props: {
      matchId: MATCH, matchLabel: 'vs Redlands', matchMinutes: 80,
      teamId: TEAM, schoolId: 's1', players: PLAYERS, ...props
    },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false })],
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

const benchIds = (w: any) =>
  w.findAll('[data-bench-player]').map((b: any) => b.attributes('data-bench-player'));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchLineup.mockResolvedValue(null);
  saveLineup.mockResolvedValue({ ok: true, id: 'l1' });
  fetchTeamLineups.mockResolvedValue([]);
});

describe('the pitch', () => {
  it('lays out every slot of the formation', async () => {
    const w = await mountLineup();
    // 4-4-2 is eleven positions.
    expect(w.findAll('[data-slot]')).toHaveLength(11);
  });

  it('positions a slot where the formation says, not where a stylesheet guesses', async () => {
    const w = await mountLineup();
    const gk = w.find('[data-slot="GK"]');
    expect(gk.attributes('style')).toContain('50%');
  });

  it('changes shape when the formation changes', async () => {
    const w = await mountLineup();
    await w.find('[data-formation]').setValue('3-5-2');

    const slots = w.findAll('[data-slot]').map((s: any) => s.attributes('data-slot'));
    expect(slots).toContain('LWB');
    expect(slots).not.toContain('LB');
  });

  it('names the fixture it is for', async () => {
    const w = await mountLineup();
    expect(w.text()).toContain('vs Redlands');
  });
});

describe('setting the sheet BY CLICKING', () => {
  it('places a picked player into a tapped slot', async () => {
    // The whole point: no drag needed.
    const w = await mountLineup();
    await w.find('[data-bench-player="p1"]').trigger('click');
    await w.find('[data-slot="GK"]').trigger('click');

    expect(w.find('[data-slot="GK"]').find('[data-slot-name]').text()).toContain('Cesar');
  });

  it('takes the player off the bench once they are on', async () => {
    const w = await mountLineup();
    await w.find('[data-bench-player="p1"]').trigger('click');
    await w.find('[data-slot="GK"]').trigger('click');

    expect(benchIds(w)).not.toContain('p1');
  });

  it('picks a player back up from a tapped slot', async () => {
    // Which is how two players are swapped without going via the bench.
    const w = await mountLineup();
    await w.find('[data-bench-player="p1"]').trigger('click');
    await w.find('[data-slot="GK"]').trigger('click');

    await w.find('[data-slot="GK"]').trigger('click');
    await w.find('[data-slot="LB"]').trigger('click');

    expect(w.find('[data-slot="LB"]').find('[data-slot-name]').exists()).toBe(true);
    expect(w.find('[data-slot="GK"]').find('[data-slot-name]').exists()).toBe(false);
  });

  it('marks the player waiting to be placed', async () => {
    const w = await mountLineup();
    await w.find('[data-bench-player="p1"]').trigger('click');
    expect(w.find('[data-bench-player="p1"]').classes()).toContain('is-picked');
  });

  it('unpicks on a second tap, so a mis-tap is not a trap', async () => {
    const w = await mountLineup();
    await w.find('[data-bench-player="p1"]').trigger('click');
    await w.find('[data-bench-player="p1"]').trigger('click');

    expect(w.find('[data-bench-player="p1"]').classes()).not.toContain('is-picked');
  });

  it('clears a slot and returns the player to the bench', async () => {
    const w = await mountLineup();
    await w.find('[data-bench-player="p1"]').trigger('click');
    await w.find('[data-slot="GK"]').trigger('click');
    await w.find('[data-slot="GK"]').find('[data-slot-clear]').trigger('click');

    expect(benchIds(w)).toContain('p1');
  });

  it('says how to use it, since tap-then-tap is not obvious', async () => {
    const w = await mountLineup();
    expect(w.find('[data-lineup-hint]').text()).toMatch(/tap a player/i);
  });
});

describe('the player cards', () => {
  it('shortens a long name to fit', async () => {
    // "Alain Renteria" on a slot the size of a thumbnail.
    const w = await mountLineup();
    await w.find('[data-bench-player="p3"]').trigger('click');
    await w.find('[data-slot="GK"]').trigger('click');

    expect(w.find('[data-slot-name]').text()).toBe('Alain R.');
  });

  it('shows the grade as a year', async () => {
    const w = await mountLineup();
    await w.find('[data-bench-player="p2"]').trigger('click');
    await w.find('[data-slot="GK"]').trigger('click');

    expect(w.find('[data-slot-grade]').text()).toContain('9');
  });

  it('shows NOTHING rather than a zero for a player with no grade', async () => {
    // The roster holds these in several shapes and many are simply absent.
    const w = await mountLineup();
    await w.find('[data-bench-player="p3"]').trigger('click');
    await w.find('[data-slot="GK"]').trigger('click');

    expect(w.find('[data-slot="GK"]').find('[data-slot-grade]').exists()).toBe(false);
  });
});

describe('the bench', () => {
  it('starts with the whole squad', async () => {
    const w = await mountLineup();
    expect(benchIds(w)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('says so when everyone is on the pitch', async () => {
    const w = await mountLineup({ players: PLAYERS.slice(0, 1) });
    await w.find('[data-bench-player="p1"]').trigger('click');
    await w.find('[data-slot="GK"]').trigger('click');

    expect(w.find('[data-lineup-bench]').text()).toMatch(/everyone available/i);
  });
});

describe('an existing sheet', () => {
  it('opens on what was saved', async () => {
    fetchLineup.mockResolvedValue({
      id: 'l1', formation: '4-3-3', notes: 'Press high',
      players: [{ player_id: 'p1', role: 'starter', slot: 'GK', sort_order: 0 }]
    });
    const w = await mountLineup();

    expect((w.find('[data-formation]').element as HTMLSelectElement).value).toBe('4-3-3');
    expect(w.find('[data-slot="GK"]').find('[data-slot-name]').text()).toContain('Cesar');
    expect((w.find('[data-lineup-notes]').element as HTMLTextAreaElement).value).toBe('Press high');
  });
});

describe('saving', () => {
  it('sends the sheet for this fixture', async () => {
    const w = await mountLineup();
    await w.find('[data-bench-player="p1"]').trigger('click');
    await w.find('[data-slot="GK"]').trigger('click');
    await w.find('[data-lineup-save]').trigger('click');
    await flush();

    const [team, school, match] = saveLineup.mock.calls[0];
    expect(team).toBe(TEAM);
    expect(school).toBe('s1');
    expect(match).toBe(MATCH);
  });

  it('tells its parent, so the fixture stops being marked', async () => {
    const w = await mountLineup();
    await w.find('[data-lineup-save]').trigger('click');
    await flush();

    expect(w.emitted('saved')).toBeTruthy();
    expect(w.emitted('close')).toBeTruthy();
  });

  it('reports a refusal in the database\'s words and stays open', async () => {
    saveLineup.mockResolvedValue({ ok: false, error: 'The database refused that change. You must coach this team.' });
    const w = await mountLineup();
    await w.find('[data-lineup-save]').trigger('click');
    await flush();

    expect(w.find('[data-lineup-error]').text()).toMatch(/must coach this team/i);
    expect(w.emitted('close')).toBeFalsy();
  });

  it('refuses without an organization rather than saving nothing', async () => {
    const w = await mountLineup({ schoolId: null });
    await w.find('[data-lineup-save]').trigger('click');
    await flush();

    expect(saveLineup).not.toHaveBeenCalled();
    expect(w.find('[data-lineup-error]').text()).toMatch(/organization/i);
  });
});

describe('the screen', () => {
  it('states this squad\'s own match length, because every rate divides by it', async () => {
    const w = await mountLineup({ matchMinutes: 80 });
    expect(w.find('[data-lineup-length]').text()).toContain('80');
  });

  it('offers a way back to the schedule', async () => {
    const w = await mountLineup();
    expect(w.find('[data-tool-back]').exists()).toBe(true);
  });
});
