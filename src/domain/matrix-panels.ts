/**
 * Which panel the ratings screen is showing.
 *
 * The canvas gives this screen a segmented control rather than five separate
 * URLs, because the panels are four readings of one table rather than four
 * places. Two of them — the logged results and the session history — are a
 * coach's, so a player's control offers two.
 *
 * Resolving rather than trusting the stored choice matters because the
 * choice outlives the viewer: a coach picks the history, signs out, and a
 * player arrives with `history` still selected.
 */
export type PanelKey = 'board' | 'exercise' | 'results' | 'history';

export interface Panel {
  key: PanelKey;
  label: string;
  coachOnly: boolean;
}

export const PANELS: Panel[] = [
  { key: 'board',    label: 'Board',    coachOnly: false },
  { key: 'exercise', label: 'Exercise', coachOnly: false },
  { key: 'results',  label: 'Results',  coachOnly: true },
  { key: 'history',  label: 'History',  coachOnly: true }
];

export function visiblePanels(isCoach: boolean): Panel[] {
  return PANELS.filter(p => isCoach || !p.coachOnly);
}

/**
 * The panel to show, given what was chosen and who is looking.
 *
 * `hasExercise` is accepted because a caller naturally has it, but the
 * exercise panel is shown whether or not one is picked: the panel carries
 * the picker, so redirecting away would leave the reader unable to choose.
 */
export function panelFor(chosen: string, isCoach: boolean, hasExercise: boolean): PanelKey {
  void hasExercise;
  const found = visiblePanels(isCoach).find(p => p.key === chosen);
  return found ? found.key : 'board';
}
