/**
 * Quiz import, exercised through the real import path.
 *
 * Two things are held here. First, that quiz rows import at all: the dropdown
 * offered "Quiz Questions Bank", the sheet detector resolved it to the target
 * 'quiz', and then no branch in the chain handled it — so the loop fell
 * through and reported "Imported 0 records" with no error, indistinguishable
 * from an empty file. Second, that a target with no branch says so, rather
 * than silently reporting zero the way 'quiz' and 'matrix' both used to.
 *
 * A .csv file never touches XLSX — handleImportFile parses it itself — so
 * these feed real CSV text and exercise that parser too. That matters: the
 * file that prompted this has a quoted question containing a comma, which the
 * previous line.split(',') parser shredded, shifting every column after it.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

interface ImportApp {
  data: Record<string, any>;
  activeTeamId: string | null;
  handleImportFile(file: any, target: string): Promise<void>;
  parseCsvText(text: string): Record<string, string>[];
  syncFromSupabase(): Promise<void>;
  renderCurrentView(): void;
  saveData(): void;
  populateCategoryDropdowns(): void;
}

let app: ImportApp;
let csvText: string;
let upserted: any[];
let upsertResult: { ok: boolean; error?: string };

const status = () => document.getElementById('importStatus')!.textContent || '';

/**
 * Runs an import and resolves once it has actually finished.
 *
 * handleImportFile returns as soon as the FileReader is started; all the work
 * happens later in reader.onload, which is itself async. So this polls the
 * status line until it stops reading "Reading & importing" — asserting before
 * that point sees an empty result and reads as a mapping failure.
 */
const runImport = async (target: string) => {
  const file = new File([csvText], 'quiz_questions.csv', { type: 'text/csv' });
  await app.handleImportFile(file, target);

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const text = status();
    if (text && !text.includes('Reading')) return;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error('import did not finish; status stuck at: ' + status());
};

