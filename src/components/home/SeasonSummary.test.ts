/**
 * How the season is going. Before the first result it is one line saying
 * when the season opens; once there are results, the last one, the form and
 * the four figures the page has always shown.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SeasonSummary from './SeasonSummary.vue';

const NONE = {
  wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
  cleanSheets: 0, gamesPlayed: 0, goalsPerGame: '0.00', recordText: '0 - 0 - 0'
};
const SOME = {
  wins: 3, draws: 1, losses: 1, goalsFor: 9, goalsAgainst: 4,
  cleanSheets: 2, gamesPlayed: 5, goalsPerGame: '1.80', recordText: '3 - 1 - 1'
};
const LAST = { opponent: 'El Toro', side: 'away', word: 'Won', score: '2 - 1' };

const mountSummary = (over: Record<string, any> = {}) => {
  const defaultProps = { record: NONE, lastResult: null, form: [], opensOn: '', fixtures: 0, ...over };
  return mount(SeasonSummary, { props: defaultProps });
};

describe('before the first result', () => {
  it('says when the season opens and how many fixtures it has', () => {
    const w = mountSummary({ opensOn: 'DEC 8 2026 (Tue)', fixtures: 19 });
    expect(w.find('[data-season-opens]').text()).toContain('DEC 8 2026 (Tue)');
    expect(w.find('[data-season-opens]').text()).toContain('19');
  });

  it('takes no room with no next match and no results', () => {
    expect(mountSummary().find('[data-season]').exists()).toBe(false);
  });
});

describe('once there are results', () => {
  const w = () => mountSummary({ record: SOME, lastResult: LAST, form: ['W', 'W', 'L', 'D', 'W'], opensOn: 'DEC 8 2026 (Tue)' });

  it('shows the last result in words beside the score', () => {
    const last = w().find('[data-last-result]');
    expect(last.text()).toContain('El Toro');
    expect(last.text()).toContain('away');
    expect(last.text()).toContain('Won 2 - 1');
  });

  it('shows the form as letters, oldest first', () => {
    expect(w().find('[data-form]').text().replace(/\s+/g, ' ')).toContain('W W L D W');
  });

  it('shows the four figures the page has always shown', () => {
    const text = w().text();
    expect(text).toContain('3 - 1 - 1');
    expect(text).toContain('1.80');
    expect(text).toMatch(/clean sheets/i);
  });

  it('replaces the season line rather than sitting beside it', () => {
    expect(w().find('[data-season-opens]').exists()).toBe(false);
  });
});
