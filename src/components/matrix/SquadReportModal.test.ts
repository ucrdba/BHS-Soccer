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
const FLYING = 'd-flying';   // win_loss, reported as a record

const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva' },
  { id: 'p2', name: 'Tom Budde' },
  { id: 'p3', name: 'Alain Renteria' }   // attempts nothing
];

const DRILLS = [
  { id: LAPS, name: '3 Laps', measure: 'time_bands' },
  { id: COOPERS, name: 'Coopers', measure: 'count_high' },
  { id: GOALS, name: '1v1 Attack', measure: 'role_goals' },
  { id: FLYING, name: 'Flying Fours', measure: 'win_loss' }
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

async function mountReport(opts: { history?: any; bands?: any[]; players?: any[] } = {}) {
  const { history = HISTORY, bands = [{ max_seconds: 270, factor: 1 }], players = PLAYERS } = opts;
  fetchTeamSessionHistory.mockResolvedValue(history);
  fetchTimeBands.mockResolvedValue(bands);

  const w = mount(SquadReportModal, {
    props: { open: true, teamId: TEAM },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn, stubActions: true,
        initialState: { matrix: { players, drillsBank: DRILLS } }
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
    // The exercise sections only: the overall ratings above them are the
    // Matrix's weighted points ranking, which is a ranking by design.
    const w = await mountReport();
    const exercises = w.findAll('[data-squad-exercise]').map((s: any) => s.text()).join(' ');
    expect(exercises).not.toMatch(/rank|1st|fastest in the squad/i);
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

describe('a W/D/L exercise', () => {
  // It used to take a heading and say nothing: the report counted raw values,
  // and a Flying Fours result carries an outcome instead.
  const WDL = [
    ...HISTORY,
    { drillId: FLYING, playerId: 'p1', attendance: 'present', rawValue: null, outcome: 'win', occurredOn: '2026-09-02' },
    { drillId: FLYING, playerId: 'p1', attendance: 'present', rawValue: null, outcome: 'draw', occurredOn: '2026-09-09' },
    { drillId: FLYING, playerId: 'p2', attendance: 'present', rawValue: null, outcome: 'loss', occurredOn: '2026-09-02' }
  ];

  const flying = (w: any) =>
    w.findAll('[data-squad-exercise]').find((s: any) => s.text().includes('Flying Fours'))!;

  it('reports each player’s record, and counts the games they played', async () => {
    const sec = flying(await mountReport({ history: WDL }));
    const rows = sec.findAll('[data-squad-row]').map((r: any) => [
      r.find('[data-squad-player]').text(),
      r.find('[data-squad-attempts]').text(),
      r.find('[data-squad-best]').text()
    ]);
    expect(rows).toEqual([
      ['Cesar Alva', '2', '1 - 1 - 0'],
      ['Tom Budde', '1', '0 - 0 - 1'],
      ['Alain Renteria', '0', '—']      // played none: still listed
    ]);
  });

  it('heads the columns as games and record, not attempts and best', async () => {
    const sec = flying(await mountReport({ history: WDL }));
    expect(sec.findAll('th').map((t: any) => t.text())).toEqual(['Player', 'Games', 'W-D-L']);
  });

  it('leaves a measured exercise reading as it did', async () => {
    const w = await mountReport({ history: WDL });
    const laps = w.findAll('[data-squad-exercise]').find((s: any) => s.text().includes('3 Laps'))!;
    expect(laps.findAll('th').map((t: any) => t.text())).toEqual(['Player', 'Attempts', 'Best', 'Avg', 'Progress']);
    expect(laps.findAll('[data-squad-best]').map((b: any) => b.text())).toEqual(['4:10', '4:50', '—']);
  });
});

describe('sorting one exercise at a time', () => {
  const laps = (w: any) =>
    w.findAll('[data-squad-exercise]').find((s: any) => s.text().includes('3 Laps'))!;
  const coopers = (w: any) =>
    w.findAll('[data-squad-exercise]').find((s: any) => s.text().includes('Coopers'))!;
  const players = (sec: any) => sec.findAll('[data-squad-player]').map((p: any) => p.text());

  it('sorts a timed exercise fastest first, and reverses on a second click', async () => {
    const w = await mountReport();
    const sec = laps(w);
    await sec.find('[data-squad-sort="best"]').trigger('click');
    expect(players(sec)).toEqual(['Cesar Alva', 'Tom Budde', 'Alain Renteria']);

    await sec.find('[data-squad-sort="best"]').trigger('click');
    // Reversed among those who ran; the player with nothing stays at the foot.
    expect(players(sec)).toEqual(['Tom Budde', 'Cesar Alva', 'Alain Renteria']);
  });

  it('sorts by name without dropping anyone', async () => {
    const w = await mountReport();
    const sec = laps(w);
    await sec.find('[data-squad-sort="name"]').trigger('click');
    expect(players(sec)).toEqual(['Alain Renteria', 'Cesar Alva', 'Tom Budde']);
  });

  it('leaves the other exercises in their own order', async () => {
    const w = await mountReport();
    await laps(w).find('[data-squad-sort="name"]').trigger('click');
    expect(players(coopers(w))).toEqual(['Cesar Alva', 'Tom Budde', 'Alain Renteria']);
  });
});

describe('taking the squad report off the screen', () => {
  let written: { name: string; rows: any[] }[];
  let printed: string;

  beforeEach(() => {
    written = [];
    printed = '';
    (window as any).XLSX = {
      utils: {
        book_new: () => ({}),
        json_to_sheet: (rows: any[]) => ({ rows }),
        book_append_sheet: (_wb: any, sheet: any, name: string) => { written.push({ name, rows: sheet.rows }); }
      },
      writeFile: () => {}
    };
    vi.spyOn(window, 'open').mockImplementation(() => ({
      document: { write: (html: string) => { printed = html; }, close: () => {} },
      focus: () => {}, print: () => {}
    }) as any);
  });

  it('writes one sheet per exercise, in the order shown', async () => {
    const w = await mountReport();
    await w.find('[data-squad-excel]').trigger('click');
    // The overall ratings first, as on screen.
    expect(written.map(s => s.name)).toEqual(['Overall ratings', '3 Laps', 'Coopers']);
    expect(written[1].rows[0]).toMatchObject({ Player: 'Cesar Alva', Attempts: 2, Best: '4:10' });
  });

  it('exports what the coach sorted, not the original order', async () => {
    const w = await mountReport();
    const sec = w.findAll('[data-squad-exercise]').find((s: any) => s.text().includes('3 Laps'))!;
    await sec.find('[data-squad-sort="name"]').trigger('click');
    await w.find('[data-squad-excel]').trigger('click');
    // written[0] is the overall ratings; 3 Laps is the next sheet.
    expect(written[1].name).toBe('3 Laps');
    expect(written[1].rows.map((r: any) => r.Player))
      .toEqual(['Alain Renteria', 'Cesar Alva', 'Tom Budde']);
  });

  it('exports the overall ratings as the coach sorted them', async () => {
    const w = await mountReport({ players: [
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 21, matrixStats: { earned: 50, available: 120, share: 41.7, rank: 2, exercises: 6, wins: 3, draws: 1, losses: 2 } },
      { id: 'p2', name: 'Tom Budde', recordingNumber: 7, matrixStats: { earned: 100, available: 100, share: 100, rank: 1, exercises: 4, wins: 2, draws: 0, losses: 2 } }
    ] });
    await w.find('[data-overall-sort="wdl"]').trigger('click');
    await w.find('[data-squad-excel]').trigger('click');
    expect(written[0].name).toBe('Overall ratings');
    expect(written[0].rows.map((r: any) => r.Player)).toEqual(['Cesar Alva', 'Tom Budde']);
  });

  it('prints every exercise in one document', async () => {
    const w = await mountReport();
    await w.find('[data-squad-print]').trigger('click');
    expect(printed).toContain('Squad report');
    expect(printed).toContain('3 Laps');
    expect(printed).toContain('Coopers');
  });

  it('says so when the spreadsheet library has not loaded', async () => {
    delete (window as any).XLSX;
    const w = await mountReport();
    await w.find('[data-squad-excel]').trigger('click');
    expect(w.find('[data-squad-export-error]').text()).toMatch(/spreadsheet library/i);
  });

  it('says so when the print window is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const w = await mountReport();
    await w.find('[data-squad-print]').trigger('click');
    expect(w.find('[data-squad-export-error]').text()).toMatch(/pop-?up/i);
  });

  it('offers neither button when nothing has been recorded', async () => {
    const w = await mountReport({ history: [] });
    expect(w.find('[data-squad-excel]').exists()).toBe(false);
    expect(w.find('[data-squad-print]').exists()).toBe(false);
  });
});


describe('the progress graphs', () => {
  const rowFor = (section: any, name: string) =>
    section.findAll('[data-squad-row]').find((r: any) => r.text().includes(name))!;

  it('head a Progress column in a timed exercise', async () => {
    const w = await mountReport();
    const heads = sectionFor(w, '3 Laps').findAll('th').map((t: any) => t.text());
    expect(heads).toContain('Progress');
  });

  it('are not drawn for a counted or a W/D/L exercise', async () => {
    const w = await mountReport({
      history: [...HISTORY,
        { drillId: FLYING, playerId: 'p1', attendance: 'present', outcome: 'win', occurredOn: '2026-09-02' }]
    });
    expect(sectionFor(w, 'Coopers').find('[data-squad-progress]').exists()).toBe(false);
    expect(sectionFor(w, 'Flying Fours').find('[data-squad-progress]').exists()).toBe(false);
  });

  it('draw a line through a player\'s readings, oldest first, and say what it shows', async () => {
    const w = await mountReport();
    const svg = rowFor(sectionFor(w, '3 Laps'), 'Cesar Alva').find('[data-squad-spark]');
    expect(svg.find('polyline').exists()).toBe(true);
    // 4:10 on the 1st, then 4:20: slower, so slipping.
    expect(svg.attributes('aria-label')).toBe('Slipping — 4:10 to 4:20 across 2 readings');
  });

  it('draw one reading as a dot, with no verdict', async () => {
    const w = await mountReport();
    const svg = rowFor(sectionFor(w, '3 Laps'), 'Tom Budde').find('[data-squad-spark]');
    expect(svg.find('polyline').exists()).toBe(false);
    expect(svg.find('circle').exists()).toBe(true);
    expect(svg.attributes('aria-label')).toBe('One reading: 4:50');
  });

  it('keep a player with no readings in the table, with a dash', async () => {
    const w = await mountReport();
    const row = rowFor(sectionFor(w, '3 Laps'), 'Alain Renteria');
    expect(row.find('[data-squad-spark]').exists()).toBe(false);
    expect(row.find('[data-squad-progress]').text()).toBe('—');
  });

  it('share one scale across the exercise, faster drawn higher', async () => {
    const w = await mountReport();
    const laps = sectionFor(w, '3 Laps');
    // Budde's 4:50 is the squad's slowest reading, so it sits at the bottom;
    // Alva's latest, 4:20, sits above it.
    const cy = (name: string) => Number(rowFor(laps, name).find('[data-squad-spark] circle').attributes('cy'));
    expect(cy('Tom Budde')).toBe(18);
    expect(cy('Cesar Alva')).toBeLessThan(cy('Tom Budde'));
  });

  it('lay the standard across each graph', async () => {
    const w = await mountReport();
    const svg = rowFor(sectionFor(w, '3 Laps'), 'Cesar Alva').find('[data-squad-spark]');
    expect(svg.find('[data-squad-spark-standard]').exists()).toBe(true);
  });

  it('draw no standard where the squad has none set', async () => {
    const w = await mountReport({ bands: [] });
    const svg = rowFor(sectionFor(w, '3 Laps'), 'Cesar Alva').find('[data-squad-spark]');
    expect(svg.find('[data-squad-spark-standard]').exists()).toBe(false);
  });
});

describe('the average', () => {
  const laps = (w: any) => sectionFor(w, '3 Laps');
  const players = (sec: any) => sec.findAll('[data-squad-player]').map((p: any) => p.text());

  it('is shown beside the best in a timed exercise, a dash for nobody', async () => {
    const w = await mountReport();
    // Alva ran 4:10 and 4:20; Budde once, 4:50.
    expect(laps(w).findAll('[data-squad-avg]').map((a: any) => a.text())).toEqual(['4:15', '4:50', '—']);
  });

  it('is not shown for a counted or a W/D/L exercise', async () => {
    const w = await mountReport({
      history: [...HISTORY,
        { drillId: FLYING, playerId: 'p1', attendance: 'present', outcome: 'win', occurredOn: '2026-09-02' }]
    });
    expect(sectionFor(w, 'Coopers').find('[data-squad-avg]').exists()).toBe(false);
    expect(sectionFor(w, 'Flying Fours').find('[data-squad-avg]').exists()).toBe(false);
  });

  it('sorts fastest first on its own figure, not the best', async () => {
    // Alva's best (4:00) beats Budde's, but his average (4:30) does not.
    const w = await mountReport({ history: [
      { drillId: LAPS, playerId: 'p1', attendance: 'present', rawValue: 240, occurredOn: '2026-09-01' },
      { drillId: LAPS, playerId: 'p1', attendance: 'present', rawValue: 300, occurredOn: '2026-09-08' },
      { drillId: LAPS, playerId: 'p2', attendance: 'present', rawValue: 260, occurredOn: '2026-09-01' }
    ] });
    const sec = laps(w);
    await sec.find('[data-squad-sort="avg"]').trigger('click');
    expect(players(sec)).toEqual(['Tom Budde', 'Cesar Alva', 'Alain Renteria']);

    await sec.find('[data-squad-sort="avg"]').trigger('click');
    expect(players(sec)).toEqual(['Cesar Alva', 'Tom Budde', 'Alain Renteria']);
  });
});

describe('a sprint', () => {
  it('reads in decimal seconds: best, average and the words of the graph', async () => {
    const SPRINT = 'd-sprint';
    fetchTeamSessionHistory.mockResolvedValue([
      { drillId: SPRINT, playerId: 'p1', attendance: 'present', rawValue: 5.4, occurredOn: '2026-09-01' },
      { drillId: SPRINT, playerId: 'p1', attendance: 'present', rawValue: 5.1, occurredOn: '2026-09-08' }
    ]);
    fetchTimeBands.mockResolvedValue([]);
    const w = mount(SquadReportModal, {
      props: { open: true, teamId: TEAM },
      global: {
        plugins: [createTestingPinia({
          createSpy: vi.fn, stubActions: true,
          initialState: { matrix: { players: PLAYERS, drillsBank: [{ id: SPRINT, name: '40m Sprint', measure: 'time_low' }] } }
        })]
      },
      attachTo: document.body
    });
    await flush();
    await w.vm.$nextTick();

    const row = w.findAll('[data-squad-row]').find((r: any) => r.text().includes('Cesar Alva'))!;
    expect(row.find('[data-squad-best]').text()).toBe('5.10s');
    expect(row.find('[data-squad-avg]').text()).toBe('5.25s');
    expect(row.find('[data-squad-spark]').attributes('aria-label'))
      .toBe('Improving — 5.40s to 5.10s across 2 readings');
  });
});

describe('the overall ratings', () => {
  // Budde outranks Alva on points; Alva has done more and won more. Renteria
  // has done nothing and is still listed.
  const RATED = [
    { id: 'p1', name: 'Cesar Alva', recordingNumber: 21,
      matrixStats: { earned: 50, available: 120, share: 41.7, rank: 2, exercises: 6, wins: 3, draws: 1, losses: 2 } },
    { id: 'p2', name: 'Tom Budde', recordingNumber: 7,
      matrixStats: { earned: 100, available: 100, share: 100, rank: 1, exercises: 4, wins: 2, draws: 0, losses: 2 } },
    { id: 'p3', name: 'Alain Renteria', recordingNumber: 3,
      matrixStats: { earned: 0, available: 0, share: null, rank: 999, exercises: 0, wins: 0, draws: 0, losses: 0 } }
  ];
  const overall = (w: any) => w.find('[data-squad-overall]');
  const players = (w: any) => overall(w).findAll('[data-overall-player]').map((p: any) => p.text());
  const sortBy = (w: any, key: string) => overall(w).find(`[data-overall-sort="${key}"]`).trigger('click');

  it('comes before every exercise', async () => {
    const w = await mountReport({ players: RATED });
    const first = w.find('[data-squad-overall], [data-squad-exercise]');
    expect(first.attributes()).toHaveProperty('data-squad-overall');
    expect(overall(w).text()).toContain('Overall ratings');
  });

  it('has the Player Ratings columns', async () => {
    const w = await mountReport({ players: RATED });
    // Without the arrow that marks the column it is sorted by.
    expect(overall(w).findAll('th').map((t: any) => t.text().replace(/[▲▼]/g, '').trim()))
      .toEqual(['Rank', 'Player', 'No', 'Ex', 'W-D-L', 'Pts', 'Of', 'Share']);
  });

  it('lists everyone in rank order, with a dash for a player who has done nothing', async () => {
    const w = await mountReport({ players: RATED });
    expect(players(w)).toEqual(['Tom Budde', 'Cesar Alva', 'Alain Renteria']);
    const rows = overall(w).findAll('[data-overall-row]');
    expect(rows[0].text()).toContain('100.00');
    expect(rows[0].text()).toContain('2 - 0 - 2');
    expect(rows[0].text()).toContain('100.0%');
    expect(rows[2].find('[data-overall-rank]').text()).toBe('—');
  });

  it('sorts on every column', async () => {
    const w = await mountReport({ players: RATED });
    const heads = overall(w).findAll('th');
    expect(heads.every((h: any) => h.find('[data-overall-sort]').exists())).toBe(true);

    await sortBy(w, 'wdl');
    expect(players(w)).toEqual(['Cesar Alva', 'Tom Budde', 'Alain Renteria']);
    await sortBy(w, 'wdl');
    expect(players(w)).toEqual(['Tom Budde', 'Cesar Alva', 'Alain Renteria']);

    await sortBy(w, 'name');
    expect(players(w)).toEqual(['Alain Renteria', 'Cesar Alva', 'Tom Budde']);

    await sortBy(w, 'recordingNumber');
    expect(players(w)).toEqual(['Alain Renteria', 'Tom Budde', 'Cesar Alva']);

    await sortBy(w, 'exercises');
    expect(players(w)).toEqual(['Cesar Alva', 'Tom Budde', 'Alain Renteria']);
  });

  it('marks the column it is sorted by', async () => {
    const w = await mountReport({ players: RATED });
    await sortBy(w, 'earned');
    expect(overall(w).find('[data-overall-sort="earned"]').text()).toContain('▼');
  });

  it('sorts on its own, leaving the exercises as they were', async () => {
    const w = await mountReport({ players: RATED });
    const before = sectionFor(w, '3 Laps').findAll('[data-squad-player]').map((p: any) => p.text());
    await sortBy(w, 'name');
    expect(sectionFor(w, '3 Laps').findAll('[data-squad-player]').map((p: any) => p.text())).toEqual(before);
  });

  it('is not shown when no sessions have been recorded', async () => {
    const w = await mountReport({ players: RATED, history: [] });
    expect(overall(w).exists()).toBe(false);
  });
});
