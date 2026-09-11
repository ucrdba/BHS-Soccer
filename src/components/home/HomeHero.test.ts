/**
 * The band at the top of the home page: the organization's photo, or its
 * colour, with the next match over it (spec 2026-09-10-home-hero-design.md
 * §4). Presentational -- HomeView works out every string -- so these tests
 * are about what is shown and what happens when an image will not load.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HomeHero from './HomeHero.vue';

const BASE = {
  photo: '/img/band.jpg',
  logo: '/img/logo.png',
  orgName: 'Legends FC',
  place: 'SoCal Premier · Riverside, CA',
  kicker: 'Next match · Away',
  headline: 'Sultana',
  quiet: false,
  countdown: {
    parts: [{ value: '88', unit: 'days' }, { value: '21', unit: 'hrs' }],
    spoken: '88 days and 21 hours until kick-off',
    underway: false
  },
  when: 'DEC 8 2026 (Tue) · Kick-off 4:30 PM'
};

const mountHero = (over: Record<string, any> = {}) =>
  mount(HomeHero, { props: { ...BASE, ...over } });

describe('the photo', () => {
  it("shows the organization's photo, as decoration", () => {
    const img = mountHero().find('[data-band-photo]');
    expect(img.attributes('src')).toBe('/img/band.jpg');
    expect(img.attributes('alt')).toBe('');
  });

  it('marks the photo to load first, being the largest thing on the page', () => {
    expect(mountHero().find('[data-band-photo]').attributes('fetchpriority')).toBe('high');
  });

  it('shows the colour band when there is no photo', () => {
    const w = mountHero({ photo: '' });
    expect(w.find('[data-band-photo]').exists()).toBe(false);
    expect(w.find('[data-home-band]').classes()).not.toContain('band--photo');
  });

  /*
   * An admin types the address. A typo or a file never uploaded would
   * otherwise leave a broken image behind the next match.
   */
  it('falls back to the colour band when the photo fails to load', async () => {
    const w = mountHero();
    await w.find('[data-band-photo]').trigger('error');
    expect(w.find('[data-band-photo]').exists()).toBe(false);
    expect(w.find('[data-home-band]').classes()).not.toContain('band--photo');
  });

  it('brings the photo back once the address changes, without a reload', async () => {
    const w = mountHero();
    await w.find('[data-band-photo]').trigger('error');
    await w.setProps({ photo: '/img/fixed.jpg' });
    expect(w.find('[data-band-photo]').attributes('src')).toBe('/img/fixed.jpg');
  });
});

describe('who we are', () => {
  it('shows the logo, named, and the league line', () => {
    const w = mountHero();
    expect(w.find('[data-band-logo]').attributes('alt')).toBe('Legends FC');
    expect(w.find('[data-band-who]').text()).toContain('SoCal Premier · Riverside, CA');
  });

  it('hides a logo that fails, and keeps the league line', async () => {
    const w = mountHero();
    await w.find('[data-band-logo]').trigger('error');
    expect(w.find('[data-band-logo]').exists()).toBe(false);
    expect(w.find('[data-band-who]').text()).toContain('SoCal Premier');
  });

  it('brings the logo back once its address is corrected, without a reload', async () => {
    const w = mountHero();
    await w.find('[data-band-logo]').trigger('error');
    await w.setProps({ logo: '/img/fixed-logo.png' });
    expect(w.find('[data-band-logo]').attributes('src')).toBe('/img/fixed-logo.png');
  });

  it('leaves the row out with neither a logo nor a league or city', () => {
    expect(mountHero({ logo: '', place: '' }).find('[data-band-who]').exists()).toBe(false);
  });
});

describe('the next match', () => {
  it('names the opponent as the heading', () => {
    expect(mountHero().find('[data-next-fixture]').text()).toBe('Sultana');
  });

  it('sets the countdown as figures, and reads it as a sentence', () => {
    const count = mountHero().find('[data-countdown]');
    expect(count.text()).toContain('88');
    expect(count.text()).toContain('days');
    expect(count.find('.sr-only').text()).toBe('88 days and 21 hours until kick-off');
  });

  it('says "Under way" once kick-off has passed', () => {
    const w = mountHero({ countdown: { parts: [], spoken: 'Under way', underway: true } });
    expect(w.find('[data-countdown]').text()).toBe('Under way');
  });

  it('shows no countdown when there is none', () => {
    expect(mountHero({ countdown: null }).find('[data-countdown]').exists()).toBe(false);
  });

  it('shows the date and kick-off', () => {
    expect(mountHero().text()).toContain('DEC 8 2026 (Tue) · Kick-off 4:30 PM');
  });

  it('sets a state line quietly, and not as a fixture', () => {
    const w = mountHero({ headline: 'Season complete', quiet: true, countdown: null, when: '' });
    expect(w.find('[data-next-fixture]').exists()).toBe(false);
    expect(w.find('h1').text()).toBe('Season complete');
    expect(w.find('h1').classes()).toContain('band__headline--quiet');
  });
});
