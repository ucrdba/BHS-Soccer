/**
 * Who has taken the quiz.
 *
 * The assertion worth reading twice is the one about the players who have
 * not: they stay in the table with dashes, because who has not taken it is
 * what a coach opens this for. The same bargain the squad report makes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import QuizAttemptsSection from './QuizAttemptsSection.vue';

const fetchTeamRoster = vi.fn();
const fetchTeamQuizAttempts = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchTeamRoster: (...a: any[]) => fetchTeamRoster(...a),
    fetchTeamQuizAttempts: (...a: any[]) => fetchTeamQuizAttempts(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';

const ROSTER = [
  { players: { id: 'p1', name: 'Cesar Alva' } },
  { players: { id: 'p2', name: 'Tom Budde' } },
  { players: { id: 'p3', name: 'Alain Renteria' } }
];

const ATTEMPTS = [
  { attempt_id: 'a1', player_id: 'p1', player_name: 'Cesar Alva', score: 4, total_questions: 5,
    completed_at: '2026-09-18T18:00:00Z' },
  { attempt_id: 'a0', player_id: 'p1', player_name: 'Cesar Alva', score: 2, total_questions: 5,
    completed_at: '2026-09-02T18:00:00Z' }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountSection(opts: { roster?: any; attempts?: any; teamId?: string | null } = {}) {
  const { roster = ROSTER, attempts = ATTEMPTS, teamId = TEAM } = opts;
  fetchTeamRoster.mockResolvedValue(roster);
  fetchTeamQuizAttempts.mockResolvedValue(attempts);

  const w = mount(QuizAttemptsSection, { props: { teamId }, attachTo: document.body });
  await flush();
  await w.vm.$nextTick();
  return w;
}

const rowFor = (w: any, name: string) =>
  w.findAll('[data-attempt-row]').find((r: any) => r.text().includes(name))!;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('who has taken it', () => {
  it('INCLUDES a player who has not, with dashes rather than a zero', async () => {
    const w = await mountSection();
    const row = rowFor(w, 'Tom Budde');
    expect(row.find('[data-attempt-score]').text()).toBe('—');
    expect(row.find('[data-attempt-when]').text()).toBe('—');
  });

  it('gives every player on the roster a row', async () => {
    expect((await mountSection()).findAll('[data-attempt-row]')).toHaveLength(3);
  });

  it('counts how many of the squad have taken it', async () => {
    const w = await mountSection();
    expect(w.find('[data-attempt-count]').text()).toContain('1 of 3');
  });

  it('shows the latest score, and how many times they have taken it', async () => {
    const w = await mountSection();
    const row = rowFor(w, 'Cesar Alva');
    expect(row.find('[data-attempt-score]').text()).toBe('4 of 5');
    expect(row.find('[data-attempt-share]').text()).toBe('80%');
    expect(row.find('[data-attempt-times]').text()).toBe('2');
  });

  it('dates the latest attempt in words, not as a machine timestamp', async () => {
    const w = await mountSection();
    const said = rowFor(w, 'Cesar Alva').find('[data-attempt-when]').text();
    expect(said).not.toContain('T18:00');
    expect(said).toMatch(/2026/);
  });
});

describe('when there is nothing to show', () => {
  it('says nobody has taken it yet, rather than showing an empty table', async () => {
    const w = await mountSection({ attempts: [] });
    expect(w.find('[data-attempt-none]').exists()).toBe(true);
  });

  it('asks for a team when none is active', async () => {
    const w = await mountSection({ teamId: null });
    expect(w.find('[data-attempt-error]').text()).toMatch(/team/i);
    expect(fetchTeamQuizAttempts).not.toHaveBeenCalled();
  });

  it('says a read failed rather than showing a squad that has taken nothing', async () => {
    const w = await mountSection({ attempts: null });
    expect(w.find('[data-attempt-error]').exists()).toBe(true);
    expect(w.findAll('[data-attempt-row]')).toHaveLength(0);
  });

  it('says so when the roster could not be read either', async () => {
    const w = await mountSection({ roster: null });
    expect(w.find('[data-attempt-error]').exists()).toBe(true);
  });
});

describe('the squad it reads', () => {
  it('reads the active team, and re-reads when it changes', async () => {
    const w = await mountSection();
    expect(fetchTeamQuizAttempts).toHaveBeenCalledWith(TEAM);

    await w.setProps({ teamId: 'another-team' });
    await flush();
    expect(fetchTeamQuizAttempts).toHaveBeenLastCalledWith('another-team');
  });
});
