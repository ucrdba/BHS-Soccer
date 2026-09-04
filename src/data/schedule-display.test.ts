/**
 * Showing a fixture date, whatever is actually stored.
 *
 * A date-typed cell in a spreadsheet is a NUMBER underneath — days since
 * 1899-12-30 — so a row that reached the database before the importer
 * understood that holds "46365" rather than a date. Rendered raw, a five-digit
 * number appears where a date belongs and the fixture looks corrupted, even
 * though the day is perfectly recoverable.
 *
 * Display goes through the same reader the importer uses, so the two can never
 * disagree about what a stored value means.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import scheduleSrc from '../../public/js/views/schedule.view.js?raw';
import { supabaseService } from './supabase';

let ctor: any;

beforeAll(() => {
  const w = globalThis as any;
  w.window = w;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;

  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, scheduleSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.data = { schedule: [], teams: [], players: [] };
  app.activeTeamId = 't1';
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    parseScheduleDate: (v: any, r?: Date) => supabaseService.parseScheduleDate(v, r),
    scheduleDayOfWeek: (v: any) => supabaseService.scheduleDayOfWeek(v)
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const show = (v: any) => makeApp().displayMatchDate(v);

describe('a spreadsheet serial that reached the database', () => {
  it('shows as a date, not a five-digit number', () => {
    // 46365 is 8 December 2026 in Excel's reckoning.
    const serial = String(Math.round(
      (Date.UTC(2026, 11, 8) - Date.UTC(1899, 11, 30)) / 86400000));
    expect(show(serial)).toContain('DEC 8 2026');
    expect(show(serial)).not.toMatch(/^\d+$/);
  });

  it('does not treat a small number as a date', () => {
    // A stray "7" is not 1900; showing it as written lets a coach see what is
    // actually stored and fix it.
    expect(show('7')).toBe('7');
  });
});

describe('the stored house format', () => {
  it('shows the date with the day of the week', () => {
    // A coach checks WHICH DAY a fixture falls on more often than the date.
    expect(show('DEC 8 2026')).toBe('DEC 8 2026 (Tue)');
  });

  it('leaves the date itself untouched', () => {
    expect(show('SEP 4 2026')).toContain('SEP 4 2026');
  });
});

describe('anything else a row might hold', () => {
  it('normalises a date written another way', () => {
    expect(show('8-Dec-2026')).toContain('DEC 8 2026');
  });

  it('shows unreadable text as written rather than blanking it', () => {
    // A coach can correct what they can see. A blank cell hides the problem.
    expect(show('TBD')).toBe('TBD');
    expect(show('Homecoming')).toBe('Homecoming');
  });

  it('shows nothing for an empty value', () => {
    expect(show('')).toBe('');
    expect(show(null)).toBe('');
    expect(show(undefined)).toBe('');
  });
});

describe('display and import agree', () => {
  it('reads through the same parser the importer uses', () => {
    // Two readers would eventually disagree about what a stored value means,
    // and the disagreement would show as a fixture on two different days.
    ['8-Dec-2026', '12/8/2026', '2026-12-08', 'DEC 8 2026'].forEach(input => {
      expect(show(input)).toContain(supabaseService.parseScheduleDate(input, new Date(2026, 8, 4))!);
    });
  });

  it('survives the parser being unavailable', () => {
    // The classic scripts load before the module graph finishes on a slow
    // connection; a schedule that throws is worse than one showing raw text.
    (window as any).supabaseService = {};
    expect(() => show('DEC 8 2026')).not.toThrow();
    expect(show('DEC 8 2026')).toBe('DEC 8 2026');
  });
});
