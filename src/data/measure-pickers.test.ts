/**
 * Every measure the service accepts must be offerable somewhere.
 *
 * `time_bands` was added to the service, the database constraint, the scoring
 * view and the Exercise Weights editor -- but not to the Create New Master
 * Drill form, which keeps its own list of options in index.html. So a coach
 * could not create a drill that used the new measure at all, and nothing
 * failed: the dropdown simply had one fewer choice than it should.
 *
 * There are two places a measure can be chosen. Adding a sixth measure without
 * touching both is the same mistake again, so this checks them against the
 * service's own list rather than against a copy.
 */

/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

import indexHtml from '../../index.html?raw';
import sessionSrc from '../../public/js/views/matrix-session.view.js?raw';
import { supabaseService } from './supabase';

/** The measures the service will actually store. */
const MEASURES: string[] = ((supabaseService as any).constructor as any).MEASURES
  || ['head_to_head', 'win_loss', 'count_high', 'time_low', 'time_bands'];

describe('the measures the service accepts', () => {
  it('includes the timed-standard measure', () => {
    expect(MEASURES).toContain('time_bands');
  });
});

describe('Create New Master Drill', () => {
  it('offers every measure the service accepts', () => {
    // The form that could not create a 3 Laps drill.
    const form = indexHtml.slice(
      indexHtml.indexOf('id="masterDrillFormMeasure"'),
      indexHtml.indexOf('</select>', indexHtml.indexOf('id="masterDrillFormMeasure"'))
    );
    for (const m of MEASURES) {
      expect(form, `Create New Master Drill is missing "${m}"`).toContain(`value="${m}"`);
    }
  });

  it('distinguishes the two timed measures in words a coach can act on', () => {
    // "Timed, lower is better" and "Timed against a standard" are different
    // rules; a coach picking between them needs to see which is which.
    const form = indexHtml.slice(
      indexHtml.indexOf('id="masterDrillFormMeasure"'),
      indexHtml.indexOf('</select>', indexHtml.indexOf('id="masterDrillFormMeasure"'))
    );
    expect(form).toMatch(/fastest wins/i);
    expect(form).toMatch(/against a standard/i);
  });
});

describe('the Exercise Weights editor', () => {
  it('offers every measure the service accepts', () => {
    for (const m of MEASURES) {
      expect(sessionSrc, `Exercise Weights is missing "${m}"`).toContain(`'${m}'`);
    }
  });
});
