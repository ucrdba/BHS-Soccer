-- 0023 — lineups and lineup cards.
--
-- ── What this adds ────────────────────────────────────────────────────────
--
-- A lineup belongs to a team AND a fixture: the XI for Friday's match is a
-- different thing from the XI for the one after it, and a coach sets it the
-- day before and reopens it at the ground.
--
--   lineups         one row per team per fixture — the formation and notes
--   lineup_players  one row per player in it — starter or bench, and where
--
-- Storing the slot AND the coordinates is deliberate. The slot ("LB", "CM")
-- is what the printed card shows and is stable; x/y is where the player sits
-- on the pitch diagram, which a coach may nudge off the formation's default.
-- Deriving one from the other would lose whichever was nudged.
--
-- ── Conventions this follows ──────────────────────────────────────────────
--
--   set role postgres  — the SQL editor may run as a role that is a MEMBER of
--                        postgres without defaulting to it, and CREATE POLICY
--                        checks ownership rather than privilege (see 0009).
--   add ... if not exists — correct against the live database whether or not
--                        a previous attempt got part way.
--   is_deleted        — soft delete, the repo-wide convention; readers filter.
--
-- Rollback is at the bottom. Nothing here alters an existing table, so this
-- migration is safe to run against a database serving live traffic.

begin;

set role postgres;

-- ─── 1. The lineup ─────────────────────────────────────────────────────────

create table if not exists public.lineups (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id),
  school_id   uuid not null references public.schools (id),
  match_id    uuid references public.schedule (id),
  formation   text not null default '4-4-2',
  notes       text,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One live lineup per fixture. Partial, so a soft-deleted lineup does not
-- block setting a new one for the same match.
create unique index if not exists lineups_team_match_uniq
  on public.lineups (team_id, match_id)
  where not is_deleted and match_id is not null;

-- A team may also keep one lineup with no fixture attached — a default shape
-- to start from. Exactly one, for the same reason.
create unique index if not exists lineups_team_nomatch_uniq
  on public.lineups (team_id)
  where not is_deleted and match_id is null;

create index if not exists lineups_team_idx on public.lineups (team_id);

-- ─── 2. Who is in it ───────────────────────────────────────────────────────

create table if not exists public.lineup_players (
  id          uuid primary key default gen_random_uuid(),
  lineup_id   uuid not null references public.lineups (id) on delete cascade,
  player_id   uuid not null references public.players (id),
  role        text not null default 'starter',
  slot        text,
  x           numeric,
  y           numeric,
  sort_order  int not null default 0,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Nobody is in the XI and on the bench at the same time.
create unique index if not exists lineup_players_uniq
  on public.lineup_players (lineup_id, player_id)
  where not is_deleted;

create index if not exists lineup_players_lineup_idx
  on public.lineup_players (lineup_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lineup_players_role_chk'
  ) then
    alter table public.lineup_players
      add constraint lineup_players_role_chk check (role in ('starter', 'bench'));
  end if;
end $$;

-- ─── 3. Access ─────────────────────────────────────────────────────────────
--
-- Coach-only, both ways. A lineup before kickoff is not public information,
-- unlike the roster and the schedule. Opening reads up later is a one-line
-- policy change; opening them now and retracting it is not.

alter table public.lineups        enable row level security;
alter table public.lineup_players enable row level security;

drop policy if exists lineups_read  on public.lineups;
drop policy if exists lineups_write on public.lineups;

create policy lineups_read on public.lineups
  for select using (public.is_team_coach(team_id));

create policy lineups_write on public.lineups
  for all using (public.is_team_coach(team_id))
         with check (public.is_team_coach(team_id));

drop policy if exists lineup_players_read  on public.lineup_players;
drop policy if exists lineup_players_write on public.lineup_players;

-- Scoped through the parent, so a lineup row and its players can never
-- disagree about who may see them.
create policy lineup_players_read on public.lineup_players
  for select using (exists (
    select 1 from public.lineups l
     where l.id = lineup_players.lineup_id and public.is_team_coach(l.team_id)));

create policy lineup_players_write on public.lineup_players
  for all using (exists (
    select 1 from public.lineups l
     where l.id = lineup_players.lineup_id and public.is_team_coach(l.team_id)))
  with check (exists (
    select 1 from public.lineups l
     where l.id = lineup_players.lineup_id and public.is_team_coach(l.team_id)));

grant select, insert, update, delete on public.lineups        to authenticated;
grant select, insert, update, delete on public.lineup_players to authenticated;

-- ─── 4. Self-check ─────────────────────────────────────────────────────────
--
-- Asserts what was created, and that the helper this depends on still exists.
-- is_team_coach() is what every policy above rests on; if a later migration
-- ever removed it these policies would silently deny everything.

do $$
begin
  if to_regclass('public.lineups') is null then
    raise exception 'lineups was not created.';
  end if;
  if to_regclass('public.lineup_players') is null then
    raise exception 'lineup_players was not created.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_team_coach') then
    raise exception 'is_team_coach() is missing — every policy here depends on it.';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'lineup_players_uniq'
  ) then
    raise exception 'lineup_players_uniq is missing — a player could be starter and bench at once.';
  end if;

  raise notice 'lineups and lineup_players are ready.';
end $$;

commit;

-- Verify — both should come back empty rather than erroring:
--   select count(*) from public.lineups;
--   select count(*) from public.lineup_players;
--
-- And the policies should be listed:
--   select tablename, policyname from pg_policies
--    where tablename in ('lineups', 'lineup_players') order by 1, 2;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- Destructive: this drops the tables and everything saved in them.
--
--   begin;
--   set role postgres;
--   drop table if exists public.lineup_players;
--   drop table if exists public.lineups;
--   commit;
