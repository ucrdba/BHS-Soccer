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
      supabaseClient = createClient(url, key, {
        auth: {
          // The signup email carries a LINK, not a code — the template that
          // would send a 6-digit token cannot be changed on this project's
          // plan. So the client has to pick the session up out of the URL it
          // is returned to, which is what detectSessionInUrl does.
          detectSessionInUrl: true,
          // Implicit rather than PKCE, deliberately. PKCE stores a verifier in
          // the browser that started the signup, so a player who registers on
          // a laptop and opens the email on their phone can never complete it
          // — the phone has no verifier. Implicit returns tokens in the URL
          // fragment and works on whichever device opens the link.
          flowType: 'implicit',
          persistSession: true,
          autoRefreshToken: true
        }
      });
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

  /**
   * Where an emailed auth link should return the player.
   *
   * The current origin, so a link opened from a signup on localhost returns to
   * localhost and one from production returns to production. Every origin used
   * must also be in Supabase's redirect allow-list, or GoTrue silently
   * substitutes the Site URL and the player lands on the wrong site.
   */
  authRedirectUrl(): string {
    try {
      return `${window.location.origin}/`;
    } catch {
      return '';
    }
  }

  /**
   * Finish an emailed confirmation link.
   *
   * Returns what actually happened so the caller can say it out loud:
   *   'confirmed'  — session established, they are signed in and pending
   *   'verified'   — the link was valid but no session could be made here,
   *                  which is the cross-device case: signed up on a laptop,
   *                  opened the email on a phone. The account IS confirmed.
   *   'error'      — the link was expired or already used
   *   'none'       — an ordinary page load, no auth parameters present
   */
  async completeEmailLink(): Promise<{ outcome: string; message?: string }> {
    if (!this.isConfigured()) return { outcome: 'none' };

    let hash = '', search = '';
    try {
      hash = window.location.hash || '';
      search = window.location.search || '';
    } catch { return { outcome: 'none' }; }

    const hasTokens = hash.includes('access_token=');
    const hasError = hash.includes('error=') || search.includes('error=');
    const hasCode = /[?&]code=/.test(search);
    if (!hasTokens && !hasError && !hasCode) return { outcome: 'none' };

    // Strip the parameters either way: leaving tokens in the address bar means
    // they survive a copied link, a screenshot, or the browser history.
    const clean = () => {
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch { /* history blocked; the tokens are cosmetic at this point */ }
    };

    if (hasError) {
      const params = new URLSearchParams((hash || search).replace(/^[#?]/, ''));
      const desc = params.get('error_description') || 'That link is no longer valid.';
      clean();
      return { outcome: 'error', message: desc.replace(/\+/g, ' ') };
    }

    // detectSessionInUrl has already run by now; ask what it produced rather
    // than parsing the fragment ourselves.
    try {
      const { data } = await this.client!.auth.getSession();
      clean();
      if (data?.session) return { outcome: 'confirmed' };
      return { outcome: 'verified' };
    } catch {
      clean();
      return { outcome: 'verified' };
    }
  }

  async signUpUser(email: string, password: string, metadata: Record<string, any> = {}): Promise<any> {
    if (!this.isConfigured()) return null;
    try {
      // Without emailRedirectTo the link falls back to whatever Site URL is
      // configured, which is invisible from here and easy to leave pointing at
      // localhost. Sending the current origin makes the round trip land back
      // where the player actually signed up.
      const { data, error } = await this.client!.auth.signUp({
        email, password,
        options: { data: metadata, emailRedirectTo: this.authRedirectUrl() }
      });
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

  async runFullDatabaseDiagnostic(teamId?: string): Promise<any> {
    if (!this.isConfigured()) {
      return {
        success: false,
        summaryText: '❌ Supabase Database Client is NOT connected.\n\nReason: Missing or invalid Supabase Anon Key.\n\nFix: Open Admin Center -> Enter your Supabase Anon Key (starts with "eyJ...") and click "Save Credentials".',
        tableResults: []
      };
    }

    const schoolUuid = await this.getSchoolUuid('bhs');
    // practice_plans and daily_thoughts dropped school_id in migration 0015
    // and are now written under team-scoped RLS (is_team_coach(team_id)), so
    // their diagnostic rows need a real team, not the legacy school lookup.
    const hasValidTeam = !!teamId && this.isUuid(teamId);
    const tableResults: any[] = [];

    // Helper runner for individual table testing
    const testTable = async (tableName: string, icon: string, operation: string, testPayload: Record<string, any> | null, selectCols: string = '*', skippedReason?: string) => {
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
        res.responseDetails = skippedReason || 'Read-only log table query test';
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

    // 6. practice_plans -- team-scoped since 0014/0015; skip the write (not a
    // FAILED) when no valid team is selected, since is_team_coach(null) only
    // passes for an admin and would falsely report a plain coach's DB as broken.
    const planPayload: Record<string, any> | null = hasValidTeam
      ? { time_slot: '0:00 - 0:15', name: 'Diagnostic Plan Item', duration: '15 min', coach_notes: 'Automated test item', team_id: teamId }
      : null;
    tableResults.push(await testTable(
      'practice_plans', '📋', 'INSERT', planPayload, '*',
      hasValidTeam ? undefined : 'Skipped: practice_plans is team-scoped. Select an active team in Admin Center to test this table.'
    ));

    // 7. coaches
    const coachPayload: Record<string, any> = { name: 'Diagnostic Coach', level: 'Staff Coach', email: `coach_diag_${Date.now().toString().slice(-4)}@bhs.org` };
    if (schoolUuid) coachPayload.school_id = schoolUuid;
    tableResults.push(await testTable('coaches', '👔', 'INSERT', coachPayload));

    // 8. daily_thoughts -- team-scoped since 0014/0015, same reasoning as
    // practice_plans above.
    const thoughtPayload: Record<string, any> | null = hasValidTeam
      ? { coach_name: 'Diagnostic Coach', thoughts_text: 'Diagnostic automated test thought', is_active: false, team_id: teamId }
      : null;
    tableResults.push(await testTable(
      'daily_thoughts', '💡', 'INSERT', thoughtPayload, '*',
      hasValidTeam ? undefined : 'Skipped: daily_thoughts is team-scoped. Select an active team in Admin Center to test this table.'
    ));

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

  /** Teams the current viewer may switch between: their own if signed in, else the public default. */
  async fetchTeamsForViewer(): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data: session } = await this.client!.auth.getSession();
      const uid = session?.session?.user?.id;

      let ids: string[] | null = null;
      if (uid) {
        // team_coaches.profile_id IS the auth uid, but team_players.player_id
        // references players(id) — a different table. The link between a signed-in
        // person and their player row is profiles.player_id, so it has to be
        // resolved first. Comparing uid to player_id directly never matches, and
        // the failure is silent: the player just sees the public default team.
        const { data: prof } = await this.client!
          .from('profiles').select('player_id').eq('id', uid).maybeSingle();
        const playerId = prof?.player_id || null;

        const [{ data: coached }, { data: played }] = await Promise.all([
          this.client!.from('team_coaches').select('team_id').eq('profile_id', uid),
          playerId
            ? this.client!.from('team_players').select('team_id').eq('player_id', playerId)
            : Promise.resolve({ data: [] as any[] })
        ]);
        const merged = [...(coached || []), ...(played || [])].map((r: any) => r.team_id);
        if (merged.length > 0) ids = Array.from(new Set(merged));
      }

      let q = this.client!
        .from('teams')
        .select('id, school_id, name, season, is_public_default, schools(name, kind)')
        .eq('is_deleted', false);
      // No membership: a signed-out visitor, or someone on no team. Both see
      // the public default rather than an empty app.
      if (ids) q = q.in('id', ids); else q = q.eq('is_public_default', true);

      const { data, error } = await q;
      if (error) { console.warn('Supabase fetchTeamsForViewer notice:', error.message); return null; }
      return (data || []).map((t: any) => ({
        id: t.id, school_id: t.school_id, name: t.name, season: t.season,
        is_public_default: t.is_public_default,
        school_name: t.schools?.name || '', school_kind: t.schools?.kind || 'school'
      })).sort((a, b) => (a.school_name + a.name).localeCompare(b.school_name + b.name));
    } catch (e) {
      console.warn('Supabase fetchTeamsForViewer exception:', e);
      return null;
    }
  }

  /** The team a signed-out visitor (or anyone with no team of their own) sees. */
  async fetchPublicDefaultTeamId(schoolId?: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    try {
      // Uniqueness is per organization, not global: teams_one_public_default_per_school
      // is a partial unique index on (school_id). Without a school filter this can
      // legitimately match several rows, so take the first rather than demanding one.
      let q = this.client!.from('teams').select('id').eq('is_public_default', true).eq('is_deleted', false);
      if (schoolId) q = q.eq('school_id', schoolId);
      const { data, error } = await q.limit(1);
      if (error) { console.warn('Supabase fetchPublicDefaultTeamId notice:', error.message); return null; }
      return data && data[0] ? data[0].id : null;
    } catch (e) {
      console.warn('Supabase fetchPublicDefaultTeamId exception:', e);
      return null;
    }
  }

  async fetchTeamRoster(teamId: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured() || !teamId) return null;
    const { data, error } = await this.client!
      .from('team_players')
      .select('id, team_id, school_id, number, position, season_stats, ratings, is_deleted, players(id, name, first_name, last_name, class_year, height, photo_url)')
      .eq('team_id', teamId)
      .eq('is_deleted', false);
    if (error) { console.warn('Supabase fetchTeamRoster notice:', error.message); return null; }
    return data;
  }

  /** Name search for the add-player flow, so a second team reuses an existing person. */
  /**
   * Every player identity, for the importer's name matching.
   *
   * The import has to reuse an existing person rather than create a second one,
   * and it cannot match against this.data.players because that holds only the
   * ACTIVE team's roster — a sheet putting someone on JV would not find their
   * Varsity identity and would mint a duplicate human.
   */
  async fetchAllPlayerIdentities(): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('players').select('id, name').eq('is_deleted', false);
    if (error) { console.warn('Supabase fetchAllPlayerIdentities notice:', error.message); return null; }
    return data;
  }

  /**
   * Creates a team. teams_write is admin-only, so this returns null for a
   * non-admin rather than throwing — the importer reports those rows as skipped
   * instead of failing the whole sheet.
   */
  /**
   * Every team in every organization, for the admin management panel.
   *
   * Distinct from fetchTeamsForViewer, which returns only the teams the signed-in
   * person belongs to — an admin managing assignments has to see teams they do
   * not coach, including ones with no coach at all.
   */
  async fetchAllTeams(): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('teams')
      .select('id, school_id, name, season, is_public_default, schools(name, kind)')
      .eq('is_deleted', false);
    if (error) { console.warn('Supabase fetchAllTeams notice:', error.message); return null; }
    return (data || []).map((t: any) => ({
      id: t.id, school_id: t.school_id, name: t.name, season: t.season,
      is_public_default: t.is_public_default,
      school_name: t.schools?.name || '', school_kind: t.schools?.kind || 'school'
    })).sort((a, b) => (a.school_name + a.name).localeCompare(b.school_name + b.name));
  }

  /** Who coaches what, with names, for the management panel. */
  async fetchTeamCoaches(): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('team_coaches').select('team_id, profile_id, profiles(name, email, role, status)');
    if (error) { console.warn('Supabase fetchTeamCoaches notice:', error.message); return null; }
    return (data || []).map((r: any) => ({
      team_id: r.team_id, profile_id: r.profile_id,
      name: r.profiles?.name || '(unknown)', email: r.profiles?.email || '',
      role: r.profiles?.role || '', status: r.profiles?.status || ''
    }));
  }

  /**
   * Profiles eligible to coach a team. Active coaches and admins only — a
   * pending or rejected profile must not be assignable, or the assignment would
   * grant access the status was meant to withhold.
   */
  async fetchAssignableCoaches(): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('profiles').select('id, name, email, role')
      .in('role', ['coach', 'admin']).eq('status', 'active')
      .order('name', { ascending: true });
    if (error) { console.warn('Supabase fetchAssignableCoaches notice:', error.message); return null; }
    return data;
  }

  /** Grants a coach write access to one team. Admin-only by RLS. */
  async assignCoachToTeam(teamId: string, profileId: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!teamId || !profileId) return { ok: false, error: 'Pick a team and a coach.' };
    try {
      const { data, error } = await this.client!
        .from('team_coaches').upsert([{ team_id: teamId, profile_id: profileId }], { onConflict: 'team_id,profile_id' }).select();
      if (error) {
        console.warn('Supabase assignCoachToTeam notice:', error.message);
        return { ok: false, error: error.message };
      }
      // An RLS denial returns no error and no rows; team_coaches_write is
      // admin-only, so this is the expected refusal for a coach-level user.
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that change. Only an admin can assign coaches.' };
      }
      return { ok: true };
    } catch (e: any) {
      console.warn('Supabase assignCoachToTeam exception:', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }

  /**
   * Revokes a coach's access to one team. A hard delete, not a soft one:
   * team_coaches carries no is_deleted column, and a surviving row is exactly
   * what is_team_coach() reads.
   */
  async removeCoachFromTeam(teamId: string, profileId: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!teamId || !profileId) return { ok: false, error: 'No team or coach given.' };
    try {
      const { data, error } = await this.client!
        .from('team_coaches').delete().eq('team_id', teamId).eq('profile_id', profileId).select();
      if (error) {
        console.warn('Supabase removeCoachFromTeam notice:', error.message);
        return { ok: false, error: error.message };
      }
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that change. Only an admin can remove coaches.' };
      }
      return { ok: true };
    } catch (e: any) {
      console.warn('Supabase removeCoachFromTeam exception:', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async createTeam(schoolId: string, name: string, season?: string): Promise<{ id?: string } | null> {
    if (!this.isConfigured() || !schoolId || !name) return null;
    const payload: Record<string, any> = { school_id: schoolId, name, is_deleted: false };
    if (season) payload.season = season;
    const { data, error } = await this.client!
      .from('teams').insert([payload]).select();
    if (error) { console.warn('Supabase createTeam notice:', error.message); return null; }
    return data && data[0] ? data[0] : null;
  }

  async searchPlayersByName(query: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const { data, error } = await this.client!
      .from('players').select('id, name, class_year, photo_url')
      .eq('is_deleted', false)
      .ilike('name', `%${q}%`).limit(10);
    if (error) { console.warn('Supabase searchPlayersByName notice:', error.message); return null; }
    return data;
  }

  async fetchSchedule(teamId: string): Promise<Record<string, any>[] | null> {
    // Same uuid guard as the write: a school code here returned null via a
    // 22P02 round trip, so the schedule rendered empty with the reason only
    // visible in a Postgres log.
    if (!this.isConfigured() || !teamId || !this.isUuid(teamId)) return null;
    const { data, error } = await this.client!
      .from('schedule')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('team_id', teamId)
      // match_on is derived from match_date by a trigger (migration 0008).
      // Ordering by the text column instead would sort SEP 11 before SEP 4,
      // and created_at orders by when a fixture was entered, not when it is
      // played. Unparseable dates sort last rather than to the front.
      .order('match_on', { ascending: true, nullsFirst: false })
      .order('kickoff_time', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (error) { console.error('Supabase fetchSchedule error:', error); return null; }
    return data;
  }

  async upsertMatch(teamId: string, match: any): Promise<{ id?: string } | null> {
    if (!this.isConfigured()) return null;
    // Without a team the row is invisible to every read that follows, and the
    // caller would report success over a permanent silent loss. A WRONG team is
    // the other half: schedule.team_id is a uuid, so a school code like 'bhs'
    // fails the cast with 22P02 -- refused here rather than after a round trip,
    // which is the shape that kept daily thoughts dead for months.
    //
    // Returns null rather than {ok, error} like the newer methods, deliberately:
    // admin.js does `return !!(await upsertMatch(...))` and `if (res)`, so an
    // object would make every refusal count as a success. The callers already
    // treat a falsy return as failure and tell the coach the fixture was not
    // saved.
    if (!teamId || !this.isUuid(teamId)) {
      console.warn('upsertMatch: no valid team; refusing to write an unscoped fixture. Got:', teamId);
      return null;
    }
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
    payload.team_id = teamId;
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

  async fetchPracticePlans(teamId: string): Promise<Record<string, any>[] | null> {
    // team_id is a uuid column (0014_team_scoped_planner.sql); a caller
    // passing something else (e.g. a leftover school code) must be refused
    // here rather than reaching Postgres and failing the cast with 22P02 —
    // the exact bug class daily_thoughts.school_id hit for months.
    if (!this.isConfigured() || !teamId || !this.isUuid(teamId)) return null;
    const { data, error } = await this.client!
      .from('practice_plans')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });
    if (error) { console.error('Supabase fetchPracticePlans error:', error); return null; }
    return data;
  }

  /**
   * Teams the signed-in coach may write to.
   *
   * Used to build the "Copy to team…" list. is_team_coach() refuses the write
   * regardless, so offering a team the coach cannot write to would produce a
   * control that always fails -- the same trap that made unassigned coaches
   * look like a broken app.
   */
  async teamsCoachedBy(): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    const { data: session } = await this.client!.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return [];

    const { data: rows, error } = await this.client!
      .from('team_coaches')
      .select('team_id, teams(id, name, school_id, schools(name))')
      .eq('profile_id', uid);
    if (error) { console.warn('Supabase teamsCoachedBy notice:', error.message); return null; }

    return (rows || []).map((r: any) => ({
      id: r.teams?.id || r.team_id,
      name: r.teams?.name || 'Team',
      school_id: r.teams?.school_id || null,
      school_name: r.teams?.schools?.name || ''
    }));
  }

  /**
   * Copy every slot of a plan to another team, as an independent snapshot.
   *
   * A plan is the set of practice_plans rows sharing a `name`, so a copy
   * duplicates all of them. Copies carry no id: reusing one would make the
   * next save overwrite the original.
   *
   * Refused across organizations, explicitly. The design puts cross-org plan
   * sharing out of scope, but the only thing enforcing that used to be the
   * drill check below -- which refuses when a drill NAME is missing from the
   * destination library, and therefore lets a copy through whenever the names
   * happen to coincide. teamsCoachedBy() offers every team the coach coaches,
   * including in another organization, so a coach of both Beaumont and Legends
   * could slip a plan across on a name collision. The school_id comparison
   * makes the refusal the rule rather than an accident of naming.
   *
   * The drill check stays for the same-organization case: practice_plans.drill
   * is a drill NAME and the library is scoped per organization, so naming the
   * drills that are missing is the whole value of that message. (In practice a
   * same-org destination shares the library, so it should rarely fire -- but a
   * soft-deleted or renamed drill still would.)
   *
   * copyDailyThought is deliberately NOT gated this way: a thought references
   * no drills and copies across organizations fine.
   *
   * Copies deliberately omit `school_id`: migration 0015 drops that column
   * from practice_plans (Task 6), and `team_id` alone already determines the
   * organization. `destTeam.school_id` is still needed here -- just for the
   * cross-organization drill check, not for the insert payload.
   */
  async copyPracticePlan(
    planName: string, fromTeamId: string, toTeamId: string
  ): Promise<{ ok: boolean; error?: string; slots?: number }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!planName || !fromTeamId || !toTeamId) return { ok: false, error: 'Pick a plan and a destination team.' };
    if (fromTeamId === toTeamId) {
      return { ok: false, error: 'That plan is already on this team.' };
    }

    const { data: slots } = await this.client!
      .from('practice_plans')
      .select('*')
      .eq('team_id', fromTeamId)
      .eq('name', planName);
    if (!slots || slots.length === 0) return { ok: false, error: `No plan named "${planName}" on that team.` };

    // Both teams in one read, because the source's organization is now part of
    // the decision and not just the destination's.
    const { data: teamRows } = await this.client!
      .from('teams').select('id, school_id').in('id', [fromTeamId, toTeamId]);
    const destTeam = (teamRows || []).find((t: any) => t.id === toTeamId);
    const srcTeam = (teamRows || []).find((t: any) => t.id === fromTeamId);
    if (!destTeam) return { ok: false, error: 'That team no longer exists.' };
    if (!srcTeam) return { ok: false, error: 'The team this plan came from no longer exists.' };

    // Out of scope by design, and now refused outright rather than incidentally
    // by the drill check below -- see the doc comment.
    if (srcTeam.school_id !== destTeam.school_id) {
      return {
        ok: false,
        error: 'Those teams belong to different organizations, and a practice plan cannot be copied ' +
               'between organizations. Drills belong to one organization\'s library, so the copied ' +
               'slots would name drills that team cannot see.'
      };
    }

    const { data: destDrills } = await this.client!
      .from('drills_bank').select('name').eq('school_id', destTeam.school_id);
    const available = new Set((destDrills || []).map((d: any) => d.name));
    const missing = Array.from(new Set(
      slots.map((s: any) => s.drill).filter((n: any) => n && !available.has(n))
    ));
    if (missing.length) {
      return {
        ok: false,
        error: `That team's drill library does not have: ${missing.join(', ')}. ` +
               `Drills belong to one organization, so this plan cannot be copied there.`
      };
    }

    const copies = slots.map((s: any) => ({
      team_id: toTeamId,
      name: s.name,
      time_slot: s.time_slot,
      duration: s.duration,
      drill: s.drill,
      coach_notes: s.coach_notes,
      diagram_image: s.diagram_image,
      diagram_data: s.diagram_data,
      is_deleted: false
    }));

    const { data, error } = await this.client!.from('practice_plans').insert(copies).select();
    if (error) { console.warn('Supabase copyPracticePlan notice:', error.message); return { ok: false, error: error.message }; }
    if (!data || data.length === 0) {
      return { ok: false, error: 'The database refused that. Only a coach of the destination team can copy to it.' };
    }
    return { ok: true, slots: data.length };
  }

  /**
   * Copy one daily thought to another team.
   *
   * Never active on arrival: the source is active for ITS team, and making the
   * copy active would silently replace whatever message the destination team
   * is currently showing.
   */
  async copyDailyThought(thoughtId: string, toTeamId: string): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!thoughtId || !toTeamId) return { ok: false, error: 'Pick a message and a destination team.' };

    const { data: src } = await this.client!
      .from('daily_thoughts').select('*').eq('id', thoughtId).maybeSingle();
    if (!src) return { ok: false, error: 'That message no longer exists.' };
    if (src.team_id === toTeamId) return { ok: false, error: 'That message is already on this team.' };

    const { data, error } = await this.client!.from('daily_thoughts').insert([{
      team_id: toTeamId,
      coach_id: src.coach_id,
      coach_name: src.coach_name,
      thoughts_text: src.thoughts_text,
      is_active: false,
      is_deleted: false
    }]).select();
    if (error) { console.warn('Supabase copyDailyThought notice:', error.message); return { ok: false, error: error.message }; }
    if (!data || data.length === 0) {
      return { ok: false, error: 'The database refused that. Only a coach of the destination team can copy to it.' };
    }
    return { ok: true, id: data[0].id };
  }

  /**
   * Save a full practice plan (a set of drills sharing one `name`).
   *
   * Accepts either calling convention: `(teamId, planName, drillsArray)` or
   * `(teamId, { name, items })`. team_id is a uuid column
   * (0014_team_scoped_planner.sql); a caller passing something else (e.g. a
   * leftover school code) must be refused here rather than reaching Postgres
   * and failing the cast with 22P02 -- the exact bug class daily_thoughts hit
   * for months. school_id is not written: it is dropped from practice_plans
   * by migration 0015, and team_id alone already determines the organization.
   */
  /**
   * Rename a saved practice plan.
   *
   * A plan is NOT a row: practice_plans holds one row per drill slot, and a
   * plan is the set of rows sharing a name. So this updates every slot, and a
   * rename onto a name this team already uses is REFUSED -- Postgres would
   * accept it happily, and the coach would be left with one session holding
   * both plans' slots at overlapping times, with nothing having errored. That
   * exact fusion had to be avoided by hand when repairing a mangled plan name
   * in the live database.
   *
   * Team-scoped, so Varsity and JV may each keep their own "Monday Session".
   */
  async renamePracticePlan(
    teamId: string, oldName: string, newName: string
  ): Promise<{ ok: boolean; error?: string; slots?: number }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    // team_id is a uuid column; a leftover school code must be refused here
    // rather than reaching Postgres and failing the cast with 22P02.
    if (!teamId || !this.isUuid(teamId)) return { ok: false, error: 'No team selected.' };

    const to = (newName || '').trim();
    if (!oldName || !to) return { ok: false, error: 'A plan and a new name are needed.' };
    if (to === oldName) return { ok: false, error: 'That is already the name.' };

    const { data: clash } = await this.client!
      .from('practice_plans')
      .select('id')
      .eq('team_id', teamId)
      .eq('name', to)
      .or('is_deleted.is.null,is_deleted.eq.false');
    if (clash && clash.length > 0) {
      return {
        ok: false,
        error: `This team already has a plan called "${to}". Two plans sharing a name become one session, so pick a different name.`
      };
    }

    const { data, error } = await this.client!
      .from('practice_plans')
      .update({ name: to })
      .eq('team_id', teamId)
      .eq('name', oldName)
      .select();
    if (error) { console.warn('Supabase renamePracticePlan notice:', error.message); return { ok: false, error: error.message }; }
    if (!data || data.length === 0) {
      return { ok: false, error: `No plan called "${oldName}" on this team, or the database refused the change.` };
    }
    return { ok: true, slots: data.length };
  }

  async saveFullPracticePlan(teamId: string, planNameOrObj?: any, drillsArr?: any[]): Promise<any> {
    if (!this.isConfigured()) return { success: false, error: 'Supabase Cloud DB is not configured.' };
    if (!teamId || !this.isUuid(teamId)) {
      return { success: false, error: 'No team selected; refusing to save an unscoped practice plan.' };
    }

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

    const rows = drills.map(d => {
      const item: Record<string, any> = {
        team_id: teamId,
        name: planName || 'Standard Practice Plan',
        drill: d.name || d.drill || 'Soccer Drill',
        time_slot: d.time || '',
        duration: d.duration || '',
        coach_notes: d.coachNotes || '',
        diagram_image: d.diagramImage || null,
        diagram_data: d.diagramData || null
      };
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

  async savePracticePlanItem(teamId: string, planItem: any): Promise<any> {
    if (!this.isConfigured()) return null;
    // Same team_id guard as saveFullPracticePlan -- refuse a leftover school
    // code here rather than letting it reach Postgres and fail the uuid cast.
    if (!teamId || !this.isUuid(teamId)) {
      console.warn('Supabase savePracticePlanItem notice: no team selected; refusing to save an unscoped practice plan item.');
      return null;
    }
    const payload: Record<string, any> = {
      team_id: teamId,
      name: planItem.planName || (window as any).app?.data?.activePlanName || 'Standard Practice Plan',
      drill: planItem.name || planItem.drill || 'Soccer Drill',
      time_slot: planItem.time || '',
      duration: planItem.duration || '',
      coach_notes: planItem.coachNotes || '',
      diagram_image: planItem.diagramImage || null,
      diagram_data: planItem.diagramData || null
    };
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

  async upsertPracticePlanItem(teamId: string, planItem: any): Promise<any> {
    return this.savePracticePlanItem(teamId, planItem);
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

  /**
   * Insert or update one quiz question.
   *
   * quiz_questions has no school_id -- the bank is shared -- so unlike
   * upsertSoccerCategory there is no organization to resolve. correct_option
   * carries a CHECK constraint for A/B/C/D, so anything else is rejected here
   * with a sentence rather than surfacing as a raw constraint violation.
   */
  async upsertQuizQuestion(q: any = {}): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };

    const text = String(q.question || '').trim();
    if (!text) return { ok: false, error: 'The question text is empty.' };

    const options = ['a', 'b', 'c', 'd'].map(k => String(q['option_' + k] || '').trim());
    if (options.some(o => !o)) {
      return { ok: false, error: 'All four options are required.' };
    }

    const correct = String(q.correct_option || '').trim().toUpperCase().charAt(0);
    if (!['A', 'B', 'C', 'D'].includes(correct)) {
      return { ok: false, error: `Correct answer must be A, B, C or D (found "${q.correct_option ?? ''}").` };
    }

    const payload: Record<string, any> = {
      question: text,
      option_a: options[0], option_b: options[1], option_c: options[2], option_d: options[3],
      correct_option: correct,
      explanation: String(q.explanation || '').trim() || null,
      category: String(q.category || '').trim() || 'Tactical',
      is_deleted: q.is_deleted === true || String(q.is_deleted || '').toLowerCase() === 'true'
    };
    // A spreadsheet's "1" in the id column is a row number, not a key. Passing
    // it would fail the uuid cast; letting the default fire is correct.
    if (q.question_id && this.isUuid(q.question_id)) payload.question_id = q.question_id;

    try {
      const { data, error } = await this.client!
        .from('quiz_questions').upsert([payload]).select();
      if (error) {
        console.warn('Supabase upsertQuizQuestion notice:', error.message);
        return { ok: false, error: error.message };
      }
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that write. Coach or admin access is required.' };
      }
      return { ok: true, id: data[0].question_id };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  private static readonly MEASURES = ['head_to_head', 'win_loss', 'count_high', 'time_low'];

  async fetchDrillsForWeighting(schoolId: string = 'bhs'): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    if (!schoolUuid) return null;
    const { data, error } = await this.client!
      .from('drills_bank')
      .select('id, name, category, points, measure')
      .eq('school_id', schoolUuid)
      .eq('is_deleted', false)
      .order('name', { ascending: true });
    if (error) { console.warn('Supabase fetchDrillsForWeighting notice:', error.message); return null; }
    return data;
  }

  /**
   * Save a batch of drill weights. Validated here rather than relying on the
   * CHECK constraint so a bad row is named in words instead of surfacing as a
   * raw constraint violation half way through the batch.
   */
  async updateDrillWeights(
    rows: { id: string; points: number; measure: string }[]
  ): Promise<{ ok: boolean; error?: string; updated: number }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.', updated: 0 };
    const list = rows || [];
    if (list.length === 0) return { ok: true, updated: 0 };

    for (const r of list) {
      const n = Number(r.points);
      if (!Number.isFinite(n) || n < 0 || n > 10) {
        return { ok: false, error: `Weight for drill ${r.id} must be between 0 and 10.`, updated: 0 };
      }
      if (!SupabaseService.MEASURES.includes(r.measure)) {
        return { ok: false, error: `"${r.measure}" is not a measurement type.`, updated: 0 };
      }
    }

    let updated = 0;
    for (const r of list) {
      const { data, error } = await this.client!
        .from('drills_bank')
        .update({ points: Number(r.points), measure: r.measure })
        .eq('id', r.id)
        .select();
      if (error) { console.warn('Supabase updateDrillWeights notice:', error.message); return { ok: false, error: error.message, updated }; }
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that write. Coach or admin access is required.', updated };
      }
      updated++;
    }
    return { ok: true, updated };
  }

  async fetchMatrixSessions(teamId: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured() || !teamId) return null;
    const { data, error } = await this.client!
      .from('matrix_sessions')
      .select('id, drill_id, occurred_on, notes, drills_bank(name, points, measure)')
      .eq('team_id', teamId)
      .eq('is_deleted', false)
      .order('occurred_on', { ascending: false });
    if (error) { console.warn('Supabase fetchMatrixSessions notice:', error.message); return null; }
    return data;
  }

  /**
   * Write one session and every result in it.
   *
   * A present player must supply a result: storing a present row with neither a
   * value nor an outcome does NOT score them as a failure — matrix_standings'
   * `ranked` and `win_loss` CTEs filter on `raw_value is not null` /
   * `outcome is not null`, so that row is dropped from `parts` entirely and
   * the player is scored as though excused. The guard below still refuses
   * the save, because a coach who marks someone "here" with no result meant
   * to record something, not to quietly excuse them.
   */
  async saveMatrixSession(
    teamId: string,
    session: { id?: string; drillId: string; occurredOn: string; notes?: string },
    results: { playerId: string; attendance: string; rawValue?: number | null; outcome?: string | null }[]
  ): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!teamId) return { ok: false, error: 'No team selected.' };
    if (!session?.drillId) return { ok: false, error: 'Pick the exercise this session was.' };
    if (!session?.occurredOn) return { ok: false, error: 'Pick the date this session happened.' };

    for (const r of results || []) {
      if (r.attendance !== 'present') continue;
      const hasValue = r.rawValue !== null && r.rawValue !== undefined && Number.isFinite(Number(r.rawValue));
      const hasOutcome = !!r.outcome;
      if (!hasValue && !hasOutcome) {
        return { ok: false, error: `${r.playerId} is marked present but has no result. Enter one, or mark them absent.` };
      }
    }

    // The drill decides how the session is scored, so a head_to_head drill has
    // no session shape at all. Checked here rather than trusting the picker:
    // the same day's competition must not be countable twice.
    const { data: dRows } = await this.client!
      .from('drills_bank').select('measure').eq('id', session.drillId).limit(1);
    const measure = dRows && dRows[0] ? dRows[0].measure : null;
    if (measure === 'head_to_head') {
      return { ok: false, error: 'That exercise is recorded as 1v1 pairings, not as a session. Use Record Result instead.' };
    }

    const sessionRow: Record<string, any> = {
      team_id: teamId, drill_id: session.drillId,
      occurred_on: session.occurredOn, notes: session.notes || null, is_deleted: false
    };
    if (session.id && this.isUuid(session.id)) sessionRow.id = session.id;

    const { data: sData, error: sErr } = await this.client!
      .from('matrix_sessions').upsert([sessionRow]).select();
    if (sErr) { console.warn('Supabase saveMatrixSession notice:', sErr.message); return { ok: false, error: sErr.message }; }
    if (!sData || sData.length === 0) {
      return { ok: false, error: 'The database refused that write. Only a coach of this team can record sessions.' };
    }

    const sessionId = sData[0].id;
    const rows = (results || []).map(r => ({
      session_id: sessionId,
      player_id: r.playerId,
      attendance: r.attendance,
      raw_value: r.attendance === 'present' && r.rawValue !== null && r.rawValue !== undefined
        ? Number(r.rawValue) : null,
      outcome: r.attendance === 'present' ? (r.outcome || null) : null
    }));

    if (rows.length) {
      const { data: rData, error: rErr } = await this.client!
        .from('matrix_session_results')
        .upsert(rows, { onConflict: 'session_id,player_id' })
        .select();
      if (rErr || !rData || rData.length === 0) {
        // Roll back by hand: PostgREST gives us no transaction across two
        // round trips, and a session with no results is not inert — it still
        // joins drills_bank in matrix_standings. Leaving it would also make a
        // retry insert a second one, since the caller has no id to reuse.
        try {
          await this.client!.from('matrix_sessions')
            .update({ is_deleted: true }).eq('id', sessionId);
        } catch (cleanupErr) {
          // Nothing further to be done if the rollback itself fails; the
          // original write failure below is still reported honestly.
        }
        if (rErr) console.warn('Supabase saveMatrixSession results notice:', rErr.message);
        return {
          ok: false,
          error: rErr ? rErr.message : 'The session saved but its results were refused. Check coach access for this team.'
        };
      }
    }
    return { ok: true, id: sessionId };
  }

  /**
   * Read back one session's results, for editing it.
   *
   * Returns every stored row including absences, because the editor has to be
   * able to show a player who was marked excused or a no-show -- not only the
   * ones who posted a number.
   */
  /**
   * One player's per-exercise breakdown, straight from the view.
   *
   * Deliberately a read rather than a client calculation: matrix_standings is
   * an aggregate of this same view, so the lines shown here are guaranteed to
   * sum to the leaderboard row the panel was opened from. Re-deriving them in
   * JavaScript would put the scoring rules in two places.
   */
  async fetchPlayerBreakdown(teamId: string, playerId: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured() || !teamId || !playerId) return null;
    const { data, error } = await this.client!
      .from('matrix_exercise_points')
      .select('exercise, occurred_on, kind, detail, raw_value, attendance, weight, earned, available, opponent_id')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .order('occurred_on', { ascending: false });
    if (error) { console.warn('Supabase fetchPlayerBreakdown notice:', error.message); return null; }
    return data;
  }

  async fetchMatrixSessionResults(sessionId: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured() || !sessionId) return null;
    const { data, error } = await this.client!
      .from('matrix_session_results')
      .select('player_id, attendance, raw_value, outcome')
      .eq('session_id', sessionId);
    if (error) { console.warn('Supabase fetchMatrixSessionResults notice:', error.message); return null; }
    return data;
  }

  async deleteMatrixSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    const { data, error } = await this.client!
      .from('matrix_sessions').update({ is_deleted: true }).eq('id', sessionId).select();
    if (error) { console.warn('Supabase deleteMatrixSession notice:', error.message); return { ok: false, error: error.message }; }
    if (!data || data.length === 0) {
      return { ok: false, error: 'The database refused that. Only a coach of this team can delete a session.' };
    }
    return { ok: true };
  }

  /**
   * Insert or update one drill category.
   *
   * `soccer_categories` has NO `school_id` column -- the category list is
   * shared across every organization. The previous version of this method set
   * one anyway, so every call failed with 42703, this method logged and
   * returned null, and the XLSX category import reported success while
   * importing nothing. Verified against the live database, not against
   * supabase_schema.sql, which has drifted.
   *
   * Returns {ok, error} rather than null so an RLS refusal is reported in
   * words instead of silently doing nothing.
   */
  async upsertSoccerCategory(
    categoryObj: any = {}
  ): Promise<{ ok: boolean; error?: string; data?: any }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };

    const name = (categoryObj.name || '').trim();
    if (!name) return { ok: false, error: 'A category needs a name.' };

    const payload: Record<string, any> = {
      name,
      description: (categoryObj.description || '').trim(),
      is_deleted: categoryObj.is_deleted || false
    };
    if (categoryObj.id && this.isUuid(categoryObj.id)) payload.id = categoryObj.id;

    try {
      const { data, error } = await this.client!
        .from('soccer_categories')
        .upsert([payload], { onConflict: 'name' })
        .select();
      if (error) { console.warn('Supabase upsertSoccerCategory notice:', error.message); return { ok: false, error: error.message }; }
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that. Only a coach or admin can edit categories.' };
      }
      return { ok: true, data: data[0] };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Could not reach the database.' };
    }
  }

  /**
   * How many drills use each category NAME.
   *
   * Keyed by name rather than by id on purpose: `drills_bank.category` is free
   * text, not a foreign key, so a drill can carry a name no category row has.
   * Those are exactly the entries the editor has to surface -- on the live data
   * five of ten drills are in that state.
   */
  async fetchCategoryUsage(): Promise<Record<string, number> | null> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('drills_bank')
      .select('category')
      .or('is_deleted.is.null,is_deleted.eq.false');
    if (error) { console.warn('Supabase fetchCategoryUsage notice:', error.message); return null; }

    const counts: Record<string, number> = {};
    (data || []).forEach((d: any) => {
      const name = (d.category || '').trim();
      if (!name) return;
      counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }

  /**
   * Rewrite `drills_bank.category` from one name to another.
   *
   * The engine behind both rename and merge. Returns the number of drills
   * changed so the caller can tell the coach what it did rather than leaving
   * them to guess.
   */
  async retagDrills(
    fromName: string, toName: string
  ): Promise<{ ok: boolean; error?: string; count?: number }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!fromName || !toName) return { ok: false, error: 'Both the old and the new name are needed.' };

    const { data, error } = await this.client!
      .from('drills_bank')
      .update({ category: toName })
      .eq('category', fromName)
      .select();
    if (error) { console.warn('Supabase retagDrills notice:', error.message); return { ok: false, error: error.message }; }
    return { ok: true, count: (data || []).length };
  }

  /**
   * Rename a category, carrying every drill that uses it along.
   *
   * The drills are re-tagged FIRST. If that half fails the category row is left
   * untouched, so the two stay consistent; if the row rename fails afterwards
   * the drills show up under an undefined category, which the editor displays
   * and offers to fix. Either failure is visible and recoverable.
   *
   * Renaming onto a name another category already holds is refused -- two rows
   * with one name cannot be told apart in the drill dropdown, and the upsert
   * above conflicts on name. That operation is a merge.
   */
  async renameSoccerCategory(
    id: string, oldName: string, newName: string
  ): Promise<{ ok: boolean; error?: string; drillsUpdated?: number }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };

    const to = (newName || '').trim();
    if (!id || !oldName || !to) return { ok: false, error: 'A category and a new name are needed.' };
    if (to === oldName) return { ok: false, error: 'That is already the name.' };

    const { data: clash } = await this.client!
      .from('soccer_categories')
      .select('id')
      .eq('name', to)
      .or('is_deleted.is.null,is_deleted.eq.false');
    if (clash && clash.length > 0) {
      return { ok: false, error: `"${to}" already exists. Use Merge to combine the two instead.` };
    }

    const retag = await this.retagDrills(oldName, to);
    if (!retag.ok) return { ok: false, error: retag.error };

    const { error } = await this.client!
      .from('soccer_categories')
      .update({ name: to })
      .eq('id', id)
      .select();
    if (error) {
      console.warn('Supabase renameSoccerCategory notice:', error.message);
      return {
        ok: false,
        error: `${retag.count} drill(s) were re-tagged, but the category itself could not be renamed: ${error.message}`
      };
    }
    return { ok: true, drillsUpdated: retag.count };
  }

  /**
   * Fold one category into another: re-tag its drills, then retire its row.
   *
   * `fromName` need not have a category row at all. That is the common case --
   * a drill labelled with a name nobody ever defined -- and there is simply
   * nothing to retire.
   */
  async mergeSoccerCategory(
    fromName: string, toName: string
  ): Promise<{ ok: boolean; error?: string; drillsUpdated?: number }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!fromName || !toName) return { ok: false, error: 'Pick a category and a destination.' };
    if (fromName === toName) return { ok: false, error: 'That is the same category.' };

    const retag = await this.retagDrills(fromName, toName);
    if (!retag.ok) return { ok: false, error: retag.error };

    const { error } = await this.client!
      .from('soccer_categories')
      .update({ is_deleted: true })
      .eq('name', fromName)
      .select();
    if (error) {
      console.warn('Supabase mergeSoccerCategory notice:', error.message);
      return {
        ok: false,
        error: `${retag.count} drill(s) moved, but "${fromName}" could not be retired: ${error.message}`
      };
    }
    return { ok: true, drillsUpdated: retag.count };
  }

  /**
   * Retire a category. Soft delete, matching the repo-wide convention.
   *
   * Drills are deliberately left alone: `category` is text on the drill, so a
   * retired category keeps working there and simply stops being offered for new
   * ones. Merge is the operation for moving them.
   */
  async retireSoccerCategory(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!id) return { ok: false, error: 'No category given.' };

    const { error } = await this.client!
      .from('soccer_categories')
      .update({ is_deleted: true })
      .eq('id', id)
      .select();
    if (error) { console.warn('Supabase retireSoccerCategory notice:', error.message); return { ok: false, error: error.message }; }
    return { ok: true };
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

    // points is the matrix weight. It was previously read from the form and
    // then dropped on the floor here, so a weight set in the drills library
    // never reached the database. measure is new in migration 0009.
    const weight = Number(drill.points);
    if (Number.isFinite(weight)) payload.points = weight;
    // Conditional, not defaulted: a caller who never knew about `measure`
    // (an old form, a typo-fix save, the XLSX drills import) must not be able
    // to clobber a value it never supplied. The column carries its own
    // database default ('head_to_head') for genuine inserts.
    if (SupabaseService.MEASURES.includes(drill.measure)) payload.measure = drill.measure;

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

  /**
   * Split a full name into a first name and a surname.
   *
   * Splits on the FIRST space, so a compound surname stays whole: "Ana Maria
   * Rodriguez Gomez" keeps "Maria Rodriguez Gomez" rather than being reduced to
   * "Gomez". A single word is a first name with no surname recorded -- this
   * must not invent one.
   *
   * Used for the import path and for any caller still passing a single `name`.
   * It mirrors the backfill in 0016_player_first_last_name.sql; change both
   * together if the rule ever changes.
   */
  splitPlayerName(full: string): { firstName: string; lastName: string } {
    const trimmed = (full || '').trim().replace(/\s+/g, ' ');
    if (!trimmed) return { firstName: '', lastName: '' };
    const gap = trimmed.indexOf(' ');
    if (gap === -1) return { firstName: trimmed, lastName: '' };
    return { firstName: trimmed.slice(0, gap), lastName: trimmed.slice(gap + 1) };
  }

  /**
   * Writes only the identity columns a player row still owns once per-team
   * data (number, position, season_stats, ratings, matrix_stats, school_id)
   * has moved to team_players. Same upsert shape as upsertPlayer.
   *
   * Accepts either the parts (firstName/lastName) or a single legacy `name`,
   * which is split. `name` is sent as well as the parts: a database trigger
   * (0016) rebuilds it anyway, but sending it keeps the row correct even before
   * that migration is applied.
   */
  async upsertPlayerIdentity(player: any): Promise<{ id?: string } | null> {
    if (!this.isConfigured()) return null;

    const fromParts = (player.firstName || player.first_name || '').trim();
    const parts = fromParts
      ? {
          firstName: fromParts,
          lastName: (player.lastName || player.last_name || '').trim()
        }
      : this.splitPlayerName(player.name || '');

    // A blank row would show as an unnamed player on the roster that nobody can
    // identify or search for, so refuse rather than write one.
    if (!parts.firstName) {
      console.warn('Supabase upsertPlayerIdentity notice: a player needs a name.');
      return null;
    }

    const payload: Record<string, any> = {
      first_name: parts.firstName,
      last_name: parts.lastName,
      name: `${parts.firstName} ${parts.lastName}`.trim(),
      class_year: player.classYear || player.class_year || 'Senior',
      height: player.height || '',
      photo_url: player.photo || player.photo_url || null
    };
    if (player.id && this.isUuid(player.id)) payload.id = player.id;

    const { data, error } = await this.client!
      .from('players')
      .upsert([payload])
      .select();
    if (error) { console.warn('Supabase upsertPlayerIdentity notice:', error.message); return null; }
    return data ? data[0] : null;
  }

  /**
   * Puts a player on a team. Returns { ok, error } because the interesting
   * failure is not an outage: the partial unique index
   * team_players_one_team_per_school rejects a player who is already on
   * another (non-removed) team in this same organization, which the design
   * forbids on purpose. The caller shows that message to a coach.
   *
   * This is NOT a PostgREST `.upsert(..., { onConflict: 'team_id,player_id' })`
   * on purpose. team_players_one_per_team / team_players_one_team_per_school
   * are PARTIAL unique indexes (`where not coalesce(is_deleted, false)`), so a
   * removed membership never blocks re-adding that player elsewhere. Postgres
   * only infers a partial index as an ON CONFLICT arbiter when the statement
   * carries the identical predicate, and PostgREST's `on_conflict` parameter
   * has no way to express one -- pointing it at these columns raises 42P10
   * ("no unique or exclusion constraint matching the ON CONFLICT
   * specification"), not a clean upsert. So this looks up the live row by
   * hand and updates it, falling back to insert.
   */
  async upsertTeamMembership(
    teamId: string,
    schoolId: string,
    membership: Record<string, any>
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!teamId || !schoolId) return { ok: false, error: 'No team selected.' };
    try {
      const payload: Record<string, any> = {
        team_id: teamId,
        school_id: schoolId,
        player_id: membership.player_id,
        number: membership.number ?? null,
        position: membership.position ?? null,
        is_deleted: false
      };
      if (membership.season_stats) payload.season_stats = membership.season_stats;
      if (membership.ratings) payload.ratings = membership.ratings;
      if (membership.id && this.isUuid(membership.id)) payload.id = membership.id;

      if (!payload.id) {
        const { data: existing, error: findErr } = await this.client!
          .from('team_players')
          .select('id')
          .eq('team_id', teamId)
          .eq('player_id', membership.player_id)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .maybeSingle();
        if (findErr) {
          console.warn('Supabase upsertTeamMembership lookup notice:', findErr.message);
          return { ok: false, error: findErr.message };
        }
        if (existing && existing.id) payload.id = existing.id;
      }

      const { data, error } = payload.id
        ? await this.client!.from('team_players').update(payload).eq('id', payload.id).select()
        : await this.client!.from('team_players').insert([payload]).select();
      if (error) {
        console.warn('Supabase upsertTeamMembership notice:', error.message);
        // 23505 is the unique violation. Say which rule was hit rather than
        // handing a coach a Postgres error code.
        if (error.code === '23505') {
          return { ok: false, error: 'That player is already on another team in this organization.' };
        }
        return { ok: false, error: error.message };
      }
      // An RLS denial returns no error and no rows, so zero rows is a refusal.
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that change. You must coach this team.' };
      }
      return { ok: true };
    } catch (e: any) {
      console.warn('Supabase upsertTeamMembership exception:', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }

  /**
   * Removes a player from ONE team. Soft-deletes the membership, never the
   * person: the same player may be on a club team, and deleting the identity
   * row would remove them from that too.
   *
   * Returns { ok, error } like the other writes — an RLS denial comes back with
   * no error and no rows, so a null return could not distinguish "you do not
   * coach this team" from "it worked".
   */
  async deleteTeamMembership(teamId: string, playerId: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!teamId || !playerId) return { ok: false, error: 'No team or player given.' };
    try {
      const { data, error } = await this.client!
        .from('team_players')
        .update({ is_deleted: true })
        .eq('team_id', teamId)
        .eq('player_id', playerId)
        .select();
      if (error) {
        console.warn('Supabase deleteTeamMembership notice:', error.message);
        return { ok: false, error: error.message };
      }
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that change. You must coach this team.' };
      }
      return { ok: true };
    } catch (e: any) {
      console.warn('Supabase deleteTeamMembership exception:', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }

  /**
   * People in the program who are on no team.
   *
   * `players` is the person, `team_players` is the membership, so removing
   * someone from a squad leaves the person behind. That is deliberate -- they
   * may play for a club side, and their Matrix history keys on the person, not
   * the membership -- but nothing in the app shows them, so they accumulate
   * unseen, duplicates among them.
   *
   * `resultCount` is the load-bearing field: retiring someone who still owns
   * results would orphan that history, so a caller must know before offering
   * the button.
   *
   * Diffed client-side rather than with a NOT EXISTS, which PostgREST cannot
   * express. These tables are small -- tens of rows, not thousands -- and the
   * alternative is a database view for a maintenance screen.
   */
  async fetchUnassignedPlayers(): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;

    const [people, memberships, logs, sessionResults] = await Promise.all([
      this.client!.from('players')
        .select('id, name, first_name, last_name, class_year')
        .or('is_deleted.is.null,is_deleted.eq.false'),
      this.client!.from('team_players')
        .select('player_id, is_deleted'),
      this.client!.from('matrix_logs')
        .select('player_a_id, player_b_id, is_deleted'),
      // No is_deleted here: matrix_session_results does NOT have that column,
      // unlike matrix_logs and team_players. Verified against the live
      // database -- asking for it returns 42703 and the whole query fails,
      // which would have made every session result count as zero and offered a
      // player with real history for retirement.
      this.client!.from('matrix_session_results')
        .select('player_id')
    ]);

    if (people.error) { console.warn('Supabase fetchUnassignedPlayers notice:', people.error.message); return null; }

    // If a history query failed we cannot say what anyone owns. Say so rather
    // than reporting zero, which reads identically to "safe to retire".
    const historyUnknown = !!(logs.error || sessionResults.error || memberships.error);
    if (historyUnknown) {
      console.warn('Supabase fetchUnassignedPlayers: could not read result history —',
        (logs.error || sessionResults.error || memberships.error)?.message);
    }

    const onATeam = new Set(
      (memberships.data || [])
        .filter((m: any) => !m.is_deleted)
        .map((m: any) => m.player_id)
    );

    const results: Record<string, number> = {};
    const bump = (id: string) => { if (id) results[id] = (results[id] || 0) + 1; };
    (logs.data || []).forEach((l: any) => {
      if (l.is_deleted) return;
      bump(l.player_a_id);
      bump(l.player_b_id);
    });
    (sessionResults.data || []).forEach((r: any) => {
      if (r.is_deleted) return;
      bump(r.player_id);
    });

    return (people.data || [])
      .filter((p: any) => !onATeam.has(p.id))
      .map((p: any) => ({
        ...p,
        resultCount: results[p.id] || 0,
        // A caller must not offer to retire anyone while this is true.
        historyUnknown
      }))
      .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
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

    // Only written when supplied, so editing an existing organization through
    // the profile form cannot silently reset a club back to the column default.
    if (school.kind === 'school' || school.kind === 'club') payload.kind = school.kind;

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

  /**
   * Creates an organization -- a school or a club.
   *
   * Deliberately separate from upsertSchool, which upserts on : changing
   * the code in the profile editor and saving would silently create a second
   * organization rather than renaming the one being edited. Creating one should
   * be something you asked for.
   */
  async createSchool(
    code: string, name: string, kind: string, mascot: string
  ): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    const c = String(code || '').trim().toLowerCase();
    const n = String(name || '').trim();
    // schools.mascot is NOT NULL with no default, and it is what page headings
    // render beside the name ("BEAUMONT COUGARS ROSTER"). Omitting it fails the
    // insert outright; defaulting it silently ships an organization branded
    // with a placeholder nobody remembers to correct.
    const m = String(mascot || '').trim();
    if (!c || !n) return { ok: false, error: 'Give the organization a name and a short code.' };
    if (!m) return { ok: false, error: 'Give the organization a mascot.' };
    if (kind !== 'school' && kind !== 'club') return { ok: false, error: 'Pick school or club.' };
    try {
      const { data, error } = await this.client!
        .from('schools').insert([{ code: c, name: n, kind, mascot: m }]).select();
      if (error) {
        console.warn('Supabase createSchool notice:', error.message);
        if (error.code === '23505') return { ok: false, error: `The code "${c}" is already in use.` };
        return { ok: false, error: error.message };
      }
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that write. Coach or admin access is required.' };
      }
      return { ok: true, id: data[0].id };
    } catch (e: any) {
      console.warn('Supabase createSchool exception:', e);
      return { ok: false, error: e?.message || String(e) };
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

  async fetchDailyThoughts(teamId: string): Promise<Partial<DailyThoughtRow>[] | null> {
    // team_id is a uuid column; refuse a non-uuid value (e.g. a leftover
    // school code) here rather than letting it reach Postgres and fail the
    // cast with 22P02 — the exact bug class this table hit for months.
    if (!this.isConfigured() || !teamId || !this.isUuid(teamId)) return null;
    const { data, error } = await this.client!
      .from('daily_thoughts')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    if (error) { console.error('Supabase fetchDailyThoughts error:', error); return null; }
    return data;
  }

  async fetchLatestDailyThoughts(teamId: string): Promise<Partial<DailyThoughtRow> | null> {
    if (!this.isConfigured() || !teamId || !this.isUuid(teamId)) return null;
    const { data, error } = await this.client!
      .from('daily_thoughts')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) { console.error('Supabase fetchLatestDailyThoughts error:', error); return null; }
    return data && data.length > 0 ? data[0] : null;
  }

  async upsertDailyThought(teamId: string, thought: any = {}): Promise<any> {
    if (!this.isConfigured()) return { error: 'Cloud database is not configured.' };
    // Without a team the row is invisible to every read that follows, and the
    // caller would report success over a permanent silent loss. A non-uuid
    // value (e.g. a leftover school code) is refused the same way, since
    // team_id is a uuid column and would otherwise fail the write with 22P02.
    if (!teamId || !this.isUuid(teamId)) return { error: 'No team selected; refusing to write an unscoped thought.' };

    const payload: Record<string, any> = {
      team_id: teamId,
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

  async setActiveDailyThought(teamId: string, activeId?: string): Promise<any> {
    if (!this.isConfigured() || !activeId || !teamId || !this.isUuid(teamId)) return null;
    // Scoped to the team: clearing by school would clear another squad's
    // active message.
    const { error: err1 } = await this.client!
      .from('daily_thoughts')
      .update({ is_active: false })
      .eq('team_id', teamId);
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

  async fetchMatrixStandings(teamId: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured() || !teamId) return null;
    try {
      const { data, error } = await this.client!
        .from('matrix_standings')
        .select('*')
        .eq('team_id', teamId);
      if (error) { console.warn('Supabase fetchMatrixStandings notice:', error.message); return null; }
      return data;
    } catch (e) {
      console.warn('Supabase fetchMatrixStandings exception:', e);
      return null;
    }
  }

  async fetchMatrixLogs(teamId: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured() || !teamId) return null;
    try {
      const { data, error } = await this.client!
        .from('matrix_logs')
        .select('*')
        .eq('team_id', teamId)
        .eq('is_deleted', false)
        .order('occurred_on', { ascending: false });
      if (error) { console.warn('Supabase fetchMatrixLogs notice:', error.message); return null; }
      return data;
    } catch (e) {
      console.warn('Supabase fetchMatrixLogs exception:', e);
      return null;
    }
  }

  async logMatrixResult(teamId: string, result: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!teamId) return { ok: false, error: 'No team selected.' };
    try {
      const payload: Record<string, any> = {
        team_id: teamId,
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
