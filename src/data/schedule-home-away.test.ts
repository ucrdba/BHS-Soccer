/**
 * Home, away, and the venue — what the importer may and may not assume.
 *
 * Reported: "All games are being displayed as home games."
 *
 * The data was right. The badges were right. But the importer's defaults said
 * `location: 'Home - Cougar Stadium', isHome: true`, so a sheet with no
 * Location column gave every fixture a home venue — nineteen cards reading
 * "Home - Cougar Stadium" while eleven of them were away games. The badge said
 * AWAY and the line under it said Home, which reads as the badge being wrong.
 *
 * The rule this pins down: a default may fill in what does not matter. It must
 * never assert a FACT about the fixture that the sheet never stated.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';
import scheduleSrc from '../../public/js/views/schedule.view.js?raw';

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
    [appCoreSrc, adminSrc, scheduleSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

function makeApp(schedule: any[] = []): any {
  const app = Object.create(ctor.prototype);
  app.data = {
    schedule, players: [], drillsBank: [],
    teams: [{ id: 't1', school_id: 's1', name: 'Varsity', school_name: 'Beaumont' }]
  };
  app.activeTeamId = 't1';
  app.activeTeamLabel = () => ({ org: 'Beaumont', team: 'Varsity', season: '2026' });
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    isConfigured: () => false,
    parseScheduleDate: (v: any) => (v ? String(v).toUpperCase() : null),
    scheduleDayOfWeek: () => 'Tue'
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/** Render the schedule and read one fixture's card. */
function card(match: any): string {
  const app = makeApp([match]);
  document.body.innerHTML = app.renderScheduleView();
  return document.body.innerHTML;
}

describe('the venue', () => {
  it('shows a venue the sheet gave', () => {
    expect(card({ id: 'm1', date: 'DEC 8 2026', time: '4:00 PM', opponent: 'Redlands',
                  location: 'Away - Redlands HS', isHome: false }))
      .toContain('Away - Redlands HS');
  });

  it('shows NO venue line when none was recorded', () => {
    // Rather than a stadium nobody stated. An invented venue on an away
    // fixture is worse than a blank one: it contradicts the badge beside it.
    const html = card({ id: 'm1', date: 'DEC 8 2026', time: '4:00 PM',
                        opponent: 'Redlands', location: '', isHome: false });
    expect(html).not.toContain('Cougar Stadium');
    expect(html).not.toContain('📍');
  });
});

describe('the home and away badge', () => {
  const at = (over: any) => card({
    id: 'm1', date: 'DEC 8 2026', time: '4:00 PM', opponent: 'Redlands', location: '', ...over
  });

  it('says HOME for a home fixture', () => {
    expect(at({ isHome: true })).toContain('HOME');
  });

  it('says AWAY for an away fixture', () => {
    const html = at({ isHome: false });
    expect(html).toContain('AWAY');
    expect(html).not.toContain('HOME');
  });

  it('says neither when it was never recorded', () => {
    // null is "not stated", which is different from away. Showing AWAY would
    // be the same mistake in the other direction.
    const html = at({ isHome: null });
    expect(html).not.toContain('HOME');
    expect(html).not.toContain('AWAY');
  });
});

describe('what the importer defaults', () => {
  /**
   * Read from the source rather than executed, because the defaults object is
   * a local inside a long import routine. What matters is that neither value
   * asserts anything about the fixture.
   */
  it('does not invent a venue', () => {
    expect(adminSrc).not.toContain("location: 'Home - Cougar Stadium', isHome: true");
    expect(adminSrc).toContain("location: '', isHome: null");
  });

  it('does not assume a fixture is at home', () => {
    const defaults = adminSrc.slice(
      adminSrc.indexOf('const scheduleDefaults'),
      adminSrc.indexOf('const scheduleDefaults') + 220);
    expect(defaults).not.toMatch(/isHome:\s*true/);
  });
});

