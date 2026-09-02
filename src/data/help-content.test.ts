/**
 * The handbook's coverage.
 *
 * A handbook goes stale silently: the app changes, the text does not, and the
 * first sign is a coach following instructions that no longer match the screen.
 * These check that the features which exist are actually described, and that
 * the parts most likely to be got wrong are stated.
 *
 * They are deliberately about SUBSTANCE, not wording -- asserting exact prose
 * would break on every edit and teach nobody anything.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import helpSrc from '../../public/js/views/help.view.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, helpSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

let sections: any[];

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const app = Object.create(ctor.prototype);
  app.data = {};
  sections = app.helpSections();
});

const all = () => sections.map(s => s.body).join('\n');
const byId = (id: string) => sections.find(s => s.id === id);

describe('the handbook is structurally sound', () => {
  it('gives every section an id, a title, a part and a role', () => {
    for (const s of sections) {
      expect(s.id, JSON.stringify(s.title)).toBeTruthy();
      expect(s.title, s.id).toBeTruthy();
      expect(s.part, s.id).toBeTruthy();
      expect(Array.isArray(s.roles) && s.roles.length, s.id).toBeTruthy();
    }
  });

  it('uses each id only once, since they are anchors', () => {
    const ids = sections.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves no section empty', () => {
    for (const s of sections) expect(String(s.body).trim().length, s.id).toBeGreaterThan(80);
  });
});

describe('the worked examples a coach asked for', () => {
  const examples = () => sections.filter(s => s.part === 'Worked examples');

  it('exist as their own part of the handbook', () => {
    expect(examples().length).toBeGreaterThanOrEqual(6);
  });

  it('cover teams, coaches, players, drills, practices, ratings and plans', () => {
    const text = examples().map(s => s.title + ' ' + s.body).join(' ').toLowerCase();
    for (const topic of ['organization', 'coach', 'player', 'drill', 'practice', 'rating', 'plan']) {
      expect(text, `no worked example covers "${topic}"`).toContain(topic);
    }
  });

  it('are step-by-step rather than prose', () => {
    for (const s of examples()) {
      expect(s.body, s.id).toContain('help-steps');
    }
  });
});

describe('what the app can now do is described', () => {
  it('explains recording numbers, and that they are not shirt numbers', () => {
    const text = all().toLowerCase();
    expect(text).toContain('recording number');
    expect(text).toMatch(/jersey|shirt/);
  });

  it('explains the timed-standard measure', () => {
    expect(byId('weights').body.toLowerCase()).toContain('standard');
    expect(all()).toContain('4:30');
  });

  it('explains that standards are set per squad', () => {
    // The mistake this prevents: setting them once and wondering why another
    // team scores nothing.
    expect(all().toLowerCase()).toMatch(/standards? (are )?per squad|each squad carries its own/);
  });

  it('describes the round robin', () => {
    expect(byId('roundrobin')).toBeTruthy();
    expect(byId('roundrobin').body.toLowerCase()).toContain('every other');
  });

  it('describes filtering the leaderboard to one exercise', () => {
    expect(byId('reading').body.toLowerCase()).toContain('exercise');
    expect(byId('reading').body).toMatch(/picker|filter/i);
  });

  it('says a quiz question no team has ticked is asked by nobody', () => {
    // The invisible state, and the one worth warning about.
    expect(byId('thoughts').body.toLowerCase()).toContain('no team');
  });

  it('says first and last name are entered separately', () => {
    expect(byId('roster').body.toLowerCase()).toMatch(/first and last|two fields/);
  });
});

describe('the warnings that save a coach an afternoon', () => {
  it('warns that approving a coach is not the same as assigning them', () => {
    const text = all().toLowerCase();
    expect(text).toMatch(/approv\w+ is not assigning|not assigned to that team/);
  });

  it('warns that a blank import cell clears the stored value', () => {
    expect(all().toLowerCase()).toMatch(/blank cell clears|clears the stored value/);
  });

  it('warns that changing a weight re-scores past results', () => {
    expect(byId('weights').body.toLowerCase()).toContain('re-scored');
  });
});
