/**
 * The sign-up link a coach sends an invited person.
 *
 * The app does not email invitations -- that needs a server-held key -- so the
 * coach texts or emails this themselves. It only fills the address in: what
 * connects the person to their team is the invitation in the database, redeemed
 * when they confirm that address.
 *
 * The address rides in the fragment (#signup=), not the query string. Many of
 * these addresses belong to minors: a browser never sends the fragment to the
 * server, so it stays out of the host's request logs, and the header removes
 * it from the address bar and history as soon as it has been read.
 * completeEmailLink ignores it -- it acts only on a hash carrying
 * access_token= or error=, which an encoded address cannot contain.
 */
export function signupLink(origin: string, email: string): string {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/#signup=${encodeURIComponent(String(email || '').trim().toLowerCase())}`;
}

/** The address a sign-up link carries in its hash; null when the page was not opened from one. */
export function readSignupEmail(hash: string): string | null {
  const raw = String(hash || '');
  if (!raw.startsWith('#')) return null;
  const params = new URLSearchParams(raw.slice(1));
  if (!params.has('signup')) return null;
  return (params.get('signup') || '').trim().toLowerCase();
}
