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

  async upsertProfile(schoolId = 'bhs', user = {}) {
    if (!this.isConfigured()) return null;
    const payload = {
      school_id: schoolId,
      name: user.name || 'Team User',
      email: user.email || '',
      role: user.role || 'guest',
      team_level: user.teamLevel || 'Boys Varsity',
      avatar_url: user.avatar || 'assets/bhs_cougars_logo.png'
    };

    const { data, error } = await this.client
      .from('profiles')
      .insert([payload])
      .select();

    if (error) console.warn('Supabase upsertProfile notice:', error.message);
    return data ? data[0] : null;
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

  async upsertMatch(schoolId, match) {
    if (!this.isConfigured()) return null;
    const payload = {
      school_id: schoolId,
      opponent: match.opponent,
      date: match.date,
      time: match.time,
      location: match.location,
      is_home: match.isHome,
      status: match.status,
      score: match.score || null,
      result: match.result || null
    };
    if (match.id && !match.id.startsWith('m_')) payload.id = match.id; // only set UUID ids, not temp ones
    const { data, error } = await this.client
      .from('schedule')
      .upsert([payload])
      .select();
    if (error) console.error('Supabase upsertMatch error:', error);
    return data ? data[0] : null;
  }

  async deleteMatch(matchId) {
    if (!this.isConfigured()) return null;
    const { error } = await this.client
      .from('schedule')
      .delete()
      .eq('id', matchId);
    if (error) console.error('Supabase deleteMatch error:', error);
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

  async saveFullPracticePlan(schoolId = 'bhs', planName, drills) {
    if (!this.isConfigured() || !drills || drills.length === 0) return null;
    const rows = drills.map(d => ({
      school_id: schoolId,
      time_slot: d.time || '',
      name: d.name || '',
      duration: d.duration || '',
      coach_notes: `[Plan: ${planName}] ${d.coachNotes || ''}`.trim()
    }));
    const { data, error } = await this.client
      .from('practice_plans')
      .insert(rows)
      .select();
    if (error) console.error('Supabase saveFullPracticePlan error:', error);
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

  async fetchCoaches(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
      .from('coaches')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: true });
    if (error) { console.error('Supabase fetchCoaches error:', error); return null; }
    return data;
  }

  async upsertCoach(schoolId, coach) {
    if (!this.isConfigured()) return null;
    const payload = {
      school_id: schoolId,
      name: coach.name,
      level: coach.level,
      phone: coach.phone || '',
      address: coach.address || '',
      email: coach.email || '',
      photo_url: coach.photo || '',
      bio: coach.bio || ''
    };
    if (coach.id && !coach.id.startsWith('c_')) payload.id = coach.id;

    const { data, error } = await this.client
      .from('coaches')
      .upsert([payload])
      .select();
    if (error) console.error('Supabase upsertCoach error:', error);
    return data ? data[0] : null;
  }

  async deleteCoach(coachId) {
    if (!this.isConfigured()) return null;
    const { error } = await this.client
      .from('coaches')
      .delete()
      .eq('id', coachId);
    if (error) console.error('Supabase deleteCoach error:', error);
  }

  async fetchDailyThoughts(schoolId = 'bhs') {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client
      .from('daily_thoughts')
      .select('*')
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
      is_active: thought.isActive !== false
    };

    const isClientTempId = !thought.id || thought.id.startsWith('dt_') || thought.id.startsWith('temp_');

    // 1. Try explicit UPDATE if an existing database ID is provided
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

    // 2. Perform clean INSERT for new records (let Supabase generate primary key id)
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
      .delete()
      .eq('id', thoughtId);
    if (error) console.error('Supabase deleteDailyThought error:', error);
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
