/**
 * Regression tests for the spreadsheet-import merge helpers.
 *
 * These helpers live on BHSSoccerApp.prototype in `public/js/app.core.js`, a
 * classic script that is never imported as a module — which is why they had no
 * coverage at all until a whole-branch review pointed out that the most
 * data-destructive code in the app was also the least verified.
 *
 * The obvious way to test them would be to lift the logic into `src/`. We
 * deliberately do NOT do that: this repo's defining hazard is the same app
 * existing in parallel copies (see CLAUDE.md), and a second copy of the import
 * merge — the one function that can silently destroy a roster — is exactly the
 * copy you least want to let drift.
 *
 * So we load the real file instead. `vm.runInContext` evaluates the actual
 * shipped source and hands back the actual prototype. If someone edits
 * app.core.js, these tests exercise that edit. There is nothing to keep in sync.
 *
 * Each case below is a scenario that reached production or was caught in review:
 * duplicated rows, wiped jersey numbers, ratings reset to 80, away fixtures
 * flipped to home, and games-played deleted by a partial sheet.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll } from 'vitest';
// Vite's ?raw suffix hands us the file's text at build time, so this needs no
// filesystem access and no @types/node in a tsconfig that does not include it.
import appCoreSource from '../../public/js/app.core.js?raw';

interface UpsertResult<T> {
  toPersist: T[];
  updated: number;
  inserted: number;
}

interface ImportHelpers {
  upsertByName<T>(collection: T[], incoming: unknown[], defaults?: object): UpsertResult<T>;
  upsertByDateTime<T>(collection: T[], incoming: unknown[], defaults?: object): UpsertResult<T>;
}

let app: ImportHelpers;

beforeAll(() => {
  let src = appCoreSource;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // strip BOM

  // `new Function` rather than node's vm: it keeps this test free of node
  // builtins, and it evaluates the script against vitest's real jsdom globals
  // instead of hand-rolled stubs, so the file loads the way a browser loads it.
  // A `class` declaration is lexically scoped to the script and never lands on
  // the global object, so return it explicitly.
  const ctor = new Function(`${src}
return BHSSoccerApp;`)() as { prototype: ImportHelpers };

  if (!ctor?.prototype?.upsertByName) {
    throw new Error('Could not reach the import helpers on BHSSoccerApp.prototype');
  }
  // Object.create rather than `new`: the constructor wants a live DOM and these
  // helpers touch no instance state.
  app = Object.create(ctor.prototype) as ImportHelpers;
});

const storedPlayer = () => ({
  id: 'uuid-1',
  name: 'John Smith',
  number: 7,
  position: 'Forward',
  classYear: 'Senior',
  height: `6'1"`,
  photo: 'https://example.test/john.jpg',
  ratings: { technical: 91, tactical: 88, physical: 85, mental: 90 },
  seasonStats: { goals: 5, assists: 2, games: 12 }
});

const playerDefaults = {
  number: 0,
  position: 'Midfielder',
  classYear: 'Junior',
  height: `5'10"`,
  ratings: { technical: 80, tactical: 80, physical: 80, mental: 80 },
  seasonStats: { goals: 0, assists: 0, games: 1 },
  isDeleted: false
};

/** A sheet carrying only Name and Goals: every other field arrives undefined. */
const nameAndGoalsRow = (goals: number) => ({
  id: 'p_generated',
  name: 'john smith', // deliberately different casing — matching is case-insensitive
  number: undefined,
  position: undefined,
  classYear: undefined,
  height: undefined,
  photo: undefined,
  ratings: undefined,
  seasonStats: { goals },
  isDeleted: undefined
});

