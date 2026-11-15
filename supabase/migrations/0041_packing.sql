-- 0041 — Packing points: opponents bypassed by a completed pass or dribble.
--
-- Two ways in, two shapes, one parent row per fixture (stat_matches):
--
--   * Live, on the touchline: a 'packing' event in stat_events carrying
--     `bypassed`. It is clock-stamped, so it passes through the store's
--     running-clock gate, and it shares the one undo stack.
--
--   * From video, afterwards: a row in packing_tags. Video tags are entered
--     after the fact and in any order, which the stat_events replay does not
--     allow (it orders by when an event was recorded), so they do not go in
--     that log.
--
-- Once a match has any video tag, the reports count the tags and ignore the
-- live taps. That rule lives in src/domain/packing.ts, not here: both kinds of
-- row are kept.
--
-- No data is inserted, so this applies to the empty demo database.

begin;
set role postgres;

-- ─── 1. Live taps ──────────────────────────────────────────────────────────

alter table public.stat_events add column if not exists bypassed smallint;

-- Dropped and recreated: 0024 created these "only if missing", so re-running
-- that guard would leave the old lists in place.
alter table public.stat_events drop constraint if exists stat_events_kind_chk;
alter table public.stat_events add constraint stat_events_kind_chk
  check (kind in (
    'on', 'off',
    'plus', 'minus',
    'shot', 'goal', 'assist',
    'packing',                      -- opponents bypassed; see `bypassed`
    'goal_for', 'goal_against',
    'clock_start', 'clock_stop',
    'period'
  ));

alter table public.stat_events drop constraint if exists stat_events_player_chk;
alter table public.stat_events add constraint stat_events_player_chk
  check (
    (kind in ('goal_for', 'goal_against', 'clock_start', 'clock_stop', 'period')
       and player_id is null)
    or
    (kind in ('on', 'off', 'plus', 'minus', 'shot', 'goal', 'assist', 'packing')
       and player_id is not null)
  );

-- Zero is never stored: a sideways pass is simply not tapped. Eleven, not
-- ten, so a pass that also takes out the keeper is not refused. The explicit
-- `is not null` matters: a NULL count makes the between test NULL, and
-- Postgres lets a NULL check result through.
alter table public.stat_events drop constraint if exists stat_events_bypassed_chk;
alter table public.stat_events add constraint stat_events_bypassed_chk
  check (
    (kind = 'packing' and bypassed is not null and bypassed between 1 and 11)
    or (kind <> 'packing' and bypassed is null)
  );

-- ─── 2. Video tags ─────────────────────────────────────────────────────────

create table if not exists public.packing_tags (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.stat_matches (id) on delete cascade,
  player_id     uuid not null references public.players (id),
  receiver_id   uuid references public.players (id),
  action        text not null,
  bypassed      smallint not null,
  -- Where in the video, for finding the clip again. Nothing is computed from it.
  video_seconds int,
  is_deleted    boolean not null default false,
  created_at    timestamptz not null default now(),

  constraint packing_tags_action_chk check (action in ('pass', 'dribble')),
  constraint packing_tags_bypassed_chk check (bypassed between 1 and 11),
  -- A pass has a receiver who is somebody else; a dribble has none.
  constraint packing_tags_receiver_chk check (
    (action = 'pass' and receiver_id is not null and receiver_id <> player_id)
    or (action = 'dribble' and receiver_id is null)
  ),
  constraint packing_tags_video_chk check (video_seconds is null or video_seconds >= 0)
);

create index if not exists packing_tags_match_idx
  on public.packing_tags (match_id, created_at) where not is_deleted;

-- ─── 3. Access ─────────────────────────────────────────────────────────────
--
-- Coach-only, both ways, through the parent -- exactly as stat_events -- so a
-- tag and its match can never disagree about who may see them.

alter table public.packing_tags enable row level security;

drop policy if exists packing_tags_read  on public.packing_tags;
drop policy if exists packing_tags_write on public.packing_tags;

create policy packing_tags_read on public.packing_tags
  for select using (exists (
    select 1 from public.stat_matches m
     where m.id = packing_tags.match_id and public.is_team_coach(m.team_id)));

create policy packing_tags_write on public.packing_tags
  for all using (exists (
    select 1 from public.stat_matches m
     where m.id = packing_tags.match_id and public.is_team_coach(m.team_id)))
  with check (exists (
    select 1 from public.stat_matches m
     where m.id = packing_tags.match_id and public.is_team_coach(m.team_id)));

grant select, insert, update, delete on public.packing_tags to authenticated;

-- ─── 4. Self-check ─────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.packing_tags') is null then
    raise exception 'packing_tags was not created.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stat_events_bypassed_chk') then
    raise exception 'stat_events_bypassed_chk is missing -- a packing tap could be saved with no count.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'packing_tags_receiver_chk') then
    raise exception 'packing_tags_receiver_chk is missing -- a pass could be saved with no receiver.';
  end if;
  if (select count(*) from pg_policies where tablename = 'packing_tags') <> 2 then
    raise exception 'packing_tags should have exactly two policies.';
  end if;
  raise notice 'Packing is ready.';
end $$;

commit;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- Destructive: drops every video tag, and every live packing tap with it.
--
--   begin;
--   set role postgres;
--   drop table if exists public.packing_tags;
--   delete from public.stat_events where kind = 'packing';
--   alter table public.stat_events drop constraint if exists stat_events_bypassed_chk;
--   alter table public.stat_events drop column if exists bypassed;
--   -- then re-run the constraint block of 0024 by hand, without 'packing'.
--   commit;
