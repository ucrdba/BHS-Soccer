/**
 * The workbook round trip.
 *
 * The two assertions that matter most are both about not writing.
 *
 * Choosing a file PREVIEWS and writes nothing. The legacy importer applies as
 * it reads, so a misread column is found after it has overwritten a season.
 *
 * And an unmapped team blocks the apply outright. A spreadsheet names a team
 * as text and the database holds uuids, so a row written against the wrong
 * team is a player on a squad they never played for -- in team_players, where
 * minutes, ratings and recording numbers live.
 *
 * On the export side: it invents nothing. An empty table exports an empty
 * sheet, which is what tells a coach the table is empty.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ImportExportModal from './ImportExportModal.vue';

const upsertPlayerIdentity = vi.fn();
const upsertTeamMembership = vi.fn();
const upsertMatch = vi.fn();
const upsertDrillBankItem = vi.fn();
const upsertCoach = vi.fn();
const upsertDailyThought = vi.fn();
const upsertQuizQuestion = vi.fn();
const upsertSoccerCategory = vi.fn();
const upsertSchool = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    upsertSchool: (...a: any[]) => upsertSchool(...a),
    upsertPlayerIdentity: (...a: any[]) => upsertPlayerIdentity(...a),
    upsertTeamMembership: (...a: any[]) => upsertTeamMembership(...a),
    upsertMatch: (...a: any[]) => upsertMatch(...a),
    upsertDrillBankItem: (...a: any[]) => upsertDrillBankItem(...a),
    upsertCoach: (...a: any[]) => upsertCoach(...a),
    upsertDailyThought: (...a: any[]) => upsertDailyThought(...a),
    upsertQuizQuestion: (...a: any[]) => upsertQuizQuestion(...a),
    upsertSoccerCategory: (...a: any[]) => upsertSoccerCategory(...a)
  }
}));

const TEAMS = [
  { id: 't1', name: 'Varsity', school_id: 's1' },
  { id: 't2', name: 'JV', school_id: 's1' }
];

const DATA = {
  school: { code: 'lfc', name: 'Legends FC', mascot: 'Lions' },
  players: [{ firstName: 'Cesar', lastName: 'Alva', number: 9 }],
  quiz: [],
  teamName: 'Varsity'
};

/** Records what was written, so the export can be inspected. */
function stubXLSX() {
  const written: any[] = [];
  (window as any).XLSX = {
    utils: {
      book_new: () => ({ sheets: {} as Record<string, any> }),
      book_append_sheet: (wb: any, sheet: any, name: string) => { wb.sheets[name] = sheet; },
      json_to_sheet: (rows: any[]) => ({ rows }),
      sheet_to_json: (sheet: any) => sheet.rows || []
    },
    read: () => ({ SheetNames: [], Sheets: {} }),
    write: (wb: any) => wb,
    writeFile: (wb: any, fileName: string) => { written.push({ wb, fileName }); }
  };
  return written;
}

/** Records what was zipped. jsdom has no object URLs, so those are stubbed. */
function stubJSZip() {
  const files: Record<string, any> = {};
  (window as any).JSZip = class {
    file(name: string, data: any) { files[name] = data; }
    generateAsync() { return Promise.resolve({ blob: true } as any); }
  };
  (URL as any).createObjectURL = () => 'blob:zip';
  (URL as any).revokeObjectURL = () => {};
  return files;
}

/** A workbook the file input will "read". */
function stubRead(sheets: Record<string, any[]>) {
  (window as any).XLSX.read = () => ({
    SheetNames: Object.keys(sheets),
    Sheets: Object.fromEntries(Object.keys(sheets).map(k => [k, { rows: sheets[k] }]))
  });
}

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

function mountIE(data: any = DATA) {
  return mount(ImportExportModal, {
    props: { open: true, teamId: 't1', schoolId: 's1', teams: TEAMS, data },
    attachTo: document.body
  });
}

