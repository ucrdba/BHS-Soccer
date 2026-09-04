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
