/**
 * What the handbook covers.
 *
 * The help is the only place a coach can find out what a screen does without
 * being shown, and it had drifted: lineups, live plus/minus, the season
 * report, the plus/minus import and the directions link had all shipped with
 * no mention anywhere in it.
 *
 * These check the handbook against the features rather than checking its
 * prose. A section can be rewritten freely; what must not happen is a screen
 * existing with nothing in the handbook about it.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import helpSrc from '../../public/js/views/help.view.js?raw';

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
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, helpSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

let app: any;
beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  app = Object.create(ctor.prototype);
  app.data = { players: [], schedule: [], teams: [] };
  app.activeTeamId = 't1';
});

const sections = () => app.helpSections();
const ids = () => sections().map((s: any) => s.id);
const byId = (id: string) => sections().find((s: any) => s.id === id);
/** One section's text, tags stripped, for reading what it actually says. */
const text = (id: string) =>
  String(byId(id).body).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('every screen has a section', () => {
  it.each([
    ['lineup',     'the lineup builder'],
    ['plusminus',  'live plus/minus'],
    ['season',     'the season plus/minus report'],
    ['pmimport',   'importing plus/minus figures'],
    ['directions', 'the directions link on an away fixture']
  ])('covers %s (%s)', (id) => {
    expect(ids()).toContain(id);
    expect(String(byId(id).body).length).toBeGreaterThan(200);
  });

  it('gives every section a unique id, since the index links to them', () => {
    const all = ids();
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives every section a part, a title and an audience', () => {
    for (const s of sections()) {
      expect(s.part, s.id).toBeTruthy();
      expect(s.title, s.id).toBeTruthy();
      expect((s.roles || []).length, s.id).toBeGreaterThan(0);
    }
  });

  it('groups match-day screens together', () => {
    // Sections are ordered by when a coach MEETS them. A lineup, the live
    // screen and the season report are one afternoon's work.
    const matchDay = sections().filter((s: any) => s.part === 'Match day').map((s: any) => s.id);
    expect(matchDay).toEqual(['lineup', 'plusminus', 'season', 'pmimport']);
  });
});

describe('it explains the rules that surprise people', () => {
  /**
   * Each of these was reported as a bug during testing. A rule a coach has to
   * discover by hitting it is a rule the handbook failed to state.
   */
  it('says the clock must be running before plus or minus', () => {
    const t = text('plusminus');
    expect(t).toMatch(/clock/i);
    expect(t).toMatch(/0:00|no minutes|credited/i);
  });

  it('says the pitch holds eleven', () => {
    expect(text('plusminus')).toMatch(/[Ee]leven|11/);
  });

  it('says undo and clear do not erase what was earned', () => {
    expect(text('plusminus')).toMatch(/append-only|never deleted|stop counting/i);
  });

  it('says the season report is per full match, not per 90', () => {
    const t = text('season');
    expect(t).toMatch(/80|full match/);
    expect(t).toMatch(/per 90|professional/i);
  });

  it('explains why short outings are shown rather than hidden', () => {
    // The decision a coach is most likely to think is a bug.
    expect(text('season')).toMatch(/threshold|hide|faint/i);
  });

  it('states the 880 player-minute limit on an import', () => {
    expect(text('pmimport')).toContain('880');
  });

  it('says why there is no goal-differential column', () => {
    expect(text('pmimport')).toMatch(/differential/i);
  });

  it('says a re-import replaces rather than doubles', () => {
    expect(text('pmimport')).toMatch(/replac/i);
  });

  it('says why a fixture without an address gets no directions link', () => {
    const t = text('directions');
    expect(t).toMatch(/address/i);
    expect(t).toMatch(/Redlands|wrong town|guess/i);
  });
});

describe('the paths it tells people to follow', () => {
  it('points at controls that exist', () => {
    // A handbook naming a button nobody can find is worse than silence.
    for (const [id, label] of [
      ['lineup', 'Lineup'],
      ['plusminus', 'Plus/Minus'],
      ['season', 'Season'],
      ['pmimport', 'Plus/Minus Match Stats']
    ] as const) {
      expect(text(id), id).toContain(label);
    }
  });

  it('names the recording number as how a player is identified on import', () => {
    expect(text('pmimport')).toMatch(/recording number/i);
  });
});

describe('who each section is for', () => {
  it('shows the directions section to everyone, not just coaches', () => {
    // A parent driving to an away game is the main reader of that one.
    expect(byId('directions').roles.some((r: any) => r.kind === 'all')).toBe(true);
  });

  it('keeps the tracking screens to coaches', () => {
    for (const id of ['lineup', 'plusminus', 'season']) {
      expect(byId(id).roles.every((r: any) => r.kind !== 'all'), id).toBe(true);
    }
  });
});

describe('the rendered handbook', () => {
  it('renders every section into the page', () => {
    const html = app.renderHelpView();
    for (const s of sections()) {
      expect(html, s.id).toContain(`id="help-${s.id}"`);
    }
  });

  it('renders the new sections with their titles', () => {
    const html = app.renderHelpView();
    expect(html).toContain('Setting a lineup');
    expect(html).toContain('Tracking plus/minus live');
    expect(html).toContain('Season plus/minus');
    expect(html).toContain('Directions to an away game');
  });
});