/** Drive the file input without a real File. */
async function choose(w: any, sheets: Record<string, any[]>) {
  stubRead(sheets);
  const input = w.find('[data-import-file]');
  Object.defineProperty(input.element, 'files', {
    value: [{ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }],
    configurable: true
  });
  await input.trigger('change');
  await flush();
  await w.vm.$nextTick();
}

const anyWriteCalled = () =>
  [upsertPlayerIdentity, upsertTeamMembership, upsertMatch, upsertDrillBankItem,
    upsertCoach, upsertDailyThought, upsertQuizQuestion, upsertSoccerCategory, upsertSchool]
    .some(fn => fn.mock.calls.length > 0);

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  upsertPlayerIdentity.mockResolvedValue({ id: 'p1' });
  upsertTeamMembership.mockResolvedValue({ ok: true });
  upsertMatch.mockResolvedValue({ id: 'm1' });
  upsertDrillBankItem.mockResolvedValue({ id: 'd1' });
  upsertCoach.mockResolvedValue({ id: 'c1' });
  upsertDailyThought.mockResolvedValue({ data: [{ id: 'dt1' }] });
  upsertQuizQuestion.mockResolvedValue({ ok: true });
  upsertSoccerCategory.mockResolvedValue({ ok: true });
  upsertSchool.mockResolvedValue({ data: { id: 's1' }, error: null });
});

describe('exporting', () => {
  it('writes every table into one workbook', () => {
    const written = stubXLSX();
    const w = mountIE();
    w.find('[data-export-all]').trigger('click');

    expect(Object.keys(written[0].wb.sheets)).toHaveLength(11);
  });

  it('EXPORTS NOTHING for an empty table rather than a sample row', () => {
    // The legacy export shipped a hardcoded quiz question every time.
    const written = stubXLSX();
    const w = mountIE();
    w.find('[data-export-one="quiz"]').trigger('click');

    expect(written[0].wb.sheets.QuizQuestions.rows).toEqual([]);
  });

  it('exports the real rows when there are some', () => {
    const written = stubXLSX();
    const w = mountIE();
    w.find('[data-export-one="players"]').trigger('click');

    expect(written[0].wb.sheets.Players.rows[0].FirstName).toBe('Cesar');
  });

  it('names each file the way a coach already has them saved', () => {
    const written = stubXLSX();
    const w = mountIE();
    w.find('[data-export-one="players"]').trigger('click');

    expect(written[0].fileName).toBe('3_Roster_Players.xlsx');
  });

  it('downloads a template with headers and no data', () => {
    const written = stubXLSX();
    const w = mountIE();
    w.find('[data-template="players"]').trigger('click');

    const [blank] = written[0].wb.sheets.Players.rows;
    expect(Object.values(blank).every(v => v === '')).toBe(true);
  });

  it('marks the sheet that cannot be imported back', () => {
    stubXLSX();
    const w = mountIE();
    expect(w.find('[data-export-only]').exists()).toBe(true);
  });

  it('writes ONE FILE PER TABLE into a zip, named as a coach has them saved', async () => {
    stubXLSX();
    const files = stubJSZip();
    const w = mountIE();
    await w.find('[data-export-zip]').trigger('click');
    await flush();

    expect(Object.keys(files)).toHaveLength(11);
    expect(Object.keys(files)).toContain('3_Roster_Players.xlsx');
  });

  it('builds the zip from the SAME definitions as the single workbook', async () => {
    // The legacy export wrote the table list out three times and they drifted.
    const written = stubXLSX();
    const files = stubJSZip();
    const w = mountIE();
    w.find('[data-export-all]').trigger('click');
    await w.find('[data-export-zip]').trigger('click');
    await flush();

    expect(Object.keys(files)).toHaveLength(Object.keys(written[0].wb.sheets).length);
  });

  it('says so when the ZIP library has not loaded rather than throwing', async () => {
    stubXLSX();
    delete (window as any).JSZip;
    const w = mountIE();
    await w.find('[data-export-zip]').trigger('click');
    await flush();

    expect(w.find('[data-ie-error]').text()).toMatch(/zip/i);
  });

  it('SAYS SO when the library has not loaded rather than throwing', async () => {
    // The CDN may not have answered yet.
    delete (window as any).XLSX;
    const w = mountIE();
    await w.find('[data-export-all]').trigger('click');

    expect(w.find('[data-ie-error]').text()).toMatch(/library/i);
  });
});

