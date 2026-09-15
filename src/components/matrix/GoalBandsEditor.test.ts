/**
 * The Goals-by-role standards for one squad on one drill, a tab per role.
 *
 * The worked example is the check a coach actually reads: it scores a result
 * with the bands on screen, so a pair that pays too much or too little is
 * visible before the save.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import GoalBandsEditor from './GoalBandsEditor.vue';
import { emptyGoalDrafts } from '../../domain/goal-bands-draft';

function drafts() {
  const d = emptyGoalDrafts();
  d.attack.base = [{ threshold: '2', percent: '50' }];
  d.attack.bonus = [{ threshold: '5', percent: '10' }];
  d.defend.base = [{ threshold: '0', percent: '60' }];
  return d;
}

const mountEditor = (rows = drafts()) =>
  mount(GoalBandsEditor, { props: { drillId: 'd1', rows } });

/** The last rows the editor emitted. */
const emitted = (w: any) => w.emitted('update:rows').at(-1)[0];

describe('GoalBandsEditor', () => {
  it('opens on Attack with both lists and a worked example', async () => {
    const w = mountEditor();
    expect(w.find('[data-goal-role-tab="attack"]').attributes('aria-selected')).toBe('true');
    expect(w.find('[data-goal-kind="base"]').text()).toMatch(/Goal difference at least/);
    expect(w.find('[data-goal-kind="bonus"]').text()).toMatch(/Goals scored at least/);
    expect(w.find('[data-goal-example]').text()).toBe('+2 with 5 scored → 50% + 10% = 60%');
  });

  it("words a defender's bonus on goals given up", async () => {
    const w = mountEditor();
    await w.find('[data-goal-role-tab="defend"]').trigger('click');
    expect(w.find('[data-goal-kind="bonus"]').text()).toMatch(/Goals given up at most/);
    expect(w.find('[data-goal-example]').text()).toBe('0 with 0 given up → 60% + 0% = 60%');
  });

  it('labels the tabs with the roster words', () => {
    const tabs = mountEditor().findAll('[data-goal-role-tab]').map(t => t.text());
    expect(tabs).toEqual(['Attack', 'Defence', 'Goalkeeper']);
  });

  it('always leaves one row of boxes in an empty list', async () => {
    const w = mountEditor();
    await w.find('[data-goal-role-tab="keeper"]').trigger('click');
    expect(w.find('[data-goal-kind="base"]').findAll('[data-goal-band-row]')).toHaveLength(1);
    expect(w.find('[data-goal-example]').text()).toBe('Add a goal-difference band to score Goalkeeper.');
  });

  it('emits an edit to the active role only', async () => {
    const w = mountEditor();
    await w.find('[data-goal-kind="base"] [data-goal-percent]').setValue('40');
    const rows = emitted(w);
    expect(rows.attack.base).toEqual([{ threshold: '2', percent: '40' }]);
    expect(rows.defend.base).toEqual([{ threshold: '0', percent: '60' }]);
  });

  it('adds and removes rows in one list', async () => {
    const w = mountEditor();
    await w.find('[data-goal-add="bonus"]').trigger('click');
    expect(emitted(w).attack.bonus).toHaveLength(2);
    await w.setProps({ rows: emitted(w) });
    await w.find('[data-goal-kind="bonus"] [data-goal-remove]').trigger('click');
    expect(emitted(w).attack.bonus).toEqual([{ threshold: '', percent: '' }]);
  });

  it('shows the 100% rule beside the boxes instead of an example', async () => {
    const d = drafts();
    d.attack.bonus = [{ threshold: '5', percent: '60' }];
    const w = mountEditor(d);
    expect(w.find('[data-goal-example]').exists()).toBe(false);
    expect(w.find('[data-goal-problem]').text()).toMatch(/add up to more than 100%/);
  });

  it('shows a duplicate threshold beside the boxes', async () => {
    const d = drafts();
    d.attack.base = [{ threshold: '2', percent: '50' }, { threshold: '2', percent: '30' }];
    expect(mountEditor(d).find('[data-goal-problem]').text()).toMatch(/share the threshold 2/);
  });
});
