/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Vitest runs each `npm test` in a fresh shell with no exported env vars, so
 * process.env.TEST_DATABASE_URL is normally unset here even on a machine that
 * has a local Postgres set up for this. Fall back to a gitignored
 * `.env.test` at the repo root (a single `TEST_DATABASE_URL=...` line) before
 * giving up and pointing at the same default the brief specifies. No dotenv
 * dependency for one line: a small regex over the file is enough.
 */
function resolveTestDbUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  try {
    const contents = readFileSync(join(process.cwd(), '.env.test'), 'utf8');
    const match = contents.match(/^\s*TEST_DATABASE_URL\s*=\s*(.*)\s*$/m);
    if (match) {
      // Strip a wrapping quote pair and any trailing comment/whitespace, same
      // as a shell would when sourcing KEY=value.
      const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (value) return value;
    }
  } catch {
    // No .env.test — fall through to the hardcoded default.
  }

  return 'postgres://postgres:postgres@localhost:5432/postgres';
}

export const TEST_DB_URL = resolveTestDbUrl();

/**
 * Prefix for the scratch database. Never the database in TEST_DB_URL itself —
 * that one is not ours to drop.
 *
 * Vitest's default isolation runs test files in separate workers/processes,
 * and with no `fileParallelism: false` in vitest.config.mts those files run
 * concurrently. A single fixed name here would mean two files calling
 * setupDb() at once race on the same database: whichever's `drop database
 * ... with (force)` lands second forcibly terminates the other file's live
 * connections mid-test. Each setupDb() call therefore gets its own uniquely
 * named database, held in module state so the matching teardownDb() knows
 * which one to drop.
 */
const SCRATCH_PREFIX = 'bhs_demo_test_';

const DEMO_SQL = join(process.cwd(), 'Resouces', 'SQL', 'demo');
const PRELUDE = join(process.cwd(), 'src', 'data', 'testdb', 'prelude.sql');

let pool: pg.Pool | null = null;
let scratchName: string | null = null;
// Per-module-instance, not process-wide: vitest's default isolation gives each
// test file its own module registry, so this cache is scoped to one test
// file's run of hasTestDb(), not shared across files.
let reachable: boolean | null = null;

/** False when no Postgres answers, so a machine without one still runs the rest of the suite. */
export async function hasTestDb(): Promise<boolean> {
  if (reachable !== null) return reachable;
  const probe = new pg.Client({ connectionString: TEST_DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await probe.connect();
    await probe.end();
    reachable = true;
  } catch {
    reachable = false;
  }
  return reachable;
}

/**
 * Builds a fresh, uniquely-named scratch database: prelude, then the demo
 * files in their documented apply order. A new name every call means two
 * test files can run setupDb() concurrently without one dropping the other's
 * database out from under it.
 */
export async function setupDb(files: string[] = ['demo_schema.sql', 'demo_auth_open.sql']) {
  scratchName = `${SCRATCH_PREFIX}${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const admin = new pg.Client({ connectionString: TEST_DB_URL });
  await admin.connect();
  await admin.query(`create database ${scratchName}`);
  await admin.end();

  const url = new URL(TEST_DB_URL);
  url.pathname = `/${scratchName}`;
  pool = new pg.Pool({ connectionString: url.toString() });

  const c = await pool.connect();
  try {
    await c.query(readFileSync(PRELUDE, 'utf8'));
    for (const f of files) await c.query(readFileSync(join(DEMO_SQL, f), 'utf8'));
  } finally {
    c.release();
  }
}

/**
 * Ends the pool first — an open session on the scratch database blocks its
 * drop — then drops the database this call's setupDb() created. The drop is
 * best-effort: a failure here leaves a harmless leaked scratch database, but
 * must not fail the test run (that would mask whatever the tests themselves
 * found), and must not vanish silently either, so it's logged instead of
 * swallowed.
 */
export async function teardownDb() {
  await pool?.end();
  pool = null;

  const name = scratchName;
  scratchName = null;
  if (!name) return;

  const admin = new pg.Client({ connectionString: TEST_DB_URL });
  try {
    await admin.connect();
    await admin.query(`drop database if exists ${name} with (force)`);
  } catch (err) {
    console.error(`testdb harness: failed to drop scratch database ${name}`, err);
  } finally {
    await admin.end().catch(() => {});
  }
}

/** Runs fn in a transaction that is always rolled back, so tests cannot see each other's writes. */
export async function withDb(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  if (!pool) throw new Error('setupDb() has not run');
  const c = await pool.connect();
  try {
    await c.query('begin');
    await fn(c);
  } finally {
    await c.query('rollback').catch(() => {});
    c.release();
  }
}
