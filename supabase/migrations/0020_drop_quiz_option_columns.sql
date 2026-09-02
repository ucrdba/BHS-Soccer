-- 0020: drop option_a..d from quiz_questions
--
-- APPLY ONLY AFTER THE CODE THAT STOPPED USING THEM IS LIVE. This is the
-- reverse of the usual order here, and deliberately so: until that deploy,
-- running code both writes and reads these columns, and dropping them would
-- break every quiz save immediately.
--
-- Same split as 0014/0015 and 0019: the previous migration added the
-- replacement and left the old columns in place, the code moved across, and
-- only now do the columns go. There is never a window where deployed code
-- queries something that is gone.
--
-- Delaying this indefinitely is harmless. The only cost of keeping them is
-- four redundant columns that nothing reads.

begin;

set role postgres;

-- ─── Refuse if the options never moved ─────────────────────────────────────
-- Dropping these while a live question still has no answer rows would leave it
-- with no options at all, unanswerable and unfixable -- the text of its choices
-- would be gone.

do $$
declare
  stranded integer;
begin
  select count(*) into stranded
    from public.quiz_questions q
   where not coalesce(q.is_deleted, false)
     and not exists (
       select 1 from public.quiz_answers a
        where a.question_id = q.question_id
          and not coalesce(a.is_deleted, false));

  if stranded > 0 then
    raise exception
      '% live question(s) have no answer rows. Their options exist only in the columns this migration drops. Apply 0019 first, or fix them in the admin panel.', stranded;
  end if;
end $$;

-- ─── Drop them ─────────────────────────────────────────────────────────────
-- correct_option STAYS: player_answers.selected_option records A/B/C/D and the
-- marking compares against that letter, so it is still the question's answer
-- key. Only the four text columns move to rows.

alter table public.quiz_questions drop column if exists option_a;
alter table public.quiz_questions drop column if exists option_b;
alter table public.quiz_questions drop column if exists option_c;
alter table public.quiz_questions drop column if exists option_d;

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  n integer;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions'
     and column_name in ('option_a', 'option_b', 'option_c', 'option_d');
  if n <> 0 then raise exception 'option columns survived the drop'; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'correct_option';
  if n <> 1 then
    raise exception 'correct_option was dropped; the marking and every recorded answer depend on it.';
  end if;

  select count(*) into n from public.quiz_answers where not coalesce(is_deleted, false);
  raise notice 'Option columns dropped. % answer row(s) now hold every question''s choices.', n;
end $$;

commit;

-- Verify — each question with its options:
--   select q.question, a.letter, a.answer_text, a.is_correct
--     from public.quiz_questions q
--     join public.quiz_answers a on a.question_id = q.question_id
--    where not coalesce(q.is_deleted, false)
--    order by q.created_at, a.ordinal;

-- Rollback — restores the columns and refills them from the rows, so nothing
-- is lost. Only the first four options per question fit, which is exactly the
-- limitation the answers table removed:
--   alter table public.quiz_questions
--     add column option_a text, add column option_b text,
--     add column option_c text, add column option_d text;
--   update public.quiz_questions q set
--     option_a = (select answer_text from public.quiz_answers where question_id = q.question_id and letter = 'A'),
--     option_b = (select answer_text from public.quiz_answers where question_id = q.question_id and letter = 'B'),
--     option_c = (select answer_text from public.quiz_answers where question_id = q.question_id and letter = 'C'),
--     option_d = (select answer_text from public.quiz_answers where question_id = q.question_id and letter = 'D');
