-- 0007: assign coaches to the Legends FC teams
--
-- U14 Boys and U16 Boys were created without any coach. Writes to a team are
-- gated by public.is_team_coach(), so an unassigned team is one whose roster
-- literally nobody can edit -- not even the admin who created it, unless they
-- are also listed here.
--
-- EDIT THE EMAIL LIST BELOW before running. Each email must already have a
-- public.profiles row with role 'coach' or 'admin' and status 'active';
-- is_team_coach() ignores anyone who does not.
--
-- The admin panel does the same thing under Teams & Coach Assignments and does
-- not need SQL. This file exists for doing it in bulk, or from the SQL editor.

begin;

create temporary table wanted_coaches (email text primary key) on commit drop;

insert into wanted_coaches (email) values
  ('ucrdba@gmail.com')
  -- , ('second.coach@example.com')
;

-- Resolve emails to profiles, and refuse the whole migration if any of them
-- fails to resolve. A silent zero-row insert reads exactly like success and
-- would leave the teams uneditable -- the failure this file exists to fix.
do $$
declare
  missing text;
begin
  select string_agg(w.email, ', ') into missing
  from wanted_coaches w
  left join public.profiles p
    on lower(p.email) = lower(w.email)
   and p.role in ('coach', 'admin')
   and p.status = 'active'
   and not coalesce(p.is_deleted, false)
  where p.id is null;

  if missing is not null then
    raise exception
      'No active coach/admin profile for: %. Every listed email needs a profiles row with role coach or admin and status active.', missing;
  end if;
end $$;

insert into public.team_coaches (team_id, profile_id)
select t.id, p.id
from public.teams t
join public.schools s on s.id = t.school_id
join wanted_coaches w on true
join public.profiles p
  on lower(p.email) = lower(w.email)
 and p.role in ('coach', 'admin')
 and p.status = 'active'
where s.code = 'lfc'
  and not coalesce(t.is_deleted, false)
on conflict (team_id, profile_id) do nothing;

commit;

-- Verify:
--   select s.name as organization, t.name as team, p.email, p.role
--   from public.team_coaches tc
--   join public.teams t    on t.id = tc.team_id
--   join public.schools s  on s.id = t.school_id
--   join public.profiles p on p.id = tc.profile_id
--   where s.code = 'lfc'
--   order by t.name, p.email;

-- Rollback (removes only what this added, for the emails listed above):
--   delete from public.team_coaches tc
--   using public.teams t, public.schools s, public.profiles p
--   where tc.team_id = t.id and t.school_id = s.id and tc.profile_id = p.id
--     and s.code = 'lfc'
--     and lower(p.email) in ('ucrdba@gmail.com');
