/**
 * The strip across the top of every page.
 *
 * Reported: "Next Match: BHS Cougars vs Yucaipa Thunderbirds (Aug 12, 6:30
 * PM) is wrong. That game does not exist."
 *
 * It was hand-written markup in index.html. Nothing about it read the
 * schedule, so it named a fixture nobody had entered and would have said the
 * same thing all season — including after the real season finished.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import homeSrc from '../../public/js/views/home.view.js?raw';
import utilsSrc from '../../public/js/utils.js?raw';
import scheduleSrc from '../../public/js/views/schedule.view.js?raw';
import indexHtml from '../../index.html?raw';
import adminSrc from '../../public/js/admin.js?raw';

let ctor: any;

beforeAll(() => {
  const w = globalThis as any;
  w.window = w;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'coach', status: 'active' }),
    getRole: () => 'coach'
  };
  w.can = () => true;
  // utils.js boots the app on DOM ready and reaches for the canvas engine.
  w.SoccerTacticalBoard = function () {};
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, utilsSrc, homeSrc, scheduleSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

/** A fixture a few days out, so "next" is unambiguous. */
const soon = (days: number) => {
  const d = new Date(Date.now() + days * 86400000);
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${M[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
};

function makeApp(schedule: any[] = []): any {
  const app = Object.create(ctor.prototype);
  app.data = {
    schedule, players: [], drillsBank: [],
    teams: [{ id: 't1', school_id: 's1', name: 'Varsity', school_name: 'Beaumont' }],
    schools: [
      { id: 's1', code: 'bhs', name: 'Beaumont High School', kind: 'school',
        city: 'Beaumont, CA', league: 'Citrus Belt League' },
      { id: 's2', code: 'lfc', name: 'Legends FC', kind: 'club',
        city: null, league: null }
    ]
  };
  app.activeTeamId = 't1';
  app.activeTeamLabel = () => ({ org: 'Beaumont', team: 'Varsity', season: '2026' });
  return app;
}

const mount = () => {
  document.body.innerHTML =
    '<span id="topBannerBadge"></span><span id="topBannerNext"></span>'
    + '<span id="topBannerOrg"></span>';
};

const banner = () => document.getElementById('topBannerNext')!.innerHTML;
const badge = () => document.getElementById('topBannerBadge')!.textContent;
const org = () => document.getElementById('topBannerOrg')!.textContent;

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    isConfigured: () => false,
    parseScheduleDate: (v: any) => (v ? String(v).toUpperCase() : null),
    scheduleDayOfWeek: () => 'Tue'
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mount();
});

describe('what the banner says', () => {
  it('does not repeat the badge beside it', () => {
    // The badge to its left already reads NEXT MATCH; the line saying it
    // again reads as a mistake rather than emphasis.
    makeApp([
      { id: 'm1', date: soon(3), time: '4:00 PM', opponent: 'Sultana', isHome: false, status: 'UPCOMING' }
    ]).renderTopBanner();
    expect(badge()).toBe('NEXT MATCH');
    expect(banner()).not.toContain('Next Match');
  });

  it('names the next fixture on the schedule', () => {
    makeApp([
      { id: 'm1', date: soon(3), time: '4:00 PM', opponent: 'Sultana', isHome: false, status: 'UPCOMING' },
      { id: 'm2', date: soon(9), time: '5:00 PM', opponent: 'El Toro', isHome: false, status: 'UPCOMING' }
    ]).renderTopBanner();
    expect(banner()).toContain('Sultana');
    expect(banner()).not.toContain('El Toro');
  });

  it('never names a fixture that is not on the schedule', () => {
    // The reported bug exactly: a hand-written opponent nobody had entered.
    makeApp([
      { id: 'm1', date: soon(3), time: '4:00 PM', opponent: 'Sultana', isHome: false, status: 'UPCOMING' }
    ]).renderTopBanner();
    expect(banner()).not.toContain('Yucaipa Thunderbirds');
  });

  it('skips a match already played', () => {
    makeApp([
      { id: 'm0', date: soon(-5), time: '4:00 PM', opponent: 'Loyola', status: 'COMPLETED' },
      { id: 'm1', date: soon(3), time: '4:00 PM', opponent: 'Sultana', status: 'UPCOMING' }
    ]).renderTopBanner();
    expect(banner()).toContain('Sultana');
    expect(banner()).not.toContain('Loyola');
  });

  it('carries the date and time of that fixture', () => {
    makeApp([
      { id: 'm1', date: soon(3), time: '4:00 PM', opponent: 'Sultana', status: 'UPCOMING' }
    ]).renderTopBanner();
    expect(banner()).toContain('4:00 PM');
  });

  it('says away to, not vs, for an away fixture', () => {
    makeApp([
      { id: 'm1', date: soon(3), time: '4:00 PM', opponent: 'Sultana', isHome: false, status: 'UPCOMING' }
    ]).renderTopBanner();
    expect(banner()).toContain('away to');
  });

  it('says vs for a home fixture', () => {
    makeApp([
      { id: 'm1', date: soon(3), time: '4:00 PM', opponent: 'Loyola', isHome: true, status: 'UPCOMING' }
    ]).renderTopBanner();
    expect(banner()).toContain('vs');
    expect(banner()).not.toContain('away to');
  });
});

