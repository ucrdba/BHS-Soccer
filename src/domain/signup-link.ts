/**
 * The sign-up link a coach sends an invited person.
 *
 * The app does not email invitations -- that needs a server-held key -- so the
 * coach texts or emails this themselves. It only fills the address in: what
 * connects the person to their team is the invitation in the database, redeemed
 * when they confirm that address.
 */
export function signupLink(origin: string, email: string): string {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/?signup=${encodeURIComponent(String(email || '').trim().toLowerCase())}`;
}

/** The address a sign-up link carries; null when the page was not opened from one. */
export function readSignupEmail(search: string): string | null {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  if (!params.has('signup')) return null;
  return (params.get('signup') || '').trim().toLowerCase();
}
