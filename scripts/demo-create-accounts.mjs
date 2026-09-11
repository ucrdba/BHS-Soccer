#!/usr/bin/env node
/**
 * Creates the nine demo sign-in accounts, once, and checks that each signs in.
 *
 *   node scripts/demo-create-accounts.mjs                              dry run: says what it would do
 *   node scripts/demo-create-accounts.mjs --confirm                    creates any that are missing
 *   node scripts/demo-create-accounts.mjs --reset-passwords --confirm  sets DEMO_PASSWORD on all nine
 *
 * Every run, the dry run included, ends by signing in to each of the nine with
 * DEMO_PASSWORD, and exits non-zero if any cannot. The sign-in picker knows
 * only that password, so an account that already existed with another one --
 * an old visitor of the self-serve demo, or someone who registered the address
 * -- is an account the picker cannot open. The script says which.
 *
 * The nightly rebuild never touches auth.users: it links these accounts to
 * fresh copies of the sample program. So this runs at setup, and again only if
 * an account goes missing (the rebuild fails naming it).
 *
 * Reads from .env (gitignored): DEMO_SUPABASE_URL, DEMO_SERVICE_ROLE_KEY and
 * DEMO_PASSWORD. They are named apart from SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY on purpose: those are production's, for
 * scripts/invite-users.mjs, and must never be picked up here.
 *
 * --reset-passwords needs the lock on demo passwords lifted first: see
 * "Changing the shared password" in docs/runbooks/2026-09-11-demo-rebuild-runbook.md.
 */
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { PRODUCTION_REF } from './demo-rebuild-lib.mjs';

export const DEMO_EMAILS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `demo${n}@demo.invalid`);

const NAMES = ['Demo Coach 1', 'Demo Coach 2', 'Demo Coach 3', 'Demo Coach 4', 'Demo Coach 5',
  'Demo Coach 6', 'Demo Coach 7', 'Demo Player', 'Demo Admin'];

const RUNBOOK = 'docs/runbooks/2026-09-11-demo-rebuild-runbook.md';

/** Why this URL must not be used, or null. */
export function refuseTarget(url) {
  const value = String(url ?? '').trim();
  if (!value) return 'DEMO_SUPABASE_URL is not set.';
  if (value.includes(PRODUCTION_REF)) return `DEMO_SUPABASE_URL is production (${PRODUCTION_REF}). Refusing.`;
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(value)) {
    return 'DEMO_SUPABASE_URL must be the demo project URL, https://<ref>.supabase.co.';
  }
  return null;
}

/** A key that can create users: a new-format secret key, or a legacy service_role JWT. */
export function isServiceKey(key) {
  const value = String(key ?? '').trim();
  if (value.startsWith('sb_secret_')) return true;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'service_role';
  } catch {
    return false;
  }
}

/**
 * The shared password, trimmed exactly as the app trims VITE_DEMO_PASSWORD
 * (src/demo.ts), so the accounts get the password the picker will send.
 * Throws if it is under 8 characters once trimmed; the message never repeats it.
 */
export function readDemoPassword(env) {
  const password = String(env?.DEMO_PASSWORD ?? '').trim();
  if (password.length < 8) {
    throw new Error('DEMO_PASSWORD must be at least 8 characters, not counting spaces at either end.');
  }
  return password;
}

/** The two switches. Without --confirm nothing is written. */
export function readOptions(argv) {
  const args = argv || [];
  return { confirm: args.includes('--confirm'), resetPasswords: args.includes('--reset-passwords') };
}

/** The demo accounts not among the addresses given, in order. */
export function missingAccounts(existing) {
  const have = new Set((existing || []).map(e => String(e).toLowerCase()));
  return DEMO_EMAILS.filter(e => !have.has(e));
}

/**
 * What the sign-in check found: one line per account, and the reason to fail,
 * or null. `results` is [{ email, exists, signsIn, reason }], `reason` being
 * GoTrue's own message. `resetPending` is a --reset-passwords dry run, where
 * the old password is still expected.
 */
