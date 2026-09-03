/**
 * The build stamp shown in the footer.
 *
 * It exists to answer "does the live site have my change yet" without fetching
 * files and comparing them by hand — which does not work, because a change
 * confined to `public/js/` leaves the hashed bundle name identical and a site
 * one commit behind looks byte-for-byte the same from outside.
 *
 * What is tested here is the formatting and the degradation. The substitution
 * itself is Vite's, and is checked by the build asserting the commit reached
 * the bundle.
 */

import { describe, it, expect } from 'vitest';
import { shortCommit, formatBuildStamp, buildStampTitle, type BuildInfo } from '../build-info';

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