describe('reading home or away from the sheet', () => {
  /**
   * The Home column decides. Failing that, a Location written "Home - ..." or
   * "Away - ..." says the same thing — which is exactly how the EXPORT writes
   * it, so an exported sheet edited and re-imported keeps its home and away
   * even without a Home column.
   */
  const readHome = (row: any): boolean | undefined => {
    const opt = (v: any) => (v === undefined || v === null || String(v).trim() === '' ? undefined : v);
    const h = opt(row.Home);
    if (h !== undefined) return String(h).trim().toLowerCase() !== 'away';
    const loc = String(opt(row.Location) ?? '').trim().toLowerCase();
    if (loc.startsWith('home')) return true;
    if (loc.startsWith('away')) return false;
    return undefined;
  };

  it('takes "Away" from the Home column', () => {
    expect(readHome({ Home: 'Away' })).toBe(false);
  });

  it('takes "Home" from the Home column', () => {
    expect(readHome({ Home: 'Home' })).toBe(true);
  });

  it('ignores case and stray spaces', () => {
    expect(readHome({ Home: '  AWAY ' })).toBe(false);
  });

  it('falls back to a Location that names the side', () => {
    expect(readHome({ Location: 'Away - Redlands HS' })).toBe(false);
    expect(readHome({ Location: 'Home - Cougar Stadium' })).toBe(true);
  });

  it('prefers the Home column over the Location', () => {
    // If the two disagree, the column that exists to answer this wins.
    expect(readHome({ Home: 'Away', Location: 'Home - Cougar Stadium' })).toBe(false);
  });

  it('gives nothing when neither says', () => {
    // Which is what lets the fixture record "not stated" instead of "home".
    expect(readHome({})).toBeUndefined();
    expect(readHome({ Location: 'Cougar Stadium' })).toBeUndefined();
  });
});

describe('what fills the venue', () => {
  /**
   * The rule the coach set: the Home column says home or away. The Location
   * says WHERE — and when it is blank the opponent stands in, because the
   * opponent is something the sheet actually states.
   *
   * That is the difference from what this replaced: "Home - Cougar Stadium" on
   * every fixture was invented, and contradicted the badge beside it. An
   * opponent name is never invented.
   */
  const opt = (v) => (v === undefined || v === null || String(v).trim() === '' ? undefined : v);
  const venue = (row) => opt(row.Location) ?? opt(row.Opponent);

  it('uses the venue the coach wrote', () => {
    expect(venue({ Location: 'Cougar Stadium', Opponent: 'Redlands' })).toBe('Cougar Stadium');
  });

  it('falls back to the opponent when the venue is blank', () => {
    expect(venue({ Location: '', Opponent: 'Redlands' })).toBe('Redlands');
  });

  it('falls back when the column is missing entirely', () => {
    expect(venue({ Opponent: 'Redlands' })).toBe('Redlands');
  });

  it('treats a cell of spaces as blank', () => {
    expect(venue({ Location: '   ', Opponent: 'Redlands' })).toBe('Redlands');
  });

  it('gives nothing when neither is stated', () => {
    // A fixture with no opponent is not imported at all, so this is the
    // boundary rather than a case that reaches a card.
    expect(venue({})).toBeUndefined();
  });
});

describe('home or away, once the opponent can fill the venue', () => {
  /**
   * The Home column decides. The Location fallback reads what the COACH wrote,
   * never the opponent standing in for a blank one — an opponent name says
   * nothing about which ground the fixture is played on, and reading it as a
   * venue prefix would start guessing again.
   */
  const opt = (v) => (v === undefined || v === null || String(v).trim() === '' ? undefined : v);
  const readHome = (row) => {
    const h = opt(row.Home);
    if (h !== undefined) return String(h).trim().toLowerCase() !== 'away';
    const written = String(opt(row.Location) ?? '').trim().toLowerCase();
    if (written.startsWith('home')) return true;
    if (written.startsWith('away')) return false;
    return undefined;
  };

  it('takes home and away from the Home column', () => {
    expect(readHome({ Home: 'Home', Opponent: 'Redlands' })).toBe(true);
    expect(readHome({ Home: 'Away', Opponent: 'Redlands' })).toBe(false);
  });

  it('still reads an exported venue when there is no Home column', () => {
    expect(readHome({ Location: 'Away - Redlands HS' })).toBe(false);
  });

  it('does not read the opponent as a venue prefix', () => {
    // "Homestead High" starts with "Home" and is an OPPONENT, not a venue.
    // Reading the resolved venue rather than the written one would call an
    // away fixture at Homestead a home game.
    expect(readHome({ Location: '', Opponent: 'Homestead High' })).toBeUndefined();
  });

  it('leaves it unstated when nothing says', () => {
    expect(readHome({ Opponent: 'Redlands' })).toBeUndefined();
  });
});

