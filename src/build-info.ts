/**
 * Which build is serving this page.
 *
 * The question this answers is "does the live site have my change yet". Asked
 * constantly during a run of small deploys, and until now answered by fetching
 * files and comparing them by hand — which does not work: a change confined to
 * `public/js/` leaves the hashed bundle name identical, so a site one commit
 * behind looks byte-for-byte the same from outside.
 *
 * The constants are substituted at build time by `vite.config.ts`, so what
 * this reports IS the commit that produced the running code.
 *
 * Kept apart from `main.ts` so it can be tested without booting the app, auth
 * and the database client along with it.
 */

export interface BuildInfo {
  commit: string;
  short: string;
  ref: string;
  builtAt: string;
}

/**
 * `typeof` guards rather than direct reads: `define` is a textual
 * substitution, so in any context that did not go through Vite — a test, a
 * bare tsc run — the identifiers do not exist at all and reading one throws a
 * ReferenceError rather than yielding undefined.
 */
export function buildInfo(): BuildInfo {
  const commit = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '';
  const ref = typeof __BUILD_REF__ === 'string' ? __BUILD_REF__ : '';
  const builtAt = typeof __BUILD_AT__ === 'string' ? __BUILD_AT__ : '';
  return { commit, short: shortCommit(commit), ref, builtAt };
}

/** Seven characters: what git itself prints, and enough to be unambiguous. */
export function shortCommit(commit: string): string {
  const c = String(commit || '').trim();
  return c ? c.slice(0, 7) : 'unknown';
}

/**
 * The one line shown in the footer.
 *
 * Every part is optional because a build from a tarball has no git history and
 * a stamp with holes in it is still worth more than no stamp: the commit alone
 * answers the question, the branch and time only make it easier to read.
 */
export function formatBuildStamp(info: BuildInfo, now?: Date): string {
  const parts = [`build ${info.short}`];

  if (info.ref && info.ref !== 'unknown') parts.push(info.ref);

  const when = info.builtAt ? new Date(info.builtAt) : null;
  if (when && !isNaN(when.getTime())) {
    parts.push(when.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }));
  }
  return parts.join(' · ');
}

/** The full detail, for the hover title. */
export function buildStampTitle(info: BuildInfo): string {
  return [
    `commit ${info.commit || 'unknown'}`,
    `branch ${info.ref || 'unknown'}`,
    `built ${info.builtAt || 'unknown'}`
  ].join('\n');
}
