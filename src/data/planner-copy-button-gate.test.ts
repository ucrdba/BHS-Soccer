/// <reference types="vite/client" />
import { describe, it, expect, beforeAll } from 'vitest';
import appCoreSrc from '../../public/js/app.core.js?raw';
import plannerSrc from '../../public/js/views/planner.view.js?raw';

/**
 * "Copy to team…" must not be clickable when there is no plan to copy.
 *
 * renderPlannerView falls back to the string 'Standard Practice Session' when
 * `activePlanName` is unset, and `activePlanName` is set only by Save Practice
 * Plan and Load Plan -- never restored by syncFromSupabase. So after any page
 * reload the heading read "Standard Practice Session" and clicking Copy asked
 * copyPracticePlan (which matches on practice_plans.name) for a plan by that
 * name, which no write path ever stores. The control appeared broken on
 * Varsity, the one team with all 27 backfilled rows.
 *
 * Ruling: gate the control on the active plan actually existing.
 */

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let ctor: any;

beforeAll(() => {
  ctor = new Function(
    [appCoreSrc, plannerSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

function render(overrides: Record<string, any>) {
  const app = Object.create(ctor.prototype) as any;
  app.activeTeamId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  app.data = {
    drillsBank: [], savedPlans: [], currentPracticePlan: [], activePlanName: '',
    ...overrides
  };
  return app.renderPlannerView() as string;
}

/** The copy button's markup, whichever branch produced it. */
const copyButton = (html: string) => {
  const start = html.indexOf('Copy to team');
  expect(start, 'the copy control should always be present in some form').toBeGreaterThan(-1);
  const open = html.lastIndexOf('<button', start);
  return html.slice(open, html.indexOf('</button>', start));
};

const PLAN = {
  id: 'plan_db_standard_90', name: 'Standard 90', date: 'AUG 1, 2026',
  drills: [{ id: 'r1', time: '4:00 PM', name: 'Dynamic Warmup', duration: '15 min' }]
};

describe('the "Copy to team…" control on the planner header', () => {
  it('is disabled, and wired to nothing, when no plan has been loaded', () => {
    const html = render({ savedPlans: [PLAN] });
    const btn = copyButton(html);
    expect(btn).toContain('disabled');
    expect(btn).not.toContain('openCopyToTeam');
  });

  it('never offers to copy the "Standard Practice Session" placeholder', () => {
    // That string is renderPlannerView's own fallback heading; no write path
    // stores it, so copyPracticePlan could only ever refuse it.
    const html = render({ savedPlans: [PLAN] });
    expect(html).not.toContain("openCopyToTeam('plan','Standard Practice Session')");
  });

  it('explains why it is unavailable rather than failing on click', () => {
    const btn = copyButton(render({ savedPlans: [PLAN] }));
    expect(btn).toContain('title=');
    expect(btn.toLowerCase()).toContain('load a saved plan first');
  });

  it('is disabled when activePlanName names a plan that is not in savedPlans', () => {
    // Exactly what a team switch used to leave behind: a name from the
    // previous team, matching nothing on this one.
    const btn = copyButton(render({ savedPlans: [], activePlanName: 'Standard 90' }));
    expect(btn).toContain('disabled');
    expect(btn).not.toContain('openCopyToTeam');
  });

  it('is enabled and passes the real plan name once that plan is loaded', () => {
    const btn = copyButton(render({ savedPlans: [PLAN], activePlanName: 'Standard 90' }));
    expect(btn).not.toContain('disabled');
    expect(btn).toContain("openCopyToTeam('plan','Standard 90')");
  });

  it('escapes an apostrophe in the plan name instead of breaking the handler', () => {
    const named = { ...PLAN, name: "Coach's Warmup" };
    const btn = copyButton(render({ savedPlans: [named], activePlanName: "Coach's Warmup" }));
    expect(btn).toContain("openCopyToTeam('plan','Coach\\'s Warmup')");
  });
});
