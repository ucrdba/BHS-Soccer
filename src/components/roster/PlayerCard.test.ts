import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlayerCard from './PlayerCard.vue';

const base = {
  id: 'p1', membershipId: 'm1', name: 'Cesar Alva', firstName: 'Cesar', lastName: 'Alva',
  classYear: 'Senior', height: '', photo: '', number: 9, recordingNumber: 3,
  seasonStats: {}, ratings: {}
};

describe('the card', () => {
  it('shows the role with the position number', () => {
    const w = mount(PlayerCard, { props: { player: { ...base, position: 4 }, canEdit: false } });
    expect(w.text()).toContain('Defence (4)');
  });

  it('says the position is not recorded when there is none', () => {
    const w = mount(PlayerCard, { props: { player: { ...base, position: null }, canEdit: false } });
    expect(w.text()).toContain('Position not recorded');
  });
});
