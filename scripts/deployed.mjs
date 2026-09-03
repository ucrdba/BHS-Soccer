#!/usr/bin/env node
/**
 * What is the live site running, and what is it missing?
 *
 * `npm run deployed`
 *
 * Every build writes /version.json naming the commit that produced it, so this
 * asks the site directly rather than inferring from asset hashes. Inferring
 * does not work: a change confined to public/js/ leaves the hashed bundle name
 * identical, so the site can be a commit behind and look byte-identical from
 * outside.
 *
 * Exits non-zero when the site is behind, so it can gate a release step later.
 */

import { execSync } from 'node:child_process';

const SITES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['https://bhssoccer.org', 'https://bhs-soccer.vercel.app'];

const git = (cmd, fallback = '') => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return fallback; }
};

const short = (sha) => (sha || '').slice(0, 7) || 'unknown';

async function fetchVersion(base) {
  // Cache-busted: version.json is served with must-revalidate, but a CDN that
  // has not caught up would otherwise answer with the previous build and make
  // this tool lie in exactly the situation it exists for.
  const url = `${base.replace(/\/$/, '')}/version.json?cb=${Date.now()}`;
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const local = git('git rev-parse HEAD', 'unknown');
const branch = git('git rev-parse --abbrev-ref HEAD', 'unknown');
git('git fetch origin --quiet');
const origin = git('git rev-parse origin/main', 'unknown');

console.log(`local  ${short(local)}  (${branch})`);
console.log(`origin ${short(origin)}  (origin/main)`);
if (local !== origin && local !== 'unknown' && origin !== 'unknown') {
  const ahead = git(`git log --oneline ${origin}..${local}`);
  if (ahead) console.log(`\nNot pushed yet:\n${ahead.split('\n').map(l => '  ' + l).join('\n')}`);
}

let behind = false;

for (const site of SITES) {
  console.log(`\n── ${site}`);
  let v;
  try {
    v = await fetchVersion(site);
  } catch (e) {
    // A missing version.json means the site predates this tooling, which is
    // itself the answer: it is older than the commit that added it.
    console.log(`  could not read /version.json (${e.message})`);
    console.log('  → the site is older than the build that started publishing it.');
    behind = true;
    continue;
  }

  const when = v.builtAt ? new Date(v.builtAt).toLocaleString() : 'unknown time';
  console.log(`  serving ${short(v.commit)}  (${v.ref || '?'}, built ${when})`);

  if (v.commit === origin) { console.log('  ✓ up to date with origin/main'); continue; }

  // `git log A..B` needs both commits present locally. A deployed commit that
  // was never fetched here would otherwise fail silently.
  const known = git(`git cat-file -t ${v.commit}`, '') === 'commit';
  if (!known) {
    console.log('  ? that commit is not in this clone — fetch, or the site is from another branch.');
    behind = true;
    continue;
  }

  const missing = git(`git log --oneline ${v.commit}..${origin}`);
  if (missing) {
    const n = missing.split('\n').length;
    console.log(`  ✗ BEHIND by ${n} commit${n === 1 ? '' : 's'}:`);
    console.log(missing.split('\n').map(l => '      ' + l).join('\n'));
    behind = true;
  } else {
    // Not behind and not equal: the site is ahead, which means origin/main was
    // rewound or the deploy came from elsewhere. Worth saying out loud.
    console.log('  ! the site is AHEAD of origin/main — deployed from another branch?');
  }
}

process.exit(behind ? 1 : 0);
