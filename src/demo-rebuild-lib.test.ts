/**
 * The rebuild's SQL, assembled. No database here: this is about which files
 * are applied, in what order, with which rules, and which targets are refused.
 * src/data/testdb/demo-schema-steps.test.ts runs the result against Postgres.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRODUCTION_REF, SKIP, checkTarget, pacificDate, isIsoDate, stripTransactionControl,
  migrationFiles, applyCuts, schemaSteps, substituteDiagrams,
  connectionInfo, fingerprint, withoutSslmode
} from '../scripts/demo-rebuild-lib.mjs';

const REPO = process.cwd();
const DEMO_REF = 'nzelhvipofeqoteewvhg';
const DEMO_URL = `postgresql://postgres.${DEMO_REF}:pw@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;

describe('checkTarget', () => {
  it('accepts the demo project', () => {
    expect(() => checkTarget(DEMO_URL, DEMO_REF)).not.toThrow();
  });

  it('refuses a connection string that does not name the demo project', () => {
    expect(() => checkTarget('postgresql://postgres.someoneelse:pw@host:5432/postgres', DEMO_REF))
      .toThrow(/does not contain DEMO_PROJECT_REF/);
  });

  // The rebuild deletes everything. A mistaken secret must not be able to
  // point it at production, whatever the other secret says.
  it("refuses production's address even when it also names the demo ref", () => {
    expect(() => checkTarget(`postgresql://postgres.${PRODUCTION_REF}:pw@host/postgres?x=${DEMO_REF}`, DEMO_REF))
      .toThrow(/production/);
  });

  it("refuses production's ref given as the demo ref", () => {
    expect(() => checkTarget(`postgresql://postgres.${PRODUCTION_REF}:pw@host/postgres`, PRODUCTION_REF))
      .toThrow(/production/);
  });

  it('refuses when either secret is missing', () => {
    expect(() => checkTarget('', DEMO_REF)).toThrow(/DEMO_DATABASE_URL/);
    expect(() => checkTarget(DEMO_URL, '')).toThrow(/DEMO_PROJECT_REF/);
  });
});

describe('pacificDate', () => {
  // The season is dated from this, and a UTC date is tomorrow in California
  // for eight hours of every day.
  it('is the date in California, not in UTC', () => {
    expect(pacificDate(new Date('2026-09-11T06:00:00Z'))).toBe('2026-09-10');
    expect(pacificDate(new Date('2026-09-11T20:00:00Z'))).toBe('2026-09-11');
  });

  it('is an ISO date', () => {
    expect(isIsoDate(pacificDate())).toBe(true);
    expect(isIsoDate("2026-09-11'); drop table x; --")).toBe(false);
  });
});

describe('stripTransactionControl', () => {
  it('removes lone begin; and commit; lines, in any case', () => {
    expect(stripTransactionControl('begin;\nselect 1;\nCOMMIT;\n').trim()).toBe('select 1;');
  });

  it('leaves a plpgsql begin alone', () => {
    const body = 'do $$\nbegin\n  perform 1;\nend $$;';
    expect(stripTransactionControl(body)).toBe(body);
  });
});

describe('the schema the rebuild applies', () => {
  const steps = schemaSteps(REPO);
  const labels = steps.map(s => s.label);

  it('starts with the provisioning scripts, reconciling straight after the first', () => {
    expect(labels.slice(0, 4)).toEqual(
      ['supabase_schema.sql', 'reconcile', 'schema_roles.sql', 'supabase_migration_auth.sql']);
  });

  it('applies every migration except the skipped ones, in number order', () => {
    const expected = migrationFiles(REPO).filter((f: string) => !(f in SKIP));
    expect(labels.filter(l => /^\d{4}_/.test(l))).toEqual(expected);
  });

  // A renamed or deleted migration must not leave the skip list silently
  // skipping nothing.
  it('skips only files that exist', () => {
    for (const f of Object.keys(SKIP)) {
      expect(existsSync(join(REPO, 'supabase', 'migrations', f)), f).toBe(true);
    }
  });

  it("cuts Beaumont's team, by its literal UUID, from 0005", () => {
    const step = steps.find(s => s.label === '0005_multi_team_schema.sql')!;
    expect(step.sql).not.toContain("values ('7ebbe980-b87e-421f-a11f-788ca2519504', 'Varsity'");
  });

  it('fails loudly when a cut no longer matches its file', () => {
    expect(() => applyCuts('0005_multi_team_schema.sql', 'select 1;')).toThrow(/exactly once/);
  });

  it('leaves no begin; or commit; line in any step', () => {
    for (const s of steps) expect(s.sql, s.label).not.toMatch(/^\s*(begin|commit)\s*;\s*$/im);
  });
});

describe('substituteDiagrams', () => {
  it('puts each diagram in as dollar-quoted JSON', () => {
    expect(substituteDiagrams('select __DEMO_DIAGRAM_RONDO__::jsonb;', { rondo: { a: 1 } }))
      .toBe('select $diagram${"a":1}$diagram$::jsonb;');
  });

  // A replacement STRING turns "$$" into "$" and breaks every function body.
  it('leaves $$ in the surrounding SQL alone', () => {
    const sql = 'create function f() returns int language sql as $$ select 1 $$;\nselect __DEMO_DIAGRAM_RONDO__::jsonb;';
    const out = substituteDiagrams(sql, { rondo: { a: 1 } });
    expect(out).toContain('as $$ select 1 $$;');
  });

  it('refuses a token it has no diagram for', () => {
    expect(() => substituteDiagrams('select __DEMO_DIAGRAM_NOPE__::jsonb;', { rondo: {} }))
      .toThrow(/__DEMO_DIAGRAM_NOPE__/);
  });
});

describe('what a failed connection may say about itself', () => {
  const POOLER = 'postgresql://postgres.demoref:pa%40ss%3Aword@aws-0-us-west-2.pooler.supabase.com:5432/postgres';

  it('names the user, host, port and database, and never the password', () => {
    const info = connectionInfo(POOLER);
    expect(info).toEqual({
      user: 'postgres.demoref',
      host: 'aws-0-us-west-2.pooler.supabase.com',
      port: '5432',
      database: 'postgres',
      passwordLength: 'pa%40ss%3Aword'.length,
      fingerprint: fingerprint(POOLER)
    });
    expect(JSON.stringify(info)).not.toContain('ss%3Aword');
  });

  it('fingerprints the string, not its parts, and ignores surrounding space', () => {
    expect(fingerprint(POOLER)).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprint(`  ${POOLER}\n`)).toBe(fingerprint(POOLER));
    expect(fingerprint(POOLER.replace('5432', '6543'))).not.toBe(fingerprint(POOLER));
  });

  it('defaults the port and survives a string with no database path', () => {
    const info = connectionInfo('postgresql://u:p@host/');
    expect([info.port, info.database]).toEqual(['5432', '(none)']);
  });
});

describe('withoutSslmode', () => {
  // pg parses the original; a round trip through URL can re-encode the
  // password, which is what a percent-encoded one is doing here.
  it('leaves an untouched string exactly as it was', () => {
    const url = 'postgresql://postgres.demoref:pa%40ss@host.pooler.supabase.com:5432/postgres';
    expect(withoutSslmode(url)).toBe(url);
  });

  it('removes sslmode wherever it sits, and tidies what is left', () => {
    expect(withoutSslmode('postgresql://u:p@h:5432/db?sslmode=require'))
      .toBe('postgresql://u:p@h:5432/db');
    expect(withoutSslmode('postgresql://u:p@h:5432/db?sslmode=require&application_name=x'))
      .toBe('postgresql://u:p@h:5432/db?application_name=x');
    expect(withoutSslmode('postgresql://u:p@h:5432/db?application_name=x&sslmode=verify-full'))
      .toBe('postgresql://u:p@h:5432/db?application_name=x');
  });

  it('trims the stray newline a pasted secret carries', () => {
    expect(withoutSslmode('postgresql://u:p@h:5432/db\n')).toBe('postgresql://u:p@h:5432/db');
  });
});
