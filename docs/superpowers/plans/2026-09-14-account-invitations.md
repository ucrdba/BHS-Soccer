# Account Invitations, Requests and Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person can be invited to a team or request a place on one, confirm their email, and end up as a coach or player with real access to that team; anyone can reset a forgotten password.

**Architecture:** Access is granted in Postgres. Migration `0035_account_invitations.sql` adds an `invitations` table, rewrites the two `auth.users` triggers so the confirmation trigger alone redeems invitations, and adds `security definer` RPCs for inviting, approving and rejecting that check their caller. The profile guard trigger becomes `security invoker` with a `current_user` branch so those functions can change a role while a visitor still cannot. The Vue client calls the RPCs through `src/data/supabase.ts`, and the sign-up form, approval queue, invitation control and password reset are built on them.

**Tech Stack:** Postgres (Supabase: PostgREST, GoTrue, RLS), Vue 3 `<script setup>`, Pinia, Vitest + @vue/test-utils, `pg` for database tests.

**Spec:** `docs/superpowers/specs/2026-09-14-account-invitations-design.md`

## Global Constraints

- Never push, and never write to the production database (`arsigevpgpbqluqbnhjr`). SQL migrations are applied by hand by the owner.
- Never stage `assets/*.jpg`; never `git add -A` or `git add .` — name every file.
- `0035` must apply to an empty database (the demo rebuild): no data, no production UUIDs, no organization codes. Demo SQL is never copied into `supabase/migrations/`.
- Never hardcode `'bhs'`, `Beaumont` or `Cougars`; never restrict sign-up to an email domain.
- User-facing messages go in the app's UI, not the console.
- Every database test that asks a permission question runs on a separate connection as `authenticated` with `request.jwt.claim.sub` set — the harness superuser skips every privilege check.
- "Confirm email" stays on. Nothing in the app sends an invitation email.
- A setup store must not return plain helper functions (`createTestingPinia` stubs them).
- Component styles are scoped and use the ground tokens (`--ink`, `--ink-muted`, `--rule`, …), never a literal colour.
- `typescript` stays on 5.x; `tsconfig.json` stays loose.
- Gates are judged by exit code: `npm test > /dev/null 2>&1; echo "TEST=$?"`, `npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"`, `npm run build > /dev/null 2>&1; echo "BUILD=$?"`. All three must print 0 before a task's commit.
- Commit messages follow Conventional Commits and end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0035_account_invitations.sql` | Create — table, guard, triggers (Task 1); RPCs (Task 2) |
| `src/data/testdb/accounts-db.ts` | Create — a committed scratch database built from the migrations, visitor connections, fixtures |
| `src/data/testdb/account-triggers.test.ts` | Create — sign-up and confirmation behaviour |
| `src/data/testdb/account-rpc.test.ts` | Create — invite / approve / reject as real visitors |
| `src/types.ts` | Modify — `AppUser`; add `JoinableTeam`, `PendingRequest`, `Invitation` |
| `src/data/supabase.ts` | Modify — account service methods; remove the old approval methods and `verifyOtp` |
| `src/globals.d.ts` | Modify — matching declarations |
| `src/data/account-service.test.ts` | Create |
| `src/components/admin/ApprovalsSection.vue` (+ test) | Rewrite on `pending_requests()` |
| `src/stores/coaches.ts`, `src/views/CoachesView.vue` (+ tests) | The staff page points at the queue instead of duplicating it |
| `src/auth.ts`, `src/stores/auth.ts` | Profile mapping, registration with a team, reset, no OTP |
| `src/domain/signup-link.ts` (+ test) | Create — the shareable sign-up link |
| `src/components/auth/AuthModal.vue` (+ test) | Team picker, "check your email", forgot/new password |
| `src/components/layout/AppHeader.vue` (+ test) | Open the modal from `?signup=` and a recovery link; sign-out label |
| `src/vue-main.ts` | Hand a recovery link to auth |
| `src/components/accounts/InviteControl.vue` (+ test) | Create — invite, show, copy link, revoke |
| `src/components/roster/PlayerDetailModal.vue`, `src/views/RosterView.vue` | Invite a player |
| `src/components/admin/TeamsSection.vue` | Invite a coach |
| `docs/runbooks/2026-09-14-accounts-setup-runbook.md` | Create — owner setup and rollout |
| `CLAUDE.md` | Document the account rules |

---

### Task 1: The invitations table, the guard, and the confirmation triggers

**Files:**
- Create: `supabase/migrations/0035_account_invitations.sql`
- Create: `src/data/testdb/accounts-db.ts`
- Create: `src/data/testdb/account-triggers.test.ts`

**Interfaces:**
- Consumes: `public.is_team_coach(uuid)`, `public.current_profile_role()`, `public.teams`, `public.team_players`, `public.team_coaches`, `public.players`, `public.profiles` (all existing); `schemaSteps`, `runSteps` from `scripts/demo-rebuild-lib.mjs`; `TEST_DB_URL` from `src/data/testdb/harness.ts`.
- Produces: table `public.invitations`; column `public.profiles.requested_team_id`; function `public.promote_confirmed_profile(uuid) returns void` (not executable by API roles); rewritten `public.handle_new_user()`, `public.handle_user_confirmed()`, `public.guard_profile_privileged_columns()`. Test helpers exported from `accounts-db.ts`: `buildAccountsDb(): Promise<AccountsDb>`, `one`, `uniq`, `makeTeam`, `makeRosterEntry`, `signUp`, `confirm`, `makeCoach`, `makeAdmin`, `invite`.

- [ ] **Step 1: Write the test helper**

Create `src/data/testdb/accounts-db.ts`:

```ts
/// <reference types="node" />
/**
 * A database built from the migrations, committed, with visitor connections.
 *
 * Account permissions are exactly what the superuser harness cannot see: it
 * skips every privilege check, and PL/pgSQL decides a nested call's EXECUTE
 * permission once per session. So this builds a scratch database once per
 * test file, COMMITS fixtures on an owner connection, and asks each permission
 * question on a fresh connection running as `authenticated` with the user's id
 * as the JWT subject -- the way PostgREST answers a request.
 *
 * Fixtures are committed and never cleaned up inside the file; every one is
 * uniquely named, so tests cannot collide. The database is dropped at the end.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { TEST_DB_URL } from './harness';
import { schemaSteps, runSteps } from '../../../scripts/demo-rebuild-lib.mjs';

export interface AccountsDb {
  owner: pg.Client;
  /** Runs fn on a new `authenticated` connection as userId, in a transaction that is rolled back. */
  asUser(userId: string, fn: (c: pg.Client) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

export async function buildAccountsDb(): Promise<AccountsDb> {
  const name = `bhs_accounts_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const url = new URL(TEST_DB_URL);
  url.pathname = `/${name}`;

  const admin = new pg.Client({ connectionString: TEST_DB_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);

  const owner = new pg.Client({ connectionString: url.toString() });
  const drop = async () => {
    await owner.end().catch(() => {});
    await admin.query(`drop database if exists ${name} with (force)`)
      .catch((err) => console.error(`accounts-db: failed to drop ${name}`, err));
    await admin.end().catch(() => {});
  };

  try {
    await owner.connect();
    await owner.query(readFileSync(join(process.cwd(), 'src', 'data', 'testdb', 'prelude.sql'), 'utf8'));
    await runSteps(owner, schemaSteps(process.cwd()));
  } catch (err) {
    await drop();
    throw err;
  }

  return {
    owner,
    async asUser(userId, fn) {
      const c = new pg.Client({ connectionString: url.toString() });
      await c.connect();
      try {
        await c.query('begin');
        await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        await c.query('set local role authenticated');
        await fn(c);
      } finally {
        await c.query('rollback').catch(() => {});
        await c.end().catch(() => {});
      }
    },
    close: drop
  };
}

export const one = async (c: pg.Client, sql: string, params: any[] = []) =>
  (await c.query(sql, params)).rows[0];

export const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10);

/** An organization with one team. Returns the team's id and school_id. */
export async function makeTeam(owner: pg.Client): Promise<{ id: string; school_id: string }> {
  const code = `t${uniq()}`;
  const school = await one(owner,
    `insert into public.schools (code, name, mascot, kind) values ($1, $2, 'Fixture', 'club') returning id`,
    [code, `Org ${code}`]);
  return one(owner,
    `insert into public.teams (school_id, name) values ($1, 'U14') returning id, school_id`,
    [school.id]);
}

/** A person on the team's roster. Returns players.id. */
export async function makeRosterEntry(owner: pg.Client, team: { id: string; school_id: string }): Promise<string> {
  const p = await one(owner,
    `insert into public.players (name, class_year) values ($1, '2030') returning id`, [`Player ${uniq()}`]);
  await owner.query(
    `insert into public.team_players (team_id, school_id, player_id) values ($1, $2, $3)`,
    [team.id, team.school_id, p.id]);
  return p.id;
}

/** An auth.users row, as GoTrue writes one; the triggers make the profile. */
export async function signUp(owner: pg.Client, opts: {
  email?: string; role?: string; teamId?: string; name?: string; confirmed?: boolean;
} = {}): Promise<{ id: string; email: string }> {
  const email = opts.email ?? `${uniq()}@example.com`;
  const meta: Record<string, string> = { name: opts.name ?? 'Test Person', requested_role: opts.role ?? 'guest' };
  if (opts.teamId) meta.requested_team_id = opts.teamId;
  const u = await one(owner,
    `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3) returning id`,
    [email, meta, opts.confirmed ? new Date() : null]);
  return { id: u.id, email };
}

/** What GoTrue does when the link in the confirmation email is opened. */
export const confirm = (owner: pg.Client, userId: string) =>
  owner.query(`update auth.users set email_confirmed_at = now() where id = $1`, [userId]);

export async function makeCoach(owner: pg.Client, team: { id: string; school_id: string }): Promise<string> {
  const u = await signUp(owner, { confirmed: true });
  await owner.query(
    `update public.profiles set role = 'coach', status = 'active', school_id = $2 where id = $1`,
    [u.id, team.school_id]);
  await owner.query(`insert into public.team_coaches (team_id, profile_id) values ($1, $2)`, [team.id, u.id]);
  return u.id;
}

export async function makeAdmin(owner: pg.Client): Promise<string> {
  const u = await signUp(owner, { confirmed: true });
  await owner.query(`update public.profiles set role = 'admin', status = 'active' where id = $1`, [u.id]);
  return u.id;
}

export const invite = (owner: pg.Client, i: {
  email: string; team: { id: string; school_id: string }; role: 'player' | 'coach'; playerId?: string | null;
}) => one(owner,
  `insert into public.invitations (email, school_id, team_id, role, player_id)
   values ($1, $2, $3, $4, $5) returning id`,
  [i.email, i.team.school_id, i.team.id, i.role, i.playerId ?? null]);
```

- [ ] **Step 2: Write the failing trigger tests**

Create `src/data/testdb/account-triggers.test.ts`:

```ts
/**
 * 0035: signing up records a request and grants nothing; confirming the email
 * is the only moment access is granted.
 *
 * Redeeming an invitation before the address is proven would let anyone who
 * knows a player's email sign up as that player and be placed on the team.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb } from './harness';
import {
  buildAccountsDb, one, uniq, makeTeam, makeRosterEntry, signUp, confirm, invite, type AccountsDb
} from './accounts-db';

const available = await hasTestDb();

const profile = (db: AccountsDb, id: string) => one(db.owner,
  `select role, status, school_id, player_id, requested_role, requested_team_id, email_verified
     from public.profiles where id = $1`, [id]);

describe.skipIf(!available)('0035: sign-up and confirmation', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  it('records a player request against its team, and grants nothing', async () => {
    const team = await makeTeam(db.owner);
    const u = await signUp(db.owner, { role: 'player', teamId: team.id });
    expect(await profile(db, u.id)).toMatchObject({
      role: 'guest', status: 'pending_verification', requested_role: 'player',
      requested_team_id: team.id, school_id: team.school_id, player_id: null
    });
  });

  it('turns a request for admin into a guest', async () => {
    // The metadata is written by the browser.
    const u = await signUp(db.owner, { role: 'admin' });
    expect(await profile(db, u.id)).toMatchObject({ role: 'guest', requested_role: 'guest' });
  });

  it('keeps no team that does not exist, and no organization with it', async () => {
    const u = await signUp(db.owner, { role: 'coach', teamId: '00000000-0000-4000-8000-00000000abcd' });
    expect(await profile(db, u.id)).toMatchObject({ requested_team_id: null, school_id: null });
  });

  it('files an uninvited player in the queue once confirmed', async () => {
    const team = await makeTeam(db.owner);
    const u = await signUp(db.owner, { role: 'player', teamId: team.id });
    await confirm(db.owner, u.id);
    expect(await profile(db, u.id)).toMatchObject({ role: 'guest', status: 'pending_approval', email_verified: true });
  });

  it('lets a fan straight in once confirmed', async () => {
    const u = await signUp(db.owner, { role: 'guest' });
    await confirm(db.owner, u.id);
    expect(await profile(db, u.id)).toMatchObject({ role: 'guest', status: 'active' });
  });

  it('does NOT redeem an invitation before the email is confirmed', async () => {
    const team = await makeTeam(db.owner);
    const player = await makeRosterEntry(db.owner, team);
    const email = `${uniq()}@example.com`;
    const inv = await invite(db.owner, { email, team, role: 'player', playerId: player });

    const u = await signUp(db.owner, { email, role: 'player', teamId: team.id });

    expect(await profile(db, u.id)).toMatchObject({ role: 'guest', status: 'pending_verification', player_id: null });
    expect(await one(db.owner, `select accepted_at from public.invitations where id = $1`, [inv.id]))
      .toEqual({ accepted_at: null });
  });

  it('links an invited player to their roster entry at confirmation', async () => {
    const team = await makeTeam(db.owner);
    const player = await makeRosterEntry(db.owner, team);
    const email = `${uniq()}@example.com`;
    const inv = await invite(db.owner, { email, team, role: 'player', playerId: player });

    const u = await signUp(db.owner, { email, role: 'guest' });
    await confirm(db.owner, u.id);

    expect(await profile(db, u.id)).toMatchObject({
      role: 'player', status: 'active', player_id: player, school_id: team.school_id
    });
    const used = await one(db.owner, `select accepted_at, accepted_by from public.invitations where id = $1`, [inv.id]);
    expect(used.accepted_at).not.toBeNull();
    expect(used.accepted_by).toBe(u.id);
  });

  it('puts an invited coach on the team staff at confirmation', async () => {
    const team = await makeTeam(db.owner);
    const email = `${uniq()}@example.com`;
    await invite(db.owner, { email, team, role: 'coach' });

    const u = await signUp(db.owner, { email });
    await confirm(db.owner, u.id);

    expect(await profile(db, u.id)).toMatchObject({ role: 'coach', status: 'active', school_id: team.school_id });
    expect(await one(db.owner,
      `select count(*)::int as n from public.team_coaches where team_id = $1 and profile_id = $2`, [team.id, u.id]))
      .toEqual({ n: 1 });
  });

  it('matches the invitation whatever case the address was typed in', async () => {
    const team = await makeTeam(db.owner);
    const local = uniq();
    await invite(db.owner, { email: `${local}@example.com`, team, role: 'coach' });
    const u = await signUp(db.owner, { email: `${local.toUpperCase()}@Example.com` });
    await confirm(db.owner, u.id);
    expect(await profile(db, u.id)).toMatchObject({ role: 'coach' });
  });

  it('redeems at insert when the account arrives already confirmed', async () => {
    const team = await makeTeam(db.owner);
    const email = `${uniq()}@example.com`;
    await invite(db.owner, { email, team, role: 'coach' });
    const u = await signUp(db.owner, { email, confirmed: true });
    expect(await profile(db, u.id)).toMatchObject({ role: 'coach', status: 'active' });
  });

  it('does not demote a profile already settled when the email is confirmed later', async () => {
    const team = await makeTeam(db.owner);
    const u = await signUp(db.owner, { role: 'player', teamId: team.id });
    await db.owner.query(`update public.profiles set role = 'coach', status = 'active' where id = $1`, [u.id]);
    await confirm(db.owner, u.id);
    expect(await profile(db, u.id)).toMatchObject({ role: 'coach', status: 'active' });
  });

  it('applies neither of two invitations naming different roster entries', async () => {
    // Guessing which person someone is puts a player on a squad they never played for.
    const a = await makeTeam(db.owner);
    const b = await makeTeam(db.owner);
    const email = `${uniq()}@example.com`;
    await invite(db.owner, { email, team: a, role: 'player', playerId: await makeRosterEntry(db.owner, a) });
    await invite(db.owner, { email, team: b, role: 'player', playerId: await makeRosterEntry(db.owner, b) });

    const u = await signUp(db.owner, { email, role: 'player' });
    await confirm(db.owner, u.id);

    expect(await profile(db, u.id)).toMatchObject({ status: 'pending_approval', player_id: null, role: 'guest' });
    expect(await one(db.owner,
      `select count(*)::int as n from public.invitations where email = $1 and accepted_at is not null`, [email]))
      .toEqual({ n: 0 });
  });

  it('skips a player invitation whose roster entry someone else has since claimed', async () => {
    const team = await makeTeam(db.owner);
    const player = await makeRosterEntry(db.owner, team);
    const other = await signUp(db.owner, { confirmed: true });
    await db.owner.query(`update public.profiles set player_id = $2 where id = $1`, [other.id, player]);

    const email = `${uniq()}@example.com`;
    await invite(db.owner, { email, team, role: 'player', playerId: player });
    const u = await signUp(db.owner, { email, role: 'guest' });
    await confirm(db.owner, u.id);

    expect(await profile(db, u.id)).toMatchObject({ player_id: null, role: 'guest', status: 'active' });
  });

  it('will not let a visitor run the promotion themselves', async () => {
    const u = await signUp(db.owner, { role: 'coach' });
    await db.asUser(u.id, async (c) => {
      await expect(c.query(`select public.promote_confirmed_profile($1)`, [u.id]))
        .rejects.toMatchObject({ code: '42501' });
    });
  });

  it('refuses a visitor changing their own role, status, roster link or requested team', async () => {
    const team = await makeTeam(db.owner);
    const player = await makeRosterEntry(db.owner, team);
    const u = await signUp(db.owner, { confirmed: true });

    for (const change of [
      `role = 'coach'`, `status = 'rejected'`, `player_id = '${player}'`, `requested_team_id = '${team.id}'`
    ]) {
      await db.asUser(u.id, async (c) => {
        await expect(c.query(`update public.profiles set ${change} where id = $1`, [u.id]))
          .rejects.toThrow(/Only an admin/);
      });
    }
  });

  it('still lets a visitor change their own name', async () => {
    const u = await signUp(db.owner, { confirmed: true });
    await db.asUser(u.id, async (c) => {
      await c.query(`update public.profiles set name = 'New Name' where id = $1`, [u.id]);
      expect(await one(c, `select name from public.profiles where id = $1`, [u.id])).toEqual({ name: 'New Name' });
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/data/testdb/account-triggers.test.ts`
Expected: FAIL — `relation "public.invitations" does not exist` (from `invite`) and assertions on `requested_team_id`. If every test reports **skipped**, no Postgres is answering: start it before continuing — a skipped suite proves nothing.

- [ ] **Step 4: Write the migration's first half**

Create `supabase/migrations/0035_account_invitations.sql`:

```sql
-- 0035: invitations, and the confirmation that is the only place access is granted
--
-- Spec: docs/superpowers/specs/2026-09-14-account-invitations-design.md
--
-- APPLY BEFORE DEPLOYING THE MATCHING CLIENT. The current client sends no
-- requested_team_id, so until it is deployed its player and coach sign-ups
-- become pending requests with no team, which pending_requests() shows to
-- admins.
--
-- Supersedes the sign-up half of supabase_migration_auth.sql and of 0013: both
-- triggers on auth.users are replaced, and re-created with drop-if-exists, so
-- this is correct whichever of those the live functions came from.

begin;

set role postgres;

-- ─── 1. invitations ────────────────────────────────────────────────────────
--
-- Emails live here and never on players, which is publicly readable: many of
-- these addresses belong to minors. Readable by the team's coaches and admins
-- only (is_team_coach includes admins), and closed in the migration that
-- creates the table -- 0001 exists because a readable email column shipped
-- once already. There is no insert, update or delete policy: every write goes
-- through the functions in section 5.

create table if not exists public.invitations (
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

create unique index if not exists invitations_open_email_team
  on public.invitations (email, team_id)
  where accepted_at is null and revoked_at is null;

alter table public.invitations enable row level security;

drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select using (public.is_team_coach(team_id));

revoke all on table public.invitations from anon, authenticated;
grant select on table public.invitations to authenticated;

alter table public.profiles
  add column if not exists requested_team_id uuid references public.teams(id) on delete set null;

-- ─── 2. The guard on privileged profile columns ────────────────────────────
--
-- SECURITY INVOKER, so current_user is whoever is actually writing. A visitor's
-- own update arrives as `authenticated`; the approval functions and the
-- confirmation triggers are SECURITY DEFINER and write as their owner. Checking
-- auth.uid() alone cannot tell those apart -- inside a definer function it is
-- still the coach's id, taken from the request's JWT -- so every approval by a
-- coach would be refused.
--
-- It must not reference the auth schema itself: running as the visitor, a
-- name lookup in `auth` needs USAGE on that schema, which a plain Postgres does
-- not grant. current_profile_role() is SECURITY DEFINER and reads auth.uid() as
-- its owner, and a request with no user cannot reach this row through
-- profiles_update in the first place.
--
-- player_id and requested_team_id join the guarded columns: a visitor who could
-- set their own player_id could attach themselves to any roster entry and read
-- that team's members-only content.

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if public.current_profile_role() = 'admin' then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.school_id is distinct from old.school_id
     or new.player_id is distinct from old.player_id
     or new.requested_team_id is distinct from old.requested_team_id then
    raise exception 'Only an admin can change role, status, school, roster link or requested team.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ─── 3. promote_confirmed_profile: the one place access is granted ─────────
--
-- Only a profile still at pending_verification is touched, so a later
-- confirmation cannot knock a settled account back into the queue.

create or replace function public.promote_confirmed_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prof     public.profiles%rowtype;
  inv      public.invitations%rowtype;
  redeemed integer := 0;
  school   uuid;
begin
  select * into prof from public.profiles where id = p_user_id for update;
  if not found or prof.status <> 'pending_verification' then
    return;
  end if;

  -- Invitations naming different roster entries: apply none. Guessing which
  -- person someone is puts a player on a squad they never played for.
  if (select count(distinct i.player_id)
        from public.invitations i
       where i.email = lower(prof.email)
         and i.accepted_at is null and i.revoked_at is null
         and i.role = 'player') > 1 then
    update public.profiles set status = 'pending_approval', email_verified = true where id = p_user_id;
    return;
  end if;

  for inv in
    select * from public.invitations i
     where i.email = lower(prof.email)
       and i.accepted_at is null and i.revoked_at is null
     order by i.created_at
  loop
    if inv.role = 'player' then
      -- The roster entry may have been claimed by another account since.
      if exists (select 1 from public.profiles p where p.player_id = inv.player_id and p.id <> p_user_id) then
        continue;
      end if;
      update public.profiles
         set player_id = inv.player_id,
             role = case when role = 'coach' then 'coach' else 'player' end
       where id = p_user_id;
    else
      insert into public.team_coaches (team_id, profile_id)
      values (inv.team_id, p_user_id)
      on conflict do nothing;
      update public.profiles set role = 'coach' where id = p_user_id;
    end if;

    -- The first organization redeemed is the one the profile names.
    school := coalesce(school, inv.school_id);
    update public.invitations set accepted_at = now(), accepted_by = p_user_id where id = inv.id;
    redeemed := redeemed + 1;
  end loop;

  if redeemed > 0 then
    update public.profiles
       set status = 'active', email_verified = true, school_id = school
     where id = p_user_id;
  elsif prof.requested_role in ('player', 'coach') then
    update public.profiles set status = 'pending_approval', email_verified = true where id = p_user_id;
  else
    update public.profiles set status = 'active', role = 'guest', email_verified = true where id = p_user_id;
  end if;
end;
$$;

revoke all on function public.promote_confirmed_profile(uuid) from public, anon, authenticated;

-- ─── 4. The triggers on auth.users ─────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := lower(coalesce(new.raw_user_meta_data ->> 'requested_role', 'guest'));
  team_text text := new.raw_user_meta_data ->> 'requested_team_id';
  team      public.teams%rowtype;
begin
  -- The metadata is written by the browser. Admin, or anything else, is a guest.
  if requested not in ('player', 'coach', 'guest') then
    requested := 'guest';
  end if;

  if requested <> 'guest'
     and team_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into team from public.teams
     where id = team_text::uuid and not coalesce(is_deleted, false);
  end if;

  insert into public.profiles
    (id, school_id, name, email, role, requested_role, requested_team_id, status, email_verified)
  values (
    new.id,
    team.school_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    'guest',
    requested,
    team.id,
    'pending_verification',
    false
  );

  -- Confirmation switched off, or an account created already confirmed: there
  -- will be no UPDATE for handle_user_confirmed to see.
  if new.email_confirmed_at is not null then
    perform public.promote_confirmed_profile(new.id);
  end if;

  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.promote_confirmed_profile(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

commit;
```

- [ ] **Step 5: Run the trigger tests**

Run: `npx vitest run src/data/testdb/account-triggers.test.ts`
Expected: PASS, 16 tests, none skipped.

- [ ] **Step 6: Run the demo and schema suites the triggers also serve**

Run: `npx vitest run src/data/testdb/demo-accounts.test.ts src/data/testdb/demo-schema-steps.test.ts src/data/testdb/demo-rebuild.test.ts`
Expected: PASS. `demo_build_accounts` inserts profiles with `on conflict (id) do update`, so the profile the new trigger creates first is overwritten as before. If a test fails, read the failing step name `runSteps` reports before changing anything.

- [ ] **Step 7: Run the gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: all three `0`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0035_account_invitations.sql src/data/testdb/accounts-db.ts src/data/testdb/account-triggers.test.ts
git commit -m "feat: invitations, redeemed only when the email is confirmed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The functions the app calls

**Files:**
- Modify: `supabase/migrations/0035_account_invitations.sql` (insert section 5 before the final `commit;`)
- Create: `src/data/testdb/account-rpc.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produced, including the `accounts-db.ts` helpers.
- Produces (all `security definer`, executable by `authenticated` only):
  - `public.create_invitation(p_email text, p_team_id uuid, p_role text, p_player_id uuid default null) returns public.invitations`
  - `public.revoke_invitation(p_invitation_id uuid) returns void`
  - `public.pending_requests() returns table (id uuid, name text, email text, requested_role text, requested_team_id uuid, team_name text, school_name text, created_at timestamptz)`
  - `public.approve_player_request(p_profile_id uuid, p_team_id uuid, p_player_id uuid default null) returns uuid` (the players.id linked)
  - `public.approve_coach_request(p_profile_id uuid, p_team_id uuid) returns void`
  - `public.reject_request(p_profile_id uuid) returns void`
  - `public.team_linked_players(p_team_id uuid) returns table (player_id uuid)`

- [ ] **Step 1: Write the failing RPC tests**

Create `src/data/testdb/account-rpc.test.ts`:

```ts
/**
 * 0035's functions, asked as real visitors.
 *
 * Every call here runs on an `authenticated` connection with the caller's id
 * as the JWT subject. The superuser harness would pass all of them -- including
 * the coach approval the profile guard used to refuse.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb } from './harness';
import {
  buildAccountsDb, one, uniq, makeTeam, makeRosterEntry, signUp, confirm, makeCoach, makeAdmin, invite,
  type AccountsDb
} from './accounts-db';

const available = await hasTestDb();

/** A confirmed, uninvited request for a place on `teamId`, or on no team. */
async function request(db: AccountsDb, role: 'player' | 'coach', teamId?: string) {
  const u = await signUp(db.owner, { role, teamId, name: 'Riley Stone' });
  await confirm(db.owner, u.id);
  return u.id;
}

describe.skipIf(!available)('0035: inviting, approving and rejecting', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  describe('create_invitation', () => {
    it("lets a coach invite a player to their own team's roster", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const player = await makeRosterEntry(db.owner, team);
      await db.asUser(coach, async (c) => {
        const row = await one(c, `select * from public.create_invitation($1, $2, 'player', $3)`,
          ['  Kid@Example.COM ', team.id, player]);
        expect(row).toMatchObject({ email: 'kid@example.com', team_id: team.id, player_id: player, invited_by: coach });
      });
    });

    it("refuses a coach inviting to another team", async () => {
      const mine = await makeTeam(db.owner);
      const theirs = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, mine);
      const player = await makeRosterEntry(db.owner, theirs);
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'player', $3)`,
          [`${uniq()}@example.com`, theirs.id, player])).rejects.toThrow(/Only a coach of this team/);
      });
    });

    it('refuses a coach inviting a coach', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'coach')`,
          [`${uniq()}@example.com`, team.id])).rejects.toThrow(/Only an admin can invite a coach/);
      });
    });

    it('lets an admin invite a coach', async () => {
      const team = await makeTeam(db.owner);
      const admin = await makeAdmin(db.owner);
      await db.asUser(admin, async (c) => {
        const row = await one(c, `select * from public.create_invitation($1, $2, 'coach')`,
          [`${uniq()}@example.com`, team.id]);
        expect(row).toMatchObject({ role: 'coach', player_id: null });
      });
    });

    it('refuses a roster entry that is not on the team, or already has an account', async () => {
      const team = await makeTeam(db.owner);
      const other = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const elsewhere = await makeRosterEntry(db.owner, other);
      const claimed = await makeRosterEntry(db.owner, team);
      const holder = await signUp(db.owner, { confirmed: true });
      await db.owner.query(`update public.profiles set player_id = $2 where id = $1`, [holder.id, claimed]);

      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'player', $3)`,
          [`${uniq()}@example.com`, team.id, elsewhere])).rejects.toThrow(/not on this team's roster/);
      });
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'player', $3)`,
          [`${uniq()}@example.com`, team.id, claimed])).rejects.toThrow(/already has an account/);
      });
    });

    it('refuses a second open invitation for one address and team, and a non-address', async () => {
      const team = await makeTeam(db.owner);
      const admin = await makeAdmin(db.owner);
      const email = `${uniq()}@example.com`;
      await invite(db.owner, { email, team, role: 'coach' });
      await db.asUser(admin, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'coach')`, [email, team.id]))
          .rejects.toThrow(/already has an open invitation/);
      });
      await db.asUser(admin, async (c) => {
        await expect(c.query(`select public.create_invitation('not an address', $1, 'coach')`, [team.id]))
          .rejects.toThrow(/does not look like an email address/);
      });
    });
  });

  describe('reading invitations', () => {
    it("shows a coach their own team's invitations and nobody else's", async () => {
      const mine = await makeTeam(db.owner);
      const theirs = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, mine);
      const guest = await signUp(db.owner, { confirmed: true });
      await invite(db.owner, { email: `${uniq()}@example.com`, team: mine, role: 'coach' });
      await invite(db.owner, { email: `${uniq()}@example.com`, team: theirs, role: 'coach' });

      await db.asUser(coach, async (c) => {
        const { rows } = await c.query(`select team_id from public.invitations where team_id in ($1, $2)`, [mine.id, theirs.id]);
        expect(rows).toEqual([{ team_id: mine.id }]);
      });
      await db.asUser(guest.id, async (c) => {
        expect((await c.query(`select id from public.invitations`)).rows).toEqual([]);
      });
    });

    it('refuses writing the table directly, even for a coach', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(c.query(
          `insert into public.invitations (email, school_id, team_id, role) values ('x@example.com', $1, $2, 'coach')`,
          [team.school_id, team.id])).rejects.toMatchObject({ code: '42501' });
      });
    });
  });

  describe('revoke_invitation', () => {
    it("lets a coach withdraw their team's player invitation but not a coach's", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const playerInv = await invite(db.owner, {
        email: `${uniq()}@example.com`, team, role: 'player', playerId: await makeRosterEntry(db.owner, team)
      });
      const coachInv = await invite(db.owner, { email: `${uniq()}@example.com`, team, role: 'coach' });

      await db.asUser(coach, async (c) => {
        await c.query(`select public.revoke_invitation($1)`, [playerInv.id]);
        const row = await one(c, `select revoked_at from public.invitations where id = $1`, [playerInv.id]);
        expect(row.revoked_at).not.toBeNull();
      });
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.revoke_invitation($1)`, [coachInv.id]))
          .rejects.toThrow(/Only an admin/);
      });
    });
  });

  describe('pending_requests', () => {
    it("shows a coach only player requests for teams they coach", async () => {
      const mine = await makeTeam(db.owner);
      const theirs = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, mine);
      const wanted = await request(db, 'player', mine.id);
      await request(db, 'player', theirs.id);
      await request(db, 'coach', mine.id);

      await db.asUser(coach, async (c) => {
        const { rows } = await c.query(`select id, requested_role, team_name from public.pending_requests()`);
        expect(rows).toEqual([{ id: wanted, requested_role: 'player', team_name: 'U14' }]);
      });
    });

    it('shows an admin every request, including one that named no team', async () => {
      const admin = await makeAdmin(db.owner);
      const teamless = await request(db, 'player');
      await db.asUser(admin, async (c) => {
        const { rows } = await c.query(`select id from public.pending_requests()`);
        expect(rows.map((r: any) => r.id)).toContain(teamless);
      });
    });
  });

  describe('approve_player_request', () => {
    it('creates the roster entry and links the account, through the profile guard', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const req = await request(db, 'player', team.id);

      await db.asUser(coach, async (c) => {
        const { approve_player_request: pid } = await one(c,
          `select public.approve_player_request($1, $2)`, [req, team.id]);
        expect(await one(c, `select role, status, player_id, school_id from public.profiles where id = $1`, [req]))
          .toEqual({ role: 'player', status: 'active', player_id: pid, school_id: team.school_id });
        expect(await one(c, `select name from public.players where id = $1`, [pid])).toEqual({ name: 'Riley Stone' });
        expect(await one(c,
          `select count(*)::int as n from public.team_players where team_id = $1 and player_id = $2`, [team.id, pid]))
          .toEqual({ n: 1 });
      });
    });

    it('links an existing roster entry, and refuses one already linked', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const free = await makeRosterEntry(db.owner, team);
      const claimed = await makeRosterEntry(db.owner, team);
      const holder = await signUp(db.owner, { confirmed: true });
      await db.owner.query(`update public.profiles set player_id = $2 where id = $1`, [holder.id, claimed]);
      const req = await request(db, 'player', team.id);

      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.approve_player_request($1, $2, $3)`, [req, team.id, claimed]))
          .rejects.toThrow(/already has an account/);
      });
      await db.asUser(coach, async (c) => {
        await c.query(`select public.approve_player_request($1, $2, $3)`, [req, team.id, free]);
        expect(await one(c, `select player_id from public.profiles where id = $1`, [req])).toEqual({ player_id: free });
      });
    });

    it('refuses a coach placing a request on a team other than the one requested', async () => {
      const mine = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, mine);
      const other = await makeTeam(db.owner);
      await db.owner.query(`insert into public.team_coaches (team_id, profile_id) values ($1, $2)`, [other.id, coach]);
      const req = await request(db, 'player', mine.id);
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.approve_player_request($1, $2)`, [req, other.id]))
          .rejects.toThrow(/Only an admin can place a request on a team other than/);
      });
    });

    it('lets an admin place a request that named no team', async () => {
      const team = await makeTeam(db.owner);
      const admin = await makeAdmin(db.owner);
      const req = await request(db, 'player');
      await db.asUser(admin, async (c) => {
        await c.query(`select public.approve_player_request($1, $2)`, [req, team.id]);
        expect(await one(c, `select status, school_id from public.profiles where id = $1`, [req]))
          .toEqual({ status: 'active', school_id: team.school_id });
      });
    });

    it("still refuses a coach changing another profile's role directly", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const req = await request(db, 'player', team.id);
      await db.asUser(coach, async (c) => {
        // profiles_update allows only the row's owner or an admin, so the
        // update matches no row rather than raising.
        const res = await c.query(`update public.profiles set role = 'coach' where id = $1`, [req]);
        expect(res.rowCount).toBe(0);
      });
    });
  });

  describe('approve_coach_request and reject_request', () => {
    it('refuses a coach approving a coach, and lets an admin', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const admin = await makeAdmin(db.owner);
      const req = await request(db, 'coach', team.id);

      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.approve_coach_request($1, $2)`, [req, team.id]))
          .rejects.toThrow(/Only an admin can approve a coach/);
      });
      await db.asUser(admin, async (c) => {
        await c.query(`select public.approve_coach_request($1, $2)`, [req, team.id]);
        expect(await one(c, `select role, status from public.profiles where id = $1`, [req]))
          .toEqual({ role: 'coach', status: 'active' });
        expect(await one(c,
          `select count(*)::int as n from public.team_coaches where team_id = $1 and profile_id = $2`, [team.id, req]))
          .toEqual({ n: 1 });
      });
    });

    it("lets a coach refuse their team's player request but not a coach request", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const player = await request(db, 'player', team.id);
      const staff = await request(db, 'coach', team.id);

      await db.asUser(coach, async (c) => {
        await c.query(`select public.reject_request($1)`, [player]);
        expect(await one(c, `select status from public.profiles where id = $1`, [player])).toEqual({ status: 'rejected' });
      });
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.reject_request($1)`, [staff])).rejects.toThrow(/Only an admin/);
      });
    });
  });

  describe('team_linked_players', () => {
    it("tells a team's coach which roster entries have accounts, and tells anyone else nothing", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const outsider = await makeCoach(db.owner, await makeTeam(db.owner));
      const linked = await makeRosterEntry(db.owner, team);
      await makeRosterEntry(db.owner, team);
      const holder = await signUp(db.owner, { confirmed: true });
      await db.owner.query(`update public.profiles set player_id = $2 where id = $1`, [holder.id, linked]);

      await db.asUser(coach, async (c) => {
        expect((await c.query(`select player_id from public.team_linked_players($1)`, [team.id])).rows)
          .toEqual([{ player_id: linked }]);
      });
      await db.asUser(outsider, async (c) => {
        expect((await c.query(`select player_id from public.team_linked_players($1)`, [team.id])).rows).toEqual([]);
      });
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/testdb/account-rpc.test.ts`
Expected: FAIL — `function public.create_invitation(...) does not exist` and the like. None skipped.

- [ ] **Step 3: Add section 5 to the migration**

In `supabase/migrations/0035_account_invitations.sql`, insert this block immediately before the final `commit;`:

```sql
-- ─── 5. The functions the app calls ────────────────────────────────────────
--
-- Each checks its caller before doing anything, and refuses with a sentence
-- the app shows as-is. Coaches handle players on their own team; only an admin
-- handles coaches, so a coach can never create another coach.

create or replace function public.create_invitation(
  p_email text, p_team_id uuid, p_role text, p_player_id uuid default null
)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  addr   text := lower(trim(coalesce(p_email, '')));
  team   public.teams%rowtype;
  result public.invitations;
begin
  if addr !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That does not look like an email address.';
  end if;

  select * into team from public.teams where id = p_team_id and not coalesce(is_deleted, false);
  if not found then
    raise exception 'That team does not exist.';
  end if;

  if p_role = 'player' then
    if not public.is_team_coach(p_team_id) then
      raise exception 'Only a coach of this team can invite its players.';
    end if;
    if p_player_id is null or not exists (
      select 1 from public.team_players tp
       where tp.team_id = p_team_id and tp.player_id = p_player_id and not coalesce(tp.is_deleted, false)
    ) then
      raise exception 'That player is not on this team''s roster.';
    end if;
    if exists (select 1 from public.profiles p where p.player_id = p_player_id) then
      raise exception 'That player already has an account.';
    end if;
  elsif p_role = 'coach' then
    if public.current_profile_role() <> 'admin' then
      raise exception 'Only an admin can invite a coach.';
    end if;
    p_player_id := null;
  else
    raise exception 'An invitation is for a player or a coach.';
  end if;

  if exists (
    select 1 from public.invitations i
     where i.email = addr and i.team_id = p_team_id and i.accepted_at is null and i.revoked_at is null
  ) then
    raise exception 'That address already has an open invitation to this team.';
  end if;

  insert into public.invitations (email, school_id, team_id, role, player_id, invited_by)
  values (addr, team.school_id, p_team_id, p_role, p_player_id, auth.uid())
  returning * into result;
  return result;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
begin
  select * into inv from public.invitations where id = p_invitation_id;
  if not found then
    raise exception 'That invitation does not exist.';
  end if;
  if inv.role = 'coach' and public.current_profile_role() <> 'admin' then
    raise exception 'Only an admin can withdraw a coach''s invitation.';
  end if;
  if inv.role = 'player' and not public.is_team_coach(inv.team_id) then
    raise exception 'Only a coach of this team can withdraw its invitations.';
  end if;
  if inv.accepted_at is not null then
    raise exception 'That invitation has already been used.';
  end if;
  update public.invitations set revoked_at = now() where id = p_invitation_id and revoked_at is null;
end;
$$;

create or replace function public.pending_requests()
returns table (
  id uuid, name text, email text, requested_role text, requested_team_id uuid,
  team_name text, school_name text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.email, p.requested_role, p.requested_team_id, t.name, s.name, p.created_at
    from public.profiles p
    left join public.teams t on t.id = p.requested_team_id
    left join public.schools s on s.id = t.school_id
   where p.status = 'pending_approval'
     and not coalesce(p.is_deleted, false)
     and (
       public.current_profile_role() = 'admin'
       or (p.requested_role = 'player'
           and p.requested_team_id is not null
           and public.is_team_coach(p.requested_team_id))
     )
   order by p.created_at;
$$;

create or replace function public.approve_player_request(
  p_profile_id uuid, p_team_id uuid, p_player_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles%rowtype;
  team public.teams%rowtype;
  pid  uuid := p_player_id;
begin
  select * into prof from public.profiles where id = p_profile_id for update;
  if not found or prof.status <> 'pending_approval' then
    raise exception 'That request is no longer waiting.';
  end if;
  if prof.requested_role <> 'player' then
    raise exception 'That is not a request to join as a player.';
  end if;
  if p_team_id is null then
    raise exception 'Choose the team to place them on.';
  end if;
  if p_team_id is distinct from prof.requested_team_id and public.current_profile_role() <> 'admin' then
    raise exception 'Only an admin can place a request on a team other than the one requested.';
  end if;
  if not public.is_team_coach(p_team_id) then
    raise exception 'Only a coach of that team can approve its players.';
  end if;

  select * into team from public.teams where id = p_team_id and not coalesce(is_deleted, false);
  if not found then
    raise exception 'That team does not exist.';
  end if;

  if pid is null then
    insert into public.players (name, class_year) values (prof.name, '') returning id into pid;
    insert into public.team_players (team_id, school_id, player_id) values (p_team_id, team.school_id, pid);
  else
    if not exists (
      select 1 from public.team_players tp
       where tp.team_id = p_team_id and tp.player_id = pid and not coalesce(tp.is_deleted, false)
    ) then
      raise exception 'That player is not on this team''s roster.';
    end if;
    if exists (select 1 from public.profiles p where p.player_id = pid) then
      raise exception 'That player already has an account.';
    end if;
  end if;

  update public.profiles
     set role = 'player', status = 'active', school_id = team.school_id, player_id = pid
   where id = p_profile_id;
  return pid;
end;
$$;

create or replace function public.approve_coach_request(p_profile_id uuid, p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles%rowtype;
  team public.teams%rowtype;
begin
  if public.current_profile_role() <> 'admin' then
    raise exception 'Only an admin can approve a coach.';
  end if;
  select * into prof from public.profiles where id = p_profile_id for update;
  if not found or prof.status <> 'pending_approval' then
    raise exception 'That request is no longer waiting.';
  end if;
  if prof.requested_role <> 'coach' then
    raise exception 'That is not a request to join as a coach.';
  end if;
  select * into team from public.teams where id = p_team_id and not coalesce(is_deleted, false);
  if not found then
    raise exception 'Choose the team to place them on.';
  end if;

  insert into public.team_coaches (team_id, profile_id) values (p_team_id, p_profile_id)
  on conflict do nothing;
  update public.profiles
     set role = 'coach', status = 'active', school_id = team.school_id
   where id = p_profile_id;
end;
$$;

create or replace function public.reject_request(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles%rowtype;
begin
  select * into prof from public.profiles where id = p_profile_id for update;
  if not found or prof.status <> 'pending_approval' then
    raise exception 'That request is no longer waiting.';
  end if;
  if prof.requested_role = 'player' and prof.requested_team_id is not null then
    if not public.is_team_coach(prof.requested_team_id) then
      raise exception 'Only a coach of that team can refuse its players.';
    end if;
  elsif public.current_profile_role() <> 'admin' then
    raise exception 'Only an admin can refuse that request.';
  end if;
  update public.profiles set status = 'rejected' where id = p_profile_id;
end;
$$;

create or replace function public.team_linked_players(p_team_id uuid)
returns table (player_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.player_id
    from public.profiles p
    join public.team_players tp
      on tp.player_id = p.player_id and tp.team_id = p_team_id and not coalesce(tp.is_deleted, false)
   where public.is_team_coach(p_team_id);
$$;

revoke all on function public.create_invitation(text, uuid, text, uuid) from public, anon;
revoke all on function public.revoke_invitation(uuid)                   from public, anon;
revoke all on function public.pending_requests()                        from public, anon;
revoke all on function public.approve_player_request(uuid, uuid, uuid)  from public, anon;
revoke all on function public.approve_coach_request(uuid, uuid)         from public, anon;
revoke all on function public.reject_request(uuid)                      from public, anon;
revoke all on function public.team_linked_players(uuid)                 from public, anon;

grant execute on function public.create_invitation(text, uuid, text, uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid)                   to authenticated;
grant execute on function public.pending_requests()                        to authenticated;
grant execute on function public.approve_player_request(uuid, uuid, uuid)  to authenticated;
grant execute on function public.approve_coach_request(uuid, uuid)         to authenticated;
grant execute on function public.reject_request(uuid)                      to authenticated;
grant execute on function public.team_linked_players(uuid)                 to authenticated;
```

- [ ] **Step 4: Run both database suites**

Run: `npx vitest run src/data/testdb/account-rpc.test.ts src/data/testdb/account-triggers.test.ts`
Expected: PASS, none skipped.

- [ ] **Step 5: Prove the migration applies twice, as applying it to production effectively is**

Append to `src/data/testdb/account-triggers.test.ts`, inside the `describe` block:

```ts
  it('can be applied a second time', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync('supabase/migrations/0035_account_invitations.sql', 'utf8')
      .replace(/^\s*(begin|commit)\s*;\s*$/gim, '');
    await db.owner.query('begin');
    try {
      await db.owner.query(sql);
    } finally {
      await db.owner.query('rollback');
    }
  });
```

Run: `npx vitest run src/data/testdb/account-triggers.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: all `0`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0035_account_invitations.sql src/data/testdb/account-rpc.test.ts src/data/testdb/account-triggers.test.ts
git commit -m "feat: invite, approve and refuse through functions that check their caller

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The account service methods

**Files:**
- Modify: `src/types.ts` (append the three interfaces)
- Modify: `src/data/supabase.ts` (add an accounts block after `fetchOwnProfile`)
- Modify: `src/globals.d.ts` (declarations under `// Real Supabase Auth`)
- Create: `src/data/account-service.test.ts`

**Interfaces:**
- Consumes: the RPCs from Task 2; `report`, `this.client`, `this.isConfigured()`, `this.authRedirectUrl()`, `this.fetchTeamRoster(teamId)` in `src/data/supabase.ts`.
- Produces, on `supabaseService`:
  - `fetchJoinableTeams(): Promise<JoinableTeam[] | null>`
  - `createInvitation(email: string, teamId: string, role: 'player' | 'coach', playerId: string | null): Promise<AccountResult<Invitation>>`
  - `revokeInvitation(invitationId: string): Promise<AccountResult>`
  - `fetchTeamInvitations(teamId: string): Promise<Invitation[] | null>`
  - `fetchLinkedPlayerIds(teamId: string): Promise<string[] | null>`
  - `fetchUnlinkedRosterEntries(teamId: string): Promise<{ id: string; name: string }[] | null>`
  - `fetchPendingRequests(): Promise<PendingRequest[] | null>`
  - `approvePlayerRequest(profileId: string, teamId: string, playerId: string | null): Promise<AccountResult<string>>`
  - `approveCoachRequest(profileId: string, teamId: string): Promise<AccountResult>`
  - `rejectRequest(profileId: string): Promise<AccountResult>`
  - `requestPasswordReset(email: string): Promise<AccountResult>`
  - `updatePassword(password: string): Promise<AccountResult>`
  - where `AccountResult<T = unknown> = { ok: boolean; data?: T; error?: string }` (exported from `src/types.ts`).

- [ ] **Step 1: Add the types**

Append to `src/types.ts`:

```ts
/** A team a new account may ask to join, labelled by its organization. */
export interface JoinableTeam {
  id: string;
  name: string;
  season: string | null;
  schoolName: string;
}

/** A row of public.pending_requests(): only the requests the caller may act on. */
export interface PendingRequest {
  id: string;
  name: string;
  email: string;
  requested_role: 'player' | 'coach';
  requested_team_id: string | null;
  team_name: string | null;
  school_name: string | null;
  created_at: string;
}

/** An open invitation, as a team's coaches may read it. */
export interface Invitation {
  id: string;
  email: string;
  role: 'player' | 'coach';
  player_id: string | null;
  team_id: string;
  created_at: string;
}

/** An account write: the database's own sentence when it refuses. */
export interface AccountResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
```

- [ ] **Step 2: Write the failing service tests**

Create `src/data/account-service.test.ts`:

```ts
/// <reference types="vite/client" />
/**
 * The account methods: thin, and honest about refusals.
 *
 * Every privileged decision is made in Postgres (0035); these pin that each
 * method calls the right function with the right argument names -- a renamed
 * parameter reaches PostgREST as "function not found", which reads to a coach
 * as the app being broken -- and that a refusal comes back as the database's
 * own sentence.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

let rpcCalls: { fn: string; args: any }[];
let rpcResult: { data: any; error: any };
let fromRows: Record<string, any[]>;
let auth: any;

beforeEach(() => {
  rpcCalls = [];
  rpcResult = { data: null, error: null };
  fromRows = {};
  auth = {
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: {}, error: null })
  };
  svc.isConfigured = () => true;
  svc.client = {
    auth,
    rpc(fn: string, args: any) { rpcCalls.push({ fn, args }); return Promise.resolve(rpcResult); },
    from(table: string) {
      const api: any = {
        select() { return api; }, eq() { return api; }, is() { return api; }, order() { return api; },
        then(res: any) { return Promise.resolve({ data: fromRows[table] ?? [], error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the invitation functions', () => {
  it('invites with the argument names the database declares', async () => {
    rpcResult = { data: { id: 'i1' }, error: null };
    const res = await svc.createInvitation('kid@example.com', 't1', 'player', 'p1');
    expect(rpcCalls).toEqual([{ fn: 'create_invitation',
      args: { p_email: 'kid@example.com', p_team_id: 't1', p_role: 'player', p_player_id: 'p1' } }]);
    expect(res).toEqual({ ok: true, data: { id: 'i1' } });
  });

  it("returns the database's sentence when it refuses", async () => {
    rpcResult = { data: null, error: { message: 'Only an admin can invite a coach.' } };
    expect(await svc.createInvitation('a@example.com', 't1', 'coach', null))
      .toEqual({ ok: false, error: 'Only an admin can invite a coach.' });
  });

  it('revokes by invitation id', async () => {
    await svc.revokeInvitation('i1');
    expect(rpcCalls).toEqual([{ fn: 'revoke_invitation', args: { p_invitation_id: 'i1' } }]);
  });

  it('reads the linked roster entries as a list of ids', async () => {
    rpcResult = { data: [{ player_id: 'p1' }, { player_id: 'p2' }], error: null };
    expect(await svc.fetchLinkedPlayerIds('t1')).toEqual(['p1', 'p2']);
    expect(rpcCalls[0]).toEqual({ fn: 'team_linked_players', args: { p_team_id: 't1' } });
  });

  it('offers only roster entries with no account, by name', async () => {
    svc.fetchTeamRoster = vi.fn().mockResolvedValue([
      { players: { id: 'p2', name: 'Zed Abel' } },
      { players: { id: 'p1', name: 'Ann Bell' } },
      { players: { id: 'p3', name: 'Cy Dunn' } }
    ]);
    rpcResult = { data: [{ player_id: 'p3' }], error: null };
    expect(await svc.fetchUnlinkedRosterEntries('t1'))
      .toEqual([{ id: 'p1', name: 'Ann Bell' }, { id: 'p2', name: 'Zed Abel' }]);
  });

  it('says it could not read, rather than offering nobody, when a read fails', async () => {
    svc.fetchTeamRoster = vi.fn().mockResolvedValue(null);
    expect(await svc.fetchUnlinkedRosterEntries('t1')).toBeNull();
  });
});

describe('the request functions', () => {
  it('reads the queue from pending_requests', async () => {
    rpcResult = { data: [{ id: 'u1' }], error: null };
    expect(await svc.fetchPendingRequests()).toEqual([{ id: 'u1' }]);
    expect(rpcCalls[0]).toEqual({ fn: 'pending_requests', args: {} });
  });

  it('approves a player with the team and an optional roster entry', async () => {
    rpcResult = { data: 'p9', error: null };
    expect(await svc.approvePlayerRequest('u1', 't1', null)).toEqual({ ok: true, data: 'p9' });
    expect(rpcCalls[0]).toEqual({ fn: 'approve_player_request',
      args: { p_profile_id: 'u1', p_team_id: 't1', p_player_id: null } });
  });

  it('approves a coach and refuses through the same shape', async () => {
    await svc.approveCoachRequest('u1', 't1');
    await svc.rejectRequest('u2');
    expect(rpcCalls).toEqual([
      { fn: 'approve_coach_request', args: { p_profile_id: 'u1', p_team_id: 't1' } },
      { fn: 'reject_request', args: { p_profile_id: 'u2' } }
    ]);
  });
});

describe('teams to join', () => {
  it('lists teams by organization, then name', async () => {
    fromRows.teams = [
      { id: 't2', name: 'Varsity', season: '2026', schools: { name: 'Riverside High' } },
      { id: 't1', name: 'U16', season: null, schools: { name: 'Hawks FC' } },
      { id: 't3', name: 'JV', season: '2026', schools: { name: 'Riverside High' } }
    ];
    expect(await svc.fetchJoinableTeams()).toEqual([
      { id: 't1', name: 'U16', season: null, schoolName: 'Hawks FC' },
      { id: 't3', name: 'JV', season: '2026', schoolName: 'Riverside High' },
      { id: 't2', name: 'Varsity', season: '2026', schoolName: 'Riverside High' }
    ]);
  });
});

describe('passwords', () => {
  it('sends the reset link back to this site', async () => {
    svc.authRedirectUrl = () => 'https://example.test/';
    expect(await svc.requestPasswordReset('a@example.com')).toEqual({ ok: true });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@example.com', { redirectTo: 'https://example.test/' });
  });

  it('sets the new password on the signed-in recovery session', async () => {
    expect(await svc.updatePassword('longenough')).toEqual({ ok: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'longenough' });
  });

  it('returns the reason a new password was refused', async () => {
    auth.updateUser.mockResolvedValue({ data: null, error: { message: 'Password should be at least 6 characters.' } });
    expect(await svc.updatePassword('x')).toEqual({ ok: false, error: 'Password should be at least 6 characters.' });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/data/account-service.test.ts`
Expected: FAIL — `svc.createInvitation is not a function`.

- [ ] **Step 4: Implement the methods**

In `src/data/supabase.ts`, add to the type import at the top of the file (or add a new import line if there is none from `../types`): `import type { JoinableTeam, PendingRequest, Invitation, AccountResult } from '../types';`

Then insert immediately after the closing brace of `async fetchOwnProfile()`:

```ts
  // ── Accounts: invitations, requests, passwords ───────────────────────────
  //
  // Every privileged decision is made in Postgres by 0035's functions, which
  // check their caller and refuse in words. These pass arguments by the names
  // those functions declare and hand the refusal back unchanged.

  private async accountRpc<T = unknown>(fn: string, args: Record<string, any>): Promise<AccountResult<T>> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    try {
      const { data, error } = await this.client!.rpc(fn, args);
      if (error) { report(fn, error.message); return { ok: false, error: error.message }; }
      return { ok: true, data: data as T };
    } catch (e: any) {
      report(fn, e);
      return { ok: false, error: e?.message || String(e) };
    }
  }

  /**
   * Every live team a new account may ask to join. `teams` is publicly
   * readable, so this works signed out -- which is when sign-up needs it.
   */
  async fetchJoinableTeams(): Promise<JoinableTeam[] | null> {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client!
      .from('teams')
      .select('id, name, season, schools(name)')
      .eq('is_deleted', false)
      .order('name', { ascending: true });
    if (error) { report('fetchJoinableTeams', error.message); return null; }
    return (data || [])
      .map((t: any) => ({ id: t.id, name: t.name, season: t.season ?? null, schoolName: t.schools?.name || '' }))
      .sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.name.localeCompare(b.name));
  }

  async createInvitation(
    email: string, teamId: string, role: 'player' | 'coach', playerId: string | null
  ): Promise<AccountResult<Invitation>> {
    return this.accountRpc<Invitation>('create_invitation', {
      p_email: email, p_team_id: teamId, p_role: role, p_player_id: playerId
    });
  }

  async revokeInvitation(invitationId: string): Promise<AccountResult> {
    return this.accountRpc('revoke_invitation', { p_invitation_id: invitationId });
  }

  /** Open invitations to a team. RLS shows them to its coaches and admins only. */
  async fetchTeamInvitations(teamId: string): Promise<Invitation[] | null> {
    if (!this.isConfigured() || !teamId) return null;
    const { data, error } = await this.client!
      .from('invitations')
      .select('id, email, role, player_id, team_id, created_at')
      .eq('team_id', teamId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: true });
    if (error) { report('fetchTeamInvitations', error.message); return null; }
    return (data || []) as Invitation[];
  }

  /** Which of a team's roster entries already have an account. */
  async fetchLinkedPlayerIds(teamId: string): Promise<string[] | null> {
    const res = await this.accountRpc<{ player_id: string }[]>('team_linked_players', { p_team_id: teamId });
    return res.ok ? (res.data || []).map(r => r.player_id) : null;
  }

  /** The roster entries a request could be linked to: on the team, with no account. */
  async fetchUnlinkedRosterEntries(teamId: string): Promise<{ id: string; name: string }[] | null> {
    const [roster, linked] = await Promise.all([this.fetchTeamRoster(teamId), this.fetchLinkedPlayerIds(teamId)]);
    if (roster === null || linked === null) return null;
    const taken = new Set(linked);
    return roster
      .map((m: any) => ({ id: m?.players?.id, name: m?.players?.name || '' }))
      .filter(p => p.id && !taken.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The requests this caller may act on -- decided by the database, not by a filter here. */
  async fetchPendingRequests(): Promise<PendingRequest[] | null> {
    const res = await this.accountRpc<PendingRequest[]>('pending_requests', {});
    return res.ok ? (res.data || []) : null;
  }

  async approvePlayerRequest(profileId: string, teamId: string, playerId: string | null): Promise<AccountResult<string>> {
    return this.accountRpc<string>('approve_player_request', {
      p_profile_id: profileId, p_team_id: teamId, p_player_id: playerId
    });
  }

  async approveCoachRequest(profileId: string, teamId: string): Promise<AccountResult> {
    return this.accountRpc('approve_coach_request', { p_profile_id: profileId, p_team_id: teamId });
  }

  async rejectRequest(profileId: string): Promise<AccountResult> {
    return this.accountRpc('reject_request', { p_profile_id: profileId });
  }

  async requestPasswordReset(email: string): Promise<AccountResult> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud authentication is not configured.' };
    try {
      const { error } = await this.client!.auth.resetPasswordForEmail(email, { redirectTo: this.authRedirectUrl() });
      if (error) { report('Auth', error.message); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      report('Auth', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async updatePassword(password: string): Promise<AccountResult> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud authentication is not configured.' };
    try {
      const { error } = await this.client!.auth.updateUser({ password });
      if (error) { report('Auth', error.message); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      report('Auth', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }
```

In `src/globals.d.ts`, under `// Real Supabase Auth`, add (importing the types at the top of the file the way the file already imports others, e.g. `import type { JoinableTeam, PendingRequest, Invitation, AccountResult } from './types';` — if the file has no imports, write the types inline as `import('./types').JoinableTeam`):

```ts
    fetchJoinableTeams(): Promise<import('./types').JoinableTeam[] | null>;
    createInvitation(email: string, teamId: string, role: 'player' | 'coach', playerId: string | null):
      Promise<import('./types').AccountResult<import('./types').Invitation>>;
    revokeInvitation(invitationId: string): Promise<import('./types').AccountResult>;
    fetchTeamInvitations(teamId: string): Promise<import('./types').Invitation[] | null>;
    fetchLinkedPlayerIds(teamId: string): Promise<string[] | null>;
    fetchUnlinkedRosterEntries(teamId: string): Promise<{ id: string; name: string }[] | null>;
    fetchPendingRequests(): Promise<import('./types').PendingRequest[] | null>;
    approvePlayerRequest(profileId: string, teamId: string, playerId: string | null):
      Promise<import('./types').AccountResult<string>>;
    approveCoachRequest(profileId: string, teamId: string): Promise<import('./types').AccountResult>;
    rejectRequest(profileId: string): Promise<import('./types').AccountResult>;
    requestPasswordReset(email: string): Promise<import('./types').AccountResult>;
    updatePassword(password: string): Promise<import('./types').AccountResult>;
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/data/account-service.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Run the gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: all `0`.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/data/supabase.ts src/globals.d.ts src/data/account-service.test.ts
git commit -m "feat: account service methods over the invitation and approval functions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: One approval queue, on `pending_requests()`

**Files:**
- Rewrite: `src/components/admin/ApprovalsSection.vue`, `src/components/admin/ApprovalsSection.test.ts`
- Modify: `src/views/AdminView.vue` (the `ApprovalsSection` props), `src/views/AdminView.test.ts` (its `auth` mock)
- Modify: `src/stores/coaches.ts`, `src/stores/coaches.test.ts`
- Modify: `src/views/CoachesView.vue`, `src/views/CoachesView.test.ts`
- Modify: `src/auth.ts` (remove `approveUserAccess`, `rejectUserAccess`, `getPendingApprovals`)
- Modify: `src/data/supabase.ts`, `src/globals.d.ts`, `src/data/org-required.test.ts` (remove `approveProfile`, `rejectProfile`, `fetchPendingApprovals`)

**Interfaces:**
- Consumes: `fetchPendingRequests`, `approvePlayerRequest`, `approveCoachRequest`, `rejectRequest`, `fetchUnlinkedRosterEntries`, `fetchJoinableTeams` (Task 3); `PendingRequest`, `JoinableTeam` types.
- Produces: `ApprovalsSection` with props `{ isAdmin: boolean }`; coaches store `loadPending(): Promise<void>` filling `pending: PendingRequest[]` (no argument); `approve`/`reject` removed from the store.

- [ ] **Step 1: Write the failing queue tests**

Replace `src/components/admin/ApprovalsSection.test.ts` with:

```ts
/**
 * Accounts waiting for approval, read from pending_requests().
 *
 * The database decides who sees what: a coach gets player requests for their
 * own teams, an admin gets everything. This component's job is to make the
 * one decision each request needs -- which roster entry, and for a request
 * that named no team, which team -- and never to offer a button the database
 * would refuse.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ApprovalsSection from './ApprovalsSection.vue';

const fetchPendingRequests = vi.fn();
const fetchUnlinkedRosterEntries = vi.fn();
const fetchJoinableTeams = vi.fn();
const approvePlayerRequest = vi.fn();
const approveCoachRequest = vi.fn();
const rejectRequest = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchPendingRequests: (...a: any[]) => fetchPendingRequests(...a),
    fetchUnlinkedRosterEntries: (...a: any[]) => fetchUnlinkedRosterEntries(...a),
    fetchJoinableTeams: (...a: any[]) => fetchJoinableTeams(...a),
    approvePlayerRequest: (...a: any[]) => approvePlayerRequest(...a),
    approveCoachRequest: (...a: any[]) => approveCoachRequest(...a),
    rejectRequest: (...a: any[]) => rejectRequest(...a)
  }
}));

const PLAYER = {
  id: 'u1', name: 'Ana Ruiz', email: 'ana@example.com', requested_role: 'player',
  requested_team_id: 't1', team_name: 'U14', school_name: 'Hawks FC', created_at: '2026-09-14'
};
const COACH = { ...PLAYER, id: 'u2', name: 'Ben Cole', email: 'ben@example.com', requested_role: 'coach' };
const TEAMLESS = { ...PLAYER, id: 'u3', name: 'Cy Dunn', requested_team_id: null, team_name: null, school_name: null };

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0));
};

async function mountQueue(isAdmin = false) {
  const w = mount(ApprovalsSection, { props: { isAdmin }, attachTo: document.body });
  await flush();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchPendingRequests.mockResolvedValue([PLAYER]);
  fetchUnlinkedRosterEntries.mockResolvedValue([{ id: 'p1', name: 'Ana Ruiz' }]);
  fetchJoinableTeams.mockResolvedValue([{ id: 't9', name: 'U16', season: null, schoolName: 'Hawks FC' }]);
  approvePlayerRequest.mockResolvedValue({ ok: true, data: 'p1' });
  approveCoachRequest.mockResolvedValue({ ok: true });
  rejectRequest.mockResolvedValue({ ok: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('the queue', () => {
  it('names the person, the team and its organization', async () => {
    const w = await mountQueue();
    expect(w.find('[data-request-row]').text()).toContain('Ana Ruiz');
    expect(w.find('[data-request-team-label]').text()).toBe('U14 · Hawks FC');
  });

  it('says a failed read failed, rather than that nobody is waiting', async () => {
    fetchPendingRequests.mockResolvedValue(null);
    const w = await mountQueue();
    expect(w.find('[data-approvals-error]').exists()).toBe(true);
    expect(w.find('[data-approvals-empty]').exists()).toBe(false);
  });

  it("offers the team's unlinked roster entries and a new entry", async () => {
    const w = await mountQueue();
    const options = w.findAll('[data-request-player] option').map(o => o.text());
    expect(options).toEqual(['New roster entry', 'Ana Ruiz']);
    expect(fetchUnlinkedRosterEntries).toHaveBeenCalledWith('t1');
  });

  it('approves a player onto the chosen roster entry', async () => {
    const w = await mountQueue();
    await w.find('[data-request-player]').setValue('p1');
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approvePlayerRequest).toHaveBeenCalledWith('u1', 't1', 'p1');
    expect(w.find('[data-approvals-notice]').text()).toContain('Ana Ruiz approved');
  });

  it('approves a player as a new roster entry when none is chosen', async () => {
    const w = await mountQueue();
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approvePlayerRequest).toHaveBeenCalledWith('u1', 't1', null);
  });

  it("shows the database's refusal in words", async () => {
    approvePlayerRequest.mockResolvedValue({ ok: false, error: 'That player already has an account.' });
    const w = await mountQueue();
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(w.find('[data-approvals-refused]').text()).toBe('That player already has an account.');
  });

  it('approves a coach request onto its team, with no roster picker', async () => {
    fetchPendingRequests.mockResolvedValue([COACH]);
    const w = await mountQueue(true);
    expect(w.find('[data-request-player]').exists()).toBe(false);
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approveCoachRequest).toHaveBeenCalledWith('u2', 't1');
  });

  it('asks an admin which team a request that named none should join', async () => {
    fetchPendingRequests.mockResolvedValue([TEAMLESS]);
    const w = await mountQueue(true);
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approvePlayerRequest).not.toHaveBeenCalled();
    expect(w.find('[data-approvals-refused]').text()).toMatch(/Choose the team/);

    await w.find('[data-request-team]').setValue('t9');
    await flush();
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approvePlayerRequest).toHaveBeenCalledWith('u3', 't9', null);
  });

  it('refuses a request after confirming, and keeps the account', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountQueue();
    await w.find('[data-request-reject]').trigger('click');
    await flush();
    expect(confirmSpy.mock.calls[0][0]).toMatch(/kept/);
    expect(rejectRequest).toHaveBeenCalledWith('u1');
  });

  it('does nothing when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountQueue();
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approvePlayerRequest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/admin/ApprovalsSection.test.ts`
Expected: FAIL — no `[data-request-row]`.

- [ ] **Step 3: Rewrite `ApprovalsSection.vue`**

```vue
<script setup lang="ts">
/**
 * Accounts waiting for approval.
 *
 * **The most consequential control in the application.** Approving hands
 * somebody access to a squad of minors, so the confirmation names the person,
 * the team and the role.
 *
 * The list comes from pending_requests(), which returns only what the caller
 * may act on: a coach sees player requests for their own teams, an admin sees
 * everything. Nothing here filters by organization, because a filter in the
 * browser is not a boundary -- the old queue took an organization and ignored
 * it.
 *
 * Refusing is not deletion: it sets a status, and the confirmation says so, or
 * a coach assumes a mis-click is unrecoverable.
 */
import { ref, computed, onMounted } from 'vue';
import SectionShell from './SectionShell.vue';
import { supabaseService } from '../../data/supabase';
import type { PendingRequest, JoinableTeam } from '../../types';

const props = defineProps<{ isAdmin: boolean }>();

const requests = ref<PendingRequest[] | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const notice = ref<string | null>(null);
const refused = ref<string | null>(null);
const busyId = ref<string | null>(null);

/** Per request: the team to place them on, and the roster entry ('' = a new one). */
const choice = ref<Record<string, { teamId: string; playerId: string }>>({});
/** Unlinked roster entries, per team id. */
const rosters = ref<Record<string, { id: string; name: string }[]>>({});
const teams = ref<JoinableTeam[]>([]);

const rows = computed(() => requests.value || []);

function who(r: PendingRequest): string { return r.name || r.email; }

function teamLabel(r: PendingRequest): string {
  const teamId = choice.value[r.id]?.teamId;
  if (teamId && teamId === r.requested_team_id && r.team_name) {
    return r.school_name ? `${r.team_name} · ${r.school_name}` : r.team_name;
  }
  const t = teams.value.find(x => x.id === teamId);
  return t ? `${t.name} · ${t.schoolName}` : '';
}

async function loadRosters(): Promise<void> {
  const wanted = new Set(
    rows.value.filter(r => r.requested_role === 'player')
      .map(r => choice.value[r.id]?.teamId).filter(Boolean) as string[]);
  for (const teamId of wanted) {
    if (rosters.value[teamId]) continue;
    rosters.value[teamId] = (await supabaseService.fetchUnlinkedRosterEntries(teamId)) || [];
  }
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const found = await supabaseService.fetchPendingRequests();
    if (found === null) {
      // "Nobody is waiting" for a failed read leaves a real person waiting.
      loadError.value = 'Could not load the accounts waiting for approval.';
      requests.value = null;
      return;
    }
    requests.value = found;
    for (const r of found) {
      if (!choice.value[r.id]) choice.value[r.id] = { teamId: r.requested_team_id || '', playerId: '' };
    }
    if (props.isAdmin && found.some(r => !r.requested_team_id)) {
      teams.value = (await supabaseService.fetchJoinableTeams()) || [];
    }
    await loadRosters();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function onTeamChosen(r: PendingRequest, teamId: string): Promise<void> {
  choice.value[r.id] = { teamId, playerId: '' };
  await loadRosters();
}

async function onApprove(r: PendingRequest): Promise<void> {
  notice.value = null;
  refused.value = null;
  const c = choice.value[r.id];
  if (!c?.teamId) { refused.value = 'Choose the team to place them on first.'; return; }

  const team = teamLabel(r) || 'that team';
  const entry = rosters.value[c.teamId]?.find(p => p.id === c.playerId)?.name;
  const text = r.requested_role === 'coach'
    ? `Make ${who(r)} a coach of ${team}?\n\nThey will be able to change that squad's data.`
    : `Put ${who(r)} on ${team} as a player, ${entry ? `linked to ${entry}` : 'as a new roster entry'}?`;
  if (!window.confirm(text)) return;

  busyId.value = r.id;
  try {
    const res = r.requested_role === 'coach'
      ? await supabaseService.approveCoachRequest(r.id, c.teamId)
      : await supabaseService.approvePlayerRequest(r.id, c.teamId, c.playerId || null);
    if (!res.ok) { refused.value = res.error || 'That approval was refused.'; return; }
    notice.value = `${who(r)} approved.`;
    rosters.value = {};
    await load();
  } finally {
    busyId.value = null;
  }
}

async function onReject(r: PendingRequest): Promise<void> {
  notice.value = null;
  refused.value = null;
  const ok = window.confirm(
    `Refuse ${who(r)}?\n\nTheir account is kept and marked as refused rather than deleted.`);
  if (!ok) return;

  busyId.value = r.id;
  try {
    const res = await supabaseService.rejectRequest(r.id);
    if (!res.ok) { refused.value = res.error || 'That was refused.'; return; }
    notice.value = `${who(r)} refused. Their account is kept.`;
    await load();
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <SectionShell title="Waiting for approval" :badge="`${rows.length} waiting`" data-approvals>
    <p v-if="loading && !requests" class="note">Loading…</p>
    <p v-else-if="loadError" class="note note--bad" role="alert" data-approvals-error>{{ loadError }}</p>
    <p v-else-if="rows.length === 0" class="note" data-approvals-empty>Nobody is waiting.</p>

    <div v-for="r in rows" :key="r.id" class="row hrow" data-request-row>
      <div class="row__who">
        <strong class="row__name">{{ r.name || 'No name given' }}</strong>
        <span class="row__email">{{ r.email }}</span>
        <span class="tag tag--live">{{ r.requested_role === 'coach' ? 'Coach' : 'Player' }}</span>
        <span v-if="r.requested_team_id" class="tag" data-request-team-label>{{ teamLabel(r) }}</span>
        <span v-else class="note">named no team</span>
      </div>

      <div class="row__acts">
        <select
          v-if="!r.requested_team_id && isAdmin"
          class="input" :value="choice[r.id]?.teamId" data-request-team
          @change="onTeamChosen(r, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">— choose a team —</option>
          <option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }} · {{ t.schoolName }}</option>
        </select>

        <select
          v-if="r.requested_role === 'player' && choice[r.id]?.teamId"
          v-model="choice[r.id].playerId" class="input" data-request-player
        >
          <option value="">New roster entry</option>
          <option v-for="p in rosters[choice[r.id].teamId] || []" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>

        <button type="button" class="btn btn--go" :disabled="busyId === r.id"
                data-request-approve @click="onApprove(r)">Approve</button>
        <button type="button" class="btn" :disabled="busyId === r.id"
                data-request-reject @click="onReject(r)">Refuse</button>
      </div>
    </div>

    <p v-if="refused" class="note note--bad" role="alert" data-approvals-refused>{{ refused }}</p>
    <p v-if="notice" class="note note--good" role="status" data-approvals-notice>{{ notice }}</p>
  </SectionShell>
</template>

<style scoped>
.row { align-items: center; }
.row__who { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; }
.row__name { color: var(--ink); font-size: 14px; }
.row__email { color: var(--ink-muted); font-size: 13px; }
.row__acts { display: flex; flex-wrap: wrap; gap: var(--space-1); }
</style>
```

- [ ] **Step 4: Point AdminView at the new props**

In `src/views/AdminView.vue`, replace:

```vue
    <ApprovalsSection
      v-if="isCoach"
      :school-id="schoolId" data-admin-approvals />
```

with:

```vue
    <ApprovalsSection
      v-if="isCoach"
      :is-admin="isAdmin" data-admin-approvals />
```

In `src/views/AdminView.test.ts`, remove `approveUserAccess: vi.fn(),` and `rejectUserAccess: vi.fn(),` from the `auth` mock, and add `fetchPendingRequests: vi.fn().mockResolvedValue([]),` to that file's `supabaseService` mock object (if the file stubs `ApprovalsSection` instead, leave the mock untouched and only remove the two lines).

- [ ] **Step 5: Run the queue and admin tests**

Run: `npx vitest run src/components/admin/ApprovalsSection.test.ts src/views/AdminView.test.ts`
Expected: PASS.

- [ ] **Step 6: Make the staff page point at the queue**

In `src/stores/coaches.ts`:
- Replace `import { auth } from '../auth';` with `import { auth } from '../auth';` kept, and add `import type { PendingRequest } from '../types';`.
- Change `const pending = ref<any[]>([]);` to `const pending = ref<PendingRequest[]>([]);`.
- Replace the whole `loadPending` function with:

```ts
  /**
   * The requests this viewer may act on, for the count and the link.
   * pending_requests() decides who sees what; the page does not approve
   * anything itself -- one queue, in the admin panel, rather than two that drift.
   */
  async function loadPending(): Promise<void> {
    if (!(auth.isCoach() || auth.isAdmin())) { pending.value = []; return; }
    pending.value = (await supabaseService.fetchPendingRequests()) || [];
  }
```

- Delete the `approve` and `reject` functions and remove them from the returned object.

In `src/stores/coaches.test.ts`, replace the `describe('pending approvals', …)` block with:

```ts
describe('pending requests', () => {
  it('reads the requests this viewer may act on', async () => {
    isCoach.mockReturnValue(true);
    fetchPendingRequests.mockResolvedValue([{ id: 'u1' }]);
    const s = useCoachesStore();
    await s.loadPending();
    expect(s.pending).toEqual([{ id: 'u1' }]);
  });

  it('reads nothing for a visitor who is neither coach nor admin', async () => {
    isCoach.mockReturnValue(false);
    isAdmin.mockReturnValue(false);
    const s = useCoachesStore();
    await s.loadPending();
    expect(fetchPendingRequests).not.toHaveBeenCalled();
    expect(s.pending).toEqual([]);
  });

  it('shows nobody waiting when the read fails, without breaking the page', async () => {
    isCoach.mockReturnValue(true);
    fetchPendingRequests.mockResolvedValue(null);
    const s = useCoachesStore();
    await s.loadPending();
    expect(s.pending).toEqual([]);
  });
});
```

Adjust that file's mocks to match: remove `approveUserAccess`, `rejectUserAccess` and `getPendingApprovals` from the `auth` mock; make sure `isCoach` and `isAdmin` are `vi.fn()`s on the `auth` mock (declare `const isCoach = vi.fn(); const isAdmin = vi.fn();` at the top if the file does not already); add `const fetchPendingRequests = vi.fn();` and `fetchPendingRequests: (...a: any[]) => fetchPendingRequests(...a),` to the `supabaseService` mock.

In `src/views/CoachesView.vue`:
- Delete the `onApprove` and `onReject` functions.
- Change every `store.loadPending(schoolId.value)` (or `store.loadPending(...)` with an argument) to `store.loadPending()`.
- Replace the `<section v-if="canEdit && store.pending.length" … data-pending-queue>` block with:

```vue
    <!-- One queue, in the admin panel. This says it exists. -->
    <p v-if="canEdit && store.pending.length" class="queue" data-pending-queue>
      <span data-pending-count>
        {{ store.pending.length }} {{ store.pending.length === 1 ? 'account is' : 'accounts are' }} waiting for approval.
      </span>
      <RouterLink :to="{ name: 'admin' }" class="btn btn--small btn--go" data-pending-review>Review</RouterLink>
    </p>
```

- Update the file's doc comment sentence "The approval queue lives here…" to: "The approval queue itself lives in the admin panel; this page says how many are waiting and links there, so there is one queue rather than two that drift."

In `src/views/CoachesView.test.ts`: replace any assertion on `[data-approve]` / `[data-reject]` existing with an assertion that `[data-pending-review]` exists (when `canEdit` and pending) or does not (otherwise), and assert `[data-pending-count]` reads `1 account is waiting for approval.` for one pending row. If the mount does not already stub `RouterLink`, add `stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }` to its `global` options.

- [ ] **Step 7: Remove the old approval path**

- `src/auth.ts`: delete `approveUserAccess`, `rejectUserAccess` and `getPendingApprovals` (and their doc comments).
- `src/data/supabase.ts`: delete `approveProfile`, `rejectProfile` and `fetchPendingApprovals`.
- `src/globals.d.ts`: delete the three matching declarations.
- `src/data/org-required.test.ts`: delete the table row whose `method` is `'fetchPendingApprovals'`.

Then confirm nothing still refers to them:

Run: `grep -rn "approveUserAccess\|rejectUserAccess\|getPendingApprovals\|approveProfile\|rejectProfile\|fetchPendingApprovals" src`
Expected: no output.

- [ ] **Step 8: Run the gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: all `0`. On `TEST=1`, run `npm test 2>&1 | grep -E "FAIL|×|Unhandled"` and fix the named test — a mock still naming a removed method is the likely cause.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/ApprovalsSection.vue src/components/admin/ApprovalsSection.test.ts src/views/AdminView.vue src/views/AdminView.test.ts src/stores/coaches.ts src/stores/coaches.test.ts src/views/CoachesView.vue src/views/CoachesView.test.ts src/auth.ts src/data/supabase.ts src/globals.d.ts src/data/org-required.test.ts
git commit -m "feat: one approval queue, deciding team and roster entry in the same step

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Sign-up with a team, a link instead of a code, and no Beaumont defaults

**Files:**
- Create: `src/domain/signup-link.ts`, `src/domain/signup-link.test.ts`
- Modify: `src/types.ts` (`AppUser`)
- Modify: `src/auth.ts`, `src/stores/auth.ts`
- Modify: `src/data/supabase.ts`, `src/globals.d.ts` (remove `verifyOtp`)
- Modify: `src/components/auth/AuthModal.vue`, `src/components/auth/AuthModal.test.ts`
- Modify: `src/components/layout/AppHeader.vue`, `src/components/layout/AppHeader.test.ts`

**Interfaces:**
- Consumes: `supabaseService.fetchJoinableTeams()` (Task 3), `JoinableTeam`.
- Produces:
  - `signupLink(origin: string, email: string): string` and `readSignupEmail(search: string): string | null` in `src/domain/signup-link.ts`.
  - `AppUser.schoolId: string | null`, `AppUser.requestedTeamId?: string`; `schoolName` and `teamLevel` removed.
  - `auth.registerUser({ name, email, password, role, teamId })` and store `register({ name, email, password, role, teamId })`, where `teamId: string | null`.
  - Store ref `isSignedIn: boolean`.
  - `AuthModal` props `{ open: boolean; initialTab?: 'signin' | 'register'; initialEmail?: string }`.

- [ ] **Step 1: Write the failing link tests**

Create `src/domain/signup-link.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { signupLink, readSignupEmail } from './signup-link';

describe('signupLink', () => {
  it('fills the address in, lowercased and encoded', () => {
    expect(signupLink('https://club.example/', ' Kid+U14@Example.com '))
      .toBe('https://club.example/?signup=kid%2Bu14%40example.com');
  });
});

describe('readSignupEmail', () => {
  it('reads the address back', () => {
    expect(readSignupEmail('?signup=kid%2Bu14%40example.com')).toBe('kid+u14@example.com');
  });

  it('is null for an ordinary page load, so nothing opens', () => {
    expect(readSignupEmail('')).toBeNull();
    expect(readSignupEmail('?team=1')).toBeNull();
  });

  it('opens registration even when the address is empty', () => {
    expect(readSignupEmail('?signup=')).toBe('');
  });
});
```

Run: `npx vitest run src/domain/signup-link.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the link module**

Create `src/domain/signup-link.ts`:

```ts
/**
 * The sign-up link a coach sends an invited person.
 *
 * The app does not email invitations -- that needs a server-held key -- so the
 * coach texts or emails this themselves. It only fills the address in: what
 * connects the person to their team is the invitation in the database, redeemed
 * when they confirm that address.
 */
export function signupLink(origin: string, email: string): string {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/?signup=${encodeURIComponent(String(email || '').trim().toLowerCase())}`;
}

/** The address a sign-up link carries; null when the page was not opened from one. */
export function readSignupEmail(search: string): string | null {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  if (!params.has('signup')) return null;
  return (params.get('signup') || '').trim().toLowerCase();
}
```

Run: `npx vitest run src/domain/signup-link.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing modal tests**

In `src/components/auth/AuthModal.test.ts`:
- Add at the top, after the existing imports:

```ts
const fetchJoinableTeams = vi.fn();
vi.mock('../../data/supabase', () => ({
  supabaseService: { fetchJoinableTeams: (...a: any[]) => fetchJoinableTeams(...a) }
}));
const TEAMS = [
  { id: 't1', name: 'U14', season: null, schoolName: 'Hawks FC' },
  { id: 't2', name: 'Varsity', season: '2026', schoolName: 'Riverside High' }
];
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(r => setTimeout(r, 0)); };
```

- Change `mountAuth()` to accept props: `function mountAuth(props: Record<string, any> = {})` and mount with `props: { open: true, ...props }`.
- In every existing test that submits `[data-register-submit]` (the email-suggestion tests), set `await setValue(wrapper, '[data-field="regRole"]', 'guest');` before submitting: a coach or player now needs a team, and those tests are about the address, not the team.
- In the file's `beforeEach` for those existing registration tests, add `fetchJoinableTeams.mockResolvedValue([]);`.
- Delete every test that fills `[data-field="otp"]`, submits `[data-verify-submit]`, or expects the `verify` panel.
- Add:

```ts
describe('registering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    fetchJoinableTeams.mockResolvedValue(TEAMS);
  });

  async function openRegister(props: Record<string, any> = {}) {
    const m = mountAuth(props);
    await m.wrapper.find('[data-tab="register"]').trigger('click');
    await flush();
    return m;
  }

  it('lists teams grouped by organization', async () => {
    const { wrapper } = await openRegister();
    expect(wrapper.findAll('[data-field="regTeam"] optgroup').map(g => g.attributes('label')))
      .toEqual(['Hawks FC', 'Riverside High']);
  });

  it('asks which team a player or coach is joining', async () => {
    const { wrapper, store } = await openRegister();
    await setValue(wrapper, '[data-field="regName"]', 'Ana Ruiz');
    await setValue(wrapper, '[data-field="regEmail"]', 'ana@example.com');
    await setValue(wrapper, '[data-field="regPassword"]', 'secret123');
    await setValue(wrapper, '[data-field="regRole"]', 'player');
    await wrapper.find('[data-register-submit]').trigger('submit');
    expect(store.register).not.toHaveBeenCalled();
    expect(wrapper.find('[data-feedback]').text()).toMatch(/Choose the team/);
  });

  it('does not ask a fan for a team', async () => {
    const { wrapper } = await openRegister();
    await setValue(wrapper, '[data-field="regRole"]', 'guest');
    expect(wrapper.find('[data-field="regTeam"]').exists()).toBe(false);
  });

  it('sends the team with the registration, and then says to check for a link', async () => {
    const { wrapper, store } = await openRegister();
    (store.register as any).mockResolvedValue({ success: true, requiresVerification: true });
    await setValue(wrapper, '[data-field="regName"]', 'Ana Ruiz');
    await setValue(wrapper, '[data-field="regEmail"]', 'ana@example.com');
    await setValue(wrapper, '[data-field="regPassword"]', 'secret123');
    await setValue(wrapper, '[data-field="regRole"]', 'player');
    await setValue(wrapper, '[data-field="regTeam"]', 't1');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await flush();

    expect(store.register).toHaveBeenCalledWith({
      name: 'Ana Ruiz', email: 'ana@example.com', password: 'secret123', role: 'player', teamId: 't1'
    });
    expect(wrapper.find('[data-tab-panel="sent"]').text()).toContain('ana@example.com');
    expect(wrapper.text()).not.toMatch(/6-digit|code/i);
  });

  it('opens on registration with the invited address filled in', async () => {
    const { wrapper } = mountAuth({ open: false, initialTab: 'register', initialEmail: 'kid@example.com' });
    await wrapper.setProps({ open: true });
    await flush();
    expect(wrapper.find('[data-tab-panel="register"]').exists()).toBe(true);
    expect((wrapper.find('[data-field="regEmail"]').element as HTMLInputElement).value).toBe('kid@example.com');
  });
});
```

- Update the existing `'offers the three roles registration allows'` test only if its expected values change — they stay `['coach', 'player', 'guest']`.

Run: `npx vitest run src/components/auth/AuthModal.test.ts`
Expected: FAIL — no `[data-field="regTeam"]`.

- [ ] **Step 4: Change the profile mapping and registration in `src/auth.ts`**

In `src/types.ts`, change `AppUser` to:

```ts
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  requestedRole?: UserRole;
  /** The team a pending request named, if any. */
  requestedTeamId?: string;
  status: UserStatus;
  emailVerified: boolean;
  /** The organization the profile names; null for a guest or a request that named no team. */
  schoolId: string | null;
  playerId?: string;
  avatar?: string;
  createdAt?: string;
}
```

In `src/auth.ts`:
- Replace `GUEST_USER` with:

```ts
const GUEST_USER: AppUser = {
  id: 'user_guest',
  name: 'Public Visitor',
  email: '',
  role: ROLES.GUEST,
  status: 'active',
  emailVerified: true,
  schoolId: null
};
```

- Replace `mapProfileRowToAppUser` with:

```ts
/**
 * A profile row as the app sees it.
 *
 * It used to label every user "Beaumont High School, Boys Varsity" whatever
 * their row said, so a club coach signed in under somebody else's crest. The
 * organization comes from the row now, and nothing substitutes one.
 */
function mapProfileRowToAppUser(row: Record<string, any>): AppUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    requestedRole: row.requested_role || undefined,
    requestedTeamId: row.requested_team_id || undefined,
    status: row.status,
    emailVerified: !!row.email_verified,
    schoolId: row.school_id || null,
    playerId: row.player_id || undefined,
    avatar: row.avatar_url || undefined,
    createdAt: row.created_at
      ? new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : undefined
  };
}
```

- In `humanizeAuthError`, change the confirmation line to:
  `if (/email not confirmed/i.test(msg)) return 'Confirm your email first: open the link we sent you, then sign in.';`
- In `loginUser`, replace the two pending branches with:

```ts
    if (profile.status === 'pending_verification') {
      await supabaseService.signOutUser();
      return { success: false, isPendingVerification: true, message: 'Confirm your email first: open the link we sent you, then sign in.' };
    }
    if (profile.status === 'pending_approval') {
      this.setCurrentUser(profile);
      return {
        success: false, isPendingApproval: true, user: profile,
        message: profile.requestedRole === 'coach'
          ? 'Your request to join as a coach is waiting for an admin to approve it.'
          : "Your request is waiting for the team's coach to approve it."
      };
    }
```

- Replace `registerUser` with:

```ts
  async registerUser(
    { name, email, password, role, teamId }:
    { name: string; email: string; password?: string; role?: string; teamId?: string | null }
  ): Promise<RegisterResult> {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const roleValue = ((role || ROLES.GUEST) as string).toLowerCase();

    if (!cleanName || !cleanEmail || !password) {
      return { success: false, message: 'Please provide a name, an email and a password.' };
    }
    if (roleValue !== ROLES.GUEST && !teamId) {
      return { success: false, message: 'Choose the team you are joining.' };
    }
    if (!supabaseService.isConfigured()) {
      return { success: false, message: 'Cloud authentication is not configured for this deployment.' };
    }

    const metadata: Record<string, string> = { name: cleanName, requested_role: roleValue };
    if (roleValue !== ROLES.GUEST && teamId) metadata.requested_team_id = teamId;

    const result = await supabaseService.signUpUser(cleanEmail, password, metadata);
    if (!result || result.error) {
      return { success: false, message: humanizeAuthError(result?.error) };
    }

    return { success: true, requiresVerification: true, message: 'Check your email for a link to confirm your account.' };
  }
```

- Delete `verifyUserOtp`, and remove `OtpVerifyResult` from the type import at the top if nothing else uses it.
- Remove `verifyOtp` from `src/data/supabase.ts` and its declaration from `src/globals.d.ts`.

Run: `grep -rn "schoolName\|teamLevel\|verifyOtp\|verifyUserOtp\|bhs_cougars_logo" src --include=*.ts --include=*.vue`
Expected: only `upsertProfile`'s `teamLevel` field in `src/data/supabase.ts` and `src/globals.d.ts` (a profile column write, left alone). Fix any other hit by reading the value from where it now lives, or deleting the dead reference.

- [ ] **Step 5: Update the auth store**

In `src/stores/auth.ts`:
- Add `const isSignedIn = ref(false);` beside the other refs, and in `sync()` add `isSignedIn.value = !!u && u.id !== 'user_guest';`. Update the `isGuest` doc comment to: `/** True for a signed-out visitor, a fan, or an account still awaiting approval. */`.
- Change `register`'s parameter type to `{ name: string; email: string; password: string; role: string; teamId: string | null }`.
- Delete `verifyOtp`.
- Return `isSignedIn` and drop `verifyOtp` from the returned object.

- [ ] **Step 6: Rebuild the modal's registration**

In `src/components/auth/AuthModal.vue` script:
- Change the props and add a watch (add `watch` to the `vue` import, and `import { supabaseService } from '../../data/supabase';` and `import type { JoinableTeam } from '../../types';`):

```ts
const props = defineProps<{ open: boolean; initialTab?: 'signin' | 'register'; initialEmail?: string }>();
```

- Replace `type Tab = 'signin' | 'register' | 'verify';` with `type Tab = 'signin' | 'register' | 'sent';`.
- Delete `otp`, `verifyEmail`, `openVerify` and `onVerify`.
- Replace `ROLES` with:

```ts
const ROLES = [
  { value: 'coach', label: 'Coach or staff' },
  { value: 'player', label: 'Player' },
  { value: 'guest', label: 'Fan or parent — public pages only' }
];

const regTeam = ref('');
const teams = ref<JoinableTeam[]>([]);
const sentTo = ref('');
const needsTeam = computed(() => regRole.value !== 'guest');

/** Teams grouped under their organization, which is how a person recognises their own. */
const teamGroups = computed(() => {
  const groups: { school: string; teams: JoinableTeam[] }[] = [];
  for (const t of teams.value) {
    let g = groups.find(x => x.school === t.schoolName);
    if (!g) { g = { school: t.schoolName, teams: [] }; groups.push(g); }
    g.teams.push(t);
  }
  return groups;
});

async function loadTeams(): Promise<void> {
  if (teams.value.length) return;
  teams.value = (await supabaseService.fetchJoinableTeams()) || [];
}

watch(() => props.open, (open) => {
  if (!open) return;
  setTab(props.initialTab || 'signin');
  if (props.initialEmail) regEmail.value = props.initialEmail;
}, { immediate: true });
```

- Replace `setTab` with:

```ts
function setTab(next: Tab): void {
  tab.value = next;
  feedback.value = '';
  suggestion.value = null;
  if (next === 'register') void loadTeams();
}
```

- Replace the `title` computed's inner expression so `'verify'` becomes `'sent'` → `'Check your email'`.
- In `onSignIn`, replace the `isPendingVerification` line with `if (res?.isPendingVerification) { fail(res.message); return; }`.
- In `submitRegistration`, pass `teamId: needsTeam.value ? regTeam.value : null` to `auth.register`, and replace the success branch with:

```ts
    if (res?.success) {
      sentTo.value = withEmail;
      tab.value = 'sent';
      return;
    }
```

- At the start of `onRegister`, before the email check, add:

```ts
  if (needsTeam.value && !regTeam.value) { fail('Choose the team you are joining.'); return; }
```

In the template:
- After the `I am a` `<label>` inside the register form, add:

```vue
      <label v-if="needsTeam" class="field">
        <span class="kicker">Team</span>
        <select v-model="regTeam" class="input" data-field="regTeam">
          <option value="">— choose your team —</option>
          <optgroup v-for="g in teamGroups" :key="g.school" :label="g.school">
            <option v-for="t in g.teams" :key="t.id" :value="t.id">
              {{ t.name }}<template v-if="t.season"> · {{ t.season }}</template>
            </option>
          </optgroup>
        </select>
      </label>
```

- Replace the whole `<!-- Verify -->` `<form v-else …>` block with:

```vue
    <!-- Sent -->
    <div v-else data-tab-panel="sent" class="sent">
      <p>We sent a link to <strong>{{ sentTo }}</strong>. Open it to confirm your account.</p>
      <p class="note">
        If a coach invited this address, confirming connects you to your team. Otherwise
        your request goes to the team's coach, or to an admin for a coach's request.
      </p>
      <button type="button" class="btn btn--go" @click="emit('close')">Done</button>
    </div>
```

- Delete any `.verify__target` style; add `.sent { display: flex; flex-direction: column; gap: var(--space-2); }`.

Run: `npx vitest run src/components/auth/AuthModal.test.ts src/components/auth/AuthModal.demo.test.ts`
Expected: PASS.

- [ ] **Step 7: Open the modal from a sign-up link, and label sign-out honestly**

In `src/components/layout/AppHeader.vue` script: add `onMounted` to the `vue` import and `import { readSignupEmail } from '../../domain/signup-link';`, then replace `const authOpen = ref(false);` with:

```ts
const authOpen = ref(false);
const authTab = ref<'signin' | 'register'>('signin');
const signupEmail = ref('');

/**
 * An invited person arrives on ?signup=<address>: open registration with it
 * filled in. The link connects nobody -- the invitation in the database does,
 * when they confirm the address.
 */
onMounted(() => {
  let email: string | null = null;
  try { email = readSignupEmail(window.location.search); } catch { email = null; }
  if (email === null) return;
  signupEmail.value = email;
  authTab.value = 'register';
  authOpen.value = true;
});
```

Replace `accountLabel` and `onAccountClick` with:

```ts
/**
 * Signed in is not the same as not a guest: a fan and an account waiting for
 * approval both hold the guest role, and were offered "Sign in" with no way to
 * sign out.
 */
const accountLabel = computed(() => auth.isSignedIn ? 'Sign out' : 'Sign in');

async function onAccountClick(): Promise<void> {
  if (!auth.isSignedIn) { authTab.value = 'signin'; authOpen.value = true; return; }
  await auth.logout();
}
```

Replace `<AuthModal :open="authOpen" @close="authOpen = false" />` with:

```vue
    <AuthModal
      :open="authOpen" :initial-tab="authTab" :initial-email="signupEmail"
      @close="authOpen = false" />
```

In `src/components/layout/AppHeader.test.ts`, wherever the testing pinia's `initialState.auth` seeds a signed-in user, add `isSignedIn: true`; where it seeds a signed-out visitor, add `isSignedIn: false`. Add:

```ts
it('offers sign-out to a signed-in fan, who holds the guest role', async () => {
  const w = mountWith({ auth: { isGuest: true, isSignedIn: true, role: 'guest', user: { name: 'Fan' } } });
  expect(w.text()).toContain('Sign out');
});
```

(`mountWith` is the file's existing helper; it already accepts `{ auth: {...} }`.)

- [ ] **Step 8: Run the gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: all `0`.

- [ ] **Step 9: Commit**

```bash
git add src/domain/signup-link.ts src/domain/signup-link.test.ts src/types.ts src/auth.ts src/stores/auth.ts src/data/supabase.ts src/globals.d.ts src/components/auth/AuthModal.vue src/components/auth/AuthModal.test.ts src/components/layout/AppHeader.vue src/components/layout/AppHeader.test.ts
git commit -m "feat: sign up for a team, confirm by link, and stop filing everyone under Beaumont

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Forgot password

**Files:**
- Modify: `src/data/supabase.ts` (`completeEmailLink`), `src/globals.d.ts` only if its return type changes (it does not)
- Modify: `src/vue-main.ts`
- Modify: `src/auth.ts`, `src/stores/auth.ts`
- Modify: `src/components/auth/AuthModal.vue`, `src/components/auth/AuthModal.test.ts`
- Modify: `src/components/layout/AppHeader.vue`, `src/components/layout/AppHeader.test.ts`
- Modify: `src/data/account-service.test.ts` (the recovery link)

**Interfaces:**
- Consumes: `supabaseService.requestPasswordReset`, `supabaseService.updatePassword` (Task 3); `AuthModal` props and `AppHeader` modal state (Task 5).
- Produces: `completeEmailLink()` returns `{ outcome: 'recovery' }` for a password reset link; `auth.beginPasswordRecovery()`, `auth.isRecovering()`, `auth.requestPasswordReset(email)`, `auth.completePasswordReset(password)`; store ref `recovering` and actions `requestPasswordReset`, `completePasswordReset`; `AuthModal` tabs `'reset'` and `'newpassword'`.

- [ ] **Step 1: Write the failing recovery-link test**

Append to `src/data/account-service.test.ts`:

```ts
describe('completeEmailLink', () => {
  it('recognises a password reset link, so the app can ask for the new password', async () => {
    window.history.replaceState({}, '', '/#access_token=abc&type=recovery');
    svc.client.auth.getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    expect(await svc.completeEmailLink()).toEqual({ outcome: 'recovery' });
    expect(window.location.hash).toBe('');
  });

  it('still reports an ordinary confirmation as confirmed', async () => {
    window.history.replaceState({}, '', '/#access_token=abc&type=signup');
    svc.client.auth.getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    expect(await svc.completeEmailLink()).toEqual({ outcome: 'confirmed' });
  });
});
```

Run: `npx vitest run src/data/account-service.test.ts`
Expected: FAIL — `{ outcome: 'confirmed' }` where `recovery` was expected.

- [ ] **Step 2: Recognise the recovery link**

In `src/data/supabase.ts`, `completeEmailLink()`: directly after `const hasCode = /[?&]code=/.test(search);`, add:

```ts
    // A password reset link signs the person in to set a new password, and
    // detectSessionInUrl has already fired PASSWORD_RECOVERY before anything
    // in the app subscribed -- so the link itself is what says so.
    const isRecovery = /[#&?]type=recovery(&|$)/.test(hash + search);
```

and change `if (data?.session) return { outcome: 'confirmed' };` to:

```ts
      if (data?.session) return { outcome: isRecovery ? 'recovery' : 'confirmed' };
```

Add `'recovery'` to the list in the method's doc comment: `'recovery' — a password reset link; signed in, and must be asked for a new password`.

Run: `npx vitest run src/data/account-service.test.ts`
Expected: PASS.

- [ ] **Step 3: Carry the recovery into auth**

In `src/vue-main.ts`, replace:

```ts
  try {
    await supabaseService.completeEmailLink();
  } catch (err) {
    console.warn('Email link completion notice:', err);
  }
```

with:

```ts
  let link: { outcome: string } | null = null;
  try {
    link = await supabaseService.completeEmailLink();
  } catch (err) {
    console.warn('Email link completion notice:', err);
  }
```

and directly after the line `await auth.init();` add:

```ts
    if (link?.outcome === 'recovery') auth.beginPasswordRecovery();
```

In `src/auth.ts`, inside `AuthManager`:
- Add the field `private recovering = false;` beside `subscribers`.
- In `init()`'s `onAuthStateChange` callback, before the `setTimeout`, add `if (_event === 'PASSWORD_RECOVERY') this.recovering = true;`.
- Add the methods:

```ts
  /** A password reset link was opened: the next thing to ask for is a new password. */
  beginPasswordRecovery(): void {
    this.recovering = true;
    this.notifySubscribers();
  }

  isRecovering(): boolean {
    return this.recovering;
  }

  /**
   * Send a reset link.
   *
   * The answer is the same whether or not the address has an account: this
   * form must not be a way to find out who is registered.
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return { success: false, message: 'Enter the email address you signed up with.' };
    if (!supabaseService.isConfigured()) {
      return { success: false, message: 'Cloud authentication is not configured for this deployment.' };
    }
    const res = await supabaseService.requestPasswordReset(clean);
    if (!res.ok && /rate limit|too many/i.test(res.error || '')) {
      return { success: false, message: 'Too many reset emails were asked for. Wait a few minutes and try again.' };
    }
    if (!res.ok) return { success: false, message: 'The reset email could not be sent. Try again in a moment.' };
    return { success: true, message: `If ${clean} has an account, a link to set a new password is on its way.` };
  }

  async completePasswordReset(password: string): Promise<{ success: boolean; message: string }> {
    if (String(password || '').length < 6) return { success: false, message: 'Use at least 6 characters.' };
    const res = await supabaseService.updatePassword(password);
    if (!res.ok) return { success: false, message: res.error || 'That password could not be set.' };
    this.recovering = false;
    this.notifySubscribers();
    return { success: true, message: 'Password changed. You are signed in.' };
  }
```

In `src/stores/auth.ts`: add `const recovering = ref(false);`, set `recovering.value = auth.isRecovering();` in `sync()`, add:

```ts
  async function requestPasswordReset(email: string) {
    return auth.requestPasswordReset(email);
  }

  async function completePasswordReset(password: string) {
    const res = await auth.completePasswordReset(password);
    sync();
    return res;
  }
```

and return `recovering`, `requestPasswordReset`, `completePasswordReset`.

- [ ] **Step 4: Write the failing modal tests**

Append to `src/components/auth/AuthModal.test.ts`:

```ts
describe('a forgotten password', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('is reached from sign in', async () => {
    const { wrapper } = mountAuth();
    await wrapper.find('[data-forgot]').trigger('click');
    expect(wrapper.find('[data-tab-panel="reset"]').exists()).toBe(true);
  });

  it('sends the link and shows the same answer for any address', async () => {
    const { wrapper, store } = mountAuth();
    (store.requestPasswordReset as any).mockResolvedValue({
      success: true, message: 'If a@example.com has an account, a link to set a new password is on its way.'
    });
    await wrapper.find('[data-forgot]').trigger('click');
    await setValue(wrapper, '[data-field="resetEmail"]', 'a@example.com');
    await wrapper.find('[data-reset-submit]').trigger('submit');
    await flush();
    expect(store.requestPasswordReset).toHaveBeenCalledWith('a@example.com');
    expect(wrapper.find('[data-feedback]').text()).toMatch(/If a@example.com has an account/);
  });

  it('asks for the new password when a reset link was opened', async () => {
    const { wrapper, store } = mountAuth({ open: false });
    (store as any).recovering = true;
    await wrapper.setProps({ open: true });
    expect(wrapper.find('[data-tab-panel="newpassword"]').exists()).toBe(true);
  });

  it('refuses two passwords that differ, before sending either', async () => {
    const { wrapper, store } = mountAuth({ open: false });
    (store as any).recovering = true;
    await wrapper.setProps({ open: true });
    await setValue(wrapper, '[data-field="newPassword"]', 'secret123');
    await setValue(wrapper, '[data-field="newPasswordAgain"]', 'secret124');
    await wrapper.find('[data-newpassword-submit]').trigger('submit');
    expect(store.completePasswordReset).not.toHaveBeenCalled();
    expect(wrapper.find('[data-feedback]').text()).toMatch(/do not match/);
  });

  it('sets the password and closes', async () => {
    const { wrapper, store } = mountAuth({ open: false });
    (store as any).recovering = true;
    (store.completePasswordReset as any).mockResolvedValue({ success: true, message: 'Password changed.' });
    await wrapper.setProps({ open: true });
    await setValue(wrapper, '[data-field="newPassword"]', 'secret123');
    await setValue(wrapper, '[data-field="newPasswordAgain"]', 'secret123');
    await wrapper.find('[data-newpassword-submit]').trigger('submit');
    await flush();
    expect(store.completePasswordReset).toHaveBeenCalledWith('secret123');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
```

Run: `npx vitest run src/components/auth/AuthModal.test.ts`
Expected: FAIL — no `[data-forgot]`.

- [ ] **Step 5: Add the reset views to the modal**

In `src/components/auth/AuthModal.vue` script:
- Change the tab type to `type Tab = 'signin' | 'register' | 'sent' | 'reset' | 'newpassword';`.
- Add refs `const resetEmail = ref('');`, `const newPassword = ref('');`, `const newPasswordAgain = ref('');`.
- In the `props.open` watch, replace `setTab(props.initialTab || 'signin');` with `setTab(auth.recovering ? 'newpassword' : (props.initialTab || 'signin'));`.
- Extend `title`: `'reset'` → `'Reset your password'`, `'newpassword'` → `'Set a new password'`.
- Add:

```ts
function info(message: string): void {
  feedback.value = message;
  feedbackKind.value = 'info';
}

async function onResetRequest(): Promise<void> {
  busy.value = true;
  feedback.value = '';
  try {
    const res: any = await auth.requestPasswordReset(resetEmail.value.trim());
    if (res?.success) info(res.message); else fail(res?.message || 'The reset email could not be sent.');
  } finally {
    busy.value = false;
  }
}

async function onNewPassword(): Promise<void> {
  if (newPassword.value !== newPasswordAgain.value) { fail('The two passwords do not match.'); return; }
  busy.value = true;
  feedback.value = '';
  try {
    const res: any = await auth.completePasswordReset(newPassword.value);
    if (res?.success) { emit('close'); return; }
    fail(res?.message || 'That password could not be set.');
  } finally {
    busy.value = false;
  }
}
```

In the template:
- Inside the sign-in `<form>`, after the submit button, add:

```vue
      <button type="button" class="btn btn--plain" data-forgot @click="setTab('reset')">
        Forgot password?
      </button>
```

- Before the `<!-- Sent -->` block, add two panels, and change the Sent block's `v-else` to `v-else-if="tab === 'sent'"`:

```vue
    <!-- Reset -->
    <form v-else-if="tab === 'reset'" data-tab-panel="reset" data-reset-submit @submit.prevent="onResetRequest">
      <label class="field">
        <span class="kicker">Email</span>
        <input v-model="resetEmail" type="email" class="input" required autocomplete="email"
               data-field="resetEmail" />
      </label>
      <button type="submit" class="btn btn--go" :disabled="busy">
        {{ busy ? 'Sending…' : 'Send a reset link' }}
      </button>
      <button type="button" class="btn btn--plain" @click="setTab('signin')">Back to sign in</button>
    </form>

    <!-- New password, after opening a reset link -->
    <form v-else-if="tab === 'newpassword'" data-tab-panel="newpassword" data-newpassword-submit
          @submit.prevent="onNewPassword">
      <label class="field">
        <span class="kicker">New password</span>
        <input v-model="newPassword" type="password" class="input" required minlength="6"
               autocomplete="new-password" data-field="newPassword" />
      </label>
      <label class="field">
        <span class="kicker">Again</span>
        <input v-model="newPasswordAgain" type="password" class="input" required minlength="6"
               autocomplete="new-password" data-field="newPasswordAgain" />
      </label>
      <button type="submit" class="btn btn--go" :disabled="busy">
        {{ busy ? 'Saving…' : 'Set password' }}
      </button>
    </form>
```

- The tabs row (`<div v-if="!demo.enabled" class="tabs">`) becomes `v-if="!demo.enabled && (tab === 'signin' || tab === 'register')"`.

Run: `npx vitest run src/components/auth/AuthModal.test.ts src/components/auth/AuthModal.demo.test.ts`
Expected: PASS.

- [ ] **Step 6: Open the modal when a reset link was opened**

In `src/components/layout/AppHeader.vue`, add `watch` to the `vue` import and, below the `onMounted` block:

```ts
/** A reset link signs the person in; the header opens the modal to ask for the new password. */
watch(() => auth.recovering, (recovering) => { if (recovering) authOpen.value = true; }, { immediate: true });
```

In `src/components/layout/AppHeader.test.ts`, add:

```ts
it('opens the account modal when a password reset link was opened', async () => {
  const w = mountWith({ auth: { recovering: true, isSignedIn: true, isGuest: true, role: 'guest', user: { name: 'Fan' } } });
  await w.vm.$nextTick();
  expect(w.findComponent({ name: 'AuthModal' }).props('open')).toBe(true);
});
```

(If `mountWith` stubs `AuthModal`, assert on the stub's `open` prop the same way.)

- [ ] **Step 7: Run the gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: all `0`.

- [ ] **Step 8: Commit**

```bash
git add src/data/supabase.ts src/data/account-service.test.ts src/vue-main.ts src/auth.ts src/stores/auth.ts src/components/auth/AuthModal.vue src/components/auth/AuthModal.test.ts src/components/layout/AppHeader.vue src/components/layout/AppHeader.test.ts
git commit -m "feat: forgot password, by emailed link

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Inviting players and coaches

**Files:**
- Create: `src/components/accounts/InviteControl.vue`, `src/components/accounts/InviteControl.test.ts`
- Modify: `src/components/roster/PlayerDetailModal.vue`, `src/views/RosterView.vue`
- Modify: `src/components/admin/TeamsSection.vue`, `src/components/admin/TeamsSection.test.ts`

**Interfaces:**
- Consumes: `fetchTeamInvitations`, `fetchLinkedPlayerIds`, `createInvitation`, `revokeInvitation` (Task 3); `signupLink` (Task 5); `Invitation` type.
- Produces: `InviteControl` with props `{ teamId: string; role: 'player' | 'coach'; playerId?: string | null; subject: string }`; `PlayerDetailModal` props gain `canInvite?: boolean` (default false) and `teamId?: string | null`.

- [ ] **Step 1: Write the failing control tests**

Create `src/components/accounts/InviteControl.test.ts`:

```ts
/**
 * Inviting someone to a team.
 *
 * The invitation is only authorization; the app sends no email. So after
 * inviting, the control shows the link for the coach to send, and says so --
 * a coach who assumes an email went out waits for a sign-up that never comes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import InviteControl from './InviteControl.vue';

const fetchTeamInvitations = vi.fn();
const fetchLinkedPlayerIds = vi.fn();
const createInvitation = vi.fn();
const revokeInvitation = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchTeamInvitations: (...a: any[]) => fetchTeamInvitations(...a),
    fetchLinkedPlayerIds: (...a: any[]) => fetchLinkedPlayerIds(...a),
    createInvitation: (...a: any[]) => createInvitation(...a),
    revokeInvitation: (...a: any[]) => revokeInvitation(...a)
  }
}));

const OPEN = { id: 'i1', email: 'kid@example.com', role: 'player', player_id: 'p1', team_id: 't1', created_at: '' };

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); };

async function mountPlayer(playerId = 'p1') {
  const w = mount(InviteControl, {
    props: { teamId: 't1', role: 'player', playerId, subject: 'Ana Ruiz' }, attachTo: document.body
  });
  await flush();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchTeamInvitations.mockResolvedValue([]);
  fetchLinkedPlayerIds.mockResolvedValue([]);
  createInvitation.mockResolvedValue({ ok: true, data: OPEN });
  revokeInvitation.mockResolvedValue({ ok: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('InviteControl', () => {
  it('says an account is linked, and offers nothing else', async () => {
    fetchLinkedPlayerIds.mockResolvedValue(['p1']);
    const w = await mountPlayer();
    expect(w.find('[data-invite-linked]').exists()).toBe(true);
    expect(w.find('[data-invite-form]').exists()).toBe(false);
  });

  it('invites the player by email, for this roster entry', async () => {
    const w = await mountPlayer();
    await w.find('[data-invite-email]').setValue('Kid@Example.com');
    await w.find('[data-invite-form]').trigger('submit');
    await flush();
    expect(createInvitation).toHaveBeenCalledWith('Kid@Example.com', 't1', 'player', 'p1');
    expect(w.find('[data-invite-notice]').text()).toMatch(/does not email/i);
  });

  it('shows an open invitation with the sign-up link to send', async () => {
    fetchTeamInvitations.mockResolvedValue([OPEN]);
    const w = await mountPlayer();
    expect(w.find('[data-invite-open]').text()).toContain('kid@example.com');
    expect((w.find('[data-invite-link]').element as HTMLInputElement).value)
      .toBe(`${window.location.origin}/?signup=kid%40example.com`);
    expect(w.find('[data-invite-form]').exists()).toBe(false);
  });

  it("ignores another player's invitation on the same team", async () => {
    fetchTeamInvitations.mockResolvedValue([{ ...OPEN, player_id: 'p2' }]);
    const w = await mountPlayer('p1');
    expect(w.find('[data-invite-open]').exists()).toBe(false);
    expect(w.find('[data-invite-form]').exists()).toBe(true);
  });

  it('withdraws an invitation after confirming', async () => {
    fetchTeamInvitations.mockResolvedValue([OPEN]);
    const w = await mountPlayer();
    await w.find('[data-invite-revoke]').trigger('click');
    await flush();
    expect(revokeInvitation).toHaveBeenCalledWith('i1');
  });

  it("shows the database's refusal in words", async () => {
    createInvitation.mockResolvedValue({ ok: false, error: 'That player already has an account.' });
    const w = await mountPlayer();
    await w.find('[data-invite-email]').setValue('kid@example.com');
    await w.find('[data-invite-form]').trigger('submit');
    await flush();
    expect(w.find('[data-invite-error]').text()).toBe('That player already has an account.');
  });

  it('keeps the form for a coach invitation while others are open', async () => {
    fetchTeamInvitations.mockResolvedValue([{ ...OPEN, role: 'coach', player_id: null }]);
    const w = mount(InviteControl, { props: { teamId: 't1', role: 'coach', subject: 'U14' }, attachTo: document.body });
    await flush();
    expect(w.findAll('[data-invite-open]')).toHaveLength(1);
    expect(w.find('[data-invite-form]').exists()).toBe(true);
    expect(fetchLinkedPlayerIds).not.toHaveBeenCalled();
  });

  it('says a failed read failed', async () => {
    fetchTeamInvitations.mockResolvedValue(null);
    const w = await mountPlayer();
    expect(w.find('[data-invite-error]').text()).toMatch(/Could not load/);
  });
});
```

Run: `npx vitest run src/components/accounts/InviteControl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Build the control**

Create `src/components/accounts/InviteControl.vue`:

```vue
<script setup lang="ts">
/**
 * Invite a player to a roster entry, or a coach to a team.
 *
 * An invitation is authorization and nothing more: the person who signs up
 * with that address and confirms it is connected to the team. The app sends no
 * email, because that needs a server-held key, so this shows the sign-up link
 * for the coach to send and says outright that nothing was emailed.
 *
 * Who may invite whom is decided by create_invitation(), not here: a coach
 * invites players to their own team, an admin invites coaches.
 */
import { ref, computed, onMounted, watch } from 'vue';
import { supabaseService } from '../../data/supabase';
import { signupLink } from '../../domain/signup-link';
import type { Invitation } from '../../types';

const props = defineProps<{
  teamId: string;
  role: 'player' | 'coach';
  playerId?: string | null;
  /** Who or what the invitation is for, in sentences: a player's or a team's name. */
  subject: string;
}>();

const invitations = ref<Invitation[]>([]);
const linked = ref(false);
const email = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const open = computed(() => invitations.value.filter(i =>
  i.role === props.role && (props.role === 'coach' || i.player_id === props.playerId)));

/** A player has one place on a roster; a team may take several coaches. */
const showForm = computed(() => props.role === 'coach' || open.value.length === 0);

function linkFor(address: string): string {
  let origin = '';
  try { origin = window.location.origin; } catch { origin = ''; }
  return signupLink(origin, address);
}

async function load(): Promise<void> {
  error.value = null;
  const [found, linkedIds] = await Promise.all([
    supabaseService.fetchTeamInvitations(props.teamId),
    props.role === 'player' ? supabaseService.fetchLinkedPlayerIds(props.teamId) : Promise.resolve([] as string[])
  ]);
  if (found === null || linkedIds === null) {
    error.value = 'Could not load the invitations for this team.';
    return;
  }
  invitations.value = found;
  linked.value = props.role === 'player' && !!props.playerId && linkedIds.includes(props.playerId);
}

onMounted(load);
watch(() => [props.teamId, props.playerId], load);

async function onInvite(): Promise<void> {
  error.value = null;
  notice.value = null;
  const address = email.value.trim();
  if (!address) { error.value = 'Enter the email address to invite.'; return; }

  busy.value = true;
  try {
    const res = await supabaseService.createInvitation(
      address, props.teamId, props.role, props.role === 'player' ? (props.playerId || null) : null);
    if (!res.ok) { error.value = res.error || 'That invitation was refused.'; return; }
    notice.value = `Invited ${address.toLowerCase()}. The app does not email it — send them the link below.`;
    email.value = '';
    await load();
  } finally {
    busy.value = false;
  }
}

async function onRevoke(i: Invitation): Promise<void> {
  error.value = null;
  notice.value = null;
  if (!window.confirm(`Withdraw the invitation for ${i.email}?\n\nThe link will stop connecting them to ${props.subject}.`)) return;
  const res = await supabaseService.revokeInvitation(i.id);
  if (!res.ok) { error.value = res.error || 'That could not be withdrawn.'; return; }
  notice.value = `Invitation for ${i.email} withdrawn.`;
  await load();
}

async function onCopy(address: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(linkFor(address));
    notice.value = 'Link copied.';
  } catch {
    notice.value = 'Select the link and copy it.';
  }
}
</script>

<template>
  <div class="invite" data-invite>
    <p v-if="linked" class="note" data-invite-linked>Account linked.</p>

    <template v-else>
      <div v-for="i in open" :key="i.id" class="invite__open" data-invite-open>
        <p class="invite__who">Invited <strong>{{ i.email }}</strong> — waiting for them to sign up.</p>
        <div class="invite__link">
          <input class="input" readonly :value="linkFor(i.email)" data-invite-link
                 @focus="($event.target as HTMLInputElement).select()" />
          <button type="button" class="btn" data-invite-copy @click="onCopy(i.email)">Copy</button>
          <button type="button" class="btn" data-invite-revoke @click="onRevoke(i)">Withdraw</button>
        </div>
      </div>

      <form v-if="showForm" class="invite__form" data-invite-form @submit.prevent="onInvite">
        <label class="field">
          <span class="kicker">{{ role === 'coach' ? 'Invite a coach' : 'Invite by email' }}</span>
          <input v-model="email" type="email" class="input" autocomplete="off" data-invite-email />
        </label>
        <button type="submit" class="btn btn--go" :disabled="busy" data-invite-submit>
          {{ busy ? 'Inviting…' : 'Invite' }}
        </button>
      </form>
    </template>

    <p v-if="error" class="note note--bad" role="alert" data-invite-error>{{ error }}</p>
    <p v-if="notice" class="note" role="status" data-invite-notice>{{ notice }}</p>
  </div>
</template>

<style scoped>
.invite { display: flex; flex-direction: column; gap: var(--space-2); }
.invite__who { margin: 0; color: var(--ink); font-size: 13px; }
.invite__link { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.invite__link .input { flex: 1; min-width: 14rem; }
.invite__form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2); }
</style>
```

Run: `npx vitest run src/components/accounts/InviteControl.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 3: Put it on the player's bio, for coaches**

In `src/components/roster/PlayerDetailModal.vue`:
- Add `import InviteControl from '../accounts/InviteControl.vue';`.
- Extend the props with:

```ts
  /** A coach of this team may invite the player to create their account. */
  canInvite?: boolean;
  teamId?: string | null;
```

  and the defaults with `canInvite: false, teamId: null`.
- After the `skills` section in the template, add:

```vue
      <section v-if="canInvite && teamId" class="account" data-bio-account>
        <p class="kicker kicker--accent">Account</p>
        <InviteControl :team-id="teamId" role="player" :player-id="player.id" :subject="player.name" />
      </section>
```

- Add the style `.account { margin-top: var(--space-6); }`.

In `src/views/RosterView.vue`, change the `PlayerDetailModal` usage to:

```vue
    <PlayerDetailModal
      :open="detailFor !== null" :player="detailFor"
      :can-see-ratings="canSeeRatings" :can-invite="canEdit" :team-id="org.activeTeamId"
      @close="detailFor = null" />
```

(If `RosterView` names the organization store differently than `org`, use that name.)

- [ ] **Step 4: Put the coach invitation on each team**

In `src/components/admin/TeamsSection.vue`:
- Add `import InviteControl from '../accounts/InviteControl.vue';`.
- Directly after the `<p class="row__coaches">…</p>` element, add:

```vue
          <details class="invitecoach" data-team-invite>
            <summary class="kicker">Invite a coach</summary>
            <InviteControl :team-id="t.id" role="coach" :subject="t.name" />
          </details>
```

- Add the style `.invitecoach { margin-top: var(--space-2); }`.

In `src/components/admin/TeamsSection.test.ts`, stub the control in that file's mount options (`global: { stubs: { InviteControl: true } }`, merged with any stubs already there) and add:

```ts
it('offers a coach invitation on every team', async () => {
  const w = await mountTeams();
  expect(w.findAll('[data-team-invite]')).toHaveLength(w.findAll('[data-team-row]').length);
});
```

(`mountTeams` is the file's existing helper.)

- [ ] **Step 5: Run the gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: all `0`. `src/design-tokens.test.ts` walks every component; if it fails on `InviteControl.vue`, a literal colour slipped in — use a ground token.

- [ ] **Step 6: Commit**

```bash
git add src/components/accounts/InviteControl.vue src/components/accounts/InviteControl.test.ts src/components/roster/PlayerDetailModal.vue src/views/RosterView.vue src/components/admin/TeamsSection.vue src/components/admin/TeamsSection.test.ts
git commit -m "feat: invite a player from their bio and a coach from their team

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The runbook and CLAUDE.md

**Files:**
- Create: `docs/runbooks/2026-09-14-accounts-setup-runbook.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: documentation only.

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/2026-09-14-accounts-setup-runbook.md`:

```markdown
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
```

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md`:
- In the SQL files list, change `8. …through \`supabase/migrations/0034_team_match_minutes.sql\`.` to `8. …through \`supabase/migrations/0035_account_invitations.sql\`.`
- In `## Data flow`, the paragraph beginning **"Ten service methods default `schoolId` to `'bhs'`"**: change "Ten" to "Nine" and delete `fetchPendingApprovals, ` from its list — the method no longer exists.
- In `### Auth & RBAC`, replace the sentence ending "signup lands in a pending-approval state that a coach or admin clears via `approveProfile`/`rejectProfile`." with: "sign-up records a request and grants nothing; access is granted only when the email is confirmed — see *Accounts* below."
- Add this section under `## The rules that are not guessable from the code`, directly before `### Recording numbers are assigned by the coach, in a block`:

```markdown
### Accounts are granted at confirmation, never at sign-up

Since `0035_account_invitations.sql`. A person reaches their team one of two ways: a coach **invites** their address (a player onto a roster entry, or — admins only — a coach onto a team), or they **request** a team at sign-up and are approved. Runbook: `docs/runbooks/2026-09-14-accounts-setup-runbook.md`.

- **`promote_confirmed_profile` is the only place access is granted, and it runs when the email is confirmed.** Redeeming an invitation at sign-up would let anyone who knows a player's address sign up as them and be put on the team. It only touches a profile still at `pending_verification`, so a late confirmation cannot knock a settled account back into the queue. **"Confirm email" must stay on** — with it off, every account arrives confirmed and invitations are redeemed at sign-up.
- **Every privileged account write is a `security definer` function that checks its caller** — `create_invitation`, `revoke_invitation`, `pending_requests`, `approve_player_request`, `approve_coach_request`, `reject_request`, `team_linked_players`. A coach handles players on their own team; only an admin handles coaches. `pending_requests()` returns only what the caller may act on; do not filter the queue in the browser instead.
- **`guard_profile_privileged_columns` is `security invoker` and lets a change through when `current_user` is not `anon` or `authenticated`.** Inside a definer function `auth.uid()` is still the coach's — it comes from the JWT — so the old `auth.uid()`-only test refused every coach approval. It must not name the `auth` schema itself: as the visitor, that lookup needs schema USAGE, so it asks `public.current_profile_role()` (a definer) instead. It also guards `player_id` and `requested_team_id`: a visitor who could set their own `player_id` could attach themselves to any roster entry.
- **Invitation emails live in `invitations`, never on `players`**, which is publicly readable. The app sends no invitation email; `InviteControl` shows a `?signup=<address>` link (`domain/signup-link.ts`) for the coach to send.
- **Test account permissions on an `authenticated` connection** — `src/data/testdb/accounts-db.ts` builds a committed database from the migrations and hands out visitor connections. Every permission bug in this area has passed the superuser harness.
- `profiles_select` still lets any coach read every profile across organizations, and `profiles.school_id` names one organization even for someone on a school team and a club team. Both are known and left open by the spec.
```

- [ ] **Step 3: Run the gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"
npm run build > /dev/null 2>&1; echo "BUILD=$?"
```
Expected: all `0`.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/2026-09-14-accounts-setup-runbook.md CLAUDE.md
git commit -m "docs: the accounts runbook, and the rules behind invitations and approval

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
