/**
 * A player's bio, as anyone may see it.
 *
 * The four skill ratings are on the public bio (the functional specification
 * lists them there), shown as bars out of ten and only when set. A missing
 * value is left out, never drawn at zero.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlayerDetailModal from './PlayerDetailModal.vue';

const PLAYER = {
  id: 'p1', membershipId: 'm1', name: 'Marcus Delgado', firstName: 'Marcus', lastName: 'Delgado',
  classYear: 'Senior', height: '5′ 11″', photo: '', number: 9, recordingNumber: 7,
  position: 'Striker', seasonStats: { goals: 11, assists: 6 },
  ratings: { technical: 8, tactical: 7, physical: 9, mental: 7 }
};

const mountWith = (player: any) => mount(PlayerDetailModal, { props: { open: true, player } });

describe('PlayerDetailModal', () => {
  it('reads number and class year as the kicker, and position and height under the name', () => {
    const w = mountWith(PLAYER);
    // The capitals are CSS; the text itself reads as typed.
    expect(w.find('[data-bio-kicker]').text().replace(/\s+/g, ' ')).toBe('No. 9 · Senior');
    expect(w.text()).toContain('Marcus Delgado');
    expect(w.text()).toContain('Striker');
    expect(w.text()).toContain('5′ 11″');
  });

  it('shows the season figures', () => {
    const w = mountWith(PLAYER);
    // Vue condenses the whitespace between the two spans, so read them apart.
    const stats = w.findAll('[data-season-stat]')
      .map(n => `${n.find('.figure__value').text()} ${n.find('.figure__label').text()}`);
    expect(stats).toEqual(['11 Goals', '6 Assists']);
  });

  it('draws the four skill ratings as bars out of ten', () => {
    const w = mountWith(PLAYER);
    const bars = w.findAll('[data-skill-bar]');
    expect(bars).toHaveLength(4);
    expect(bars[0].find('.skill__name').text()).toBe('Technical');
    expect(bars[0].find('.skill__value').text().replace(/\s+/g, ' ')).toBe('8 /10');
    expect(bars[0].find('[data-skill-fill]').attributes('style')).toContain('width: 80%');
  });

  it('leaves out ratings that are not set, and the section when none are', () => {
    expect(mountWith({ ...PLAYER, ratings: { mental: 6 } }).findAll('[data-skill-bar]')).toHaveLength(1);
    const none = mountWith({ ...PLAYER, ratings: {} });
    expect(none.findAll('[data-skill-bar]')).toHaveLength(0);
    expect(none.text()).not.toMatch(/skill ratings/i);
  });

  it('shows a plate that says the photo is missing, without a number if there is none', () => {
    const w = mountWith({ ...PLAYER, number: null, classYear: '' });
    expect(w.find('[data-photo-missing]').exists()).toBe(true);
    expect(w.find('[data-bio-kicker]').exists()).toBe(false);
  });
});
