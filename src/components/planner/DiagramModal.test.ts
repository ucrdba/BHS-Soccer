/**
 * Drawing a drill.
 *
 * The modal is opened from two places and has to save back to whichever it
 * came from: a drill on the timeline writes through the planner store, a
 * drill in the library writes to drills_bank. Getting that wrong would look
 * like a save that worked and a diagram that vanished.
 *
 * Both a blob and a thumbnail are written. The blob is the diagram; the image
 * is what the timeline and the printed plan show without instantiating a
 * board.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import DiagramModal from './DiagramModal.vue';

const upsertDrillBankItem = vi.fn();
const fetchDrillsBank = vi.fn();
const saveFullPracticePlan = vi.fn();
const savePracticePlanItem = vi.fn();
const deletePracticePlanItem = vi.fn();
const fetchPracticePlans = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    upsertDrillBankItem: (...a: any[]) => upsertDrillBankItem(...a),
    fetchDrillsBank: (...a: any[]) => fetchDrillsBank(...a),
    saveFullPracticePlan: (...a: any[]) => saveFullPracticePlan(...a),
    savePracticePlanItem: (...a: any[]) => savePracticePlanItem(...a),
    deletePracticePlanItem: (...a: any[]) => deletePracticePlanItem(...a),
    fetchPracticePlans: (...a: any[]) => fetchPracticePlans(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';
const ROW_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const PLAN_DRILL = {
  id: ROW_A, name: 'Rondo', time: '4:00 PM - 4:20 PM',
  duration: '20 min', coachNotes: 'Two touch'
};

const LIBRARY_DRILL = { id: 'd1', name: 'Pressing shape', category: 'Defending' };

const flush = () => new Promise(r => setTimeout(r, 0));

async function mountModal(props: any = {}) {
  const w = mount(DiagramModal, {
    props: {
      open: true, index: null, libraryDrill: null,
      teamId: TEAM, schoolId: 's1', ...props
    },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: { planner: { items: [PLAN_DRILL] } }
      })]
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
  (window as any).matchMedia = vi.fn().mockReturnValue({ matches: false });
  upsertDrillBankItem.mockResolvedValue({ id: 'd1' });
  fetchDrillsBank.mockResolvedValue([]);
  saveFullPracticePlan.mockResolvedValue({ success: true });
  fetchPracticePlans.mockResolvedValue([]);
});

describe('what it opens on', () => {
  it('names the drill from the timeline', async () => {
    const w = await mountModal({ index: 0 });
    expect(w.text()).toContain('Rondo');
  });

  it('names the drill from the library', async () => {
    const w = await mountModal({ libraryDrill: LIBRARY_DRILL });
    expect(w.text()).toContain('Pressing shape');
  });

  it('shows a board', async () => {
    const w = await mountModal({ index: 0 });
    expect(w.find('[data-board-canvas]').exists()).toBe(true);
  });
});

describe('saving to a drill on the timeline', () => {
  it('writes the diagram onto that drill', async () => {
    const w = await mountModal({ index: 0 });
    await w.find('[data-diagram-save]').trigger('click');
    await flush();

    const written = saveFullPracticePlan.mock.calls[0][1].items[0];
    expect(written.diagramData).toHaveProperty('keyframes');
    expect(written.name).toBe('Rondo');
  });

  it('keeps everything else about the drill', async () => {
    // The save writes the whole plan, so a drill that lost its notes here
    // would lose them in Postgres too.
    const w = await mountModal({ index: 0 });
    await w.find('[data-diagram-save]').trigger('click');
    await flush();

    expect(saveFullPracticePlan.mock.calls[0][1].items[0]).toMatchObject({
      id: ROW_A, coachNotes: 'Two touch', duration: '20 min'
    });
  });

  it('tells its parent once it is saved', async () => {
    const w = await mountModal({ index: 0 });
    await w.find('[data-diagram-save]').trigger('click');
    await flush();

    expect(w.emitted('saved')).toBeTruthy();
    expect(w.emitted('close')).toBeTruthy();
  });

  it('reports a refused write rather than closing', async () => {
    saveFullPracticePlan.mockResolvedValue({ success: false, error: 'No team selected.' });
    const w = await mountModal({ index: 0 });
    await w.find('[data-diagram-save]').trigger('click');
    await flush();

    expect(w.find('[data-diagram-error]').text()).toMatch(/no team/i);
    expect(w.emitted('close')).toBeFalsy();
  });
});

describe('saving to a drill in the library', () => {
  it('writes it to the ORGANIZATION library', async () => {
    const w = await mountModal({ libraryDrill: LIBRARY_DRILL });
    await w.find('[data-diagram-save]').trigger('click');
    await flush();

    expect(upsertDrillBankItem).toHaveBeenCalledWith('s1', expect.objectContaining({
      id: 'd1', name: 'Pressing shape'
    }));
    expect(upsertDrillBankItem.mock.calls[0][1].diagramData).toHaveProperty('keyframes');
  });

  it('re-reads the library, so the new diagram shows', async () => {
    const w = await mountModal({ libraryDrill: LIBRARY_DRILL });
    await w.find('[data-diagram-save]').trigger('click');
    await flush();

    expect(fetchDrillsBank).toHaveBeenCalledWith('s1');
  });

  it('refuses without an organization rather than guessing one', async () => {
    const w = await mountModal({ libraryDrill: LIBRARY_DRILL, schoolId: null });
    await w.find('[data-diagram-save]').trigger('click');
    await flush();

    expect(upsertDrillBankItem).not.toHaveBeenCalled();
    expect(w.find('[data-diagram-error]').text()).toMatch(/organization/i);
  });

  it('reports a refusal instead of claiming it saved', async () => {
    upsertDrillBankItem.mockResolvedValue(null);
    const w = await mountModal({ libraryDrill: LIBRARY_DRILL });
    await w.find('[data-diagram-save]').trigger('click');
    await flush();

    expect(w.find('[data-diagram-error]').exists()).toBe(true);
    expect(w.emitted('close')).toBeFalsy();
  });
});

describe('with nothing to save to', () => {
  it('says so rather than writing somewhere arbitrary', async () => {
    const w = await mountModal({ index: null, libraryDrill: null });
    await w.find('[data-diagram-save]').trigger('click');
    await flush();

    expect(saveFullPracticePlan).not.toHaveBeenCalled();
    expect(upsertDrillBankItem).not.toHaveBeenCalled();
    expect(w.find('[data-diagram-error]').exists()).toBe(true);
  });
});

describe('closing with work that has not been saved', () => {
  /*
   * Closing unmounts the board, and a diagram lives in the canvas until
   * someone saves it. The board looks identical saved or not, so without
   * this the work goes with no prompt and nothing on screen to say so.
   *
   * "+ Time frame" is used to dirty the board because it is a real click a
   * coach makes; placing a piece needs a pointer on a canvas jsdom will not
   * paint.
   */
  const dirty = async (w: any) => {
    await w.find('[data-frame-add]').trigger('click');
    await w.vm.$nextTick();
  };

  it('closes without a word when nothing has been drawn', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountModal({ index: 0 });

    await w.find('.btn').trigger('click');

    expect(confirm).not.toHaveBeenCalled();
    expect(w.emitted('close')).toBeTruthy();
  });

  it('asks before throwing away an edited diagram', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountModal({ index: 0 });
    await dirty(w);

    await w.find('.btn').trigger('click');

    expect(confirm).toHaveBeenCalled();
    expect(confirm.mock.calls[0][0]).toMatch(/not been saved/i);
    expect(w.emitted('close')).toBeTruthy();
  });

  it('stays open when the coach says no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountModal({ index: 0 });
    await dirty(w);

    await w.find('.btn').trigger('click');

    expect(confirm).toHaveBeenCalled();
    expect(w.emitted('close')).toBeFalsy();
  });

  it('asks on Escape too, which is the same discard', async () => {
    // BaseModal emits one close for Cancel, Escape and the backdrop, so all
    // three arrive at the same guard.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountModal({ index: 0 });
    await dirty(w);

    await w.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });

    expect(confirm).toHaveBeenCalled();
    expect(w.emitted('close')).toBeFalsy();
  });

  it('says so on the board while the work is unsaved', async () => {
    const w = await mountModal({ index: 0 });
    expect(w.find('[data-board-unsaved]').exists()).toBe(false);

    await dirty(w);
    expect(w.find('[data-board-unsaved]').text()).toMatch(/unsaved/i);
  });

  it('does not ask after a save, and drops the mark', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountModal({ index: 0 });
    await dirty(w);

    await w.find('[data-diagram-save]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(confirm).not.toHaveBeenCalled();
    expect(w.find('[data-board-unsaved]').exists()).toBe(false);
  });

  it('still asks when the save was refused, because nothing was written', async () => {
    saveFullPracticePlan.mockResolvedValue({ success: false, error: 'No team selected.' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountModal({ index: 0 });
    await dirty(w);

    await w.find('[data-diagram-save]').trigger('click');
    await flush();
    await w.find('.btn').trigger('click');

    expect(confirm).toHaveBeenCalled();
  });
});
