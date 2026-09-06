/**
 * The season table.
 *
 * Two of the assertions here are about what this report must NOT do, and both
 * are the coach's rules rather than anything guessable from the code.
 *
 * Nobody is filtered out for playing few minutes. Unlimited substitution
 * means much of the roster finishes any fixture well under a full match, and
 * a coach reads this table to decide who to give more minutes to -- so the
 * fringe players are the entire audience. The answer to a rate built on five
 * minutes is to print the minutes beside it, not to hide the player.
 *
 * And a match is not ninety minutes. High school is 80, club age groups vary,
 * teams.match_minutes holds it, and every rate divides by that rather than by
 * a constant. A per-90 rate inflates every figure from an 80-minute game by
 * an eighth, which breaks the one number a coach can check against their own
 * memory of the match.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SeasonReportModal from './SeasonReportModal.vue';

const fetchSeasonStats = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: { fetchSeasonStats: (...a: any[]) => fetchSeasonStats(...a) }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';

const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva' },
  { id: 'p2', name: 'Tom Budde' },
  { id: 'p3', name: 'Alain Renteria' }
];

/**
 * One tracked match: p1 plays the full 80, p2 the last five minutes only,
 * and p3 never comes on.
 */
const SESSION = {
  sessions: [{ id: 's1', match_id: null, label: 'vs Redlands', created_at: '2026-09-01T00:00:00Z' }],
  eventsBySession: {
    s1: [
      { kind: 'clock_start', atSeconds: 0, period: 1 },
      { kind: 'on', playerId: 'p1', atSeconds: 0, period: 1 },
      { kind: 'plus', playerId: 'p1', atSeconds: 600, period: 1 },
      { kind: 'plus', playerId: 'p1', atSeconds: 900, period: 1 },
      { kind: 'on', playerId: 'p2', atSeconds: 4500, period: 2 },
      { kind: 'plus', playerId: 'p2', atSeconds: 4600, period: 2 },
      { kind: 'off', playerId: 'p1', atSeconds: 4800, period: 2 },
      { kind: 'off', playerId: 'p2', atSeconds: 4800, period: 2 },
      { kind: 'clock_stop', atSeconds: 4800, period: 2 }
    ]
  }
};

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountSeason(opts: { teams?: any[] } = {}) {
  const { teams = [{ id: TEAM, name: 'Varsity', match_minutes: 80 }] } = opts;
  const w = mount(SeasonReportModal, {
    props: { open: true, teamId: TEAM, teams, players: PLAYERS },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

const players = (w: any) => w.findAll('[data-season-player]').map((c: any) => c.text());

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchSeasonStats.mockResolvedValue(SESSION);
});

describe('who is in the table', () => {
  it('INCLUDES a player who was on for five minutes', async () => {
    // The rule this report exists to serve. A coach reads it to decide who to
    // give more minutes to, so the fringe players are the audience -- and
    // filtering them out would remove exactly the players the decision is
    // about, invisibly.
    const w = await mountSeason();
    expect(players(w)).toContain('Tom Budde');
  });

  it('includes the full-match player too, obviously', async () => {
    const w = await mountSeason();
    expect(players(w)).toContain('Cesar Alva');
  });

  it('INCLUDES a player who has not been on at all', async () => {
    // The strictest reading of the rule, and the right one: a coach deciding
    // who to give minutes to needs to see the player getting none.
    const w = await mountSeason();
    expect(players(w)).toContain('Alain Renteria');
  });

  it('applies no minimum-minutes filter of any kind', async () => {
    // Asserted as an absence, because this is the kind of thing a later
    // tidy-up removes for looking untidy. Every player on the roster has a
    // row, whatever their minutes.
    const w = await mountSeason();
    const mins = w.findAll('[data-season-mins]').map((c: any) => Number(c.text()));

    expect(mins).toHaveLength(PLAYERS.length);
    expect(Math.min(...mins)).toBe(0);
  });
});

describe('reading a noisy rate', () => {
  it('puts the minutes on the row beside every rate', async () => {
    // This is what makes showing the player instead of hiding them work: the
    // coach can see how much is behind the figure.
    const w = await mountSeason();
    const row = w.findAll('[data-season-row]').find((r: any) => r.text().includes('Tom Budde'))!;

    expect(row.find('[data-season-mins]').text()).toBe('5');
    expect(row.find('[data-season-netrate]').exists()).toBe(true);
  });

  it('shows a dash rather than a zero when there is no rate at all', async () => {
    // No rate means not enough play for one, which is not the worst rate.
    fetchSeasonStats.mockResolvedValue({ sessions: [], eventsBySession: {} });
    const w = await mountSeason();
    expect(w.find('[data-season-empty]').exists()).toBe(true);
  });
});

describe('the match length', () => {
  it('scales rates to the team\'s OWN match length', async () => {
    // p2: one plus in five minutes. Over an 80-minute match that is 16.
    const w = await mountSeason();
    const row = w.findAll('[data-season-row]').find((r: any) => r.text().includes('Tom Budde'))!;

    expect(row.find('[data-season-netrate]').text()).toBe('16.00');
  });

  it('gives a DIFFERENT figure for a team that plays ninety', async () => {
    // The proof that nothing is hardcoded: same events, different length.
    const w = await mountSeason({ teams: [{ id: TEAM, name: 'Club U18', match_minutes: 90 }] });
    const row = w.findAll('[data-season-row]').find((r: any) => r.text().includes('Tom Budde'))!;

    expect(row.find('[data-season-netrate]').text()).toBe('18.00');
  });

  it('says which length it used, so the figure can be checked', async () => {
    const w = await mountSeason();
    expect(w.text()).toContain('80-minute');
  });

  it('falls back for a team that has stated no length', async () => {
    // A fallback rather than a fact about the sport.
    const w = await mountSeason({ teams: [{ id: TEAM, name: 'Varsity' }] });
    expect(w.findAll('[data-season-row]').length).toBeGreaterThan(0);
  });
});

describe('sorting', () => {
  it('sorts by a column and reverses on a second click', async () => {
    const w = await mountSeason();
    await w.find('[data-season-sort="player"]').trigger('click');
    const forward = players(w);

    await w.find('[data-season-sort="player"]').trigger('click');
    expect(players(w)).toEqual(forward.slice().reverse());
  });

  it('opens on minutes, most first, which is what the table is read for', async () => {
    const w = await mountSeason();
    expect(players(w)[0]).toBe('Cesar Alva');
  });

  it('reverses to put the least-used players first', async () => {
    // Which is the direction a coach looking for who to bring in reads.
    const w = await mountSeason();
    await w.find('[data-season-sort="mins"]').trigger('click');
    expect(players(w)[0]).toBe('Alain Renteria');
  });

  it('keeps a player with no rate LAST, not top', async () => {
    // No rate is not the best rate. A player who has never been on would
    // otherwise sort to the head of a descending column.
    const w = await mountSeason();
    await w.find('[data-season-sort="netrate"]').trigger('click');

    expect(players(w)).toHaveLength(3);
    expect(players(w)[players(w).length - 1]).toBe('Alain Renteria');
  });
});

describe('when the read fails', () => {
  it('says so rather than showing an empty season', async () => {
    fetchSeasonStats.mockResolvedValue(null);
    const w = await mountSeason();

    expect(w.find('[data-season-error]').exists()).toBe(true);
    expect(w.find('[data-season-empty]').exists()).toBe(false);
  });

  it('distinguishes no matches from a failed read', async () => {
    fetchSeasonStats.mockResolvedValue({ sessions: [], eventsBySession: {} });
    const w = await mountSeason();

    expect(w.find('[data-season-empty]').text()).toMatch(/plus\/minus/i);
    expect(w.find('[data-season-error]').exists()).toBe(false);
  });
});
