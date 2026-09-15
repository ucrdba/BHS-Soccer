/**
 * The roster form's position is a picker of the numbers 1-11, each labelled
 * with its role, plus a blank for "not set". Free text is gone: it is what let
 * "FB", "MF" and "Center Midfield" into the column.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PlayerFormModal from './PlayerFormModal.vue';

const PLAYER = {
  id: 'p1', membershipId: 'm1', name: 'Cesar Alva', firstName: 'Cesar', lastName: 'Alva',
  classYear: 'Senior', height: '5-10', photo: '', number: 9, recordingNumber: 3,
  position: 4, seasonStats: {}, ratings: {}
};

function mountForm(player: any = null) {
  return mount(PlayerFormModal, { props: { open: true, player }, attachTo: document.body });
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('the position picker', () => {
  it('offers blank, then 1-11 labelled with their role', () => {
    const w = mountForm();
    const options = w.findAll('[data-field="position"] option').map(o => o.text().trim());
    expect(options).toEqual([
      '—', '1 · Goalkeeper', '2 · Defence', '3 · Defence', '4 · Defence', '5 · Defence', '6 · Defence',
      '7 · Attack', '8 · Attack', '9 · Attack', '10 · Attack', '11 · Attack'
    ]);
  });

  it("opens on the player's position when editing", () => {
    const w = mountForm(PLAYER);
    expect((w.find('[data-field="position"]').element as HTMLSelectElement).value).toBe('4');
  });

  it('saves the position as a number', async () => {
    const w = mountForm(PLAYER);
    await w.find('[data-field="position"]').setValue('9');
    await w.find('form').trigger('submit');
    expect((w.emitted('save') as any[])[0][0].position).toBe(9);
  });

  it('saves a blank position as null', async () => {
    const w = mountForm(PLAYER);
    await w.find('[data-field="position"]').setValue('');
    await w.find('form').trigger('submit');
    expect((w.emitted('save') as any[])[0][0].position).toBeNull();
  });
});
