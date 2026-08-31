-- 0006: move the two club-age teams out of Beaumont High School
--
-- U14 Boys and U16 Boys were created through the admin panel while the
-- Organization picker still sat on its first entry, so both were filed under
-- Beaumont High School (a school) rather than Legends FC (a club).
--
-- This matters beyond tidiness. team_players_one_team_per_school allows a
-- player one team per organization, which is what lets someone play for their
-- school AND a club at once. With U14/U16 inside Beaumont, a Beaumont player
-- could not be on both Varsity and U14 -- the exact overlap the team model
-- exists to permit.
--
-- Safe as a bare update: verified before writing that both teams have zero
-- team_players and zero team_coaches rows, so nothing references them by the
-- composite foreign key team_players (team_id, school_id) -> teams (id,
-- school_id). Had either carried a roster, its memberships' school_id would
-- have needed updating in the same transaction.

begin;

-- Guard: refuse to run if either team has picked up dependants since this was
-- written. A silent partial move would leave memberships pointing at an
-- organization their team no longer belongs to.
do $$
declare
  dependants integer;
begin
  select count(*) into dependants
  from (
    select team_id from public.team_players
    where team_id in ('170b1cb4-b57a-4686-814d-be5970643f63',
                      '18c4d4b8-0c0b-413d-ab16-77f027261009')
    union all
    select team_id from public.team_coaches
    where team_id in ('170b1cb4-b57a-4686-814d-be5970643f63',
                      '18c4d4b8-0c0b-413d-ab16-77f027261009')
  ) d;

  if dependants > 0 then
    raise exception
      'U14/U16 now have % dependent rows. Move their team_players.school_id in the same transaction before rerunning.', dependants;
  end if;
end $$;

update public.teams
set school_id = (select id from public.schools where code = 'lfc')
where id in ('170b1cb4-b57a-4686-814d-be5970643f63',   -- U14 Boys
             '18c4d4b8-0c0b-413d-ab16-77f027261009');  -- U16 Boys

commit;

-- Verify: both teams should now report Legends FC.
--   select t.name, s.name as organization, s.kind
--   from public.teams t join public.schools s on s.id = t.school_id
--   order by s.name, t.name;

-- Rollback:
--   update public.teams
--   set school_id = (select id from public.schools where code = 'bhs')
--   where id in ('170b1cb4-b57a-4686-814d-be5970643f63',
--                '18c4d4b8-0c0b-413d-ab16-77f027261009');
