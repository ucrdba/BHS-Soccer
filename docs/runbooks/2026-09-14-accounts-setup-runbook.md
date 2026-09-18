# Accounts: setup and rollout

Spec: `docs/superpowers/specs/2026-09-14-account-invitations-design.md`.
Do these in order.

## 1. Connect a mail provider

Supabase's built-in mailer sends a handful of emails an hour, and only to your
own project team's addresses. Confirmation and reset links will not reach
anyone else until this is done.

1. Create an account with a provider — Resend or Postmark both have free tiers.
2. Verify a sending domain you control (add the DNS records the provider
   gives you). A `vercel.app` address cannot be used.
3. Create an SMTP credential in the provider. Check the provider's own SMTP
   page for the current values; at the time of writing:
   - **Resend:** host `smtp.resend.com`, port `465`, username `resend`, password = an API key.
   - **Postmark:** host `smtp.postmarkapp.com`, port `587`, username and password = the server API token.
4. Supabase → Authentication → **SMTP Settings** → enable custom SMTP, enter the
   values, and set the sender to an address on the verified domain.
5. Supabase → Authentication → **URL Configuration**: Site URL = the production
   site. Redirect URLs include the production site, the demo site and
   `http://localhost:3000`.
6. Leave **Authentication → Providers → Email → Confirm email ON.** An
   invitation is only safe because of it: with it off, accounts arrive already
   confirmed, invitations are redeemed at sign-up, and anyone who knows an
   invited address can take that place.

## 2. Prove delivery on the current site

Register on the production site, as it is today, with an address you own that
is **not** a Supabase team member. The confirmation email arrives within a
minute.

If it does not arrive, stop: check the provider's activity log and Supabase →
Logs → Auth before going further.

## 3. Before applying

Check each of these in **the production project** first.

a. **Authentication → Providers: only Email is enabled.** Any external provider
   (Google, Apple, …) creates users that arrive already confirmed, and an
   account that arrives confirmed has its invitations redeemed at insert —
   without anyone having proved the address.

b. The confirmation trigger clears the password typed at sign-up (see
   `handle_user_confirmed` in the migration), which needs `postgres` to be able
   to update `auth.users`:

   ```sql
   select has_table_privilege('postgres', 'auth.users', 'UPDATE');   -- true
   ```

   If this is false, stop: confirmations would fail.

c. The profile guard trusts every `SECURITY DEFINER` function, because those
   write as their owner. Review the ones that update profiles, and make sure
   each checks its caller:

   ```sql
   select proname from pg_proc
    where prosecdef and pronamespace = 'public'::regnamespace
      and prosrc ilike '%update%profiles%'
    order by 1;
   ```

d. See what the approval queue will show once the new client is live:

   ```sql
   select requested_role, count(*) from public.profiles
    where status = 'pending_approval' group by 1;
   ```

   Rows whose `requested_role` is not `player` or `coach` are shown to admins
   as "asked for no team role", to approve as either.

e. **Authentication → Providers → Email → Secure email change** is on. The
   invitation protection does not depend on it: an account whose address
   changed is never connected automatically, whatever this is set to. Turn it
   on anyway. Do not count on it to stop an address changing, though — on a
   local Supabase stack with it on (`double_confirm_changes = true`), the
   address still changed after one click by the account holder, on the link
   sent to their old address.

f. **Numbered positions (0036).** This release also turns roster positions into
   numbers 1–11. Run this and keep the output — it lists every position the
   migration will clear, so you can set them from the roster afterwards:

   ```sql
   select t.name as team, p.name as player, tp.position as will_be_cleared
     from public.team_players tp
     join public.teams t on t.id = tp.team_id
     join public.players p on p.id = tp.player_id
    where tp.position is not null
      and lower(trim(tp.position)) not in ('goalkeeper', 'gk', 'keeper', 'goal keeper')
      and tp.position !~ '^\s*([1-9]|1[01])\s*$'
    order by t.name, p.name;
   ```

## 4. Apply the migration and deploy the client back to back

