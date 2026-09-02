/**
 * The player XLSX/CSV import, end to end, for names.
 *
 * player-name-parts.test.ts covers the service contract. This covers the thing
 * that actually breaks a coach's afternoon: the IMPORT MAPPING -- whether a
 * spreadsheet's columns reach the database as first and last name.
 *
 * It drives the real `handleImportFile` with a real CSV File rather than
 * asserting against source text, because the mapping is inline in a 200-line
 * branch and a string check would pass with the columns wired to the wrong
 * fields. Three sheet shapes matter:
 *
 *   - FirstName/LastName  -- what the export and template now emit
 *   - Name                -- every spreadsheet written before this change
 *   - neither             -- must be skipped, not written as a blank player
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';
import { supabaseService } from './supabase';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, adminSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const TEAM = { id: 'team-varsity', school_id: 'school-bhs', name: 'Varsity' };

let identityWrites: any[];

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.data = { players: [], teams: [TEAM] };
  app.activeTeamId = TEAM.id;
  app.syncFromSupabase = vi.fn(async () => {});
  app.renderCurrentView = vi.fn();
  app.saveData = vi.fn();
  app.populateCategoryDropdowns = vi.fn();
  app.upsertByKey = vi.fn();
  app.resolveImportTeam = vi.fn(async () => TEAM);
  return app;
}

/**
 * Drive the real import with a CSV file and wait for it to genuinely finish.
 *
 * `handleImportFile` returns as soon as it has attached a FileReader handler,
 * so awaiting it proves nothing -- the writes land later. Waiting on a fixed
 * number of microtask turns is just as unreliable: it let writes from one case
 * arrive during the next, which is what a first draft of this file did. So wait
 * on the handler's own completion signal, the final status line it writes.
 */
async function importCsv(app: any, csv: string) {
  const status = document.getElementById('importStatus')!;
  const file = new File([csv], 'players.csv', { type: 'text/csv' });
  await app.handleImportFile(file, 'players');

  const done = () => /^[✅⚠️❌]/u.test(status.textContent || '');
  for (let i = 0; i < 400 && !done(); i++) {
    await new Promise(r => setTimeout(r, 5));
  }
  if (!done()) throw new Error(`import never finished; status was "${status.textContent}"`);
}

beforeEach(() => {
  identityWrites = [];
  document.body.innerHTML = `<div id="importStatus"></div>`;
  (globalThis as any).window = globalThis as any;
  (window as any).auth = { isCoach: () => true, isAdmin: () => true };
  (window as any).supabaseService = {
    isConfigured: () => true,
    // The real splitter, so this test exercises the rule the migration mirrors.
    splitPlayerName: (n: string) => supabaseService.splitPlayerName(n),
    fetchAllPlayerIdentities: async () => [],
    upsertPlayerIdentity: async (p: any) => { identityWrites.push(p); return { id: 'id-' + identityWrites.length }; },
    upsertTeamMembership: async () => ({ ok: true })
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('a sheet with FirstName and LastName columns', () => {
  it('sends both halves to the database', async () => {
    const app = makeApp();
    await importCsv(app,
      'Number,FirstName,LastName,Position,Class\n' +
      '10,Mateo,Herrera,Midfielder,Sophomore\n');

    expect(identityWrites).toHaveLength(1);
    expect(identityWrites[0].firstName).toBe('Mateo');
    expect(identityWrites[0].lastName).toBe('Herrera');
  });

  it('composes the full name used to match an existing player', async () => {
    // Matching is by full name across the whole identity table; if the import
    // composed it wrongly it would mint a duplicate human rather than update.
    const app = makeApp();
    await importCsv(app, 'Number,FirstName,LastName\n7,Kai,Nakamura\n');
    expect(identityWrites[0].name).toBe('Kai Nakamura');
  });

  it('imports several rows without crossing their names', async () => {
    const app = makeApp();
    await importCsv(app,
      'Number,FirstName,LastName\n' +
      '10,Mateo,Herrera\n' +
      '7,Kai,Nakamura\n' +
      '4,Owen,Blackwell\n');

    expect(identityWrites.map(w => `${w.firstName} ${w.lastName}`))
      .toEqual(['Mateo Herrera', 'Kai Nakamura', 'Owen Blackwell']);
  });
});

describe('a sheet written before names were split', () => {
  it('still imports, splitting the single Name column', async () => {
    // Every spreadsheet the coach already has looks like this.
    const app = makeApp();
    await importCsv(app, 'Number,Name,Position\n9,Diego Salcedo,Forward\n');

    expect(identityWrites).toHaveLength(1);
    expect(identityWrites[0].firstName).toBe('Diego');
    expect(identityWrites[0].lastName).toBe('Salcedo');
  });

  it('keeps a compound surname whole', async () => {
    const app = makeApp();
    await importCsv(app, 'Number,Name\n3,Ana Maria Rodriguez Gomez\n');
    expect(identityWrites[0].firstName).toBe('Ana');
    expect(identityWrites[0].lastName).toBe('Maria Rodriguez Gomez');
  });
});

describe('rows that name nobody', () => {
  it('skips a row with no name at all rather than writing a blank player', async () => {
    const app = makeApp();
    await importCsv(app, 'Number,FirstName,LastName\n11,,\n');
    expect(identityWrites).toHaveLength(0);
  });
});

describe('when both column styles are present', () => {
  it('prefers the explicit parts over the full name', async () => {
    // An export edited by hand could carry a stale Name beside fresh parts.
    const app = makeApp();
    await importCsv(app, 'Number,Name,FirstName,LastName\n5,Stale Value,Finn,Gallagher\n');
    expect(identityWrites[0].firstName).toBe('Finn');
    expect(identityWrites[0].lastName).toBe('Gallagher');
    expect(identityWrites[0].name).toBe('Finn Gallagher');
  });
});
