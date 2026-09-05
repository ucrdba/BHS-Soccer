/**
 * Guards Resouces/SQL/demo/demo_schema.sql against the drift the demo design
 * names as its largest ongoing risk: a migration applied to production and
 * never applied to the demo project.
 *
 * The generated file is the only thing standing the demo project up, so if a
 * new migration lands and `npm run demo:schema` is not re-run, the two
 * databases diverge — silently, until a demo page fails to render a column
 * that production has. These tests turn that into a red test instead.
 */

// tsconfig.json lists no `types`, and nothing else under src/ reaches for
// Node's globals, so this file declares the dependency locally rather than
// switching them on repo-wide for app code that has no business with them.
/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = process.cwd();
const MIGRATIONS = join(REPO, 'supabase', 'migrations');
const SCHEMA = join(REPO, 'Resouces', 'SQL', 'demo', 'demo_schema.sql');

const schema = readFileSync(SCHEMA, 'utf8');
const migrations = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();

// Kept in step with SKIP in scripts/build-demo-schema.mjs. Listed again here
// so that dropping a migration from the demo is a deliberate two-file edit
// rather than something that can happen by accident.
const EXPECTED_SKIPS = [
  '0006_move_club_teams_to_legends_fc.sql',
  '0007_assign_coaches_to_club_teams.sql',
  '0012_set_drill_weights.sql'
];

describe('demo_schema.sql', () => {
  it('includes every migration that is not deliberately skipped', () => {
    const missing = migrations
      .filter(f => !EXPECTED_SKIPS.includes(f))
      .filter(f => !schema.includes(`-- supabase/migrations/${f}`));

    expect(missing, 'run `npm run demo:schema` to regenerate').toEqual([]);
  });

  it('omits the migrations that only change Beaumont data', () => {
    for (const skipped of EXPECTED_SKIPS) {
      expect(schema).not.toContain(`\n-- supabase/migrations/${skipped}\n`);
      // Still named in the header, so the omission is visible to whoever runs it.
      expect(schema).toContain(skipped);
    }
  });

  // teams.school_id is NOT NULL REFERENCES schools(id). This insert names
  // Beaumont's school by literal UUID, so on an empty database it is a 23503
  // that aborts the run partway through 0005.
  it('cuts the backfill that inserts Beaumont Varsity by literal UUID', () => {
    expect(schema).not.toContain("'Varsity', '2026', true");
    expect(schema).toContain('[demo] statement removed');
  });

  it('carries no Beaumont coach email or club-team UUIDs', () => {
    expect(schema).not.toContain('ucrdba');
    expect(schema).not.toContain('170b1cb4-b57a-4686');
  });

  // ALTER TABLE and CREATE POLICY check ownership, not privilege, so the SQL
  // editor's role needs this before the first one of either.
  it('sets the postgres role before any DDL runs', () => {
    const setRole = schema.indexOf('\nset role postgres;');
    const firstDdl = schema.search(/\n(create|alter)\s/i);

    expect(setRole).toBeGreaterThan(-1);
    expect(setRole).toBeLessThan(firstDdl);
  });

  // supabase_schema.sql declares columns production had dropped by hand, with
  // no migration to replay. Without these the demo diverges from the database
  // it mirrors — and drills_bank.duration is NOT NULL, which aborts 0009's
  // self-check with 23502.
  it('reconciles the columns production does not actually have', () => {
    expect(schema).toContain('alter table public.drills_bank       drop column if exists duration;');
    expect(schema).toContain('alter table public.soccer_categories drop column if exists school_id;');
  });

  it('reconciles before the first migration that inserts a drill', () => {
    const reconcile = schema.indexOf('drop column if exists duration');
    const firstDrillInsert = schema.indexOf('insert into public.drills_bank');

    expect(reconcile).toBeGreaterThan(-1);
    expect(firstDrillInsert).toBeGreaterThan(reconcile);
  });

  it('is marked generated, so nobody hand-edits it', () => {
    expect(schema).toContain('GENERATED FILE');
    expect(schema).toContain('npm run demo:schema');
  });
});
