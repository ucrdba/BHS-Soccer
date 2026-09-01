-- 0013: let sign-up work with email confirmation switched off
--
-- APPLY THIS FIRST, THEN turn off "Confirm email" in
-- Authentication → Providers → Email. In that order: applying this while
-- confirmation is still ON changes nothing, so there is no window where
-- sign-up is broken. Doing it the other way round leaves every player who
-- registers in between stranded, for the reason below.
--
-- ── Why this is needed ────────────────────────────────────────────────────
--
-- The sign-up flow is split across two triggers:
--
--   handle_new_user        on INSERT into auth.users
--                          creates the profile as 'pending_verification'
--   handle_user_confirmed  on UPDATE of email_confirmed_at
--                          moves it to 'pending_approval' (or 'active' for a
--                          guest, who needs no approval)
--
-- With confirmation switched off, GoTrue sets email_confirmed_at AT INSERT.
-- There is no update, so handle_user_confirmed NEVER FIRES and every new
-- player stays at 'pending_verification' forever.
--
-- That failure is silent and total. fetchPendingApprovals queries
-- `.eq('status', 'pending_approval')` (src/data/supabase.ts), so those players
-- would not even appear in the coach's queue to be rescued. Sign-up would look
-- exactly as broken as it did before, with no error anywhere.
--
-- ── What this changes ─────────────────────────────────────────────────────
--
-- handle_new_user now looks at whether the user it has been handed is ALREADY
-- confirmed, and if so applies the same rules handle_user_confirmed would
-- have. The two-step path is untouched: with confirmation on, new.email_
-- confirmed_at is null at insert, the function behaves exactly as before, and
-- handle_user_confirmed still does the second step. So this is safe to apply
-- now and safe to leave in place if you switch confirmation back on.
--
-- The status rules are deliberately duplicated from handle_user_confirmed
-- rather than factored out: they are four lines, and a shared helper called
-- from a trigger on auth.users adds a dependency between two SECURITY DEFINER
-- functions for no real gain. If those rules change, change both -- the
-- comment in each points at the other.

begin;

set role postgres;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_school_id uuid;
  requested text;
  already_confirmed boolean;
  new_status text;
  new_role text;
begin
  select id into resolved_school_id from public.schools where code = 'bhs' limit 1;
  requested := coalesce(new.raw_user_meta_data ->> 'requested_role', 'guest');

  -- True when "Confirm email" is off: GoTrue stamps email_confirmed_at at
  -- insert, so there will be no later UPDATE for handle_user_confirmed to see.
  already_confirmed := new.email_confirmed_at is not null;

  if already_confirmed then
    -- Same rules as handle_user_confirmed. Keep the two in step.
    new_status := case when requested = 'guest' or requested is null
                       then 'active' else 'pending_approval' end;
    new_role   := 'guest';
  else
    new_status := 'pending_verification';
    new_role   := 'guest';
  end if;

  insert into public.profiles (id, school_id, name, email, role, requested_role, status, email_verified, team_level)
  values (
    new.id,
    resolved_school_id,
    coalesce(new.raw_user_meta_data ->> 'name', 'Team User'),
    new.email,
    new_role,
    requested,
    new_status,
    already_confirmed,
    case requested
      when 'coach' then 'Boys Varsity Staff'
      when 'player' then 'Boys Varsity Player'
      else 'Fan / Public'
    end
  );
  return new;
end;
$$;

-- ── Rescue anyone already stranded ────────────────────────────────────────
-- If confirmation was switched off before this ran, or a player confirmed
-- during one of the broken windows earlier, they are sitting at
-- pending_verification with a confirmed address and no way to be approved.
-- Move them to the queue rather than leaving them to re-register.

update public.profiles p
   set status = case when p.requested_role = 'guest' or p.requested_role is null
                     then 'active' else 'pending_approval' end,
       email_verified = true
  from auth.users u
 where u.id = p.id
   and p.status = 'pending_verification'
   and u.email_confirmed_at is not null;

commit;

-- ── Then, in the dashboard ────────────────────────────────────────────────
--
--   Authentication → Providers → Email → turn OFF "Confirm email"
--
-- After that a player registers and is in the coach's approval queue
-- immediately. No email is sent at all, so there is nothing to expire, nothing
-- for a school mail scanner to consume, and no hourly send limit.
--
-- What you give up: any guarantee the address is real. Given a coach approves
-- every account by name before it can see anything, that guarantee was always
-- weak -- you are vouching for the person, not the mailbox. The sign-up form
-- now catches likely typos client-side, which covers the practical harm (a
-- player who can never reset their password).
--
-- Password resets still send email and still work; they are unaffected by the
-- Confirm-email toggle.

-- Verify — a fresh sign-up should land here directly:
--   select email, role, requested_role, status, email_verified
--   from public.profiles order by created_at desc limit 5;

-- Rollback:
--   Turn "Confirm email" back ON, then restore the original function from
--   supabase_migration_auth.sql (section 4, handle_new_user). Leaving THIS
--   version in place with confirmation on is also fine and is the safer
--   default: the already_confirmed branch simply never runs.
