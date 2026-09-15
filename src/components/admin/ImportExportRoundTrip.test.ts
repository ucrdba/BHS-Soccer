/**
 * A roster export is a backup, so it has to import back.
 *
 * The handbook tells a coach to "export the roster first and edit that file".
 * That advice was a trap while the export read the person's fields off the top
 * of a `fetchTeamRoster` row, where they are not — they are nested under
 * `players` — because every Players row came out with no name and every one was
 * refused on the way back in.
 *
 * So this drives the real section and the real modal together: a roster read
 * in its true nested shape, exported through the Players sheet, handed back to
 * the file input (and so through `planImport`), and applied. Only the database
 * and the spreadsheet library are stubbed.
 *
 * A blank cell is the other half of it. A player with no shirt number or no
 * position exports an empty cell, which the import reads as "not supplied" —
 * `upsertTeamMembership` leaves a value it is not given alone, so re-importing
 * a backup cannot wipe a number the coach set after exporting.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ImportExportSection from './ImportExportSection.vue';

const fetchTeamRoster = vi.fn();
const upsertPlayerIdentity = vi.fn();
const upsertTeamMembership = vi.fn();

vi.mock('../../data/supabase', () => {
  const empty = () => Promise.resolve([]);
  return {
    supabaseService: {
      fetchSchool: () => Promise.resolve(null),
      fetchTeamRoster: (...a: any[]) => fetchTeamRoster(...a),
      fetchSchedule: empty,
      fetchDrillsBank: empty,
      fetchCoaches: empty,
      fetchDailyThoughts: empty,
      fetchTeamQuiz: empty,
      fetchSoccerCategories: empty,
      fetchMatrixLogs: empty,
      upsertPlayerIdentity: (...a: any[]) => upsertPlayerIdentity(...a),
      upsertTeamMembership: (...a: any[]) => upsertTeamMembership(...a)
    }
  };
});

/** Mixed on purpose: set and blank shirt numbers, recording numbers and positions. */
const ROSTER = [
  {
    id: 'm1', team_id: 't1', school_id: 's1',
    number: 9, recording_number: 3, position: 7,
    season_stats: {}, ratings: {}, is_deleted: false,
    players: {
      id: 'p1', name: 'Cesar Alva', first_name: 'Cesar', last_name: 'Alva',
      class_year: 'Senior', height: '5\'10"', photo_url: 'img/cesar.jpg'
    }
  },
  {
    id: 'm2', team_id: 't1', school_id: 's1',
    number: null, recording_number: 12, position: null,
    season_stats: {}, ratings: {}, is_deleted: false,
    players: {
      id: 'p2', name: 'Luis Bustillos Correa', first_name: 'Luis', last_name: 'Bustillos Correa',
      class_year: 'Junior', height: null, photo_url: null
    }
  },
  {
    id: 'm3', team_id: 't1', school_id: 's1',
    number: 1, recording_number: null, position: 1,
    season_stats: {}, ratings: {}, is_deleted: false,
    players: {
      id: 'p3', name: 'Mateo Herrera', first_name: 'Mateo', last_name: 'Herrera',
      class_year: 'Sophomore', height: '6\'1"', photo_url: null
    }
  }
];

const TEAMS = [{ id: 't1', name: 'Varsity', school_id: 's1' }];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

/**
 * A spreadsheet library that keeps what it wrote and reads back what it is
 * given — `sheet_to_json` with `defval: ''` returns blank cells as '', which is
 * exactly what an exported empty cell looks like on the way back in.
 */
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
    writeFile: (wb: any, fileName: string) => { written.push({ wb, fileName }); }
  };
  return written;
}

async function exportThenImport() {
  const written = stubXLSX();
  const w = mount(ImportExportSection, {
    props: {
      isAdmin: true, teamId: 't1', schoolId: 's1', schoolCode: 'lfc',
      teamName: 'Varsity', teams: TEAMS
    },
    attachTo: document.body
  });

  await w.find('[data-ie-open]').trigger('click');
  await flush();
  await w.find('[data-export-one="players"]').trigger('click');
  const exported = written[0].wb.sheets.Players.rows;

  (window as any).XLSX.read = () => ({
    SheetNames: ['Players'], Sheets: { Players: { rows: exported } }
  });
  const input = w.find('[data-import-file]');
  Object.defineProperty(input.element, 'files', {
    value: [{ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }],
    configurable: true
  });
  await input.trigger('change');
  await flush();
  await w.vm.$nextTick();

  await w.find('[data-import-apply]').trigger('click');
  await flush();
  await w.vm.$nextTick();

  return { w, exported };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchTeamRoster.mockResolvedValue(ROSTER);
  upsertPlayerIdentity.mockImplementation((p: any) =>
    Promise.resolve({ id: `id-${p.first_name}` }));
  upsertTeamMembership.mockResolvedValue({ ok: true });
});

describe('A ROSTER EXPORT IMPORTS BACK AS IT LEFT', () => {
  it('exports every player with a name, so no row is refused on the way back', async () => {
    const { w, exported } = await exportThenImport();

    expect(exported.map((r: any) => [r.FirstName, r.LastName])).toEqual([
      ['Cesar', 'Alva'], ['Luis', 'Bustillos Correa'], ['Mateo', 'Herrera']
    ]);
    expect(w.find('[data-import-result]').text()).toBe('3 written, 0 refused.');
  });

  it('writes each person back with their name, class, height and photo', async () => {
    await exportThenImport();

    expect(upsertPlayerIdentity).toHaveBeenCalledTimes(3);
    expect(upsertPlayerIdentity.mock.calls.map(c => c[0])).toEqual([
      expect.objectContaining({
        name: 'Cesar Alva', first_name: 'Cesar', last_name: 'Alva',
        class_year: 'Senior', height: '5\'10"', photo_url: 'img/cesar.jpg'
      }),
      expect.objectContaining({
        name: 'Luis Bustillos Correa', first_name: 'Luis', last_name: 'Bustillos Correa',
        class_year: 'Junior'
      }),
      expect.objectContaining({
        name: 'Mateo Herrera', first_name: 'Mateo', last_name: 'Herrera',
        class_year: 'Sophomore', height: '6\'1"'
      })
    ]);
  });

  it('puts each person back on the same team with the numbers and position they left with', async () => {
    await exportThenImport();

    // Cells come back as text, except the position, which parsePositionCell
    // reads back into the number 1-11 that team_players.position stores.
    expect(upsertTeamMembership.mock.calls).toEqual([
      ['t1', 's1', { player_id: 'id-Cesar', number: '9', recording_number: '3', position: 7 }],
      ['t1', 's1', { player_id: 'id-Luis', number: undefined, recording_number: '12', position: undefined }],
      ['t1', 's1', { player_id: 'id-Mateo', number: '1', recording_number: undefined, position: 1 }]
    ]);
  });

  it('sends a BLANK number or position as not supplied, so the stored value is left alone', async () => {
    // `upsertTeamMembership` writes a column only when it is not undefined. An
    // empty string or a null here would clear a number set since the export.
    await exportThenImport();

    const luis = upsertTeamMembership.mock.calls[1][2];
    expect(luis.number).toBeUndefined();
    expect(luis.position).toBeUndefined();
    const mateo = upsertTeamMembership.mock.calls[2][2];
    expect(mateo.recording_number).toBeUndefined();
  });
});
