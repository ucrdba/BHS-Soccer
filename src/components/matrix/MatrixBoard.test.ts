/**
 * Taking the overall board off the screen.
 *
 * A coach prints this for a squad meeting or hands it to an athletic director,
 * so what leaves must be what was on screen: the same rows, in the order the
 * coach sorted them. Both exits fail in words rather than silently — a blocked
 * pop-up and a CDN that has not answered both look like a dead button.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import MatrixBoard from './MatrixBoard.vue';

const PLAYERS = [
  { id: 'p1', name: 'Oliver Heitritter', recordingNumber: 11,
    matrixStats: { rank: 1, exercises: 6, wins: 4, draws: 1, losses: 1, earned: 12.5, available: 18, share: 69.4 } },
  { id: 'p2', name: 'Tom Budde', recordingNumber: 1,
    matrixStats: { rank: 2, exercises: 5, wins: 2, draws: 0, losses: 3, earned: 8, available: 18, share: 44.4 } }
];

function mountBoard(players: any[] = PLAYERS) {
  return mount(MatrixBoard, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn, stubActions: false,
        initialState: {
          matrix: { players, exercisePoints: [], drillsBank: [], logs: [], exerciseFilter: '' },
          organization: {}
        }
      })]
    }
  });
}

let written: { name: string; rows: any[] } | null;
let printed: string;

beforeEach(() => {
  written = null;
  printed = '';
  vi.restoreAllMocks();
  (window as any).XLSX = {
    utils: {
      book_new: () => ({}),
      json_to_sheet: (rows: any[]) => ({ rows }),
      book_append_sheet: (_wb: any, sheet: any, name: string) => { written = { name, rows: sheet.rows }; }
    },
    writeFile: () => {}
  };
  vi.spyOn(window, 'open').mockImplementation(() => ({
    document: { write: (html: string) => { printed = html; }, close: () => {} },
    focus: () => {}, print: () => {}
  }) as any);
});

describe('taking the board off the screen', () => {
  it('offers Print and Excel while there are rows, and neither when there are none', () => {
    const w = mountBoard();
    expect(w.find('[data-board-print]').exists()).toBe(true);
    expect(w.find('[data-board-excel]').exists()).toBe(true);

    const empty = mountBoard([]);
    expect(empty.find('[data-board-print]').exists()).toBe(false);
    expect(empty.find('[data-board-excel]').exists()).toBe(false);
  });

  it('exports the board columns, in the order on screen', async () => {
    const w = mountBoard();
    await w.find('[data-board-excel]').trigger('click');

    expect(written!.name).toBe('Player ratings');
    expect(written!.rows.map((r: any) => r.Player)).toEqual(['Oliver Heitritter', 'Tom Budde']);
    expect(written!.rows[0]).toMatchObject({ Rank: 1, 'No': 11, Ex: 6, 'W-D-L': '4 - 1 - 1', Pts: '12.50', Share: '69.4%' });
  });

  it('prints a document naming the board', async () => {
    const w = mountBoard();
    await w.find('[data-board-print]').trigger('click');
    expect(printed).toContain('Player ratings');
    expect(printed).toContain('Oliver Heitritter');
  });

  it('says so when the spreadsheet library has not loaded', async () => {
    delete (window as any).XLSX;
    const w = mountBoard();
    await w.find('[data-board-excel]').trigger('click');
    expect(w.find('[data-board-export-error]').text()).toMatch(/spreadsheet library/i);
  });

  it('says so when the print window is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const w = mountBoard();
    await w.find('[data-board-print]').trigger('click');
    expect(w.find('[data-board-export-error]').text()).toMatch(/pop-?up/i);
  });
});

describe('sorting the board', () => {
  it('offers a sort on every column', () => {
    const w = mountBoard();
    const heads = w.findAll('[data-matrix-board] th');
    expect(heads).toHaveLength(8);
    expect(heads.every(h => h.find('[data-board-sort]').exists())).toBe(true);
    expect(heads.map(h => h.find('[data-board-sort]').attributes('data-board-sort')))
      .toEqual(['rank', 'name', 'recordingNumber', 'exercises', 'wdl', 'earned', 'available', 'share']);
  });

  it('sorts on a column that used to be fixed, and exports in that order', async () => {
    // Budde carries No 1 and Heitritter No 11, the reverse of their ranks.
    const w = mountBoard();
    await w.find('[data-board-sort="recordingNumber"]').trigger('click');
    expect(w.findAll('[data-board-player]').map(p => p.text())).toEqual(['Tom Budde', 'Oliver Heitritter']);
    expect(w.find('[data-board-sort="recordingNumber"]').text()).toContain('▲');

    await w.find('[data-board-excel]').trigger('click');
    expect(written!.rows.map((r: any) => r.Player)).toEqual(['Tom Budde', 'Oliver Heitritter']);
  });
});

describe('resetting the sort', () => {
  it('appears once the board is sorted another way, and puts rank order back', async () => {
    const w = mountBoard();
    expect(w.find('[data-board-sort-reset]').exists()).toBe(false);

    await w.find('[data-board-sort="recordingNumber"]').trigger('click');
    expect(w.findAll('[data-board-player]').map(p => p.text())).toEqual(['Tom Budde', 'Oliver Heitritter']);
    await w.find('[data-board-sort-reset]').trigger('click');

    expect(w.findAll('[data-board-player]').map(p => p.text())).toEqual(['Oliver Heitritter', 'Tom Budde']);
    expect(w.find('[data-board-sort-reset]').exists()).toBe(false);
    expect(localStorage.getItem('bhs.sort.v1.board')).toBeNull();
  });

  it('appears for rank reversed too, which is not the starting order', async () => {
    const w = mountBoard();
    await w.find('[data-board-sort="rank"]').trigger('click');
    expect(w.find('[data-board-sort-reset]').exists()).toBe(true);
  });
});
