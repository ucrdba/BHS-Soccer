# Google sign-in with a roster allowlist — design

**Status:** approved for planning
**Date:** 2026-08-29
**Supersedes:** the signup half of `supabase_migration_auth.sql`. The RLS policies in that
file stand unchanged; only the two triggers that decide a new profile's role and status are
reworked here.

## Problem

Signing up takes four steps: register, wait for a six-digit code, enter it, then wait for an
admin to approve. Two of those steps are ours by choice.

Both reported pains share a root. Verification exists only to prove someone controls their
email address — which Google has already done. And the emails carrying those codes are the
thing hitting Supabase's built-in SMTP rate limit, which is throttled to a handful per hour
because it is meant for development. Remove the verification step for people signing in with
Google and the rate limit stops mattering for the normal path, because we stop sending mail
at all.

The approval step has a second problem beyond friction. Today anyone can register requesting
`coach` and rely on whoever reads the queue noticing. Authorization is a judgement made under
time pressure, one request at a time.

## What this changes

Authorization becomes **a list you maintain in advance** rather than a decision you make on
each request. Adding next season's squad is editing a CSV once, instead of approving twenty
requests as they arrive.

### Goals

- A rostered person goes from clicking "Continue with Google" to using the app in one step:
  no code, no waiting, no email from us.
- Roles are declared ahead of time and in bulk.
- Nobody outside the list can hold a privileged role, regardless of what they request.
- No email is sent on the normal signup path.

### Non-goals

- Replacing Supabase Auth. Google is a provider Supabase already supports; switching auth
  services would mean rewriting every RLS policy (all of which rest on `auth.uid()`),
  re-pointing the `profiles.id` foreign key, and re-onboarding every account — to obtain
  something already available.
- Removing password sign-in. It stays as the fallback and so that existing accounts,
  including the admin account, keep working.
- Building an in-app editor for the allowlist in this phase. The table's RLS is designed so
  one can be added later with no schema change.

## Identity model

Two ways in, one source of authority. Google and password both produce a row in `auth.users`,
so `auth.uid()` is unchanged and every existing RLS policy and `isCoach()` guard keeps working
untouched.

What changes is where a **role** comes from.

```sql
create table public.allowed_users (
  email      text primary key,          -- stored lowercased
  name       text not null,
  role       text not null check (role in ('coach','player','guest')),
  school_id  uuid references public.schools(id) on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
```

The `check` constraint mirrors `profiles_status_check` so a typo in a CSV cannot grant a role
the application does not recognise.

**A separate table is required, not a convenience.** `profiles.id` is a foreign key to
`auth.users`, so a profile cannot exist before its account does. This table is the only way to
express "this person is authorized" before they have ever signed in.

### RLS: admin only, for read as well as write

`allowed_users` holds names and email addresses of minors. Its policies permit `admin` only,
in both directions. Not `anon`, not `authenticated`.

This is stated as a requirement rather than left to implementation because this repository has
already shipped exactly this bug once: migration `0001_tighten_profiles_select.sql` exists
because `public.profiles` was readable by any anonymous visitor, exposing every user's email.
The same table under a different name would be the same hole. It is closed in the migration
that creates the table, not in a follow-up.

## Trigger rework

This is the load-bearing part, and where the change can silently break.

Today the work is split across two triggers: `handle_new_user` creates the profile as
`pending_verification` on INSERT into `auth.users`, and `handle_user_confirmed` promotes it on
UPDATE when the email is confirmed.

**Google users are created already confirmed.** The UPDATE never fires, so under the current
triggers they would sit at `pending_verification` permanently, unable to use the app.

### `handle_new_user` — decides everything at INSERT

Looks up `lower(new.email)` in `allowed_users`:

| Case | role | status | name |
| --- | --- | --- | --- |
| On the list | the allowlist's role | `active` | Google's name, falling back to the allowlist's |
| Not on the list, email already confirmed (Google) | `guest` | `active` | Google's name |
| Not on the list, email unconfirmed (password) | `guest` | `pending_verification` | metadata name |

`requested_role` continues to be read from metadata for password signups, so the existing
self-service path is unaffected.

### `handle_user_confirmed` — must not undo the above

It remains, because password signups still need it, with one guard that carries the whole
risk of this rework:

> It may only promote a profile whose status is still `pending_verification`.

