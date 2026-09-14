/**
 * A player's bio, as anyone may see it.
 *
 * The four skill ratings are on the public bio (the functional specification
 * lists them there), shown as bars out of a hundred and only when set. A
 * missing value is left out, never drawn at zero.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('../../demo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../demo')>();
  return { ...actual, demoConfig: vi.fn(() => ({ enabled: false, password: '' })) };
});

import { demoConfig } from '../../demo';
import PlayerDetailModal from './PlayerDetailModal.vue';

const PLAYER = {
  id: 'p1', membershipId: 'm1', name: 'Marcus Delgado', firstName: 'Marcus', lastName: 'Delgado',
  classYear: 'Senior', height: '5′ 11″', photo: '', number: 9, recordingNumber: 7,
  position: 'Striker', seasonStats: { goals: 11, assists: 6 },
  ratings: { technical: 80, tactical: 70, physical: 90, mental: 70 }
};

const mountWith = (player: any, canSeeRatings = true) =>
  mount(PlayerDetailModal, { props: { open: true, player, canSeeRatings } });

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

  it('draws the four skill ratings as bars out of a hundred', () => {
    const w = mountWith(PLAYER);
    const bars = w.findAll('[data-skill-bar]');
    expect(bars).toHaveLength(4);
    expect(bars[0].find('.skill__name').text()).toBe('Technical');
    expect(bars[0].find('.skill__value').text().replace(/\s+/g, ' ')).toBe('80 /100');
    expect(bars[0].find('[data-skill-fill]').attributes('style')).toContain('width: 80%');
  });

  it('leaves out ratings that are not set, and the section when none are', () => {
    expect(mountWith({ ...PLAYER, ratings: { mental: 60 } }).findAll('[data-skill-bar]')).toHaveLength(1);
    const none = mountWith({ ...PLAYER, ratings: {} });
    expect(none.findAll('[data-skill-bar]')).toHaveLength(0);
    expect(none.text()).not.toMatch(/skill ratings/i);
  });

  it('shows a plate that says the photo is missing, without a number if there is none', () => {
    const w = mountWith({ ...PLAYER, number: null, classYear: '' });
    expect(w.find('[data-photo-missing]').exists()).toBe(true);
    expect(w.find('[data-bio-kicker]').exists()).toBe(false);
  });

  it('shows the photograph when the player has one', () => {
    const w = mountWith({ ...PLAYER, photo: 'https://example.test/marcus.jpg' });
    const img = w.find('.plate__img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.test/marcus.jpg');
    // The plate says "Photo" only when there is not one.
    expect(w.find('[data-photo-missing]').exists()).toBe(false);
  });

  it('hides the ratings from a viewer who may not see them', () => {
    // A coach's assessment of a minor is not public. The roster decides who
    // qualifies; the bio only obeys.
    const w = mountWith(PLAYER, false);
    expect(w.findAll('[data-skill-bar]')).toHaveLength(0);
    expect(w.text()).not.toMatch(/skill ratings/i);
    // The rest of the bio is unaffected.
    expect(w.text()).toContain('Marcus Delgado');
    expect(w.findAll('[data-season-stat]').length).toBeGreaterThan(0);
  });

  describe('the account section', () => {
    const mountInvite = () => mount(PlayerDetailModal, {
      props: { open: true, player: PLAYER, canInvite: true, teamId: 't1' },
      global: { stubs: { InviteControl: true } }
    });

    it('offers an invitation to a coach who may send one', () => {
      expect(mountInvite().find('[data-bio-account]').exists()).toBe(true);
    });

    it('is absent on the demo deployment, where nobody should be invited', () => {
      // The demo's accounts are shared and public; nobody real should be
      // invited from it.
      vi.mocked(demoConfig).mockReturnValueOnce({ enabled: true, password: 'demo-pass' });
      expect(mountInvite().find('[data-bio-account]').exists()).toBe(false);
    });
  });

  it('hides them when nobody says otherwise', () => {
    // The prop defaults to false, so a screen that forgets it shows nothing
    // rather than everything.
    const w = mount(PlayerDetailModal, { props: { open: true, player: PLAYER } });
    expect(w.findAll('[data-skill-bar]')).toHaveLength(0);
  });
});
