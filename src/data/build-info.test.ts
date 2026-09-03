/**
 * The build stamp shown in the footer.
 *
 * It exists to answer "does the live site have my change yet" without fetching
 * files and comparing them by hand — which does not work, because a change
 * confined to `public/js/` leaves the hashed bundle name identical and a site
 * one commit behind looks byte-for-byte the same from outside.
 *
 * What is tested here is the reading and the formatting. The injection itself
 * is Vite's, and is verified by checking that dist/index.html and the dev
 * server both carry a real commit.
 */

import { describe, it, expect } from 'vitest';
import { buildInfo, shortCommit, formatBuildStamp, buildStampTitle, type BuildInfo } from '../build-info';

const info = (over: Partial<BuildInfo> = {}): BuildInfo => ({
  commit: 'cb490c70fb625696e56ec8f41b3bd26320d2e8c8',
  short: 'cb490c7',
  ref: 'main',
  builtAt: '2026-09-03T23:09:23.342Z',
  ...over
});

describe('shortening a commit', () => {
  it('takes seven characters, which is what git prints', () => {
    expect(shortCommit('cb490c70fb625696e56ec8f41b3bd26320d2e8c8')).toBe('cb490c7');
  });

  it('says unknown rather than an empty string', () => {
    // A blank in the footer reads as a rendering fault; "unknown" reads as an
    // answer, and it is one — this build carries no git history.
    expect(shortCommit('')).toBe('unknown');
    expect(shortCommit(null as any)).toBe('unknown');
  });

  it('leaves a commit shorter than seven alone', () => {
    expect(shortCommit('abc')).toBe('abc');
  });
});

describe('the footer line', () => {
  it('leads with the commit, which is the part that answers the question', () => {
    expect(formatBuildStamp(info())).toMatch(/^build cb490c7/);
  });

  it('names the branch', () => {
    expect(formatBuildStamp(info())).toContain('main');
  });

  it('includes when it was built', () => {
    // Two deploys of the same commit are indistinguishable without it, which
    // matters while waiting for a CDN to catch up.
    expect(formatBuildStamp(info())).toMatch(/Sep|Sept/);
  });

  it('drops the branch when there is none rather than printing "unknown"', () => {
    const out = formatBuildStamp(info({ ref: 'unknown' }));
    expect(out).not.toContain('unknown ·');
    expect(out).toMatch(/^build cb490c7/);
  });

  it('survives a build with no timestamp', () => {
    expect(formatBuildStamp(info({ builtAt: '' }))).toBe('build cb490c7 · main');
  });

  it('survives a timestamp that is not a date', () => {
    // Better a stamp with a hole in it than a footer reading "Invalid Date".
    const out = formatBuildStamp(info({ builtAt: 'not-a-date' }));
    expect(out).not.toContain('Invalid');
    expect(out).toBe('build cb490c7 · main');
  });

  it('still says something when nothing at all is known', () => {
    expect(formatBuildStamp({ commit: '', short: 'unknown', ref: '', builtAt: '' }))
      .toBe('build unknown');
  });
});

describe('the hover detail', () => {
  it('carries the FULL commit, since seven characters cannot be pasted into git', () => {
    expect(buildStampTitle(info())).toContain('cb490c70fb625696e56ec8f41b3bd26320d2e8c8');
  });

  it('names the branch and the build time', () => {
    const t = buildStampTitle(info());
    expect(t).toContain('main');
    expect(t).toContain('2026-09-03');
  });

  it('says unknown for whatever is missing rather than leaving a gap', () => {
    const t = buildStampTitle({ commit: '', short: 'unknown', ref: '', builtAt: '' });
    expect(t).toContain('commit unknown');
    expect(t).toContain('branch unknown');
    expect(t).toContain('built unknown');
  });
});

describe('reading the stamp the page was served with', () => {
  /**
   * Injected as window.__BUILD__ by vite.config.ts, in BOTH dev and build.
   *
   * It began as Vite's `define`, which substitutes at build time only — so the
   * dev server served the identifiers untouched and localhost showed "build
   * unknown", which is precisely where you most want to know what you are
   * running. These tests pin the reading side of that fix.
   */
  it('reads the commit, branch and time that were injected', () => {
    const info = buildInfo({
      commit: 'cb490c70fb625696e56ec8f41b3bd26320d2e8c8',
      ref: 'main',
      builtAt: '2026-09-03T23:09:23.342Z'
    });
    expect(info.short).toBe('cb490c7');
    expect(info.ref).toBe('main');
    expect(info.builtAt).toBe('2026-09-03T23:09:23.342Z');
  });

  it('survives a page with no stamp at all', () => {
    // Opened from somewhere that never went through Vite. It must degrade to
    // "unknown", not throw and take the footer down with it.
    expect(() => buildInfo({})).not.toThrow();
    expect(buildInfo({}).short).toBe('unknown');
  });

  it('does not let one missing field cost the others', () => {
    const info = buildInfo({ commit: 'abc1234def', builtAt: '' });
    expect(info.short).toBe('abc1234');
    expect(info.ref).toBe('');
  });

  it('ignores a field of the wrong type rather than rendering it', () => {
    const info = buildInfo({ commit: 12345, ref: null, builtAt: {} });
    expect(info.short).toBe('unknown');
    expect(info.ref).toBe('');
    expect(info.builtAt).toBe('');
  });

  it('falls back to the window when given nothing', () => {
    (window as any).__BUILD__ = { commit: 'feedface0000', ref: 'main', builtAt: '' };
    expect(buildInfo().short).toBe('feedfac');
    delete (window as any).__BUILD__;
  });

  it('is unknown when the window carries no stamp', () => {
    delete (window as any).__BUILD__;
    expect(buildInfo().short).toBe('unknown');
  });
});
