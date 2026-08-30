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
  // ─── window.supabaseService (src/data/supabase.ts) ─────────────────────────
  // Assigned by src/main.ts at startup. Shapes here are intentionally loose
  // (the raw rows are snake_case Supabase rows, not our camelCase app types)
  // — callers re-map fields by hand, same as the original supabaseClient.js
  // (now deleted) did.
  interface SupabaseAuthResult {
    data: Record<string, any>;
    error: { message: string } | null;
  }

  interface SupabaseServiceLike {
    isConfigured(): boolean;
    fetchSchool(code: string): Promise<Partial<School> | null>;
    fetchSchools(): Promise<Partial<School>[] | null>;
    fetchDrillsBank(schoolCode: string): Promise<Record<string, any>[] | null>;
    fetchPlayers(schoolCode: string): Promise<Record<string, any>[] | null>;
    fetchSchedule(teamId: string): Promise<Record<string, any>[] | null>;
    fetchPracticePlans(schoolCode: string): Promise<Record<string, any>[] | null>;
    fetchCoaches(schoolCode: string): Promise<Partial<Coach>[] | null>;
    fetchDailyThoughts(schoolCode: string): Promise<Partial<DailyThought>[] | null>;
    fetchSoccerCategories(schoolCode: string): Promise<Partial<SoccerCategory>[] | null>;
    upsertProfile(userId: string, fields: { name?: string; avatar?: string; teamLevel?: string }): Promise<Record<string, any> | null>;
    upsertPlayer(schoolCode: string, player: unknown): Promise<{ id?: string } | null>;
    deletePlayer(playerId: string): Promise<unknown>;
    upsertMatch(teamId: string, match: unknown): Promise<{ id?: string } | null>;
    deleteMatch(matchId: string): Promise<unknown>;

    // Multi-team support (Phase 1)
    fetchTeamsForViewer(): Promise<Record<string, any>[] | null>;
    fetchPublicDefaultTeamId(schoolId?: string): Promise<string | null>;
    fetchTeamRoster(teamId: string): Promise<Record<string, any>[] | null>;
    searchPlayersByName(query: string): Promise<Record<string, any>[] | null>;
    upsertPlayerIdentity(player: unknown): Promise<{ id?: string } | null>;
    upsertTeamMembership(teamId: string, schoolId: string, membership: Record<string, any>): Promise<{ ok: boolean; error?: string }>;
    deleteTeamMembership(teamId: string, playerId: string): Promise<{ ok: boolean; error?: string }>;

    // Real Supabase Auth
    signUpUser(email: string, password: string, metadata?: Record<string, any>): Promise<SupabaseAuthResult | null>;
    signInUser(email: string, password: string): Promise<SupabaseAuthResult | null>;
    signOutUser(): Promise<{ error: { message: string } | null } | null>;
    getSession(): Promise<{ data: { session: Record<string, any> | null }; error: unknown }>;
    onAuthStateChange(callback: (event: string, session: Record<string, any> | null) => void): unknown;
    verifyOtp(email: string, token: string): Promise<SupabaseAuthResult | null>;
    fetchOwnProfile(): Promise<Record<string, any> | null>;
    approveProfile(userId: string): Promise<Record<string, any> | null>;
    rejectProfile(userId: string): Promise<Record<string, any> | null>;
    fetchPendingApprovals(schoolCode?: string): Promise<Record<string, any>[] | null>;
    fetchRoles(): Promise<Array<{ name: string; permissions: Record<string, boolean> }> | null>;
    fetchMatrixStandings(teamId: string): Promise<Record<string, any>[] | null>;
    fetchMatrixLogs(teamId: string): Promise<Record<string, any>[] | null>;
    logMatrixResult(teamId: string, result: Record<string, any>): Promise<{ ok: boolean; error?: string }>;
    updateMatrixResult(id: string, result: Record<string, any>): Promise<{ ok: boolean; error?: string }>;
    deleteMatrixResult(id: string): Promise<{ ok: boolean; error?: string }>;
  }

  interface Window {
    supabaseService?: SupabaseServiceLike;
    // Third-party UMD globals, loaded via CDN <script> tags in index.html.
    XLSX?: any;
    JSZip?: any;
  }
}

export {};