Pick a quiet time. Once 0035 is applied, confirming an email clears the password
typed at sign-up, and only the new client asks for a new one. Between applying
the migration and the new site going live, anyone who confirms an email has
that password cleared and cannot sign in until the new site is live, where
**Forgot password?** gets them in. Keep the gap to minutes.

Before applying anything, the client must already be merged to `main` with its
gates green (`npm test`, `npm run typecheck`, `npm run build` all exit 0), so
the only thing between the migration and the new site is the push and the
deploy.

1. Supabase → **the production project** (check the switcher) → SQL Editor.
2. Paste the whole of `supabase/migrations/0035_account_invitations.sql` and run it.
   It carries its own `begin`, `set role postgres` and `commit`.
3. Run the positions query from 3f again now and keep this output — anything a
   coach typed since you first ran it is cleared too.
4. Paste the whole of `supabase/migrations/0036_numbered_positions.sql` and run it.
   **This must never be applied to a database that is still serving the older
   app.** The older app sends positions as text, and 0036 makes
   `team_players.position` a `smallint` — every roster save and every player
   import fails with `invalid input syntax for type smallint` on the old
   client until the new app is live, so keep this back to back with the push
   below, the same as 0035. If it errors, its own transaction rolls it back and
   nothing changed; do not push until it has applied cleanly (the new client
   reads text positions as well as numbers, but the older client's writes are
   what break once it is applied).
5. Paste the whole of `supabase/migrations/0037_goals_by_role.sql` and run it.
   It adds the Goals by role measure, its standards table and function, and
   rebuilds the two scoring views. Unlike 0036 it is safe on the older app —
   additive, and every column the older app reads is unchanged — but the new
   app **needs** it: it reads the new view columns, and without them the
   Ratings board loads empty. If it errors, its own transaction rolls it back;
   do not push until it has applied cleanly.
6. Verify:

   ```sql
   select count(*) from public.invitations;                                   -- 0
   select column_name from information_schema.columns
    where table_name = 'profiles'
      and column_name in ('requested_team_id', 'email_changed_at');            -- 2 rows
   select proname from pg_proc
    where proname in ('create_invitation','pending_requests','approve_player_request',
                      'approve_coach_request','reject_request','revoke_invitation',
                      'team_linked_players','promote_confirmed_profile',
                      'redeem_invitations','redeem_my_invitations',
                      'note_email_change')
    order by 1;                                                                -- 11 rows
   select data_type from information_schema.columns
    where table_name = 'team_players' and column_name = 'position';            -- smallint
   select to_regprocedure('public.save_goal_bands(uuid,uuid,text,jsonb)') is not null; -- true
   select count(*) from information_schema.columns
    where table_name = 'matrix_exercise_points'
      and column_name in ('role','goals_for','goals_against','base_factor','bonus_factor'); -- 5
   ```

7. Tell PostgREST about the new functions, or the app's calls to them answer
   "function not found" until it next reloads on its own:

   ```sql
   notify pgrst, 'reload schema';
   ```

8. Paste the whole of `supabase/migrations/0038_attendance_dnp.sql` and run it.
   It widens the attendance check to allow `dnp` and rebuilds the two scoring
   views. Safe on the older app — it never sends `dnp` — but the new client
   **needs** it, or every DNP save is refused by the constraint. If it errors,
   its own transaction rolls it back; do not push until it has applied cleanly.
