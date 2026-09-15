/**
 * The squad against each exercise.
 *
 * Two assertions here are about restraint. Every player is in it including
 * one who has attempted nothing -- who has NOT done an exercise is part of
 * what a coach reads this for. And nothing suggests tightening a standard: a
 * threshold measures whether a player is match-fit, so seventeen of nineteen
 * meeting the mark is the good outcome, not a flat result to be corrected.
 *
 * An exercise with no bands set for this squad is not scored at all, which is
 * a different thing from everybody failing it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import SquadReportModal from './SquadReportModal.vue';

const fetchTeamSessionHistory = vi.fn();
const fetchTimeBands = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchTeamSessionHistory: (...a: any[]) => fetchTeamSessionHistory(...a),
    fetchTimeBands: (...a: any[]) => fetchTimeBands(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';
const LAPS = 'd-laps';       // time_bands, with a standard
const COOPERS = 'd-coopers'; // count_high, no standard
const GOALS = 'd-goals';     // role_goals, left out of the report

const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva' },
  { id: 'p2', name: 'Tom Budde' },
  { id: 'p3', name: 'Alain Renteria' }   // attempts nothing
];

const DRILLS = [
  { id: LAPS, name: '3 Laps', measure: 'time_bands' },
  { id: COOPERS, name: 'Coopers', measure: 'count_high' },
  { id: GOALS, name: '1v1 Attack', measure: 'role_goals' }
];

/** p1 runs 4:10 (clears 4:30); p2 runs 4:50 (short). */
const HISTORY = [
  { drillId: LAPS, playerId: 'p1', attendance: 'present', rawValue: 250, occurredOn: '2026-09-01' },
  { drillId: LAPS, playerId: 'p1', attendance: 'present', rawValue: 260, occurredOn: '2026-09-08' },
  { drillId: LAPS, playerId: 'p2', attendance: 'present', rawValue: 290, occurredOn: '2026-09-01' },
  { drillId: COOPERS, playerId: 'p1', attendance: 'present', rawValue: 2800, occurredOn: '2026-09-01' }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountReport(opts: { history?: any; bands?: any[] } = {}) {
  const { history = HISTORY, bands = [{ max_seconds: 270, factor: 1 }] } = opts;
  fetchTeamSessionHistory.mockResolvedValue(history);
  fetchTimeBands.mockResolvedValue(bands);

  const w = mount(SquadReportModal, {
    props: { open: true, teamId: TEAM },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn, stubActions: true,
        initialState: { matrix: { players: PLAYERS, drillsBank: DRILLS } }
      })]
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

const sectionFor = (w: any, name: string) =>
  w.findAll('[data-squad-exercise]').find((s: any) => s.text().includes(name))!;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('who is in it', () => {
  it('INCLUDES a player who has attempted nothing', async () => {
    // Who has not done an exercise is part of what this answers.
    const w = await mountReport();
    const names = sectionFor(w, '3 Laps')
      .findAll('[data-squad-player]').map((c: any) => c.text());

    expect(names).toContain('Alain Renteria');
  });

  it('shows a dash for them rather than a zero', async () => {
    // Zero laps in no time is not a reading.
    const w = await mountReport();
    const row = sectionFor(w, '3 Laps').findAll('[data-squad-row]')
      .find((r: any) => r.text().includes('Alain Renteria'))!;

    expect(row.find('[data-squad-best]').text()).toBe('—');
    expect(row.find('[data-squad-attempts]').text()).toBe('0');
  });

  it('gives every player a row in every exercise', async () => {
    const w = await mountReport();
    expect(sectionFor(w, '3 Laps').findAll('[data-squad-row]')).toHaveLength(PLAYERS.length);
  });
});

describe('the readings', () => {
  it('shows a player\'s best time, which is their fastest', async () => {
    const w = await mountReport();
    const row = sectionFor(w, '3 Laps').findAll('[data-squad-row]')
      .find((r: any) => r.text().includes('Cesar Alva'))!;

    expect(row.find('[data-squad-best]').text()).toBe('4:10');
  });

  it('shows a counted exercise\'s best as its highest', async () => {
    const w = await mountReport();
    const row = sectionFor(w, 'Coopers').findAll('[data-squad-row]')
      .find((r: any) => r.text().includes('Cesar Alva'))!;

    expect(row.find('[data-squad-best]').text()).toBe('2800');
  });

  it('counts the attempts behind the figure', async () => {
    const w = await mountReport();
    const row = sectionFor(w, '3 Laps').findAll('[data-squad-row]')
      .find((r: any) => r.text().includes('Cesar Alva'))!;

    expect(row.find('[data-squad-attempts]').text()).toBe('2');
  });

  it('lists only the exercises this squad has actually done', async () => {
    const w = await mountReport({ history: HISTORY.filter(r => r.drillId === LAPS) });
    expect(w.findAll('[data-squad-exercise]')).toHaveLength(1);
  });
});

describe('the standard', () => {
  it('is the TIGHTEST band', async () => {
    // Bands are "at or under X earns Y", so the tightest one is the target.
    const w = await mountReport({
      bands: [{ max_seconds: 290, factor: 0.5 }, { max_seconds: 270, factor: 1 }]
    });
    expect(sectionFor(w, '3 Laps').find('[data-squad-standard]').text()).toContain('4:30');
  });

  it('counts who is short of it', async () => {
    const w = await mountReport();
    expect(sectionFor(w, '3 Laps').find('[data-squad-short]').text()).toContain('1');
  });

  it('marks the player who is short', async () => {
    const w = await mountReport();
    const row = sectionFor(w, '3 Laps').findAll('[data-squad-row]')
      .find((r: any) => r.text().includes('Tom Budde'))!;

    expect(row.classes()).toContain('is-short');
  });

  it('does NOT count a player who has not attempted it as short', async () => {
    // Not having run is not failing.
    const w = await mountReport();
    const row = sectionFor(w, '3 Laps').findAll('[data-squad-row]')
      .find((r: any) => r.text().includes('Alain Renteria'))!;

    expect(row.classes()).not.toContain('is-short');
  });

  it('does not score an exercise with NO bands set for this squad', async () => {
    // Which is a different thing from everybody failing it.
    const w = await mountReport({ bands: [] });
    const laps = sectionFor(w, '3 Laps');

    expect(laps.find('[data-squad-no-standard]').exists()).toBe(true);
    expect(laps.find('[data-squad-short]').exists()).toBe(false);
    expect(laps.find('.is-short').exists()).toBe(false);
  });

  it('gives a counted exercise no standard at all', async () => {
    const w = await mountReport();
    expect(sectionFor(w, 'Coopers').find('[data-squad-standard]').exists()).toBe(false);
  });
});

describe('what it does not say', () => {
  it('never suggests tightening a standard', async () => {
    // A threshold asks whether a player can last a full match. Seventeen of
    // nineteen on the mark is the good outcome, and a hint offering to spread
    // them out would be arguing with the coach.
    const w = await mountReport();
    expect(w.text()).not.toMatch(/tighten|spread|bunch|too easy|separat/i);
  });

  it('does not rank anybody against the squad on a threshold', async () => {
    // The useful reading is who is short of the standard, not who is fastest.
    const w = await mountReport();
    expect(w.text()).not.toMatch(/rank|1st|fastest in the squad/i);
  });
});

describe('when the read fails', () => {
  it('says so rather than showing an empty squad', async () => {
    const w = await mountReport({ history: null });
    expect(w.find('[data-squad-error]').exists()).toBe(true);
    expect(w.find('[data-squad-empty]').exists()).toBe(false);
  });

  it('distinguishes no sessions from a failed read', async () => {
    const w = await mountReport({ history: [] });
    expect(w.find('[data-squad-empty]').exists()).toBe(true);
    expect(w.find('[data-squad-error]').exists()).toBe(false);
  });
});

describe('Goals by role', () => {
  it('is left out of the report even when the squad has recorded it', async () => {
    const w = await mountReport({
      history: [...HISTORY, { drillId: GOALS, playerId: 'p1', attendance: 'present', rawValue: null, occurredOn: '2026-09-14' }]
    });
    const names = w.findAll('[data-squad-exercise]').map((s: any) => s.text());
    expect(names.some((t: string) => t.includes('1v1 Attack'))).toBe(false);
    expect(names.some((t: string) => t.includes('3 Laps'))).toBe(true);
  });
});
