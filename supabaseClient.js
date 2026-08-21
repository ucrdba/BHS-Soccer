/**
 * Supabase Client Configuration & Database Bridge
 * Beaumont High School Cougars Soccer
 */

// Load saved project credentials from localStorage or ENV
function getSupabaseUrl() {
  return window.ENV_SUPABASE_URL || localStorage.getItem('bhs_supabase_url') || 'https://arsigevpgpbqluqbnhjr.supabase.co';
}

function getSupabaseAnonKey() {
  return window.ENV_SUPABASE_ANON_KEY || localStorage.getItem('bhs_supabase_anon_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyc2lnZXZwZ3BicWx1cWJuaGpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MDY2NjgsImV4cCI6MjEwMTE4MjY2OH0.UayuI-pPjvY0qfFoSHrPNanaFr02V8mrbMFxAmy6-iw';
}

let supabaseClient = null;

function initSupabaseClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (typeof supabase !== 'undefined' && url && url.includes('.supabase.co') && key && key.startsWith('eyJ')) {
    try {
      supabaseClient = supabase.createClient(url, key);
      console.log('⚡ Connected to Supabase Cloud Database:', url);
    } catch (err) {
      console.warn('Supabase init notice:', err.message);
      supabaseClient = null;
    }
  } else {
    supabaseClient = null;
    console.log('📦 Operating in Local Database Mode (LocalStorage active). Provide valid Supabase Anon Key (starts with eyJ...) to enable Cloud DB.');
  }
}

initSupabaseClient();

class SupabaseService {
  constructor() {
    this.client = supabaseClient;
  }

  isConfigured() {
    return this.client !== null;
  }

  setCredentials(url, key) {
    if (url) localStorage.setItem('bhs_supabase_url', url.trim());
    if (key) localStorage.setItem('bhs_supabase_anon_key', key.trim());
    initSupabaseClient();
    this.client = supabaseClient;
    return this.isConfigured();
  }

