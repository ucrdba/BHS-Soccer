-- Merge the accidental "Jr Varsity" squad back into "JV".
--
-- ── What happened ─────────────────────────────────────────────────────────
--
-- The JV roster sheet had "Jr Varsity" in its Team column. The importer routes
-- a row by that column, and when the name matches no existing team it CREATES
-- one. The squad in the app is called "JV", so the two never matched and a
-- second, parallel squad appeared:
--
--   JV          0 players, 2 schedule rows, 2 matrix_logs
--   Jr Varsity  25 players, nothing else
--
-- Nothing landed on Varsity. Verified read-only against the live database
-- before writing this: none of the 26 sheet names appear on the Varsity roster.
--
-- ── Which one survives ────────────────────────────────────────────────────
--
-- JV survives, because it carries the schedule and match history. Only the
-- memberships move; the people themselves are untouched, so nobody loses any
-- recorded result.
--
-- Moving team_id within the same organization is safe against both rules on
-- team_players: unique (school_id, player_id) is unaffected because neither
-- column changes, and the composite foreign key to teams (id, school_id) holds
-- because both squads belong to the same school.
--
-- The Jr Varsity team row is soft-deleted, matching the repo convention, so
-- the rollback at the bottom reverses this completely.

begin;

set role postgres;

-- ─── 0. Refuse to run against anything but the expected shape ─────────────
-- Both ids are pinned. If a later import has already changed the picture this
-- aborts rather than moving rows that were not part of the mistake.

do $$
declare
  jv    uuid := '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';  -- JV
  jrv   uuid := '4b07e30f-75b8-40b0-97eb-3b7cf5d99e80';  -- Jr Varsity
  n_jrv int;
  n_jv  int;
begin
  if (select school_id from public.teams where id = jv)
     is distinct from
     (select school_id from public.teams where id = jrv) then
    raise exception 'JV and Jr Varsity are not in the same organization -- stopping.';
  end if;

  select count(*) into n_jrv from public.team_players
   where team_id = jrv and not coalesce(is_deleted, false);
  select count(*) into n_jv  from public.team_players
   where team_id = jv  and not coalesce(is_deleted, false);

  if n_jv <> 0 then
    raise exception 'JV already has % live memberships -- merging would need a duplicate check first.', n_jv;
  end if;
  if n_jrv = 0 then
    raise exception 'Jr Varsity has no live memberships -- nothing to merge.';
  end if;

  raise notice 'Moving % memberships from Jr Varsity to JV.', n_jrv;
end $$;

-- ─── 1. Move the squad ────────────────────────────────────────────────────

update public.team_players
   set team_id = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b'
 where team_id = '4b07e30f-75b8-40b0-97eb-3b7cf5d99e80'
   and not coalesce(is_deleted, false);

-- ─── 2. Retire the duplicate squad ────────────────────────────────────────
-- Soft delete: readers filter on is_deleted, so it stops appearing in the team
-- picker while remaining recoverable.

update public.teams
   set is_deleted = true
 where id = '4b07e30f-75b8-40b0-97eb-3b7cf5d99e80';

-- ─── 3. Self-check ────────────────────────────────────────────────────────

do $$
declare n_jv int; n_jrv int;
begin
  select count(*) into n_jv from public.team_players
   where team_id = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b'
     and not coalesce(is_deleted, false);
  select count(*) into n_jrv from public.team_players
   where team_id = '4b07e30f-75b8-40b0-97eb-3b7cf5d99e80'
     and not coalesce(is_deleted, false);

  if n_jv = 0 then raise exception 'JV is still empty -- the move did not happen.'; end if;
  if n_jrv <> 0 then raise exception 'Jr Varsity still has % live memberships.', n_jrv; end if;

  raise notice 'Done: JV now has % players, Jr Varsity has none.', n_jv;
end $$;

commit;

-- Verify — JV should list the 25 players and Jr Varsity should be gone from
-- the picker:
--   select t.name, count(*) from public.team_players tp
--     join public.teams t on t.id = tp.team_id
--    where not coalesce(tp.is_deleted, false)
--    group by t.name order by t.name;

-- Rollback:
--   update public.teams set is_deleted = false
--    where id = '4b07e30f-75b8-40b0-97eb-3b7cf5d99e80';
--   update public.team_players
--      set team_id = '4b07e30f-75b8-40b0-97eb-3b7cf5d99e80'
--    where team_id = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b'
--      and created_at::date = date '2026-09-02';
