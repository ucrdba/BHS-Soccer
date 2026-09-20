-- 0040 — quiz_results stops handing every player's score to the public.
--
-- quiz_attempts itself is protected: its policy admits the player whose row it
-- is, and coaches and admins. quiz_results is a plain VIEW over it, and a
-- plain view runs with its OWNER's rights -- so it does not apply the table's
-- row-level security, and the grant supabase_schema.sql gave anon let a
-- signed-out caller read every attempt: a minor's name, their score and the
-- day they sat it. It answered on production; it was empty only because a bug
-- in the client meant no attempt had ever been saved.
--
-- Two steps, because one of them needs Postgres 15:
--   * the grants come off anon and authenticated, which works on any version;
--   * security_invoker makes the view apply the caller's permissions, and is
--     set where the server supports it -- then authenticated may select again,
--     since quiz_attempts' own policy is what answers.
--
-- The app does not read this view at all: the coach's attempts screen reads
-- quiz_attempts directly and works the percentage out in the browser.

begin;
set role postgres;

do $$
begin
  if to_regclass('public.quiz_results') is null then
    raise notice 'public.quiz_results does not exist; nothing to secure.';
    return;
  end if;

  execute 'revoke all on public.quiz_results from anon, authenticated';

  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.quiz_results set (security_invoker = on)';
    -- Safe now: every row still passes through quiz_attempts_access.
    execute 'grant select on public.quiz_results to authenticated';
  else
    raise notice 'security_invoker needs Postgres 15; quiz_results is left readable by service_role only.';
  end if;
end $$;

commit;