9. Immediately push `main` (the owner's call). Vercel deploys production; wait
   for the deployment to go live.

## 5. Prove the new flows on the live site

With addresses you own, none of them a Supabase team member.

### Passwords

1. Register on the production site with a fresh address. Open the confirmation
   link. The app asks you to **choose your password**. Before choosing one,
   check that the password typed at sign-up no longer signs in (open the site
   in a private window and try it: it is refused). Then choose one, and sign in
   with it: the app says the request is waiting for approval.
2. Use **Forgot password?** with the same address. The reset email arrives, the
   link opens the app asking for a new password, and the new password signs in.

### Smoke test

1. **An invitation connects a new account.** As a coach, open a player's bio
   and invite a test address. Register with that address, open the
   confirmation link and choose a password. The account is signed in and linked
   to that roster entry (the bio says *Account linked*).
2. **An admin approves a request as a coach.** Register a second address
   choosing **Coach or staff** and a team, and confirm it. As an admin, open
   **Waiting for approval**, approve it, and check that the person now appears
   on that team's staff.
3. **An existing account is connected at sign-in.** Invite an address that
   already has an account to a team. Sign in with it: it is connected to that
   team without registering again.
4. **An account whose email was changed is not connected.** Invite an address
   you own that has no account. Change a different, active test account's
   address to the invited one. The app has no screen for this, so use that
   account's session against the Auth API — `PUT <project URL>/auth/v1/user`
   with headers `apikey: <anon key>` and `Authorization: Bearer <its access
   token>` and body `{ "email": "<invited address>" }` — then open the change
   link(s) it emails. Sign in with the account: it is not connected to that
   team, and the coach still sees the invitation as open.
5. **Positions are numbers.** Open a player's Edit form: Position is a picker
   of 1–11; set the positions the pre-check listed.

### Troubleshooting: an account whose address changed

An account whose email address has changed is never connected to invitations
at sign-in, and the app has no screen to connect it. If the person asks, first
check that they really own the address now on the account. Then, in the SQL
Editor of the production project, as `postgres`:

```sql
set role postgres;
update public.profiles set email_changed_at = null where id = '<profile id>';
```

Ask them to sign in again; their open invitations are connected then. Clearing
it re-opens automatic connection for **later** invitations to that account too,
not just the ones waiting now.

## Rollback

The client and the migration are independent enough to roll back separately,
with two exceptions: rolling back the client alone, with 0035 still applied,
reopens the gap described in step 4 — confirming clears the sign-up password
and the old client does not ask for a new one; and rolling back the client
alone, with **0036** still applied, breaks every roster save and player import
(`invalid input syntax for type smallint`), because the older client sends
positions as text. A third, the other way round: **0037** must stay applied while the new client is live (it reads 0037's view columns), so undo 0037 only **after** the client has been rolled back.

To undo the migration, run this block first — it restores the pre-0035
functions in place (same names, so the existing triggers pick them up with no
further change) before dropping anything 0035 added:

```sql
begin;
set role postgres;

-- Pre-0035 body, verbatim from
-- supabase/migrations/0013_signup_without_email_confirmation.sql. Restored
-- first, in the same transaction as the drops below: 0035's version writes
-- profiles.requested_team_id and calls promote_confirmed_profile(), so no
-- moment may exist where sign-ups run it against a dropped column or function.
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

-- Pre-0035 body, verbatim from supabase_migration_auth.sql section 4.
-- 0035's version calls promote_confirmed_profile(); this one does not, so it
-- must be back in place before that function is dropped below.
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    email_verified = true,
    status = case when requested_role = 'guest' or requested_role is null then 'active' else 'pending_approval' end,
    role = case when requested_role = 'guest' or requested_role is null then 'guest' else role end
  where id = new.id;
  return new;
end;
$$;

-- Pre-0035 body and attributes (SECURITY DEFINER), verbatim from
-- supabase_migration_auth.sql section 5 — the function only, not the
-- policies or grants around it.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_profile_role() = 'admin' then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.school_id is distinct from old.school_id then
    raise exception 'Only an admin can change role, status, or school assignment.';
  end if;
  return new;
end;
$$;

drop function if exists public.create_invitation(text, uuid, text, uuid);
drop function if exists public.revoke_invitation(uuid);
drop function if exists public.pending_requests();
drop function if exists public.approve_player_request(uuid, uuid, uuid);
drop function if exists public.approve_coach_request(uuid, uuid);
drop function if exists public.reject_request(uuid);
drop function if exists public.team_linked_players(uuid);
drop function if exists public.redeem_my_invitations();
drop function if exists public.promote_confirmed_profile(uuid);
drop function if exists public.redeem_invitations(uuid, boolean);
drop trigger if exists on_auth_user_email_changed on auth.users;
drop function if exists public.note_email_change();
drop table if exists public.invitations;
alter table public.profiles drop column if exists email_changed_at;
alter table public.profiles drop column if exists requested_team_id;

commit;
```

The block restores all three functions itself, so there is no separate step
to re-run 0013. Afterwards, `notify pgrst, 'reload schema';` so PostgREST forgets the dropped
functions.

Do not re-run `supabase_migration_auth.sql` as part of this rollback, not even
"just section 5": that section also re-creates `profiles_select` as
`for select using (is_deleted = false)`, which would let any anonymous caller
read every profile's email again — undoing `0001_tighten_profiles_select.sql`
— for the sake of a guard function the explicit block above already restores.

### Undoing 0036 (numbered positions)

This must run **before** the client is rolled back: the newer client reads
numbers, so the column can move back to text first without a moment where a
live client sends text against a `smallint` column.

This puts `team_players.position` back to text so the older client can write
to it again. It cannot undo the conversion itself: the migration cleared every
position it could not read as 1–11, and turning the column back into text does
not bring those values back — whatever the roster showed right before 0036 ran
is gone, and only the pre-check output from step 3f can tell a coach what to
re-enter. Positions the migration cleared stay cleared.

```sql
begin;
set role postgres;
alter table public.team_players drop constraint if exists team_players_position_range;
alter table public.team_players alter column position type text using position::text;
comment on column public.team_players.position is null;
commit;
```

Then `notify pgrst, 'reload schema';` so PostgREST picks up the column's new type.

### Undoing 0037 (Goals by role)

Run this only **after** the client has been rolled back: the newer client
selects columns this removes from `matrix_exercise_points`.

1. Supabase → the production project → SQL Editor. Run:

   ```sql
   begin;
   set role postgres;
   drop function if exists public.save_goal_bands(uuid, uuid, text, jsonb);
   drop view if exists public.matrix_standings;
   drop view if exists public.matrix_exercise_points;
   ```

2. In the same editor tab, **before committing**, paste the section of
   `supabase/migrations/0022_time_band_scoring.sql` from
   `create view public.matrix_exercise_points` through
   `grant select on public.matrix_standings to anon, authenticated;` and run it.
3. Then run:

   ```sql
   drop table if exists public.drill_goal_bands;
   commit;
   notify pgrst, 'reload schema';
   ```

The measure constraint and the three result columns (`role`, `goals_for`,
`goals_against`) are left in place: they are harmless to the older app, and
dropping them would destroy recorded Goals-by-role results. Under 0022's view
those sessions score nothing for players who were there, and still charge a
no-show or an unentered player 0 of the weight. Change such drills to another
measure, or delete those sessions, if that matters.

### Undoing 0038 (DNP)

Run this only **after** the client has been rolled back, and only once no
result carries `dnp` — the constraint below refuses to go back while one does.

```sql
begin;
set role postgres;
-- Anything still marked DNP has to be settled first: these are the rows.
select s.occurred_on, d.name, r.player_id
  from public.matrix_session_results r
  join public.matrix_sessions s on s.id = r.session_id
  join public.drills_bank    d on d.id = s.drill_id
 where r.attendance = 'dnp';
-- Either fix them by hand, or take the blunt route and call them no-shows,
-- which scores identically:
--   update public.matrix_session_results set attendance = 'unexcused' where attendance = 'dnp';
alter table public.matrix_session_results drop constraint if exists matrix_session_results_attendance_check;
alter table public.matrix_session_results add constraint matrix_session_results_attendance_check
  check (attendance in ('present', 'excused', 'unexcused'));
commit;
```

The views may be left as 0038 built them: with no `dnp` rows, the absent branch
reports `unexcused` exactly as 0037's did. To restore 0037's text as well, run
the section of `supabase/migrations/0037_goals_by_role.sql` from
`drop view if exists public.matrix_standings;` to the `grant` that follows
`matrix_standings`, then `notify pgrst, 'reload schema';`.
