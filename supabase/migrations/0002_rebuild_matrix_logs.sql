-- supabase/migrations/0002_rebuild_matrix_logs.sql
--
-- The original matrix_logs recorded only a winner and a points value. It could
-- not express a loser (so W-L was underivable) or a draw (a 1v1 played to a
-- time limit can end 0-0). Rebuilt with symmetric participants plus an outcome.
--
-- Points are NOT stored. They are derived from `outcome` in matrix_standings
-- (win 3, draw 1, loss 0) so a stored value can never contradict the result.
--
-- Safe to drop: the table has 0 rows. Verify before running:
--   select count(*) from public.matrix_logs;   -- expect 0
--
-- Rollback: restore the original definition from supabase_schema.sql section 7.

drop table if exists public.matrix_logs cascade;

create table public.matrix_logs (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id)     on delete cascade,
  -- set null, not cascade: retiring a drill must not erase the match history
  -- played under it.
  drill_id     uuid          references public.drills_bank(id) on delete set null,
  player_a_id  uuid not null references public.players(id)     on delete cascade,
  player_b_id  uuid not null references public.players(id)     on delete cascade,
  -- text-with-check rather than an enum: Postgres enums are painful to alter,
  -- and adding a 2v2 or fitness outcome later should be a one-line change.
  outcome      text not null check (outcome in ('a','b','draw')),
  score_text   text,
  occurred_on  date not null default current_date,
  logged_by    uuid references public.profiles(id) on delete set null,
  is_deleted   boolean default false,
  created_at   timestamptz default now(),
  check (player_a_id <> player_b_id)
);

create index if not exists matrix_logs_school_idx on public.matrix_logs (school_id);
create index if not exists matrix_logs_a_idx      on public.matrix_logs (player_a_id);
create index if not exists matrix_logs_b_idx      on public.matrix_logs (player_b_id);

-- `drop table ... cascade` removes the policies with the table, so re-apply
-- them: public read of live rows, coach/admin write. This mirrors the uniform
-- policy loop in supabase_migration_auth.sql section 6.
alter table public.matrix_logs enable row level security;

drop policy if exists "matrix_logs_select" on public.matrix_logs;
create policy "matrix_logs_select" on public.matrix_logs
  for select using (coalesce(is_deleted, false) = false);

drop policy if exists "matrix_logs_write" on public.matrix_logs;
create policy "matrix_logs_write" on public.matrix_logs
  for all
  using (public.current_profile_role() in ('coach','admin'))
  with check (public.current_profile_role() in ('coach','admin'));

grant select on table public.matrix_logs to anon, authenticated;
grant insert, update, delete on table public.matrix_logs to authenticated;