describe('CHOOSING A FILE PREVIEWS, AND WRITES NOTHING', () => {
  it('describes the sheets without touching the database', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, { Players: [{ Team: 'Varsity', FirstName: 'Cesar' }] });

    expect(w.find('[data-preview]').exists()).toBe(true);
    expect(anyWriteCalled()).toBe(false);
  });

  it('names each sheet and counts its rows', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, {
      Players: [{ Team: 'Varsity' }, { Team: 'Varsity' }],
      Schedule: [{ Team: 'JV' }]
    });

    expect(w.findAll('[data-preview-sheet]')).toHaveLength(2);
    expect(w.find('[data-preview-rows="players"]').text()).toContain('2');
  });

  it('warns about a sheet it does not recognise', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, { MyNotes: [{ a: 1 }] });

    expect(w.find('[data-preview-warning]').text()).toContain('MyNotes');
  });

  it('marks a sheet that will not be imported', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, { MatrixLogs: [{ PlayerName: 'Cesar Alva' }] });

    expect(w.find('[data-preview-skipped]').exists()).toBe(true);
  });

  it('says so when the file cannot be read at all', async () => {
    // Not through `choose`, which installs its own reader -- the throwing one
    // has to survive to the click.
    stubXLSX();
    const w = mountIE();
    (window as any).XLSX.read = () => { throw new Error('not a workbook'); };

    const input = w.find('[data-import-file]');
    Object.defineProperty(input.element, 'files', {
      value: [{ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }],
      configurable: true
    });
    await input.trigger('change');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-ie-error]').text()).toMatch(/could not be read/i);
  });
});

