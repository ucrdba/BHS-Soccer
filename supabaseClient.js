/**
 * Supabase Client Configuration & Database Bridge
 * Beaumont High School Cougars Soccer
 */

// Supabase Project Credentials (Replace with your Supabase Project Settings URL & Anon Key)
const SUPABASE_URL = window.ENV_SUPABASE_URL || 'https://arsigevpgpbqluqbnhjr.supabase.co';
const SUPABASE_ANON_KEY = window.ENV_SUPABASE_ANON_KEY || 'sb_publishable_8vDbPoDO4-JN2QWsUeiEww_M7Pt2JCn';

let supabaseClient = null;

// Initialize Supabase if library & valid URL are present
if (typeof supabase !== 'undefined' && SUPABASE_URL.includes('.supabase.co')) {
  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('⚡ Connected to Supabase Cloud Database');
  } catch (err) {
    console.warn('Supabase init notice:', err.message);
  }
} else {
  console.log('📦 Operating in Local Database Mode (LocalStorage active).');
}

class SupabaseService {
  constructor() {
    this.client = supabaseClient;
  }

  isConfigured() {
    return this.client !== null;
  }

  // Database Query Wrappers
  async fetchPlayers(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
      .from('players')
      .select('*')
      .eq('school_id', schoolId)
      .or('is_deleted.is.null,is_deleted.eq.false');
    if (error) { console.error('Supabase fetchPlayers error:', error); return null; }
    return data;
  }

  async fetchSchedule(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
      .from('schedule')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: true });
    if (error) { console.error('Supabase fetchSchedule error:', error); return null; }
    return data;
  }

  async fetchPracticePlans(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
      .from('practice_plans')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: true });
    if (error) { console.error('Supabase fetchPracticePlans error:', error); return null; }
    return data;
  }

  async savePracticePlanItem(schoolId, planItem) {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
      .from('practice_plans')
      .insert([{
        school_id: schoolId,
        time_slot: planItem.time,
        name: planItem.name,
        duration: planItem.duration,
        coach_notes: planItem.coachNotes
      }])
      .select();
    if (error) console.error('Supabase savePracticePlanItem error:', error);
    return data ? data[0] : null;
  }

  async upsertPracticePlanItem(schoolId, planItem) {
    if (!this.isConfigured()) return null;
    const payload = {
      school_id: schoolId,
      time_slot: planItem.time,
      name: planItem.name,
      duration: planItem.duration,
      coach_notes: planItem.coachNotes
    };
    if (planItem.id) payload.id = planItem.id;

    const { data, error } = await this.client
      .from('practice_plans')
      .upsert([payload])
      .select();
    if (error) console.error('Supabase upsertPracticePlanItem error:', error);
    return data ? data[0] : null;
  }

  async deletePracticePlanItem(planId) {
    if (!this.isConfigured()) return null;
    const { error } = await this.client
      .from('practice_plans')
      .delete()
      .eq('id', planId);
    if (error) console.error('Supabase deletePracticePlanItem error:', error);
  }

  async upsertPlayer(schoolId, player) {
    if (!this.isConfigured()) return null;
    const dbPayload = {
      id: player.id,
      school_id: schoolId,
      number: parseInt(player.number),
      name: player.name,
      position: player.position,
      class_year: player.classYear,
      height: player.height,
      photo_url: player.photo,
      season_stats: player.seasonStats || {},
      ratings: player.ratings || {},
      matrix_stats: player.matrixStats || {},
      is_deleted: player.isDeleted || false
    };

    const { data, error } = await this.client
      .from('players')
      .upsert([dbPayload]);
    if (error) console.error('Supabase upsertPlayer error:', error);
    return data;
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
}

window.supabaseService = new SupabaseService();
