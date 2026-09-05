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

export function seasonRecord(schedule: any[]): SeasonRecord {
  const completed = (schedule || []).filter(m => m && m.status === 'COMPLETED' && m.score);

  let wins = 0, draws = 0, losses = 0;
  let goalsFor = 0, goalsAgainst = 0, cleanSheets = 0, gamesPlayed = 0;

  completed.forEach(m => {
    // Strip any leading team name rather than one organization's. The original
    // used /BHS\s*/i, which says nothing useful about a club's scoreline, and
    // club coaches use this application.
    const raw = String(m.score || '')
      .replace(/^[^\d]*/, '')
      .replace(/[–—\-:]/g, ' ');
    const nums = raw.match(/\d+/g);
    if (!nums || nums.length < 2) return;

    const gf = parseInt(nums[0], 10);
    const ga = parseInt(nums[1], 10);
    if (!Number.isFinite(gf) || !Number.isFinite(ga)) return;

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