describe('the mapping admin.js actually ships', () => {
  /**
   * The five cases above exercise the RULE. These two read the shipped source,
   * because the rule lives inside a 200-line import routine that cannot be
   * called in isolation — so without these, the rule could be right and the
   * importer could still do something else entirely.
   */

  /** The schedule row mapping, from `date:` to the end of that object. */
  const mapping = (() => {
    const i = adminSrc.indexOf('date: window.supabaseService.parseScheduleDate');
    return adminSrc.slice(i, adminSrc.indexOf('};', i));
  })();

  it('falls the venue back to the opponent', () => {
    expect(mapping).toContain('location: opt(r.Location) ?? opt(r.Opponent)');
  });

  it('reads home and away from the written Location, not the resolved venue', () => {
    // The isHome fallback must look at r.Location. If it were refactored to
    // read the resolved venue, an away fixture against "Homestead High" would
    // import as a home game.
    const isHome = mapping.slice(mapping.indexOf('isHome:'));
    expect(isHome).toContain("String(opt(r.Location) ?? '')");
    expect(isHome).not.toContain('opt(r.Opponent)');
  });
});

describe("the opponent line", () => {
  /**
   * The card already sits under "SCHEDULE & GAME RESULTS", beside a HOME or
   * AWAY badge, in a column of fixtures. "vs" in front of the opponent adds
   * nothing a reader does not already have — the row IS a fixture against
   * someone.
   */
  it("names the opponent without a redundant vs", () => {
    const html = card({ id: "m1", date: "DEC 8 2026", time: "4:00 PM",
                        opponent: "Redlands", location: "", isHome: false });
    expect(html).toContain("Redlands");
    expect(html).not.toContain("vs Redlands");
  });

  it("keeps vs where it reads as a sentence", () => {
    // Confirmations and delete prompts are prose, not a column heading:
    // "delete the match vs Redlands" needs the word.
    expect(scheduleSrc).toContain("delete the match vs");
  });
});

describe("the column titles", () => {
  /**
   * A fixture card is four values in a row with no headings: a date, a name, a
   * venue, a badge. The name and the venue are both bare text, so which is
   * which is guesswork on a fixture where the venue IS an opponent name —
   * now the common case, since a blank Location falls back to the opponent.
   *
   * ONE header row above the list, not a label on every card. Its cells carry
   * the card's own widths so each title sits over the column it names.
   */
  const fixture = { id: "m1", date: "DEC 8 2026", time: "4:00 PM",
                    opponent: "Redlands", location: "Cougar Stadium", isHome: true };

  const twoFixtures = () => {
    const app = makeApp([fixture, { ...fixture, id: "m2", opponent: "Yucaipa" }]);
    document.body.innerHTML = app.renderScheduleView();
    return document.body.innerHTML;
  };

  it("titles Date, Opponent and Location", () => {
    const html = card(fixture);
    expect(html).toContain(">Date<");
    expect(html).toContain(">Opponent<");
    expect(html).toContain(">Location<");
  });

  it("prints each title ONCE, however many fixtures there are", () => {
    // The point of the change: titles at the top, not repeated down the list.
    const html = twoFixtures();
    expect(html).toContain("Yucaipa");
    for (const title of [">Date<", ">Opponent<", ">Location<"]) {
      expect(html.split(title).length - 1).toBe(1);
    }
  });

  it("puts them above the fixtures, not inside one", () => {
    const html = card(fixture);
    expect(html.indexOf("schedule-head")).toBeGreaterThan(-1);
    expect(html.indexOf("schedule-head")).toBeLessThan(html.indexOf("schedule-card"));
  });

  it("still shows the location column when a fixture has none", () => {
    // The cell holds an em-dash rather than collapsing, so the column below
    // "Location" keeps its width and the row stays aligned.
    const html = card({ ...fixture, location: "" });
    expect(html).toContain(">Location<");
    expect(html).not.toContain("📍");
  });

  it("leaves the header's layout to the stylesheet", () => {
    // An inline display:flex would outrank the media query that hides this row
    // where the card stacks, and the titles would sit over nothing on a phone.
    expect(scheduleSrc).toContain('<div class="schedule-head">');
    expect(scheduleSrc).not.toMatch(/schedule-head"[^>]*style=/);
  });
});
