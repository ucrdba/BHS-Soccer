/**
 * Task 4: the drills library form sets an exercise's matrix weight and
 * measurement type, and the value actually survives a save.
 *
 * The markup for the "Create / Edit Master Drill" modal is static HTML in
 * index.html (id="masterDrillFormPoints" et al.) — planner.view.js only reads
 * and writes those fields via getElementById. So the label/select assertions
 * below read index.html, while the wiring assertions (prefill, save, badge)
 * read planner.view.js, matching where each half of the behavior actually
 * lives.
 *
 * The second describe block is the persistence half: upsertDrillBankItem
 * previously built a payload that never included `points` at all, so a coach
 * editing the weight in this exact form had it silently discarded on save.
 * These use a fake client, in the style of create-school.test.ts, to assert
 * the payload PostgREST actually receives.
 */
/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';
import indexHtml from '../../index.html?raw';
import plannerSrc from '../../public/js/views/planner.view.js?raw';
import { supabaseService } from './supabase';

describe('drills library weight field (markup)', () => {
  it('labels the field as the matrix weight, not bare points', () => {
    // "3 Pts" gives no hint that the number drives matrix scoring.
    expect(indexHtml).toContain('Matrix weight');
  });

  it('offers a measurement type select with all four values', () => {
    expect(indexHtml).toContain('masterDrillFormMeasure');
    for (const m of ['head_to_head', 'win_loss', 'count_high', 'time_low']) {
      expect(indexHtml).toContain(`value="${m}"`);
    }
  });

  it('accepts a fractional weight', () => {
    // The field was type="number" with no step, which rejects 2.5 in some
    // browsers and rounds it in others.
    expect(indexHtml).toContain('step="0.5"');
  });
});

describe('drills library rendering', () => {
  it('omits the duration badge rather than rendering "undefined"', () => {
    // duration is declared in supabase_schema.sql but does NOT exist on the
    // live drills_bank, so d.duration is undefined for every real drill and
    // the badge rendered the literal text "undefined" beside a stopwatch.
    expect(plannerSrc).toContain('${d.duration ?');
  });
});

describe('drills library weight field (wiring in planner.view.js)', () => {
  it('prefills both the weight and the measure when editing an existing drill', () => {
    expect(plannerSrc).toContain("document.getElementById('masterDrillFormMeasure').value = targetDrill.measure || 'head_to_head'");
  });

  it('resets the measure select back to its default for a brand new drill', () => {
    expect(plannerSrc).toContain("document.getElementById('masterDrillFormMeasure').value = 'head_to_head'");
  });

  it('reads both fields on save, keeping the weight fractional', () => {
    expect(plannerSrc).toContain("parseFloat(document.getElementById('masterDrillFormPoints')?.value)");
    expect(plannerSrc).toContain("document.getElementById('masterDrillFormMeasure')?.value");
  });

  it('describes the badge number as a weight, not points', () => {
    expect(plannerSrc).not.toContain('Pts</span>');
    expect(plannerSrc).toContain('weight</span>');
  });
});

