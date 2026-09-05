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
