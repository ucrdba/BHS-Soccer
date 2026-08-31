#!/usr/bin/env node
/**
 * Bulk-invite roster members to the BHS Soccer app.
 *
 * Runs on your machine, never in the browser. It uses the Supabase
 * service_role key, which bypasses row-level security completely — that key
 * must never reach client code, which is why this file lives outside src/ and
 * public/ and why the script refuses to run if it finds the key in either.
 *
 * Nobody's password is ever known to anyone else: each person receives an
 * invite link and chooses their own. There is no temporary password and so
 * nothing to force them to change.
 *
 *   node scripts/invite-users.mjs invite  Resouces/CSV/team.csv
 *   node scripts/invite-users.mjs approve Resouces/CSV/team.csv
 *
 * Both are DRY RUNS unless you pass --confirm.
 *
 * Why two commands. `invite` sends the invitation; the handle_new_user trigger
 * builds the profile from the name and requested_role carried in the invite's
 * metadata, exactly as it does for a self-service signup. When the person
 * accepts and sets a password, handle_user_confirmed fires and moves them to
 * pending_approval — overwriting anything this script had set beforehand. So
 * `approve` is a separate pass, run once people have accepted, doing in bulk
 * what the Admin panel's Approve button does one at a time. That keeps the
 * database triggers untouched.
 *
 * `approve` also links each player's profile to their public.players row.
 * profiles.player_id is the only connection between a signed-in person and
 * their player record, and fetchTeamsForViewer resolves a player's teams
 * through it — when it is null the person signs in fine and sees the public
 * default team instead of their own, with no error anywhere. Matching is on
 * name, folded for case, accents and punctuation. Anything short of exactly
 * one unambiguous match is reported and left unlinked rather than guessed: a
 * wrong link shows someone another team's roster. Existing links are never
 * overwritten, so a correction made by hand survives a re-run.
 *
 * CSV columns: Name, Email, Role   (role: coach | player | guest)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const VALID_ROLES = ['coach', 'player', 'guest'];

/**
 * Minimal RFC4180-ish CSV reader: handles quoted fields containing commas,
 * escaped double quotes, CRLF, and a UTF-8 BOM. Returns an array of objects
 * keyed by the header row.
 */
export function parseCsv(text) {
  if (typeof text !== 'string') return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter(r => r.some(v => String(v).trim() !== ''));
  if (nonEmpty.length < 2) return [];

  const header = nonEmpty[0].map(h => String(h).trim());
  return nonEmpty.slice(1).map(r => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = String(r[i] ?? '').trim(); });
    return obj;
  });
}

/**
 * Validates and normalises the sheet. Returns every problem rather than
 * throwing on the first, so one bad row does not hide the other nine.
 */
export function normaliseRows(rawRows) {
  const people = [];
  const errors = [];
  const seen = new Set();

  (rawRows || []).forEach((r, idx) => {
    const line = idx + 2; // +1 for the header, +1 for 1-based numbering
    const name = String(r.Name ?? '').trim();
    const email = String(r.Email ?? '').trim().toLowerCase();
    const role = String(r.Role ?? '').trim().toLowerCase();

    if (!name && !email && !role) return; // blank row

    // Each check records BOTH an error and whether the row may proceed. An
    // earlier version pushed the error but let the row through, because a
    // malformed address is still a truthy string — which would have sent an
    // invite to whatever that text was.
    let emailOk = true;
    if (!name) errors.push(`line ${line}: missing Name`);
    if (!email) {
      errors.push(`line ${line}: missing Email`);
      emailOk = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`line ${line}: "${email}" is not an email address`);
      emailOk = false;
    } else if (seen.has(email)) {
      errors.push(`line ${line}: "${email}" appears more than once`);
      emailOk = false;
    }

    const roleOk = VALID_ROLES.includes(role);
    if (!roleOk) {
      errors.push(`line ${line}: Role "${r.Role ?? ''}" must be one of ${VALID_ROLES.join(', ')}`);
    }

    if (name && emailOk && roleOk) {
      seen.add(email);
      people.push({ name, email, role });
    }
  });

  return { people, errors };
}

/**
 * Fold a name to a comparison key: case, accents, punctuation and repeated
 * whitespace all removed. "José  Martínez-Cruz" and "jose martinez cruz" are
 * the same person written by two different people into two different systems,
 * which is exactly the situation this has to survive.
 */
