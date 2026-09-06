/**
 * The coach's message to the squad.
 *
 * On Home, which is where the squad looks -- it lived in the practice planner
 * only as an artefact of how app.js was split.
 *
 * The assertion worth reading twice is on deleting. A quiz question can name
 * the message it tests, and fetchTeamQuiz only asks such a question while
 * that message is the active one -- so deleting a message quietly stops some
 * questions being asked, and the confirmation says so rather than letting a
 * coach find out when the quiz goes short.
 *
 * And nothing renders when no message is set and the viewer cannot write one.
 * An empty box on the front page every day teaches the squad to stop looking.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import DailyThought from './DailyThought.vue';

const fetchDailyThoughts = vi.fn();
const upsertDailyThought = vi.fn();
const setActiveDailyThought = vi.fn();
const deleteDailyThought = vi.fn();
const copyDailyThought = vi.fn();
const teamsCoachedBy = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchDailyThoughts: (...a: any[]) => fetchDailyThoughts(...a),
    upsertDailyThought: (...a: any[]) => upsertDailyThought(...a),
    setActiveDailyThought: (...a: any[]) => setActiveDailyThought(...a),
    deleteDailyThought: (...a: any[]) => deleteDailyThought(...a),
    copyDailyThought: (...a: any[]) => copyDailyThought(...a),
    teamsCoachedBy: (...a: any[]) => teamsCoachedBy(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';

const THOUGHTS = [
  {
    id: 'd1', title: 'Press together', thoughts_text: 'Squeeze the space.',
    coach_name: 'Coach Bob', is_active: true
  },
  { id: 'd2', title: 'Last week', thoughts_text: 'Older message.', is_active: false }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountThought(opts: { rows?: any; canEdit?: boolean } = {}) {
  const { rows = THOUGHTS, canEdit = true } = opts;
  fetchDailyThoughts.mockResolvedValue(rows);

  const w = mount(DailyThought, {
    props: { teamId: TEAM, canEdit },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false })]
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  upsertDailyThought.mockResolvedValue({ data: [{ id: 'd3' }] });
  setActiveDailyThought.mockResolvedValue(undefined);
  deleteDailyThought.mockResolvedValue({ data: [{ id: 'd1' }] });
  copyDailyThought.mockResolvedValue({ ok: true });
  teamsCoachedBy.mockResolvedValue([{ id: OTHER, name: 'JV' }]);
});

describe('what the squad sees', () => {
  it('shows the active message', async () => {
    const w = await mountThought({ canEdit: false });
    expect(w.find('[data-thought-text]').text()).toBe('Squeeze the space.');
  });

  it('names the coach who wrote it', async () => {
    const w = await mountThought({ canEdit: false });
    expect(w.find('[data-thought-by]').text()).toBe('Coach Bob');
  });

  it('shows only the ACTIVE one, not the history', async () => {
    const w = await mountThought({ canEdit: false });
    expect(w.text()).not.toContain('Older message');
  });

  it('RENDERS NOTHING when no message is set', async () => {
    // An empty box on the front page every day teaches the squad to stop
    // looking at it.
    const w = await mountThought({ rows: [], canEdit: false });
    expect(w.find('[data-daily-thought]').exists()).toBe(false);
  });

  it('offers a player no controls', async () => {
    const w = await mountThought({ canEdit: false });
    expect(w.find('[data-thought-new]').exists()).toBe(false);
    expect(w.find('[data-thought-remove]').exists()).toBe(false);
  });
});

describe('what a coach can do', () => {
  it('is offered a way to write one even with none set', async () => {
    const w = await mountThought({ rows: [] });
    expect(w.find('[data-thought-new]').text()).toMatch(/write a message/i);
  });

  it('writes a new message', async () => {
    const w = await mountThought();
    await w.find('[data-thought-new]').trigger('click');
    await w.find('[data-thought-title]').setValue('Switch the play');
    await w.find('[data-thought-body]').setValue('Find the far side.');
    await w.find('[data-thought-form]').trigger('submit');
    await flush();

    expect(upsertDailyThought).toHaveBeenCalledWith(TEAM, expect.objectContaining({
      title: 'Switch the play', text: 'Find the far side.', isActive: true
    }));
  });

  it('will not save an empty message', async () => {
    const w = await mountThought();
    await w.find('[data-thought-new]').trigger('click');
    await w.find('[data-thought-form]').trigger('submit');
    await flush();

    expect(upsertDailyThought).not.toHaveBeenCalled();
    expect(w.find('[data-thought-action-error]').exists()).toBe(true);
  });

  it('edits the active one, keeping its id', async () => {
    const w = await mountThought();
    await w.find('[data-thought-edit]').trigger('click');
    await w.find('[data-thought-body]').setValue('Squeeze harder.');
    await w.find('[data-thought-form]').trigger('submit');
    await flush();

    expect(upsertDailyThought.mock.calls[0][1].id).toBe('d1');
  });

  it('makes an earlier message active again', async () => {
    const w = await mountThought();
    await w.find('[data-thought-activate="d2"]').trigger('click');
    await flush();

    expect(setActiveDailyThought).toHaveBeenCalledWith(TEAM, 'd2');
  });
});

describe('DELETING SAYS WHAT IT COSTS', () => {
  it('warns that quiz questions naming it stop being asked', async () => {
    // A question is only asked while the message it tests is active, so this
    // is a consequence a coach would otherwise discover when the quiz goes
    // short.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountThought();
    await w.find('[data-thought-remove]').trigger('click');

    expect(confirmSpy.mock.calls[0][0]).toMatch(/quiz question/i);
    expect(deleteDailyThought).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('names the message being deleted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountThought();
    await w.find('[data-thought-remove]').trigger('click');

    expect(confirmSpy.mock.calls[0][0]).toContain('Press together');
    confirmSpy.mockRestore();
  });

  it('deletes once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountThought();
    await w.find('[data-thought-remove]').trigger('click');
    await flush();

    expect(deleteDailyThought).toHaveBeenCalledWith('d1');
    confirmSpy.mockRestore();
  });
});

describe('copying to another team', () => {
  it('offers ONLY teams the coach may write to', async () => {
    // The same rule as the practice plan: the database refuses any other
    // write, so offering one would be a control that always fails.
    const w = await mountThought();
    expect(teamsCoachedBy).toHaveBeenCalled();
    expect(w.find('[data-thought-copy-pick="d2"]').findAll('option')).toHaveLength(2);
  });

  it('sends the message and the destination', async () => {
    const w = await mountThought();
    await w.find('[data-thought-copy-pick="d2"]').setValue(OTHER);
    await w.find('[data-thought-copy="d2"]').trigger('click');
    await flush();

    expect(copyDailyThought).toHaveBeenCalledWith('d2', OTHER);
  });

  it('refuses with no destination picked', async () => {
    const w = await mountThought();
    await w.find('[data-thought-copy="d2"]').trigger('click');
    await flush();

    expect(copyDailyThought).not.toHaveBeenCalled();
    expect(w.find('[data-thought-action-error]').text()).toMatch(/pick a team/i);
  });
});

describe('when the read fails', () => {
  it('says so rather than looking like no message was written', async () => {
    const w = await mountThought({ rows: null });
    expect(w.find('[data-thought-error]').exists()).toBe(true);
  });
});
