/**
 * Drill categories.
 *
 * The half of this that matters is the drift. drills_bank.category is free
 * TEXT rather than a foreign key, so a drill can carry a name no category row
 * defines -- and on the live data many do. Those are shown as their own group
 * rather than silently ignored, and can be adopted or merged.
 *
 * Everything destructive says how many drills it moves, because that is what
 * makes retiring or merging a decision rather than a guess.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import CategoriesSection from './CategoriesSection.vue';

const fetchSoccerCategories = vi.fn();
const fetchCategoryUsage = vi.fn();
const upsertSoccerCategory = vi.fn();
const renameSoccerCategory = vi.fn();
const mergeSoccerCategory = vi.fn();
const retireSoccerCategory = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchSoccerCategories: (...a: any[]) => fetchSoccerCategories(...a),
    fetchCategoryUsage: (...a: any[]) => fetchCategoryUsage(...a),
    upsertSoccerCategory: (...a: any[]) => upsertSoccerCategory(...a),
    renameSoccerCategory: (...a: any[]) => renameSoccerCategory(...a),
    mergeSoccerCategory: (...a: any[]) => mergeSoccerCategory(...a),
    retireSoccerCategory: (...a: any[]) => retireSoccerCategory(...a)
  }
}));

const CATEGORIES = [
  { id: 'c1', name: 'Possession' },
  { id: 'c2', name: 'Finishing' }
];

/** "Set Pieces" is used by drills but has no category row — a stray. */
const USAGE = { Possession: 6, Finishing: 2, 'Set Pieces': 3 };

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountCats(opts: { categories?: any; usage?: any; schoolId?: string | null } = {}) {
  const { categories = CATEGORIES, usage = USAGE, schoolId = 's1' } = opts;
  fetchSoccerCategories.mockResolvedValue(categories);
  fetchCategoryUsage.mockResolvedValue(usage);

  const w = mount(CategoriesSection, { props: { schoolId }, attachTo: document.body });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  upsertSoccerCategory.mockResolvedValue({ ok: true });
  renameSoccerCategory.mockResolvedValue({ ok: true, drillsUpdated: 6 });
  mergeSoccerCategory.mockResolvedValue({ ok: true, drillsUpdated: 3 });
  retireSoccerCategory.mockResolvedValue({ ok: true });
});

describe('the list', () => {
  it('shows every defined category', async () => {
    const w = await mountCats();
    expect(w.findAll('[data-category-row]')).toHaveLength(2);
  });

  it('says HOW MANY DRILLS use each', async () => {
    // Which is what makes retiring one a decision rather than a guess.
    const w = await mountCats();
    expect(w.find('[data-category-usage]').text()).toContain('6');
  });

  it('passes the organization to the read, which demands one', async () => {
    // Note that the CLIENT then ignores it -- see the known gap at the top of
    // CategoriesSection.vue. The argument is passed because requireOrg
    // refuses without it, not because it scopes anything.
    await mountCats();
    expect(fetchSoccerCategories).toHaveBeenCalledWith('s1');
  });

  it('reports a failed read', async () => {
    const w = await mountCats({ usage: null });
    expect(w.find('[data-categories-error]').exists()).toBe(true);
  });
});

describe('THE STRAYS', () => {
  it('shows a name drills use that no category defines', async () => {
    // drills_bank.category is free text, so this is a real state -- and it is
    // shown rather than silently ignored.
    const w = await mountCats();
    expect(w.findAll('[data-stray-row]')).toHaveLength(1);
    expect(w.find('[data-stray-name]').text()).toBe('Set Pieces');
  });

  it('does not list a defined category as a stray', async () => {
    const w = await mountCats();
    const strays = w.findAll('[data-stray-name]').map((s: any) => s.text());
    expect(strays).not.toContain('Possession');
  });

  it('explains why they exist, rather than just listing them', async () => {
    const w = await mountCats();
    expect(w.text()).toMatch(/free text/i);
  });

  it('adopts one into a real category', async () => {
    const w = await mountCats();
    await w.find('[data-stray-adopt="Set Pieces"]').trigger('click');
    await flush();

    // One argument: the client takes no organization for this write.
    expect(upsertSoccerCategory).toHaveBeenCalledWith('s1', { name: 'Set Pieces' });
  });

  it('MERGES one, naming both sides and the drill count', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountCats();
    await w.find('[data-stray-merge-pick="Set Pieces"]').setValue('Possession');
    await w.find('[data-stray-merge="Set Pieces"]').trigger('click');

    const asked = confirmSpy.mock.calls[0][0];
    expect(asked).toContain('Set Pieces');
    expect(asked).toContain('Possession');
    expect(asked).toContain('3 drills');
    confirmSpy.mockRestore();
  });

  it('says a merge is not undone in one step', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountCats();
    await w.find('[data-stray-merge-pick="Set Pieces"]').setValue('Possession');
    await w.find('[data-stray-merge="Set Pieces"]').trigger('click');

    expect(confirmSpy.mock.calls[0][0]).toMatch(/cannot be undone/i);
    confirmSpy.mockRestore();
  });

  it('refuses a merge with no destination picked', async () => {
    const w = await mountCats();
    await w.find('[data-stray-merge="Set Pieces"]').trigger('click');
    await flush();

    expect(mergeSoccerCategory).not.toHaveBeenCalled();
    expect(w.find('[data-categories-action-error]').text()).toMatch(/pick a category/i);
  });
});

