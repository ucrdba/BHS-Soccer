/**
 * The quiz question editor, Stage 2.
 *
 * Until this existed the bank could only be changed by importing a spreadsheet
 * or writing SQL. Two properties matter most, and neither is visible to a
 * source-text check:
 *
 * 1. A new question is switched on for the team being worked on. A question in
 *    the bank with no team row is asked by nobody and appears in no quiz --
 *    the exact state every imported question was left in before today.
 *
 * 2. A refusal reaches the coach as words. These writes go through RLS, and a
 *    silent failure here reads as "the edit saved" while the database rejected
 *    it.
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
const JV = '18c4d4b8-0c0b-413d-ab16-77f027261009';
const SCHOOL = '7ebbe980-b87e-421f-a11f-788ca2519504';
const Q1 = '11111111-1111-1111-1111-111111111111';
const THOUGHT = 'aaaaaaaa-0000-0000-0000-000000000001';

let upserts: any[];
let toggles: any[];
let retired: string[];
let upsertResult: any;

const BANK = [
  {
    question_id: Q1, question: 'What is our formation?',
    option_a: '5-4-1', option_b: '4-3-3', option_c: '2-2-6', option_d: 'None',
    correct_option: 'B', explanation: 'We press from the front.',
    category: 'Tactical', thought_id: null, import_key: '100', teamIds: [TEAM]
  }
];

function makeApp(bank = BANK): any {
  const app = Object.create(ctor.prototype);
  app.data = {
    teams: [
      { id: TEAM, name: 'Varsity', school_id: SCHOOL },
      { id: JV, name: 'JV', school_id: SCHOOL }
    ],
    dailyThoughts: [{ id: THOUGHT, title: 'Week 3 - High Press', text: 'Press high.', isActive: true }]
  };
  app.activeTeamId = TEAM;
  app._quizBank = bank;
  app.renderAdminModalContent = vi.fn();
  app.loadQuizBank = vi.fn(async () => {});
  app.syncFromSupabase = vi.fn(async () => {});
  return app;
}

function editorDom(over: Record<string, string> = {}) {
  const v = {
    qText: 'What is our formation?', qOptionA: '5-4-1', qOptionB: '4-3-3',
    qOptionC: '2-2-6', qOptionD: 'None', qExplanation: 'We press.',
    qCategory: 'Tactical', qKey: '100', qThought: '', ...over
  };
  document.body.innerHTML = `
    <textarea id="qText">${v.qText}</textarea>
    <input id="qOptionA" value="${v.qOptionA}" />
    <input id="qOptionB" value="${v.qOptionB}" />
    <input id="qOptionC" value="${v.qOptionC}" />
    <input id="qOptionD" value="${v.qOptionD}" />
    <input id="qExplanation" value="${v.qExplanation}" />
    <input id="qCategory" value="${v.qCategory}" />
    <input id="qKey" value="${v.qKey}" />
    <select id="qThought"><option value="${v.qThought}" selected></option></select>
    <input type="radio" name="qCorrect" value="B" checked />`;
}

beforeEach(() => {
  upserts = []; toggles = []; retired = [];
  upsertResult = { ok: true, id: Q1 };
  (globalThis as any).window = globalThis as any;
  (window as any).auth = { isCoach: () => true, isAdmin: () => false };
  (window as any).supabaseService = {
    isConfigured: () => true,
    upsertQuizQuestion: async (q: any) => { upserts.push(q); return upsertResult; },
    setTeamQuizQuestion: async (t: string, q: string, on: boolean) => { toggles.push({ t, q, on }); return { ok: true }; },
    retireQuizQuestion: async (id: string) => { retired.push(id); return { ok: true }; },
    fetchQuizBank: async () => BANK
  };
  (globalThis as any).confirm = () => true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('what the editor shows', () => {
  it('lists each question with its answer and key', () => {
    const html = makeApp().renderQuizAdminSection();
    expect(html).toContain('What is our formation?');
    expect(html).toContain('answer B');
    expect(html).toContain('key 100');
  });

  it('says a question with no message is always asked', () => {
    expect(makeApp().renderQuizAdminSection()).toContain('always asked');
  });

  it('names the message a linked question depends on', () => {
    // Otherwise a coach cannot tell why a question is missing from the quiz.
    const app = makeApp([{ ...BANK[0], thought_id: THOUGHT }]);
    const html = app.renderQuizAdminSection();
    expect(html).toContain('Week 3 - High Press');
    expect(html).toContain('only while');
  });

  it('warns when no team asks a question at all', () => {
    // The invisible state: in the bank, in nobody's quiz.
    const app = makeApp([{ ...BANK[0], teamIds: [] }]);
    expect(app.renderQuizAdminSection()).toContain('no team asks this');
  });

  it('shows a tick per team, checked only where the question is switched on', () => {
    const html = makeApp().renderQuizAdminSection();
    expect(html).toContain('Varsity');
    expect(html).toContain('JV');
    // Varsity is in teamIds and JV is not, so exactly one box is checked.
    expect((html.match(/type="checkbox" checked/g) || []).length).toBe(1);
  });

  it('is hidden from a signed-out visitor', () => {
    (window as any).auth = { isCoach: () => false, isAdmin: () => false };
    expect(makeApp().renderQuizAdminSection()).toBe('');
  });
});

describe('saving a question', () => {
  it('sends the organization, the key and the answer', async () => {
    editorDom();
    await makeApp().saveQuizQuestion(Q1);
    expect(upserts[0].schoolId).toBe(SCHOOL);
    expect(upserts[0].importKey).toBe('100');
    expect(upserts[0].correct_option).toBe('B');
    expect(upserts[0].question_id).toBe(Q1);
  });

  it('links the question to the message chosen in the dropdown', async () => {
    editorDom({ qThought: THOUGHT });
    await makeApp().saveQuizQuestion(Q1);
    expect(upserts[0].thoughtId).toBe(THOUGHT);
  });

  it('sends no message when "always asked" is chosen', async () => {
    editorDom({ qThought: '' });
    await makeApp().saveQuizQuestion(Q1);
    expect(upserts[0].thoughtId).toBeNull();
  });

  it('switches a NEW question on for the active team', async () => {
    // Without this it lands in the bank and no quiz ever asks it.
    editorDom({ qText: 'A brand new question' });
    const app = makeApp();
    app.loadQuizBank = vi.fn(async () => {
      app._quizBank = [{ question_id: 'new-q', question: 'A brand new question', teamIds: [] }];
    });
    await app.saveQuizQuestion('new');
    expect(toggles).toEqual([{ t: TEAM, q: 'new-q', on: true }]);
  });

  it('does not re-switch an EDITED question, which already has its teams', async () => {
    editorDom();
    await makeApp().saveQuizQuestion(Q1);
    expect(toggles).toHaveLength(0);
  });

  it('refuses without a team rather than writing to no organization', async () => {
    editorDom();
    const app = makeApp();
    app.activeTeamId = null;
    await app.saveQuizQuestion('new');
    expect(upserts).toHaveLength(0);
    expect(app._quizError).toMatch(/team/i);
  });

  it('shows the database refusal instead of reporting success', async () => {
    upsertResult = { ok: false, error: 'Coach or admin access is required.' };
    editorDom();
    const app = makeApp();
    await app.saveQuizQuestion(Q1);
    expect(app._quizError).toBe('Coach or admin access is required.');
    expect(app._quizNotice).toBeFalsy();
  });

  it('reports a thrown error rather than leaving the panel silent', async () => {
    (window as any).supabaseService.upsertQuizQuestion = () => { throw new Error('network drop'); };
    editorDom();
    const app = makeApp();
    await app.saveQuizQuestion(Q1);
    expect(app._quizError).toContain('network drop');
  });
});

describe('per-team toggles', () => {
  it('switches a question on for another squad', async () => {
    await makeApp().toggleQuizQuestionForTeam(Q1, JV, true);
    expect(toggles).toEqual([{ t: JV, q: Q1, on: true }]);
  });

  it('switches one off', async () => {
    await makeApp().toggleQuizQuestionForTeam(Q1, TEAM, false);
    expect(toggles).toEqual([{ t: TEAM, q: Q1, on: false }]);
  });
});

describe('retiring a question', () => {
  it('retires it after confirmation', async () => {
    await makeApp().retireQuizQuestion(Q1);
    expect(retired).toEqual([Q1]);
  });

  it('does nothing when the coach declines', async () => {
    (globalThis as any).confirm = () => false;
    await makeApp().retireQuizQuestion(Q1);
    expect(retired).toHaveLength(0);
  });
});
