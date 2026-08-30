/**
 * Supabase Client Configuration & Database Bridge
 * Beaumont High School Cougars Soccer
 *
 * Ported from `supabaseClient.js` (a classic non-module script) to a typed
 * ES module. This is a port, not a redesign: method names, signatures, and
 * behaviour (including odd bits like swallowed errors returning `null`)
 * are preserved exactly, because ~40 existing call sites in
 * `public/js/admin.js` and `public/js/views/planner.view.js` depend on them
 * through the `window.supabaseService` global.
 *
 * `src/main.ts` assigns this module's `supabaseService` export to
 * `window.supabaseService` at startup. The original `supabaseClient.js`
 * has been deleted.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Credential resolution ──────────────────────────────────────────────────

// `initSupabaseClient()` runs at module-evaluation time. Once `window.auth`
// and `window.authReady` come from this module graph, a `localStorage` read
// that throws (blocked site data — sandboxed iframe, browser privacy
// settings) would abort module evaluation entirely and leave every global
// this graph assigns unset. Guard the read so a blocked storage API degrades
// to "no cloud DB", not "no app".
function readStoredCredential(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getSupabaseUrl(): string {
  return (window as any).ENV_SUPABASE_URL
    || readStoredCredential('bhs_supabase_url')
    || 'https://arsigevpgpbqluqbnhjr.supabase.co';
}

// The anon key is designed to be publishable — it ships in every Supabase
// client bundle, and RLS (not secrecy) is what actually protects the data.
// Keep the existing fallback: dropping it would leave the app silently
// disconnected when no credentials are configured. Value copied verbatim
// from the original getSupabaseAnonKey() in the now-deleted supabaseClient.js.
function getSupabaseAnonKey(): string {
  return (window as any).ENV_SUPABASE_ANON_KEY
    || readStoredCredential('bhs_supabase_anon_key')
    || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyc2lnZXZwZ3BicWx1cWJuaGpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MDY2NjgsImV4cCI6MjEwMTE4MjY2OH0.UayuI-pPjvY0qfFoSHrPNanaFr02V8mrbMFxAmy6-iw';
}

let supabaseClient: SupabaseClient | null = null;

function initSupabaseClient(): void {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (url && url.includes('.supabase.co') && key && key.startsWith('eyJ')) {
    try {
      supabaseClient = createClient(url, key);
      console.log('⚡ Connected to Supabase Cloud Database:', url);
    } catch (err: any) {
      console.warn('Supabase init notice:', err.message);
      supabaseClient = null;
    }
  } else {
    supabaseClient = null;
    console.log('📦 Operating in Local Database Mode (LocalStorage active). Provide valid Supabase Anon Key (starts with eyJ...) to enable Cloud DB.');
  }
}

initSupabaseClient();

// ─── Service ─────────────────────────────────────────────────────────────

class SupabaseService {
  client: SupabaseClient | null;
  _cachedSchoolUuidMap?: Record<string, string>;

  constructor() {
    this.client = supabaseClient;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  setCredentials(url: string, key: string): boolean {
    if (url) localStorage.setItem('bhs_supabase_url', url.trim());
    if (key) localStorage.setItem('bhs_supabase_anon_key', key.trim());
    initSupabaseClient();
    this.client = supabaseClient;
    return this.isConfigured();
  }

  async signUpUser(email: string, password: string, metadata: Record<string, any> = {}): Promise<any> {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client!.auth.signUp({ email, password, options: { data: metadata } });
      if (error) console.warn('Supabase Auth signUp notice:', error.message);
      return { data, error };
    } catch (e) {
      console.warn('Supabase Auth signUp exception:', e);
      return null;
    }
  }

  async signInUser(email: string, password: string): Promise<any> {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client!.auth.signInWithPassword({ email, password });
      if (error) console.warn('Supabase Auth signIn notice:', error.message);
      return { data, error };
    } catch (e) {
      console.warn('Supabase Auth signIn exception:', e);
      return null;
    }
  }

  async signOutUser(): Promise<any> {
    if (!this.isConfigured()) return null;
    try {
      const { error } = await this.client!.auth.signOut();
      if (error) console.warn('Supabase Auth signOut notice:', error.message);
      return { error };
    } catch (e) {
      console.warn('Supabase Auth signOut exception:', e);
      return null;
    }
  }

  async getSession(): Promise<any> {
    if (!this.isConfigured()) return { data: { session: null }, error: null };
    return this.client!.auth.getSession();
  }

  onAuthStateChange(callback: (event: string, session: Record<string, any> | null) => void): any {
    if (!this.isConfigured()) return null;
    return this.client!.auth.onAuthStateChange(callback);
  }

  async verifyOtp(email: string, token: string): Promise<any> {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client!.auth.verifyOtp({ email, token, type: 'signup' });
      if (error) console.warn('Supabase Auth verifyOtp notice:', error.message);
      return { data, error };
    } catch (e) {
      console.warn('Supabase Auth verifyOtp exception:', e);
      return null;
    }
  }

  async fetchOwnProfile(): Promise<any> {
    if (!this.isConfigured()) return null;
    try {
      const { data: userData, error: userError } = await this.client!.auth.getUser();
      if (userError || !userData?.user) {
        // This branch used to return null silently, which made a failed profile
        // load indistinguishable from an RLS denial — the caller only reports
        // "Account profile could not be loaded". Log which one it actually was.
        console.error(
          'Supabase fetchOwnProfile: getUser() failed —',
          userError ? userError.message : 'no user on the session',
        );
        return null;
      }
      const { data, error } = await this.client!
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (error) { console.error('Supabase fetchOwnProfile error:', error.message); return null; }
      if (!data) {
        // maybeSingle() returns { data: null, error: null } when RLS filters the
        // row out — a silent zero-row result. Distinguish it from a query error.
        console.error(
          'Supabase fetchOwnProfile: no profiles row visible for auth user',
          userData.user.id,
          '— either no such row exists, or RLS denied it.',
        );
      }
      return data;
    } catch (e) {
      console.error('Supabase fetchOwnProfile exception:', e);
      return null;
    }
  }

  isUuid(str: any): boolean {
    return typeof str === 'string' && str.length === 36 && str.includes('-');
  }

  async getSchoolUuid(schoolCodeOrId: string = 'bhs'): Promise<string | null> {
    if (!schoolCodeOrId) return null;
    if (this.isUuid(schoolCodeOrId)) return schoolCodeOrId;
    if (!this.isConfigured()) return null;

    if (this._cachedSchoolUuidMap && this._cachedSchoolUuidMap[schoolCodeOrId]) {
      return this._cachedSchoolUuidMap[schoolCodeOrId];
    }

    try {
      const { data, error } = await this.client!
        .from('schools')
        .select('id, code')
        .eq('code', schoolCodeOrId || 'bhs')
        .maybeSingle();

      if (data && data.id) {
        if (!this._cachedSchoolUuidMap) this._cachedSchoolUuidMap = {};
        this._cachedSchoolUuidMap[schoolCodeOrId] = data.id;
        return data.id;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async upsertProfile(userId: string, fields: { name?: string; avatar?: string; teamLevel?: string } = {}): Promise<any> {
    if (!this.isConfigured()) return null;
    if (!userId) { console.warn('Supabase upsertProfile: missing userId — profile rows are created by the handle_new_user DB trigger, not the client.'); return null; }

    const payload: Record<string, any> = {};
    if (fields.name !== undefined) payload.name = fields.name;
    if (fields.avatar !== undefined) payload.avatar_url = fields.avatar;
    if (fields.teamLevel !== undefined) payload.team_level = fields.teamLevel;

    try {
      const { data, error } = await this.client!
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select();

      if (error) {
        console.error('❌ Supabase profiles update error:', error.message, error);
        return null;
      }
      return data ? data[0] : null;
    } catch (err: any) {
      console.error('❌ Supabase profiles exception:', err.message);
      return null;
    }
  }

  async approveProfile(userId: string): Promise<any> {
    if (!this.isConfigured() || !userId) return null;
    try {
      const { data: existing, error: fetchError } = await this.client!
        .from('profiles')
        .select('requested_role')
        .eq('id', userId)
        .maybeSingle();
      if (fetchError || !existing) { console.error('❌ Supabase approveProfile fetch error:', fetchError?.message); return null; }

      const { data, error } = await this.client!
        .from('profiles')
        .update({ status: 'active', role: existing.requested_role || 'player' })
        .eq('id', userId)
        .select();
      if (error) { console.error('❌ Supabase approveProfile error:', error.message); return null; }
      return data ? data[0] : null;
    } catch (e: any) {
      console.error('❌ Supabase approveProfile exception:', e.message);
      return null;
    }
  }

  async rejectProfile(userId: string): Promise<any> {
    if (!this.isConfigured() || !userId) return null;
    try {
      const { data, error } = await this.client!
        .from('profiles')
        .update({ status: 'rejected' })
        .eq('id', userId)
        .select();
      if (error) { console.error('❌ Supabase rejectProfile error:', error.message); return null; }
      return data ? data[0] : null;
    } catch (e: any) {
      console.error('❌ Supabase rejectProfile exception:', e.message);
      return null;
    }
  }

  async fetchPendingApprovals(schoolId: string = 'bhs'): Promise<any> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('profiles')
      .select('*')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true });
    if (error) { console.error('Supabase fetchPendingApprovals error:', error.message); return null; }
    return data;
  }

  async testProfileInsert(): Promise<any> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Supabase client is not connected. Make sure a valid Supabase Anon Key (starts with eyJ...) is entered.' };
    }

    const testEmail = `test_profile_${Date.now().toString().slice(-4)}@bhs.org`;
    const schoolUuid = await this.getSchoolUuid('bhs');
    const payload: Record<string, any> = {
      name: 'Diagnostic Test Player',
      email: testEmail,
      role: 'player',
      status: 'active',
      team_level: 'Boys Varsity'
    };
    if (schoolUuid) payload.school_id = schoolUuid;

    try {
      const { data, error } = await this.client!
        .from('profiles')
        .upsert([payload], { onConflict: 'email' })
        .select();

      if (error) {
        console.error('❌ Supabase test profile insert error:', error.message);
        return { success: false, error: error.message };
      }

      console.log('✅ Supabase test profile inserted successfully:', data);
      return { success: true, data: data[0] };
    } catch (err: any) {
      console.error('❌ Supabase test profile exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  async runFullDatabaseDiagnostic(): Promise<any> {
    if (!this.isConfigured()) {
      return {
        success: false,
        summaryText: '❌ Supabase Database Client is NOT connected.\n\nReason: Missing or invalid Supabase Anon Key.\n\nFix: Open Admin Center -> Enter your Supabase Anon Key (starts with "eyJ...") and click "Save Credentials".',
        tableResults: []
      };
    }

    const schoolUuid = await this.getSchoolUuid('bhs');
    const tableResults: any[] = [];

    // Helper runner for individual table testing
    const testTable = async (tableName: string, icon: string, operation: string, testPayload: Record<string, any> | null, selectCols: string = '*') => {
      const res: Record<string, any> = {
        table: tableName,
        icon: icon,
        operation: operation,
        payload: testPayload,
        selectStatus: 'PASSED',
        selectDetails: '',
        insertStatus: 'PASSED',
        responseDetails: '',
        cleanupStatus: 'SKIPPED'
      };

      // 1. Test SELECT Query
      try {
        const sel = await this.client!.from(tableName).select(selectCols).limit(1);
        if (sel.error) {
          res.selectStatus = 'FAILED';
          res.selectDetails = `SELECT Error: ${sel.error.message} (Postgres Code: ${sel.error.code})`;
        } else {
          res.selectStatus = 'PASSED';
          res.selectDetails = `SELECT OK (${sel.data ? sel.data.length : 0} rows found)`;
        }
      } catch (e: any) {
        res.selectStatus = 'FAILED';
        res.selectDetails = `SELECT Exception: ${e.message}`;
      }

      // 2. Test INSERT / UPSERT Query (if test payload provided)
      if (testPayload) {
        try {
          let ins: any;
          if (operation === 'UPSERT') {
            const conflictCol = tableName === 'schools' ? 'code' : (tableName === 'profiles' ? 'email' : undefined);
            ins = await this.client!.from(tableName).upsert([testPayload], conflictCol ? { onConflict: conflictCol } : undefined).select();
          } else {
            ins = await this.client!.from(tableName).insert([testPayload]).select();
          }

          if (ins.error) {
            res.insertStatus = 'FAILED';
            res.responseDetails = `INSERT/UPSERT Failed: ${ins.error.message} (Postgres Code: ${ins.error.code})`;
          } else if (ins.data && ins.data.length > 0) {
            const insertedRow = ins.data[0];
            const primaryKeyVal = insertedRow.id || insertedRow.code;
            res.insertStatus = 'PASSED';
            res.responseDetails = `SUCCESS! Row inserted into '${tableName}' with Key: "${primaryKeyVal}"`;

            // Clean up test row
            try {
              if (tableName === 'schools') {
                await this.client!.from('schools').delete().eq('code', primaryKeyVal);
              } else if (insertedRow.id) {
                await this.client!.from(tableName).delete().eq('id', insertedRow.id);
              }
              res.cleanupStatus = 'PASSED (Test row cleaned up)';
            } catch (cleanErr: any) {
              res.cleanupStatus = `Cleanup Warning: ${cleanErr.message}`;
            }
          } else {
            res.insertStatus = 'FAILED';
            res.responseDetails = `INSERT query executed but returned 0 rows (Check RLS Policy)`;
          }
        } catch (e: any) {
          res.insertStatus = 'FAILED';
          res.responseDetails = `INSERT Exception: ${e.message}`;
        }
      } else {
        res.insertStatus = 'N/A';
        res.responseDetails = 'Read-only log table query test';
      }

      return res;
    };

    // 1. schools
    const testCode = 'diag_' + Date.now().toString().slice(-4);
    tableResults.push(await testTable('schools', '🏫', 'UPSERT', {
      code: testCode,
      name: 'Diagnostic Test School',
      mascot: 'Cougars',
      city: 'Beaumont, CA',
      colors: { primary: '#0047AB', secondary: '#FFD700' },
      record: { wins: 1, losses: 0, draws: 0 }
    }));

    // 2. profiles
    const testEmail = `test_diag_${Date.now().toString().slice(-4)}@bhs.org`;
    const profPayload: Record<string, any> = { name: 'Diagnostic Test Profile', email: testEmail, role: 'player', status: 'active' };
    if (schoolUuid) profPayload.school_id = schoolUuid;
    tableResults.push(await testTable('profiles', '👤', 'UPSERT', profPayload));

    // 3. players
    const playerPayload: Record<string, any> = { number: 99, name: 'Diagnostic Test Player', position: 'MID', class_year: 'Senior', height: "6'0\"" };
    if (schoolUuid) playerPayload.school_id = schoolUuid;
    tableResults.push(await testTable('players', '👥', 'INSERT', playerPayload));

    // 4. schedule
    const schedPayload: Record<string, any> = { opponent: 'Diagnostic Opponent', match_date: 'OCT 25', match_time: '5:00 PM', location: 'Varsity Field', is_home: true, status: 'UPCOMING' };
    if (schoolUuid) schedPayload.school_id = schoolUuid;
    tableResults.push(await testTable('schedule', '📅', 'INSERT', schedPayload));

    // 5. drills_bank
    const drillPayload: Record<string, any> = { name: 'Diagnostic Master Drill', duration: '15 min', category: 'Testing', points: 3, coach_notes: 'Automated test drill' };
    if (schoolUuid) drillPayload.school_id = schoolUuid;
    tableResults.push(await testTable('drills_bank', '📚', 'INSERT', drillPayload));

    // 6. practice_plans
    const planPayload: Record<string, any> = { time_slot: '0:00 - 0:15', name: 'Diagnostic Plan Item', duration: '15 min', coach_notes: 'Automated test item' };
    if (schoolUuid) planPayload.school_id = schoolUuid;
    tableResults.push(await testTable('practice_plans', '📋', 'INSERT', planPayload));

    // 7. coaches
    const coachPayload: Record<string, any> = { name: 'Diagnostic Coach', level: 'Staff Coach', email: `coach_diag_${Date.now().toString().slice(-4)}@bhs.org` };
    if (schoolUuid) coachPayload.school_id = schoolUuid;
    tableResults.push(await testTable('coaches', '👔', 'INSERT', coachPayload));

    // 8. daily_thoughts
    const thoughtPayload: Record<string, any> = { coach_name: 'Diagnostic Coach', thoughts_text: 'Diagnostic automated test thought', is_active: false };
    if (schoolUuid) thoughtPayload.school_id = schoolUuid;
    tableResults.push(await testTable('daily_thoughts', '💡', 'INSERT', thoughtPayload));

    // 9. matrix_logs
    tableResults.push(await testTable('matrix_logs', '📊', 'SELECT', null));

    const allPassed = tableResults.every(r => r.selectStatus === 'PASSED' && (r.insertStatus === 'PASSED' || r.insertStatus === 'N/A'));

    const summaryText = tableResults.map(r => {
      return `${r.icon} TABLE '${r.table}':
  • Operation: ${r.operation}
  • SELECT Status: ${r.selectStatus} (${r.selectDetails})
  • INSERT Status: ${r.insertStatus}
  • Payload Sent: ${JSON.stringify(r.payload)}
  • Response: ${r.responseDetails}`;
    }).join('\n\n');

    return {
      success: allPassed,
      credentials: {
        url: getSupabaseUrl(),
        anonKeyPrefix: getSupabaseAnonKey().slice(0, 15),
        schoolUuid: schoolUuid
      },
      tableResults: tableResults,
      summaryText: summaryText
    };
  }

  // Database Query Wrappers
  async fetchPlayers(schoolId: string = 'bhs'): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    let query = this.client!.from('players').select('*').or('is_deleted.is.null,is_deleted.eq.false') as any;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    if (schoolUuid) query = query.eq('school_id', schoolUuid);
    const { data, error } = await query;
    if (error) { console.error('Supabase fetchPlayers error:', error); return null; }
    return data;
  }

  async fetchSchedule(schoolId: string = 'bhs'): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    let query = this.client!.from('schedule').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: true }) as any;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    if (schoolUuid) query = query.eq('school_id', schoolUuid);
    const { data, error } = await query;
    if (error) { console.error('Supabase fetchSchedule error:', error); return null; }
    return data;
  }

  async upsertMatch(schoolId: string, match: any): Promise<{ id?: string } | null> {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    const payload: Record<string, any> = {
      opponent: match.opponent,
      match_date: match.date || match.match_date,
      match_time: match.time || match.match_time,
      location: match.location,
      is_home: match.isHome,
      status: match.status,
      score: match.score || null,
      result: match.result || null,
      is_deleted: match.is_deleted || match.isDeleted || false
    };
    if (schoolUuid) payload.school_id = schoolUuid;
    if (match.id && this.isUuid(match.id)) payload.id = match.id;
    const { data, error } = await this.client!
      .from('schedule')
      .upsert([payload])
      .select();
    if (error) console.error('Supabase upsertMatch error:', error);
    return data ? data[0] : null;
  }

  async deleteMatch(matchId: string): Promise<any> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('schedule')
      .update({ is_deleted: true })
      .eq('id', matchId)
      .select();
    if (error) console.error('Supabase soft deleteMatch error:', error);
    return data;
  }

  async fetchPracticePlans(schoolId: string = 'bhs'): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    let query = this.client!.from('practice_plans').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: true }) as any;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    if (schoolUuid) query = query.eq('school_id', schoolUuid);
    const { data, error } = await query;
    if (error) { console.error('Supabase fetchPracticePlans error:', error); return null; }
    return data;
  }

  async saveFullPracticePlan(schoolId: string = 'bhs', planNameOrObj?: any, drillsArr?: any[]): Promise<any> {
    if (!this.isConfigured()) return { success: false, error: 'Supabase Cloud DB is not configured.' };

    let planName = 'Practice Plan';
    let drills: any[] = [];

    if (typeof planNameOrObj === 'object' && planNameOrObj !== null) {
      planName = planNameOrObj.name || planNameOrObj.planName || 'Practice Plan';
      drills = planNameOrObj.items || planNameOrObj.drills || [];
    } else {
      planName = planNameOrObj || 'Practice Plan';
      drills = drillsArr || [];
    }

    if (!drills || drills.length === 0) {
      return { success: false, error: 'No drills provided in practice plan' };
    }

    const schoolUuid = await this.getSchoolUuid(schoolId);
    const rows = drills.map(d => {
      const item: Record<string, any> = {
        name: planName || 'Standard Practice Plan',
        drill: d.name || d.drill || 'Soccer Drill',
        time_slot: d.time || '',
        duration: d.duration || '',
        coach_notes: d.coachNotes || '',
        diagram_image: d.diagramImage || null,
        diagram_data: d.diagramData || null
      };
      if (schoolUuid) item.school_id = schoolUuid;
      if (d.id && this.isUuid(d.id)) item.id = d.id;
      return item;
    });

    console.log('⚡ Supabase inserting practice plan items into `practice_plans` table:', rows);

    try {
      const { data, error } = await this.client!
        .from('practice_plans')
        .upsert(rows)
        .select();

      if (error) {
        console.error('❌ Supabase saveFullPracticePlan error:', error.message, error);
        return { success: false, error: error.message };
      } else {
        console.log('✅ Supabase practice plan items saved successfully:', data);
        return { success: true, data };
      }
    } catch (err: any) {
      console.error('❌ Supabase saveFullPracticePlan exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  async savePracticePlanItem(schoolId: string, planItem: any): Promise<any> {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    const payload: Record<string, any> = {
      name: planItem.planName || (window as any).app?.data?.activePlanName || 'Standard Practice Plan',
      drill: planItem.name || planItem.drill || 'Soccer Drill',
      time_slot: planItem.time || '',
      duration: planItem.duration || '',
      coach_notes: planItem.coachNotes || '',
      diagram_image: planItem.diagramImage || null,
      diagram_data: planItem.diagramData || null
    };
    if (schoolUuid) payload.school_id = schoolUuid;
    if (planItem.id && this.isUuid(planItem.id)) payload.id = planItem.id;

    console.log('⚡ Supabase inserting practice plan item into `practice_plans` table:', payload);

    try {
      const { data, error } = await this.client!
        .from('practice_plans')
        .upsert([payload])
        .select();
      if (error) {
        console.error('❌ Supabase savePracticePlanItem error:', error.message, error);
        return null;
      }
      return data ? data[0] : null;
    } catch (e: any) {
      console.error('❌ Supabase savePracticePlanItem exception:', e.message);
      return null;
    }
  }

  async upsertPracticePlanItem(schoolId: string, planItem: any): Promise<any> {
    return this.savePracticePlanItem(schoolId, planItem);
  }

  async deletePracticePlanItem(planId: string): Promise<any> {
    if (!this.isConfigured()) return null;
    const { error } = await this.client!
      .from('practice_plans')
      .update({ is_deleted: true })
      .eq('id', planId);
    if (error) console.error('Supabase soft deletePracticePlanItem error:', error);
  }

  async fetchSoccerCategories(schoolId: string = 'bhs'): Promise<Partial<SoccerCategoryRow>[] | null> {
    if (!this.isConfigured()) return null;
    try {
      let query = this.client!.from('soccer_categories').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('name', { ascending: true });
      const { data, error } = await query;
      if (error) { console.error('Supabase fetchSoccerCategories error:', error.message); return null; }
      return data;
    } catch (e) {
      return null;
    }
  }

  async upsertSoccerCategory(schoolId: string = 'bhs', categoryObj: any = {}): Promise<any> {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    const payload: Record<string, any> = {
      name: categoryObj.name,
      description: categoryObj.description || '',
      is_deleted: categoryObj.is_deleted || false
    };
    if (schoolUuid) payload.school_id = schoolUuid;
    if (categoryObj.id && this.isUuid(categoryObj.id)) payload.id = categoryObj.id;

    try {
      const { data, error } = await this.client!
        .from('soccer_categories')
        .upsert([payload], { onConflict: 'name' })
        .select();
      if (error) { console.error('Supabase upsertSoccerCategory error:', error.message); return null; }
      return data ? data[0] : null;
    } catch (e) {
      return null;
    }
  }

  async fetchDrillsBank(schoolId: string = 'bhs'): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    try {
      let query = this.client!.from('drills_bank').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: true });
      const { data, error } = await query;
      if (error) { console.error('Supabase fetchDrillsBank error:', error.message); return null; }
      return data;
    } catch (e) {
      return null;
    }
  }

  async upsertDrillBankItem(schoolId: string = 'bhs', drill: any = {}): Promise<any> {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);

    const payload: Record<string, any> = {
      name: drill.name || 'Untitled Drill',
      category: drill.category || 'General',
      is_deleted: drill.is_deleted || drill.isDeleted || false
    };
    if (schoolUuid) payload.school_id = schoolUuid;
    if (drill.id && this.isUuid(drill.id)) payload.id = drill.id;

    if (drill.coachNotes) payload.coach_notes = drill.coachNotes;
    if (drill.diagramImage) payload.diagram_image = drill.diagramImage;
    if (drill.diagramData) payload.diagram_data = drill.diagramData;

    console.log('⚡ Supabase inserting drill into global `drills_bank` repository:', payload);

    try {
      const { data, error } = await this.client!
        .from('drills_bank')
        .upsert([payload], { onConflict: 'name' })
        .select();

      if (error) {
        console.error('❌ Supabase upsertDrillBankItem error:', error.message, error);
        return null;
      } else {
        console.log('✅ Supabase master drill saved successfully:', data);
        return data ? data[0] : null;
      }
    } catch (e: any) {
      console.error('❌ Supabase upsertDrillBankItem exception:', e.message);
      return null;
    }
  }

  async deleteDrillBankItem(drillId: string): Promise<any> {
    if (!this.isConfigured() || !drillId) return null;
    try {
      const { error } = await this.client!
        .from('drills_bank')
        .update({ is_deleted: true })
        .eq('id', drillId);
      if (error) console.error('Supabase soft deleteDrillBankItem error:', error.message);
    } catch (e) {}
  }

  async upsertPlayer(schoolId: string, player: any): Promise<{ id?: string } | null> {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    const dbPayload: Record<string, any> = {
      number: parseInt(player.number),
      name: player.name,
      position: player.position,
      class_year: player.classYear || player.class_year || 'Senior',
      height: player.height || '',
      // null, not '' — one representation of "no photo", so `photo_url is null`
      // matches every such row rather than half of them.
      photo_url: player.photo || player.photo_url || null,
      season_stats: player.seasonStats || player.season_stats || {},
      ratings: player.ratings || {},
      matrix_stats: player.matrixStats || player.matrix_stats || {},
      is_deleted: player.isDeleted || false
    };

    if (schoolUuid) dbPayload.school_id = schoolUuid;
    if (player.id && this.isUuid(player.id)) dbPayload.id = player.id;

    const { data, error } = await this.client!
      .from('players')
      .upsert([dbPayload])
      .select();
    if (error) console.error('Supabase upsertPlayer error:', error);
    return data ? data[0] : null;
  }

  async deletePlayer(playerId: string): Promise<any> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('players')
      .update({ is_deleted: true })
      .eq('id', playerId)
      .select();
    if (error) {
      console.error('Supabase soft deletePlayer error:', error);
    } else if (!data || data.length === 0) {
      console.warn('Supabase deletePlayer: no rows updated for id:', playerId, '— likely blocked by RLS policy. Run the fix SQL in Supabase Dashboard.');
    } else {
      console.log('Supabase deletePlayer: soft-deleted player', playerId, data);
    }
    return data;
  }

  async fetchSchool(schoolCode: string = 'bhs'): Promise<Partial<SchoolRow> | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client!
        .from('schools')
        .select('*')
        .eq('code', schoolCode)
        .maybeSingle();
      if (error) { console.error('Supabase fetchSchool error:', error.message); return null; }
      return data;
    } catch (e) {
      return null;
    }
  }

  async fetchSchools(): Promise<Partial<SchoolRow>[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client!
        .from('schools')
        .select('*')
        .order('name', { ascending: true });
      if (error) { console.error('Supabase fetchSchools error:', error.message); return null; }
      return data;
    } catch (e) {
      return null;
    }
  }

  async upsertSchool(schoolCode: string = 'bhs', school: any = {}): Promise<any> {
    if (!this.isConfigured()) return { data: null, error: 'Supabase Cloud DB is not configured (Anon Key missing).' };
    const payload: Record<string, any> = {
      code: schoolCode || school.code || 'bhs',
      name: school.name || 'Beaumont High School',
      mascot: school.mascot || 'Cougars',
      city: school.city || 'Beaumont, CA',
      colors: school.colors || { primary: '#0047AB', secondary: '#FFD700' },
      record: school.record || { wins: 0, losses: 0, draws: 0 }
    };

    if (school.id && this.isUuid(school.id)) {
      payload.id = school.id;
    }

    console.log('⚡ Supabase inserting school into `schools` table:', payload);

    try {
      const { data, error } = await this.client!
        .from('schools')
        .upsert([payload], { onConflict: 'code' })
        .select();

      if (error) {
        console.error('❌ Supabase upsertSchool error:', error.message, error);
        return { data: null, error: error.message };
      } else {
        console.log('✅ Supabase school saved successfully:', data);
        return { data: data ? data[0] : null, error: null };
      }
    } catch (err: any) {
      console.error('❌ Supabase upsertSchool exception:', err.message);
      return { data: null, error: err.message };
    }
  }

  async fetchCoaches(schoolId: string = 'bhs'): Promise<Partial<CoachRow>[] | null> {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    let query = this.client!.from('coaches').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: true }) as any;
    if (schoolUuid) query = query.eq('school_id', schoolUuid);
    const { data, error } = await query;
    if (error) { console.error('Supabase fetchCoaches error:', error); return null; }
    return data;
  }

  async upsertCoach(schoolId: string = 'bhs', coach: any = {}): Promise<any> {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    const payload: Record<string, any> = {
      name: coach.name || 'Coach',
      level: coach.level || 'Staff',
      phone: coach.phone || '',
      address: coach.address || '',
      email: coach.email || '',
      photo_url: coach.photo || coach.photo_url || null,
      bio: coach.bio || '',
      is_deleted: coach.is_deleted || coach.isDeleted || false
    };

    if (schoolUuid) payload.school_id = schoolUuid;
    if (coach.id && this.isUuid(coach.id)) {
      payload.id = coach.id;
    }

    console.log('⚡ Supabase inserting coach into `coaches` table:', payload);

    try {
      const { data, error } = await this.client!
        .from('coaches')
        .upsert([payload])
        .select();

      if (error) {
        console.error('❌ Supabase upsertCoach error:', error.message, error);
        return null;
      } else {
        console.log('✅ Supabase coach saved successfully:', data);
        return data ? data[0] : null;
      }
    } catch (err: any) {
      console.error('❌ Supabase upsertCoach exception:', err.message);
      return null;
    }
  }

  async deleteCoach(coachId: string): Promise<any> {
    if (!this.isConfigured()) return null;
    const { error } = await this.client!
      .from('coaches')
      .update({ is_deleted: true })
      .eq('id', coachId);
    if (error) console.error('Supabase soft deleteCoach error:', error);
  }

  async fetchDailyThoughts(schoolId: string = 'bhs'): Promise<Partial<DailyThoughtRow>[] | null> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('daily_thoughts')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });
    if (error) { console.error('Supabase fetchDailyThoughts error:', error); return null; }
    return data;
  }

  async fetchLatestDailyThoughts(schoolId: string = 'bhs'): Promise<Partial<DailyThoughtRow> | null> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('daily_thoughts')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) { console.error('Supabase fetchLatestDailyThoughts error:', error); return null; }
    return data && data.length > 0 ? data[0] : null;
  }

  async upsertDailyThought(schoolId: string = 'bhs', thought: any = {}): Promise<any> {
    if (!this.isConfigured()) return { error: 'Supabase client is not configured' };

    const payload: Record<string, any> = {
      school_id: schoolId,
      coach_id: thought.coachId || 'c1',
      coach_name: thought.coachName || '',
      thoughts_text: thought.text || '',
      is_active: thought.isActive !== false,
      is_deleted: thought.is_deleted || thought.isDeleted || false
    };

    const isClientTempId = !thought.id || thought.id.startsWith('dt_') || thought.id.startsWith('temp_');

    if (thought.id && !isClientTempId) {
      const { data: updData, error: updErr } = await this.client!
        .from('daily_thoughts')
        .update(payload)
        .eq('id', thought.id)
        .select();

      if (!updErr && updData && updData.length > 0) {
        console.log('⚡ Updated existing daily_thought in Supabase:', updData[0].id);
        return { data: updData[0] };
      } else if (updErr) {
        console.warn('Supabase updateDailyThought notice:', updErr.message);
      }
    }

    const { data: insData, error: insErr } = await this.client!
      .from('daily_thoughts')
      .insert([payload])
      .select();

    if (insErr) {
      console.error('Supabase insertDailyThought error:', insErr.message || insErr);
      return { error: insErr.message };
    }

    if (insData && insData.length > 0) {
      console.log('⚡ Inserted new daily_thought in Supabase:', insData[0].id);
      return { data: insData[0] };
    }
    return { error: 'No data returned from Supabase insert' };
  }

  async deleteDailyThought(thoughtId: string): Promise<any> {
    if (!this.isConfigured()) return null;
    const { error } = await this.client!
      .from('daily_thoughts')
      .update({ is_deleted: true })
      .eq('id', thoughtId);
    if (error) console.error('Supabase soft deleteDailyThought error:', error);
  }

  async setActiveDailyThought(schoolId: string = 'bhs', activeId?: string): Promise<any> {
    if (!this.isConfigured() || !activeId) return null;
    const { error: err1 } = await this.client!
      .from('daily_thoughts')
      .update({ is_active: false })
      .eq('school_id', schoolId);
    if (err1) console.error('Supabase setActiveDailyThought reset error:', err1);

    const { error: err2 } = await this.client!
      .from('daily_thoughts')
      .update({ is_active: true })
      .eq('id', activeId);
    if (err2) console.error('Supabase setActiveDailyThought set error:', err2);
  }

  async saveQuizAttempt(playerData: any = {}, answers: any[] = [], score: number = 0, totalQuestions: number = 5): Promise<any> {
    if (!this.isConfigured()) return null;

    // An attempt names a person, so refuse to invent one. This previously fell
    // back to a demo player, which wrote attempts to the database attributed to
    // somebody who does not exist. The UI guards this too; this is the layer
    // that actually touches the table, so it guards independently.
    if (!playerData?.id || !playerData?.name) {
      console.warn('saveQuizAttempt refused: no signed-in player to attribute the attempt to.');
      return null;
    }

    const percentage = Math.round((score / (totalQuestions || 1)) * 100);
    const attemptPayload: Record<string, any> = {
      player_id: playerData.id,
      player_name: playerData.name,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      score: score,
      total_questions: totalQuestions,
      percentage: percentage
    };

    // 1. Insert row into quiz_attempts
    const { data: attemptData, error: attemptErr } = await this.client!
      .from('quiz_attempts')
      .insert([attemptPayload])
      .select();

    if (attemptErr) {
      console.warn('Supabase saveQuizAttempt notice:', attemptErr.message);
      return null;
    }

    const attemptId = attemptData && attemptData[0] ? attemptData[0].attempt_id : null;

    // 2. Insert rows into player_answers if attemptId exists
    if (attemptId && answers.length > 0) {
      const answerRows = answers.map(a => ({
        attempt_id: attemptId,
        question_id: a.questionId,
        selected_option: a.selectedOption,
        is_correct: !!a.isCorrect
      }));

      const { error: ansErr } = await this.client!
        .from('player_answers')
        .insert(answerRows);

      if (ansErr) console.warn('Supabase player_answers save notice:', ansErr.message);
    }

    return attemptData ? attemptData[0] : null;
  }

  async fetchRoles(): Promise<Array<{ name: string; permissions: Record<string, boolean> }> | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client!.from('roles').select('name,permissions');
      if (error) {
        console.warn('Supabase fetchRoles notice:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.warn('Supabase fetchRoles exception:', e);
      return null;
    }
  }

  async fetchMatrixStandings(schoolId: string = 'bhs'): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const uuid = await this.getSchoolUuid(schoolId);
      if (!uuid) return null;
      const { data, error } = await this.client!
        .from('matrix_standings')
        .select('*')
        .eq('school_id', uuid);
      if (error) { console.warn('Supabase fetchMatrixStandings notice:', error.message); return null; }
      return data;
    } catch (e) {
      console.warn('Supabase fetchMatrixStandings exception:', e);
      return null;
    }
  }

  async fetchMatrixLogs(schoolId: string = 'bhs'): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const uuid = await this.getSchoolUuid(schoolId);
      if (!uuid) return null;
      const { data, error } = await this.client!
        .from('matrix_logs')
        .select('*')
        .eq('school_id', uuid)
        .eq('is_deleted', false)
        .order('occurred_on', { ascending: false });
      if (error) { console.warn('Supabase fetchMatrixLogs notice:', error.message); return null; }
      return data;
    } catch (e) {
      console.warn('Supabase fetchMatrixLogs exception:', e);
      return null;
    }
  }

  async logMatrixResult(schoolId: string, result: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    try {
      const uuid = await this.getSchoolUuid(schoolId);
      if (!uuid) return { ok: false, error: 'Could not resolve the school.' };

      const payload: Record<string, any> = {
        school_id: uuid,
        player_a_id: result.playerAId,
        player_b_id: result.playerBId,
        outcome: result.outcome,
        score_text: result.scoreText || null,
        occurred_on: result.occurredOn || new Date().toISOString().slice(0, 10),
      };
      if (result.drillId && this.isUuid(result.drillId)) payload.drill_id = result.drillId;

      const { data, error } = await this.client!.from('matrix_logs').insert([payload]).select();
      if (error) {
        console.warn('Supabase logMatrixResult notice:', error.message);
        return { ok: false, error: error.message };
      }
      // An RLS denial returns no error and no rows. Report it rather than
      // letting the caller show a success message for a write that vanished.
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that write. Coach or admin access is required.' };
      }
      return { ok: true };
    } catch (e: any) {
      console.warn('Supabase logMatrixResult exception:', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }

  /**
   * Correct an already-logged result.
   *
   * school_id is deliberately NOT in the payload: a result cannot change which
   * school it belongs to, and omitting it means an edit cannot silently move a
   * row out of the school whose standings it feeds.
   *
   * drill_id IS always written, unlike on insert, so that clearing the drill
   * ("— none —") actually clears it rather than leaving the old value behind.
   */
  async updateMatrixResult(id: string, result: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!id || !this.isUuid(id)) return { ok: false, error: 'That result has no database id, so it cannot be edited.' };
    try {
      const payload: Record<string, any> = {
        player_a_id: result.playerAId,
        player_b_id: result.playerBId,
        outcome: result.outcome,
        score_text: result.scoreText || null,
        occurred_on: result.occurredOn || new Date().toISOString().slice(0, 10),
        drill_id: (result.drillId && this.isUuid(result.drillId)) ? result.drillId : null,
      };

      const { data, error } = await this.client!
        .from('matrix_logs').update(payload).eq('id', id).select();
      if (error) {
        console.warn('Supabase updateMatrixResult notice:', error.message);
        return { ok: false, error: error.message };
      }
      // Same reasoning as logMatrixResult: an RLS denial on UPDATE returns no
      // error and no rows, so zero rows is a refusal, not a no-op success.
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that change. Coach or admin access is required.' };
      }
      return { ok: true };
    } catch (e: any) {
      console.warn('Supabase updateMatrixResult exception:', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }

  /**
   * Soft-delete a result, following the repo-wide is_deleted convention. The
   * matrix_standings view filters on it, so the points and ranks it fed
   * re-derive on the next read with no further work.
   */
  async deleteMatrixResult(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!id || !this.isUuid(id)) return { ok: false, error: 'That result has no database id, so it cannot be deleted.' };
    try {
      const { data, error } = await this.client!
        .from('matrix_logs').update({ is_deleted: true }).eq('id', id).select();
      if (error) {
        console.warn('Supabase deleteMatrixResult notice:', error.message);
        return { ok: false, error: error.message };
      }
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that delete. Coach or admin access is required.' };
      }
      return { ok: true };
    } catch (e: any) {
      console.warn('Supabase deleteMatrixResult exception:', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async fetchQuizResults(): Promise<any> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('quiz_results')
      .select('*')
      .limit(20);

    if (error) {
      const { data: attData } = await this.client!
        .from('quiz_attempts')
        .select('*')
        .order('completed_at', { ascending: false })
        .limit(20);
      return attData;
    }
    return data;
  }
}

// Loose row shapes for a handful of return types, matching the loose typing
// style already used in src/globals.d.ts (raw snake_case Supabase rows).
type SoccerCategoryRow = Record<string, any>;
type SchoolRow = Record<string, any>;
type CoachRow = Record<string, any>;
type DailyThoughtRow = Record<string, any>;

export const supabaseService = new SupabaseService();
