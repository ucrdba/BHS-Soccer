/**
 * The planner's Rename control.
 *
 * Executes the real classic script. The properties worth protecting are the
 * ones a source-text check cannot see: that a refusal is shown rather than
 * swallowed, and that the active plan name follows the rename.
 *
 * That second one is subtle and was wrong in the first draft of this code. The
 * handler mutates the local plan object and also has to fix up
 * data.activePlanName -- comparing them AFTER the mutation always matches, so
 * the old name has to be captured first.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import plannerSrc from '../../public/js/views/planner.view.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, plannerSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';

let renameCalls: any[];
let renameResult: any;
let promptAnswer: string | null;

function makeApp(activePlanName = 'Monday Session'): any {
  const app = Object.create(ctor.prototype);
  app.data = {
    activePlanName,
    currentPracticePlan: [],
    savedPlans: [
      { id: 'plan-1', name: 'Monday Session', drills: [{ name: 'Rondo' }] },
      { id: 'plan-2', name: 'Friday Session', drills: [] }
    ]
  };
  app.activeTeamId = TEAM;
  app.saveData = vi.fn();
  app.renderCurrentView = vi.fn();
  app.openLoadPlanModal = vi.fn();
  // The real one lives in utils.js, which is not loaded here. Answer it
  // synchronously with whatever the test wants the coach to have typed.
  app.showPromptModal = ({ onConfirm }: any) => onConfirm(promptAnswer);
  return app;
}

beforeEach(() => {
  renameCalls = [];
  renameResult = { ok: true, slots: 2 };
  promptAnswer = 'Monday High Press';
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    isConfigured: () => true,
    renamePracticePlan: async (...args: any[]) => { renameCalls.push(args); return renameResult; }
  };
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('renaming a plan', () => {
  it('sends the team, the old name and the new one', async () => {
    const app = makeApp();
    await app.renameSavedPlan('plan-1');
    expect(renameCalls[0]).toEqual([TEAM, 'Monday Session', 'Monday High Press']);
  });

  it('updates the plan in the saved list', async () => {
    const app = makeApp();
    await app.renameSavedPlan('plan-1');
    expect(app.data.savedPlans.find((p: any) => p.id === 'plan-1').name).toBe('Monday High Press');
  });

  it('follows the rename in the active plan name', async () => {
    // The timeline header shows activePlanName; leaving it on the old name
    // would make the header disagree with the picker.
    const app = makeApp('Monday Session');
    await app.renameSavedPlan('plan-1');
    expect(app.data.activePlanName).toBe('Monday High Press');
  });

  it('leaves the active plan name alone when a DIFFERENT plan is renamed', async () => {
    // The bug the first draft had: comparing after mutating always matched, so
    // renaming any plan would rewrite the active name.
    const app = makeApp('Friday Session');
    await app.renameSavedPlan('plan-1');
    expect(app.data.activePlanName).toBe('Friday Session');
  });

  it('trims what was typed', async () => {
    promptAnswer = '   Monday High Press   ';
    const app = makeApp();
    await app.renameSavedPlan('plan-1');
    expect(renameCalls[0][2]).toBe('Monday High Press');
  });
});

describe('when nothing should happen', () => {
  it('does not call the service when the name is unchanged', async () => {
    promptAnswer = 'Monday Session';
    await makeApp().renameSavedPlan('plan-1');
    expect(renameCalls).toHaveLength(0);
  });

  it('does not call the service when the box is left empty', async () => {
    promptAnswer = '   ';
    await makeApp().renameSavedPlan('plan-1');
    expect(renameCalls).toHaveLength(0);
  });

  it('refuses without a team rather than writing unscoped', async () => {
    const app = makeApp();
    app.activeTeamId = null;
    await app.renameSavedPlan('plan-1');
    expect(renameCalls).toHaveLength(0);
    expect(window.alert).toHaveBeenCalled();
  });
});

describe('when the database refuses', () => {
  it('shows the reason and does not rename locally', async () => {
    // A collision is the likely refusal, and its message names the plan the
    // coach would have fused with. Swallowing it would leave the list showing
    // a rename that never reached the database.
    renameResult = { ok: false, error: 'This team already has a plan called "Friday Session".' };
    const app = makeApp();
    await app.renameSavedPlan('plan-1');

    expect((window.alert as any).mock.calls[0][0]).toContain('Friday Session');
    expect(app.data.savedPlans.find((p: any) => p.id === 'plan-1').name).toBe('Monday Session');
    expect(app.data.activePlanName).toBe('Monday Session');
  });

  it('treats a null return as a failure rather than a success', async () => {
    renameResult = null;
    const app = makeApp();
    await app.renameSavedPlan('plan-1');
    expect(window.alert).toHaveBeenCalled();
    expect(app.data.savedPlans.find((p: any) => p.id === 'plan-1').name).toBe('Monday Session');
  });
});
