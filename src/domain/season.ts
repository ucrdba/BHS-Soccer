/**
 * The season report's columns and its match length.
 *
 * Extracted from public/js/views/season.view.js during the Vue migration
 * (Phase 0).
 */
import { DEFAULT_FULL_MATCH_MINUTES } from '../data/season-stats';

export interface SeasonColumn {
  key: string; label: string; desc: boolean; text?: boolean;
  get: (t: any, name?: string) => any;
}

export function seasonEsc(v: any): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * How long a full match is for this squad.
 *
 * Read from the team rather than assumed, because a high-school fixture, a
 * club age group and a friendly are not the same length, and every per-match
 * rate on the report divides by this.
 */
export function seasonFullMatchMinutes(teams: any[], activeTeamId: string): number {
  const team = (teams || []).find(t => String(t.id) === String(activeTeamId));
  const stated = team && Number(team.match_minutes);
  return stated && stated > 0 ? stated : DEFAULT_FULL_MATCH_MINUTES;
}

export function seasonColumns(): SeasonColumn[] {
  return [
    { key: 'player',  label: 'Player',  desc: false, text: true,
      get: (t, name) => String(name || '').toLowerCase() },
    { key: 'apps',    label: 'Apps',    desc: true,  get: t => t.appearances || 0 },
    { key: 'mins',    label: 'Mins',    desc: true,  get: t => t.minutes || 0 },
    { key: 'plus',    label: '+',       desc: true,  get: t => t.plus || 0 },
    { key: 'minus',   label: '&minus;', desc: true,  get: t => t.minus || 0 },
    { key: 'net',     label: 'Net',     desc: true,  get: t => t.score || 0 },
    { key: 'gd',      label: 'GD',      desc: true,  get: t => t.goalDiff || 0 },
    { key: 'netrate', label: 'Net',     desc: true,  get: t => t.scorePerMatch },
    { key: 'gdrate',  label: 'GD',      desc: true,  get: t => t.goalDiffPerMatch }
  ];
}
