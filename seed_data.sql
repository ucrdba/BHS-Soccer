-- Beaumont High School Cougars Soccer - Database Seed File
-- Run this script in your Supabase SQL Editor after running supabase_schema.sql

-- 1. SEED SCHOOL METADATA
INSERT INTO public.schools (id, name, mascot, city, colors, record)
VALUES (
  'bhs',
  'Beaumont High School',
  'Cougars',
  'Beaumont, CA',
  '{"primary": "#0047AB", "secondary": "#FFFFFF", "navy": "#0A1428"}'::jsonb,
  '{"wins": 9, "losses": 1, "draws": 2}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- 2. SEED VARSITY PLAYERS
INSERT INTO public.players (id, school_id, number, name, position, class_year, height, photo_url, season_stats, ratings, matrix_stats)
VALUES 
(
  'p101', 'bhs', 10, 'Alex Rivera', 'Forward / CAM', 'Senior (2027)', '5''11"',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
  '{"goals": 14, "assists": 8, "games": 12}'::jsonb,
  '{"technical": 92, "tactical": 88, "physical": 85, "mental": 90}'::jsonb,
  '{"wins": 28, "losses": 6, "points": 94, "rank": 1, "drillScore": 92.4}'::jsonb
),
(
  'p102', 'bhs', 7, 'Marcus Vance', 'Winger', 'Junior (2028)', '5''9"',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
  '{"goals": 9, "assists": 11, "games": 12}'::jsonb,
  '{"technical": 89, "tactical": 84, "physical": 91, "mental": 86}'::jsonb,
  '{"wins": 25, "losses": 8, "points": 86, "rank": 2, "drillScore": 89.1}'::jsonb
),
(
  'p103', 'bhs', 4, 'Ethan Thorne', 'Center Back', 'Senior (2027)', '6''2"',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
  '{"goals": 2, "assists": 3, "tackles": 42, "games": 12}'::jsonb,
  '{"technical": 80, "tactical": 92, "physical": 94, "mental": 91}'::jsonb,
  '{"wins": 23, "losses": 9, "points": 81, "rank": 3, "drillScore": 86.5}'::jsonb
),
(
  'p104', 'bhs', 1, 'Mateo Sandoval', 'Goalkeeper', 'Junior (2028)', '6''1"',
  'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80',
  '{"saves": 68, "cleanSheets": 7, "games": 12}'::jsonb,
  '{"technical": 86, "tactical": 89, "physical": 88, "mental": 93}'::jsonb,
  '{"wins": 22, "losses": 10, "points": 79, "rank": 4, "drillScore": 84.8}'::jsonb
),
(
  'p105', 'bhs', 6, 'Lucas Sterling', 'Defensive Mid', 'Sophomore (2029)', '5''10"',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
  '{"goals": 3, "assists": 6, "games": 11}'::jsonb,
  '{"technical": 85, "tactical": 87, "physical": 86, "mental": 85}'::jsonb,
  '{"wins": 20, "losses": 11, "points": 72, "rank": 5, "drillScore": 81.2}'::jsonb
),
(
  'p106', 'bhs', 9, 'Jordan Brooks', 'Striker', 'Senior (2027)', '6''0"',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
  '{"goals": 11, "assists": 2, "games": 12}'::jsonb,
  '{"technical": 87, "tactical": 82, "physical": 88, "mental": 84}'::jsonb,
  '{"wins": 19, "losses": 12, "points": 69, "rank": 6, "drillScore": 79.5}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- 3. SEED MATCH SCHEDULE & FIXTURES
INSERT INTO public.schedule (id, school_id, match_date, match_time, opponent, location, status, is_home, score, result)
VALUES
(
  'm201', 'bhs', 'AUG 12, 2026', '6:30 PM', 'Yucaipa Thunderbirds', 'Home - Cougar Stadium', 'UPCOMING', true, NULL, NULL
),
(
  'm202', 'bhs', 'AUG 18, 2026', '5:00 PM', 'Citrus Valley Blackhawks', 'Away - Redlands, CA', 'UPCOMING', false, NULL, NULL
),
(
  'm203', 'bhs', 'JUL 28, 2026', 'FINAL', 'Redlands East Valley', 'Home - Cougar Stadium', 'COMPLETED', true, '3 - 1', 'WIN'
),
(
  'm204', 'bhs', 'JUL 22, 2026', 'FINAL', 'Palm Springs Indians', 'Away - Palm Springs', 'COMPLETED', false, '2 - 0', 'WIN'
) ON CONFLICT (id) DO NOTHING;

-- 4. SEED DRILLS BANK
INSERT INTO public.drills_bank (id, school_id, name, duration, category, points)
VALUES
('d1', 'bhs', '1v1 Gauntlet (Continuous)', '20 min', 'Competitive Matrix 1v1', 3),
('d2', 'bhs', '2v2 Flying Scrimmage with Bumpers', '25 min', 'Small Sided', 3),
('d3', 'bhs', 'Finishing under High Pressure', '15 min', 'Technical / Shooting', 2),
('d4', 'bhs', '12-Minute Cooper Fitness Test', '15 min', 'Physical Conditioning', 5),
('d5', 'bhs', '7v7 Tactical Match Play', '30 min', 'Full Scrimmage', 3);

-- Seed Initial Practice Plan
INSERT INTO public.practice_plans (school_id, time_slot, name, duration, coach_notes) VALUES
('bhs', '0:00 - 0:15', 'Dynamic Warmup & Rondo (5v2)', '15 min', 'Focus on 1-touch speed & communication'),
('bhs', '0:15 - 0:35', '1v1 Gauntlet (Continuous)', '20 min', 'Log 1v1 win/loss scores into Matrix'),
('bhs', '0:35 - 1:00', '2v2 Flying Scrimmage with Bumpers', '25 min', 'High intensity transition'),
('bhs', '1:00 - 1:25', '7v7 Tactical Match Play', '25 min', 'Applying press triggers'),
('bhs', '1:25 - 1:30', 'Cool Down & Matrix Leaderboard Review', '5 min', 'Announce Competitor of the Day');
