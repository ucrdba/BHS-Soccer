/**
 * One exercise's leaderboard, for a Goals-by-role drill.
 *
 * The below-standard emphasis is additive: every player stays on screen in the
 * order chosen. The per-role count is the headline a coach reads.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import ExerciseLeaderboard from './ExerciseLeaderboard.vue';

vi.mock('../../data/supabase', () => ({ supabaseService: {} }));

const GOALS = 'd-goals';
const players = [
  { id: 'p1', name: 'Ash Attacker', recordingNumber: 9 },
  { id: 'p2', name: 'Bo Attacker', recordingNumber: 10 },
  { id: 'p3', name: 'Dee Defender', recordingNumber: 4 },
  { id: 'p4', name: 'Absent Al', recordingNumber: 1 }
];
const line = (over: any) => ({
  drill_id: GOALS, kind: 'role_goals', weight: 3, available: 3, w: 0, dr: 0, ls: 0,
  occurred_on: '2026-09-14', ...over
});
const exercisePoints = [
  line({ player_id: 'p1', role: 'attack', goals_for: 3, goals_against: 1, raw_value: 2, base_factor: 0.5, bonus_factor: 0.1, earned: 1.8 }),
  line({ player_id: 'p2', role: 'attack', goals_for: 6, goals_against: 7, raw_value: -1, base_factor: 0, bonus_factor: 0.2, earned: 0.6 }),
  line({ player_id: 'p3', role: 'defend', goals_for: 0, goals_against: 0, raw_value: 0, base_factor: 0.6, bonus_factor: 0.4, earned: 3 }),
  line({ player_id: 'p4', kind: 'absent', raw_value: null, earned: 0 })
];

function mountBoard() {
  return mount(ExerciseLeaderboard, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn, stubActions: false,
        initialState: {
          matrix: {
            players, exercisePoints, exerciseFilter: GOALS,
            drillsBank: [{ id: GOALS, name: '1v1 Attack', measure: 'role_goals' }]
          },
          organization: {}
        }
      })]
    }
  });
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('a Goals-by-role leaderboard', () => {
  it('has the role columns and no best or average', () => {
    const heads = mountBoard().findAll('[data-exercise-sort]').map(b => b.attributes('data-exercise-sort'));
    expect(heads).toEqual(['number', 'name', 'role', 'score', 'diff', 'base', 'bonus', 'earned']);
  });

  it("shows each player's role, score, goal difference and shares", () => {
    const w = mountBoard();
    const ash = w.findAll('[data-leaderboard-row]').find(r => r.text().includes('Ash Attacker'))!;
    expect(ash.text()).toContain('Attack');
    expect(ash.text()).toContain('3-1');
    expect(ash.text()).toContain('+2');
    expect(ash.text()).toContain('50%');
    expect(ash.text()).toContain('10%');
  });

  it('counts below-standard players per role and marks them, removing nobody', () => {
    const w = mountBoard();
    expect(w.findAll('[data-leaderboard-row]')).toHaveLength(4);
    expect(w.find('[data-role-shortfall="attack"]').text()).toBe('1 of 2 attackers below the standard');
    expect(w.find('[data-role-shortfall="defend"]').text()).toBe('0 of 1 defender below the standard');
    const marked = w.findAll('[data-below-standard]').map(m => m.element.closest('tr')!.textContent);
    expect(marked).toHaveLength(1);
    expect(marked[0]).toContain('Bo Attacker');
  });

  it('keeps every sort available', async () => {
    const w = mountBoard();
    await w.find('[data-exercise-sort="diff"]').trigger('click');
    expect(w.findAll('[data-leaderboard-row]')).toHaveLength(4);
    expect(w.findAll('[data-leaderboard-row]')[0].text()).toContain('Ash Attacker');
  });
});
