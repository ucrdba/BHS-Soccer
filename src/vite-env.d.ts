/// <reference types="vite/client" />

/**
 * Build-time variables. Every one of these is SUBSTITUTED INTO THE BUNDLE and
 * is therefore public — never put a secret behind a `VITE_` name. The
 * service-role key in .env.example is deliberately not here: it belongs to
 * scripts running on a machine, not to the browser.
 *
 * Production sets none of them and behaves exactly as it always has. They
 * exist so the demo deployment can point at the demo Supabase project and
 * switch its warning on, from Vercel's environment settings, with no branch in
 * the application code.
 */
interface ImportMetaEnv {
  /** The demo project's URL, e.g. https://nzelhvipofeqoteewvhg.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Its publishable key — `sb_publishable_...`, or a legacy `eyJ...` anon key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** `'true'` turns on demo mode: the permanent warning in the banner strip. */
  readonly VITE_DEMO_MODE?: string;
  /** Hours before a visitor's work is swept. Must match demo_settings.expire_after. */
  readonly VITE_DEMO_EXPIRY_HOURS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