describe('AN UNMAPPED TEAM BLOCKS THE IMPORT', () => {
  const unknown = { Players: [{ Team: 'Boys Varsity', FirstName: 'Cesar' }] };

  it('asks about a team name that matches nothing', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, unknown);

    expect(w.find('[data-unknown-team]').text()).toContain('Boys Varsity');
    expect(w.find('[data-preview-unknown]').text()).toMatch(/never played for/i);
  });

  it('REFUSES to apply while it is unmapped', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, unknown);

    expect((w.find('[data-import-apply]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('allows the apply once a squad is chosen', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, unknown);
    await w.find('[data-map-team="Boys Varsity"]').setValue('t2');
    await w.vm.$nextTick();

    expect((w.find('[data-import-apply]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('writes the mapped rows against the squad the coach chose', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, unknown);
    await w.find('[data-map-team="Boys Varsity"]').setValue('t2');
    await w.find('[data-import-apply]').trigger('click');
    await flush();

    expect(upsertTeamMembership.mock.calls[0][0]).toBe('t2');
  });
});

describe('A BAD POSITION BLOCKS THE IMPORT', () => {
  const sheet = { Players: [{ Team: 'Varsity', FirstName: 'Cy', LastName: 'Dunn', Position: 'FB' }] };

  it('lists it in the preview, with the row and the player', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, sheet);
    const text = w.find('[data-bad-position]').text();
    expect(text).toContain('Cy Dunn');
    expect(text).toContain('FB');
    expect(text).toContain('Row 2');
  });

  it('REFUSES to apply', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, sheet);
    expect((w.find('[data-import-apply]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('writes a good position as a number', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, { Players: [{ Team: 'Varsity', FirstName: 'Cy', LastName: 'Dunn', Position: '7' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();
    expect(upsertTeamMembership).toHaveBeenCalledWith('t1', 's1', expect.objectContaining({ position: 7 }));
  });

  it('leaves the stored position alone when the sheet has no Position column', async () => {
    // A sparse sheet must not wipe a column it never mentioned -- the same
    // convention that already protects Number and RecordingNumber.
    stubXLSX();
    const w = mountIE();
    await choose(w, { Players: [{ Team: 'Varsity', FirstName: 'Cy', LastName: 'Dunn' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();
    const payload = upsertTeamMembership.mock.calls[0][2];
    expect(payload.position).toBeUndefined();
    expect('position' in payload === false || payload.position === undefined).toBe(true);
  });

  it('leaves the stored position alone when the Position cell is blank', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, { Players: [{ Team: 'Varsity', FirstName: 'Cy', LastName: 'Dunn', Position: '' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();
    expect(upsertTeamMembership.mock.calls[0][2].position).toBeUndefined();
  });
});

describe('applying', () => {
  it('writes a player as an identity and a membership', async () => {
    // Two steps: a person exists once, and belongs to a squad separately.
    stubXLSX();
    const w = mountIE();
    await choose(w, { Players: [{ Team: 'Varsity', FirstName: 'Cesar', LastName: 'Alva' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();

    expect(upsertPlayerIdentity).toHaveBeenCalled();
    expect(upsertTeamMembership).toHaveBeenCalledWith('t1', 's1', expect.objectContaining({
      player_id: 'p1'
    }));
  });

  it('READS A SINGLE Name COLUMN, which the handbook says still works', async () => {
    // Built only from FirstName and LastName, a sheet with just Name had every
    // row refused. The name is handed over whole and without parts, which is
    // what makes `upsertPlayerIdentity` split it — comma form included — with
    // `splitPlayerName` (proved in src/data/player-name-parts.test.ts).
    stubXLSX();
    const w = mountIE();
    await choose(w, { Players: [
      { Team: 'Varsity', Name: 'Mateo Herrera' },
      { Team: 'Varsity', Name: 'Bustillos Correa, Luis' }
    ] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();

    const sent = upsertPlayerIdentity.mock.calls.map(c => c[0]);
    expect(sent.map(p => p.name)).toEqual(['Mateo Herrera', 'Bustillos Correa, Luis']);
    sent.forEach(p => {
      expect(p.first_name).toBeUndefined();
      expect(p.last_name).toBeUndefined();
    });
    expect(w.find('[data-import-result]').text()).toContain('0 refused');
  });

  it('still refuses a player row with no name in any column', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, { Players: [{ Team: 'Varsity', Number: '9' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();

    expect(upsertPlayerIdentity).not.toHaveBeenCalled();
    expect(w.find('[data-import-result]').text()).toContain('1 refused');
  });

  it('does NOT write a sheet that cannot be imported', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, { MatrixLogs: [{ PlayerName: 'Cesar Alva' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();

    expect(anyWriteCalled()).toBe(false);
  });

  it('COUNTS the rows the database refused', async () => {
    // A refused row otherwise reports as a clean import: the client logs and
    // returns rather than throwing.
    stubXLSX();
    upsertTeamMembership.mockResolvedValue({ ok: false, error: 'refused' });
    const w = mountIE();
    await choose(w, { Players: [{ Team: 'Varsity', FirstName: 'Cesar' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();

    expect(w.find('[data-import-result]').text()).toContain('1 refused');
    expect(w.find('[data-ie-notice]').text()).toMatch(/unchanged/i);
  });

  it('CONSUMES the preview, so a second press cannot double-write', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, { Players: [{ Team: 'Varsity', FirstName: 'Cesar' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-import-apply]').exists()).toBe(false);
  });

  it('tells its parent to re-read afterwards', async () => {
    stubXLSX();
    const w = mountIE();
    await choose(w, { Players: [{ Team: 'Varsity', FirstName: 'Cesar' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();

    expect(w.emitted('imported')).toBeTruthy();
  });

  it('writes a category into the IMPORTING organization, needing no team', async () => {
    // Categories belong to an organization since migration 0027, so an
    // imported one joins the importer's own list rather than everybody's.
    stubXLSX();
    const w = mountIE();
    await choose(w, { SoccerCategories: [{ Name: 'Possession' }] });
    await w.find('[data-import-apply]').trigger('click');
    await flush();

    expect(upsertSoccerCategory).toHaveBeenCalledWith('s1', {
      name: 'Possession', description: undefined
    });
  });
});

describe('THE ORGANIZATION ROW', () => {
  // As `fetchSchool` loads it -- `select *` -- so each applied migration's
  // column is a key on the row, and an unapplied one's is not.
  const SCHOOL = {
    code: 'lfc', name: 'Legends FC', mascot: 'Lions', city: 'Riverside',
    colors: { primary: '#123456', secondary: '#abcdef' },
    record: { wins: 3, losses: 1, draws: 2 },
    logo_url: '/img/legends.png', hero_url: 'https://example.org/pitch.jpg'
  };
  const { logo_url: _l, hero_url: _h, ...UNMIGRATED } = SCHOOL;

  /** The Schools sheet as this modal exports it. */
  function exportSchools(school: any): any[] {
    const written = stubXLSX();
    const w = mountIE({ ...DATA, school });
    w.find('[data-export-one="schools"]').trigger('click');
    w.unmount();
    return written[0].wb.sheets.Schools.rows;
  }

  async function importOnto(school: any, rows: any[]) {
    stubXLSX();
    const w = mountIE({ ...DATA, school });
    await choose(w, { Schools: rows });
    return w;
  }

  async function apply(w: any) {
    await w.find('[data-import-apply]').trigger('click');
    await flush();
  }

  it('KEEPS BOTH ADDRESSES through an export and a re-import', async () => {
    const w = await importOnto({ ...SCHOOL, logo_url: null, hero_url: null }, exportSchools(SCHOOL));
    await apply(w);

    expect(upsertSchool).toHaveBeenCalledWith('lfc', expect.objectContaining({
      logoUrl: '/img/legends.png', heroUrl: 'https://example.org/pitch.jpg'
    }));
  });

  it('shows each address it would change, from and to, before writing anything', async () => {
    const w = await importOnto({ ...SCHOOL, logo_url: null, hero_url: '/img/old.jpg' }, exportSchools(SCHOOL));

    expect(w.find('[data-preview-change="LogoUrl"]').text()).toContain('/img/legends.png');
    const hero = w.find('[data-preview-change="HeroUrl"]').text();
    expect(hero).toContain('/img/old.jpg');
    expect(hero).toContain('https://example.org/pitch.jpg');
    expect(anyWriteCalled()).toBe(false);
  });

  it('LEAVES BOTH KEYS OUT on a database without the columns, and says why', async () => {
    const w = await importOnto(UNMIGRATED, exportSchools(SCHOOL));

    const notes = w.findAll('[data-preview-school-note]').map((n: any) => n.text()).join(' ');
    expect(notes).toContain('0028');
    expect(notes).toContain('0030');

    await apply(w);
    const sent = upsertSchool.mock.calls[0][1];
    expect(sent).not.toHaveProperty('logoUrl');
    expect(sent).not.toHaveProperty('heroUrl');
  });

  it('REFUSES, in the preview, an address the public page would not show', async () => {
    const rows = exportSchools(SCHOOL).map(r => ({ ...r, LogoUrl: 'javascript:alert(1)' }));
    const w = await importOnto(SCHOOL, rows);

    expect(w.find('[data-preview-school-refused]').text()).toMatch(/logo address/i);

    await apply(w);
    expect(upsertSchool).not.toHaveBeenCalled();
    expect(w.find('[data-import-result]').text()).toContain('1 refused');
  });

  it('never writes another organization from a backup of it', async () => {
    const w = await importOnto(SCHOOL, exportSchools({ ...SCHOOL, code: 'rfc' }));
    await apply(w);

    expect(upsertSchool).not.toHaveBeenCalled();
  });

  it('counts a save the database refused as refused', async () => {
    upsertSchool.mockResolvedValue({ data: null, error: 'column "hero_url" does not exist' });
    const w = await importOnto(SCHOOL, exportSchools(SCHOOL));
    await apply(w);

    expect(w.find('[data-import-result]').text()).toContain('1 refused');
  });
});