describe('retiring a category', () => {
  it('SAYS HOW MANY DRILLS keep the name', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountCats();
    await w.find('[data-category-retire="c1"]').trigger('click');

    const asked = confirmSpy.mock.calls[0][0];
    expect(asked).toContain('6 drills');
    expect(asked).toMatch(/keep the name/i);
    expect(retireSoccerCategory).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('says nothing else changes when no drills use it', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountCats({ usage: { Possession: 0, Finishing: 0 } });
    await w.find('[data-category-retire="c1"]').trigger('click');

    expect(confirmSpy.mock.calls[0][0]).toMatch(/nothing else changes/i);
    confirmSpy.mockRestore();
  });

  it('retires and re-reads once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountCats();
    await w.find('[data-category-retire="c1"]').trigger('click');
    await flush();

    expect(retireSoccerCategory).toHaveBeenCalledWith('c1');
    expect(fetchCategoryUsage).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });
});

describe('renaming', () => {
  it('sends the id, the old name and the new one', async () => {
    // The old name is needed because the drills carry it as text.
    const w = await mountCats();
    await w.find('[data-category-edit="c1"]').trigger('click');
    await w.find('[data-category-edit-name]').setValue('Rondos');
    await w.find('[data-category-save]').trigger('click');
    await flush();

    expect(renameSoccerCategory).toHaveBeenCalledWith('s1', 'c1', 'Possession', 'Rondos');
  });

  it('says how many drills moved with it', async () => {
    const w = await mountCats();
    await w.find('[data-category-edit="c1"]').trigger('click');
    await w.find('[data-category-edit-name]').setValue('Rondos');
    await w.find('[data-category-save]').trigger('click');
    await flush();

    expect(w.find('[data-categories-notice]').text()).toContain('6 drills');
  });

  it('passes on a clash in the client\'s own words', async () => {
    renameSoccerCategory.mockResolvedValue({
      ok: false, error: '"Finishing" already exists. Use Merge to combine the two instead.'
    });
    const w = await mountCats();
    await w.find('[data-category-edit="c1"]').trigger('click');
    await w.find('[data-category-edit-name]').setValue('Finishing');
    await w.find('[data-category-save]').trigger('click');
    await flush();

    expect(w.find('[data-categories-action-error]').text()).toMatch(/use merge/i);
  });
});

describe('adding a category', () => {
  it('adds it to the organization', async () => {
    const w = await mountCats();
    await w.find('[data-category-new]').setValue('Transition');
    await w.find('[data-category-add-form]').trigger('submit');
    await flush();

    expect(upsertSoccerCategory).toHaveBeenCalledWith('s1', { name: 'Transition' });
  });

  it('will not add an empty one', async () => {
    const w = await mountCats();
    await w.find('[data-category-add-form]').trigger('submit');
    await flush();

    expect(upsertSoccerCategory).not.toHaveBeenCalled();
  });

  it('refuses without an organization rather than guessing one', async () => {
    const w = await mountCats({ schoolId: null });
    await w.find('[data-category-new]').setValue('Transition');
    await w.find('[data-category-add-form]').trigger('submit');
    await flush();

    expect(upsertSoccerCategory).not.toHaveBeenCalled();
    expect(w.find('[data-categories-action-error]').text()).toMatch(/organization/i);
  });
});
