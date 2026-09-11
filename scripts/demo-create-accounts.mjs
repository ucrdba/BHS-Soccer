#!/usr/bin/env node
/**
 * Creates the nine demo sign-in accounts, once.
 *
 *   node scripts/demo-create-accounts.mjs            dry run: says what it would do
 *   node scripts/demo-create-accounts.mjs --confirm  creates any that are missing
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
 * Changing the shared password later: see the runbook,
 * docs/runbooks/2026-09-11-demo-rebuild-runbook.md -- the lock on demo
 * passwords has to be lifted first.
 */
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { PRODUCTION_REF } from './demo-rebuild-lib.mjs';

export const DEMO_EMAILS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `demo${n}@demo.invalid`);

const NAMES = ['Demo Coach 1', 'Demo Coach 2', 'Demo Coach 3', 'Demo Coach 4', 'Demo Coach 5',
  'Demo Coach 6', 'Demo Coach 7', 'Demo Player', 'Demo Admin'];

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

/** The demo accounts not among the addresses given, in order. */
export function missingAccounts(existing) {
  const have = new Set((existing || []).map(e => String(e).toLowerCase()));
  return DEMO_EMAILS.filter(e => !have.has(e));
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

async function main() {
  const env = { ...readEnvFile(), ...process.env };
  const confirm = process.argv.includes('--confirm');

  const refusal = refuseTarget(env.DEMO_SUPABASE_URL);
  if (refusal) throw new Error(refusal);
  if (!isServiceKey(env.DEMO_SERVICE_ROLE_KEY)) {
    throw new Error('DEMO_SERVICE_ROLE_KEY must be the DEMO project\'s secret key (sb_secret_...) or service_role key.');
  }
  const password = String(env.DEMO_PASSWORD ?? '');
  if (password.length < 8) throw new Error('DEMO_PASSWORD must be at least 8 characters.');

  const supabase = createClient(env.DEMO_SUPABASE_URL, env.DEMO_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const existing = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Listing users failed: ${error.message}`);
    existing.push(...data.users.map(u => u.email));
    if (data.users.length < 1000) break;
  }

  const missing = missingAccounts(existing);
  if (missing.length === 0) {
    console.log('All nine demo accounts exist. Nothing to do.');
    return;
  }
  console.log(`${confirm ? 'Creating' : 'Would create'}: ${missing.join(', ')}`);
  if (!confirm) {
    console.log('Dry run. Re-run with --confirm to create them.');
    return;
  }

  for (const email of missing) {
    const n = DEMO_EMAILS.indexOf(email);
    const { error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name: NAMES[n] }
    });
    if (error) throw new Error(`Creating ${email} failed: ${error.message}`);
    console.log(`  created ${email}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
