/**
 * The season record, derived from the schedule's score column.
 *
 * Scores are free text a coach typed, in whatever shape the sheet they copied
 * used. Anything that does not yield two numbers is not counted at all:
 * guessing at a malformed score would put a fictional result in the record,
 * and a wrong record is worse than a short one.
 *
 * Lifted out of renderHomeView during the Vue migration's Phase 1, where it
 * was untested regex inline in a template string.
 */

export interface SeasonRecord {
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  gamesPlayed: number;
  /** Two decimal places, as a string, because it is only ever displayed. */
  goalsPerGame: string;
  /** "W - L - D", the order a soccer record is read in. */
  recordText: string;
}

/**
 * The two numbers in a score, or null.
 *
 * Scores are free text a coach typed. A leading team name is stripped —
 * any name, not one organization's — and any separator is accepted. Anything
 * that does not yield two numbers is refused rather than guessed: a fictional
 * result in the record is worse than a missing one.
 */
export function parseScore(score: unknown): { goalsFor: number; goalsAgainst: number } | null {
  const raw = String(score ?? '')
    .replace(/^[^\d]*/, '')
    .replace(/[–—\-:]/g, ' ');
  const nums = raw.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  const goalsFor = parseInt(nums[0], 10);
  const goalsAgainst = parseInt(nums[1], 10);
  if (!Number.isFinite(goalsFor) || !Number.isFinite(goalsAgainst)) return null;
  return { goalsFor, goalsAgainst };
}

export function seasonRecord(schedule: any[]): SeasonRecord {
  const completed = (schedule || []).filter(m => m && m.status === 'COMPLETED' && m.score);

  let wins = 0, draws = 0, losses = 0;
  let goalsFor = 0, goalsAgainst = 0, cleanSheets = 0, gamesPlayed = 0;

  completed.forEach(m => {
    const parsed = parseScore(m.score);
    if (!parsed) return;
    const { goalsFor: gf, goalsAgainst: ga } = parsed;

    gamesPlayed++;
    goalsFor += gf;
    goalsAgainst += ga;
    if (ga === 0) cleanSheets++;
    if (gf > ga) wins++;
    else if (gf === ga) draws++;
    else losses++;
  });

  return {
    wins, draws, losses,
    goalsFor, goalsAgainst, cleanSheets, gamesPlayed,
    goalsPerGame: gamesPlayed > 0 ? (goalsFor / gamesPlayed).toFixed(2) : '0.00',
    recordText: `${wins} - ${losses} - ${draws}`
  };
}
