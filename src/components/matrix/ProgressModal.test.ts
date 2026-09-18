/**
 * One player's readings for one exercise, over the season.
 *
 * Two rules carry this screen, and both are about not putting a verdict on
 * thin evidence.
 *
 * A session a player missed is left out rather than plotted as zero: not
 * being there is not a result of nothing, and drawing it as one shows a
 * collapse that never happened.
 *
 * And a single reading gets NO trend. One result is not a trend, and calling
 * it "level" puts a verdict on a player who has done the exercise once. The
 * player is still shown -- it is the verdict that is withheld, which is the
 * same principle as printing minutes beside a rate rather than hiding the
 * player.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import ProgressModal from './ProgressModal.vue';

const fetchTeamSessionHistory = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchTeamSessionHistory: (...a: any[]) => fetchTeamSessionHistory(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';
const LAPS = 'd-laps';       // time_bands — faster is better, read as m:ss
const SPRINT = 'd-sprint';   // time_low — decimal seconds
const COOPERS = 'd-coopers'; // count_high — more is better

const PLAYERS = [{ id: 'p1', name: 'Cesar Alva' }, { id: 'p2', name: 'Tom Budde' }];
const DRILLS = [
  { id: LAPS, name: '3 Laps', measure: 'time_bands' },
  { id: COOPERS, name: 'Coopers', measure: 'count_high' },
  { id: 'd-goals', name: '1v1 Attack', measure: 'role_goals' },
  { id: SPRINT, name: '40m Sprint', measure: 'time_low' }
];

/** Three sessions: p1 improves, and misses the middle one. */
const HISTORY = [
  { drillId: LAPS, playerId: 'p1', attendance: 'present', rawValue: 290, occurredOn: '2026-09-01' },
  { drillId: LAPS, playerId: 'p1', attendance: 'unexcused', rawValue: null, occurredOn: '2026-09-08' },
  { drillId: LAPS, playerId: 'p1', attendance: 'present', rawValue: 250, occurredOn: '2026-09-15' },
  { drillId: LAPS, playerId: 'p2', attendance: 'present', rawValue: 280, occurredOn: '2026-09-01' },
  { drillId: COOPERS, playerId: 'p1', attendance: 'present', rawValue: 2600, occurredOn: '2026-09-01' },
  { drillId: COOPERS, playerId: 'p1', attendance: 'present', rawValue: 2900, occurredOn: '2026-09-15' }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountProgress(history: any = HISTORY) {
  fetchTeamSessionHistory.mockResolvedValue(history);

  const w = mount(ProgressModal, {
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

const readings = (w: any) =>
  w.findAll('[data-progress-reading]').map((r: any) => r.text());

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('the series', () => {
  it('opens on the first player and exercise', async () => {
    const w = await mountProgress();
    expect((w.find('[data-progress-player]').element as HTMLSelectElement).value).toBe('p1');
  });

  it('LEAVES OUT a session the player missed', async () => {
    // Not being there is not a result of nothing, and plotting it as zero
    // would draw a collapse that never happened.
    const w = await mountProgress();
    expect(readings(w)).toHaveLength(2);
    expect(readings(w).join(' ')).not.toContain('0:00');
  });

  it('is oldest first', async () => {
    const w = await mountProgress();
    expect(readings(w)[0]).toContain('2026-09-01');
  });

  it('formats a timed exercise as a time', async () => {
    const w = await mountProgress();
    expect(readings(w)[0]).toContain('4:50');
  });

  it('leaves a counted exercise as a number', async () => {
    const w = await mountProgress();
    await w.find('[data-progress-drill]').setValue(COOPERS);
    await w.vm.$nextTick();

    expect(readings(w)[0]).toContain('2600');
  });

  it('says so when there is nothing recorded', async () => {
    const w = await mountProgress();
    await w.find('[data-progress-player]').setValue('p2');
    await w.find('[data-progress-drill]').setValue(COOPERS);
    await w.vm.$nextTick();

    expect(w.find('[data-progress-empty]').exists()).toBe(true);
  });
});

describe('THE TREND', () => {
  it('is withheld for a single reading', async () => {
    // One result is not a trend, and calling it "level" would put a verdict
    // on a player who has done the exercise once.
    const w = await mountProgress();
    await w.find('[data-progress-player]').setValue('p2');
    await w.vm.$nextTick();

    expect(w.find('[data-progress-trend]').text()).toMatch(/not enough for a trend/i);
  });

  it('still SHOWS that single reading', async () => {
    // The player is not dropped; only the verdict is.
    const w = await mountProgress();
    await w.find('[data-progress-player]').setValue('p2');
    await w.vm.$nextTick();

    expect(readings(w)).toHaveLength(1);
  });

  it('reads a faster time as improving', async () => {
    const w = await mountProgress();
    expect(w.find('[data-progress-trend]').text()).toMatch(/improving/i);
  });

  it('reads a higher count as improving too', async () => {
    const w = await mountProgress();
    await w.find('[data-progress-drill]').setValue(COOPERS);
    await w.vm.$nextTick();

    expect(w.find('[data-progress-trend]').text()).toMatch(/improving/i);
  });

  it('reads a slower time as slipping', async () => {
    const w = await mountProgress([
      { drillId: LAPS, playerId: 'p1', attendance: 'present', rawValue: 250, occurredOn: '2026-09-01' },
      { drillId: LAPS, playerId: 'p1', attendance: 'present', rawValue: 290, occurredOn: '2026-09-15' }
    ]);
    expect(w.find('[data-progress-trend]').text()).toMatch(/slipping/i);
  });

  it('says level when nothing changed', async () => {
    const w = await mountProgress([
      { drillId: LAPS, playerId: 'p1', attendance: 'present', rawValue: 250, occurredOn: '2026-09-01' },
      { drillId: LAPS, playerId: 'p1', attendance: 'present', rawValue: 250, occurredOn: '2026-09-15' }
    ]);
    expect(w.find('[data-progress-trend]').text()).toMatch(/level/i);
  });

  it('says how many readings are behind the verdict', async () => {
    const w = await mountProgress();
    expect(w.find('[data-progress-trend]').text()).toContain('2 readings');
  });
});

describe('the chart', () => {
  it('is an SVG polyline, with no library', async () => {
    const w = await mountProgress();
    const chart = w.find('[data-progress-chart]');

    expect(chart.exists()).toBe(true);
    expect(chart.find('polyline').attributes('points')).toBeTruthy();
  });

  it('has a point per reading', async () => {
    const w = await mountProgress();
    const points = w.find('polyline').attributes('points')!.trim().split(/\s+/);
    expect(points).toHaveLength(2);
  });

  it('draws an improvement upward for a timed exercise', async () => {
    // Faster is better, so the line rises as the times fall.
    const w = await mountProgress();
    const [first, last] = w.find('polyline').attributes('points')!
      .trim().split(/\s+/).map(p => Number(p.split(',')[1]));

    expect(last).toBeLessThan(first);
  });

  it('draws an improvement upward for a counted one too', async () => {
    const w = await mountProgress();
    await w.find('[data-progress-drill]').setValue(COOPERS);
    await w.vm.$nextTick();

    const [first, last] = w.find('polyline').attributes('points')!
      .trim().split(/\s+/).map(p => Number(p.split(',')[1]));

    expect(last).toBeLessThan(first);
  });
});

describe('when the read fails', () => {
  it('says so rather than showing an empty chart', async () => {
    const w = await mountProgress(null);
    expect(w.find('[data-progress-error]').exists()).toBe(true);
  });
});

describe('Goals by role', () => {
  it('is not offered: the chart plots one value per session, which this measure does not have', async () => {
    const w = await mountProgress();
    const offered = w.find('[data-progress-drill]').findAll('option').map((o: any) => o.text());
    expect(offered).not.toContain('1v1 Attack');
    expect(offered).toContain('Coopers');
  });
});

describe('a sprint', () => {
  // Decimal seconds: read as m:ss, 5.40 and 5.05 both showed as "0:05".
  const SPRINTS = [
    { drillId: SPRINT, playerId: 'p1', attendance: 'present', rawValue: 5.4, occurredOn: '2026-09-01' },
    { drillId: SPRINT, playerId: 'p1', attendance: 'present', rawValue: 5.05, occurredOn: '2026-09-08' }
  ];

  it('shows each reading in decimal seconds', async () => {
    const w = await mountProgress(SPRINTS);
    await w.find('[data-progress-drill]').setValue(SPRINT);
    await w.vm.$nextTick();
    expect(readings(w).join(' ')).toContain('5.40s');
    expect(readings(w).join(' ')).toContain('5.05s');
  });

  it('states the trend in decimal seconds', async () => {
    const w = await mountProgress(SPRINTS);
    await w.find('[data-progress-drill]').setValue(SPRINT);
    await w.vm.$nextTick();
    expect(w.find('[data-progress-trend]').text()).toContain('5.40s to 5.05s');
  });
});
