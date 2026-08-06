-- Beaumont High School Soccer & Multi-Tenant Platform
-- Supabase PostgreSQL Schema & Row Level Security (RLS) Policies
-- All Primary Key & Foreign Key ID Columns Converted to UUID (gen_random_uuid())

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SCHOOLS TABLE
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE DEFAULT 'bhs',
  name TEXT NOT NULL,
  mascot TEXT NOT NULL,
  city TEXT,
  colors JSONB,
  record JSONB DEFAULT '{"wins":0, "losses":0, "draws":0}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USER PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('guest', 'player', 'coach', 'admin')) DEFAULT 'guest',
  status TEXT DEFAULT 'active',
  team_level TEXT DEFAULT 'Boys Varsity',
  player_id UUID,
  avatar_url TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PLAYERS TABLE
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  number INT NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  class_year TEXT NOT NULL,
  height TEXT,
  photo_url TEXT,
  season_stats JSONB DEFAULT '{}'::jsonb,
  ratings JSONB DEFAULT '{"technical":80,"tactical":80,"physical":80,"mental":80}'::jsonb,
  matrix_stats JSONB DEFAULT '{"wins":0,"losses":0,"points":0,"rank":99,"drillScore":0}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SCHEDULE & FIXTURES TABLE
CREATE TABLE IF NOT EXISTS public.schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  match_date TEXT NOT NULL,
  match_time TEXT NOT NULL,
  opponent TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT CHECK (status IN ('UPCOMING', 'COMPLETED', 'CANCELLED')) DEFAULT 'UPCOMING',
  is_home BOOLEAN DEFAULT true,
  score TEXT,
  result TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. DRILLS BANK TABLE
CREATE TABLE IF NOT EXISTS public.drills_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration TEXT NOT NULL,
  category TEXT NOT NULL,
  points INT DEFAULT 3,
  coach_notes TEXT,
  diagram_image TEXT,
  diagram_data JSONB DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PRACTICE PLANS TABLE
CREATE TABLE IF NOT EXISTS public.practice_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  time_slot TEXT NOT NULL,
  name TEXT NOT NULL,
  duration TEXT NOT NULL,
  coach_notes TEXT,
  diagram_image TEXT,
  diagram_data JSONB DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. COMPETITIVE MATRIX LOGS TABLE
CREATE TABLE IF NOT EXISTS public.matrix_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  drill_id UUID REFERENCES public.drills_bank(id) ON DELETE CASCADE,
  winning_player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  points_earned INT NOT NULL,
  logged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. COACHES TABLE
CREATE TABLE IF NOT EXISTS public.coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  email TEXT,
  photo_url TEXT,
  bio TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. DAILY THOUGHTS TABLE
CREATE TABLE IF NOT EXISTS public.daily_thoughts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.coaches(id) ON DELETE CASCADE,
  coach_name TEXT NOT NULL DEFAULT 'Coach Bob Miller',
  thoughts_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ENSURE IS_DELETED COLUMN EXISTS ACROSS ALL EXISTING TABLES
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.schedule ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.drills_bank ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.practice_plans ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.matrix_logs ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.daily_thoughts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.drills_bank ADD COLUMN IF NOT EXISTS coach_notes TEXT;
ALTER TABLE public.drills_bank ADD COLUMN IF NOT EXISTS diagram_image TEXT;
ALTER TABLE public.drills_bank ADD COLUMN IF NOT EXISTS diagram_data JSONB DEFAULT '{}'::jsonb;

-- 10. QUIZ QUESTIONS TABLE
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  explanation TEXT,
  category TEXT DEFAULT 'Tactical',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. QUIZ ATTEMPTS TABLE
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  score INT DEFAULT 0,
  total_questions INT DEFAULT 0
);

-- 12. INDIVIDUAL ANSWERS GIVEN BY PLAYER
CREATE TABLE IF NOT EXISTS public.player_answers (
  answer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES public.quiz_attempts(attempt_id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.quiz_questions(question_id) ON DELETE CASCADE,
  selected_option CHAR(1) NOT NULL CHECK (selected_option IN ('A','B','C','D')),
  is_correct BOOLEAN,
  UNIQUE (attempt_id, question_id)
);

-- 13. HELPFUL VIEW TO SEE GRADED QUIZ RESULTS
CREATE OR REPLACE VIEW public.quiz_results AS
SELECT 
    a.attempt_id,
    a.player_id,
    a.player_name,
    a.started_at,
    a.completed_at,
    a.score,
    a.total_questions,
    ROUND((a.score::DECIMAL / NULLIF(a.total_questions, 0)) * 100, 1) AS percentage
FROM public.quiz_attempts a
ORDER BY a.completed_at DESC NULLS LAST;

-- GRANT PERMISSIONS TO ANON, AUTHENTICATED & SERVICE ROLE
GRANT ALL ON TABLE public.schools TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.players TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.schedule TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.drills_bank TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.practice_plans TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.matrix_logs TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.coaches TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.daily_thoughts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.quiz_questions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.quiz_attempts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.player_answers TO anon, authenticated, service_role;
GRANT ALL ON public.quiz_results TO anon, authenticated, service_role;

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drills_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matrix_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access for schools" ON public.schools FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for profiles" ON public.profiles FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for players" ON public.players FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for schedule" ON public.schedule FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for drills_bank" ON public.drills_bank FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for practice_plans" ON public.practice_plans FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for matrix_logs" ON public.matrix_logs FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for coaches" ON public.coaches FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for daily_thoughts" ON public.daily_thoughts FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for quiz_questions" ON public.quiz_questions FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for quiz_attempts" ON public.quiz_attempts FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for player_answers" ON public.player_answers FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
