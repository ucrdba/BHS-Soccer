/**
 * Builds Resouces/SQL/demo/demo_schema.sql — every structural migration,
 * concatenated, to stand up a fresh demo Supabase project.
 *
 * Run:  npm run demo:schema
 *
 * WHY THIS IS GENERATED. The demo project is a second database that must
 * receive every migration production gets, forever. The spec names hand
 * maintenance of that file as the largest ongoing risk in the whole demo
 * design, so the file is regenerated from supabase/migrations/ instead. If a
 * migration is added and this is not re-run, the two databases drift.
 *
 * Adding a migration? Run this. It FAILS if it finds a migration it has never
 * been told about, so the drift surfaces as a build error rather than as a
 * demo that quietly lacks a column.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MIGRATIONS = join(REPO, 'supabase', 'migrations');
const OUT = join(REPO, 'Resouces', 'SQL', 'demo', 'demo_schema.sql');

// The provisioning scripts, in the order CLAUDE.md documents. seed_data.sql is
// deliberately absent: it is Beaumont's demo data, and the demo project's
// template comes from demo_seed.sql instead.
const BASE = [
  'supabase_schema.sql',
  'schema_roles.sql',
  'supabase_migration_auth.sql'
];

// Migrations that must NOT run against the demo project, and why. Every one is
// a data change against Beaumont's rows rather than a change to the schema.
const SKIP = {
  '0006_move_club_teams_to_legends_fc.sql':
    'Data. Moves two teams named by hardcoded production UUIDs; matches nothing here.',
  '0007_assign_coaches_to_club_teams.sql':
    'Data, AND it would abort the run: it raises an exception when the coach email it names has no active profile, which on a fresh project is always.',
  '0012_set_drill_weights.sql':
    'Data. Sets weights on drills named in Beaumont\'s bank; the demo\'s drills come from demo_seed.sql.'
};

// Statements cut from a file that is otherwise structural. Each `find` must
// match exactly once — if a source file is edited so it no longer does, this
// script fails rather than emitting SQL that breaks halfway through.
const CUTS = [
  {
    file: '0005_multi_team_schema.sql',
    find: `insert into public.teams (school_id, name, season, is_public_default)
values ('7ebbe980-b87e-421f-a11f-788ca2519504', 'Varsity', '2026', true)
on conflict (school_id, name) do nothing;`,
    why: 'Beaumont\'s Varsity team, by literal school UUID. teams.school_id is NOT NULL REFERENCES schools(id), so on an empty database this is a foreign key violation (23503) that aborts the migration.'
  }
];

// supabase_schema.sql is a historical provisioning script, not a description
// of the live database. Some of what it declares was dropped from production
// by hand, leaving no migration to replay — so a project built from it comes
// out with columns production does not have, and the demo diverges from the
// database it is supposed to mirror.
//
// Each entry below was verified against the running production database on
// 2026-09-05 by probing one column at a time through PostgREST, where a
// missing column answers 42703:
//
//   curl -s "$URL/rest/v1/drills_bank?select=duration&limit=0" -H "apikey: $KEY"
//
// Re-probe before adding to this list. Do not add a column that a migration
// already drops (players.number, schedule.school_id, the planner school_id
// columns and the old matrix_logs columns are all handled by 0005/0002/0015).
const RECONCILE = {
  header: `Reconcile supabase_schema.sql with the live production database`,
  note: `Columns declared by the provisioning script that production does not have,
and that no migration drops. Without this the demo would carry columns
production lacks — and drills_bank.duration is NOT NULL, so 0009's
self-check fails outright with 23502 when it inserts a drill without one.`,
  statements: [
    { sql: 'alter table public.drills_bank       drop column if exists duration;',
      why: 'NOT NULL in the script, absent in production. Breaks 0009, 0010 and 0022, which all insert self-check drills.' },
    { sql: 'alter table public.soccer_categories drop column if exists school_id;',
      why: 'Absent in production; the category list is global, as src/data/supabase.ts:2193 documents.' }
  ]
};

function read(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const present = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
const unknown = present.filter(f => !SKIP[f] && !/^\d{4}_/.test(f));
if (unknown.length) {
  throw new Error(`Unrecognised file(s) in supabase/migrations: ${unknown.join(', ')}`);
}
const included = present.filter(f => !SKIP[f]);

const stamp = new Date().toISOString().slice(0, 10);
const parts = [];

parts.push(`-- demo_schema.sql — the demo project's structure, start to finish
--
-- GENERATED FILE. Do not edit. Regenerate with:  npm run demo:schema
-- Generated ${stamp} from ${BASE.length} provisioning scripts and ${included.length} migrations.
--
-- ── What this is for ──────────────────────────────────────────────────────
--
-- The public demo runs on its own Supabase project so that strangers creating,
-- editing and deleting can never touch real students' records. That project
-- needs the same schema as production, and this file is how it gets it: paste
-- the whole thing into the demo project's SQL editor, once, on a fresh
-- project.
--
-- It is STRUCTURE ONLY. No Beaumont, no real names, no team data. The demo's
-- template organization is loaded separately from demo_seed.sql.
--
-- ── Run it on the DEMO project ────────────────────────────────────────────
--
-- Check the project switcher before you paste. Applied to production this
-- would re-run every migration against live data, and supabase_migration_auth
-- .sql's first step DELETES every row in public.profiles.
--
-- ── Ownership ─────────────────────────────────────────────────────────────
--
-- The SQL editor may run as a role that is a MEMBER of postgres without
-- defaulting to it. ALTER TABLE and CREATE POLICY check ownership rather than
-- privilege, so they fail with 42501 (must be owner of table ...) even when
-- the privilege is reachable. The set role below fixes that for the whole
-- session; it persists across the begin/commit pairs the later migrations
-- carry, because SET ROLE is session-scoped rather than transactional.
--
-- ── After it runs ─────────────────────────────────────────────────────────
--
--   1. demo_auth_open.sql   self-serve coach accounts (DEMO ONLY)
--   2. demo_settings.sql    the cap on live visitor organizations
--   3. demo_seed.sql        the template every visitor is cloned from
--
-- Note for step 1: handle_new_user() resolves a new profile's organization
-- with \`select id from public.schools where code = 'bhs'\`, which is legacy
-- and finds nothing here. Demo signups therefore land with a null school_id
-- until demo_auth_open.sql points them at the template instead.
--
-- ── Excluded on purpose ───────────────────────────────────────────────────
--
-- seed_data.sql              Beaumont's demo data; the demo has its own.`);

for (const [file, why] of Object.entries(SKIP)) {
  parts.push(`-- ${file}\n--   ${why.replace(/\s+/g, ' ')}`);
}
for (const cut of CUTS) {
  parts.push(`-- One statement cut from ${cut.file}:\n--   ${cut.why}`);
}

parts.push(`
set role postgres;
`);

const sources = [
  ...BASE.map(f => ({ label: f, path: join(REPO, f) })),
  ...included.map(f => ({ label: `supabase/migrations/${f}`, path: join(MIGRATIONS, f) }))
];

for (const src of sources) {
  let body = read(src.path);

  for (const cut of CUTS) {
    if (!src.label.endsWith(cut.file)) continue;
    const hits = body.split(cut.find).length - 1;
    if (hits !== 1) {
      throw new Error(
        `${src.label}: expected exactly 1 match for the statement to cut, found ${hits}. ` +
        'The source was edited — update CUTS in scripts/build-demo-schema.mjs.'
      );
    }
    body = body.replace(cut.find, `-- [demo] statement removed by build-demo-schema.mjs:\n--   ${cut.why}`);
  }

  parts.push(`
-- ═══════════════════════════════════════════════════════════════════════════
-- ${src.label}
-- ═══════════════════════════════════════════════════════════════════════════

${body.trim()}
`);

  // Straight after the provisioning script that declared them, and before any
  // migration that inserts a row into the affected tables.
  if (src.label === 'supabase_schema.sql') {
    const lines = RECONCILE.statements
      .map(s => `-- ${s.why}\n${s.sql}`)
      .join('\n\n');
    parts.push(`
-- ═══════════════════════════════════════════════════════════════════════════
-- ${RECONCILE.header}
-- ═══════════════════════════════════════════════════════════════════════════
--
${RECONCILE.note.split('\n').map(l => `-- ${l}`).join('\n')}

${lines}
`);
  }
}

const out = parts.join('\n') + '\n';
writeFileSync(OUT, out, 'utf8');

const digest = createHash('sha256').update(out).digest('hex').slice(0, 12);
console.log(`Wrote ${OUT}`);
console.log(`  ${sources.length} source files, ${out.split('\n').length} lines, sha256:${digest}`);
console.log(`  skipped: ${Object.keys(SKIP).join(', ')}`);
console.log(`  cut: ${CUTS.length} statement(s)`);
