/**
 * Which build is serving this page.
 *
 * The question this answers is "does the live site have my change yet". Asked
 * constantly during a run of small deploys, and until now answered by fetching
 * files and comparing them by hand — which does not work: a change confined to
 * `public/js/` leaves the hashed bundle name identical, so a site one commit
 * behind looks byte-for-byte the same from outside.
 *
 * `vite.config.ts` injects the values into the page head as `window.__BUILD__`,
 * so what this reports IS the commit that produced the running code.
 *
 * Injected rather than substituted through Vite's `define`, which is applied
 * at build time only: the dev server serves the identifiers untouched, and the
 * footer read "build unknown" on localhost — precisely where you most want to
 * know what you are running.
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
 * Read the stamp the page was served with.
 *
 * Every field is defended separately: a page opened from a context that never
 * went through Vite has no `__BUILD__` at all, and one field being absent must
 * not cost the others.
 */
export function buildInfo(source?: Record<string, any>): BuildInfo {
  const raw = source
    ?? (typeof window !== 'undefined' ? (window as any).__BUILD__ : null)
    ?? {};
  const commit = typeof raw.commit === 'string' ? raw.commit : '';
  const ref = typeof raw.ref === 'string' ? raw.ref : '';
  const builtAt = typeof raw.builtAt === 'string' ? raw.builtAt : '';
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