Today it sets status unconditionally. Without the guard, an allowlisted person who signs up
with a password would be set `active` at INSERT and then knocked back to `pending_approval`
the moment they confirmed their email. This is the same shape of defect as a later step
overwriting what an earlier one established — invisible unless specifically tested, which is
why it has a named verification step below.

## Application changes

Small, and mostly configuration rather than code.

- `src/data/supabase.ts`: `signInWithGoogle()` wrapping `signInWithOAuth({ provider: 'google' })`.
- `src/globals.d.ts`: the matching declaration on `SupabaseServiceLike`.
- Login form: a "Continue with Google" button as the primary action; the password form stays
  as the secondary path.
- No callback handling to write. `detectSessionInUrl` is on by default, `onAuthStateChange`
  already fires, and `auth.ts` already subscribes and re-renders.

**Redirect URLs must be whitelisted in Supabase** for every host the app runs on:
`http://localhost:3000`, `https://bhs-soccer.vercel.app`, and Vercel's per-deployment preview
URLs, which need a wildcard entry. A missing entry fails only on that one host, which makes it
easy to miss.

## Loading the roster

`scripts/invite-users.mjs` gains an `allow` command. It already parses and validates this
exact CSV shape (`Name, Email, Role`), already refuses to run without a `service_role` key,
already refuses if that key appears in client code, and is already dry-run by default with
tests covering the validation.

```
npm run invite -- allow Resouces/CSV/team.csv            # dry run
npm run invite -- allow Resouces/CSV/team.csv --confirm
```

Upsert by email, so re-running after a correction is safe.

## Behaviour this introduces

Three states the current flow does not have, each needing to be visible rather than silent:

- **Sign-in cancelled at Google** — no session and no thrown error. Without a message this
  reads as the button being broken.
- **Signed in but not on the allowlist** — a legitimate state, not an error. The app says so
  plainly ("You're signed in as a visitor — ask a coach to add you to the roster") rather than
  showing an authenticated user an app with nothing in it.
- **A revoked person** — removing someone from `allowed_users` does **not** revoke access.
  Once a profile exists, the profile governs. Revocation is a separate act on the profile:
  `status = 'rejected'` to lock the account out entirely, or `role = 'guest'` with
  `status = 'active'` to demote them to public access while leaving them able to sign in.
  (`profiles_status_check` permits only `active`, `pending_verification`, `pending_approval`
  and `rejected`, so there is no "inactive" state to reach for.) The Admin panel's existing
  approve/reject controls are repurposed for this rather than new UI being built.

## Rollout

The approval queue stops being part of the normal path. It remains available for exceptions.

**One risk gates everything else.** The admin account is `ucrdba@gmail.com` — a Gmail address
that already exists as a password account. Signing in with Google on that address should
*link* to the existing user. If it instead creates a second `auth.users` row, `handle_new_user`
fires again and produces a second profile for the same person, orphaning the first.

Which of those happens depends on provider settings and on whether the existing email is
confirmed, so it is not asserted here. The rollout begins with that single test, using a
**throwaway** address that already has a password account, checking whether `auth.users` gains
a row. Everything else waits on the result. If it does duplicate, identities are linked
deliberately instead of letting first-sign-in decide.

## Verification

Client-side logic is covered by the existing suites. The trigger logic cannot be reached from
JavaScript, so it gets explicit SQL steps in a runbook, as migrations `0002` and `0003` did.

Named checks:

1. An allowlisted address signing in with Google lands `active` with the listed role, in one step.
2. A non-allowlisted address signing in with Google lands `guest` / `active`, and the UI says so.
3. **An allowlisted person who signs up with a password and then confirms their email is still
   `active` afterwards** — not `pending_approval`. This is the regression the trigger rework
   can introduce.
4. A password signup for an address not on the list still follows the existing
   verify-then-approve path unchanged.
5. `allowed_users` returns zero rows to `anon` and to a non-admin `authenticated` session.
6. A row whose role is not one of the three is rejected by the check constraint.

## Delivery

One migration, `supabase/migrations/0004_allowed_users_and_oauth_triggers.sql`: the table, its
RLS, both trigger rewrites, and a documented rollback. Applied by hand in the Supabase SQL
editor, as with every migration in this project — no agent holds DDL access.

Prefer a further dated migration over editing this one once it is applied.
