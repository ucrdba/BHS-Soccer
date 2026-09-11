/**
 * Where the Supabase client's credentials come from, and in what order.
 *
 * This exists as its own module because the order is the whole point and it
 * is easy to get wrong in a way nothing notices: a build that resolves the
 * wrong project does not fail, it just reads and writes the wrong database.
 * The demo deployment depends on the build-time source winning over the
 * hardcoded production fallback, so that ordering is tested rather than
 * assumed.
 *
 * The order, highest priority first:
 *
 *   1. `window.ENV_SUPABASE_*`   injected by a host into the page at runtime
 *   2. `import.meta.env.VITE_*`  baked in at build time — how the demo
 *                                deployment points at the demo project
 *   3. `localStorage`            a per-device override, set from the admin
 *                                panel's Save Credentials
 *   4. the hardcoded production project
 *
 * Build-time sits above localStorage deliberately. A deployment built for one
 * database should not be silently redirected to another by whatever a browser
 * happens to have stored. Production sets no VITE variables, so it falls
 * straight through to the behaviour it has always had.
 */

export interface CredentialSources {
  /** `window.ENV_SUPABASE_URL` / `..._ANON_KEY`, if a host injected them. */
  runtime?: string | null;
  /** `import.meta.env.VITE_SUPABASE_URL` / `..._ANON_KEY`, baked in at build. */
  build?: string | null;
  /** `localStorage`, written by the admin panel. */
  stored?: string | null;
}

/**
 * The first source that holds something, trimmed; the fallback if none do.
 *
 * Empty and whitespace-only values are treated as absent. Vite substitutes an
 * unset `VITE_*` variable as `undefined`, but a variable defined as empty in a
 * Vercel project — easy to do by pasting nothing into the box — arrives as
 * `''`, and that must not win over the fallback and disconnect the app.
 */
export function resolveCredential(sources: CredentialSources, fallback: string): string {
  for (const candidate of [sources.runtime, sources.build, sources.stored]) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (value) return value;
  }
  return fallback;
}
