/// <reference types="vite/client" />

/**
 * Single-file components, for TypeScript.
 *
 * Without this every `import X from './X.vue'` is an unresolved module. The
 * loose `DefineComponent<{}, {}, any>` matches this project's tsconfig, which
 * is deliberately not strict.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/**
 * Build-time variables. Every one of these is SUBSTITUTED INTO THE BUNDLE and
 * is therefore public — never put a secret behind a `VITE_` name.
 *
 * Production sets none of them and behaves exactly as it always has. They
 * exist so the demo deployment can point at the demo Supabase project and turn
 * demo mode on, from Vercel's settings, with no branch in the application code.
 */
interface ImportMetaEnv {
  /** The demo project's URL, e.g. https://nzelhvipofeqoteewvhg.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Its publishable key — `sb_publishable_...`, or a legacy `eyJ...` anon key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Exactly `'true'` turns on demo mode: the warning and the account picker. */
  readonly VITE_DEMO_MODE?: string;
  /** The nine demo accounts' shared password. Public by construction. */
  readonly VITE_DEMO_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
