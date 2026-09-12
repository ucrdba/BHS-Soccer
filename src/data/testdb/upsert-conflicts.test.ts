/**
 * Every upsert has an index to conflict on.
 *
 * PostgREST turns `.upsert(row, { onConflict: 'a,b' })` into
 * `on conflict (a, b)`, which Postgres refuses with 42P10 unless a unique
 * index covers exactly those columns. Production carries indexes that no
 * migration creates, so an upsert can work there for years and fail on any
 * database built from the migrations -- the demo, a fresh project, a test
 * database. It cost three separate bugs before this test existed: the drill
 * library (0033), and twice inside 0027 itself.
 *
 * So: read every conflict target out of the client, build the schema the way
 * the nightly rebuild does, and check each target against the real indexes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';
import { schemaSteps, runSteps } from '../../../scripts/demo-rebuild-lib.mjs';

const available = await hasTestDb();

/**
 * `.from('x') … .upsert(…, { onConflict: 'a,b' })`, as the client writes it.
 *
 * Comments are stripped first: one of them documents a method that is
 * deliberately NOT an upsert, quoting the call it is not, and reading that as
 * a real target had this test demanding an index for it.
 */
export function conflictTargets(source: string): { table: string; columns: string[] }[] {
  // Block comments, and line comments that start their own line: a trailing
  // `//` is left alone so a URL inside a string cannot be mangled.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  const found: { table: string; columns: string[] }[] = [];
  const re = /\.from\(\s*'([a-z_]+)'\s*\)[\s\S]{0,600}?onConflict:\s*'([^']+)'/g;
  for (const m of code.matchAll(re)) {
    found.push({ table: m[1], columns: m[2].split(',').map(s => s.trim()).sort() });
  }
  return found;
}

const key = (t: string, cols: string[]) => `${t}(${[...cols].sort().join(', ')})`;

describe.skipIf(!available)('every upsert has an index to conflict on', () => {
  beforeAll(async () => { await setupDb([]); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('finds the conflict targets the client actually uses', () => {
    const targets = conflictTargets(readFileSync(join(process.cwd(), 'src/data/supabase.ts'), 'utf8'));
    expect(targets.length).toBeGreaterThan(5);
    expect(targets.map(t => key(t.table, t.columns))).toContain('drills_bank(name, school_id)');
  });

  it('reads code, not the comment that quotes a call it does not make', () => {
    const source = `
      /** This is NOT a .from('players') upsert, { onConflict: 'team_id,player_id' }. */
      await this.client.from('schools').upsert([row], { onConflict: 'code' });
    `;
    expect(conflictTargets(source)).toEqual([{ table: 'schools', columns: ['code'] }]);
  });

  it('matches every one of them against the rebuilt schema', async () => {
    await withDb(async (c) => {
      await runSteps(c, schemaSteps(process.cwd()));

      const { rows } = await c.query(`
        -- ::text throughout: array_agg over a name column gives an unparsed
        -- name[], which the driver hands back as the string "{code,id}".
        select t.relname::text as table_name,
               array_agg(a.attname::text order by a.attname::text) as columns
          from pg_index i
          join pg_class t on t.oid = i.indrelid
          join pg_namespace n on n.oid = t.relnamespace
          join pg_attribute a on a.attrelid = t.oid and a.attnum = any (i.indkey)
         where i.indisunique and not i.indpred is distinct from null and n.nspname = 'public'
         group by t.relname, i.indexrelid`);

      const available = new Set(rows.map((r: any) => key(r.table_name, r.columns)));
      const targets = conflictTargets(readFileSync(join(process.cwd(), 'src/data/supabase.ts'), 'utf8'));

      const missing = targets
        .map(t => key(t.table, t.columns))
        .filter(k => !available.has(k))
        .sort();

      // Names the target and the table's real unique indexes, so a failure
      // says what to write rather than only that something is wrong.
      expect(missing, `no unique index for: ${missing.join(' | ')}\nthe schema has: ${[...available].sort().join(' | ')}`)
        .toEqual([]);
    });
  }, 180_000);
});
