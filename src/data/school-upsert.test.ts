/**
 * The two image addresses, as upsertSchool writes them.
 *
 * Each is written only when supplied. Until its migration is applied the
 * column does not exist, and naming a missing column makes PostgREST refuse
 * the whole save with 42703 -- so an absent key must stay absent, and the
 * profile form decides whether to send it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;
let captured: any;

beforeEach(() => {
  captured = null;
  svc.client = {
    from: vi.fn(() => ({
      upsert: vi.fn((rows: any[]) => {
        captured = rows[0];
        return { select: async () => ({ data: [rows[0]], error: null }) };
      })
    }))
  };
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  svc.client = null;
});

describe('upsertSchool, the image addresses', () => {
  it('writes neither when neither is supplied', async () => {
    await svc.upsertSchool('lfc', { name: 'Legends FC', mascot: 'Lions' });
    expect(captured).not.toHaveProperty('logo_url');
    expect(captured).not.toHaveProperty('hero_url');
  });

  it('maps the logo to logo_url and the photo to hero_url', async () => {
    await svc.upsertSchool('lfc', {
      name: 'Legends FC', mascot: 'Lions', logoUrl: '/img/l.png', heroUrl: '/img/h.jpg'
    });
    expect(captured.logo_url).toBe('/img/l.png');
    expect(captured.hero_url).toBe('/img/h.jpg');
  });

  it('clears an address with null rather than an empty string', async () => {
    await svc.upsertSchool('lfc', { name: 'Legends FC', mascot: 'Lions', heroUrl: '' });
    expect(captured.hero_url).toBeNull();
  });
});
