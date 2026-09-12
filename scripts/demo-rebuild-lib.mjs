/**
 * The demo database's rebuild, as SQL.
 *
 * Assembled in one place so the nightly job (scripts/demo-rebuild.mjs) and the
 * database tests (src/data/testdb/demo-*.test.ts) run exactly the same
 * statements. Spec: docs/superpowers/specs/2026-09-11-demo-accounts-design.md §5.
 *
 * Every substitution below uses a replacer FUNCTION. String.prototype.replace
 * treats "$$" in a replacement STRING as an escaped "$", so substituting SQL
 * in with a string collapses every `as $$` to `as $` and breaks every function
 * body. src/demo-rebuild-lib.test.ts pins it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** Production's Supabase project. The rebuild refuses any address containing it. */
export const PRODUCTION_REF = 'arsigevpgpbqluqbnhjr';

/** The provisioning scripts, in the order CLAUDE.md documents. seed_data.sql is Beaumont's, and absent. */
export const BASE = ['supabase_schema.sql', 'schema_roles.sql', 'supabase_migration_auth.sql'];

/** Migrations that are data changes against Beaumont's rows, not schema, and why. */
export const SKIP = {
  '0006_move_club_teams_to_legends_fc.sql':
    'Data. Moves two teams named by hardcoded production UUIDs; matches nothing here.',
  '0007_assign_coaches_to_club_teams.sql':
    'Data, and it would abort the run: it raises when the coach email it names has no active profile, which on a fresh database is always.',
  '0012_set_drill_weights.sql':
    "Data. Sets weights on drills named in Beaumont's bank; the demo's drills come from demo_seed.sql."
};

/** Statements cut from files that are otherwise structural. Each must match exactly once. */
export const CUTS = [
  {
    file: '0005_multi_team_schema.sql',
    find: `insert into public.teams (school_id, name, season, is_public_default)
values ('7ebbe980-b87e-421f-a11f-788ca2519504', 'Varsity', '2026', true)
on conflict (school_id, name) do nothing;`,
    why: "Beaumont's Varsity team, by literal school UUID: a foreign-key violation (23503) on an empty database, which aborts the migration."
  }
];

/**
 * Applied straight after supabase_schema.sql. It declares columns production
 * never had: drills_bank.duration (NOT NULL, so 0009's self-check insert fails
 * on it) and soccer_categories.school_id (which 0027 later adds back).
 */
export const RECONCILE = [
  'alter table public.drills_bank       drop column if exists duration;',
  'alter table public.soccer_categories drop column if exists school_id;'
];

/**
 * Everything in `public` goes, and comes back with Supabase's standard grants.
 * auth.users and Supabase's other schemas are untouched. The extensions are
 * re-created for a plain Postgres (the test harness) where they live in
 * `public`; on Supabase they live in `extensions` and these are no-ops.
 */
export const WIPE_SQL = `
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
`;

/**
 * Refuses a database containing Beaumont or Legends FC before anything is
 * dropped. Dynamic SQL, because on an empty database public.schools does not
 * exist and a static reference would fail to plan.
 */
export const GUARD_SQL = `
do $$
declare
  found boolean;
begin
  if to_regclass('public.schools') is null then
    return;
  end if;
  execute 'select exists (select 1 from public.schools where code in (''bhs'', ''lfc''))' into found;
  if found then
    raise exception 'REFUSING TO REBUILD: this database contains Beaumont High School or Legends FC, so it is production.';
  end if;
end $$;
`;

/** Throws, with the reason, unless the target is unmistakably the demo project. */
export function checkTarget(connectionString, demoRef) {
  const url = String(connectionString ?? '').trim();
  const ref = String(demoRef ?? '').trim();
  if (!url) throw new Error('DEMO_DATABASE_URL is not set.');
  if (!ref) throw new Error('DEMO_PROJECT_REF is not set.');
  if (ref === PRODUCTION_REF) {
    throw new Error(`DEMO_PROJECT_REF is production's ref (${PRODUCTION_REF}). Refusing.`);
  }
  if (url.includes(PRODUCTION_REF)) {
    throw new Error(`DEMO_DATABASE_URL points at production (${PRODUCTION_REF}). Refusing.`);
  }
  if (!url.includes(ref)) {
    throw new Error(`DEMO_DATABASE_URL does not contain DEMO_PROJECT_REF (${ref}). Refusing.`);
  }
}

/** Today in California, as YYYY-MM-DD. The sample season is dated from it. */
export function pacificDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Each file's own `begin;` / `commit;` lines, removed: the rebuild runs
 * everything in one transaction, and a nested commit would end it early.
 */
export function stripTransactionControl(sql) {
  return sql.replace(/^\s*(begin|commit)\s*;\s*$/gim, '');
}

