/**
 * Tests for createSchool — the admin path that adds a school or a club.
 *
 * The bug these exist for: schools.mascot is NOT NULL with no default, and the
 * first cut of createSchool never sent it. Every create would have failed in
 * production with a raw not_null_violation, and no render-level test could
 * see it — the form looked perfect. So these assert the payload that actually
 * reaches PostgREST, not the markup that produced it.
 *
 * Uses a fake client rather than a live connection: the point is what we send,
 * and the schema constraint that makes it required is already in
 * supabase_schema.sql.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';

import { supabaseService } from './supabase';

interface Captured { table: string; rows: Record<string, any>[] }

let captured: Captured[];
let insertError: { code?: string; message: string } | null;
let insertRows: Record<string, any>[];

const svc = supabaseService as any;

beforeEach(() => {
  captured = [];
  insertError = null;
  insertRows = [{ id: 'school-new' }];

  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      return {
        insert(rows: Record<string, any>[]) {
          captured.push({ table, rows });
          return { select: async () => ({ data: insertError ? null : insertRows, error: insertError }) };
        }
      };
    }
  };
});

const payload = () => captured[0].rows[0];

describe('createSchool', () => {
  it('sends every NOT NULL column the schools table requires', async () => {
    // name and mascot are both NOT NULL in supabase_schema.sql. Dropping
    // either makes the insert fail at the database, not in review.
    const res = await supabaseService.createSchool('rvsc', 'Riverside Surf SC', 'club', 'Surf');
    expect(res.ok).toBe(true);
    expect(payload().name).toBe('Riverside Surf SC');
    expect(payload().mascot).toBe('Surf');
  });

  it('records the kind, which is the whole reason this exists', async () => {
    // Without kind on the insert the column takes its default and every
    // organization created through the UI is a school.
    await supabaseService.createSchool('rvsc', 'Riverside Surf SC', 'club', 'Surf');
    expect(payload().kind).toBe('club');
  });

  it('writes to the schools table', async () => {
    await supabaseService.createSchool('rvsc', 'Riverside Surf SC', 'club', 'Surf');
    expect(captured[0].table).toBe('schools');
  });

  it('returns the new id so the caller can select the organization', async () => {
    const res = await supabaseService.createSchool('rvsc', 'Riverside Surf SC', 'club', 'Surf');
    expect(res.id).toBe('school-new');
  });

  it('lowercases the code, so RVSC and rvsc are not two organizations', async () => {
    await supabaseService.createSchool('  RVSC  ', 'Riverside Surf SC', 'school', 'Surf');
    expect(payload().code).toBe('rvsc');
  });

  it('trims the name and mascot', async () => {
    await supabaseService.createSchool('rvsc', '  Riverside Surf SC  ', 'school', '  Surf  ');
    expect(payload().name).toBe('Riverside Surf SC');
    expect(payload().mascot).toBe('Surf');
  });

  it('refuses a missing mascot before reaching the database', async () => {
    const res = await supabaseService.createSchool('rvsc', 'Riverside Surf SC', 'club', '');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('mascot');
    expect(captured).toHaveLength(0);
  });

  it('refuses a missing name or code before reaching the database', async () => {
    expect((await supabaseService.createSchool('', 'Riverside', 'club', 'Surf')).ok).toBe(false);
    expect((await supabaseService.createSchool('rvsc', '', 'club', 'Surf')).ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it('refuses a kind the column will not accept', async () => {
    const res = await supabaseService.createSchool('rvsc', 'Riverside', 'league', 'Surf');
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it('explains a duplicate code in words a coach can act on', async () => {
    // Postgres says 'duplicate key value violates unique constraint
    // "schools_code_key"'. That is not a sentence anyone should be shown.
    insertError = { code: '23505', message: 'duplicate key value violates unique constraint "schools_code_key"' };
    const res = await supabaseService.createSchool('bhs', 'Beaumont Again', 'school', 'Cougars');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('bhs');
    expect(res.error).not.toContain('constraint');
  });

  it('reports an RLS refusal rather than claiming success', async () => {
    // A denied write returns no error AND no rows. Treating that as success
    // would leave an admin looking for an organization that never existed.
    insertRows = [];
    const res = await supabaseService.createSchool('rvsc', 'Riverside', 'club', 'Surf');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('admin');
  });

  it('reports an unconfigured client instead of throwing', async () => {
    svc.isConfigured = () => false;
    const res = await supabaseService.createSchool('rvsc', 'Riverside', 'club', 'Surf');
    expect(res.ok).toBe(false);
  });
});