export function normaliseName(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .toLowerCase()
    // Apostrophes vanish rather than splitting a word: O'Brien and OBrien are
    // one name. Every other separator becomes a space, so Smith-Jones matches
    // Smith Jones.
    .replace(/['‘’ʼ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decide, for each invited person, which players row their profile should
 * point at.
 *
 * profiles.player_id is the only link between a signed-in person and their
 * player record, and fetchTeamsForViewer resolves a player's teams through it.
 * When it is null the failure is silent: the player signs in successfully and
 * sees the public default team instead of their own. So a wrong link is worse
 * than no link — it shows someone another team's roster — and this never
 * guesses. Anything short of exactly one unambiguous match is reported.
 *
 * @param people   normalised CSV rows ({ name, email, role })
 * @param players  [{ id, name }] from public.players
 * @param profiles [{ id, email, player_id }] existing profiles
 * @returns [{ email, name, status, playerId, reason }]
 *          status: 'link' | 'skip' | 'already' | 'ambiguous' | 'unmatched'
 */
export function planPlayerLinks(people, players, profiles) {
  const byName = new Map();
  (players || []).forEach(pl => {
    const key = normaliseName(pl.name);
    if (!key) return;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(pl);
  });

  // A players row must not end up owned by two profiles: whoever signs in
  // second would see the first person's team. Claims already in the database
  // count, so a re-run cannot hand the same player to someone new.
  const claimed = new Map();
  (profiles || []).forEach(pr => {
    if (pr.player_id) claimed.set(pr.player_id, pr.email || pr.id);
  });

  const profileByEmail = new Map(
    (profiles || []).map(pr => [String(pr.email || '').toLowerCase(), pr])
  );

  return (people || []).map(person => {
    const base = { email: person.email, name: person.name };

    if (person.role !== 'player') {
      return { ...base, status: 'skip', playerId: null, reason: `role is ${person.role}` };
    }

    const existing = profileByEmail.get(String(person.email).toLowerCase());
    if (existing && existing.player_id) {
      return { ...base, status: 'already', playerId: existing.player_id, reason: 'already linked' };
    }

    const matches = byName.get(normaliseName(person.name)) || [];
    if (matches.length === 0) {
      return { ...base, status: 'unmatched', playerId: null, reason: 'no players row with that name' };
    }
    if (matches.length > 1) {
      return {
        ...base, status: 'ambiguous', playerId: null,
        reason: `${matches.length} players share that name — link this one by hand`
      };
    }

    const owner = claimed.get(matches[0].id);
    if (owner) {
      return {
        ...base, status: 'ambiguous', playerId: null,
        reason: `that players row is already linked to ${owner}`
      };
    }

    claimed.set(matches[0].id, person.email);
    return { ...base, status: 'link', playerId: matches[0].id, reason: '' };
  });
}

/**
 * Confirms a key is a service_role key by reading the JWT payload's role claim.
 * An anon key cannot invite users, and would otherwise fail per-row with an
 * opaque permission error after the batch had already started.
 */
export function isServiceRoleKey(key) {
  try {
    const payload = String(key || '').split('.')[1];
    if (!payload) return false;
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return json.role === 'service_role';
  } catch {
    return false;
  }
}

/** Files that ship to the browser. The service_role key must appear in none of them. */
function findKeyLeak(key, roots = ['src', 'public', 'index.html']) {
  if (!key) return null;
  const suspect = [];
  const walk = (p) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) { readdirSync(p).forEach(f => walk(join(p, f))); return; }
    if (!['.js', '.ts', '.mjs', '.mts', '.html', '.json'].includes(extname(p))) return;
    if (readFileSync(p, 'utf8').includes(key)) suspect.push(p);
  };
  roots.forEach(walk);
  return suspect.length ? suspect : null;
}

/** Reads KEY=value pairs from a .env file. Absent file is not an error. */
function readEnvFile(path = '.env') {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const file = args.find(a => !a.startsWith('-') && a !== command);
  const confirm = args.includes('--confirm');

  if (!['invite', 'approve'].includes(command) || !file) {
    console.error('Usage: node scripts/invite-users.mjs <invite|approve> <file.csv> [--confirm]');
    process.exit(2);
  }
  if (!existsSync(file)) {
    console.error(`No such file: ${file}`);
    process.exit(2);
  }

  const env = { ...readEnvFile(), ...process.env };
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    console.error('Copy .env.example to .env and fill both in. .env is gitignored.');
    process.exit(2);
  }
  if (!isServiceRoleKey(key)) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not a service_role key.');
    console.error('The anon key cannot create users. Copy the service_role key from');
    console.error('Supabase → Project Settings → API. Never put it in the app.');
    process.exit(2);
  }
  const leaked = findKeyLeak(key);
  if (leaked) {
    console.error('REFUSING TO RUN: the service_role key appears in files that ship to the browser:');
    leaked.forEach(f => console.error('  ' + f));
    console.error('Remove it, then rotate the key in the Supabase dashboard — assume it is compromised.');
    process.exit(2);
  }

  const { people, errors } = normaliseRows(parseCsv(readFileSync(file, 'utf8')));
  if (errors.length) {
    console.error(`${errors.length} problem(s) in ${file}:`);
    errors.forEach(e => console.error('  ' + e));
    if (!people.length) process.exit(1);
    console.error('');
  }
  if (!people.length) {
    console.error('Nothing to do — no valid rows.');
    process.exit(1);
  }

  console.log(`${people.length} person(s) from ${file}`);
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Work out the profile -> players links before the dry-run branch, so a dry
  // run shows exactly who would be linked to whom. Matching is the risky part
  // of this pass; a dry run that hid it would be checking the wrong thing.
  let linkPlan = [];
  if (command === 'approve') {
    const [{ data: players, error: pErr }, { data: profiles, error: prErr }] = await Promise.all([
      supabase.from('players').select('id, name').eq('is_deleted', false),
      supabase.from('profiles').select('id, email, player_id')
    ]);
    if (pErr || prErr) {
      console.error(`Could not read players/profiles: ${(pErr || prErr).message}`);
      process.exit(1);
    }
    linkPlan = planPlayerLinks(people, players || [], profiles || []);

    const unresolved = linkPlan.filter(l => l.status === 'ambiguous' || l.status === 'unmatched');
    if (unresolved.length) {
      console.log('');
      console.log('These people will be approved but NOT linked to a player record.');
      console.log('They will sign in and see the public default team, not their own:');
      console.log('');
      unresolved.forEach(l => console.log(`  ${l.status.padEnd(10)} ${l.email.padEnd(34)} ${l.name} - ${l.reason}`));
      console.log('');
    }
  }

  const linkByEmail = new Map(linkPlan.map(l => [l.email, l]));

  if (!confirm) {
    console.log('\nDRY RUN — nothing will be sent or changed. Re-run with --confirm to apply.\n');
    people.forEach(p => {
      const link = linkByEmail.get(p.email);
      const note = link && link.status === 'link' ? `  -> links to player ${link.playerId.slice(0, 8)}`
                 : link && link.status === 'already' ? '  -> already linked'
                 : link && link.status !== 'skip' ? `  -> NOT linked (${link.reason})`
                 : '';
      console.log(`  ${command === 'invite' ? 'invite' : 'approve'}  ${p.email.padEnd(34)} ${p.role.padEnd(7)} ${p.name}${note}`);
    });
    console.log('');
    return;
  }

  let ok = 0, skipped = 0, failed = 0, linked = 0;

  for (const p of people) {
    try {
      if (command === 'invite') {
        // name and requested_role feed handle_new_user, which builds the
        // profile the same way a self-service signup does.
        const { error } = await supabase.auth.admin.inviteUserByEmail(p.email, {
          data: { name: p.name, requested_role: p.role }
        });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) {
            console.log(`  skip     ${p.email} — already has an account`);
            skipped++;
          } else {
            console.error(`  FAILED   ${p.email} — ${error.message}`);
            failed++;
          }
        } else {
          console.log(`  invited  ${p.email} (${p.role})`);
          ok++;
        }
        // Supabase's built-in SMTP is rate-limited; pace the batch.
        await sleep(1100);
      } else {
        const { data, error } = await supabase
          .from('profiles')
          .update({ role: p.role, status: 'active' })
          .eq('email', p.email)
          .select();
        if (error) {
          console.error(`  FAILED   ${p.email} — ${error.message}`);
          failed++;
        } else if (!data || data.length === 0) {
          console.log(`  skip     ${p.email} — no profile yet (have they accepted the invite?)`);
          skipped++;
        } else {
          console.log(`  approved ${p.email} → ${p.role}`);
          ok++;

          // Separate statement, and only where player_id is still null, so a
          // link corrected by hand in the admin panel is never overwritten by
          // a re-run of this script.
          const link = linkByEmail.get(p.email);
          if (link && link.status === 'link') {
            const { data: ldata, error: lerr } = await supabase
              .from('profiles')
              .update({ player_id: link.playerId })
              .eq('email', p.email)
              .is('player_id', null)
              .select();
            if (lerr) {
              console.error(`  WARN     ${p.email} — approved but not linked: ${lerr.message}`);
            } else if (ldata && ldata.length) {
              console.log(`  linked   ${p.email} → player ${link.playerId.slice(0, 8)}`);
              linked++;
            }
          }
        }
      }
    } catch (e) {
      console.error(`  FAILED   ${p.email} — ${e?.message || e}`);
      failed++;
    }
  }

  console.log(`\n${ok} ${command === 'invite' ? 'invited' : 'approved'}, ${skipped} skipped, ${failed} failed.`);
  if (command === 'approve') {
    const unlinked = linkPlan.filter(l => l.status === 'ambiguous' || l.status === 'unmatched').length;
    console.log(`${linked} linked to a player record${unlinked ? `, ${unlinked} left unlinked - see above` : ''}.`);
  }
  if (command === 'invite') {
    console.log('Once people have accepted their invites, run the approve pass:');
    console.log(`  node scripts/invite-users.mjs approve ${file} --confirm`);
  }
  if (failed) process.exit(1);
}

// Only run when invoked directly, so the helpers above stay importable by tests.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  main(process.argv).catch(e => { console.error(e); process.exit(1); });
}
