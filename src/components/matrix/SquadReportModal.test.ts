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
    expect(laps.findAll('th').map((t: any) => t.text())).toEqual(['Player', 'Attempts', 'Best']);
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
    expect(written.map(s => s.name)).toEqual(['3 Laps', 'Coopers']);
    expect(written[0].rows[0]).toMatchObject({ Player: 'Cesar Alva', Attempts: 2, Best: '4:10' });
  });

  it('exports what the coach sorted, not the original order', async () => {
    const w = await mountReport();
    const sec = w.findAll('[data-squad-exercise]').find((s: any) => s.text().includes('3 Laps'))!;
    await sec.find('[data-squad-sort="name"]').trigger('click');
    await w.find('[data-squad-excel]').trigger('click');
    expect(written[0].rows.map((r: any) => r.Player))
      .toEqual(['Alain Renteria', 'Cesar Alva', 'Tom Budde']);
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

