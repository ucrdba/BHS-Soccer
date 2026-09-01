/**
 * Fix-round follow-up to Task 3 (Ruling B): three planner.view.js call sites
 * are explicit, modal-driven "Save" actions with no pre-existing completion
 * alert. Once savePracticePlanItem/upsertPracticePlanItem refuse an unscoped
 * write (because `saveData()` is a documented no-op and Postgres is the only
 * source of truth), a silent `console.warn` on refusal means the drill
 * visibly appears/updates/disappears in the plan, the modal closes as though
 * it worked, and the change silently reverts on the next reload. That is the
 * exact silent-success illusion this task exists to prevent for anything the
 * coach explicitly clicked "Save" on.
 *
 * Same technique as roster-player-crud.test.ts: load the real classic script
 * from public/js rather than reimplementing its logic.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import plannerSrc from '../../public/js/views/planner.view.js?raw';

interface PlannerApp {
  data: { currentPracticePlan: any[] };
  activeTeamId: string | null;
  addPlanDrill(time: string, name: string, duration: string, coachNotes: string): Promise<void>;
  saveEditPlanDrill(index: number, time: string, name: string, duration: string, coachNotes: string): Promise<void>;
  removeDrillDiagram(idx: number): Promise<void>;
  saveData(): void;
  renderCurrentView(): void;
  closeModals(): void;
}

let ctor: any;

beforeAll(() => {
  // Constructor is never invoked (Object.create, not `new`) -- same reasoning
  // as roster-player-crud.test.ts and planner-team-scope.test.ts.
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  const sources = [appCoreSrc, plannerSrc];
  ctor = new Function(sources.map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;')();
});

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';

function makeApp(): PlannerApp {
  const app = Object.create(ctor.prototype) as PlannerApp;
  app.data = { currentPracticePlan: [] };
  app.activeTeamId = TEAM;
  // Own-property overrides: closeModals lives in utils.js, which isn't
  // loaded here -- a pure spy so the drill-save methods under test can be
  // exercised without booting the whole app.
  app.saveData = vi.fn();
  app.renderCurrentView = vi.fn();
  app.closeModals = vi.fn();
  return app;
}

describe('addPlanDrill (explicit modal Save)', () => {
  it('saves with the active team id and does not alert on success', async () => {
    const app = makeApp();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const savePracticePlanItem = vi.fn(async () => ({ id: 'p1' }));
    (window as any).supabaseService = { isConfigured: () => true, savePracticePlanItem };

    await app.addPlanDrill('4:00 PM', 'Dynamic Warmup', '15', 'Sharp');

    expect(savePracticePlanItem).toHaveBeenCalledWith(TEAM, expect.objectContaining({ name: 'Dynamic Warmup' }));
    expect(app.data.currentPracticePlan).toHaveLength(1);
    expect(app.data.currentPracticePlan[0].id).toBe('p1');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('alerts the coach instead of saving silently into nothing when no team is selected', async () => {
    const app = makeApp();
    app.activeTeamId = null;
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const savePracticePlanItem = vi.fn(async () => ({ id: 'p1' }));
    (window as any).supabaseService = { isConfigured: () => true, savePracticePlanItem };

    await app.addPlanDrill('4:00 PM', 'Dynamic Warmup', '15', 'Sharp');

    // Refused before ever reaching the service -- a leftover call would still
    // be refused server-side, but the point is the coach must be told either way.
    expect(savePracticePlanItem).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
    const message = String(alertSpy.mock.calls[0][0]);
    expect(message).toContain('NOT saved to the database');
    expect(message).toContain('no team is selected');
    // The drill still lands on-screen (matches the coach's click)...
    expect(app.data.currentPracticePlan).toHaveLength(1);
    // ...but the modal still closes, since this mirrors savePracticePlan's
    // existing "saved to this screen, not to the database" treatment.
    expect(app.closeModals).toHaveBeenCalled();
  });
});

describe('saveEditPlanDrill (explicit modal Save)', () => {
  function planWithOneDrill(app: PlannerApp) {
    app.data.currentPracticePlan = [{ id: 'p1', time: '4:00 PM', name: 'Old Name', duration: '15 min', coachNotes: '' }];
    return app;
  }

  it('saves with the active team id and does not alert on success', async () => {
    const app = planWithOneDrill(makeApp());
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const upsertPracticePlanItem = vi.fn(async () => ({ id: 'p1' }));
    (window as any).supabaseService = { isConfigured: () => true, upsertPracticePlanItem };

    await app.saveEditPlanDrill(0, '4:15 PM', 'New Name', '20', 'Updated');

    expect(upsertPracticePlanItem).toHaveBeenCalledWith(TEAM, expect.objectContaining({ name: 'New Name' }));
    expect(app.data.currentPracticePlan[0].name).toBe('New Name');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('alerts the coach instead of saving silently into nothing when no team is selected', async () => {
    const app = planWithOneDrill(makeApp());
    app.activeTeamId = null;
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const upsertPracticePlanItem = vi.fn(async () => ({ id: 'p1' }));
    (window as any).supabaseService = { isConfigured: () => true, upsertPracticePlanItem };

    await app.saveEditPlanDrill(0, '4:15 PM', 'New Name', '20', 'Updated');

    expect(upsertPracticePlanItem).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
    const message = String(alertSpy.mock.calls[0][0]);
    expect(message).toContain('NOT saved to the database');
    expect(message).toContain('no team is selected');
    // The edit is still visible on-screen -- it is the reload-revert the
    // coach must be warned about, not the immediate view.
    expect(app.data.currentPracticePlan[0].name).toBe('New Name');
  });
});

describe('removeDrillDiagram (matches coach intent, but must warn about reload revert)', () => {
  function planWithDiagram(app: PlannerApp) {
    app.data.currentPracticePlan = [{ id: 'p1', name: 'Drill', diagramImage: 'data:image/png;base64,xx', diagramData: { a: 1 } }];
    return app;
  }

  it('saves the removal with the active team id and does not alert on success', async () => {
    const app = planWithDiagram(makeApp());
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const upsertPracticePlanItem = vi.fn(async () => ({ id: 'p1' }));
    (window as any).supabaseService = { isConfigured: () => true, upsertPracticePlanItem };

    await app.removeDrillDiagram(0);

    expect(upsertPracticePlanItem).toHaveBeenCalledWith(TEAM, expect.objectContaining({ id: 'p1' }));
    expect(app.data.currentPracticePlan[0].diagramImage).toBeUndefined();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('alerts the coach that the diagram will reappear on reload when no team is selected', async () => {
    const app = planWithDiagram(makeApp());
    app.activeTeamId = null;
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const upsertPracticePlanItem = vi.fn(async () => ({ id: 'p1' }));
    (window as any).supabaseService = { isConfigured: () => true, upsertPracticePlanItem };

    await app.removeDrillDiagram(0);

    expect(upsertPracticePlanItem).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
    const message = String(alertSpy.mock.calls[0][0]);
    expect(message).toContain('NOT saved to the database');
    expect(message).toContain('reappear on reload');
    // The removal is still reflected on-screen, matching the coach's click.
    expect(app.data.currentPracticePlan[0].diagramImage).toBeUndefined();
  });
});
