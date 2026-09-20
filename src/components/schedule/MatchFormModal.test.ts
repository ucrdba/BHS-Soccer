/**
 * Adding or editing a fixture.
 *
 * The status the form sends has to be one the schedule table allows. It
 * offered "SCHEDULED", which `schedule_status_check` refuses, so every new
 * fixture came back as "The match could not be saved" -- and no test saw it,
 * because nothing in the app reads the word: every filter asks only whether a
 * match is COMPLETED.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MatchFormModal from './MatchFormModal.vue';
import { MATCH_STATUSES } from '../../types';

const mountForm = (match: any = null) =>
  mount(MatchFormModal, { props: { open: true, match }, attachTo: document.body });

const save = async (w: any) => {
  await w.find('form').trigger('submit');
  return (w.emitted('save') as any[])[0][0];
};

describe('the status a fixture is saved with', () => {
  it('offers only statuses the database accepts', () => {
    const offered = mountForm().findAll('[data-field="status"] option').map(o => o.attributes('value'));
    expect(offered).toEqual([...MATCH_STATUSES]);
  });

  it('saves a new fixture as upcoming', async () => {
    const w = mountForm();
    await w.find('[data-field="opponent"]').setValue('Yucaipa');
    expect((await save(w)).status).toBe('UPCOMING');
  });

  it('keeps the status a recorded fixture already has', async () => {
    const w = mountForm({ id: 'm1', date: 'SEP 4 2026', time: '6:00 PM', opponent: 'Yucaipa',
      location: 'Varsity Field', status: 'COMPLETED', isHome: true, score: '3 - 1' });
    expect((await save(w)).status).toBe('COMPLETED');
  });

  it('reads a fixture with no status as upcoming, never as a word the table refuses', async () => {
    const w = mountForm({ id: 'm1', date: 'SEP 4 2026', time: '6:00 PM', opponent: 'Yucaipa',
      location: 'Varsity Field', status: null, isHome: true, score: '' });
    expect((await save(w)).status).toBe('UPCOMING');
  });

  it('names each status in words a coach reads', () => {
    const labels = mountForm().findAll('[data-field="status"] option').map(o => o.text());
    expect(labels).toEqual(['Upcoming', 'Completed', 'Cancelled']);
  });
});