beforeEach(() => {
  upserted = [];
  upsertResult = { ok: true } as any;
  csvText = '';

  document.body.innerHTML = '<div id="importStatus"></div>';

  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;
  w.supabaseService = {
    isConfigured: () => true,
    upsertQuizQuestion: async (q: any) => { upserted.push(q); return upsertResult; }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const ctor = new Function(
    [strip(appCoreSrc), strip(adminSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as { prototype: ImportApp };

  app = Object.create(ctor.prototype) as ImportApp;
  app.activeTeamId = 't-varsity';
  app.data = { players: [], schedule: [], drillsBank: [], matrixLogs: [], teams: [], soccerCategories: [] };
  app.syncFromSupabase = async () => {};
  app.renderCurrentView = () => {};
  app.saveData = () => {};
  app.populateCategoryDropdowns = () => {};
});

describe('parseCsvText', () => {
  it('keeps a comma that lives inside a quoted field', () => {
    // The whole reason this parser exists. split(',') turned one field into
    // two and shifted every column after it, so the damage arrived as wrong
    // data rather than as a failed import.
    const rows = app.parseCsvText('a,b\n"one, two",three\n');
    expect(rows[0].a).toBe('one, two');
    expect(rows[0].b).toBe('three');
  });

  it('reads an escaped double quote', () => {
    const rows = app.parseCsvText('a\n"He said ""press"" hard"\n');
    expect(rows[0].a).toBe('He said "press" hard');
  });

  it('keeps a newline inside a quoted field', () => {
    const rows = app.parseCsvText('a,b\n"line one\nline two",x\n');
    expect(rows[0].a).toBe('line one\nline two');
    expect(rows).toHaveLength(1);
  });

  it('handles CRLF line endings', () => {
    const rows = app.parseCsvText('a,b\r\n1,2\r\n');
    expect(rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('strips a UTF-8 BOM so the first header is not mangled', () => {
    // Excel writes one. Without this the first column is named "﻿a" and
    // every lookup against it misses.
    const rows = app.parseCsvText('﻿a,b\n1,2\n');
    expect(rows[0].a).toBe('1');
  });

  it('pads a row that is short of the header', () => {
    const rows = app.parseCsvText('a,b,c\n1,2\n');
    expect(rows[0]).toEqual({ a: '1', b: '2', c: '' });
  });

  it('ignores a trailing newline rather than emitting a blank record', () => {
    expect(app.parseCsvText('a\n1\n')).toHaveLength(1);
    expect(app.parseCsvText('a\n1')).toHaveLength(1);
  });

  it('returns nothing for empty input', () => {
    expect(app.parseCsvText('')).toEqual([]);
  });
});

describe('quiz import header mapping', () => {
  it('reads a snake_case export straight from the database', async () => {
    // The real file, header row and all — including the quoted question with
    // a comma inside it.
    csvText =
      'question_id,question,option_a,option_b,option_c,option_d,correct_option,explanation,category,created_at,is_deleted\n' +
      '1," In soccer, why is using fewer touches generally encouraged?",It moves the ball faster,' +
      'It guarantees a goal,It helps the defence organise,It removes the need for skill,A,' +
      'Fewer touches raise speed of play.,Speed of Play,,FALSE\n';
    await runImport('quiz');

    expect(upserted).toHaveLength(1);
    // The comma inside the quotes survives, and every column after it still
    // lines up.
    expect(upserted[0].question).toBe('In soccer, why is using fewer touches generally encouraged?');
    expect(upserted[0].option_b).toBe('It guarantees a goal');
    expect(upserted[0].correct_option).toBe('A');
    expect(upserted[0].category).toBe('Speed of Play');
  });

  it('reads the PascalCase headers the export template writes', async () => {
    csvText =
      'QuestionText,OptionA,OptionB,OptionC,OptionD,CorrectAnswer,Explanation,IsDeleted\n' +
      'Sample Question?,Option 1,Option 2,Option 3,Option 4,B,Because.,FALSE\n';
    await runImport('quiz');

    expect(upserted).toHaveLength(1);
    expect(upserted[0].question).toBe('Sample Question?');
    expect(upserted[0].option_d).toBe('Option 4');
    expect(upserted[0].correct_option).toBe('B');
  });

  it('imports several questions in one sheet', async () => {
    csvText =
      'question,option_a,option_b,option_c,option_d,correct_option\n' +
      'One?,a,b,c,d,A\n' +
      'Two?,a,b,c,d,C\n';
    await runImport('quiz');
    expect(upserted.map(q => q.question)).toEqual(['One?', 'Two?']);
  });

  it('reports the count in the status line', async () => {
    csvText = 'question,option_a,option_b,option_c,option_d,correct_option\nOne?,a,b,c,d,A\n';
    await runImport('quiz');
    expect(status()).toContain('1');
    expect(status()).toContain('✅');
  });

  it('names a rejected question instead of only counting it', async () => {
    // "row 4 was rejected" is useless against a sheet the coach must scroll.
    upsertResult = { ok: false, error: 'Correct answer must be A, B, C or D.' };
    csvText = 'question,option_a,option_b,option_c,option_d,correct_option\nA very specific question?,a,b,c,d,E\n';
    await runImport('quiz');
    expect(status()).toContain('A very specific question');
    expect(status()).toContain('⚠');
  });

  it('skips a blank row rather than sending an empty question', async () => {
    csvText =
      'question,option_a,option_b,option_c,option_d,correct_option\n' +
      ',,,,,\n' +
      'Real?,a,b,c,d,A\n';
    await runImport('quiz');
    expect(upserted).toHaveLength(1);
    expect(upserted[0].question).toBe('Real?');
  });
});

describe('a target with no import branch', () => {
  it('says so rather than silently reporting zero records', async () => {
    // This is the failure that made a missing feature look like a bad CSV:
    // the dropdown offered Quiz and Matrix, neither had a branch, and the
    // import reported "0 records" with no error at all.
    csvText = 'Anything\nat all\n';
    await runImport('matrix');

    expect(status()).toContain('not supported');
    expect(status()).toContain('⚠');
  });
});
