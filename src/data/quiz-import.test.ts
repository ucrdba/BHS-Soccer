/**
 * Tests for quiz-question import.
 *
 * The bug: the import dropdown offered "Quiz Questions Bank", the sheet
 * detector resolved it to the target 'quiz', and then no branch in the chain
 * handled it. The loop fell straight through and reported "Imported 0
 * records" — indistinguishable from an empty file, so it read as a bad CSV
 * rather than a missing feature. 'matrix' had the same hole.
 *
 * So there are two things worth holding: that quiz rows now actually import,
 * and that a target with no branch says so instead of silently reporting zero.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { supabaseService } from './supabase';

interface Captured { table: string; rows: Record<string, any>[] }

let captured: Captured[];
let insertError: { code?: string; message: string } | null;
let insertRows: Record<string, any>[];

const svc = supabaseService as any;

beforeEach(() => {
  captured = [];
  insertError = null;
  insertRows = [{ question_id: 'qq-1' }];

  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      return {
        upsert(rows: Record<string, any>[]) {
          captured.push({ table, rows });
          return { select: async () => ({ data: insertError ? null : insertRows, error: insertError }) };
        }
      };
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const payload = () => captured[0].rows[0];

// The shape of a row from the live table export the coach actually used.
// Every question must name an organization now: 0017 gave the bank a
// school_id, and one written without it belongs to nobody and is asked in no
// quiz. upsertQuizQuestion refuses rather than writing an unreachable row.
const SCHOOL = '7ebbe980-b87e-421f-a11f-788ca2519504';

const dbRow = (over: Record<string, any> = {}) => ({
  schoolId: SCHOOL,
  question_id: '1',
  question: 'Why are fewer touches encouraged?',
  option_a: 'It moves the ball faster',
  option_b: 'It guarantees a goal',
  option_c: 'It helps the defence organise',
  option_d: 'It removes the need for skill',
  correct_option: 'A',
  explanation: 'Fewer touches raise speed of play.',
  category: 'Speed of Play',
  is_deleted: 'FALSE',
  ...over
});

describe('upsertQuizQuestion', () => {
  it('writes a row from a straight database export', async () => {
    const res = await supabaseService.upsertQuizQuestion(dbRow());
    expect(res.ok).toBe(true);
    expect(captured[0].table).toBe('quiz_questions');
    expect(payload().question).toBe('Why are fewer touches encouraged?');
    // The options are no longer columns on the question -- they are rows in
    // quiz_answers (0019), so the question row must not carry them.
    expect(payload().option_a).toBeUndefined();
    expect(payload().option_d).toBeUndefined();
    expect(payload().correct_option).toBe('A');
  });

  it('drops a spreadsheet row number rather than sending it as a key', async () => {
    // question_id is a UUID column. The exported CSV carried "1", a row
    // number, which would fail the cast and reject the whole row.
    await supabaseService.upsertQuizQuestion(dbRow({ question_id: '1' }));
    expect(payload().question_id).toBeUndefined();
  });

  it('keeps a real uuid so re-importing updates instead of duplicating', async () => {
    const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    await supabaseService.upsertQuizQuestion(dbRow({ question_id: uuid }));
    expect(payload().question_id).toBe(uuid);
  });

  it('normalises the correct answer to a single upper-case letter', async () => {
    await supabaseService.upsertQuizQuestion(dbRow({ correct_option: 'b' }));
    expect(payload().correct_option).toBe('B');
  });

  it('rejects a correct answer that names none of the options', async () => {
    // 'E' with only A-D supplied leaves the question unanswerable. Caught here
    // in plain words rather than stored and marked wrong for every player.
    const res = await supabaseService.upsertQuizQuestion(dbRow({ correct_option: 'E' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no correct answer/i);
    expect(captured).toHaveLength(0);
  });

  it('accepts three options, now that they are rows rather than four columns', async () => {
    // The reason for the answers table (0019): four columns could only ever
    // hold four. A blank option is simply not an option.
    const res = await supabaseService.upsertQuizQuestion(dbRow({ option_c: '   ' }));
    expect(res.ok).toBe(true);
  });

  it('still refuses a question with fewer than two options', async () => {
    const res = await supabaseService.upsertQuizQuestion(
      dbRow({ option_b: '', option_c: '', option_d: '' })
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/at least two/i);
    expect(captured).toHaveLength(0);
  });

  it('requires question text', async () => {
    const res = await supabaseService.upsertQuizQuestion(dbRow({ question: '' }));
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it('defaults the category rather than writing an empty one', async () => {
    await supabaseService.upsertQuizQuestion(dbRow({ category: '' }));
    expect(payload().category).toBe('Tactical');
  });

  it('reads is_deleted from the string a spreadsheet produces', async () => {
    expect((await supabaseService.upsertQuizQuestion(dbRow({ is_deleted: 'FALSE' }))).ok).toBe(true);
    expect(payload().is_deleted).toBe(false);
    captured = [];
    await supabaseService.upsertQuizQuestion(dbRow({ is_deleted: 'TRUE' }));
    expect(payload().is_deleted).toBe(true);
  });

  it('stores a missing explanation as null, not an empty string', async () => {
    await supabaseService.upsertQuizQuestion(dbRow({ explanation: '' }));
    expect(payload().explanation).toBeNull();
  });

  it('reports an RLS refusal rather than claiming success', async () => {
    // A denied write returns no error and no rows. Counting that as imported
    // is how a coach ends up believing a bank of questions is loaded.
    insertRows = [];
    const res = await supabaseService.upsertQuizQuestion(dbRow());
    expect(res.ok).toBe(false);
    expect(res.error).toContain('admin');
  });

  it('reports an unconfigured client instead of throwing', async () => {
    svc.isConfigured = () => false;
    const res = await supabaseService.upsertQuizQuestion(dbRow());
    expect(res.ok).toBe(false);
  });
});
