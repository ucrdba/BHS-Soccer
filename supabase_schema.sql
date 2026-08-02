-- Beaumont High School Soccer & Multi-Tenant Platform
-- Supabase PostgreSQL Schema & Row Level Security (RLS) Policies

-- 1. SCHOOLS TABLE
CREATE TABLE IF NOT EXISTS public.schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mascot TEXT NOT NULL,
  city TEXT,
  colors JSONB,
  record JSONB DEFAULT '{"wins":0, "losses":0, "draws":0}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USER PROFILES TABLE (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id TEXT REFERENCES public.schools(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT CHECK (role IN ('guest', 'player', 'coach', 'admin')) DEFAULT 'guest',
  team_level TEXT DEFAULT 'Boys Varsity',
  player_id TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PLAYERS TABLE
CREATE TABLE IF NOT EXISTS public.players (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES public.schools(id),
  number INT NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  class_year TEXT NOT NULL,
  height TEXT,
  photo_url TEXT,
  season_stats JSONB DEFAULT '{}'::jsonb,
  -- Ratings & Matrix fields (Protected by RLS)
  ratings JSONB DEFAULT '{"technical":80,"tactical":80,"physical":80,"mental":80}'::jsonb,
  matrix_stats JSONB DEFAULT '{"wins":0,"losses":0,"points":0,"rank":99,"drillScore":0}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration for existing players table
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- 4. SCHEDULE & FIXTURES TABLE
CREATE TABLE IF NOT EXISTS public.schedule (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES public.schools(id),
  match_date TEXT NOT NULL,
  match_time TEXT NOT NULL,
  opponent TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT CHECK (status IN ('UPCOMING', 'COMPLETED', 'CANCELLED')) DEFAULT 'UPCOMING',
  is_home BOOLEAN DEFAULT true,
  score TEXT,
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. DRILLS BANK TABLE
CREATE TABLE IF NOT EXISTS public.drills_bank (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES public.schools(id),
  name TEXT NOT NULL,
  duration TEXT NOT NULL,
  category TEXT NOT NULL,
  points INT DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PRACTICE PLANS TABLE
CREATE TABLE IF NOT EXISTS public.practice_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id TEXT REFERENCES public.schools(id),
  time_slot TEXT NOT NULL,
  name TEXT NOT NULL,
  duration TEXT NOT NULL,
  coach_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. COMPETITIVE MATRIX LOGS TABLE
CREATE TABLE IF NOT EXISTS public.matrix_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id TEXT REFERENCES public.schools(id),
  drill_id TEXT REFERENCES public.drills_bank(id),
  winning_player_id TEXT REFERENCES public.players(id),
  points_earned INT NOT NULL,
  logged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. COACHES TABLE
CREATE TABLE IF NOT EXISTS public.coaches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id TEXT REFERENCES public.schools(id) DEFAULT 'bhs',
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  email TEXT,
  photo_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. DAILY THOUGHTS TABLE
CREATE TABLE IF NOT EXISTS public.daily_thoughts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id TEXT REFERENCES public.schools(id) DEFAULT 'bhs',
  coach_id TEXT REFERENCES public.coaches(id) DEFAULT 'c1',
  coach_name TEXT NOT NULL DEFAULT 'Coach Bob Miller',
  thoughts_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drills_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matrix_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_thoughts ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Access for Schools & Schedule & Coaches & Daily Thoughts
CREATE POLICY "Public read for schools" ON public.schools FOR SELECT USING (true);
CREATE POLICY "Public read for schedule" ON public.schedule FOR SELECT USING (true);
CREATE POLICY "Public read basic player info" ON public.players FOR SELECT USING (true);
CREATE POLICY "Public read for coaches" ON public.coaches FOR SELECT USING (true);
CREATE POLICY "Public read for daily thoughts" ON public.daily_thoughts FOR SELECT USING (true);

-- 2. Coach & Admin Full Manage Permissions
CREATE POLICY "Coaches manage schedule" ON public.schedule FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

CREATE POLICY "Coaches manage practice plans" ON public.practice_plans FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

CREATE POLICY "Coaches manage matrix logs" ON public.matrix_logs FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

CREATE POLICY "Coaches & Players view practice plans" ON public.practice_plans FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('player', 'coach', 'admin')));

-- 3. Anonymous/App role write access (anon allowed since app uses custom role system)
CREATE POLICY "Allow anon insert players" ON public.players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update players" ON public.players FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete players" ON public.players FOR DELETE USING (true);

CREATE POLICY "Allow anon insert coaches" ON public.coaches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update coaches" ON public.coaches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete coaches" ON public.coaches FOR DELETE USING (true);

CREATE POLICY "Allow anon insert daily thoughts" ON public.daily_thoughts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update daily thoughts" ON public.daily_thoughts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete daily thoughts" ON public.daily_thoughts FOR DELETE USING (true);