export function signInReport(results, { resetPending = false } = {}) {
  const lines = results.map(r => `  ${r.email}  ${
    !r.exists ? 'does not exist yet'
      : r.signsIn ? 'signs in'
        : `cannot sign in${r.reason ? ` (${r.reason})` : ''}`}`);
  const failed = results.filter(r => r.exists && !r.signsIn).map(r => r.email);
  if (failed.length === 0) return { lines, problem: null };
  const which = failed.join(', ');
  if (resetPending) {
    return { lines, problem: `${which}: not signing in with DEMO_PASSWORD yet. --reset-passwords --confirm sets it.` };
  }
  return {
    lines,
    problem: `${which}: cannot sign in with DEMO_PASSWORD, so the demo's sign-in picker cannot either. `
      + 'An account like that was registered by someone else, or with another password: delete it '
      + '(Supabase -> Authentication -> Users) and run this script again. '
      + '(If the reason given is a rate limit, wait a few minutes and run it again instead.)'
  };
}

function readEnvFile(path = '.env') {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

/** Signs in as one account on a client of its own, then ends that session only. */
async function trySignIn(url, key, email, password) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { signsIn: false, reason: error.message };
  // 'local' ends this session alone. The default, 'global', would also sign
  // out every visitor using this account on the demo at the time.
  await client.auth.signOut({ scope: 'local' });
  return { signsIn: true };
}

async function main() {
  const env = { ...readEnvFile(), ...process.env };
  const { confirm, resetPasswords } = readOptions(process.argv.slice(2));

  const refusal = refuseTarget(env.DEMO_SUPABASE_URL);
  if (refusal) throw new Error(refusal);
  if (!isServiceKey(env.DEMO_SERVICE_ROLE_KEY)) {
    throw new Error('DEMO_SERVICE_ROLE_KEY must be the DEMO project\'s secret key (sb_secret_...) or service_role key.');
  }
  const password = readDemoPassword(env);

  const url = env.DEMO_SUPABASE_URL;
  const key = env.DEMO_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Listing users failed: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const byEmail = new Map(users.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));
  const existedBefore = DEMO_EMAILS.filter(e => byEmail.has(e));

  const missing = missingAccounts(users.map(u => u.email));
  if (missing.length === 0) {
    console.log('All nine demo accounts exist.');
  } else {
    console.log(`${confirm ? 'Creating' : 'Would create'}: ${missing.join(', ')}`);
    if (confirm) {
      for (const email of missing) {
        const n = DEMO_EMAILS.indexOf(email);
        const { data, error } = await supabase.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { name: NAMES[n] }
        });
        if (error) throw new Error(`Creating ${email} failed: ${error.message}`);
        byEmail.set(email, data.user);
        console.log(`  created ${email}`);
      }
    }
  }

  if (resetPasswords && existedBefore.length > 0) {
    console.log(`${confirm ? 'Setting' : 'Would set'} DEMO_PASSWORD on: ${existedBefore.join(', ')}`);
    if (confirm) {
      for (const email of existedBefore) {
        const { error } = await supabase.auth.admin.updateUserById(byEmail.get(email).id, { password });
        if (error) {
          throw new Error(`Setting the password of ${email} failed: ${error.message}. `
            + `The demo's password lock must be lifted first: see "Changing the shared password" in ${RUNBOOK}.`);
        }
        console.log(`  set ${email}`);
      }
    }
  }

  if (!confirm && (missing.length > 0 || resetPasswords)) {
    console.log('Dry run. Re-run with --confirm to make these changes.');
  }

  console.log('Signing in to each account with DEMO_PASSWORD:');
  const results = [];
  for (const email of DEMO_EMAILS) {
    if (!byEmail.has(email)) {
      results.push({ email, exists: false, signsIn: false });
      continue;
    }
    results.push({ email, exists: true, ...(await trySignIn(url, key, email, password)) });
  }
  const report = signInReport(results, { resetPending: resetPasswords && !confirm });
  for (const line of report.lines) console.log(line);
  if (report.problem) throw new Error(report.problem);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
