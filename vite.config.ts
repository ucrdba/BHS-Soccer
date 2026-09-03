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

const stamp = buildStamp();

export default defineConfig({
  root: '.',
  define: {
    __BUILD_COMMIT__: JSON.stringify(stamp.commit),
    __BUILD_REF__: JSON.stringify(stamp.ref),
    __BUILD_AT__: JSON.stringify(stamp.builtAt)
  },
  plugins: [
    {
      // Also written as a file, so the deployed commit can be read with one
      // request — by a script, or by anyone checking without a browser.
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify(stamp, null, 2)
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
