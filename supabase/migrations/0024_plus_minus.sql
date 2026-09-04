-- 0024 — plus/minus match tracking.
--
-- ── The shape, and why ────────────────────────────────────────────────────
--
--   stat_matches   one row per match being tracked
--   stat_events    an APPEND-ONLY log of everything that happened
--
-- There is deliberately NO table of per-player totals. Every figure the app
-- shows — plus, minus, goal differential, minutes played, shots, goals,
-- assists — is derived by replaying the events.
--
-- That choice is the whole design:
--
--   * Undo is free. A statistician on a touchline WILL mis-tap, and undoing a
--     stored counter means guessing what it was before.
--   * Playing time is exact. Derived from substitution events against the
--     clock, rather than a counter ticking in a browser tab that may be
--     backgrounded, throttled or closed.
--   * Goal differential follows corrections. It is computed from who was on
--     the pitch at that clock time, so fixing a mis-timed substitution fixes
--     every goal affected by it.
--   * Two devices tracking the same match converge, because appending is
--     commutative in a way that incrementing is not.
--
-- The cost is that reading a match means reading its events. A match is a few
-- hundred rows, which is nothing.
--
-- ── Conventions ───────────────────────────────────────────────────────────
--
--   set role postgres      the SQL editor may run as a MEMBER of postgres
--                          without defaulting to it (see 0009)
--   add ... if not exists  correct against the live database either way
--   is_deleted             soft delete, as everywhere else
--
-- Rollback is at the bottom. Nothing here alters an existing table.

begin;

set role postgres;

-- ─── 1. The match ──────────────────────────────────────────────────────────

create table if not exists public.stat_matches (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id),
  school_id   uuid not null references public.schools (id),
  match_id    uuid references public.schedule (id),
  label       text,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One live tracking session per fixture. Partial, so a soft-deleted one does
-- not block starting again.
create unique index if not exists stat_matches_fixture_uniq
  on public.stat_matches (team_id, match_id)
  where not is_deleted and match_id is not null;

create index if not exists stat_matches_team_idx
  on public.stat_matches (team_id) where not is_deleted;

-- ─── 2. What happened ──────────────────────────────────────────────────────
--
-- `at_seconds` is the MATCH clock, not wall time: it is what minutes played
-- and goal differential are computed against, and it must not move when the
-- clock is paused. created_at is kept separately so events can be ordered
-- when two share a clock second.

create table if not exists public.stat_events (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.stat_matches (id) on delete cascade,
  player_id   uuid references public.players (id),
  kind        text not null,
  at_seconds  int not null default 0,
  period      int not null default 1,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists stat_events_match_idx
  on public.stat_events (match_id, created_at) where not is_deleted;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stat_events_kind_chk') then
    alter table public.stat_events add constraint stat_events_kind_chk
      check (kind in (
        'on', 'off',                    -- a player enters or leaves the pitch
        'plus', 'minus',                -- the statistician's judgement
        'shot', 'goal', 'assist',       -- attributed to a player
        'goal_for', 'goal_against',     -- a team goal; differential follows
        'clock_start', 'clock_stop',    -- what makes playing time exact
        'period'                        -- half time, and beyond
      ));
  end if;

  -- A team event has no player; a player event must name one. Enforced here
  -- rather than trusted, because a goal with no scorer and a shot with no
  -- taker are both silently wrong rather than loudly broken.
  if not exists (select 1 from pg_constraint where conname = 'stat_events_player_chk') then
    alter table public.stat_events add constraint stat_events_player_chk
      check (
        (kind in ('goal_for', 'goal_against', 'clock_start', 'clock_stop', 'period')
           and player_id is null)
        or
        (kind in ('on', 'off', 'plus', 'minus', 'shot', 'goal', 'assist')
           and player_id is not null)
      );
  end if;

  -- The clock cannot run backwards.
  if not exists (select 1 from pg_constraint where conname = 'stat_events_clock_chk') then
    alter table public.stat_events add constraint stat_events_clock_chk
      check (at_seconds >= 0);
  end if;
end $$;

-- ─── 3. Access ─────────────────────────────────────────────────────────────
--
-- Coach-only, both ways, scoped through is_team_coach(). A statistician needs
-- a coach account on the team, which is the same rule every other write
-- surface uses.

alter table public.stat_matches enable row level security;
alter table public.stat_events  enable row level security;

drop policy if exists stat_matches_read  on public.stat_matches;
drop policy if exists stat_matches_write on public.stat_matches;

create policy stat_matches_read on public.stat_matches
  for select using (public.is_team_coach(team_id));

create policy stat_matches_write on public.stat_matches
  for all using (public.is_team_coach(team_id))
         with check (public.is_team_coach(team_id));

drop policy if exists stat_events_read  on public.stat_events;
drop policy if exists stat_events_write on public.stat_events;

-- Scoped through the parent, so an event and its match can never disagree
-- about who may see them.
create policy stat_events_read on public.stat_events
  for select using (exists (
    select 1 from public.stat_matches m
     where m.id = stat_events.match_id and public.is_team_coach(m.team_id)));

create policy stat_events_write on public.stat_events
  for all using (exists (
    select 1 from public.stat_matches m
     where m.id = stat_events.match_id and public.is_team_coach(m.team_id)))
  with check (exists (
    select 1 from public.stat_matches m
     where m.id = stat_events.match_id and public.is_team_coach(m.team_id)));

grant select, insert, update, delete on public.stat_matches to authenticated;
grant select, insert, update, delete on public.stat_events  to authenticated;

-- ─── 4. Self-check ─────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.stat_matches') is null then
    raise exception 'stat_matches was not created.';
  end if;
  if to_regclass('public.stat_events') is null then
    raise exception 'stat_events was not created.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_team_coach') then
    raise exception 'is_team_coach() is missing — every policy here depends on it.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stat_events_player_chk') then
    raise exception 'stat_events_player_chk is missing — a goal could be saved with no scorer.';
  end if;

  raise notice 'stat_matches and stat_events are ready.';
end $$;

commit;

-- Verify — both should return 0 rather than erroring:
--   select count(*) from public.stat_matches;
--   select count(*) from public.stat_events;
--
-- And the policies should be listed:
--   select tablename, policyname from pg_policies
--    where tablename in ('stat_matches', 'stat_events') order by 1, 2;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- Destructive: drops every tracked match and its events.
--
--   begin;
--   set role postgres;
--   drop table if exists public.stat_events;
--   drop table if exists public.stat_matches;
--   commit;
