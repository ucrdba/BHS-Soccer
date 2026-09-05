/**
 * Which publishable-key formats the Supabase client accepts.
 *
 * Supabase issues two of them. Projects created before the 2025 key rotation
 * carry a JWT anon key beginning `eyJ`; projects created after it carry
 * `sb_publishable_...` instead, and have no JWT anon key at all unless legacy
 * keys are deliberately switched back on. The demo project is one of the
 * newer ones, so a check for `eyJ` alone leaves it permanently unconfigured —
 * and silently, because an unconfigured client is not an error, it is simply
 * a client that returns null from every method.
 *
 * Both formats are publishable by design: RLS, not secrecy, is what protects
 * the data. So this check exists only to catch a paste of the wrong thing —
 * an empty box, a project URL, or a new-format secret key (`sb_secret_...`),
 * which bypasses RLS entirely and must never reach a browser. It cannot catch
 * a legacy `service_role` key, which is a JWT and shares the `eyJ` prefix
 * with the anon key it should never be confused with.
 */
export function isPublishableAnonKey(key: string | null | undefined): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  return trimmed.startsWith('eyJ') || trimmed.startsWith('sb_publishable_');
}
