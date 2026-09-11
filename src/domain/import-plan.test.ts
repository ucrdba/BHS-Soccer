/**
 * Reading a workbook into a plan, before anything is written.
 *
 * The legacy importer applies as it reads, so a misread column is discovered
 * AFTER it has overwritten a season. This describes what would change so a
 * coach can look at it first.
 *
 * The rule that carries the file: a team is never guessed. A spreadsheet
 * names a team as text and the database holds uuids, and a row imported
 * against the wrong team is a player on a squad they never played for -- in
 * team_players, where minutes, ratings and recording numbers live.
 */
import { describe, it, expect } from 'vitest';
import { planImport, resolveTeam, cell, readyToApply, planSchoolRow } from './import-plan';
import { sheetFor, tableByKey } from './workbook';

const TEAMS = [
  { id: 't1', name: 'Varsity' },
  { id: 't2', name: 'JV' }
];

const known = { teams: TEAMS };

describe('a blank cell', () => {
  it('becomes undefined, not an empty string', () => {
    // upsertByKey's blank-skip distinguishes "not supplied" from "supplied
    // empty", and that is what stops a sparse sheet wiping columns it never
    // mentioned.
    expect(cell('')).toBeUndefined();
    expect(cell('   ')).toBeUndefined();
    expect(cell(null)).toBeUndefined();
    expect(cell(undefined)).toBeUndefined();
  });

  it('keeps a real value, trimmed', () => {
    expect(cell('  Cesar  ')).toBe('Cesar');
    expect(cell(0)).toBe('0');
  });
});

describe('resolving a team', () => {
  it('matches by name', () => {
    expect(resolveTeam('Varsity', TEAMS)).toBe('t1');
  });

  it('ignores case and extra spaces', () => {
    // A spreadsheet is typed by hand.
    expect(resolveTeam('  varsity ', TEAMS)).toBe('t1');
    expect(resolveTeam('J V', TEAMS)).toBeNull();
    expect(resolveTeam('jv', TEAMS)).toBe('t2');
  });

  it('returns NULL rather than guessing', () => {
    // Not the first team, not the only team, not a fuzzy match.
    expect(resolveTeam('Boys Varsity', TEAMS)).toBeNull();
    expect(resolveTeam('', TEAMS)).toBeNull();
  });
});

describe('planning an import', () => {
  const sheets = {
    Players: [
      { Team: 'Varsity', FirstName: 'Cesar', LastName: 'Alva' },
      { Team: 'Varsity', FirstName: 'Tom', LastName: 'Budde' }
    ],
    Schedule: [{ Team: 'JV', Opponent: 'Yucaipa' }]
  };

  it('matches a sheet to its table', () => {
    const plan = planImport(sheets, known);
    expect(plan.sheets.map(s => s.key).sort()).toEqual(['players', 'schedule']);
  });

  it('counts the rows PER SHEET', () => {
    // "1,400 rows" says nothing about which table is about to change.
    const plan = planImport(sheets, known);
    expect(plan.sheets.find(s => s.key === 'players')!.rows).toHaveLength(2);
    expect(plan.totals).toEqual({ rows: 3, sheets: 2 });
  });

  it('WARNS about a sheet it does not recognise rather than ignoring it', () => {
    // A coach who renamed a tab needs to know that is why nothing happened.
    const plan = planImport({ ...sheets, MyNotes: [{ a: 1 }] }, known);

    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain('MyNotes');
    expect(plan.sheets.map(s => s.key)).not.toContain('MyNotes');
  });

  it('normalises every cell, so a blank never reaches the merge as ""', () => {
    const plan = planImport({ Players: [{ FirstName: 'Cesar', LastName: '  ' }] }, known);
    expect(plan.sheets[0].rows[0]).toEqual({ FirstName: 'Cesar', LastName: undefined });
  });

  it('writes nothing at all — it only describes', () => {
    // The whole point of a preview. There is no client here to call, which is
    // itself the assertion: this module cannot write.
    const plan = planImport(sheets, known);
    expect(plan).toHaveProperty('sheets');
    expect(Object.keys(plan)).toEqual(['sheets', 'totals', 'warnings', 'unknownTeams', 'badPositions']);
  });

  it('copes with an empty workbook', () => {
    const plan = planImport({}, known);
    expect(plan.totals).toEqual({ rows: 0, sheets: 0 });
  });
});

