/**
 * Adding and editing one drill.
 *
 * The three-way time arithmetic is the substance. Typing a start and an end
 * fills the duration, picking a duration fills the end, and either edit
 * leaves the third field agreeing with the other two -- a form where the
 * duration says 20 min and the times say fifteen prints a plan a coach cannot
 * run against a watch.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import DrillFormModal from './DrillFormModal.vue';

vi.mock('../../data/supabase', () => ({ supabaseService: {} }));

const LIBRARY = [
  {
    id: 'd1', name: 'Rondo', duration: '15 min', coach_notes: 'Two touch',
    diagram_image: 'data:image/png;base64,x', diagram_data: { pitchType: 'full' }
  },
  { id: 'd2', name: 'Shooting' }
];

const ITEMS = [
  { name: 'Warm up', time: '4:00 PM - 4:20 PM', duration: '20 min', coachNotes: 'Easy' }
];

function mountForm(opts: { index?: number | null; items?: any[]; library?: any[] } = {}) {
  const { index = null, items = [], library = LIBRARY } = opts;
  return mount(DrillFormModal, {
    props: { open: true, index },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: true,
        initialState: { planner: { items, drillsBank: library } }
      })]
    },
    attachTo: document.body
  });
}

const saved = (w: any) => w.emitted('save')?.[0]?.[0];

beforeEach(() => { document.body.innerHTML = ''; });

describe('a new drill', () => {
  it('starts where the last one ended', async () => {
    // Adding a drill means "and then this", not "at four o'clock".
    const w = mountForm({ items: ITEMS });
    expect((w.find('[data-drill-start]').element as HTMLInputElement).value).toBe('16:20');
  });

  it('starts an empty session at 4:00 PM', () => {
    // Practice is after school.
    const w = mountForm();
    expect((w.find('[data-drill-start]').element as HTMLInputElement).value).toBe('16:00');
  });

  it('defaults to twenty minutes', () => {
    const w = mountForm();
    expect((w.find('[data-drill-end]').element as HTMLInputElement).value).toBe('16:20');
  });
});

describe('the three-way arithmetic', () => {
  it('fills the end when a duration is picked', async () => {
    const w = mountForm();
    await w.find('[data-drill-duration]').setValue('45 min');
    expect((w.find('[data-drill-end]').element as HTMLInputElement).value).toBe('16:45');
  });

  it('reads the duration back out of the times', async () => {
    const w = mountForm();
    await w.find('[data-drill-end]').setValue('16:35');
    await w.find('[data-drill-end]').trigger('change');
    expect(w.find('[data-drill-slot]').text()).toContain('35 min');
  });

  it('shows the slot as it will be printed', async () => {
    const w = mountForm();
    expect(w.find('[data-drill-slot]').text()).toContain('4:00 PM - 4:20 PM');
  });

  it('selects custom for a duration the list does not hold', async () => {
    // Snapping to the nearest preset would quietly change the drill the coach
    // just timed.
    const w = mountForm();
    await w.find('[data-drill-end]').setValue('16:37');
    await w.find('[data-drill-end]').trigger('change');
    expect((w.find('[data-drill-duration]').element as HTMLSelectElement).value).toBe('custom');
  });

  it('rolls over midnight rather than going negative', async () => {
    const w = mountForm();
    await w.find('[data-drill-start]').setValue('23:40');
    await w.find('[data-drill-start]').trigger('change');
    await w.find('[data-drill-end]').setValue('00:10');
    await w.find('[data-drill-end]').trigger('change');

    expect(w.find('[data-drill-slot]').text()).toContain('30 min');
  });
});

describe('saving', () => {
  it('emits the drill with its slot and duration', async () => {
    const w = mountForm();
    await w.find('[data-drill-name-input]').setValue('Rondo');
    await w.find('[data-drill-save]').trigger('click');

    expect(saved(w)).toMatchObject({
      name: 'Rondo', time: '4:00 PM - 4:20 PM', duration: '20 min'
    });
  });

  it('will not save a drill with no name', async () => {
    const w = mountForm();
    await w.find('[data-drill-save]').trigger('click');

    expect(w.emitted('save')).toBeFalsy();
    expect(w.find('[data-drill-error]').text()).toMatch(/name/i);
  });

  it('trims the name rather than storing the spaces', async () => {
    const w = mountForm();
    await w.find('[data-drill-name-input]').setValue('  Rondo  ');
    await w.find('[data-drill-save]').trigger('click');
    expect(saved(w).name).toBe('Rondo');
  });

  it('keeps the coach notes', async () => {
    const w = mountForm();
    await w.find('[data-drill-name-input]').setValue('Rondo');
    await w.find('[data-drill-notes]').setValue('Two touch, keep it tight');
    await w.find('[data-drill-save]').trigger('click');
    expect(saved(w).coachNotes).toBe('Two touch, keep it tight');
  });
});

describe('editing an existing drill', () => {
  it('opens on what is already there', () => {
    const w = mountForm({ index: 0, items: ITEMS });
    expect((w.find('[data-drill-name-input]').element as HTMLInputElement).value).toBe('Warm up');
    expect((w.find('[data-drill-start]').element as HTMLInputElement).value).toBe('16:00');
    expect((w.find('[data-drill-end]').element as HTMLInputElement).value).toBe('16:20');
  });

  it('keeps the row id, or the save would insert a second drill', async () => {
    const w = mountForm({ index: 0, items: [{ ...ITEMS[0], id: 'row-1' }] });
    await w.find('[data-drill-save]').trigger('click');
    expect(saved(w).id).toBe('row-1');
  });

  it('keeps the drill\'s own diagram', async () => {
    const w = mountForm({
      index: 0,
      items: [{ ...ITEMS[0], diagramData: { pitchType: 'half' } }]
    });
    await w.find('[data-drill-save]').trigger('click');
    expect(saved(w).diagramData).toEqual({ pitchType: 'half' });
  });

  it('does not offer the library, which would replace what is being edited', () => {
    const w = mountForm({ index: 0, items: ITEMS });
    expect(w.find('[data-drill-library]').exists()).toBe(false);
  });
});

describe('starting from the library', () => {
  it('copies the drill\'s name and notes', async () => {
    const w = mountForm();
    await w.find('[data-drill-library]').setValue('d1');

    expect((w.find('[data-drill-name-input]').element as HTMLInputElement).value).toBe('Rondo');
    expect((w.find('[data-drill-notes]').element as HTMLTextAreaElement).value).toBe('Two touch');
  });

  it('uses the drill\'s own duration', async () => {
    const w = mountForm();
    await w.find('[data-drill-library]').setValue('d1');
    expect((w.find('[data-drill-end]').element as HTMLInputElement).value).toBe('16:15');
  });

  it('brings the diagram with it', async () => {
    // A library drill is a drill AND its diagram; copying only the name would
    // leave a coach redrawing something they already have.
    const w = mountForm();
    await w.find('[data-drill-library]').setValue('d1');
    await w.find('[data-drill-save]').trigger('click');

    expect(saved(w).diagramData).toEqual({ pitchType: 'full' });
    expect(saved(w).diagramImage).toBe('data:image/png;base64,x');
  });

  it('copes with a library drill that has no duration', async () => {
    const w = mountForm();
    await w.find('[data-drill-library]').setValue('d2');
    expect((w.find('[data-drill-name-input]').element as HTMLInputElement).value).toBe('Shooting');
  });

  it('is not offered at all when the library is empty', () => {
    const w = mountForm({ library: [] });
    expect(w.find('[data-drill-library]').exists()).toBe(false);
  });
});
