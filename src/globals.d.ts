/**
 * Ambient globals.
 *
 * Two things live on `window` and nothing else should join them.
 *
 * **`supabaseService`** is published by `src/vue-main.ts` because
 * `src/auth.ts` reads it off `window` in fifteen places. That is a leftover
 * from the legacy app, where the classic scripts had no other way to reach a
 * module; remove the assignment and every auth call silently degrades to a
 * guest. The shapes here are deliberately loose, because these are raw
 * snake_case Supabase rows and callers re-map them by hand.
 *
 * **`XLSX` and `JSZip`** are third-party UMD builds loaded from CDN by
 * `index.html`, for the workbook import and export. They are optional on
 * purpose: `ImportExportModal.vue` reports their absence rather than
 * throwing, so a slow CDN is a message rather than a crash.
 *
 * This file used to declare a much larger surface -- the prototype methods of
 * the un-migrated legacy app, so the TypeScript side could type-check against
 * it. Phase 7 deleted that app, and the declarations went with it.
 */

import type { Coach, DailyThought, School, SoccerCategory } from './types';

declare global {
  // ─── window.supabaseService (src/data/supabase.ts) ─────────────────────────
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
    fetchPracticePlans(teamId: string): Promise<Record<string, any>[] | null>;
    teamsCoachedBy(): Promise<Record<string, any>[] | null>;
    // A plan is the set of practice_plans rows sharing a name, so this renames
    // every slot -- and refuses a name the team already uses, which would fuse
    // the two plans into one session.
    renamePracticePlan(teamId: string, oldName: string, newName: string):
      Promise<{ ok: boolean; error?: string; slots?: number }>;
    copyPracticePlan(planName: string, fromTeamId: string, toTeamId: string):
      Promise<{ ok: boolean; error?: string; slots?: number }>;
    copyDailyThought(thoughtId: string, toTeamId: string):
      Promise<{ ok: boolean; error?: string; id?: string }>;
    // The questions one team's quiz asks: the organization's bank filtered by
    // that team's selection (team_quiz_questions, added by 0017).
    fetchTeamQuiz(teamId: string): Promise<Record<string, any>[] | null>;
    // The whole bank for an organization, each question carrying the ids of
    // the teams that ask it. The editor needs questions no team has switched
    // on; fetchTeamQuiz by definition cannot return those.
    fetchQuizBank(schoolId: string): Promise<Record<string, any>[] | null>;
    setTeamQuizQuestion(teamId: string, questionId: string, on: boolean): Promise<{ ok: boolean; error?: string }>;
    retireQuizQuestion(questionId: string): Promise<{ ok: boolean; error?: string }>;
    findThoughtIdByTitle(teamId: string, title: string): Promise<string | null>;
    // A quiz sheet points at its daily message by the number the coach gave
    // it on the thoughts sheet (0019).
    findThoughtIdByKey(teamId: string, key: string): Promise<string | null>;
    attachAnswers(questions: Record<string, any>[]): Promise<Record<string, any>[]>;
    saveQuizAnswers(questionId: string, answers: any[] | undefined, correctLetter: string, fallback: string[]): Promise<void>;
    fetchActiveThoughtId(teamId: string): Promise<string | null>;
    upsertQuizQuestion(q: any): Promise<{ ok: boolean; error?: string; id?: string }>;
    fetchDrillsForWeighting(schoolId?: string): Promise<Record<string, any>[] | null>;
    // Timed exercises scored against an absolute standard rather than by
    // finishing position (0022). Bands are per team: a 4:30 that stretches a
    // varsity side is out of reach for an under-14.
    parseTimeToSeconds(value: unknown): number | null;
    parseScheduleDate(value: unknown, reference?: Date): string | null;
    scheduleDayOfWeek(matchDate: unknown): string | null;
    formatSecondsAsTime(seconds: unknown): string;
    factorForTime(seconds: unknown, bands: Record<string, any>[]): number;
    fetchTimeBands(drillId: string, teamId: string): Promise<Record<string, any>[] | null>;
    saveTimeBands(drillId: string, teamId: string, rows: { time: unknown; factor: unknown }[]):
      Promise<{ ok: boolean; error?: string; saved?: number }>;
    updateDrillWeights(rows: { id: string; points: number; measure: string }[]):
      Promise<{ ok: boolean; error?: string; updated: number }>;
    fetchMatrixSessions(teamId: string): Promise<Record<string, any>[] | null>;
    saveMatrixSession(
      teamId: string,
      session: { id?: string; drillId: string; occurredOn: string; notes?: string },
      results: { playerId: string; attendance: string; rawValue?: number | null; outcome?: string | null }[]
    ): Promise<{ ok: boolean; error?: string; id?: string }>;
    fetchPlayerBreakdown(teamId: string, playerId: string): Promise<Record<string, any>[] | null>;
    fetchMatrixSessionResults(sessionId: string): Promise<Record<string, any>[] | null>;
    deleteMatrixSession(sessionId: string): Promise<{ ok: boolean; error?: string }>;
    createSchool(code: string, name: string, kind: string, mascot: string): Promise<{ ok: boolean; error?: string; id?: string }>;
    fetchCoaches(schoolCode: string): Promise<Partial<Coach>[] | null>;
    fetchDailyThoughts(teamId: string): Promise<Partial<DailyThought>[] | null>;
    fetchLatestDailyThoughts(teamId: string): Promise<Partial<DailyThought> | null>;
    upsertDailyThought(teamId: string, thought: any): Promise<any>;
    setActiveDailyThought(teamId: string, activeId?: string): Promise<any>;
    fetchSoccerCategories(schoolCode: string): Promise<Partial<SoccerCategory>[] | null>;
    // Every one of these takes the organization: migration 0027 gave
    // soccer_categories a school_id and made the name unique per
    // organization, and the rename and merge work by NAME, so unscoped they
    // reach into every other organization's list.
    upsertSoccerCategory(schoolCode: string, category: any): Promise<{ ok: boolean; error?: string; data?: any }>;
    fetchCategoryUsage(schoolCode: string): Promise<Record<string, number> | null>;
    retagDrills(schoolCode: string, fromName: string, toName: string): Promise<{ ok: boolean; error?: string; count?: number }>;
    renameSoccerCategory(schoolCode: string, id: string, oldName: string, newName: string):
      Promise<{ ok: boolean; error?: string; drillsUpdated?: number }>;
    mergeSoccerCategory(schoolCode: string, fromName: string, toName: string):
      Promise<{ ok: boolean; error?: string; drillsUpdated?: number }>;
    retireSoccerCategory(id: string): Promise<{ ok: boolean; error?: string }>;
    upsertProfile(userId: string, fields: { name?: string; avatar?: string; teamLevel?: string }): Promise<Record<string, any> | null>;
    upsertPlayer(schoolCode: string, player: unknown): Promise<{ id?: string } | null>;
    deletePlayer(playerId: string): Promise<unknown>;
    upsertMatch(teamId: string, match: unknown): Promise<{ id?: string } | null>;
    deleteMatch(matchId: string): Promise<unknown>;

    // Multi-team support (Phase 1)
    fetchTeamsForViewer(): Promise<Record<string, any>[] | null>;
    fetchPublicDefaultTeamId(schoolId?: string): Promise<string | null>;
    fetchTeamRoster(teamId: string): Promise<Record<string, any>[] | null>;
    fetchAllPlayerIdentities(): Promise<Record<string, any>[] | null>;
    fetchAllTeams(): Promise<Record<string, any>[] | null>;
    fetchTeamCoaches(): Promise<Record<string, any>[] | null>;
    fetchAssignableCoaches(): Promise<Record<string, any>[] | null>;
    assignCoachToTeam(teamId: string, profileId: string): Promise<{ ok: boolean; error?: string }>;
    removeCoachFromTeam(teamId: string, profileId: string): Promise<{ ok: boolean; error?: string }>;
    createTeam(schoolId: string, name: string, season?: string): Promise<{ ok: boolean; id?: string; error?: string }>;
    updateTeam(
      teamId: string,
      changes: { name?: string; season?: string | null; matchMinutes?: number | null }
    ): Promise<{ ok: boolean; error?: string }>;
    setRecordingNumber(teamId: string, playerId: string, recordingNumber: number | null): Promise<{ ok: boolean; error?: string }>;
    setUniformNumber(teamId: string, playerId: string, number: number | null): Promise<{ ok: boolean; error?: string }>;
    fetchLineup(teamId: string, matchId?: string | null): Promise<Record<string, any> | null>;
    fetchTeamLineups(teamId: string): Promise<Record<string, any>[] | null>;
    fetchTeamSessionHistory(teamId: string): Promise<Record<string, any>[] | null>;
    openStatMatch(teamId: string, schoolId: string, matchId: string | null, label?: string): Promise<{ ok: boolean; error?: string; id?: string }>;
    fetchStatEvents(statMatchId: string): Promise<Record<string, any>[] | null>;
    appendStatEvent(statMatchId: string, event: { kind: string; playerId?: string | null; atSeconds: number; period?: number }): Promise<{ ok: boolean; error?: string; id?: string }>;
    undoStatEvent(eventId: string): Promise<{ ok: boolean; error?: string }>;
    saveLineup(teamId: string, schoolId: string, matchId: string | null, formation: string, players: Record<string, any>[], notes?: string | null): Promise<{ ok: boolean; error?: string; id?: string }>;
    searchPlayersByName(query: string): Promise<Record<string, any>[] | null>;
    // Paper Matrix sheets carry a recording number rather than a name,
    // because handwriting is not always readable (0021). An unknown number
    // is refused and named rather than guessed at.
    fetchTeamLookup(teamId: string): Promise<Record<string, any>[] | null>;
    // Every scored line for a team, so the leaderboard can be filtered to a
    // single exercise without re-deriving what anything is worth.
    fetchTeamExercisePoints(teamId: string): Promise<Record<string, any>[] | null>;
    findPlayerByRecordingNumber(teamId: string, value: unknown):
      Promise<{ ok: boolean; error?: string; player?: Record<string, any> }>;
    findPlayerOnTeam(teamId: string, value: unknown):
      Promise<{ ok: boolean; error?: string; player?: Record<string, any> }>;
    // People on no team, each with a resultCount so a caller knows whether
    // retiring them would strand Matrix history.
    fetchUnassignedPlayers(): Promise<Record<string, any>[] | null>;
    upsertPlayerIdentity(player: unknown): Promise<{ id?: string } | null>;
    // Mirrors the backfill rule in 0016: splits on the FIRST space so a
    // compound surname stays whole.
    splitPlayerName(full: string): { firstName: string; lastName: string };
    upsertTeamMembership(teamId: string, schoolId: string, membership: Record<string, any>): Promise<{ ok: boolean; error?: string }>;
    deleteTeamMembership(teamId: string, playerId: string): Promise<{ ok: boolean; error?: string }>;

    // Real Supabase Auth
    authRedirectUrl(): string;
    completeEmailLink(): Promise<{ outcome: string; message?: string }>;
    signUpUser(email: string, password: string, metadata?: Record<string, any>): Promise<SupabaseAuthResult | null>;
    signInUser(email: string, password: string): Promise<SupabaseAuthResult | null>;
    signOutUser(): Promise<{ error: { message: string } | null } | null>;
    getSession(): Promise<{ data: { session: Record<string, any> | null }; error: unknown }>;
    onAuthStateChange(callback: (event: string, session: Record<string, any> | null) => void): unknown;
    verifyOtp(email: string, token: string): Promise<SupabaseAuthResult | null>;
    fetchOwnProfile(): Promise<Record<string, any> | null>;
    approveProfile(userId: string): Promise<Record<string, any> | null>;
    rejectProfile(userId: string): Promise<Record<string, any> | null>;
    fetchPendingApprovals(schoolCode: string): Promise<Record<string, any>[] | null>;
    fetchRoles(): Promise<Array<{ name: string; permissions: Record<string, boolean> }> | null>;
    fetchMatrixStandings(teamId: string): Promise<Record<string, any>[] | null>;
    fetchMatrixLogs(teamId: string): Promise<Record<string, any>[] | null>;
    logMatrixResult(teamId: string, result: Record<string, any>): Promise<{ ok: boolean; error?: string }>;
    updateMatrixResult(id: string, result: Record<string, any>): Promise<{ ok: boolean; error?: string }>;
    deleteMatrixResult(id: string): Promise<{ ok: boolean; error?: string }>;
  }

  interface Window {
    supabaseService?: SupabaseServiceLike;
    // Third-party UMD globals, loaded via CDN script tags in index.html.
    XLSX?: any;
    JSZip?: any;
  }

}

export {};