describe('whose team it is', () => {
  it('takes the name from the active team, not a hardcoded one', () => {
    // A club coach's banner has to say their club. "BHS Cougars" was written
    // into the page, which is wrong for every other organization using this.
    const app = makeApp([
      { id: 'm1', date: soon(3), time: '4:00 PM', opponent: 'Sultana', status: 'UPCOMING' }
    ]);
    app.activeTeamLabel = () => ({ org: 'Redlands FC', team: 'U16 Boys', season: '2026' });
    app.renderTopBanner();
    expect(banner()).toContain('Redlands FC');
    expect(banner()).toContain('U16 Boys');
    expect(banner()).not.toContain('BHS');
  });
});

describe('when there is no next fixture', () => {
  /**
   * The reason matters. A parent reading the top of the page should not be
   * told the season is over when the fixtures simply have not been entered.
   */
  it('says the schedule is empty when it is', () => {
    makeApp([]).renderTopBanner();
    expect(banner()).toContain('No fixtures');
    expect(badge()).toBe('SCHEDULE');
  });

  it('says the season is complete when every match has been played', () => {
    makeApp([
      { id: 'm1', date: soon(-20), time: '4:00 PM', opponent: 'Sultana', status: 'COMPLETED' }
    ]).renderTopBanner();
    expect(banner()).toContain('Season complete');
  });

  it('does not announce a match when there is none', () => {
    const html = (() => { makeApp([]).renderTopBanner(); return banner(); })();
    expect(html).not.toContain('vs');
    expect(html).not.toContain('away to');
    expect(html).not.toContain('<strong>');
  });
});

describe('the page it is written into', () => {
  it('no longer hardcodes a fixture', () => {
    expect(indexHtml).not.toContain('Yucaipa Thunderbirds</strong>');
    expect(indexHtml).not.toContain('(Aug 12, 6:30 PM)');
  });

  it('leaves the banner for the app to fill in', () => {
    expect(indexHtml).toContain('id="topBannerNext"');
    expect(indexHtml).toContain('id="topBannerBadge"');
  });

  it('is refreshed whenever a view is drawn', () => {
    // The banner sits outside #mainAppContainer, so nothing else redraws it.
    expect(appCoreSrc).toContain('this.renderTopBanner()');
  });
});

describe('escaping', () => {
  it('does not let an opponent name inject markup', () => {
    makeApp([
      { id: 'm1', date: soon(3), time: '4:00 PM', opponent: '<img src=x onerror=1>', status: 'UPCOMING' }
    ]).renderTopBanner();
    expect(banner()).not.toContain('<img');
    expect(banner()).toContain('&lt;img');
  });
});