describe('UNKNOWN TEAMS ARE COLLECTED, NOT GUESSED', () => {
  const sheets = {
    Players: [
      { Team: 'Varsity', FirstName: 'Cesar' },
      { Team: 'Boys Varsity', FirstName: 'Unknown' },
      { Team: 'U16 Reds', FirstName: 'Also unknown' }
    ]
  };

  it('lists the names that match nothing', () => {
    const plan = planImport(sheets, known);
    expect(plan.unknownTeams).toEqual(['Boys Varsity', 'U16 Reds']);
  });

  it('does not list one that resolves', () => {
    const plan = planImport(sheets, known);
    expect(plan.unknownTeams).not.toContain('Varsity');
  });

  it('reports them per sheet as well, so the coach knows where they are', () => {
    const plan = planImport(sheets, known);
    expect(plan.sheets[0].unknownTeams).toHaveLength(2);
  });

  it('deduplicates a name that appears on many rows', () => {
    const plan = planImport({
      Players: [
        { Team: 'Boys Varsity', FirstName: 'One' },
        { Team: 'Boys Varsity', FirstName: 'Two' }
      ]
    }, known);
    expect(plan.unknownTeams).toEqual(['Boys Varsity']);
  });

  it('finds none in a sheet with no Team column at all', () => {
    // The categories and drills sheets have none, and are not team-scoped.
    const plan = planImport({ SoccerCategories: [{ Name: 'Possession' }] }, known);
    expect(plan.unknownTeams).toEqual([]);
  });
});

describe('whether a plan may be applied', () => {
  const plan = planImport({
    Players: [{ Team: 'Boys Varsity', FirstName: 'One' }]
  }, known);

  it('is REFUSED while a team is unmapped', () => {
    expect(readyToApply(plan, {})).toBe(false);
  });

  it('is allowed once every name has somewhere to go', () => {
    expect(readyToApply(plan, { 'Boys Varsity': 't1' })).toBe(true);
  });

  it('is refused when only some are mapped', () => {
    const two = planImport({
      Players: [{ Team: 'Boys Varsity' }, { Team: 'U16 Reds' }]
    }, known);
    expect(readyToApply(two, { 'Boys Varsity': 't1' })).toBe(false);
  });

  it('is allowed for a workbook that names no unknown team', () => {
    const clean = planImport({ Players: [{ Team: 'Varsity' }] }, known);
    expect(readyToApply(clean, {})).toBe(true);
  });
});

describe('positions', () => {
  const known = { teams: [{ id: 't1', name: 'Varsity' }] };

  it('lists a Position that is not 1-11 or blank, naming the row and player', () => {
    const plan = planImport({ Players: [
      { Team: 'Varsity', FirstName: 'Ann', LastName: 'Bell', Position: '4' },
      { Team: 'Varsity', FirstName: 'Cy', LastName: 'Dunn', Position: 'FB' },
      { Team: 'Varsity', FirstName: 'Ed', LastName: 'Fox', Position: '' },
      { Team: 'Varsity', FirstName: 'Gil', LastName: 'Hart', Position: 12 }
    ] }, known);
    expect(plan.badPositions).toEqual([
      { sheetName: 'Players', row: 3, name: 'Cy Dunn', value: 'FB' },
      { sheetName: 'Players', row: 5, name: 'Gil Hart', value: '12' }
    ]);
  });

  it('names the player from a single Name column when the sheet has no parts', () => {
    // The import accepts one Name column; a refusal that listed the row with a
    // blank name would leave the coach only a row number to find it by.
    const plan = planImport({ Players: [
      { Team: 'Varsity', Name: 'Budde, Tom', Position: 'MF' }
    ] }, known);
    expect(plan.badPositions).toEqual([
      { sheetName: 'Players', row: 2, name: 'Budde, Tom', value: 'MF' }
    ]);
  });

  it('will not apply while a position is refused', () => {
    const plan = planImport({ Players: [{ Team: 'Varsity', FirstName: 'Cy', Position: 'MF' }] }, known);
    expect(readyToApply(plan, {})).toBe(false);
  });

  it('applies when every position is 1-11 or blank', () => {
    const plan = planImport({ Players: [{ Team: 'Varsity', FirstName: 'Cy', Position: '9' }] }, known);
    expect(readyToApply(plan, {})).toBe(true);
  });
});

