/**
 * The in-app coach's handbook.
 *
 * Two things matter beyond "it renders". First, help must reach a GUEST: the
 * router bounces guests off matrix, planner and coaches, and adding help to
 * that list would hide the manual from exactly the person most likely to need
 * it. Second, the index is built from the rendered DOM rather than a
 * hand-kept list, so a section added to helpSections() cannot go missing from
 * the contents — that property is worth a test, because the failure would be
 * silent and nobody would notice a missing entry.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import helpSrc from '../../public/js/views/help.view.js?raw';
import indexHtml from '../../index.html?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

interface HelpApp {
  renderHelpView(): string;
  renderHelpSection(s: any): string;
  helpSections(): any[];
  initHelpView(): void;
}

let app: HelpApp;

beforeEach(() => {
  const w = globalThis as any;
  w.auth = {
    isCoach: () => false, isAdmin: () => false, isLoggedIn: () => false,
    canAccessRatings: () => false, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'guest', status: 'active' }),
    getRole: () => 'guest'
  };
  w.can = () => true;
  w.supabaseService = { isConfigured: () => false };

  const ctor = new Function(
    [strip(appCoreSrc), strip(helpSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as { prototype: HelpApp };
  app = Object.create(ctor.prototype) as HelpApp;
});

describe('handbook content', () => {
  it('renders every section it declares', () => {
    const html = app.renderHelpView();
    for (const s of app.helpSections()) {
      expect(html).toContain(`id="help-${s.id}"`);
    }
  });

  it('gives every section a part and a title for the index', () => {
    // initHelpView builds the contents from these attributes. A section
    // missing either would render but be unreachable from the index.
    for (const s of app.helpSections()) {
      expect(s.part, `section ${s.id} has no part`).toBeTruthy();
      expect(s.title, `section ${s.id} has no title`).toBeTruthy();
    }
  });

  it('covers the traps that generate support questions', () => {
    const html = app.renderHelpView().toLowerCase();
    // Each of these cost real confusion during development; the handbook
    // exists largely to answer them without anyone having to ask.
    expect(html).toContain('exercise weights');
    expect(html).toContain('one team per organization');
    expect(html).toContain('no upcoming fixtures');
    expect(html).toContain('scores at <b>1.0</b>'.toLowerCase());
    expect(html).toContain('no coaches assigned');
  });

  it('explains the share calculation, not just the buttons', () => {
    const html = app.renderHelpView();
    expect(html).toContain('earned');
    expect(html).toContain('available');
    // The worked example is the same one migration 0009 asserts against.
    expect(html).toContain('100.0%');
    expect(html).toContain('26.8%');
  });

  it('marks who each section is for', () => {
    const html = app.renderHelpView();
    expect(html).toContain('help-chip-coach');
    expect(html).toContain('help-chip-admin');
    expect(html).toContain('help-chip-all');
  });

  it('renders search and index containers', () => {
    const html = app.renderHelpView();
    expect(html).toContain('id="helpSearch"');
    expect(html).toContain('id="helpToc"');
    expect(html).toContain('id="helpEmpty"');
  });
});

describe('handbook wiring', () => {
  it('is reachable from the main navigation', () => {
    expect(indexHtml).toContain(`app.switchView('help')`);
    expect(indexHtml).toContain('data-view="help"');
  });

  it('loads help.view.js after app.core.js', () => {
    // Script order is load-bearing: Object.assign on the prototype throws if
    // the class does not exist yet, which takes down the whole app.
    const core = indexHtml.indexOf('js/app.core.js');
    const help = indexHtml.indexOf('js/views/help.view.js');
    expect(core).toBeGreaterThan(-1);
    expect(help).toBeGreaterThan(core);
  });

  it('does NOT bounce a guest away from help', () => {
    // The router redirects guests off matrix/planner/coaches. Help must not
    // join that list — a guest is the reader most likely to need it.
    const guard = appCoreSrc.slice(
      appCoreSrc.indexOf('Fallback to Home if guest'),
      appCoreSrc.indexOf('Fallback to Home if guest') + 400
    );
    expect(guard).toContain("'matrix'");
    expect(guard).not.toContain("'help'");
  });

  it('routes the help view and wires it after the HTML lands', () => {
    expect(appCoreSrc).toContain("this.currentView === 'help'");
    expect(appCoreSrc).toContain('renderHelpView()');
    // initHelpView must run on a timeout: the elements it looks up do not
    // exist until innerHTML has been assigned.
    expect(appCoreSrc).toContain('initHelpView()');
  });

  it('survives being initialised when the help view is not showing', () => {
    // renderCurrentView schedules initHelpView on a timeout; a fast view
    // switch can fire it against a DOM that no longer holds the handbook.
    document.body.innerHTML = '<div id="mainAppContainer"></div>';
    expect(() => app.initHelpView()).not.toThrow();
  });
});