describe('the right-hand side of the banner', () => {
  /**
   * "Citrus Belt League • Beaumont, CA" was written into index.html, so every
   * club on this site saw a school's competition and a town they do not play
   * in. This database already holds four organizations, two of them clubs.
   */
  const fixture = [
    { id: 'm1', date: soon(3), time: '4:00 PM', opponent: 'Sultana', status: 'UPCOMING' }
  ];

  it("shows the organization's own league and city", () => {
    makeApp(fixture).renderTopBanner();
    expect(org()).toBe('Citrus Belt League • Beaumont, CA');
  });

  it('follows the active team to its own organization', () => {
    // A club team must show the club, not whichever organization happens to
    // be first in the list.
    const app = makeApp(fixture);
    app.data.teams = [{ id: 't1', school_id: 's2', name: 'U16 Boys' }];
    app.data.schools[1] = { ...app.data.schools[1], city: 'Redlands, CA', league: 'SoCal Developmental' };
    app.renderTopBanner();
    expect(org()).toBe('SoCal Developmental • Redlands, CA');
    expect(org()).not.toContain('Citrus Belt');
  });

  it('shows the city alone when no league is named', () => {
    // A club arranging friendlies plays in no competition. It must not show a
    // stray separator with nothing on one side of it.
    const app = makeApp(fixture);
    app.data.schools[0] = { ...app.data.schools[0], league: null };
    app.renderTopBanner();
    expect(org()).toBe('Beaumont, CA');
  });

  it('shows the league alone when no city is set', () => {
    const app = makeApp(fixture);
    app.data.schools[0] = { ...app.data.schools[0], city: null };
    app.renderTopBanner();
    expect(org()).toBe('Citrus Belt League');
  });

  it('shows nothing rather than a bare separator', () => {
    const app = makeApp(fixture);
    app.data.schools[0] = { ...app.data.schools[0], city: null, league: null };
    app.renderTopBanner();
    expect(org()).toBe('');
  });

  it('ignores whitespace masquerading as a value', () => {
    const app = makeApp(fixture);
    app.data.schools[0] = { ...app.data.schools[0], league: '   ' };
    app.renderTopBanner();
    expect(org()).toBe('Beaumont, CA');
  });

  it('is not hardcoded in the page any more', () => {
    expect(indexHtml).not.toContain('Citrus Belt League • Beaumont, CA');
    expect(indexHtml).toContain('id="topBannerOrg"');
  });

  it('offers a place to set the league', () => {
    // Nowhere to type it means it can only ever be whatever a migration set.
    expect(indexHtml).toContain('id="schoolFormLeague"');
  });
});

describe('League everywhere a school can be edited', () => {
  /**
   * A field is only real if every route into the record carries it. There are
   * four here — the school profile form, the Admin Role Control Center, the
   * CSV import, and the CSV export — and a league typed in one place then
   * wiped by a sheet imported from another is worse than never offering it.
   */
  it('is on the Admin Role Control Center', () => {
    expect(adminSrc).toContain('id="adminSchoolLeague"');
  });

  it('is saved by the Admin Role Control Center', () => {
    expect(adminSrc).toContain("getElementById('adminSchoolLeague')");
    const save = adminSrc.slice(adminSrc.indexOf('async saveSchoolDataFromAdmin'),
                               adminSrc.indexOf('async saveSchoolDataFromAdmin') + 1800);
    expect(save).toMatch(/league: league \|\| null/);
  });

  it('is in the schools template', () => {
    const tmpl = adminSrc.slice(adminSrc.indexOf("Code:'bhs', Name:'Beaumont High School'"));
    expect(tmpl.slice(0, 300)).toContain('League:');
  });

  it('is exported, so a sheet can be edited and put back', () => {
    // Exported blank rather than defaulted: a club with no competition must
    // round-trip as having none.
    expect(adminSrc).toContain("League: this.data.schoolInfo?.league || ''");
  });

  it('is imported', () => {
    const imp = adminSrc.slice(adminSrc.indexOf("if (activeTarget === 'schools')"),
                               adminSrc.indexOf("} else if (activeTarget === 'profiles')"));
    expect(imp).toContain('League');
    expect(imp).toContain('this.pickColumn(');
  });

  it('never defaults a league on import', () => {
    // Every other field falls back to Beaumont's. This one must not: handing
    // one school's competition to every club that imports a sheet is the
    // hardcoding this whole change removed.
    const imp = adminSrc.slice(adminSrc.indexOf("if (activeTarget === 'schools')"),
                               adminSrc.indexOf("} else if (activeTarget === 'profiles')"));
    expect(imp).not.toMatch(/league:.*Citrus Belt/);
    expect(imp).toMatch(/league:.*\|\| null/);
  });

  it('accepts the column however a coach spelled it', () => {
    const imp = adminSrc.slice(adminSrc.indexOf("if (activeTarget === 'schools')"),
                               adminSrc.indexOf("} else if (activeTarget === 'profiles')"));
    expect(imp).toContain('Competition');
    expect(imp).toContain('Division');
  });

  it('is on the school profile form too', () => {
    expect(indexHtml).toContain('id="schoolFormLeague"');
  });
});