export function readSql(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

export function migrationFiles(repo) {
  return readdirSync(join(repo, 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).sort();
}

export function applyCuts(file, body) {
  let out = body;
  for (const cut of CUTS) {
    if (cut.file !== file) continue;
    const hits = out.split(cut.find).length - 1;
    if (hits !== 1) {
      throw new Error(
        `${file}: the statement to cut must match exactly once and matched ${hits} times. `
        + 'The file was edited -- update CUTS in scripts/demo-rebuild-lib.mjs.');
    }
    out = out.replace(cut.find, () => `-- [demo rebuild] statement removed: ${cut.why}`);
  }
  return out;
}

/** The provisioning scripts and every migration, as the rebuild applies them. */
export function schemaSteps(repo) {
  const steps = [];
  for (const file of BASE) {
    steps.push({ label: file, sql: stripTransactionControl(readSql(join(repo, file))) });
    if (file === 'supabase_schema.sql') steps.push({ label: 'reconcile', sql: RECONCILE.join('\n') });
  }
  for (const file of migrationFiles(repo)) {
    if (file in SKIP) continue;
    const body = applyCuts(file, readSql(join(repo, 'supabase', 'migrations', file)));
    steps.push({ label: file, sql: stripTransactionControl(body) });
  }
  return steps;
}

/**
 * `__DEMO_DIAGRAM_<KEY>__` becomes the diagram as dollar-quoted JSON. Every
 * token must have a diagram: a leftover token is invalid SQL, and failing here
 * names it.
 */
export function substituteDiagrams(sql, diagrams) {
  let out = sql;
  for (const [key, value] of Object.entries(diagrams)) {
    const token = `__DEMO_DIAGRAM_${key.toUpperCase()}__`;
    out = out.split(token).join(`$diagram$${JSON.stringify(value)}$diagram$`);
  }
  const left = out.match(/__DEMO_DIAGRAM_[A-Z0-9_]+?__/);
  if (left) throw new Error(`No diagram for ${left[0]} in Resouces/SQL/demo/demo_diagrams.json.`);
  return out;
}

/** Runs each step on a pg client; a failure names the step it came from. */
export async function runSteps(client, steps) {
  for (const step of steps) {
    try {
      await client.query(step.sql);
    } catch (err) {
      throw new Error(`${step.label}: ${err.message}`);
    }
  }
}

const DEMO_SQL = ['Resouces', 'SQL', 'demo'];

/** demo_seed.sql, with the three captured diagrams put in. */
export function seedSql(repo) {
  const diagrams = JSON.parse(readFileSync(join(repo, ...DEMO_SQL, 'demo_diagrams.json'), 'utf8'));
  const sql = readSql(join(repo, ...DEMO_SQL, 'demo_seed.sql'));
  return stripTransactionControl(substituteDiagrams(sql, diagrams));
}

/** demo_accounts.sql: the nine accounts' copies, their profiles, and the locks. */
export function accountsSql(repo) {
  return stripTransactionControl(readSql(join(repo, ...DEMO_SQL, 'demo_accounts.sql')));
}

/**
 * The whole rebuild, in order. One transaction: if any step fails, it all
 * rolls back and last night's demo stays up.
 */
export function rebuildSteps(repo, asOf) {
  if (!isIsoDate(asOf)) throw new Error(`Not a date (YYYY-MM-DD): ${asOf}`);
  return [
    { label: 'guard', sql: GUARD_SQL },
    { label: 'wipe', sql: WIPE_SQL },
    ...schemaSteps(repo),
    { label: 'demo_seed.sql', sql: seedSql(repo) },
    { label: 'the sample program', sql: `select public.demo_seed_template('${asOf}'::date);` },
    { label: 'demo_accounts.sql', sql: accountsSql(repo) },
    { label: 'the nine accounts', sql: 'select public.demo_build_accounts();' },
    { label: 'reload the API', sql: `notify pgrst, 'reload schema';` }
  ];
}

/**
 * What a connection string points at, with nothing secret in it.
 *
 * A failing connection says little on its own: Supabase's session pooler
 * reports every bad password against the user it maps to upstream, and a
 * GitHub secret cannot be read back to compare. So the password appears only
 * as a length and the whole string as a short fingerprint, which whoever
 * stored it can reproduce from their own copy.
 */
export function connectionInfo(url) {
  const u = new URL(url.trim());
  return {
    user: decodeURIComponent(u.username),
    host: u.hostname,
    port: u.port || '5432',
    database: u.pathname.replace(/^\//, '') || '(none)',
    passwordLength: u.password.length,
    fingerprint: fingerprint(url)
  };
}

/** The first 8 hex of sha256 over the trimmed string. */
export function fingerprint(url) {
  return createHash('sha256').update(String(url).trim()).digest('hex').slice(0, 8);
}

/**
 * The string without sslmode, so it cannot override the ssl option the client
 * sets. Removed textually: `new URL(s).toString()` can re-encode the password,
 * and pg parses the original string itself.
 */
export function withoutSslmode(url) {
  return String(url).trim()
    .replace(/([?&])sslmode=[^&]*/gi, '$1')
    .replace(/\?&/, '?')
    .replace(/[?&]+$/, '');
}