  async signUpUser(email, password, metadata = {}) {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client.auth.signUp({ email, password, options: { data: metadata } });
      if (error) console.warn('Supabase Auth signUp notice:', error.message);
      return { data, error };
    } catch (e) {
      console.warn('Supabase Auth signUp exception:', e);
      return null;
    }
  }

  async signInUser(email, password) {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) console.warn('Supabase Auth signIn notice:', error.message);
      return { data, error };
    } catch (e) {
      console.warn('Supabase Auth signIn exception:', e);
      return null;
    }
  }

  async signOutUser() {
    if (!this.isConfigured()) return null;
    try {
      const { error } = await this.client.auth.signOut();
      if (error) console.warn('Supabase Auth signOut notice:', error.message);
      return { error };
    } catch (e) {
      console.warn('Supabase Auth signOut exception:', e);
      return null;
    }
  }

  async getSession() {
    if (!this.isConfigured()) return { data: { session: null }, error: null };
    return this.client.auth.getSession();
  }

  onAuthStateChange(callback) {
    if (!this.isConfigured()) return null;
    return this.client.auth.onAuthStateChange(callback);
  }

  async verifyOtp(email, token) {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client.auth.verifyOtp({ email, token, type: 'signup' });
      if (error) console.warn('Supabase Auth verifyOtp notice:', error.message);
      return { data, error };
    } catch (e) {
      console.warn('Supabase Auth verifyOtp exception:', e);
      return null;
    }
  }

  async fetchOwnProfile() {
    if (!this.isConfigured()) return null;
    try {
      const { data: userData, error: userError } = await this.client.auth.getUser();
      if (userError || !userData?.user) return null;
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (error) { console.error('Supabase fetchOwnProfile error:', error.message); return null; }
      return data;
    } catch (e) {
      console.error('Supabase fetchOwnProfile exception:', e);
      return null;
    }
  }

  isUuid(str) {
    return typeof str === 'string' && str.length === 36 && str.includes('-');
  }

  async getSchoolUuid(schoolCodeOrId = 'bhs') {
    if (!schoolCodeOrId) return null;
    if (this.isUuid(schoolCodeOrId)) return schoolCodeOrId;
    if (!this.isConfigured()) return null;

    if (this._cachedSchoolUuidMap && this._cachedSchoolUuidMap[schoolCodeOrId]) {
      return this._cachedSchoolUuidMap[schoolCodeOrId];
    }

    try {
      const { data, error } = await this.client
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

  async upsertProfile(userId, fields = {}) {
    if (!this.isConfigured()) return null;
    if (!userId) { console.warn('Supabase upsertProfile: missing userId — profile rows are created by the handle_new_user DB trigger, not the client.'); return null; }

    const payload = {};
    if (fields.name !== undefined) payload.name = fields.name;
    if (fields.avatar !== undefined) payload.avatar_url = fields.avatar;
    if (fields.teamLevel !== undefined) payload.team_level = fields.teamLevel;

    try {
      const { data, error } = await this.client
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select();

      if (error) {
        console.error('❌ Supabase profiles update error:', error.message, error);
        return null;
      }
      return data ? data[0] : null;
    } catch (err) {
      console.error('❌ Supabase profiles exception:', err.message);
      return null;
    }
  }

  async approveProfile(userId) {
    if (!this.isConfigured() || !userId) return null;
    try {
      const { data: existing, error: fetchError } = await this.client
        .from('profiles')
        .select('requested_role')
        .eq('id', userId)
        .maybeSingle();
      if (fetchError || !existing) { console.error('❌ Supabase approveProfile fetch error:', fetchError?.message); return null; }

      const { data, error } = await this.client
        .from('profiles')
        .update({ status: 'active', role: existing.requested_role || 'player' })
        .eq('id', userId)
        .select();
      if (error) { console.error('❌ Supabase approveProfile error:', error.message); return null; }
      return data ? data[0] : null;
    } catch (e) {
      console.error('❌ Supabase approveProfile exception:', e.message);
      return null;
    }
  }

  async rejectProfile(userId) {
    if (!this.isConfigured() || !userId) return null;
    try {
      const { data, error } = await this.client
        .from('profiles')
        .update({ status: 'rejected' })
        .eq('id', userId)
        .select();
      if (error) { console.error('❌ Supabase rejectProfile error:', error.message); return null; }
      return data ? data[0] : null;
    } catch (e) {
      console.error('❌ Supabase rejectProfile exception:', e.message);
      return null;
    }
  }

  async fetchPendingApprovals(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true });
    if (error) { console.error('Supabase fetchPendingApprovals error:', error.message); return null; }
    return data;
  }

  async testProfileInsert() {
    if (!this.isConfigured()) {
      return { success: false, error: 'Supabase client is not connected. Make sure a valid Supabase Anon Key (starts with eyJ...) is entered.' };
    }

    const testEmail = `test_profile_${Date.now().toString().slice(-4)}@bhs.org`;
    const schoolUuid = await this.getSchoolUuid('bhs');
    const payload = {
      name: 'Diagnostic Test Player',
      email: testEmail,
      role: 'player',
      status: 'active',
      team_level: 'Boys Varsity'
    };
    if (schoolUuid) payload.school_id = schoolUuid;

    try {
      const { data, error } = await this.client
        .from('profiles')
        .upsert([payload], { onConflict: 'email' })
        .select();

      if (error) {
        console.error('❌ Supabase test profile insert error:', error.message);
        return { success: false, error: error.message };
      }

      console.log('✅ Supabase test profile inserted successfully:', data);
      return { success: true, data: data[0] };
    } catch (err) {
      console.error('❌ Supabase test profile exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  async runFullDatabaseDiagnostic() {
    if (!this.isConfigured()) {
      return {
        success: false,
        summaryText: '❌ Supabase Database Client is NOT connected.\n\nReason: Missing or invalid Supabase Anon Key.\n\nFix: Open Admin Center -> Enter your Supabase Anon Key (starts with "eyJ...") and click "Save Credentials".',
        tableResults: []
      };
    }

    const schoolUuid = await this.getSchoolUuid('bhs');
    const tableResults = [];

    // Helper runner for individual table testing
    const testTable = async (tableName, icon, operation, testPayload, selectCols = '*') => {
      const res = {
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
        const sel = await this.client.from(tableName).select(selectCols).limit(1);
        if (sel.error) {
          res.selectStatus = 'FAILED';
          res.selectDetails = `SELECT Error: ${sel.error.message} (Postgres Code: ${sel.error.code})`;
        } else {
          res.selectStatus = 'PASSED';
          res.selectDetails = `SELECT OK (${sel.data ? sel.data.length : 0} rows found)`;
        }
      } catch (e) {
        res.selectStatus = 'FAILED';
        res.selectDetails = `SELECT Exception: ${e.message}`;
      }

      // 2. Test INSERT / UPSERT Query (if test payload provided)
      if (testPayload) {
        try {
          let ins;
          if (operation === 'UPSERT') {
            const conflictCol = tableName === 'schools' ? 'code' : (tableName === 'profiles' ? 'email' : undefined);
            ins = await this.client.from(tableName).upsert([testPayload], conflictCol ? { onConflict: conflictCol } : undefined).select();
          } else {
            ins = await this.client.from(tableName).insert([testPayload]).select();
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
                await this.client.from('schools').delete().eq('code', primaryKeyVal);
              } else if (insertedRow.id) {
                await this.client.from(tableName).delete().eq('id', insertedRow.id);
              }
              res.cleanupStatus = 'PASSED (Test row cleaned up)';
            } catch (cleanErr) {
              res.cleanupStatus = `Cleanup Warning: ${cleanErr.message}`;
            }
          } else {
            res.insertStatus = 'FAILED';
            res.responseDetails = `INSERT query executed but returned 0 rows (Check RLS Policy)`;
          }
        } catch (e) {
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
    const profPayload = { name: 'Diagnostic Test Profile', email: testEmail, role: 'player', status: 'active' };
    if (schoolUuid) profPayload.school_id = schoolUuid;
    tableResults.push(await testTable('profiles', '👤', 'UPSERT', profPayload));

    // 3. players
    const playerPayload = { number: 99, name: 'Diagnostic Test Player', position: 'MID', class_year: 'Senior', height: "6'0\"" };
    if (schoolUuid) playerPayload.school_id = schoolUuid;
    tableResults.push(await testTable('players', '👥', 'INSERT', playerPayload));

    // 4. schedule
    const schedPayload = { opponent: 'Diagnostic Opponent', match_date: 'OCT 25', match_time: '5:00 PM', location: 'Varsity Field', is_home: true, status: 'UPCOMING' };
    if (schoolUuid) schedPayload.school_id = schoolUuid;
    tableResults.push(await testTable('schedule', '📅', 'INSERT', schedPayload));

    // 5. drills_bank
    const drillPayload = { name: 'Diagnostic Master Drill', duration: '15 min', category: 'Testing', points: 3, coach_notes: 'Automated test drill' };
    if (schoolUuid) drillPayload.school_id = schoolUuid;
    tableResults.push(await testTable('drills_bank', '📚', 'INSERT', drillPayload));

    // 6. practice_plans
    const planPayload = { time_slot: '0:00 - 0:15', name: 'Diagnostic Plan Item', duration: '15 min', coach_notes: 'Automated test item' };
    if (schoolUuid) planPayload.school_id = schoolUuid;
    tableResults.push(await testTable('practice_plans', '📋', 'INSERT', planPayload));

    // 7. coaches
    const coachPayload = { name: 'Diagnostic Coach', level: 'Staff Coach', email: `coach_diag_${Date.now().toString().slice(-4)}@bhs.org` };
    if (schoolUuid) coachPayload.school_id = schoolUuid;
    tableResults.push(await testTable('coaches', '👔', 'INSERT', coachPayload));

    // 8. daily_thoughts
    const thoughtPayload = { coach_name: 'Coach Bob Miller', thoughts_text: 'Diagnostic automated test thought', is_active: false };
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
  // Database Query Wrappers
  async fetchPlayers(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    let query = this.client.from('players').select('*').or('is_deleted.is.null,is_deleted.eq.false');
    const schoolUuid = await this.getSchoolUuid(schoolId);
    if (schoolUuid) query = query.eq('school_id', schoolUuid);
    const { data, error } = await query;
    if (error) { console.error('Supabase fetchPlayers error:', error); return null; }
    return data;
  }

  async fetchSchedule(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    let query = this.client.from('schedule').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: true });
    const schoolUuid = await this.getSchoolUuid(schoolId);
    if (schoolUuid) query = query.eq('school_id', schoolUuid);
    const { data, error } = await query;
    if (error) { console.error('Supabase fetchSchedule error:', error); return null; }
    return data;
  }

  async upsertMatch(schoolId, match) {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    const payload = {
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
    const { data, error } = await this.client
      .from('schedule')
      .upsert([payload])
      .select();
    if (error) console.error('Supabase upsertMatch error:', error);
    return data ? data[0] : null;
  }

  async deleteMatch(matchId) {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
      .from('schedule')
      .update({ is_deleted: true })
      .eq('id', matchId)
      .select();
    if (error) console.error('Supabase soft deleteMatch error:', error);
    return data;
  }

  async fetchPracticePlans(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    let query = this.client.from('practice_plans').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: true });
    const schoolUuid = await this.getSchoolUuid(schoolId);
    if (schoolUuid) query = query.eq('school_id', schoolUuid);
    const { data, error } = await query;
    if (error) { console.error('Supabase fetchPracticePlans error:', error); return null; }
    return data;
  }

  async saveFullPracticePlan(schoolId = 'bhs', planNameOrObj, drillsArr) {
    if (!this.isConfigured()) return { success: false, error: 'Supabase Cloud DB is not configured.' };

    let planName = 'Practice Plan';
    let drills = [];

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
      const item = {
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
      const { data, error } = await this.client
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
    } catch (err) {
      console.error('❌ Supabase saveFullPracticePlan exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  async savePracticePlanItem(schoolId, planItem) {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    const payload = {
      name: planItem.planName || window.app?.data?.activePlanName || 'Standard Practice Plan',
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
      const { data, error } = await this.client
        .from('practice_plans')
        .upsert([payload])
        .select();
      if (error) {
        console.error('❌ Supabase savePracticePlanItem error:', error.message, error);
        return null;
      }
      return data ? data[0] : null;
    } catch (e) {
      console.error('❌ Supabase savePracticePlanItem exception:', e.message);
      return null;
    }
  }

  async upsertPracticePlanItem(schoolId, planItem) {
    return this.savePracticePlanItem(schoolId, planItem);
  }

  async deletePracticePlanItem(planId) {
    if (!this.isConfigured()) return null;
    const { error } = await this.client
      .from('practice_plans')
      .update({ is_deleted: true })
      .eq('id', planId);
    if (error) console.error('Supabase soft deletePracticePlanItem error:', error);
  }

  async fetchSoccerCategories(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    try {
      let query = this.client.from('soccer_categories').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('name', { ascending: true });
      const { data, error } = await query;
      if (error) { console.error('Supabase fetchSoccerCategories error:', error.message); return null; }
      return data;
    } catch (e) {
      return null;
    }
  }

  async upsertSoccerCategory(schoolId = 'bhs', categoryObj = {}) {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    const payload = {
      name: categoryObj.name,
      description: categoryObj.description || '',
      is_deleted: categoryObj.is_deleted || false
    };
    if (schoolUuid) payload.school_id = schoolUuid;
    if (categoryObj.id && this.isUuid(categoryObj.id)) payload.id = categoryObj.id;

    try {
      const { data, error } = await this.client
        .from('soccer_categories')
        .upsert([payload], { onConflict: 'name' })
        .select();
      if (error) { console.error('Supabase upsertSoccerCategory error:', error.message); return null; }
      return data ? data[0] : null;
    } catch (e) {
      return null;
    }
  }

  async fetchDrillsBank(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    try {
      let query = this.client.from('drills_bank').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: true });
      const { data, error } = await query;
      if (error) { console.error('Supabase fetchDrillsBank error:', error.message); return null; }
      return data;
    } catch (e) {
      return null;
    }
  }

  async upsertDrillBankItem(schoolId = 'bhs', drill = {}) {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);

    const payload = {
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
      const { data, error } = await this.client
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
    } catch (e) {
      console.error('❌ Supabase upsertDrillBankItem exception:', e.message);
      return null;
    }
  }

  async deleteDrillBankItem(drillId) {
    if (!this.isConfigured() || !drillId) return null;
    try {
      const { error } = await this.client
        .from('drills_bank')
        .update({ is_deleted: true })
        .eq('id', drillId);
      if (error) console.error('Supabase soft deleteDrillBankItem error:', error.message);
    } catch (e) {}
  }

  async upsertPlayer(schoolId, player) {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    const dbPayload = {
      number: parseInt(player.number),
      name: player.name,
      position: player.position,
      class_year: player.classYear || player.class_year || 'Senior',
      height: player.height || '',
      photo_url: player.photo || player.photo_url || '',
      season_stats: player.seasonStats || player.season_stats || {},
      ratings: player.ratings || {},
      matrix_stats: player.matrixStats || player.matrix_stats || {},
      is_deleted: player.isDeleted || false
    };

    if (schoolUuid) dbPayload.school_id = schoolUuid;
    if (player.id && this.isUuid(player.id)) dbPayload.id = player.id;

    const { data, error } = await this.client
      .from('players')
      .upsert([dbPayload])
      .select();
    if (error) console.error('Supabase upsertPlayer error:', error);
    return data ? data[0] : null;
  }

  async deletePlayer(playerId) {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
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

  async fetchSchool(schoolCode = 'bhs') {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client
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

  async fetchSchools() {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client
        .from('schools')
        .select('*')
        .order('name', { ascending: true });
      if (error) { console.error('Supabase fetchSchools error:', error.message); return null; }
      return data;
    } catch (e) {
      return null;
    }
  }



  async upsertSchool(schoolCode = 'bhs', school = {}) {
    if (!this.isConfigured()) return { data: null, error: 'Supabase Cloud DB is not configured (Anon Key missing).' };
    const payload = {
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
      const { data, error } = await this.client
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
    } catch (err) {
      console.error('❌ Supabase upsertSchool exception:', err.message);
      return { data: null, error: err.message };
    }
  }

  async fetchCoaches(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    let query = this.client.from('coaches').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: true });
    if (schoolUuid) query = query.eq('school_id', schoolUuid);
    const { data, error } = await query;
    if (error) { console.error('Supabase fetchCoaches error:', error); return null; }
    return data;
  }

  async upsertCoach(schoolId = 'bhs', coach = {}) {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    const payload = {
      name: coach.name || 'Coach',
      level: coach.level || 'Staff',
      phone: coach.phone || '',
      address: coach.address || '',
      email: coach.email || '',
      photo_url: coach.photo || coach.photo_url || '',
      bio: coach.bio || '',
      is_deleted: coach.is_deleted || coach.isDeleted || false
    };

    if (schoolUuid) payload.school_id = schoolUuid;
    if (coach.id && this.isUuid(coach.id)) {
      payload.id = coach.id;
    }

    console.log('⚡ Supabase inserting coach into `coaches` table:', payload);

    try {
      const { data, error } = await this.client
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
    } catch (err) {
      console.error('❌ Supabase upsertCoach exception:', err.message);
      return null;
    }
  }

  async deleteCoach(coachId) {
    if (!this.isConfigured()) return null;
    const { error } = await this.client
      .from('coaches')
      .update({ is_deleted: true })
      .eq('id', coachId);
    if (error) console.error('Supabase soft deleteCoach error:', error);
  }

  async fetchDailyThoughts(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
      .from('daily_thoughts')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });
    if (error) { console.error('Supabase fetchDailyThoughts error:', error); return null; }
    return data;
  }

  async fetchLatestDailyThoughts(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
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

  async upsertDailyThought(schoolId = 'bhs', thought = {}) {
    if (!this.isConfigured()) return { error: 'Supabase client is not configured' };

    const payload = {
      school_id: schoolId,
      coach_id: thought.coachId || 'c1',
      coach_name: thought.coachName || 'Coach Bob Miller',
      thoughts_text: thought.text || '',
      is_active: thought.isActive !== false,
      is_deleted: thought.is_deleted || thought.isDeleted || false
    };

    const isClientTempId = !thought.id || thought.id.startsWith('dt_') || thought.id.startsWith('temp_');

    if (thought.id && !isClientTempId) {
      const { data: updData, error: updErr } = await this.client
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

    const { data: insData, error: insErr } = await this.client
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

  async deleteDailyThought(thoughtId) {
    if (!this.isConfigured()) return null;
    const { error } = await this.client
      .from('daily_thoughts')
      .update({ is_deleted: true })
      .eq('id', thoughtId);
    if (error) console.error('Supabase soft deleteDailyThought error:', error);
  }

  async setActiveDailyThought(schoolId = 'bhs', activeId) {
    if (!this.isConfigured() || !activeId) return null;
    const { error: err1 } = await this.client
      .from('daily_thoughts')
      .update({ is_active: false })
      .eq('school_id', schoolId);
    if (err1) console.error('Supabase setActiveDailyThought reset error:', err1);

    const { error: err2 } = await this.client
      .from('daily_thoughts')
      .update({ is_active: true })
      .eq('id', activeId);
    if (err2) console.error('Supabase setActiveDailyThought set error:', err2);
  }

  async saveQuizAttempt(playerData = {}, answers = [], score = 0, totalQuestions = 5) {
    if (!this.isConfigured()) return null;

    const percentage = Math.round((score / (totalQuestions || 1)) * 100);
    const attemptPayload = {
      player_id: playerData.id || 'p_guest',
      player_name: playerData.name || 'Alex Rivera (#10)',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      score: score,
      total_questions: totalQuestions,
      percentage: percentage
    };

    // 1. Insert row into quiz_attempts
    const { data: attemptData, error: attemptErr } = await this.client
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

      const { error: ansErr } = await this.client
        .from('player_answers')
        .insert(answerRows);

      if (ansErr) console.warn('Supabase player_answers save notice:', ansErr.message);
    }

    return attemptData ? attemptData[0] : null;
  }

  async fetchQuizResults() {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
      .from('quiz_results')
      .select('*')
      .limit(20);

    if (error) {
      const { data: attData } = await this.client
        .from('quiz_attempts')
        .select('*')
        .order('completed_at', { ascending: false })
        .limit(20);
      return attData;
    }
    return data;
  }
}

window.supabaseService = new SupabaseService();