describe('THE SCHOOLS ROW RESTORES THE ORGANIZATION IT CAME FROM', () => {
  // The row as `fetchSchool` loads it -- `select *` -- so a column this
  // database has is a key on it, and a column it lacks is not.
  const MIGRATED = {
    code: 'lfc', name: 'Legends FC', mascot: 'Lions', city: 'Riverside', league: 'Inland',
    colors: { primary: '#123456', secondary: '#abcdef' },
    record: { wins: 3, losses: 1, draws: 2 },
    logo_url: '/img/legends.png', hero_url: 'https://example.org/pitch.jpg'
  };
  const { logo_url: _l, hero_url: _h, ...UNMIGRATED } = MIGRATED;

  /** The Schools sheet an export of `source` writes, read back as the importer reads it. */
  const exported = (source: any) =>
    planImport({ Schools: sheetFor(tableByKey('schools')!, { school: source }) }, known)
      .sheets[0].rows[0];

  /** Export `source`, then plan that sheet onto a database holding `target`. */
  const roundTrip = (source: any, target: any) =>
    planImport(
      { Schools: sheetFor(tableByKey('schools')!, { school: source }) },
      { teams: TEAMS, school: target }
    ).sheets[0].schoolRows![0];

  it('KEEPS BOTH ADDRESSES through an export and a re-import', () => {
    const p = roundTrip(MIGRATED, MIGRATED);

    expect(p.refused).toBeNull();
    expect(p.school).toMatchObject({
      logoUrl: '/img/legends.png', heroUrl: 'https://example.org/pitch.jpg'
    });
    expect(p.changes).toEqual([]);
  });

  it('puts both addresses back on a database that lost them, and says so', () => {
    const p = roundTrip(MIGRATED, { ...MIGRATED, logo_url: null, hero_url: null });

    expect(p.school).toMatchObject({
      logoUrl: '/img/legends.png', heroUrl: 'https://example.org/pitch.jpg'
    });
    expect(p.changes).toEqual([
      { field: 'LogoUrl', from: '', to: '/img/legends.png' },
      { field: 'HeroUrl', from: '', to: 'https://example.org/pitch.jpg' }
    ]);
  });

  it('LEAVES BOTH KEYS OUT for a database without the columns', () => {
    // Naming a column that is not there makes PostgREST refuse the WHOLE save
    // with 42703 -- the name, the colours and the record along with it.
    const p = roundTrip(MIGRATED, UNMIGRATED);

    expect(p.refused).toBeNull();
    expect(p.school).not.toHaveProperty('logoUrl');
    expect(p.school).not.toHaveProperty('heroUrl');
    expect(p.notes.join(' ')).toContain('0028');
    expect(p.notes.join(' ')).toContain('0030');
  });

  it('decides each column on its own: 0028 applied, 0030 not', () => {
    const { hero_url: _, ...logoOnly } = MIGRATED;
    const p = roundTrip(MIGRATED, logoOnly);

    expect(p.school!.logoUrl).toBe('/img/legends.png');
    expect(p.school).not.toHaveProperty('heroUrl');
  });

  it('KEEPS the current address when the cell is blank, and says so', () => {
    // Blank means "not supplied" throughout the import. Sent as '', it would
    // be written as null and clear an address the admin typed by hand.
    const p = roundTrip({ ...MIGRATED, logo_url: null, hero_url: null }, MIGRATED);

    expect(p.school).not.toHaveProperty('logoUrl');
    expect(p.school).not.toHaveProperty('heroUrl');
    expect(p.changes).toEqual([]);
    expect(p.notes.join(' ')).toMatch(/logo address.*kept/i);
    expect(p.notes.join(' ')).toMatch(/photo address.*kept/i);
  });

  it('changes neither address from a sheet written before the columns existed', () => {
    const p = planSchoolRow({ Code: 'lfc', Name: 'Legends FC' }, MIGRATED);

    expect(p.school).not.toHaveProperty('logoUrl');
    expect(p.school).not.toHaveProperty('heroUrl');
  });

  it('REFUSES an address the public page would not show', () => {
    // Both are rendered into an <img> on the public home page; `safeImageUrl`
    // would drop these on read, so they are refused before they are stored.
    const logo = planSchoolRow({ ...exported(MIGRATED), LogoUrl: 'javascript:alert(1)' }, MIGRATED);
    const hero = planSchoolRow({ ...exported(MIGRATED), HeroUrl: '//elsewhere.example/x.jpg' }, MIGRATED);

    expect(logo.school).toBeNull();
    expect(logo.refused).toMatch(/logo address/i);
    expect(hero.school).toBeNull();
    expect(hero.refused).toMatch(/photo address/i);
  });

  it('REFUSES a row for another organization', () => {
    // A backup restores the organization it was taken from, never another.
    const p = roundTrip({ ...MIGRATED, code: 'rfc' }, MIGRATED);

    expect(p.school).toBeNull();
    expect(p.refused).toMatch(/rfc/);
  });

  it('REFUSES a row that names no organization rather than guessing one', () => {
    const p = planSchoolRow({ ...exported(MIGRATED), Code: undefined }, MIGRATED);
    expect(p.school).toBeNull();
    expect(p.refused).toBeTruthy();
  });

  it('refuses when this organization has not loaded, since there is nothing to compare', () => {
    const p = roundTrip(MIGRATED, null);
    expect(p.school).toBeNull();
    expect(p.refused).toBeTruthy();
  });

  it('keeps every field a blank cell leaves out', () => {
    const p = planSchoolRow({ Code: 'lfc' }, { ...MIGRATED, colors: { ...MIGRATED.colors, band: '#000' } });

    expect(p.school).toMatchObject({
      name: 'Legends FC', mascot: 'Lions', city: 'Riverside', league: 'Inland',
      colors: { primary: '#123456', secondary: '#abcdef', band: '#000' },
      record: { wins: 3, losses: 1, draws: 2 }
    });
  });

  it('REFUSES rather than send a blank name, mascot or city', () => {
    // upsertSchool fills each of those with Beaumont's when it is blank.
    const p = planSchoolRow({ Code: 'lfc' }, { ...MIGRATED, city: null });

    expect(p.school).toBeNull();
    expect(p.refused).toMatch(/city/i);
    expect(JSON.stringify(p)).not.toMatch(/beaumont|cougars/i);
  });

  it('refuses a colour or a count it cannot read', () => {
    expect(planSchoolRow({ Code: 'lfc', PrimaryColor: 'sparkly' }, MIGRATED).refused)
      .toMatch(/colour/i);
    expect(planSchoolRow({ Code: 'lfc', Wins: 'three' }, MIGRATED).refused)
      .toMatch(/wins/i);
  });

  it('lists each field it would change, from and to', () => {
    const p = planSchoolRow({ Code: 'lfc', Name: 'Legends FC Academy', Wins: '4' }, MIGRATED);

    expect(p.changes).toEqual([
      { field: 'Name', from: 'Legends FC', to: 'Legends FC Academy' },
      { field: 'Wins', from: '3', to: '4' }
    ]);
  });

  it('writes with the loaded code, the one upsertSchool keys on', () => {
    const p = roundTrip({ ...MIGRATED, code: 'LFC' }, MIGRATED);
    expect(p.code).toBe('lfc');
  });

  it('is attached only to the Schools sheet', () => {
    const plan = planImport({ Players: [{ Team: 'Varsity' }] }, known);
    expect(plan.sheets[0].schoolRows).toBeUndefined();
  });
});

