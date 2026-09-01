/**
 * The drill-category editor's admin-panel surface.
 *
 * These execute the real classic script rather than matching its source text.
 * The properties worth protecting are all behavioural: that a refusal reaches
 * the coach as visible words instead of a console line (the failure mode this
 * whole editor was built to undo), that a rename carries the drills with it,
 * and that categories a drill uses but nobody defined are actually surfaced.
 *
 * Same harness as thoughts-save.test.ts and planner-drill-save.test.ts: load
 * public/js via ?raw + new Function, never construct the class.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, adminSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

let calls: { method: string; args: any[] }[];
let nextResult: any;

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.data = {
    soccerCategories: [
      { id: 'c1', name: 'Small-Sided Games', description: '2v2 through 8v8' },
      { id: 'c2', name: 'Passing & Possession', description: "Keep the ball" }
    ]
  };
  app._categoryUsage = {
    'Passing & Possession': 1,
    'Small Sided': 2,          // used by drills, not in the list
    "Coach's Choice": 1        // apostrophe: would break a naive onclick
  };
  // Own-property spies: these pull in the rest of the app otherwise.
  app.renderAdminModalContent = vi.fn();
  app.populateCategoryDropdowns = vi.fn();
  app.loadCategoryAdminData = vi.fn(async () => {});
  return app;
}

beforeEach(() => {
  calls = [];
  nextResult = { ok: true };
  const record = (method: string) => (...args: any[]) => {
    calls.push({ method, args });
    return Promise.resolve(nextResult);
  };
  (globalThis as any).window = globalThis as any;
  (window as any).auth = { isCoach: () => true, isAdmin: () => false };
  (window as any).supabaseService = {
    isConfigured: () => true,
    upsertSoccerCategory: record('upsertSoccerCategory'),
    renameSoccerCategory: record('renameSoccerCategory'),
    mergeSoccerCategory: record('mergeSoccerCategory'),
    retireSoccerCategory: record('retireSoccerCategory')
  };
  (globalThis as any).confirm = () => true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('what the panel shows', () => {
  it('lists each category with how many drills use it', () => {
    const html = makeApp().renderCategoryAdminSection();
    expect(html).toContain('Passing &amp; Possession');
    expect(html).toContain('1 drill');
  });

  it('surfaces a category drills use that nobody defined', () => {
    // This is the drift the editor exists to make visible: on the live data
    // five of ten drills carry a name with no category row.
    const html = makeApp().renderCategoryAdminSection();
    expect(html).toContain('Used by drills, not in the list');
    expect(html).toContain('Small Sided');
    expect(html).toContain('2 drills');
  });

  it('does not offer the section to a signed-out visitor', () => {
    (window as any).auth = { isCoach: () => false, isAdmin: () => false };
    expect(makeApp().renderCategoryAdminSection()).toBe('');
  });

  it('escapes an apostrophe so the handler survives it', () => {
    // "Coach's Choice" inside a single-quoted onclick would end the string
    // early and produce a button that throws instead of merging.
    const html = makeApp().renderCategoryAdminSection();
    expect(html).toContain("Coach\\'s Choice");
  });
});

describe('adding a category', () => {
  it('sends the name and description that were typed', async () => {
    document.body.innerHTML = `
      <input id="newCategoryName" value="Transition Play" />
      <input id="newCategoryDesc" value="Win it and go" />`;
    await makeApp().addSoccerCategory();
    const call = calls.find(c => c.method === 'upsertSoccerCategory');
    expect(call!.args[0]).toEqual({ name: 'Transition Play', description: 'Win it and go' });
  });

  it('never passes a school code, because the column does not exist', async () => {
    document.body.innerHTML = `
      <input id="newCategoryName" value="Transition Play" />
      <input id="newCategoryDesc" value="" />`;
    await makeApp().addSoccerCategory();
    const call = calls.find(c => c.method === 'upsertSoccerCategory')!;
    // The old import passed 'bhs' here and every write failed with 42703.
    expect(typeof call.args[0]).toBe('object');
    expect(call.args.length).toBe(1);
  });

  it('refuses an empty name without calling the service', async () => {
    document.body.innerHTML = `
      <input id="newCategoryName" value="   " />
      <input id="newCategoryDesc" value="" />`;
    const app = makeApp();
    await app.addSoccerCategory();
    expect(calls).toHaveLength(0);
    expect(app._categoryError).toMatch(/name/i);
  });
});

describe('a refusal reaches the coach', () => {
  it('renders the service error rather than failing silently', async () => {
    // The whole point of {ok, error}: an RLS denial must read as words on the
    // panel, not as a console line nobody sees.
    nextResult = { ok: false, error: 'The database refused that.' };
    document.body.innerHTML = `
      <input id="newCategoryName" value="Transition Play" />
      <input id="newCategoryDesc" value="" />`;
    const app = makeApp();
    await app.addSoccerCategory();
    expect(app._categoryError).toBe('The database refused that.');

    app._categoryError = 'The database refused that.';
    expect(app.renderCategoryAdminSection()).toContain('The database refused that.');
  });

  it('reports a thrown error instead of leaving the panel blank', async () => {
    (window as any).supabaseService.upsertSoccerCategory = () => { throw new Error('network drop'); };
    document.body.innerHTML = `
      <input id="newCategoryName" value="Transition Play" />
      <input id="newCategoryDesc" value="" />`;
    const app = makeApp();
    await app.addSoccerCategory();
    expect(app._categoryError).toContain('network drop');
  });
});

describe('editing a category', () => {
  it('renames through the rename path when the name changed', async () => {
    document.body.innerHTML = `
      <input id="editCategoryName" value="Possession" />
      <input id="editCategoryDesc" value="Keep the ball" />`;
    await makeApp().saveCategoryEdit('c2', 'Passing & Possession');
    const call = calls.find(c => c.method === 'renameSoccerCategory');
    expect(call!.args).toEqual(['c2', 'Passing & Possession', 'Possession']);
  });

  it('only updates the description when the name is unchanged', async () => {
    document.body.innerHTML = `
      <input id="editCategoryName" value="Passing &amp; Possession" />
      <input id="editCategoryDesc" value="Now with rondos" />`;
    await makeApp().saveCategoryEdit('c2', 'Passing & Possession');
    expect(calls.some(c => c.method === 'renameSoccerCategory')).toBe(false);
    const call = calls.find(c => c.method === 'upsertSoccerCategory');
    expect(call!.args[0].description).toBe('Now with rondos');
  });
});

describe('merging a stray category', () => {
  it('merges into the destination that was picked', async () => {
    document.body.innerHTML = `
      <select id="mergeInto_Small_Sided"><option value="Small-Sided Games" selected>x</option></select>`;
    await makeApp().mergeStrayCategory('Small Sided', 'mergeInto_Small_Sided');
    const call = calls.find(c => c.method === 'mergeSoccerCategory');
    expect(call!.args).toEqual(['Small Sided', 'Small-Sided Games']);
  });

  it('asks for a destination instead of merging into nothing', async () => {
    document.body.innerHTML = `
      <select id="mergeInto_Small_Sided"><option value="" selected>x</option></select>`;
    const app = makeApp();
    await app.mergeStrayCategory('Small Sided', 'mergeInto_Small_Sided');
    expect(calls).toHaveLength(0);
    expect(app._categoryError).toMatch(/pick a category/i);
  });
});

describe('retiring a category', () => {
  it('retires by id and leaves the drills alone', async () => {
    await makeApp().retireCategory('c1', 'Small-Sided Games', 0);
    const call = calls.find(c => c.method === 'retireSoccerCategory');
    expect(call!.args).toEqual(['c1']);
  });

  it('does nothing when the coach declines the confirmation', async () => {
    (globalThis as any).confirm = () => false;
    await makeApp().retireCategory('c2', 'Passing & Possession', 1);
    expect(calls).toHaveLength(0);
  });
});
