-- 0018: tie quiz questions to the daily message they test
--
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT. The new import and quiz read
-- these columns; the currently deployed code reads none of them, so applying
-- early changes nothing and applying late would drop the link silently.
--
-- ── What this is for ──────────────────────────────────────────────────────
--
-- Three of the seeded questions ask about "Coach's Daily Thoughts" and
-- "today's focus", but nothing connected them to an actual message. Change the
-- message and those questions kept asking about a focus that no longer existed,
-- marking against the old answer.
--
-- A question may now name the message it tests. Questions that name one are
-- asked only while that message is the active one; questions that name none --
-- formation, participation, anything evergreen -- are always asked. So "today's
-- quiz" follows today's focus without the coach rebuilding it.

begin;

set role postgres;

-- ─── A message gets a short name ───────────────────────────────────────────
-- Needed because a question has to reference a message somehow, and the
-- message text itself is a paragraph. A title is what a coach types anyway and
-- what a spreadsheet column can hold: "Week 3 - High Press".
--
-- Nullable: existing messages have none, and one is not required to post.

alter table public.daily_thoughts
  add column if not exists title text;

-- ─── A question may name the message it tests ──────────────────────────────
-- ON DELETE SET NULL, deliberately: retiring a message must not delete the
-- questions written for it. They simply become evergreen and keep being asked,
-- which is a better failure than silently losing a coach's work.

alter table public.quiz_questions
  add column if not exists thought_id uuid references public.daily_thoughts(id) on delete set null;

create index if not exists quiz_questions_thought on public.quiz_questions (thought_id)
  where not coalesce(is_deleted, false);

-- ─── A stable key for re-import ────────────────────────────────────────────
--
-- Questions get reworded. Matching an imported row against an existing question
-- by its TEXT therefore creates a duplicate every time a typo is fixed, which
-- is the common case rather than the rare one. A key the coach controls
-- survives rewording; the uuid primary key cannot, because a spreadsheet has no
-- way to know it.
--
-- Text, not integer: a coach may want "PRESS-01" as readily as "100", and a
-- number here would be a second thing that looks like an id but is not.

alter table public.quiz_questions
  add column if not exists import_key text;

-- Unique per ORGANIZATION, not globally: two clubs may both number from 100
-- without colliding. Partial, so retired questions do not block reusing a key,
-- and so the many rows with no key at all are simply not constrained.
create unique index if not exists quiz_questions_import_key_per_school
  on public.quiz_questions (school_id, import_key)
  where import_key is not null and not coalesce(is_deleted, false);

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  has_col integer;
begin
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'daily_thoughts' and column_name = 'title';
  if has_col <> 1 then raise exception 'daily_thoughts.title was not created'; end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'thought_id';
  if has_col <> 1 then raise exception 'quiz_questions.thought_id was not created'; end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'import_key';
  if has_col <> 1 then raise exception 'quiz_questions.import_key was not created'; end if;

  -- 0017's school_id must still be here: without it a question belongs to no
  -- organization and appears in nobody's quiz.
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'school_id';
  if has_col <> 1 then raise exception 'quiz_questions.school_id is missing; apply 0017 first.'; end if;

  raise notice 'Quiz questions can now name the message they test, and carry an import key.';
end $$;

commit;

-- Verify — nothing is linked yet, which is correct until questions are edited
-- or re-imported:
--   select q.question, t.title
--     from public.quiz_questions q
--     left join public.daily_thoughts t on t.id = q.thought_id
--    where not coalesce(q.is_deleted, false);

-- Rollback:
--   drop index if exists public.quiz_questions_import_key_per_school;
--   alter table public.quiz_questions drop column if exists import_key;
--   alter table public.quiz_questions drop column if exists thought_id;
--   alter table public.daily_thoughts drop column if exists title;
--   -- Nothing else read these, so nothing else breaks.
