/**
 * The 1v1 round-robin schedule.
 *
 * Extracted from public/js/views/roundrobin.view.js during the Vue migration
 * (Phase 0). roundRobinLabel and roundRobinResultText came along too: they are
 * pure, and buildRoundRobin calls them, so leaving them behind would have
 * meant passing formatters in as callbacks.
 */

export interface RoundRobinMatch {
  a: any; b: any | null; bye: boolean; played?: boolean; result?: string;
}
export interface RoundRobinRound { round: number; matches: RoundRobinMatch[] }

/** "(7) Cesar A." — the sheet label, as it is read on the pitch. */
export function roundRobinLabel(p: any): string {
  if (!p) return '';
  const parts = String(p.name || '').trim().split(/\s+/);
  const first = p.firstName || parts[0] || '';
  const last = p.lastName || parts.slice(1).join(' ') || '';
  const initial = last ? `${last.trim().charAt(0).toUpperCase()}.` : '';
  const num = p.recordingNumber != null ? p.recordingNumber : '—';
  return `(${num}) ${[first, initial].filter(Boolean).join(' ')}`.trim();
}

export function roundRobinPlayers(players: any[]): any[] {
  return (players || [])
    .filter(p => !p.is_deleted && !p.isDeleted)
    .slice()
    .sort((a, b) => {
      const na = a.recordingNumber == null ? NaN : Number(a.recordingNumber);
      const nb = b.recordingNumber == null ? NaN : Number(b.recordingNumber);
      const ga = Number.isFinite(na), gb = Number.isFinite(nb);
      if (ga !== gb) return ga ? -1 : 1;
      if (ga && na !== nb) return na - nb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

/**
 * Results already recorded, keyed by the unordered pair.
 *
 * Keyed on the sorted id pair because a result logged as "p4 beat p3" is the
 * same fixture as "p3 v p4" — reading it one way round would leave half the
 * schedule looking unplayed.
 */
export function roundRobinPlayed(matrixLogs: any[]): Record<string, any> {
  const byPair: Record<string, any> = {};
  (matrixLogs || [])
    .filter(l => !l.is_deleted && !l.isDeleted)
    .forEach(l => {
      const a = l.player_a_id || l.playerAId;
      const b = l.player_b_id || l.playerBId;
      if (!a || !b) return;
      byPair[[a, b].sort().join('|')] = { a, b, outcome: l.outcome };
    });
  return byPair;
}

/** "Cesar A. won" / "Draw", from the stored outcome. */
export function roundRobinResultText(a: any, b: any, hit: any): string {
  if (!hit || !hit.outcome) return '';
  if (hit.outcome === 'draw') return 'Draw';
  // outcome names which of the LOGGED pair won, which may be either of ours.
  const winnerId = hit.outcome === 'a' ? hit.a : hit.b;
  const winner = winnerId === a.id ? a : b;
  return `${roundRobinLabel(winner)} won`;
}

/**
 * The full schedule: every player against every other, exactly once.
 *
 * The circle method — fix the first player, rotate the rest — which is what
 * guarantees no player appears twice in a round. An odd squad gets a bye
 * seat that rotates, so nobody sits out more than once.
 */
export function buildRoundRobin(players: any[], matrixLogs: any[]): RoundRobinRound[] {
  const roster = roundRobinPlayers(players);
  if (roster.length < 2) return [];

  // The bye seat is a null in the rotation; a match against it is a bye.
  const seats: any[] = roster.slice();
  if (seats.length % 2 === 1) seats.push(null);

  const half = seats.length / 2;
  const played = roundRobinPlayed(matrixLogs);
  const rounds: RoundRobinRound[] = [];

  // A fixed head, and a ring that rotates beneath it.
  let ring = seats.slice(1);

  for (let r = 0; r < seats.length - 1; r++) {
    const order = [seats[0]].concat(ring);
    const matches: RoundRobinMatch[] = [];

    for (let i = 0; i < half; i++) {
      const a = order[i];
      const b = order[order.length - 1 - i];
      if (!a && !b) continue;

      if (!a || !b) {
        matches.push({ a: a || b, b: null, bye: true });
        continue;
      }

      const hit = played[[a.id, b.id].sort().join('|')];
      matches.push({
        a, b, bye: false,
        played: !!hit,
        result: hit ? roundRobinResultText(a, b, hit) : ''
      });
    }

    rounds.push({ round: r + 1, matches });
    ring = [ring[ring.length - 1]].concat(ring.slice(0, -1));
  }

  return rounds;
}

/**
 * The schedule as CSV.
 *
 * Carries both the sheet label and the full name: the label is what is read
 * on the pitch, the full name is what makes the file legible to anyone else.
 */
export function roundRobinCsv(rounds: RoundRobinRound[]): string {
  const esc = (v: any) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const head = ['Round', 'Match', 'PlayerA', 'PlayerAName', 'PlayerB', 'PlayerBName', 'Result'];
  const lines = [head.join(',')];

  (rounds || []).forEach(r => {
    r.matches.forEach((m, i) => {
      lines.push([
        r.round,
        i + 1,
        esc(roundRobinLabel(m.a)),
        esc(m.a ? m.a.name : ''),
        esc(m.bye ? 'BYE' : roundRobinLabel(m.b)),
        esc(m.b ? m.b.name : ''),
        esc(m.result || '')
      ].join(','));
    });
  });

  return lines.join('\n') + '\n';
}