describe('upsertDrillBankItem persists the matrix weight and measure', () => {
  // This is the regression the controller addendum called out: the payload
  // built by upsertDrillBankItem never included `points` at all, so every
  // weight set through this form was discarded before it reached Postgres.

  interface Captured { table: string; rows: Record<string, any>[] }
  let captured: Captured[];
  const svc = supabaseService as any;

  beforeEach(() => {
    captured = [];
    svc.isConfigured = () => true;
    svc.getSchoolUuid = async () => 'school-uuid-1';
    svc.isUuid = () => false;
    svc.client = {
      from(table: string) {
        return {
          upsert(rows: Record<string, any>[]) {
            captured.push({ table, rows });
            return { select: async () => ({ data: [{ id: 'drill-1', ...rows[0] }], error: null }) };
          }
        };
      }
    };
  });

  const payload = () => captured[0].rows[0];

  it('writes a positive fractional weight', async () => {
    await supabaseService.upsertDrillBankItem('bhs', { name: '1v1 Gauntlet', points: 2.5, measure: 'head_to_head' });
    expect(payload().points).toBe(2.5);
  });

  it('writes a weight of exactly 0, which is a legitimate "does not count" value', async () => {
    // A truthiness check (`if (drill.points)`) would silently drop this —
    // the same class of bug this task exists to fix.
    await supabaseService.upsertDrillBankItem('bhs', { name: 'Cooldown Jog', points: 0, measure: 'count_high' });
    expect(payload().points).toBe(0);
  });

  it('does not write points at all when none was supplied', async () => {
    await supabaseService.upsertDrillBankItem('bhs', { name: 'Untimed Warmup', measure: 'time_low' });
    expect('points' in payload()).toBe(false);
  });

  it('writes the measure the coach selected', async () => {
    await supabaseService.upsertDrillBankItem('bhs', { name: 'Suicides', points: 5, measure: 'time_low' });
    expect(payload().measure).toBe('time_low');
  });

  it('omits measure entirely for a value the column will not accept', async () => {
    // Previously this defaulted the payload to 'head_to_head', which meant a
    // caller passing garbage silently overwrote whatever measure the drill
    // actually had. Sending nothing lets the existing column value (or its
    // database default on insert) stand.
    await supabaseService.upsertDrillBankItem('bhs', { name: 'Bad Measure', points: 5, measure: 'nonsense' });
    expect('measure' in payload()).toBe(false);
  });

  it('does not send measure at all when none was supplied', async () => {
    // Regression: this used to default to 'head_to_head' in the payload, so
    // any caller unaware of the field (an old form, a typo-fix save, the
    // XLSX drills import) silently reverted the drill's real measure —
    // de-scoring every session already recorded against it. The column has
    // a database default for genuine inserts; an update must not clobber it.
    await supabaseService.upsertDrillBankItem('bhs', { name: 'No Measure', points: 5 });
    expect('measure' in payload()).toBe(false);
  });

  it('writes the measure unchanged on an edit that only touches other fields', async () => {
    // The exact C3 scenario: opening a drill in the library and saving a
    // typo fix to its name must not touch measure, whatever it currently is.
    await supabaseService.upsertDrillBankItem('bhs', { id: 'drill-1', name: 'Fixed Typo', points: 3 });
    expect('measure' in payload()).toBe(false);
  });
});

import appCoreSrc from '../../public/js/app.core.js?raw';
import sessionSrc from '../../public/js/views/matrix-session.view.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

describe('weights editor', () => {
  let app: any;

  beforeEach(() => {
    const w = globalThis as any;
    w.auth = {
      isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
      canAccessRatings: () => true, subscribe: () => {},
      getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
      getRole: () => 'admin'
    };
    w.can = () => true;
    w.supabaseService = { isConfigured: () => false };
    const ctor = new Function(
      [strip(appCoreSrc), strip(sessionSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
    )() as any;
    app = Object.create(ctor.prototype);
    app._weightDrills = [
      { id: 'd1', name: "Cooper's Test", category: 'Fitness', points: 1.5, measure: 'count_high' },
      { id: 'd2', name: '1v1 Gauntlet', category: 'Technical', points: 3, measure: 'head_to_head' }
    ];
  });

  it('lists every drill with its current weight', () => {
    const html = app.renderWeightsRows();
    expect(html).toContain("Cooper's Test");
    expect(html).toContain('value="1.5"');
    expect(html).toContain('1v1 Gauntlet');
  });

  it('preselects each drill\'s measurement type', () => {
    const html = app.renderWeightsRows();
    const cooperBlock = html.slice(html.indexOf('weightMeasure_d1'), html.indexOf('</select>', html.indexOf('weightMeasure_d1')));
    expect(cooperBlock).toContain('value="count_high" selected');
  });

  it('says so when there are no drills to weight', () => {
    // An empty panel reads as "loading". A coach with no drills needs telling
    // to add one first.
    app._weightDrills = [];
    expect(app.renderWeightsRows()).toContain('No exercises');
  });
});
