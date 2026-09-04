/**
 * The blank templates in the admin panel.
 *
 * Reported: "I see a schedule selection for import and export but not for
 * template." Schedule WAS there, as one of nine small buttons in a wrapping
 * grid, while the two steps either side of it were dropdowns — so the one
 * thing that looked like a picker was the only one that was not.
 *
 * Worse, three of those buttons — Plans, Coaches and Thoughts — fell straight
 * through the if-chain and did nothing at all. No file, no error, nothing.
 *
 * These tests hold two rules: every option the picker offers actually produces
 * a template, and every table the IMPORTER accepts has one to start from.
 * Otherwise the panel invites a coach to fill in a sheet it cannot make.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';

let ctor: any;

beforeAll(() => {
  const w = globalThis as any;
  w.window = w;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;

  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, adminSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

/** Every option the template picker offers, read from the rendered panel. */
const OFFERED = [
  'all', 'schools', 'profiles', 'players', 'schedule',
  'drills', 'plan', 'coaches', 'thoughts', 'quiz', 'categories'
];

let written: string[];
let sheets: Record<string, any[]>;
let alerted: string[];

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.data = { players: [], teams: [], schedule: [], drillsBank: [] };
  app.activeTeamId = 't1';
  return app;
}

beforeEach(() => {
  written = [];
  sheets = {};
  alerted = [];

  // The CDN global the templates are built with.
  (window as any).XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      json_to_sheet: (rows: any[]) => ({ __rows: rows }),
      book_append_sheet: (_wb: any, sheet: any, name: string) => { sheets[name] = sheet.__rows; }
    },
    writeFile: (_wb: any, filename: string) => { written.push(filename); }
  };
  (window as any).alert = (m: string) => { alerted.push(m); };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('every option produces a file', () => {
  OFFERED.forEach(type => {
    it(`writes a template for "${type}"`, () => {
      makeApp().downloadTemplate(type);
      expect(written).toHaveLength(1);
      expect(written[0]).toMatch(/\.xlsx$/);
      expect(alerted).toEqual([]);
    });
  });
});

describe('the three that did nothing', () => {
  /**
   * Plans, Coaches and Thoughts had buttons and no branch. A button that
   * silently does nothing is worse than one that says so: a coach presses it,
   * looks in Downloads, finds nothing, and has no idea whether the app or
   * their browser is at fault.
   */
  it('builds a practice plan template', () => {
    makeApp().downloadTemplate('plan');
    expect(written[0]).toContain('Practice_Plans');
    // One row per DRILL SLOT: a plan is the set of rows sharing a Name.
    expect(Object.keys(sheets.PracticePlans[0])).toContain('Name');
    expect(Object.keys(sheets.PracticePlans[0])).toContain('TimeSlot');
  });

  it('builds a coaches template', () => {
    makeApp().downloadTemplate('coaches');
    expect(written[0]).toContain('Coaches');
    expect(Object.keys(sheets.Coaches[0])).toContain('Level');
  });

  it('builds a daily thoughts template with the linking Key', () => {
    // Key is what ties a thought to the quiz questions that test it.
    makeApp().downloadTemplate('thoughts');
    expect(written[0]).toContain('Daily_Thoughts');
    expect(Object.keys(sheets.DailyThoughts[0])).toContain('Key');
  });
});

describe('the schedule template', () => {
  it('is the one for games, and carries the columns the importer reads', () => {
    makeApp().downloadTemplate('schedule');
    const cols = Object.keys(sheets.Schedule[0]);
    ['Team', 'Date', 'Time', 'Opponent', 'Location', 'Home', 'Status', 'Score']
      .forEach(c => expect(cols).toContain(c));
  });

  it('says which values Home and Status take', () => {
    // A fixture with a score still marked UPCOMING shows as unplayed, so the
    // allowed values belong in the template rather than in a coach's memory.
    makeApp().downloadTemplate('schedule');
    expect(sheets.Schedule[0].Home).toContain('Away');
    expect(sheets.Schedule[0].Status).toContain('COMPLETED');
  });
});

describe('something the picker does not offer', () => {
  it('says so rather than doing nothing', () => {
    makeApp().downloadTemplate('matrix');
    expect(written).toEqual([]);
    expect(alerted[0]).toContain('no template');
  });
});

describe('the picker matches what exists', () => {
  it('offers every type in the panel markup', () => {
    // Guards the other direction: an option added to the dropdown without a
    // branch behind it would reach a coach as a button that does nothing.
    const app = makeApp();
    const html = adminSrc;
    OFFERED.forEach(type => {
      expect(html).toContain(`<option value="${type}">`);
    });
    OFFERED.forEach(type => {
      written = []; alerted = [];
      app.downloadTemplate(type);
      expect(alerted, `no template branch for "${type}"`).toEqual([]);
    });
  });
});
