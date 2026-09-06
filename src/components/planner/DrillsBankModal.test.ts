/**
 * The organization's drill library.
 *
 * One assertion here is about what this screen deliberately does NOT do. A
 * drill's weight and measure are what the Competitive Matrix scores against,
 * and they already have an editor on Player Ratings. Two editors for one
 * column is how the two drift, so this one shows the weight and says where to
 * change it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import DrillsBankModal from './DrillsBankModal.vue';

const upsertDrillBankItem = vi.fn();
const deleteDrillBankItem = vi.fn();
const fetchDrillsBank = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    upsertDrillBankItem: (...a: any[]) => upsertDrillBankItem(...a),
    deleteDrillBankItem: (...a: any[]) => deleteDrillBankItem(...a),
    fetchDrillsBank: (...a: any[]) => fetchDrillsBank(...a)
  }
}));

const LIBRARY = [
  { id: 'd1', name: 'Rondo', category: 'Possession', points: 2, coach_notes: 'Two touch' },
  { id: 'd2', name: 'Shooting', category: 'Finishing', points: 3 },
  { id: 'd3', name: 'Retired', is_deleted: true }
];

const flush = () => new Promise(r => setTimeout(r, 0));

function mountBank(opts: { library?: any[]; schoolId?: string | null } = {}) {
  const { library = LIBRARY, schoolId = 's1' } = opts;
  return mount(DrillsBankModal, {
    props: { open: true, schoolId },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: { planner: { drillsBank: library } }
      })]
    },
    attachTo: document.body
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  upsertDrillBankItem.mockResolvedValue({ id: 'd9', name: 'New Drill' });
  deleteDrillBankItem.mockResolvedValue({ ok: true });
  fetchDrillsBank.mockResolvedValue(LIBRARY);
});

describe('the list', () => {
  it('shows the library', () => {
    const w = mountBank();
    expect(w.findAll('[data-library-row]')).toHaveLength(2);
  });

  it('leaves out a drill that has been removed', () => {
    // Soft deletes are the repo-wide convention; readers filter on them.
    const w = mountBank();
    expect(w.text()).not.toContain('Retired');
  });

  it('says the library is empty rather than showing nothing', () => {
    const w = mountBank({ library: [] });
    expect(w.find('[data-library-empty]').exists()).toBe(true);
  });

  it('says the library belongs to the organization, not the team', () => {
    // drills_bank is school-scoped, so a drill written here reaches the
    // club's other squads too.
    const w = mountBank();
    expect(w.text()).toMatch(/organization/i);
  });
});

describe('the matrix weight', () => {
  it('is shown, because it decides how the Matrix scores the drill', () => {
    const w = mountBank();
    expect(w.find('[data-library-weight]').text()).toContain('2');
  });

  it('is NOT editable here', () => {
    // Player Ratings owns it. A second editor for one column is how the two
    // drift, and the Matrix is the screen where the number means something.
    const w = mountBank();
    expect(w.find('input[data-library-weight-input]').exists()).toBe(false);
    expect(w.find('[data-weights-note]').text()).toMatch(/player ratings/i);
  });
});

describe('adding a drill', () => {
  it('writes it to the ORGANIZATION library', async () => {
    const w = mountBank();
    await w.find('[data-library-new]').trigger('click');
    await w.find('[data-library-name-input]').setValue('Pressing shape');
    await w.find('[data-library-save]').trigger('click');
    await flush();

    expect(upsertDrillBankItem).toHaveBeenCalledWith('s1', expect.objectContaining({
      name: 'Pressing shape'
    }));
  });

  it('will not save a drill with no name', async () => {
    const w = mountBank();
    await w.find('[data-library-new]').trigger('click');
    await w.find('[data-library-save]').trigger('click');

    expect(upsertDrillBankItem).not.toHaveBeenCalled();
    expect(w.find('[data-library-error]').text()).toMatch(/name/i);
  });

  it('refuses to write without an organization rather than guessing one', async () => {
    // A bare call would be refused, or worse, land in somebody else's library.
    const w = mountBank({ schoolId: null });
    await w.find('[data-library-new]').trigger('click');
    await w.find('[data-library-name-input]').setValue('Pressing shape');
    await w.find('[data-library-save]').trigger('click');

    expect(upsertDrillBankItem).not.toHaveBeenCalled();
    expect(w.find('[data-library-error]').text()).toMatch(/organization/i);
  });

  it('defaults the category rather than storing an empty one', async () => {
    const w = mountBank();
    await w.find('[data-library-new]').trigger('click');
    await w.find('[data-library-name-input]').setValue('Pressing shape');
    await w.find('[data-library-save]').trigger('click');
    await flush();

    expect(upsertDrillBankItem.mock.calls[0][1].category).toBe('General');
  });

  it('re-reads the library after saving', async () => {
    const w = mountBank();
    await w.find('[data-library-new]').trigger('click');
    await w.find('[data-library-name-input]').setValue('Pressing shape');
    await w.find('[data-library-save]').trigger('click');
    await flush();

    expect(fetchDrillsBank).toHaveBeenCalledWith('s1');
  });

  it('reports a refusal instead of closing the form', async () => {
    upsertDrillBankItem.mockResolvedValue(null);
    const w = mountBank();
    await w.find('[data-library-new]').trigger('click');
    await w.find('[data-library-name-input]').setValue('Pressing shape');
    await w.find('[data-library-save]').trigger('click');
    await flush();

    expect(w.find('[data-library-error]').exists()).toBe(true);
    expect(w.find('[data-library-form]').exists()).toBe(true);
  });
});

describe('editing a drill', () => {
  it('opens on what is there and keeps its id', async () => {
    const w = mountBank();
    await w.findAll('[data-library-edit]')[0].trigger('click');
    expect((w.find('[data-library-name-input]').element as HTMLInputElement).value).toBe('Rondo');

    await w.find('[data-library-save]').trigger('click');
    await flush();
    expect(upsertDrillBankItem.mock.calls[0][1].id).toBe('d1');
  });
});

describe('removing a drill', () => {
  it('asks first, and says sessions keep their copy', async () => {
    // A plan item carries its own name, times and diagram, so removing the
    // library drill does not gut a session already built on it.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountBank();
    await w.findAll('[data-library-delete]')[0].trigger('click');

    expect(confirmSpy.mock.calls[0][0]).toMatch(/keep their copy/i);
    expect(deleteDrillBankItem).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('removes it and re-reads once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mountBank();
    await w.findAll('[data-library-delete]')[0].trigger('click');
    await flush();

    expect(deleteDrillBankItem).toHaveBeenCalledWith('d1');
    expect(fetchDrillsBank).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe('using a drill in the plan', () => {
  it('hands the whole drill up, not just its name', async () => {
    // The caller needs the notes and the diagram too, or a coach redraws
    // something the library already holds.
    const w = mountBank();
    await w.findAll('[data-library-use]')[0].trigger('click');
    expect(w.emitted('use')![0][0]).toMatchObject({ id: 'd1', name: 'Rondo' });
  });
});
