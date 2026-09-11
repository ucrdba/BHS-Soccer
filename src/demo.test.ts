import { describe, expect, it } from 'vitest';
import { readDemoConfig, DEMO_NOTICE_TEXT, DEMO_ACCOUNTS } from './demo';

describe('readDemoConfig', () => {
  it('is off when nothing is set — production sets no VITE variables', () => {
    expect(readDemoConfig({})).toEqual({ enabled: false, password: '' });
  });

  // Every accidental value fails closed onto production behaviour: the one
  // thing that must never happen is the real site calling a real roster fake.
  it.each(['false', '', '0', 'yes', 'TRUE', 'true '])('stays off for %o', (value) => {
    expect(readDemoConfig({ VITE_DEMO_MODE: value }).enabled).toBe(false);
  });

  it('is on for exactly "true"', () => {
    expect(readDemoConfig({ VITE_DEMO_MODE: 'true' }).enabled).toBe(true);
  });

  it('carries the shared password only when demo mode is on', () => {
    expect(readDemoConfig({ VITE_DEMO_PASSWORD: 'pw' }).password).toBe('');
    expect(readDemoConfig({ VITE_DEMO_MODE: 'true', VITE_DEMO_PASSWORD: '  pw \n' }).password).toBe('pw');
  });
});

describe('the warning', () => {
  it('says the data is made up, that it is restored, and invites changes', () => {
    expect(DEMO_NOTICE_TEXT).toContain('made up');
    expect(DEMO_NOTICE_TEXT).toContain('restored every night');
    expect(DEMO_NOTICE_TEXT).toContain('Change anything you like');
  });

  // GitHub schedules in UTC, so any stated hour is wrong for half the year.
  it('names no time of day', () => {
    expect(DEMO_NOTICE_TEXT).not.toMatch(/\d/);
  });
});

describe('the nine demo accounts', () => {
  it('are demo1 to demo9 at demo.invalid, in order', () => {
    expect(DEMO_ACCOUNTS.map(a => a.email)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `demo${n}@demo.invalid`));
    expect(DEMO_ACCOUNTS.map(a => a.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('are seven coaches, then a player, then an admin', () => {
    expect(DEMO_ACCOUNTS.map(a => a.role)).toEqual(
      ['coach', 'coach', 'coach', 'coach', 'coach', 'coach', 'coach', 'player', 'admin']);
    expect(DEMO_ACCOUNTS.map(a => a.label)).toEqual(
      ['Coach 1', 'Coach 2', 'Coach 3', 'Coach 4', 'Coach 5', 'Coach 6', 'Coach 7', 'Player', 'Admin']);
  });

  it('each say what that role sees', () => {
    for (const a of DEMO_ACCOUNTS) expect(a.sees.length).toBeGreaterThan(10);
  });
});
