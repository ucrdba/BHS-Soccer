-- 0019: answers become rows, and a message gets a coach-controlled number
--
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT. Additive only: the option_a..d
-- columns stay, so currently deployed code keeps working and can be rolled back
-- to. A later migration drops them once nothing reads them -- the same split
-- used for 0014/0015, which exists so there is never a window where deployed
-- code queries a column that is gone.
--
-- ── Two changes, both asked for ───────────────────────────────────────────
--
-- 1. A quiz sheet identifies its daily message by a NUMBER the coach controls
--    ("id"), not by title. Both sheets carry it: the thoughts sheet says
--    1 = Speed of Play, and every question of that message carries 1.
--
-- 2. The four options stop being four columns and become rows. That is what
--    lets a question have three options, or six, instead of exactly four.

begin;

set role postgres;

-- ─── A message the spreadsheet can name by number ──────────────────────────
-- Text, not integer: a coach may number "1" or "W3-01", and an integer column
-- would reject the second without warning.

alter table public.daily_thoughts
  add column if not exists import_key text;

-- Unique per TEAM, not globally: Varsity's message 1 and JV's message 1 are
-- different messages. Partial, so retired messages do not block reusing a
-- number, and untitled ones are simply unconstrained.
create unique index if not exists daily_thoughts_import_key_per_team
  on public.daily_thoughts (team_id, import_key)
  where import_key is not null and not coalesce(is_deleted, false);

-- ─── Answers as rows ───────────────────────────────────────────────────────
--
-- `letter` is kept rather than derived from ordinal because the sheet, the
-- marking and every attempt already recorded speak in A/B/C/D --
-- player_answers.selected_option stores exactly that. Deriving it would mean
-- rewriting history to match a new convention.

create table if not exists public.quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(question_id) on delete cascade,
  letter      text not null,
  answer_text text not null,
  is_correct  boolean not null default false,
  ordinal     integer not null default 0,
  is_deleted  boolean default false,
  created_at  timestamptz not null default now()
);

create index if not exists quiz_answers_question on public.quiz_answers (question_id)
  where not coalesce(is_deleted, false);

-- One row per letter per question. Without this a re-import could add a second
-- "B" and the quiz would render two of them.
create unique index if not exists quiz_answers_letter_per_question
  on public.quiz_answers (question_id, letter)
  where not coalesce(is_deleted, false);

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Public read like every other table; writes for a coach or admin, matching
-- quiz_questions, whose policies come from the uniform loop in
-- supabase_migration_auth.sql section 6.

alter table public.quiz_answers enable row level security;

drop policy if exists "quiz_answers_select" on public.quiz_answers;
create policy "quiz_answers_select" on public.quiz_answers
  for select using (true);

drop policy if exists "quiz_answers_write" on public.quiz_answers;
create policy "quiz_answers_write" on public.quiz_answers
  for all
  using (public.current_profile_role() in ('coach', 'admin'))
  with check (public.current_profile_role() in ('coach', 'admin'));

grant select, insert, update, delete on table public.quiz_answers to anon, authenticated;

-- ─── Move the existing options into rows ───────────────────────────────────
-- Guarded on the table being empty, so re-running cannot double every answer.
-- A blank option is skipped rather than stored as an empty choice.

do $$
declare
  moved integer;
begin
  if exists (select 1 from public.quiz_answers limit 1) then
    raise notice 'quiz_answers already holds rows; the backfill was skipped.';
    return;
  end if;

  insert into public.quiz_answers (question_id, letter, answer_text, is_correct, ordinal)
  select q.question_id, v.letter, v.txt, upper(coalesce(q.correct_option, '')) = v.letter, v.ord
    from public.quiz_questions q
    cross join lateral (values
      ('A', q.option_a, 1),
      ('B', q.option_b, 2),
      ('C', q.option_c, 3),
      ('D', q.option_d, 4)
    ) as v(letter, txt, ord)
   where not coalesce(q.is_deleted, false)
     and coalesce(trim(v.txt), '') <> '';

  get diagnostics moved = row_count;
  raise notice 'Moved % option(s) into quiz_answers.', moved;
end $$;

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  n        integer;
  no_right integer;
begin
  if to_regclass('public.quiz_answers') is null then
    raise exception 'quiz_answers was not created';
  end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'daily_thoughts' and column_name = 'import_key';
  if n <> 1 then raise exception 'daily_thoughts.import_key was not created'; end if;

  -- option_a must SURVIVE: deployed code still reads it until the follow-up
  -- migration drops it.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'option_a';
  if n <> 1 then
    raise exception 'option_a was dropped by 0019; deployed code still reads it. That belongs in the follow-up.';
  end if;

  -- Every live question should now own exactly one correct answer. Zero means
  -- correct_option named a letter whose option was blank, and the question
  -- would be unanswerable.
  select count(*) into no_right
    from public.quiz_questions q
   where not coalesce(q.is_deleted, false)
     and not exists (
       select 1 from public.quiz_answers a
        where a.question_id = q.question_id
          and a.is_correct
          and not coalesce(a.is_deleted, false));
  if no_right > 0 then
    raise notice '% question(s) have no correct answer among their options. Fix them in the admin panel.', no_right;
  end if;
end $$;

commit;

-- Verify — each question with its options, correct one first:
--   select q.question, a.letter, a.answer_text, a.is_correct
--     from public.quiz_questions q
--     join public.quiz_answers a on a.question_id = q.question_id
--    where not coalesce(q.is_deleted, false)
--    order by q.created_at, a.ordinal;

-- Rollback:
--   drop table if exists public.quiz_answers;
--   drop index if exists public.daily_thoughts_import_key_per_team;
--   alter table public.daily_thoughts drop column if exists import_key;
--   -- option_a..d were never modified, so the questions are untouched.
