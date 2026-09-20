/**
 * An attempt is written with columns the tables actually have.
 *
 * `saveQuizAttempt` sent `percentage`, which `quiz_attempts` has never had --
 * it is derived by the `quiz_results` view. PostgREST refused every insert, so
 * every player who finished the quiz was told "Scored here, but the attempt
 * was not recorded" and production's `quiz_attempts` stayed empty. The mocked
 * client in the other quiz tests accepts any column, so only the real schema
 * can hold this.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';
import { supabaseService } from '../supabase';

const available = await hasTestDb();

const Q = '33333333-3333-3333-3333-333333333333';
const TEAM = '11111111-2222-3333-4444-555555555555';

/** The payload the app would send, captured from the service itself. */
async function written(): Promise<Record<string, any[]>> {
  const rows: Record<string, any[]> = { quiz_attempts: [], player_answers: [] };
  const svc = supabaseService as any;
  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      return {
        insert(payload: any) {
          rows[table] = (rows[table] || []).concat(payload);
          const result = { data: [{ attempt_id: '44444444-4444-4444-4444-444444444444' }], error: null };
          return {
            select: async () => result,
            then: (res: any) => Promise.resolve({ data: null, error: null }).then(res)
          };
        }
      };
    }
  };
  await svc.saveQuizAttempt(
    { id: '22222222-2222-2222-2222-222222222222', name: 'Kai Nakamura' },
    [{ questionId: Q, selectedOption: 'B', isCorrect: true }],
    1, 2, TEAM
  );
  return rows;
}

const columnsOf = async (db: any, table: string): Promise<string[]> =>
  (await db.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table]
  )).rows.map((r: any) => r.column_name);

describe.skipIf(!available)('the columns an attempt is written with', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('all exist on quiz_attempts', async () => {
    const rows = await written();
    await withDb(async (db) => {
      const columns = await columnsOf(db, 'quiz_attempts');
      expect(rows.quiz_attempts.length).toBeGreaterThan(0);
      for (const key of Object.keys(rows.quiz_attempts[0])) expect(columns).toContain(key);
    });
  });

  it('all exist on player_answers', async () => {
    const rows = await written();
    await withDb(async (db) => {
      const columns = await columnsOf(db, 'player_answers');
      expect(rows.player_answers.length).toBeGreaterThan(0);
      for (const key of Object.keys(rows.player_answers[0])) expect(columns).toContain(key);
    });
  });

  it('percentage is the view\'s to work out, not a column to write', async () => {
    await withDb(async (db) => {
      expect(await columnsOf(db, 'quiz_attempts')).not.toContain('percentage');
      expect(await columnsOf(db, 'quiz_results')).toContain('percentage');
    });
  });
});