describe('A SHEET THAT CANNOT BE IMPORTED', () => {
  // The legacy importer handles ten targets and has no branch for MatrixLogs,
  // so the sheet is exported and can never be restored. An admin who exports
  // everything, loses something and re-imports gets it all back EXCEPT their
  // Matrix history -- with nothing on screen saying so.
  const sheets = { MatrixLogs: [{ PlayerName: 'Cesar Alva', Result: 'WIN' }] };

  it('is marked as not importable rather than silently skipped', () => {
    const plan = planImport(sheets, known);
    expect(plan.sheets[0].importable).toBe(false);
  });

  it('SAYS SO, so a restore does not look complete when it is not', () => {
    const plan = planImport(sheets, known);
    expect(plan.warnings.join(' ')).toMatch(/cannot be imported/i);
    expect(plan.warnings.join(' ')).toContain('MatrixLogs');
  });

  it('is told apart from a sheet nobody recognises', () => {
    // "Exported but not imported" and "that is not a table" are different
    // things and want different words.
    const plan = planImport({ ...sheets, MyNotes: [{}] }, known);

    expect(plan.warnings.join(' ')).toMatch(/does not match any table/i);
    expect(plan.warnings.join(' ')).toMatch(/cannot be imported/i);
  });

  it('does not ask about its team names, since nothing will be written', () => {
    const plan = planImport({
      MatrixLogs: [{ Team: 'Boys Varsity', PlayerName: 'Cesar Alva' }]
    }, known);
    expect(plan.unknownTeams).toEqual([]);
  });

  it('still marks every importable sheet as importable', () => {
    const plan = planImport({ Players: [{ Team: 'Varsity' }] }, known);
    expect(plan.sheets[0].importable).toBe(true);
  });
});
