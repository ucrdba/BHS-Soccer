#!/usr/bin/env node
/**
 * Rebuilds the demo database from main: wipe, every migration, the sample
 * program, the nine accounts.
 *
 * Run nightly and on every migration push by .github/workflows/demo-rebuild.yml,
 * or by hand:
 *
 *   DEMO_DATABASE_URL=... DEMO_PROJECT_REF=nzelhvipofeqoteewvhg node scripts/demo-rebuild.mjs
 *
 * DEMO_AS_OF=YYYY-MM-DD dates the sample season from another day; it defaults
 * to today in California.
 *
 * One transaction: if any step fails, everything rolls back and yesterday's
 * demo stays up. Runbook: docs/runbooks/2026-09-11-demo-rebuild-runbook.md.
 */
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  checkTarget, connectionInfo, pacificDate, rebuildSteps, withoutSslmode
} from './demo-rebuild-lib.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));

async function main() {
  const url = process.env.DEMO_DATABASE_URL;
  const ref = process.env.DEMO_PROJECT_REF;
  checkTarget(url, ref);

  const asOf = process.env.DEMO_AS_OF || pacificDate();
  const steps = rebuildSteps(REPO, asOf);

  // Supabase's certificate chains to Supabase's own CA, which Node does not
  // trust by default, so the connection is encrypted without verifying the
  // chain. Acceptable for a database that holds nothing real; the target
  // itself is checked above, twice. sslmode in the URL would override this, so
  // it is removed -- textually, because a round trip through URL can re-encode
  // the password, and pg parses the original string itself.
  const info = connectionInfo(url);
  const local = ['localhost', '127.0.0.1'].includes(info.host);
  const client = new pg.Client({
    connectionString: withoutSslmode(url),
    ssl: local ? false : { rejectUnauthorized: false }
  });

  try {
    await client.connect();
  } catch (err) {
    // Which half is wrong is invisible otherwise: the pooler reports every bad
    // password against the mapped user, and the secret cannot be read back.
    console.error(
      `Could not connect as ${info.user} to ${info.host}:${info.port}/${info.database} ` +
      `— password ${info.passwordLength} characters, DEMO_DATABASE_URL fingerprint ${info.fingerprint}.`);
    console.error(
      'That fingerprint is the first 8 hex of sha256 over the trimmed string. ' +
      'See the runbook to compare it with the string you meant to store.');
    throw err;
  }
  const started = Date.now();
  try {
    await client.query('begin');
    await client.query('set local statement_timeout = 0');
    await client.query("set local lock_timeout = '60s'");
    for (const [i, step] of steps.entries()) {
      console.log(`[${i + 1}/${steps.length}] ${step.label}`);
      try {
        await client.query(step.sql);
      } catch (err) {
        throw new Error(`${step.label}: ${err.message}`);
      }
    }
    await client.query('commit');
    console.log(`Rebuilt the demo as of ${asOf} in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error("Rebuild FAILED and rolled back; yesterday's demo is unchanged.");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
