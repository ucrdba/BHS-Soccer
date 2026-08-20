/**
 * BHS Soccer - Ambient globals
 *
 * These declare the shape of code that has NOT been migrated to TypeScript
 * modules yet. They exist purely so the parts of the app that HAVE been
 * converted can type-check against the parts that haven't.
 *
 * As each piece below gets its own real `src/*.ts` module (with real
 * `export`/`import`), delete the matching declaration here.
 */

import type { Coach, DailyThought, School, SoccerCategory } from './types';

declare global {
  // ─── supabaseClient.js (not yet converted) ─────────────────────────────────
  // Loaded via <script src="./supabaseClient.js"> and attached to
  // window.supabaseService. Shapes here are intentionally loose (the raw rows
  // are snake_case Supabase rows, not our camelCase app types) — callers
  // re-map fields by hand, same as the original JS did.
  interface SupabaseServiceLike {
    isConfigured(): boolean;
    fetchSchool(code: string): Promise<Partial<School> | null>;
    fetchSchools(): Promise<Partial<School>[] | null>;
    fetchDrillsBank(schoolCode: string): Promise<Record<string, any>[] | null>;
    fetchPlayers(schoolCode: string): Promise<Record<string, any>[] | null>;
    fetchSchedule(schoolCode: string): Promise<Record<string, any>[] | null>;
    fetchPracticePlans(schoolCode: string): Promise<Record<string, any>[] | null>;
    fetchCoaches(schoolCode: string): Promise<Partial<Coach>[] | null>;
    fetchDailyThoughts(schoolCode: string): Promise<Partial<DailyThought>[] | null>;
    fetchSoccerCategories(schoolCode: string): Promise<Partial<SoccerCategory>[] | null>;
    upsertProfile(schoolCode: string, user: unknown): Promise<unknown>;
    upsertPlayer(schoolCode: string, player: unknown): Promise<{ id?: string } | null>;
    deletePlayer(playerId: string): Promise<unknown>;
    upsertMatch(schoolCode: string, match: unknown): Promise<{ id?: string } | null>;
    deleteMatch(matchId: string): Promise<unknown>;
  }

  interface Window {
    supabaseService?: SupabaseServiceLike;
    // Third-party UMD globals, loaded via CDN <script> tags in index.html.
    XLSX?: any;
    JSZip?: any;
  }
}

export {};
