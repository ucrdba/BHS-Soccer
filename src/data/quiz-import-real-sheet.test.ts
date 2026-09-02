/**
 * The quiz sheet a coach actually has.
 *
 * Its header row is:
 *
 *   id  QuestionText  OptionA  OptionB  OptionC  OptionD  CorrectAnswer
 *   Explanation  IsDeleted
 *
 * Two things about it defeated the importer:
 *
 * 1. `id` is the number of the DAILY MESSAGE the question belongs to, repeated
 *    against every question of that message -- not the question's own key. The
 *    importer read neither, so questions imported unlinked and were asked
 *    whatever the current focus was, which is the opposite of what a numbered
 *    sheet means.
 *
 * 2. One option read "B. It guarantees that every pass..." with the letter
 *    baked into the text, which the quiz renders as "B) B. It guarantees...".
 *    That is a transcription habit, not a mistake worth making the coach fix
 *    in every row by hand.
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

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';
const SCHOOL = '7ebbe980-b87e-421f-a11f-788ca2519504';

let upserted: any[];
let lookedUpKeys: string[];

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = TEAM;
  app.data = {
    teams: [{ id: TEAM, name: 'Varsity', school_id: SCHOOL }],
    players: [], schedule: [], drillsBank: [], matrixLogs: [], soccerCategories: [], dailyThoughts: []
  };
  app.syncFromSupabase = async () => {};
  app.renderCurrentView = () => {};
  app.saveData = () => {};
  app.populateCategoryDropdowns = () => {};
  return app;
}

async function importCsv(app: any, csv: string) {
  const status = document.getElementById('importStatus')!;
  await app.handleImportFile(new File([csv], 'quiz.csv', { type: 'text/csv' }), 'quiz');
  const done = () => /^[✅⚠️❌]/u.test(status.textContent || '');
  for (let i = 0; i < 400 && !done(); i++) await new Promise(r => setTimeout(r, 5));
  if (!done()) throw new Error(`import never finished; status "${status.textContent}"`);
}

beforeEach(() => {
  upserted = [];
  lookedUpKeys = [];
  document.body.innerHTML = `<div id="importStatus"></div>`;
  (globalThis as any).window = globalThis as any;
  (window as any).auth = { isCoach: () => true, isAdmin: () => true };
  (window as any).supabaseService = {
    isConfigured: () => true,
    upsertQuizQuestion: async (q: any) => { upserted.push(q); return { ok: true, id: 'q-' + upserted.length }; },
    setTeamQuizQuestion: async () => ({ ok: true }),
    findThoughtIdByTitle: async () => null,
    findThoughtIdByKey: async (_t: string, key: string) => { lookedUpKeys.push(key); return 'thought-1'; }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const REAL_SHEET =
  'id,QuestionText,OptionA,OptionB,OptionC,OptionD,CorrectAnswer,Explanation,IsDeleted\n' +
  '1,"In soccer, why is using fewer touches generally encouraged when a player can accomplish the same task effectively?",' +
  '"It allows the ball to move faster and increases the team\'s speed of play",' +
  '"B. It guarantees that every pass will create a scoring opportunity.",' +
  '"It gives opponents more time to organize defensively.",' +
  '"It eliminates the need for technical skill.",' +
  'A,"It allows the ball to move faster and increases the team\'s speed of play.",FALSE\n';

describe('the id column as a link to the daily message', () => {
  it('resolves the message that number belongs to', async () => {
    // The coach numbers messages on the thoughts sheet and repeats that number
    // against every question of that message. id is a REFERENCE to a thought,
    // not the question's own key.
    await importCsv(makeApp(), REAL_SHEET);
    expect(lookedUpKeys).toEqual(['1']);
    expect(upserted[0].thoughtId).toBe('thought-1');
  });

  it('never sends the number as the question uuid', async () => {
    // question_id is a uuid column; "1" would fail the cast with 22P02.
    await importCsv(makeApp(), REAL_SHEET);
    expect(upserted[0].question_id).toBeFalsy();
  });

  it('rejects the row when no message carries that number, naming it', async () => {
    // Silently importing an unlinked question would leave it always-asked,
    // which is not what a numbered sheet meant.
    const app = makeApp();
    (window as any).supabaseService.findThoughtIdByKey = async () => null;
    await importCsv(app, REAL_SHEET);
    expect(upserted).toHaveLength(0);
    expect(document.getElementById('importStatus')!.textContent)
      .toMatch(/numbered 1/);
  });

  it('leaves a sheet with no id column always-asked', async () => {
    await importCsv(makeApp(),
      'QuestionText,OptionA,OptionB,OptionC,OptionD,CorrectAnswer\nEvergreen?,a,b,c,d,A\n');
    expect(upserted[0].thoughtId).toBeFalsy();
  });
});

describe('an option with its own letter typed into it', () => {
  it('strips the letter prefix so the quiz does not read "B) B. ..."', async () => {
    await importCsv(makeApp(), REAL_SHEET);
    expect(upserted[0].option_b).toBe('It guarantees that every pass will create a scoring opportunity.');
  });

  it('leaves the other options untouched', async () => {
    await importCsv(makeApp(), REAL_SHEET);
    expect(upserted[0].option_a).toBe("It allows the ball to move faster and increases the team's speed of play");
    expect(upserted[0].option_d).toBe('It eliminates the need for technical skill.');
  });

  it('only strips a letter matching that option\'s own position', async () => {
    // "A. Team" as option B is a real answer, not a mis-transcribed prefix.
    await importCsv(makeApp(),
      'id,QuestionText,OptionA,OptionB,OptionC,OptionD,CorrectAnswer\n' +
      '2,Which side?,"A. Squad","A. Team","C) Reserves","D - Youth",A\n');
    expect(upserted[0].option_a).toBe('Squad');       // A. on option A -> stripped
    expect(upserted[0].option_b).toBe('A. Team');     // A. on option B -> kept
    expect(upserted[0].option_c).toBe('Reserves');    // C) on option C -> stripped
    expect(upserted[0].option_d).toBe('Youth');       // D - on option D -> stripped
  });
});

describe('the rest of the sheet', () => {
  it('carries the question, answer and explanation through', async () => {
    await importCsv(makeApp(), REAL_SHEET);
    expect(upserted[0].question).toContain('why is using fewer touches');
    expect(upserted[0].correct_option).toBe('A');
    expect(upserted[0].explanation).toContain('speed of play');
  });

  it('marks the sheet\'s rows as belonging to the message it names', async () => {
    // REAL_SHEET carries id=1, so every question of it belongs to message 1
    // rather than being evergreen.
    await importCsv(makeApp(), REAL_SHEET);
    expect(upserted[0].thoughtId).toBe('thought-1');
  });
});
