import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

/**
 * What commit produced this build.
 *
 * Vercel exports VERCEL_GIT_COMMIT_SHA and _REF during a build, so a deployed
 * bundle can state exactly which commit it came from. Locally there are no
 * such variables, so git is asked directly.
 *
 * Wrapped because neither source is guaranteed: a build from a tarball has no
 * .git directory, and a failure here must not take the whole build down for
 * the sake of a label.
 */
function buildStamp() {
  const env = (globalThis as any).process?.env ?? {};
  const git = (cmd: string, fallback: string) => {
    try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
    catch { return fallback; }
  };

  return {
    commit: env.VERCEL_GIT_COMMIT_SHA || git('git rev-parse HEAD', 'unknown'),
    ref: env.VERCEL_GIT_COMMIT_REF || git('git rev-parse --abbrev-ref HEAD', 'unknown'),
    builtAt: new Date().toISOString()
  };
}

export default defineConfig({
  root: '.',
  plugins: [
    {
      name: 'build-stamp',

      /**
       * Injected into the HTML rather than substituted into the source.
       *
       * Vite's `define` is applied at BUILD time only: the dev server serves
       * `__BUILD_COMMIT__` untouched, so the identifier is undefined at
       * runtime and the footer reads "build unknown" on localhost — which is
       * precisely where you most want to know what you are running.
       *
       * transformIndexHtml runs in dev AND build, so one mechanism covers
       * both. Recomputed per request in dev so the commit follows a checkout
       * without restarting the server.
       */
      transformIndexHtml() {
        return [{
          tag: 'script',
          attrs: { id: 'build-stamp' },
          children: `window.__BUILD__ = ${JSON.stringify(buildStamp())};`,
          injectTo: 'head'
        }];
      },

      // Also written as a file, so the deployed commit can be read with one
      // request — by a script, or by anyone checking without a browser.
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify(buildStamp(), null, 2)
        });
      }
    }
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
