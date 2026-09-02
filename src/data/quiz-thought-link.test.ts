/**
 * Tying a quiz question to the daily message it tests.
 *
 * Three of the seeded questions ask about "today's focus" but nothing connected
 * them to a message, so changing the message left them testing a focus that no
 * longer existed. A question may now name one.
 *
 * Two rules carry the weight:
 *
 * 1. A question that names a message is asked only while that message is
 *    ACTIVE. One that names none is evergreen and always asked. That is what
 *    makes "today's quiz" follow today's focus without the coach rebuilding it.
 *
 * 2. An imported question is matched on its import key, not its text. Coaches
 *    reword questions; matching on text would create a duplicate every time a
 *    typo was fixed, which is the common case rather than the rare one.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';
const SCHOOL = '7ebbe980-b87e-421f-a11f-788ca2519504';
const THOUGHT_LIVE = 'aaaaaaaa-0000-0000-0000-000000000001';
const THOUGHT_OLD = 'bbbbbbbb-0000-0000-0000-000000000002';
const Q_EVERGREEN = '11111111-1111-1111-1111-111111111111';
const Q_TODAY = '22222222-2222-2222-2222-222222222222';
const Q_STALE = '33333333-3333-3333-3333-333333333333';

let sent: any[];
let tables: Record<string, any[]>;

const q = (id: string, thought: string | null, text: string) => ({
  question_id: id, question: text,
  option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D',
  correct_option: 'B', explanation: null, category: 'Tactical',
  thought_id: thought, school_id: SCHOOL, is_deleted: false
});

beforeEach(() => {
  sent = [];
  tables = {
    daily_thoughts: [
      { id: THOUGHT_LIVE, team_id: TEAM, title: 'Week 3 - High Press', thoughts_text: 'Press high.', is_active: true, is_deleted: false },
      { id: THOUGHT_OLD, team_id: TEAM, title: 'Week 2 - Low Block', thoughts_text: 'Sit deep.', is_active: false, is_deleted: false }
    ],
    team_quiz_questions: [
      { team_id: TEAM, question_id: Q_EVERGREEN, quiz_questions: q(Q_EVERGREEN, null, 'What is our formation?') },
      { team_id: TEAM, question_id: Q_TODAY, quiz_questions: q(Q_TODAY, THOUGHT_LIVE, "What is today's focus?") },
      { team_id: TEAM, question_id: Q_STALE, quiz_questions: q(Q_STALE, THOUGHT_OLD, 'Why sit deep?') }
    ],
    quiz_questions: [q(Q_EVERGREEN, null, 'What is our formation?')],
    quiz_answers: []
  };

  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      let sel = (tables[table] || []).slice();
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        limit() { return api; },
        eq(col: string, val: any) { sel = sel.filter(r => r[col] === val); return api; },
        // attachAnswers reads the option rows for the questions asked.
        in(col: string, vals: any[]) { sel = sel.filter(r => vals.includes(r[col])); return api; },
        delete() { return api; },
        maybeSingle: async () => ({ data: sel[0] || null, error: null }),
        upsert(rows: any[]) {
          rows.forEach(r => sent.push({ table, ...r }));
          sel = rows.map(r => ({ question_id: r.question_id || 'new-q', ...r }));
          return api;
        },
        insert(rows: any[]) {
          rows.forEach(r => sent.push({ table, ...r }));
          sel = rows;
          return api;
        },
        then(res: any) { return Promise.resolve({ data: sel, error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('which questions a team is asked', () => {
  it('always asks a question that names no message', async () => {
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    expect(qs!.map((x: any) => x.question_id)).toContain(Q_EVERGREEN);
  });

  it('asks a question tied to the ACTIVE message', async () => {
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    expect(qs!.map((x: any) => x.question_id)).toContain(Q_TODAY);
  });

  it('does NOT ask a question tied to a message that is no longer active', async () => {
    // The whole point: last week's questions stop being asked on their own.
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    expect(qs!.map((x: any) => x.question_id)).not.toContain(Q_STALE);
  });

  it('falls back to evergreen questions only when no message is active', async () => {
    tables.daily_thoughts.forEach(t => { t.is_active = false; });
    const qs = await supabaseService.fetchTeamQuiz(TEAM);
    expect(qs!.map((x: any) => x.question_id)).toEqual([Q_EVERGREEN]);
  });
});

describe('saving a question', () => {
  it('sets the organization, so the question is reachable at all', async () => {
    // 0017 gave the bank a school_id and this method never set one, so every
    // imported question belonged to nobody and appeared in no quiz.
    await supabaseService.upsertQuizQuestion({
      question: 'What is our formation?', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd',
      correct_option: 'B', schoolId: SCHOOL
    });
    expect(sent.find(r => r.table === 'quiz_questions').school_id).toBe(SCHOOL);
  });

  it('stores the import key so a reworded question still matches', async () => {
    await supabaseService.upsertQuizQuestion({
      question: 'What is our formation?', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd',
      correct_option: 'B', schoolId: SCHOOL, importKey: 'PRESS-01'
    });
    expect(sent.find(r => r.table === 'quiz_questions').import_key).toBe('PRESS-01');
  });

  it('reuses the existing question when the key already exists', async () => {
    // Reworded, same key: this must UPDATE rather than add a second question.
    tables.quiz_questions = [{ ...q(Q_TODAY, null, 'Old wording'), import_key: 'PRESS-01' }];
    await supabaseService.upsertQuizQuestion({
      question: 'New wording entirely', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd',
      correct_option: 'B', schoolId: SCHOOL, importKey: 'PRESS-01'
    });
    const row = sent.find(r => r.table === 'quiz_questions');
    expect(row.question_id).toBe(Q_TODAY);
    expect(row.question).toBe('New wording entirely');
  });

  it('links the question to the message it tests', async () => {
    await supabaseService.upsertQuizQuestion({
      question: "What is today's focus?", option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd',
      correct_option: 'B', schoolId: SCHOOL, thoughtId: THOUGHT_LIVE
    });
    expect(sent.find(r => r.table === 'quiz_questions').thought_id).toBe(THOUGHT_LIVE);
  });

  it('refuses a question with no organization rather than orphaning it', async () => {
    const res = await supabaseService.upsertQuizQuestion({
      question: 'Orphan', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_option: 'A'
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/organization|team/i);
    expect(sent).toHaveLength(0);
  });
});

describe('finding a message by its title', () => {
  it('resolves the title a spreadsheet names', async () => {
    const id = await supabaseService.findThoughtIdByTitle(TEAM, 'Week 3 - High Press');
    expect(id).toBe(THOUGHT_LIVE);
  });

  it('ignores case and surrounding spaces, as a typed column will vary', async () => {
    const id = await supabaseService.findThoughtIdByTitle(TEAM, '  week 3 - high press ');
    expect(id).toBe(THOUGHT_LIVE);
  });

  it('returns null for a title that does not exist, so the import can say so', async () => {
    // A number would be indistinguishable from a valid one here; a title is
    // checkable, which is the reason for choosing it.
    expect(await supabaseService.findThoughtIdByTitle(TEAM, 'Week 9 - Nonsense')).toBeNull();
  });
});
