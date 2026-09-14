# Accounts: invitations, requests and password reset — design

**Status:** awaiting sign-off
**Date:** 2026-09-14
**Supersedes:** the sign-up half of `supabase_migration_auth.sql` and of
`supabase/migrations/0013_signup_without_email_confirmation.sql` (the two
triggers that decide a new profile's role and status), and
`2026-08-29-google-signin-allowlist-design.md`, which was approved but never
built and predates teams. Its central idea — authorization is a list kept in
advance, not a decision made per request — carries over; Google sign-in does
not.

## Problem

An account can be created and signed into. Getting from there to a working
coach or player breaks at every step after:

1. **Mail does not reliably arrive.** Production has "Confirm email" on
   (`mailer_autoconfirm: false` on `/auth/v1/settings`) and no evidence of a
   real mail provider. Supabase's built-in mailer is rate-limited to a handful
   an hour and, without custom SMTP, delivers only to the project team's own
   addresses. The app also tells people to enter a 6-digit code the default
   email does not contain.
2. **Every sign-up is filed under Beaumont.** `handle_new_user` resolves
   `code = 'bhs'`, and `mapProfileRowToAppUser` labels every user "Beaumont High
   School, Boys Varsity". A club coach becomes a pending Beaumont account.
3. **Coaches cannot approve.** `profiles_update` allows the row's owner or an
   admin, and `guard_profile_privileged_columns` refuses role and status
   changes by anyone else — yet the Coaching Staff queue offers coaches an
   Approve button that fails.
4. **The queue leaks across organizations.** `fetchPendingApprovals(schoolId)`
   ignores its argument.
5. **Approval grants a role and no access.** A coach needs a `team_coaches` row
   that approval never writes. A player needs `profiles.player_id`, which
   nothing in the app sets, so an approved player sees only the public default
   team.
6. **There is no password reset.** A forgotten password is fixed with SQL.

## Decisions

Settled with the owner before this was written.

| Question | Decision |
| --- | --- |
| How does a person reach their team? | **Invite first, request as fallback.** An invited email connects on confirmation; anyone else requests and is approved. |
| How is email ownership proven? | **An email link through a real mail provider.** "Confirm email" stays on. |
| Who may invite and approve? | **Coaches handle players on their own team; only an admin handles coaches.** A coach can never create another coach. |

## Where the rules live

**In Postgres, as `security definer` functions the app calls.** Redeeming an
invitation happens inside the confirmation trigger; creating an invitation,
approving and rejecting are RPCs that check the caller themselves.

Rejected alternatives: loosening `profiles_update` so coaches write profiles
directly (RLS cannot restrict columns, so the guard trigger would have to grow
per-role, per-column rules), and a server function holding the `service_role`
key (a new deployment and a secret, for the same result). CLAUDE.md already
places real enforcement in the database; this follows it.

## Schema — `0035_account_invitations.sql`

```sql
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email)),
  school_id   uuid not null,
  team_id     uuid not null,
  role        text not null check (role in ('player', 'coach')),
  player_id   uuid references public.players(id),
  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at  timestamptz,
  foreign key (team_id, school_id) references public.teams (id, school_id),
  check ((role = 'player') = (player_id is not null))
);

-- One open invitation per person per team.
create unique index invitations_open_email_team
  on public.invitations (email, team_id)
  where accepted_at is null and revoked_at is null;

alter table public.profiles
  add column if not exists requested_team_id uuid references public.teams(id);
```

- **Emails live here, never on `players`.** `players` is publicly readable
  and many of these addresses belong to minors.
- **RLS in the same migration:** select for `is_team_coach(team_id)` (which
  includes admins); no insert, update or delete policy — every write goes
  through the functions below. This repository has shipped a readable email
  column once already (`0001_tighten_profiles_select.sql`); it is closed where
  the table is created, not in a follow-up.
- **The composite foreign key** stops `school_id` drifting from its team's,
  exactly as on `team_players`.
- **It must apply to an empty database** (the demo rebuild): no data, no
  production UUIDs, no organization codes.

## The confirmation triggers

The load-bearing part. Both are replaced with `create or replace` and their
triggers re-created with `drop trigger if exists`, so the migration is correct
whether the live functions came from `supabase_migration_auth.sql` or `0013`.

### `handle_new_user` — records the request, grants nothing

At INSERT into `auth.users`:

- Reads `name`, `requested_role` and `requested_team_id` from the metadata.
- **`requested_role` is clamped to `player`, `coach` or `guest`.** `admin`, or
  anything else, becomes `guest` — the metadata is written by the browser.
- **`requested_team_id` is kept only if it names a live team**; `school_id` is
  that team's. A guest keeps neither. Nothing resolves `bhs`.
- Inserts the profile as `role = 'guest'`, `status = 'pending_verification'`.
- If the user arrives **already confirmed** (confirmation switched off, or an
  admin-created account), it calls the same promotion `handle_user_confirmed`
  uses, so there is one set of rules, not two copies kept in step.

### `handle_user_confirmed` — the only place access is granted

At the UPDATE that sets `email_confirmed_at`, through a shared
`public.promote_confirmed_profile(user_id)`:

- **Only a profile still at `pending_verification` is touched.** Without this
  guard a later confirmation knocks an already-settled account back into the
  queue — the defect the August design named, and the reason this has its own
  test.
- **Open invitations for `lower(email)` are redeemed**, oldest first:
  - `player`: the roster entry must still have no linked account. The profile
    gets `role = 'player'`, `status = 'active'`, the invitation's `school_id`
    and `player_id`.
  - `coach`: a `team_coaches` row for the team; `role = 'coach'`,
    `status = 'active'`, the invitation's `school_id`.
  - Several invitations are all redeemed, and the role is the higher of them.
    **If two name different roster entries, none is applied**: the account
    goes to `pending_approval` and each coach sees why, because guessing which
    person someone is is how a player lands on a squad they never played for.
  - Each redeemed invitation gets `accepted_at` and `accepted_by`.
- **No invitation:** `guest` becomes `active`; `player` or `coach` becomes
  `pending_approval` with its `requested_team_id`.

**Why at confirmation and not at sign-up:** until the link is clicked, nobody
has shown they own the address. Redeeming at INSERT would let anyone who knows
a player's email sign up as that player and be placed on the team.

## The functions the app calls

All `security definer`, `set search_path = public`, granted to `authenticated`
only, each checking the caller before doing anything.

| Function | Caller must be | Does |
| --- | --- | --- |
| `create_invitation(email, team_id, role, player_id)` | `player`: `is_team_coach(team_id)`. `coach`: admin. | Lowercases the email; refuses a roster entry not on that team or already linked, and a second open invitation for the same email and team. Returns the row. |
| `revoke_invitation(id)` | as for creating that role | Sets `revoked_at`. |
| `pending_requests()` | coach or admin | Returns only requests the caller may act on: a coach sees player requests for teams they coach; an admin sees everything. Replaces the unfiltered read. |
| `approve_player_request(profile_id, team_id, player_id)` | `is_team_coach(team_id)` | `team_id` must be the request's `requested_team_id`; only an admin may pass a different one, which is how a request that named no team is placed. `player_id` null creates a `players` row from the profile's name and a `team_players` row on the team; otherwise the entry must be on that team and unlinked. Sets role, status, school and link together. |
| `approve_coach_request(profile_id, team_id)` | admin | Inserts `team_coaches` for `team_id` (the requested team unless the admin picks another), sets role, status and school. |
| `reject_request(profile_id)` | the approver for that request's role | Sets `status = 'rejected'`, as today. |

Refusals raise with a sentence the app shows as-is ("Only an admin can approve
a coach."), never a bare SQLSTATE.

`profiles_update` stays as it is. **`guard_profile_privileged_columns` has to
change, or every approval by a coach is refused.** Inside a `security definer`
function `auth.uid()` is still the coach's — it comes from the request's JWT,
not the database role — so the guard's current test (`auth.uid() is null or
current_profile_role() = 'admin'`) raises for a coach approving a player. The
guard gains one branch: it lets the change through when `current_user` is not
an API role (`authenticated` or `anon`), which is true inside a definer
function and on trusted connections, and false for any update a visitor sends
directly. **A test runs a coach's approval from a real `authenticated`
connection**, because this is exactly the class of bug the superuser harness
cannot see: the demo's account locks passed every superuser test and still
refused real visitors.

## Application changes

**Sign-up (`AuthModal.vue`).** Name, email, password, and "I am a…" (player,
coach, fan). Player and coach also choose a team, from a new
`fetchJoinableTeams()` listing live teams with their organization's name —
`teams` is already public. The Beaumont-and-Coach-Bob wording goes; the
confirmation message says to check for a **link**, not a code.

**Profile mapping (`src/auth.ts`).** `mapProfileRowToAppUser` reads
`school_id` from the row and drops the hardcoded school, school name and team
level. The only consumers are `ApprovalsSection` and `upsertProfile`'s
`teamLevel`.

**Invitations.**
- A coach sees **Invite** on a roster entry with no account: an email field,
  then the entry shows "Invited — waiting for sign-up" with **Revoke**, or
  "Account linked".
- Admin → Teams gains **Invite a coach** per team, with the same states.
- **The app does not send the invitation email in this phase.** Sending mail
  from the browser needs a server-held key. After inviting, the screen shows a
  copyable sign-up link with the email filled in (`/?signup=<email>`) for the
  coach to text or email themselves. The confirmation email Supabase sends at
  sign-up is what proves the address.

**Requests queue** (`ApprovalsSection.vue`, the Coaching Staff queue) reads
`pending_requests()`. A player request offers the team's unlinked roster
entries plus **New roster entry**; a coach request — shown to admins only —
offers **Approve** (adds to staff). Nobody is shown a button the database will
refuse.

**Password reset.** **Forgot password?** on the sign-in tab asks for an email
and calls `resetPasswordForEmail(email, { redirectTo: <origin> })`. The
confirmation shown is the same whether or not the address has an account, so
the form cannot be used to find out who is registered. The `PASSWORD_RECOVERY`
event from `onAuthStateChange` opens a set-new-password view that calls
`updateUser({ password })`.

## Setup the owner does (before release)

1. **A mail provider** (Resend or Postmark; both have free tiers) with a
   sending domain or address you control — not `vercel.app`. Connect it under
   Authentication → SMTP Settings.
2. **Send yourself a test** sign-up and a test reset and confirm both arrive.
3. **URL configuration:** Site URL is production; redirect URLs include
   production, the demo and `http://localhost:3000`.
4. Leave **"Confirm email" on.** It is what makes an invitation safe: with it
   off, every account arrives already confirmed, invitations are redeemed at
   sign-up, and anyone who knows an invited address can claim that place.

The client release waits on step 2: without delivery, the confirmation this
design depends on cannot happen.

## Rollout

1. Apply `0035` to production. Safe before the client: the current client
   sends no `requested_team_id`, so its sign-ups become organization-less
   `pending_approval` rows, which `pending_requests()` shows to admins.
2. Complete the mail setup and test it.
3. Deploy the client.

**Existing accounts are untouched.** Active profiles keep their role, school
and links. Profiles already at `pending_approval` stay in the queue with no
requested team, visible to admins, who approve them as today.

**The demo** keeps sign-ups off, so no request or invitation can arise there.
`0035` is part of its nightly rebuild, so it must apply to an empty database.

## Testing

**Database, against the real Postgres** (`src/data/testdb/`), with every
permission-bearing case run from a separate `authenticated` connection with
`request.jwt.claim.sub` set — the superuser harness skips exactly the checks
this design rests on:

- An invited email is redeemed at confirmation and **not** at insert.
- A confirmed invited player is linked to the roster entry; a coach gets a
  `team_coaches` row.
- Confirmation does not demote an already-active profile.
- `requested_role = 'admin'` in metadata produces a guest.
- Invitations naming two different roster entries apply neither.
- A coach can invite a player to their own team and not to another team, and
  cannot invite or approve a coach.
- A coach cannot read another team's invitations; a guest cannot read any.
- `pending_requests()` returns a coach only their own teams' player requests.
- `approve_player_request` with a null `player_id` creates the roster entry
  and membership; with an already-linked entry it refuses.
- A coach's approval succeeds through the guard trigger from an
  `authenticated` connection, while the same role change sent as a direct
  `update` from that connection is still refused.
- A coach cannot place a request onto a team other than the one requested;
  an admin can.
- The migration applies to an empty database, and twice.

**Service and component tests** (Vitest): sign-up sends the team and role;
the team picker is required for player and coach; the reset form shows one
message for known and unknown addresses; the queue shows Approve only where
the role allows; the invite control's three states.

## Out of scope

- Google sign-in.
- Bulk CSV invitations.
- Sending invitation emails from the app.
- Granting or revoking admin in the app.

## Known gaps left open

- **`profiles_select` lets any coach read every profile**, across
  organizations (`0001` allows `current_profile_role() in ('coach', 'admin')`).
  `pending_requests()` stops the queue showing them, but the table read stays
  as wide as it is today. Narrowing it touches every screen that reads a
  profile and wants its own change.
- **`profiles.school_id` holds one organization.** A person invited to a
  school team and a club team gets both memberships, which is what access is
  read from, but their profile names the first organization redeemed.

## Amendments (2026-09-14, after the final review)

**A. The password typed at sign-up no longer survives confirmation.** An
unconfirmed Supabase account keeps the password from its *first* sign-up, so a
stranger who signed up first with someone else's address could sign in as that
person once the real owner opened the confirmation link — and, with an
invitation waiting, be on a squad of minors. This was verified on a local
Supabase stack: a `security definer` function fired by the confirmation
trigger can set `auth.users.encrypted_password = ''`; afterwards the pre-set
password is refused (`invalid_credentials`), the link still issues a session,
and `PUT /auth/v1/user { password }` on that session sets one that signs in. So
`handle_user_confirmed` clears it whenever a confirmation email was sent, and
the app asks the person to choose a password straight after the link. The cost:
every new account chooses its password twice, and someone who closes that
prompt must use *Forgot password* next time. Accounts created already confirmed,
or confirmed by GoTrue's admin create (which sends no link), keep theirs.

**B. An existing account is connected at sign-in.** Redemption at confirmation
only reaches a profile still at `pending_verification`, so inviting a parent, a
player with a school account, or a coach to a second team connected nothing.
The redeeming moved into `redeem_invitations()`, which confirmation calls, and
the app calls `redeem_my_invitations()` after signing in; it refuses an account
that is not active or has no confirmed address. It never demotes a coach or an
admin, never re-points an account already linked to a different roster entry,
skips deleted teams and roster entries that have left their team, and only
sets the profile's organization when it has none.

**C. An admin approves any waiting request as a player or a coach.** Pending
accounts can carry a `requested_role` of `guest` (conflicting invitations) or
`admin`/null (the sign-up trigger before this change), and the queue offered
them a player approval that the database always refused. An admin may now
approve any waiting request as either, and the queue marks those rows "asked
for no team role" and asks which. A coach still approves player requests only.
