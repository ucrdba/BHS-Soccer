/**
 * Which panel the ratings screen is showing.
 *
 * The canvas gives the screen a segmented control rather than five routes,
 * so this decides what the control offers and what a chosen value resolves
 * to — including the two ways a choice can be stale: a panel a player may
 * not see, and the exercise panel with no exercise picked.
 */
import { describe, it, expect } from 'vitest';
import { PANELS, visiblePanels, panelFor } from './matrix-panels';

describe('PANELS', () => {
  it('lists the four panels in the order the canvas reads', () => {
    expect(PANELS.map(p => p.key)).toEqual(['board', 'exercise', 'results', 'history']);
  });

  it('marks the two a player has no business in', () => {
    const coachOnly = PANELS.filter(p => p.coachOnly).map(p => p.key);
    expect(coachOnly).toEqual(['results', 'history']);
  });
});

describe('visiblePanels', () => {
  it('gives a coach all four', () => {
    expect(visiblePanels(true).map(p => p.key)).toEqual(['board', 'exercise', 'results', 'history']);
  });

  it('gives a player the two that are theirs to read', () => {
    expect(visiblePanels(false).map(p => p.key)).toEqual(['board', 'exercise']);
  });
});

describe('panelFor', () => {
  it('honours a choice that is available', () => {
    expect(panelFor('results', true, false)).toBe('results');
    expect(panelFor('exercise', false, true)).toBe('exercise');
  });

  it('falls back to the board for a panel this viewer may not see', () => {
    expect(panelFor('results', false, false)).toBe('board');
    expect(panelFor('history', false, false)).toBe('board');
  });

  it('falls back to the board for a name that is not a panel', () => {
    expect(panelFor('nonsense', true, false)).toBe('board');
    expect(panelFor('', true, false)).toBe('board');
  });

  it('shows the exercise panel even with nothing picked, so the picker is reachable', () => {
    // The panel carries the picker; sending the reader to the board would
    // leave them no way to choose an exercise.
    expect(panelFor('exercise', true, false)).toBe('exercise');
  });
});
