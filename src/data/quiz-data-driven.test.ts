/**
 * The quiz, read from the database instead of the code.
 *
 * Until now five questions were hardcoded as radio inputs in planner.view.js,
 * with the answer key ('B','A','A','B','C') written into submitQuizAnswer.
 * quiz_questions existed all along and was empty -- nothing read it.
 *
 * Two properties carry the weight here:
 *
 * 1. The team's own questions, and only those. The bank belongs to an
 *    organization and each squad picks from it, so a question switched off for
 *    the under-14s must not reach them.
 *
 * 2. An attempt records the real question uuid. The old code wrote
 *    `questionId: 1..5` into player_answers -- integers, pointing at nothing,
 *    on a table whose key is a uuid. Every answer ever saved was unattributable.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';
const Q1 = '11111111-1111-1111-1111-111111111111';
const Q2 = '22222222-2222-2222-2222-222222222222';

let inserted: any[];
let lastTable: string;
let queries: { table: string; filters: Record<string, any> }[];
// Hoisted so a test can reshape the fixture before calling the service.
let tables: Record<string, any[]>;

beforeEach(() => {
  inserted = [];
  queries = [];
  lastTable = '';

  tables = {
    team_quiz_questions: [
      {
        team_id: TEAM,
        question_id: Q1,
        quiz_questions: {
          question_id: Q1, question: 'What is the primary tactical objective?',
          option_a: 'Low block', option_b: 'High press', option_c: 'Dribble', option_d: 'Long balls',
          correct_option: 'B', explanation: 'Pressing wins the ball high.', category: 'Tactical',
          is_deleted: false
        }
      },
      {
        team_id: TEAM,
        question_id: Q2,
        quiz_questions: {
          question_id: Q2, question: 'Possession under pressure?',
          option_a: 'Simple quick pass', option_b: 'Hold it', option_c: 'Kick it out', option_d: 'Stop',
          correct_option: 'A', explanation: null, category: 'Tactical',
          is_deleted: false
        }
      }
    ],
    quiz_answers: [
      { question_id: Q1, letter: 'A', answer_text: 'Low block', is_correct: false, ordinal: 1, is_deleted: false },
      { question_id: Q1, letter: 'B', answer_text: 'High press', is_correct: true, ordinal: 2, is_deleted: false },
      { question_id: Q2, letter: 'A', answer_text: 'Simple quick pass', is_correct: true, ordinal: 1, is_deleted: false },
      { question_id: Q2, letter: 'B', answer_text: 'Hold it', is_correct: false, ordinal: 2, is_deleted: false }
    ],
    quiz_attempts: [],
    player_answers: []
  };

  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      lastTable = table;
      let sel = (tables[table] || []).slice();
      const filters: Record<string, any> = {};
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        eq(col: string, val: any) { filters[col] = val; sel = sel.filter(r => r[col] === val); return api; },
        // attachAnswers fetches the option rows for the questions asked.
        in(col: string, vals: any[]) { sel = sel.filter(r => vals.includes(r[col])); return api; },
        insert(newRows: any[]) {
          newRows.forEach(r => inserted.push({ table, ...r }));
          sel = newRows.map((r, i) => ({ attempt_id: `att-${i}`, ...r }));
          return api;
        },
        then(res: any) {
          queries.push({ table, filters });
          return Promise.resolve({ data: sel, error: null }).then(res);
        }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fetching a team\'s quiz', () => {
  it('returns the questions that team has switched on', async () => {
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    expect(qs!.map((q: any) => q.question_id)).toEqual([Q1, Q2]);
  });

  it('flattens each question so the renderer gets one object', async () => {
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    expect(qs![0].question).toBe('What is the primary tactical objective?');
    expect(qs![0].option_b).toBe('High press');
    expect(qs![0].correct_option).toBe('B');
    expect(qs![0].explanation).toBe('Pressing wins the ball high.');
  });

  it('filters by the team, so another squad\'s selection cannot leak in', async () => {
    await supabaseService.fetchTeamQuiz(TEAM);
    expect(queries.find(q => q.table === 'team_quiz_questions')!.filters.team_id).toBe(TEAM);
  });

  it('REFUSES a school code rather than querying with it', async () => {
    // team_id is a uuid; 'bhs' fails the cast with 22P02 and the quiz renders
    // empty, which reads as "no questions" rather than as a failure.
    expect(await supabaseService.fetchTeamQuiz('bhs')).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it('refuses a missing team', async () => {
    expect(await supabaseService.fetchTeamQuiz('')).toBeNull();
    expect(queries).toHaveLength(0);
  });
});

describe('where the options come from', () => {
  it('uses the answer ROWS, not the old option columns', async () => {
    // 0019 moved options out of option_a..d into quiz_answers. The columns are
    // still present during the transition, so a test whose rows and columns
    // agree proves nothing -- these deliberately disagree.
    tables.quiz_answers = [
      { question_id: Q1, letter: 'A', answer_text: 'FROM THE ROWS', is_correct: true, ordinal: 1, is_deleted: false }
    ];
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    const q1 = qs!.find((x: any) => x.question_id === Q1);
    expect(q1.answers.map((a: any) => a.text)).toEqual(['FROM THE ROWS']);
    expect(q1.answers[0].isCorrect).toBe(true);
  });

  it('orders the options by ordinal, not by insertion', async () => {
    tables.quiz_answers = [
      { question_id: Q1, letter: 'B', answer_text: 'second', is_correct: false, ordinal: 2, is_deleted: false },
      { question_id: Q1, letter: 'A', answer_text: 'first', is_correct: true, ordinal: 1, is_deleted: false }
    ];
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    expect(qs!.find((x: any) => x.question_id === Q1).answers.map((a: any) => a.text))
      .toEqual(['first', 'second']);
  });

  it('allows a question with more or fewer than four options', async () => {
    // The reason for the table: four columns could only ever hold four.
    tables.quiz_answers = [
      { question_id: Q1, letter: 'A', answer_text: 'one', is_correct: true, ordinal: 1, is_deleted: false },
      { question_id: Q1, letter: 'B', answer_text: 'two', is_correct: false, ordinal: 2, is_deleted: false },
      { question_id: Q1, letter: 'C', answer_text: 'three', is_correct: false, ordinal: 3, is_deleted: false },
      { question_id: Q1, letter: 'D', answer_text: 'four', is_correct: false, ordinal: 4, is_deleted: false },
      { question_id: Q1, letter: 'E', answer_text: 'five', is_correct: false, ordinal: 5, is_deleted: false }
    ];
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    expect(qs!.find((x: any) => x.question_id === Q1).answers).toHaveLength(5);
  });

  it('falls back to the columns for a question with no rows yet', async () => {
    // A question written before 0019 must still render its options.
    tables.quiz_answers = [];
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    const q1 = qs!.find((x: any) => x.question_id === Q1);
    expect(q1.answers.map((a: any) => a.text)).toEqual(['Low block', 'High press', 'Dribble', 'Long balls']);
    expect(q1.answers.find((a: any) => a.isCorrect).letter).toBe('B');
  });

  it('ignores a deleted option row', async () => {
    tables.quiz_answers = [
      { question_id: Q1, letter: 'A', answer_text: 'kept', is_correct: true, ordinal: 1, is_deleted: false },
      { question_id: Q1, letter: 'B', answer_text: 'gone', is_correct: false, ordinal: 2, is_deleted: true }
    ];
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    expect(qs!.find((x: any) => x.question_id === Q1).answers.map((a: any) => a.text)).toEqual(['kept']);
  });
});

describe('recording an attempt', () => {
  const player = { id: 'player-1', name: 'Kai Nakamura' };
  const answers = [
    { questionId: Q1, selectedOption: 'B', isCorrect: true },
    { questionId: Q2, selectedOption: 'C', isCorrect: false }
  ];

  it('stores the team the attempt belongs to', async () => {
    await supabaseService.saveQuizAttempt(player, answers, 1, 2, TEAM);
    const attempt = inserted.find(r => r.table === 'quiz_attempts');
    expect(attempt.team_id).toBe(TEAM);
  });

  it('stores the real question uuid on each answer', async () => {
    // The old code wrote 1..5 here, into a uuid column.
    await supabaseService.saveQuizAttempt(player, answers, 1, 2, TEAM);
    const saved = inserted.filter(r => r.table === 'player_answers');
    expect(saved.map(a => a.question_id)).toEqual([Q1, Q2]);
  });

  it('drops an answer whose question id is not a uuid rather than failing the batch', async () => {
    // A stale attempt from the hardcoded era would otherwise take the whole
    // insert down with 22P02, losing the attempt as well as the answers.
    await supabaseService.saveQuizAttempt(player, [
      { questionId: 1 as any, selectedOption: 'A', isCorrect: false },
      { questionId: Q2, selectedOption: 'A', isCorrect: true }
    ], 1, 2, TEAM);
    const saved = inserted.filter(r => r.table === 'player_answers');
    expect(saved.map(a => a.question_id)).toEqual([Q2]);
  });

  it('still refuses an attempt with nobody to attribute it to', async () => {
    expect(await supabaseService.saveQuizAttempt({}, answers, 1, 2, TEAM)).toBeNull();
    expect(inserted).toHaveLength(0);
  });

  it('records the attempt even with no team, since a score is still the player\'s', async () => {
    // Unlike a fixture or a plan, an attempt is not lost by being unscoped --
    // it still belongs to a named person and shows on their own history.
    const res = await supabaseService.saveQuizAttempt(player, answers, 1, 2, '');
    expect(res).not.toBeNull();
    const attempt = inserted.find(r => r.table === 'quiz_attempts');
    expect(attempt.team_id).toBeNull();
  });
});
