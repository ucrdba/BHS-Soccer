/**
 * The Goals-by-role standards editor's drafts.
 *
 * A draft is what is in the boxes: a threshold and a percentage, as text. The
 * database stores a whole-number threshold and a factor 0-1, and save_goal_bands
 * refuses anything else in words. These refusals are the same ones, made first,
 * so the editor can say what is wrong beside the boxes.
 */
import type { PositionRole } from './position';

export interface GoalBandDraft { threshold: string; percent: string }
export interface GoalRoleDrafts { base: GoalBandDraft[]; bonus: GoalBandDraft[] }
export type GoalBandDrafts = Record<PositionRole, GoalRoleDrafts>;

export const GOAL_ROLES: PositionRole[] = ['attack', 'defend', 'keeper'];

export type ParsedGoalBand = { kind: 'base' | 'bonus'; threshold: number; factor: number };

export function emptyGoalDrafts(): GoalBandDrafts {
  return { attack: { base: [], bonus: [] }, defend: { base: [], bonus: [] }, keeper: { base: [], bonus: [] } };
}

/** Stored bands, grouped for the editor: best-paying first in each list. */
export function goalDraftsFromBands(rows: any[]): GoalBandDrafts {
  const out = emptyGoalDrafts();
  const sorted = (rows || []).slice().sort((a, b) =>
    Number(b.factor) - Number(a.factor) || Number(b.threshold) - Number(a.threshold));
  sorted.forEach(r => {
    const role = out[r?.role as PositionRole];
    if (!role || (r.kind !== 'base' && r.kind !== 'bonus')) return;
    role[r.kind as 'base' | 'bonus'].push({
      threshold: String(Number(r.threshold)),
      percent: String(+(Number(r.factor) * 100).toFixed(1))
    });
  });
  return out;
}

const WHOLE = /^\s*-?\d{1,4}\s*$/;

export function draftsToGoalBands(
  drafts: GoalRoleDrafts
): { ok: true; bands: ParsedGoalBand[] } | { ok: false; error: string } {
  const bands: ParsedGoalBand[] = [];

  for (const kind of ['base', 'bonus'] as const) {
    for (const row of drafts?.[kind] || []) {
      const t = String(row?.threshold ?? '');
      const p = String(row?.percent ?? '');
      if (!t.trim() && !p.trim()) continue;   // an untouched blank row

      if (!WHOLE.test(t)) {
        return { ok: false, error: `"${t.trim()}" is not a whole number. A threshold is a count of goals, like 2 or -1.` };
      }
      const percent = p.trim() === '' ? NaN : Number(p);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return { ok: false, error: `A percentage must be between 0 and 100 (found "${p.trim()}").` };
      }

      const threshold = Number(t.trim());
      if (bands.some(b => b.kind === kind && b.threshold === threshold)) {
        const name = kind === 'base' ? 'goal-difference' : 'bonus';
        return { ok: false, error: `Two ${name} bands share the threshold ${threshold}. Two bands at one threshold cannot both apply.` };
      }
      bands.push({ kind, threshold, factor: Math.round(percent * 10) / 1000 });
    }
  }

  const top = (kind: 'base' | 'bonus') =>
    bands.filter(b => b.kind === kind).reduce((m, b) => Math.max(m, b.factor), 0);
  const base = top('base');
  const bonus = top('bonus');
  if (Math.round((base + bonus) * 1000) > 1000) {
    return {
      ok: false,
      error: `The top goal-difference band (${+(base * 100).toFixed(1)}%) and the top bonus band `
        + `(${+(bonus * 100).toFixed(1)}%) add up to more than 100% of the weight. Lower one of them.`
    };
  }

  return { ok: true, bands };
}
