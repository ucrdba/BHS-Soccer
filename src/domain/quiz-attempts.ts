/**
 * Who has taken the quiz, per squad.
 *
 * **Every player on the roster is listed**, including the ones who have not
 * taken it: that is the reading a coach opens this for, and dropping them
 * would hide exactly the players the question is about — the same bargain the
 * squad report and the season report make.
 *
 * A player's **latest** attempt is the one shown. The quiz asks about the
 * message that is up now, so an old score says less than the current one, and
 * how many times they have taken it sits beside it rather than being hidden.
 *
 * Pure: the roster and the attempts are passed in. An attempt by somebody no
 * longer on this roster is left out — the squad in front of the coach is the
 * roster as it stands.
 */

export interface QuizAttemptRow {
  playerId: string;
  playerName: string;
  /** When they last took it, or null when they never have. */
  lastTakenOn: string | null;
  score: number | null;
  total: number | null;
  /** Rounded, or null when there is nothing to work it out from. */
  percentage: number | null;
  times: number;
}

const when = (a: any): string => String(a?.completed_at || a?.started_at || '');

export function quizAttemptRows(
  roster: Array<{ id: string; name: string }>, attempts: any[] | null
): QuizAttemptRow[] {
  const squad = roster || [];
  const mine = new Map<string, any[]>();

  (attempts || []).forEach(a => {
    const id = String(a?.player_id || '');
    if (!id) return;
    mine.set(id, (mine.get(id) || []).concat(a));
  });

  return squad
    .map(p => {
      const theirs = (mine.get(p.id) || []).slice().sort((x, y) => when(y).localeCompare(when(x)));
      const latest = theirs[0];
      const score = latest && latest.score !== null && latest.score !== undefined ? Number(latest.score) : null;
      const total = latest && latest.total_questions !== null && latest.total_questions !== undefined
        ? Number(latest.total_questions) : null;

      return {
        playerId: p.id,
        playerName: p.name,
        lastTakenOn: latest ? (when(latest) || null) : null,
        score,
        total,
        // Nothing out of no questions: a percentage of zero would read as a
        // score of zero, which is a different thing.
        percentage: score !== null && total ? Math.round((score / total) * 100) : null,
        times: theirs.length
      };
    })
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
}

/** "12 of 24 players have taken it." */
export function quizTakenCount(rows: QuizAttemptRow[]): { taken: number; of: number } {
  const list = rows || [];
  return { taken: list.filter(r => r.times > 0).length, of: list.length };
}
