-- 0017: make the quiz data-driven
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT READS IT. The new quiz renders
-- from these tables, so deploying first would leave every player looking at an
-- empty quiz. The reverse order is safe: this migration only adds columns, a
-- table and rows, and the currently deployed code reads none of them.
--
-- ── What the quiz is today ────────────────────────────────────────────────
--
-- Five questions hardcoded as radio inputs in planner.view.js, with the answer
-- key ('B','A','A','B','C') written into submitQuizAnswer. quiz_questions has
-- existed all along and is EMPTY -- nothing has ever read it. So there is no
-- bank to migrate; the seed at the bottom is the only copy of those questions
-- that exists anywhere, and without it the quiz would go blank on deploy.
--
-- ── The shape ─────────────────────────────────────────────────────────────
--
-- The bank belongs to an ORGANIZATION, like drills_bank: Varsity and JV share
-- Beaumont's questions rather than retyping them, and a club has its own.
-- Which questions a given squad actually asks is a per-TEAM choice, held in
-- team_quiz_questions -- so an under-14 side can switch off a question pitched
-- at seventeen-year-olds without deleting it for everyone.
--
-- That is the same split the planner already uses: shared library, per-team
-- selection.

begin;

set role postgres;

-- ─── The bank belongs to an organization ───────────────────────────────────
-- quiz_questions had NO scoping column at all -- not school_id, not team_id.
-- Nullable: a question with no organization is visible to nobody, which is a
-- better failure than one visible to everybody.

alter table public.quiz_questions
  add column if not exists school_id uuid references public.schools(id) on delete cascade;

create index if not exists quiz_questions_school on public.quiz_questions (school_id)
  where not coalesce(is_deleted, false);

-- ─── Which questions each squad asks ───────────────────────────────────────

create table if not exists public.team_quiz_questions (
  team_id     uuid not null references public.teams(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(question_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (team_id, question_id)
);

create index if not exists team_quiz_questions_team on public.team_quiz_questions (team_id);

-- ─── Attempts are team-scoped too ──────────────────────────────────────────
-- Without this a JV score and a Varsity score sit in one undifferentiated
-- list, which is the thing every other surface stopped doing in 0014.

alter table public.quiz_attempts
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

create index if not exists quiz_attempts_team on public.quiz_attempts (team_id);

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- quiz_questions is already covered by the uniform team-content loop in
-- supabase_migration_auth.sql section 6 (public read, coach/admin write), so it
-- is deliberately not re-policied here. Only the new table needs policies.
--
-- Reads stay public, matching every other table. Writes are gated on
-- is_team_coach(), so a coach can only change their own squads' quiz.

alter table public.team_quiz_questions enable row level security;

drop policy if exists "team_quiz_questions_select" on public.team_quiz_questions;
create policy "team_quiz_questions_select" on public.team_quiz_questions
  for select using (true);

drop policy if exists "team_quiz_questions_write" on public.team_quiz_questions;
create policy "team_quiz_questions_write" on public.team_quiz_questions
  for all using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

grant select, insert, update, delete on table public.team_quiz_questions to anon, authenticated;

-- ─── Seed the five questions that only exist in the code ───────────────────
--
-- Resolved from the public-default team's organization rather than a hardcoded
-- school code, so this is correct for any deployment rather than only for
-- Beaumont.
--
-- Guarded on the bank being empty for that organization: re-running this must
-- not produce a second copy of every question.

do $$
declare
  home_school uuid;
  existing    integer;
begin
  select t.school_id into home_school
    from public.teams t
   where coalesce(t.is_public_default, false)
     and not coalesce(t.is_deleted, false)
   limit 1;

  if home_school is null then
    raise notice 'No public-default team, so the quiz bank was not seeded. Add questions in the admin panel.';
    return;
  end if;

  select count(*) into existing from public.quiz_questions
   where school_id = home_school and not coalesce(is_deleted, false);

  if existing > 0 then
    raise notice 'Quiz bank already has % question(s); seed skipped.', existing;
    return;
  end if;

  insert into public.quiz_questions
    (school_id, question, option_a, option_b, option_c, option_d, correct_option, category, is_deleted)
  values
    (home_school,
     'What is the primary tactical objective emphasized in Coach''s Daily Thoughts?',
     'Drop back into low-block passive defense',
     'High intensity pressing & quick 2-touch passing transitions',
     'Dribble individually without passing options',
     'Long high balls into penalty box only',
     'B', 'Tactical', false),
    (home_school,
     'How should players handle possession under pressure according to today''s focus?',
     'Make the simple, quick pass as first option',
     'Hold the ball until surrounded by defenders',
     'Turn around and kick the ball out of bounds',
     'Stop moving completely and wait for whistle',
     'A', 'Tactical', false),
    (home_school,
     'According to Coach''s Daily Focus, what is faster than any dribble on the pitch?',
     'A passing ball moving twenty yards',
     'Juggling in place',
     'Throw-ins from sideline',
     'Running backwards',
     'A', 'Technical', false),
    (home_school,
     'What is the primary tactical formation for 11v11 matches?',
     '5-4-1 Ultra Defensive Park-the-Bus',
     '4-3-3 High Press / Attack-Minded',
     '2-2-6 All-Out Attack',
     'No tactical formation',
     'B', 'Tactical', false),
    (home_school,
     'What is the minimum practice participation requirement for starting lineup consideration?',
     '25%', '50%', '90%+ Match Readiness & Practice Participation', '10%',
     'C', 'Team Standards', false);

  -- Switch them on for every live team in that organization, so the quiz keeps
  -- working exactly as it does today the moment the code deploys.
  insert into public.team_quiz_questions (team_id, question_id)
  select t.id, q.question_id
    from public.teams t
    join public.quiz_questions q on q.school_id = t.school_id
   where t.school_id = home_school
     and not coalesce(t.is_deleted, false)
     and not coalesce(q.is_deleted, false)
  on conflict do nothing;

  raise notice 'Seeded 5 quiz questions and switched them on for that organization''s teams.';
end $$;

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  has_col integer;
  orphans integer;
begin
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'school_id';
  if has_col <> 1 then raise exception 'quiz_questions.school_id was not created'; end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_attempts' and column_name = 'team_id';
  if has_col <> 1 then raise exception 'quiz_attempts.team_id was not created'; end if;

  if to_regclass('public.team_quiz_questions') is null then
    raise exception 'team_quiz_questions was not created';
  end if;

  -- A question with no organization can never be reached by any team.
  select count(*) into orphans from public.quiz_questions
   where school_id is null and not coalesce(is_deleted, false);
  if orphans > 0 then
    raise notice '% quiz question(s) have no organization and will not appear anywhere. Set school_id on them.', orphans;
  end if;
end $$;

commit;

-- Verify — what each team will ask:
--   select t.name, count(*) as questions
--     from public.team_quiz_questions tq
--     join public.teams t on t.id = tq.team_id
--    group by t.name order by t.name;

-- Rollback:
--   drop table if exists public.team_quiz_questions;
--   alter table public.quiz_attempts  drop column if exists team_id;
--   delete from public.quiz_questions where school_id is not null;  -- the seed
--   alter table public.quiz_questions drop column if exists school_id;
--   -- The five questions also exist in planner.view.js at the commit before
--   -- this change, so nothing is unrecoverable.
