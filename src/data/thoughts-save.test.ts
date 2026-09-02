/**
 * Fix-round follow-up to Task 4: submitThoughtForm and setActiveThought
 * gained real dbSaved-gating logic when their Supabase calls were moved to
 * pass this.activeTeamId instead of the literal 'bhs'. The tests written
 * alongside that move (planner-team-scope.test.ts, "the daily-thoughts
 * move") only assert against the source text -- they never execute either
 * method, so an inverted `if (this.activeTeamId)`, a dbSaved flag that never
 * gets set, or wrong alert wording would pass every test in the suite.
 *
 * Same technique as planner-drill-save.test.ts (Task 3's equivalent
 * follow-up): load the real classic script from public/js rather than
 * reimplementing its logic, and assert the actual outcome -- the service
 * called with the right team vs. not called at all, and the alert's content.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import thoughtsSrc from '../../public/js/views/thoughts.view.js?raw';

interface ThoughtsApp {
  data: { dailyThoughts: any[] };
  activeTeamId: string | null;
  submitThoughtForm(): Promise<void>;
  setActiveThought(thoughtId: string): Promise<void>;
  saveData(): void;
  renderThoughtsList(): void;
  renderCurrentView(): void;
}

let ctor: any;

beforeAll(() => {
  // Constructor is never invoked (Object.create, not `new`) -- same reasoning
  // as planner-drill-save.test.ts and planner-team-scope.test.ts.
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  const sources = [appCoreSrc, thoughtsSrc];
  ctor = new Function(sources.map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;')();
});

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';

function setupThoughtFormDom() {
  document.body.innerHTML = `
    <input id="thoughtEditId" value="" />
    <input id="thoughtCoachNameInput" value="Coach B" />
    <input id="thoughtTitleInput" value="" />
    <textarea id="thoughtTextInput">Press high today.</textarea>
    <input id="thoughtIsActiveInput" type="checkbox" checked />
    <div id="editThoughtFormModal" class="active"></div>
  `;
}

function makeApp(): ThoughtsApp {
  const app = Object.create(ctor.prototype) as ThoughtsApp;
  app.data = { dailyThoughts: [] };
  app.activeTeamId = TEAM;
  // Own-property overrides: saveData/renderThoughtsList/renderCurrentView
  // pull in the rest of the app (localStorage, template rendering) that
  // isn't loaded here -- pure spies so the methods under test can be
  // exercised in isolation, same as makeApp() in planner-drill-save.test.ts.
  app.saveData = vi.fn();
  app.renderThoughtsList = vi.fn();
  app.renderCurrentView = vi.fn();
  (window as any).auth = { getCurrentUser: () => ({ id: 'u1', name: 'Coach B' }) };
  return app;
}

describe('submitThoughtForm (explicit modal Save)', () => {
  beforeEach(() => setupThoughtFormDom());

  it('saves with the active team id, sets it active, and does not warn the coach', async () => {
    const app = makeApp();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const upsertDailyThought = vi.fn(async () => ({ data: { id: 'dt_1' } }));
    const setActiveDailyThought = vi.fn(async () => {});
    (window as any).supabaseService = { isConfigured: () => true, upsertDailyThought, setActiveDailyThought };

    await app.submitThoughtForm();

    expect(upsertDailyThought).toHaveBeenCalledWith(TEAM, expect.objectContaining({ text: 'Press high today.', isActive: true }));
    expect(setActiveDailyThought).toHaveBeenCalledWith(TEAM, 'dt_1');
    expect(app.data.dailyThoughts).toHaveLength(1);
    expect(app.data.dailyThoughts[0].id).toBe('dt_1');

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const message = String(alertSpy.mock.calls[0][0]);
    expect(message).not.toContain('no team is selected');
    expect(message).toContain('successfully');
  });

  it('alerts the coach instead of saving silently into nothing when no team is selected', async () => {
    const app = makeApp();
    app.activeTeamId = null;
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const upsertDailyThought = vi.fn(async () => ({ data: { id: 'dt_1' } }));
    const setActiveDailyThought = vi.fn(async () => {});
    (window as any).supabaseService = { isConfigured: () => true, upsertDailyThought, setActiveDailyThought };

    await app.submitThoughtForm();

    // Refused before ever reaching the service -- a leftover call would still
    // be refused server-side, but the point is the coach must be told either way.
    expect(upsertDailyThought).not.toHaveBeenCalled();
    expect(setActiveDailyThought).not.toHaveBeenCalled();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const message = String(alertSpy.mock.calls[0][0]);
    expect(message).toContain('NOT saved to the database');
    expect(message).toContain('no team is selected');
    expect(message).toContain('disappear on reload');

    // The thought still lands on-screen (matches the coach's click)...
    expect(app.data.dailyThoughts).toHaveLength(1);
    expect(app.data.dailyThoughts[0].text).toBe('Press high today.');
  });
});

describe('setActiveThought (explicit "Set Active" click)', () => {
  function twoThoughts(app: ThoughtsApp) {
    app.data.dailyThoughts = [
      { id: 't1', isActive: false },
      { id: 't2', isActive: true }
    ];
    return app;
  }

  it('saves with the active team id and does not warn the coach', async () => {
    const app = twoThoughts(makeApp());
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const setActiveDailyThought = vi.fn(async () => {});
    (window as any).supabaseService = { isConfigured: () => true, setActiveDailyThought };

    await app.setActiveThought('t1');

    expect(setActiveDailyThought).toHaveBeenCalledWith(TEAM, 't1');
    expect(app.data.dailyThoughts.find(t => t.id === 't1')!.isActive).toBe(true);
    expect(app.data.dailyThoughts.find(t => t.id === 't2')!.isActive).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('alerts the coach instead of saving silently into nothing when no team is selected', async () => {
    const app = twoThoughts(makeApp());
    app.activeTeamId = null;
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const setActiveDailyThought = vi.fn(async () => {});
    (window as any).supabaseService = { isConfigured: () => true, setActiveDailyThought };

    await app.setActiveThought('t1');

    expect(setActiveDailyThought).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const message = String(alertSpy.mock.calls[0][0]);
    expect(message).toContain('NOT saved to the database');
    expect(message).toContain('no team is selected');
    expect(message).toContain('revert on reload');

    // The change is still reflected on-screen -- it is the reload-revert the
    // coach must be warned about, not the immediate view.
    expect(app.data.dailyThoughts.find(t => t.id === 't1')!.isActive).toBe(true);
  });
});