describe('upsertByName — a partial sheet must not clobber a stored player', () => {
  it('matches case-insensitively and updates rather than inserting', () => {
    const players = [storedPlayer()];
    const res = app.upsertByName(players, [nameAndGoalsRow(3)], playerDefaults);

    expect(res.updated).toBe(1);
    expect(res.inserted).toBe(0);
    expect(players).toHaveLength(1);
  });

  it('keeps the existing id, which is what makes the write an update', () => {
    const players = [storedPlayer()];
    app.upsertByName(players, [nameAndGoalsRow(3)], playerDefaults);
    // A locally-generated "p_…" id would make the Supabase helper insert a
    // duplicate instead of updating — the 34-duplicate-row incident.
    expect(players[0].id).toBe('uuid-1');
  });

  it('preserves every field the sheet did not supply', () => {
    const players = [storedPlayer()];
    app.upsertByName(players, [nameAndGoalsRow(3)], playerDefaults);

    expect(players[0].number).toBe(7); // parseInt(undefined)||0 used to write 0
    expect(players[0].position).toBe('Forward');
    expect(players[0].classYear).toBe('Senior');
    expect(players[0].height).toBe(`6'1"`);
    expect(players[0].photo).toBe('https://example.test/john.jpg');
  });

  it('does not reset ratings to the 80/80/80/80 default', () => {
    const players = [storedPlayer()];
    app.upsertByName(players, [nameAndGoalsRow(3)], playerDefaults);
    expect(players[0].ratings).toEqual({ technical: 91, tactical: 88, physical: 85, mental: 90 });
  });

  it('merges seasonStats key-by-key, so assists and games survive', () => {
    const players = [storedPlayer()];
    app.upsertByName(players, [nameAndGoalsRow(3)], playerDefaults);
    // Wholesale assignment would leave {goals: 3} — zeroing assists and
    // deleting games-played on every import that mentions any stat.
    expect(players[0].seasonStats).toEqual({ goals: 3, assists: 2, games: 12 });
  });

  it('applies defaults to a genuinely new player', () => {
    const players: any[] = [];
    const res = app.upsertByName(players, [{ name: 'New Kid' }], playerDefaults);

    expect(res.inserted).toBe(1);
    expect(players[0].position).toBe('Midfielder');
    expect(players[0].seasonStats).toEqual({ goals: 0, assists: 0, games: 1 });
  });

  it('gives each inserted record its own copy of the object defaults', () => {
    const players: any[] = [];
    app.upsertByName(players, [{ name: 'A' }, { name: 'B' }], playerDefaults);

    players[0].ratings.technical = 1;
    // A shared reference would change B too — a bug that reads as haunted.
    expect(players[1].ratings.technical).toBe(80);
    expect(playerDefaults.ratings.technical).toBe(80);
  });
});

describe('upsertByDateTime — schedule rows keyed on date + time', () => {
  const stored = () => [
    { id: 'uuid-m', date: 'AUG 14, 2026', time: '6:30 PM', opponent: 'Vista Murietta', status: 'COMPLETED', isHome: true },
    { id: 'uuid-a', date: 'AUG 21, 2026', time: '5:00 PM', opponent: 'Citrus Valley', status: 'UPCOMING', isHome: false }
  ];
  const scheduleDefaults = { location: 'Home - Cougar Stadium', isHome: true, status: 'UPCOMING' };

  it('updates a fixture the sheet carries a matching time for', () => {
    const schedule = stored();
    const res = app.upsertByDateTime(schedule, [
      { id: 'm_gen', date: 'AUG 14, 2026', time: '6:30 PM', opponent: 'Vista Murietta', status: undefined, isHome: undefined }
    ], scheduleDefaults);

    expect(res.updated).toBe(1);
    expect(schedule).toHaveLength(2); // no duplicate
  });

  it('does not reset a COMPLETED fixture to UPCOMING', () => {
    const schedule = stored();
    app.upsertByDateTime(schedule, [
      { id: 'm_gen', date: 'AUG 14, 2026', time: '6:30 PM', opponent: 'Vista Murietta', status: undefined }
    ], scheduleDefaults);
    expect(schedule[0].status).toBe('COMPLETED');
  });

  it('does not flip an away fixture to home when the sheet omits the column', () => {
    const schedule = stored();
    app.upsertByDateTime(schedule, [
      { id: 'm_gen', date: 'AUG 21, 2026', time: '5:00 PM', opponent: 'Citrus Valley', isHome: undefined }
    ], scheduleDefaults);
    // `toStr(r.Home).toLowerCase() !== 'away'` evaluated to true for an absent
    // column, silently flipping every away fixture.
    expect(schedule[1].isHome).toBe(false);
  });

  it('keeps blank-key rows separate instead of merging them together', () => {
    const schedule: any[] = [];
    const res = app.upsertByDateTime(schedule, [
      { date: '', time: '', opponent: 'TBD One' },
      { date: '', time: '', opponent: 'TBD Two' }
    ], scheduleDefaults);

    // Indexing a blank key made every later blank-key row merge into the first,
    // collapsing a set of TBD fixtures into one, last-opponent-wins.
    expect(res.inserted).toBe(2);
    expect(schedule).toHaveLength(2);
    expect(schedule.map((m) => m.opponent)).toEqual(['TBD One', 'TBD Two']);
  });
});
