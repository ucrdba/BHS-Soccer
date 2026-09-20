/**
 * 0040 — the public stops being able to read every player's quiz score.
 *
 * quiz_attempts' own policy admits the player whose row it is, plus coaches
 * and admins. The quiz_results VIEW over it ran as its owner, so that policy
 * never applied, and anon held a select grant from the original schema: a
 * signed-out caller could read a minor's name, their score and the date. It
 * answered on production, empty only because no attempt had ever saved.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0040_quiz_results_security.sql'), 'utf8');

/** Without its own transaction control: withDb has already opened one. */
const apply = (c: any) => c.query(MIGRATION.replace(/^\s*(begin|commit|set role postgres)\s*;\s*$/gim, ''));

const mayRead = async (c: any, role: string): Promise<boolean> =>
  (await c.query(`select has_table_privilege($1, 'public.quiz_results', 'SELECT') as ok`, [role])).rows[0].ok;

const invoker = async (c: any): Promise<boolean> => {
  const res = await c.query(
    `select coalesce(array_to_string(c.reloptions, ','), '') as opts
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'quiz_results'`);
  return /security_invoker\s*=\s*(on|true)/i.test(res.rows[0]?.opts || '');
};

const version = async (c: any): Promise<number> =>
  Number((await c.query(`show server_version_num`)).rows[0].server_version_num);

describe.skipIf(!available)('0040: quiz scores are not public', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('is the state the database was in before it: anon could read the view', async () => {
    await withDb(async (c) => {
      expect(await mayRead(c, 'anon')).toBe(true);
    });
  });

  it('takes the view away from anon', async () => {
    await withDb(async (c) => {
      await apply(c);
      expect(await mayRead(c, 'anon')).toBe(false);
    });
  });

  it('makes the view apply the caller\'s own permissions, where the server can', async () => {
    await withDb(async (c) => {
      await apply(c);
      if (await version(c) >= 150000) {
        expect(await invoker(c)).toBe(true);
        // Safe to read again: quiz_attempts' policy is what answers now.
        expect(await mayRead(c, 'authenticated')).toBe(true);
      } else {
        expect(await mayRead(c, 'authenticated')).toBe(false);
      }
    });
  });

  it('leaves the attempts table and its policy alone', async () => {
    await withDb(async (c) => {
      await apply(c);
      const rows = await c.query(
        `select relrowsecurity from pg_class where oid = 'public.quiz_attempts'::regclass`);
      expect(rows.rows[0].relrowsecurity).toBe(true);
      expect(await mayRead(c, 'authenticated')).toBeDefined();
    });
  });

  it('runs on a database that has no such view, as the demo rebuild may', async () => {
    await withDb(async (c) => {
      await c.query('drop view if exists public.quiz_results');
      await expect(apply(c)).resolves.toBeTruthy();
    });
  });
});
