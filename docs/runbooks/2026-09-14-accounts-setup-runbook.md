# Accounts: setup and rollout

Spec: `docs/superpowers/specs/2026-09-14-account-invitations-design.md`.
Do these in order. The client must not be deployed before step 3 passes.

## 1. Apply the migration to production

1. Supabase → **the production project** (check the switcher) → SQL Editor.
2. Paste the whole of `supabase/migrations/0035_account_invitations.sql` and run it.
   It carries its own `begin`, `set role postgres` and `commit`.
3. Verify:

   ```sql
   select count(*) from public.invitations;                                   -- 0
   select column_name from information_schema.columns
    where table_name = 'profiles' and column_name = 'requested_team_id';       -- 1 row
   select proname from pg_proc
    where proname in ('create_invitation','pending_requests','approve_player_request',
                      'approve_coach_request','reject_request','revoke_invitation',
                      'team_linked_players','promote_confirmed_profile')
    order by 1;                                                                -- 8 rows
   ```

Safe before the new client: the current one sends no team, so its sign-ups
arrive as requests with no team, which admins see in the queue.

## 2. Connect a mail provider

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

## 3. Prove delivery

1. Register on the production site with an address you own that is **not** a
   Supabase team member. The confirmation email arrives within a minute.
2. Open the link. Sign in: the app says the request is waiting for approval.
3. Use **Forgot password?** with the same address. The reset email arrives, the
   link opens the app asking for a new password, and the new password signs in.

If either email does not arrive, stop: check the provider's activity log and
Supabase → Logs → Auth before deploying anything.

## 4. Deploy the client

Push `main` (the owner's call). Vercel deploys production.

## Rollback

The client and the migration are independent enough to roll back separately.
To undo the migration, restore the previous triggers by re-running
`supabase/migrations/0013_signup_without_email_confirmation.sql` and section 5
of `supabase_migration_auth.sql` (the guard), then:

```sql
begin;
set role postgres;
drop function if exists public.create_invitation(text, uuid, text, uuid);
drop function if exists public.revoke_invitation(uuid);
drop function if exists public.pending_requests();
drop function if exists public.approve_player_request(uuid, uuid, uuid);
drop function if exists public.approve_coach_request(uuid, uuid);
drop function if exists public.reject_request(uuid);
drop function if exists public.team_linked_players(uuid);
drop function if exists public.promote_confirmed_profile(uuid);
drop table if exists public.invitations;
alter table public.profiles drop column if exists requested_team_id;
commit;
```
