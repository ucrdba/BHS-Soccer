/**
 * The blank sheets a coach carries to practice.
 *
 * Paper is what the session grid competes with, so these are built to be
 * filled one-handed and typed in afterwards: the roster in RECORDING number
 * order, boxes shaped for the measure, and — for a small-sided game — the free
 * lines the coach already uses, "won: 1, 5, 3, 7", which the Won/Tie/Lost
 * boxes on the session sheet then take verbatim.
 */
import { describe, it, expect } from 'vitest';
import { practiceFormSections, buildPracticeFormsDocument } from './practice-form';

const SQUAD = [
  { id: 'p2', name: 'Tom Budde', recordingNumber: 1, position: 4 },
  { id: 'p3', name: 'Alain Renteria', recordingNumber: 2, position: null },
  { id: 'p1', name: 'Cesar Alva', recordingNumber: 3, position: 9 }
];

const drill = (over: any) => ({ id: 'd1', name: 'A Drill', measure: 'count_high', points: 2, ...over });

const opts = (over: any = {}) => ({
  organization: 'Beaumont High School',
  team: 'Varsity',
  dates: ['2026-09-17'],
  players: SQUAD,
  standards: {},
  drills: [drill({})],
  ...over
});

const columnsOf = (section: any) => Object.keys(section.rows[0]);

describe('the sheet for each measure', () => {
  it('gives a counted exercise three boxes per player', () => {
    const [sheet] = practiceFormSections(opts({ drills: [drill({ measure: 'count_high' })] }));
    expect(columnsOf(sheet)).toEqual(['#', 'Player', 'Here', 'Count 1', 'Count 2', 'Count 3']);
    expect(sheet.rows[0]).toEqual({ '#': 1, Player: 'Tom Budde', Here: '☐', 'Count 1': '', 'Count 2': '', 'Count 3': '' });
  });

  it('asks a banded exercise for times, and prints the squad’s standard', () => {
    const [sheet] = practiceFormSections(opts({
      drills: [drill({ id: 'laps', name: '3-430', measure: 'time_bands' })],
      standards: { laps: 270 }
    }));
    expect(columnsOf(sheet)).toEqual(['#', 'Player', 'Here', 'Time 1', 'Time 2', 'Time 3']);
    expect(sheet.note).toContain('standard 4:30');
    expect(sheet.heading).toContain('3-430');
  });

  it('says so when a banded exercise has no standard for this squad', () => {
    const [sheet] = practiceFormSections(opts({
      drills: [drill({ measure: 'time_bands' })], standards: {}
    }));
    expect(sheet.note).toContain('no standard set');
  });

  it('asks a sprint for seconds rather than mm:ss', () => {
    const [sheet] = practiceFormSections(opts({ drills: [drill({ measure: 'time_low' })] }));
    expect(columnsOf(sheet)).toEqual(['#', 'Player', 'Here', 'Seconds 1', 'Seconds 2', 'Seconds 3']);
  });

  it('gives a small-sided game free lines and no result column', () => {
    const [sheet] = practiceFormSections(opts({ drills: [drill({ measure: 'win_loss' })] }));
    expect(columnsOf(sheet)).toEqual(['#', 'Player', 'Here']);
    expect(sheet.preamble).toContain('WON');
    // "TIE" on paper, as the coach says it.
    expect(sheet.preamble).toContain('TIE');
    expect(sheet.preamble).toContain('LOST');
    expect(sheet.preamble).toMatch(/recording numbers/i);
  });

  it('gives Goals by role a role to circle, the usual one, and a score box', () => {
    const [sheet] = practiceFormSections(opts({ drills: [drill({ measure: 'role_goals' })] }));
    expect(columnsOf(sheet)).toEqual(['#', 'Player', 'Here', 'Usual', 'Role (circle)', 'Score']);
    expect(sheet.rows.map((r: any) => r.Usual)).toEqual(['Defence', '—', 'Attack']);
    expect(sheet.rows[0]['Role (circle)']).toBe('A   D   GK');
    expect(sheet.rows[0].Score).toBe('____ – ____');
  });

  it('prints a drill whose measure is unknown, and says so', () => {
    const [sheet] = practiceFormSections(opts({ drills: [drill({ measure: null, name: 'Rondo 4v2' })] }));
    expect(columnsOf(sheet)).toEqual(['#', 'Player', 'Here', 'Result 1', 'Result 2', 'Result 3']);
    expect(sheet.note).toContain('measure not set');
  });

  it('leaves a 1v1 exercise out: the round robin prints its pairings', () => {
    expect(practiceFormSections(opts({ drills: [drill({ measure: 'head_to_head' })] }))).toEqual([]);
  });
});

describe('the squad on every sheet', () => {
  it('is in recording-number order, whatever order it arrives in', () => {
    const [sheet] = practiceFormSections(opts({}));
    expect(sheet.rows.map((r: any) => r.Player)).toEqual(['Tom Budde', 'Alain Renteria', 'Cesar Alva']);
  });

  it('puts a player with no recording number last, with a dash', () => {
    const [sheet] = practiceFormSections(opts({
      players: [...SQUAD, { id: 'p9', name: 'New Player', recordingNumber: null, position: 1 }]
    }));
    expect(sheet.rows[3]).toMatchObject({ '#': '—', Player: 'New Player' });
  });
});

describe('the document', () => {
  it('is one page per drill per day, day by day, in the order given', () => {
    const html = buildPracticeFormsDocument(opts({
      dates: ['2026-09-17', '2026-09-18'],
      drills: [drill({ id: 'a', name: 'Coopers' }), drill({ id: 'b', name: 'Flying Fours', measure: 'win_loss' })]
    }))!;

    const headings = (html.match(/<h2>([^<]*)<\/h2>/g) || []).map(h => h.replace(/<\/?h2>/g, ''));
    expect(headings).toEqual([
      'Coopers — Counted, high wins',
      'Flying Fours — Small-sided (W/D/L)',
      'Coopers — Counted, high wins',
      'Flying Fours — Small-sided (W/D/L)'
    ]);
    // Three of the four start a fresh page; the first is already on one.
    expect((html.match(/class="sec sec--page"/g) || [])).toHaveLength(3);
  });

  it('dates every sheet, so a week of forms cannot be mixed up', () => {
    const html = buildPracticeFormsDocument(opts({ dates: ['2026-09-17', '2026-09-18'] }))!;
    expect(html).toContain('Thursday, September 17, 2026');
    expect(html).toContain('Friday, September 18, 2026');
  });

  it('names the team and the organization', () => {
    const html = buildPracticeFormsDocument(opts({}))!;
    expect(html).toContain('Varsity');
    expect(html).toContain('Beaumont High School');
  });

  it('spends no space on a title: the sheet says which exercise it is', () => {
    const html = buildPracticeFormsDocument(opts({}))!;
    expect(html).not.toMatch(/<h1>/);
    // The document is still titled, for the print dialog and the saved PDF.
    expect(html).toContain('<title>Practice forms</title>');
  });

  it('refuses rather than printing a headed blank page', () => {
    expect(buildPracticeFormsDocument(opts({ players: [] }))).toBeNull();
    expect(buildPracticeFormsDocument(opts({ drills: [] }))).toBeNull();
    expect(buildPracticeFormsDocument(opts({ dates: [] }))).toBeNull();
  });

  it('escapes a drill name a coach typed', () => {
    const html = buildPracticeFormsDocument(opts({
      drills: [drill({ name: '<script>alert(1)</script>' })]
    }))!;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
