/**
 * The four skill ratings as bars for the bio.
 *
 * `team_players.ratings` is a loose object. The bio shows the four skills the
 * program rates, in a fixed order, out of a hundred, which is what
 * `team_players.ratings` holds. A rating that is not set is left out rather
 * than drawn at zero, because an empty bar reads as a judgement the coach
 * never made.
 */
export const SKILLS = ['technical', 'tactical', 'physical', 'mental'] as const;

const NAMES: Record<string, string> = {
  technical: 'Technical', tactical: 'Tactical', physical: 'Physical', mental: 'Mental'
};

export const SKILL_SCALE = 100;

export interface SkillBar {
  key: string;
  name: string;
  value: number;
  /** Whole percent of the scale, for the bar's width. */
  pct: number;
}

export function skillBars(ratings: unknown): SkillBar[] {
  if (!ratings || typeof ratings !== 'object') return [];
  const out: SkillBar[] = [];
  for (const key of SKILLS) {
    const raw = (ratings as Record<string, unknown>)[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const value = Math.min(SKILL_SCALE, Math.max(0, n));
    out.push({ key, name: NAMES[key], value, pct: Math.round((value / SKILL_SCALE) * 100) });
  }
  return out;
}
