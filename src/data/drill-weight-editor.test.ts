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

  it('falls back to head_to_head for a measure the column will not accept', async () => {
    await supabaseService.upsertDrillBankItem('bhs', { name: 'Bad Measure', points: 5, measure: 'nonsense' });
    expect(payload().measure).toBe('head_to_head');
  });

  it('defaults to head_to_head when no measure is supplied at all', async () => {
    await supabaseService.upsertDrillBankItem('bhs', { name: 'No Measure', points: 5 });
    expect(payload().measure).toBe('head_to_head');
  });
});
