/**
 * What the import/export modal is given, and who may open it.
 *
 * The assertion that carries the file: every collection is fetched against
 * the ACTIVE team and organization. Ten service methods default their
 * `schoolId` to 'bhs', so a bare call here would hand a club admin an export
 * of Beaumont's roster, staff and drills -- and they would then re-import it
 * over their own.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ImportExportSection from './ImportExportSection.vue';

const fetchSchool = vi.fn();
const fetchTeamRoster = vi.fn();
const fetchSchedule = vi.fn();
const fetchDrillsBank = vi.fn();
const fetchCoaches = vi.fn();
const fetchDailyThoughts = vi.fn();
const fetchTeamQuiz = vi.fn();
const fetchSoccerCategories = vi.fn();
const fetchMatrixLogs = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchSchool: (...a: any[]) => fetchSchool(...a),
    fetchTeamRoster: (...a: any[]) => fetchTeamRoster(...a),
    fetchSchedule: (...a: any[]) => fetchSchedule(...a),
    fetchDrillsBank: (...a: any[]) => fetchDrillsBank(...a),
    fetchCoaches: (...a: any[]) => fetchCoaches(...a),
    fetchDailyThoughts: (...a: any[]) => fetchDailyThoughts(...a),
    fetchTeamQuiz: (...a: any[]) => fetchTeamQuiz(...a),
    fetchSoccerCategories: (...a: any[]) => fetchSoccerCategories(...a),
    fetchMatrixLogs: (...a: any[]) => fetchMatrixLogs(...a)
  }
}));

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

function mountIt(props: any = {}) {
  return mount(ImportExportSection, {
    props: {
      isAdmin: true,
      teamId: 't1',
      schoolId: 's1',
      schoolCode: 'lfc',
      teamName: 'Varsity',
      teams: [{ id: 't1', name: 'Varsity' }],
      ...props
    },
    global: { stubs: { ImportExportModal: { props: ['data', 'open'], template: '<div data-modal-stub />' } } }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSchool.mockResolvedValue({ code: 'lfc', name: 'Legends FC', mascot: 'Lions' });
  fetchTeamRoster.mockResolvedValue([{ first_name: 'Cesar', last_name: 'Alva' }]);
  fetchSchedule.mockResolvedValue([{ opponent: 'Yucaipa' }]);
  fetchDrillsBank.mockResolvedValue([{ name: 'Rondo' }]);
  fetchCoaches.mockResolvedValue([{ name: 'Coach Bob' }]);
  fetchDailyThoughts.mockResolvedValue([{ title: 'Compete' }]);
  fetchTeamQuiz.mockResolvedValue([{ question: 'Offside?' }]);
  fetchSoccerCategories.mockResolvedValue([{ name: 'Possession' }]);
  fetchMatrixLogs.mockResolvedValue([{ playerName: 'Cesar Alva' }]);
});

describe('who may open it', () => {
  it('is offered to an admin', () => {
    expect(mountIt().find('[data-ie-open]').exists()).toBe(true);
  });

  it('is NOT offered to a coach who is not an admin', () => {
    // It rewrites every table in the organization.
    expect(mountIt({ isAdmin: false }).find('[data-ie-open]').exists()).toBe(false);
  });
});

describe('EVERY FETCH IS SCOPED TO THE ACTIVE TEAM AND ORGANIZATION', () => {
  it('reads the roster by team, which has no default to fall through', async () => {
    const w = mountIt();
    await w.find('[data-ie-open]').trigger('click');
    await flush();

    expect(fetchTeamRoster).toHaveBeenCalledWith('t1');
  });

  it("passes the organization to the school-scoped reads rather than letting them default", async () => {
    const w = mountIt();
    await w.find('[data-ie-open]').trigger('click');
    await flush();

    expect(fetchDrillsBank).toHaveBeenCalledWith('s1');
    expect(fetchCoaches).toHaveBeenCalledWith('s1');
    expect(fetchSoccerCategories).toHaveBeenCalledWith('s1');
    expect(fetchSchool).toHaveBeenCalledWith('lfc');
  });

  it('passes the team to the team-scoped reads', async () => {
    const w = mountIt();
    await w.find('[data-ie-open]').trigger('click');
    await flush();

    expect(fetchDailyThoughts).toHaveBeenCalledWith('t1');
    expect(fetchTeamQuiz).toHaveBeenCalledWith('t1');
    expect(fetchMatrixLogs).toHaveBeenCalledWith('t1');
  });

  it('reads NOTHING until it is opened', async () => {
    mountIt();
    await flush();

    expect(fetchTeamRoster).not.toHaveBeenCalled();
  });
});

describe('what the modal is handed', () => {
  it("gives it the organization's real rows", async () => {
    const w = mountIt();
    await w.find('[data-ie-open]').trigger('click');
    await flush();

    const data = w.findComponent('[data-modal-stub]' as any).props('data') as any;
    expect(data.school.name).toBe('Legends FC');
    expect(data.players).toHaveLength(1);
    expect(data.quiz).toHaveLength(1);
    expect(data.teamName).toBe('Varsity');
  });

  it('gives it an empty collection rather than nothing when a read fails', async () => {
    // `sheetFor` maps over these, and an export that throws mid-way leaves the
    // admin with no workbook and no reason.
    fetchCoaches.mockResolvedValue(null);
    const w = mountIt();
    await w.find('[data-ie-open]').trigger('click');
    await flush();

    const data = w.findComponent('[data-modal-stub]' as any).props('data') as any;
    expect(data.coaches).toEqual([]);
  });

  it('SAYS THE PROFILES SHEET IS NOT FILLED, so an empty one is not read as "no users"', async () => {
    // There is no read path for the profiles of an organization, so that
    // sheet exports with its headers and no rows.
    const w = mountIt();
    await w.find('[data-ie-open]').trigger('click');
    await flush();

    expect(w.text()).toMatch(/profiles/i);
  });

  it('survives a read throwing rather than leaving the button dead', async () => {
    fetchTeamRoster.mockRejectedValue(new Error('network'));
    const w = mountIt();
    await w.find('[data-ie-open]').trigger('click');
    await flush();

    expect(w.find('[data-ie-load-error]').exists()).toBe(true);
  });

  it('does not open while no team is active', async () => {
    const w = mountIt({ teamId: null });
    await w.find('[data-ie-open]').trigger('click');
    await flush();

    expect(fetchTeamRoster).not.toHaveBeenCalled();
    expect(w.find('[data-ie-load-error]').text()).toMatch(/team/i);
  });
});
