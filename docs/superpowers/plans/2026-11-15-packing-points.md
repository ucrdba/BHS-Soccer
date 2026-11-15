# Packing Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coach record packing points (opponents bypassed by a completed pass or dribble) live on the touchline and from video afterwards, and report them per match and across the season.

**Architecture:** Live taps are a new `packing` kind in the existing `stat_events` log, carrying a `bypassed` count, so they inherit the running-clock gate in `append()` and the single undo. Video tags live in a new `packing_tags` table under the same `stat_matches` row. One pure module, `src/domain/packing.ts`, decides which source counts for a match (video replaces live) and is the only thing the reports read through.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, Vue Router, Supabase (Postgres + RLS), Vitest, `@vue/test-utils`, real Postgres via `src/data/testdb/`.

**Spec:** `docs/superpowers/specs/2026-11-15-packing-points-design.md`

## Global Constraints

- `bypassed` is an integer **1–11** everywhere: the database checks, `validBypassed`, the count buttons. Zero is never stored.
- Live packing is **clock-gated**: `'packing'` goes in `CLOCK_GATED` in `src/stores/plus-minus.ts`, and the guard lives in `append()` and nowhere else.
- **Video replaces live** for a match once it has any non-deleted tag. Live taps are kept, never deleted by this rule.
- For a live-sourced match, `received`, `byPass` and `byDribble` are **`null`, never 0**. Views render null as `—`.
- Rates are per **full match from `seasonFullMatchMinutes`**, never 90, over only the matches where that player has minutes. **No player is filtered out** of any table.
- Video players are typed by **shirt number** (`player.number`), never `recordingNumber`.
- `parseVideoTime` accepts `m:ss` with any whole minutes (`75:30` → 4530) and `h:mm:ss`. Seconds (and `h:mm:ss` minutes) are exactly two digits, 00–59.
- The migration inserts no data (it must apply to the empty demo database) and uses `if not exists` / `drop … if exists` throughout.
- Component styles use the ground tokens in `index.css` (`--ink`, `--rule`, `--mark`, …), never a literal colour.
- Never stage `assets/*.jpg`. Stage files by name.
- Commit messages follow Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Check the exit code, not the output:** `npm test > /dev/null 2>&1; echo "EXIT=$?"`.

## File Map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0041_packing.sql` (create) | `stat_events.bypassed`, the three constraints, `packing_tags`, its RLS |
| `src/data/testdb/packing.test.ts` (create) | Constraints and permissions against real Postgres |
| `src/domain/packing.ts` (create) | Source rule, per-match figures, video time, tag order, shirt-number lookup |
| `src/domain/packing.test.ts` (create) | Its tests |
| `src/data/plus-minus.ts` (modify) | `'packing'` kind, `bypassed` on events, `packing` in `PlayerStats` |
| `src/domain/plus-minus-court.ts` (modify) | Packing column on the live sheet; bench refusal for armed packing |
| `src/stores/plus-minus.ts` (modify) | Gate, `bypassed` validation, camelCase load fix |
| `src/data/supabase.ts` (modify) | `bypassed` on events; `findStatMatch`; tag fetch/add/remove; tags in `fetchSeasonStats` |
| `src/components/schedule/LiveMatchScreen.vue` (modify) | Packing arm button and count row |
| `src/components/schedule/PackingTagScreen.vue` (create) | The video tagging screen |
| `src/views/PackingTagView.vue` (create) | Resolves the fixture from the route |
| `src/router/index.ts` (modify) | `/schedule/:matchId/packing` |
| `src/views/ScheduleView.vue` (modify) | "Packing" link beside "Live ±" |
| `src/data/season-stats.ts` (modify) | Packing totals, rate, coverage |
| `src/domain/season.ts` (modify) | Packing columns |
| `src/components/schedule/SeasonReportScreen.vue` (modify) | Packing columns and notes |
| `src/content/help.ts`, `CLAUDE.md` (modify) | Handbook entry, the rule for future work |

---

### Task 1: Fix reopening a live match (pre-existing bug)

`supabaseService.fetchStatEvents` returns **camelCase** rows (`playerId`, `atSeconds`), but `open()` in `src/stores/plus-minus.ts` reads `r.player_id` and `r.at_seconds`. Every reopened event therefore loads with no player and no clock time. The store tests mock snake_case rows, so they pass anyway. Packing must survive a reopen, so this is fixed first, in its own commit.

**Files:**
- Modify: `src/stores/plus-minus.ts` (the `rows.map` inside `open()`)
- Test: `src/stores/plus-minus.test.ts` (the two `fetchStatEvents.mockResolvedValue([...])` fixtures near line 452 and 463)

**Interfaces:**
- Consumes: `fetchStatEvents(statMatchId) → Array<{ id, kind, playerId, atSeconds, period, createdAt }> | null` (unchanged)
- Produces: `open()` maps that camelCase shape. Later tasks add `bypassed` to it.

- [ ] **Step 1: Change the test fixtures to the shape the service really returns**

In `src/stores/plus-minus.test.ts`, replace the two fixtures:

```ts
    fetchStatEvents.mockResolvedValue([
      { id: 'e1', kind: 'clock_start', playerId: null, atSeconds: 0, period: 1 },
      { id: 'e2', kind: 'plus', playerId: 'p1', atSeconds: 300, period: 1 }
    ]);
```

```ts
    fetchStatEvents.mockResolvedValue([
      { id: 'e1', kind: 'clock_stop', playerId: null, atSeconds: 2400, period: 1 }
    ]);
```

And add this test beside them:

```ts
  it('keeps the player and the clock time of every event it reloads', async () => {
    // fetchStatEvents returns camelCase. Reading snake_case lost both, so a
    // reopened match showed every plus against nobody at 0:00.
    fetchStatEvents.mockResolvedValue([
      { id: 'e1', kind: 'clock_start', playerId: null, atSeconds: 0, period: 1 },
      { id: 'e2', kind: 'on', playerId: 'p1', atSeconds: 0, period: 1 },
      { id: 'e3', kind: 'plus', playerId: 'p1', atSeconds: 300, period: 1 }
    ]);
    const s = await opened();
    expect(s.events[2]).toMatchObject({ kind: 'plus', playerId: 'p1', atSeconds: 300 });
    expect(s.clockBase).toBe(300);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/stores/plus-minus.test.ts`
Expected: FAIL. `playerId` is `undefined` and `clockBase` is `undefined` or `0`.

- [ ] **Step 3: Read the service's shape**

In `open()`, replace the mapping:

```ts
        events.value = rows.map((r: any) => ({
          id: r.id, kind: r.kind, playerId: r.playerId ?? null,
          atSeconds: Number(r.atSeconds) || 0, period: r.period
        }));
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/stores/plus-minus.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/plus-minus.ts src/stores/plus-minus.test.ts
git commit -m "fix: keep the player and clock time when a live match is reopened

fetchStatEvents returns camelCase rows and open() read snake_case, so every
reloaded event lost its player and its clock time.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0041 and its database tests

**Files:**
- Create: `supabase/migrations/0041_packing.sql`
- Create: `src/data/testdb/packing.test.ts`

**Interfaces:**
- Produces: `stat_events.bypassed smallint`; constraints `stat_events_kind_chk`, `stat_events_player_chk`, `stat_events_bypassed_chk`; table `public.packing_tags (id, match_id, player_id, receiver_id, action, bypassed, video_seconds, is_deleted, created_at)`.

- [ ] **Step 1: Write the failing database test**

Create `src/data/testdb/packing.test.ts`:

```ts
/**
 * 0041 — packing points.
 *
 * Constraint questions run on the owner connection inside a rolled-back
 * transaction. Every question about who may read or write a tag runs as a
 * visitor: the superuser harness would pass them all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { hasTestDb } from './harness';
import {
  buildAccountsDb, one, makeTeam, makeRosterEntry, makeCoach, signUp,
  type AccountsDb
} from './accounts-db';

const available = await hasTestDb();

const read = (file: string) => readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8')
  .replace(/^\s*(begin|commit)\s*;\s*$/gim, '');

type Team = { id: string; school_id: string };

async function makeStatMatch(owner: pg.Client, team: Team): Promise<string> {
  const row = await one(owner,
    `insert into public.stat_matches (team_id, school_id, label) values ($1, $2, 'fixture') returning id`,
    [team.id, team.school_id]);
  return row.id;
}

/** Runs fn in a savepoint and expects Postgres to refuse it. */
async function refused(c: pg.Client, fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  await c.query('savepoint s');
  await expect(fn()).rejects.toThrow(pattern);
  await c.query('rollback to savepoint s');
}

describe.skipIf(!available)('0041: packing', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  const event = (c: pg.Client, match: string, kind: string, player: string | null, bypassed: number | null) =>
    c.query(
      `insert into public.stat_events (match_id, kind, player_id, at_seconds, bypassed) values ($1, $2, $3, 60, $4)`,
      [match, kind, player, bypassed]);

  const tag = (c: pg.Client, match: string, t: {
    player: string; receiver: string | null; action: string; bypassed: number; video?: number | null;
  }) => c.query(
    `insert into public.packing_tags (match_id, player_id, receiver_id, action, bypassed, video_seconds)
     values ($1, $2, $3, $4, $5, $6)`,
    [match, t.player, t.receiver, t.action, t.bypassed, t.video ?? null]);

  it('stores a live packing tap and refuses one without a count in range', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const p = await makeRosterEntry(c, team);
      const m = await makeStatMatch(c, team);

      await event(c, m, 'packing', p, 3);
      await event(c, m, 'packing', p, 11);
      await refused(c, () => event(c, m, 'packing', p, null), /stat_events_bypassed_chk/);
      await refused(c, () => event(c, m, 'packing', p, 0), /stat_events_bypassed_chk/);
      await refused(c, () => event(c, m, 'packing', p, 12), /stat_events_bypassed_chk/);
      await refused(c, () => event(c, m, 'packing', null, 3), /stat_events_player_chk/);
      await refused(c, () => event(c, m, 'plus', p, 2), /stat_events_bypassed_chk/);
    } finally {
      await c.query('rollback');
    }
  });

  it('still accepts every kind that existed before it', async () => {
    // The kind and player checks are dropped and recreated; one that lost a
    // kind would refuse a live match mid-half.
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const p = await makeRosterEntry(c, team);
      const m = await makeStatMatch(c, team);
      for (const k of ['on', 'off', 'plus', 'minus', 'shot', 'goal', 'assist']) await event(c, m, k, p, null);
      for (const k of ['goal_for', 'goal_against', 'clock_start', 'clock_stop', 'period']) await event(c, m, k, null, null);
      await refused(c, () => event(c, m, 'tackle', p, null), /stat_events_kind_chk/);
    } finally {
      await c.query('rollback');
    }
  });

  it('holds a video tag to its shape', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const a = await makeRosterEntry(c, team);
      const b = await makeRosterEntry(c, team);
      const m = await makeStatMatch(c, team);

      await tag(c, m, { player: a, receiver: b, action: 'pass', bypassed: 4, video: 1421 });
      await tag(c, m, { player: a, receiver: null, action: 'dribble', bypassed: 2 });

      await refused(c, () => tag(c, m, { player: a, receiver: null, action: 'pass', bypassed: 2 }), /packing_tags_receiver_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: b, action: 'dribble', bypassed: 2 }), /packing_tags_receiver_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: a, action: 'pass', bypassed: 2 }), /packing_tags_receiver_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: null, action: 'header', bypassed: 2 }), /packing_tags_action_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: null, action: 'dribble', bypassed: 0 }), /packing_tags_bypassed_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: null, action: 'dribble', bypassed: 12 }), /packing_tags_bypassed_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: null, action: 'dribble', bypassed: 2, video: -1 }), /packing_tags_video_chk/);
    } finally {
      await c.query('rollback');
    }
  });

  it('runs a second time without complaint', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      await c.query(read('0041_packing.sql'));
    } finally {
      await c.query('rollback');
    }
  });

  describe('who may read and write tags', () => {
    let team: Team, other: Team, match: string, player: string, receiver: string;
    let coach: string, otherCoach: string, playerAccount: string;

    beforeAll(async () => {
      team = await makeTeam(db.owner);
      other = await makeTeam(db.owner);
      player = await makeRosterEntry(db.owner, team);
      receiver = await makeRosterEntry(db.owner, team);
      match = await makeStatMatch(db.owner, team);
      await tag(db.owner, match, { player, receiver, action: 'pass', bypassed: 3 });
      coach = await makeCoach(db.owner, team);
      otherCoach = await makeCoach(db.owner, other);
      const u = await signUp(db.owner, { confirmed: true });
      await db.owner.query(
        `update public.profiles set role = 'player', status = 'active', player_id = $2 where id = $1`,
        [u.id, player]);
      playerAccount = u.id;
    }, 60_000);

    const count = async (c: pg.Client) =>
      Number((await one(c, `select count(*)::int as n from public.packing_tags where match_id = $1`, [match])).n);

    it("lets the team's coach read and write", async () => {
      await db.asUser(coach, async (c) => {
        expect(await count(c)).toBe(1);
        await tag(c, match, { player, receiver: null, action: 'dribble', bypassed: 1 });
        expect(await count(c)).toBe(2);
      });
    });

    it("hides the team's tags from another team's coach and refuses their writes", async () => {
      await db.asUser(otherCoach, async (c) => {
        expect(await count(c)).toBe(0);
        await expect(tag(c, match, { player, receiver: null, action: 'dribble', bypassed: 1 }))
          .rejects.toThrow(/row-level security/);
      });
    });

    it('gives a player and a signed-out visitor nothing', async () => {
      await db.asUser(playerAccount, async (c) => {
        expect(await count(c)).toBe(0);
        await expect(tag(c, match, { player, receiver: null, action: 'dribble', bypassed: 1 }))
          .rejects.toThrow(/row-level security/);
      });
      await db.asAnon(async (c) => {
        await expect(count(c)).rejects.toThrow(/permission denied/);
      });
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/data/testdb/packing.test.ts`
Expected: FAIL, with `column "bypassed" … does not exist` / `relation "public.packing_tags" does not exist`. (If it reports *skipped*, no Postgres is answering on 5432. Start one before going on: these tests are the only proof of the constraints.)

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0041_packing.sql`:

```sql
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
-- ten, so a pass that also takes out the keeper is not refused.
alter table public.stat_events drop constraint if exists stat_events_bypassed_chk;
alter table public.stat_events add constraint stat_events_bypassed_chk
  check (
    (kind = 'packing' and bypassed between 1 and 11)
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
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/data/testdb/packing.test.ts`
Expected: PASS, 7 tests.

Then run the schema suites, which build from every migration:
`npx vitest run src/data/testdb/schema-applies.test.ts src/data/testdb/demo-schema-steps.test.ts src/data/testdb/demo-rebuild.test.ts`
Expected: PASS. A failure here means the migration doesn't apply to an empty database, so fix the migration, not the test.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0041_packing.sql src/data/testdb/packing.test.ts
git commit -m "feat: store packing points live in the match log and from video in packing_tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `src/domain/packing.ts`

**Files:**
- Create: `src/domain/packing.ts`
- Test: `src/domain/packing.test.ts`

**Interfaces:**
- Produces (exact; later tasks import these):

```ts
export const PACKING_MIN = 1;
export const PACKING_MAX = 11;
export type PackingAction = 'pass' | 'dribble';
export type PackingSource = 'video' | 'live' | 'none';
export interface PackingTag {
  id?: string; playerId: string; receiverId: string | null; action: PackingAction;
  bypassed: number; videoSeconds: number | null; isDeleted?: boolean; createdAt?: string;
}
export interface LiveEventLike { kind: string; playerId?: string | null; bypassed?: number | null; isDeleted?: boolean }
export interface PlayerPacking { packing: number; received: number | null; byPass: number | null; byDribble: number | null }
export interface MatchPacking { source: PackingSource; players: Map<string, PlayerPacking> }
export type VideoTime = { ok: true; seconds: number | null } | { ok: false; error: string };
export function validBypassed(n: unknown): n is number;
export function livePackingCount(events: LiveEventLike[]): number;
export function packingSource(events: LiveEventLike[], tags: PackingTag[]): PackingSource;
export function matchPacking(events: LiveEventLike[], tags: PackingTag[], playerIds?: string[]): MatchPacking;
export function parseVideoTime(text: string | null | undefined): VideoTime;
export function formatVideoTime(seconds: number | null | undefined): string;
export function orderTags(tags: PackingTag[]): PackingTag[];
export function resolveShirtNumber(squad: any[], text: string): { player: any | null; candidates: any[] };
```

- [ ] **Step 1: Write the failing tests**

Create `src/domain/packing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  validBypassed, livePackingCount, packingSource, matchPacking,
  parseVideoTime, formatVideoTime, orderTags, resolveShirtNumber,
  type PackingTag, type LiveEventLike
} from './packing';

const tap = (playerId: string, bypassed: number, extra: Partial<LiveEventLike> = {}): LiveEventLike =>
  ({ kind: 'packing', playerId, bypassed, ...extra });
const pass = (playerId: string, receiverId: string, bypassed: number, extra: Partial<PackingTag> = {}): PackingTag =>
  ({ playerId, receiverId, action: 'pass', bypassed, videoSeconds: null, ...extra });
const dribble = (playerId: string, bypassed: number, extra: Partial<PackingTag> = {}): PackingTag =>
  ({ playerId, receiverId: null, action: 'dribble', bypassed, videoSeconds: null, ...extra });

describe('validBypassed', () => {
  it('accepts whole numbers from 1 to 11 and nothing else', () => {
    expect([1, 5, 11].every(validBypassed)).toBe(true);
    expect([0, 12, -1, 2.5, NaN, null, undefined, '3'].some(validBypassed)).toBe(false);
  });
});

describe('which record counts for a match', () => {
  it('is live when there are only live taps', () => {
    expect(packingSource([tap('a', 2)], [])).toBe('live');
  });

  it('is video as soon as there is one tag, however many live taps there are', () => {
    expect(packingSource([tap('a', 2), tap('b', 3)], [dribble('a', 1)])).toBe('video');
  });

  it('goes back to live when every tag is removed', () => {
    expect(packingSource([tap('a', 2)], [dribble('a', 1, { isDeleted: true })])).toBe('live');
  });

  it('is none when nothing was recorded, and ignores undone taps and other kinds', () => {
    expect(packingSource([], [])).toBe('none');
    expect(packingSource([tap('a', 2, { isDeleted: true }), { kind: 'plus', playerId: 'a' }], [])).toBe('none');
  });
});

describe('a match’s figures', () => {
  it('sums live taps and leaves what live entry never asked as null, not 0', () => {
    const m = matchPacking([tap('a', 2), tap('a', 3), tap('b', 1)], [], ['a', 'b', 'c']);
    expect(m.source).toBe('live');
    expect(m.players.get('a')).toEqual({ packing: 5, received: null, byPass: null, byDribble: null });
    expect(m.players.get('c')).toEqual({ packing: 0, received: null, byPass: null, byDribble: null });
  });

  it('counts video tags instead of live taps once any exist', () => {
    const m = matchPacking(
      [tap('a', 9)],
      [pass('a', 'b', 3), dribble('a', 2), pass('b', 'a', 1)],
      ['a', 'b', 'c']);
    expect(m.source).toBe('video');
    expect(m.players.get('a')).toEqual({ packing: 5, received: 1, byPass: 3, byDribble: 2 });
    expect(m.players.get('b')).toEqual({ packing: 1, received: 3, byPass: 1, byDribble: 0 });
    // Someone on the roster who did nothing on the video did nothing: zero.
    expect(m.players.get('c')).toEqual({ packing: 0, received: 0, byPass: 0, byDribble: 0 });
  });

  it('ignores a removed tag', () => {
    const m = matchPacking([], [pass('a', 'b', 3), pass('a', 'b', 4, { isDeleted: true })]);
    expect(m.players.get('a')!.packing).toBe(3);
  });

  it('counts the live taps on the screen that warns about replacement', () => {
    expect(livePackingCount([tap('a', 2), tap('b', 1, { isDeleted: true }), { kind: 'plus', playerId: 'a' }])).toBe(1);
  });
});

describe('video time', () => {
  it.each([
    ['23:41', 1421], ['0:07', 7], ['75:30', 4530], ['1:02:05', 3725], ['  9:00 ', 540]
  ])('reads %s as %i seconds', (text, seconds) => {
    expect(parseVideoTime(text)).toEqual({ ok: true, seconds });
  });

  it('takes a blank box as no time at all', () => {
    expect(parseVideoTime('')).toEqual({ ok: true, seconds: null });
    expect(parseVideoTime(null)).toEqual({ ok: true, seconds: null });
  });

  it.each(['23:5', '23:60', '1:60:00', '1:02:5', 'abc', '-1:00', '23.41', '12'])('refuses %s', (text) => {
    const r = parseVideoTime(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/m:ss/);
  });

  it('writes a time back the way it is typed', () => {
    expect(formatVideoTime(1421)).toBe('23:41');
    expect(formatVideoTime(3725)).toBe('1:02:05');
    expect(formatVideoTime(null)).toBe('');
  });
});

describe('the tag list order', () => {
  it('puts timed tags in video order and untimed ones last, as entered', () => {
    const tags = [
      dribble('u1', 1),
      dribble('t2', 1, { videoSeconds: 600 }),
      dribble('u2', 1),
      dribble('t1', 1, { videoSeconds: 30 })
    ];
    expect(orderTags(tags).map(t => t.playerId)).toEqual(['t1', 't2', 'u1', 'u2']);
  });
});

describe('finding a player by shirt number', () => {
  const squad = [
    { id: 'a', name: 'A', number: 9, recordingNumber: 4 },
    { id: 'b', name: 'B', number: 4, recordingNumber: 9 },
    { id: 'c', name: 'C', number: 7 },
    { id: 'd', name: 'D', number: 7 }
  ];

  it('reads the shirt number, not the recording number', () => {
    expect(resolveShirtNumber(squad, '9').player.id).toBe('a');
  });

  it('names nobody when two players share the number, and offers both', () => {
    const r = resolveShirtNumber(squad, '7');
    expect(r.player).toBeNull();
    expect(r.candidates.map(p => p.id)).toEqual(['c', 'd']);
  });

  it('names nobody for a number nobody wears, or for text', () => {
    expect(resolveShirtNumber(squad, '23')).toEqual({ player: null, candidates: [] });
    expect(resolveShirtNumber(squad, 'x')).toEqual({ player: null, candidates: [] });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/domain/packing.test.ts`
Expected: FAIL with `Failed to resolve import "./packing"`.

- [ ] **Step 3: Write the module**

Create `src/domain/packing.ts`:

```ts
/**
 * Packing points: opponents taken out of play by a completed pass or dribble.
 *
 * Two records can exist for one match. Live taps (a 'packing' event in the
 * stat_events log) carry only a player and a count. Video tags carry the
 * action, the receiver of a pass, and the count. **Once a match has any video
 * tag, the tags count and the live taps do not** — the video is the careful
 * record. Both are kept; removing every tag brings the live taps back.
 *
 * This module is the only place that rule lives. Every report reads a match
 * through `matchPacking`, so no two screens can disagree about which source
 * counted.
 *
 * Live entry never asks who received the ball or whether it was a pass, so a
 * live-sourced match reports those as null, not 0: zero would be a claim
 * nobody made.
 */

export const PACKING_MIN = 1;
export const PACKING_MAX = 11;

export type PackingAction = 'pass' | 'dribble';
export type PackingSource = 'video' | 'live' | 'none';

export interface PackingTag {
  id?: string;
  playerId: string;
  receiverId: string | null;
  action: PackingAction;
  bypassed: number;
  videoSeconds: number | null;
  isDeleted?: boolean;
  createdAt?: string;
}

export interface LiveEventLike {
  kind: string;
  playerId?: string | null;
  bypassed?: number | null;
  isDeleted?: boolean;
}

export interface PlayerPacking {
  packing: number;
  received: number | null;
  byPass: number | null;
  byDribble: number | null;
}

export interface MatchPacking {
  source: PackingSource;
  players: Map<string, PlayerPacking>;
}

export type VideoTime = { ok: true; seconds: number | null } | { ok: false; error: string };

export function validBypassed(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= PACKING_MIN && n <= PACKING_MAX;
}

const liveTaps = (events: LiveEventLike[]) =>
  (events || []).filter(e => e && e.kind === 'packing' && !e.isDeleted && !!e.playerId);

const keptTags = (tags: PackingTag[]) => (tags || []).filter(t => t && !t.isDeleted);

export function livePackingCount(events: LiveEventLike[]): number {
  return liveTaps(events).length;
}

export function packingSource(events: LiveEventLike[], tags: PackingTag[]): PackingSource {
  if (keptTags(tags).length > 0) return 'video';
  if (liveTaps(events).length > 0) return 'live';
  return 'none';
}

export function matchPacking(
  events: LiveEventLike[], tags: PackingTag[], playerIds: string[] = []
): MatchPacking {
  const source = packingSource(events, tags);
  const video = source === 'video';
  const players = new Map<string, PlayerPacking>();

  const ensure = (id: string): PlayerPacking => {
    if (!players.has(id)) {
      players.set(id, {
        packing: 0,
        received: video ? 0 : null,
        byPass: video ? 0 : null,
        byDribble: video ? 0 : null
      });
    }
    return players.get(id)!;
  };
  playerIds.forEach(ensure);

  if (video) {
    for (const t of keptTags(tags)) {
      const p = ensure(t.playerId);
      p.packing += t.bypassed;
      if (t.action === 'pass') {
        p.byPass = (p.byPass ?? 0) + t.bypassed;
        if (t.receiverId) {
          const r = ensure(t.receiverId);
          r.received = (r.received ?? 0) + t.bypassed;
        }
      } else {
        p.byDribble = (p.byDribble ?? 0) + t.bypassed;
      }
    }
  } else {
    for (const e of liveTaps(events)) ensure(e.playerId as string).packing += Number(e.bypassed) || 0;
  }

  return { source, players };
}

const TIME_REFUSAL = 'Type the video time as m:ss or h:mm:ss — for example 23:41 or 1:02:05 — or leave it blank.';

/**
 * Where an action is in the video, in seconds.
 *
 * Not `parseTimeToSeconds`: that reads '.' as ':' and serves fitness times.
 * Whole minutes may run past 59 (`75:30`), because a video player's scrub bar
 * often shows a long video that way and the reading is unambiguous. Seconds
 * are always two digits, so `23:5` is refused rather than guessed.
 */
export function parseVideoTime(text: string | null | undefined): VideoTime {
  const s = String(text ?? '').trim();
  if (s === '') return { ok: true, seconds: null };

  let m = /^(\d+):(\d{2})$/.exec(s);
  if (m) {
    const sec = Number(m[2]);
    if (sec > 59) return { ok: false, error: TIME_REFUSAL };
    return { ok: true, seconds: Number(m[1]) * 60 + sec };
  }

  m = /^(\d+):(\d{2}):(\d{2})$/.exec(s);
  if (m) {
    const min = Number(m[2]);
    const sec = Number(m[3]);
    if (min > 59 || sec > 59) return { ok: false, error: TIME_REFUSAL };
    return { ok: true, seconds: Number(m[1]) * 3600 + min * 60 + sec };
  }

  return { ok: false, error: TIME_REFUSAL };
}

export function formatVideoTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  const n = Math.max(0, Math.floor(seconds));
  const two = (v: number) => String(v).padStart(2, '0');
  if (n < 3600) return `${Math.floor(n / 60)}:${two(n % 60)}`;
  return `${Math.floor(n / 3600)}:${two(Math.floor((n % 3600) / 60))}:${two(n % 60)}`;
}

/** Timed tags in video order; untimed ones after them, in the order entered. */
export function orderTags(tags: PackingTag[]): PackingTag[] {
  return (tags || [])
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const x = a.t.videoSeconds, y = b.t.videoSeconds;
      if (x != null && y != null && x !== y) return x - y;
      if (x != null && y == null) return -1;
      if (x == null && y != null) return 1;
      return a.i - b.i;
    })
    .map(v => v.t);
}

/**
 * The player wearing this shirt number.
 *
 * The shirt, because that is what the video shows — never the recording
 * number. Null unless exactly one player wears it; `candidates` lets the screen
 * offer a choice when two do.
 */
export function resolveShirtNumber(squad: any[], text: string): { player: any | null; candidates: any[] } {
  const s = String(text ?? '').trim();
  if (!/^\d+$/.test(s)) return { player: null, candidates: [] };
  const n = Number(s);
  const candidates = (squad || []).filter(p => p && p.number != null && Number(p.number) === n);
  return { player: candidates.length === 1 ? candidates[0] : null, candidates };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/domain/packing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/packing.ts src/domain/packing.test.ts
git commit -m "feat: decide per match whether video tags or live taps count for packing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Packing in the replay, the live sheet and the tap rules

**Files:**
- Modify: `src/data/plus-minus.ts` (`StatKind`, `StatEvent`, `PlayerStats`, `blank`, `replay`)
- Modify: `src/domain/plus-minus-court.ts` (`pmResolveTap`, `pmColumns`)
- Test: `src/data/plus-minus.test.ts`, `src/domain/plus-minus-court.test.ts`

**Interfaces:**
- Produces: `StatKind` includes `'packing'`; `StatEvent.bypassed?: number | null`; `PlayerStats.packing: number`; `pmColumns()` gains `{ key: 'packing', label: 'Pack' }` last; `pmResolveTap({ armed: 'packing', onPitch: false, … })` → `{ kind: null }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/data/plus-minus.test.ts` (it already imports `replay`):

```ts
describe('packing in the replay', () => {
  const base = [
    { kind: 'clock_start', atSeconds: 0, seq: 1 },
    { kind: 'on', playerId: 'a', atSeconds: 0, seq: 2 },
    { kind: 'on', playerId: 'b', atSeconds: 0, seq: 3 },
    { kind: 'plus', playerId: 'a', atSeconds: 100, seq: 4 },
    { kind: 'goal_for', atSeconds: 200, seq: 5 },
    { kind: 'off', playerId: 'b', atSeconds: 300, seq: 6 },
    { kind: 'clock_stop', atSeconds: 600, seq: 7 }
  ] as any[];

  it('sums the opponents bypassed per player', () => {
    const s = replay([
      ...base,
      { kind: 'packing', playerId: 'a', bypassed: 3, atSeconds: 150, seq: 8 },
      { kind: 'packing', playerId: 'a', bypassed: 2, atSeconds: 160, seq: 9 }
    ] as any, ['a', 'b']);
    expect(s.get('a')!.packing).toBe(5);
    expect(s.get('b')!.packing).toBe(0);
  });

  it('leaves every other figure exactly as it was', () => {
    const without = replay(base, ['a', 'b']);
    const withPacking = replay([
      ...base.slice(0, 4),
      { kind: 'packing', playerId: 'a', bypassed: 4, atSeconds: 150, seq: 4.5 },
      { kind: 'packing', playerId: 'b', bypassed: 1, atSeconds: 250, seq: 5.5 },
      ...base.slice(4)
    ] as any, ['a', 'b']);
    for (const id of ['a', 'b']) {
      const { packing: _p, ...rest } = withPacking.get(id)!;
      const { packing: _q, ...was } = without.get(id)!;
      expect(rest).toEqual(was);
    }
  });
});
```

In `src/domain/plus-minus-court.test.ts`, change the column-keys expectation (around line 299) to:

```ts
    expect(pmColumns().map(c => c.key)).toEqual(
      ['number', 'name', 'plus', 'minus', 'score', 'gd', 'mins', 'shots', 'goals', 'assists', 'packing']);
```

and add:

```ts
describe('an armed packing tap', () => {
  it('reaches a player on the pitch', () => {
    expect(pmResolveTap({ armed: 'packing', fingers: 1, rightClick: false, onPitch: true }))
      .toEqual({ kind: 'packing', disarm: true });
  });

  it('refuses a bench player, who cannot have bypassed anyone', () => {
    expect(pmResolveTap({ armed: 'packing', fingers: 1, rightClick: false, onPitch: false }))
      .toEqual({ kind: null });
  });
});
```

(If `pmResolveTap` isn't imported in that file yet, add it to the existing import from `./plus-minus-court`.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/data/plus-minus.test.ts src/domain/plus-minus-court.test.ts`
Expected: FAIL. `packing` is `undefined`, the column list is missing `packing`, and the bench tap returns `{ kind: 'packing', disarm: true }`.

- [ ] **Step 3: Implement**

In `src/data/plus-minus.ts`:

```ts
export type StatKind =
  | 'on' | 'off'
  | 'plus' | 'minus'
  | 'shot' | 'goal' | 'assist'
  | 'packing'
  | 'goal_for' | 'goal_against'
  | 'clock_start' | 'clock_stop'
  | 'period';

export interface StatEvent {
  id?: string;
  kind: StatKind;
  playerId?: string | null;
  atSeconds: number;
  period?: number;
  /** Opponents bypassed, 1–11. Only on a 'packing' event. */
  bypassed?: number | null;
  /** Ordering within the same clock second. Insertion order is the fallback. */
  seq?: number;
}
```

Add `packing: number;` to `PlayerStats` (after `assists`, with the comment `/** Opponents bypassed, from live taps only. The reports use domain/packing.ts. */`), add `packing: 0` to `blank`, and add a case to `replay`'s switch after `'assist'`:

```ts
      // Live packing. Changes nothing else: it is not a goal, a plus or a
      // substitution, so minutes and differential must not notice it.
      case 'packing':
        if (e.playerId) ensure(e.playerId).packing += Number(e.bypassed) || 0;
        break;
```

In `src/domain/plus-minus-court.ts`, replace the first line of `pmResolveTap`'s body:

```ts
  if (armed) {
    // Armed wins, except that packing needs somebody on the pitch: a bench
    // player cannot have taken anyone out of the game.
    if (armed === 'packing' && !onPitch) return { kind: null };
    return { kind: armed, disarm: true };
  }
```

and append to the array `pmColumns()` returns:

```ts
    { key: 'packing', label: 'Pack',    desc: true,  text: false, get: (p, s) => s.packing || 0 }
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/data/plus-minus.test.ts src/domain/plus-minus-court.test.ts src/components/schedule`
Expected: PASS. The schedule components share these modules, which is why they're in the run.

- [ ] **Step 5: Commit**

```bash
git add src/data/plus-minus.ts src/data/plus-minus.test.ts src/domain/plus-minus-court.ts src/domain/plus-minus-court.test.ts
git commit -m "feat: replay live packing taps without moving any other figure

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The store gate and the service's `bypassed`

**Files:**
- Modify: `src/stores/plus-minus.ts` (`CLOCK_GATED`, refusal wording, `append`, `open` mapping)
- Modify: `src/data/supabase.ts` (`appendStatEvent`, `fetchStatEvents`)
- Test: `src/stores/plus-minus.test.ts`

**Interfaces:**
- Consumes: `validBypassed` from `src/domain/packing.ts`; `StatEvent.bypassed` from Task 4.
- Produces: `append(kind: StatKind, playerId?: string | null, bypassed?: number): Promise<WriteResult>`; `appendStatEvent(id, { kind, playerId, atSeconds, period, bypassed? })`; `fetchStatEvents` rows include `bypassed: number | null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/stores/plus-minus.test.ts`:

```ts
describe('packing', () => {
  it('is refused while the clock is stopped, like every other statistic', async () => {
    const s = await opened();
    await s.movePlayer('p1', true);
    const res = await s.append('packing', 'p1', 3);
    expect(res.ok).toBe(false);
    expect(s.notice).toMatch(/start the clock/i);
    expect(kinds(s)).not.toContain('packing');
    expect(appendStatEvent).not.toHaveBeenCalledWith('sm1', expect.objectContaining({ kind: 'packing' }));
  });

  it('is refused without a count from 1 to 11, before anything reaches the board', async () => {
    const s = await running();
    await s.movePlayer('p1', true);
    for (const bad of [undefined, 0, 12, 2.5]) {
      const res = await s.append('packing', 'p1', bad as any);
      expect(res.ok).toBe(false);
    }
    expect(kinds(s)).not.toContain('packing');
    expect(s.notice).toMatch(/1 to 11/);
  });

  it('records the count and sends it to the database', async () => {
    const s = await running();
    await s.movePlayer('p1', true);
    const res = await s.append('packing', 'p1', 4);
    expect(res.ok).toBe(true);
    expect(s.events[s.events.length - 1]).toMatchObject({ kind: 'packing', playerId: 'p1', bypassed: 4 });
    expect(appendStatEvent).toHaveBeenLastCalledWith('sm1', expect.objectContaining({ kind: 'packing', bypassed: 4 }));
    expect(replay(orderEvents(s.events), ['p1']).get('p1')!.packing).toBe(4);
  });

  it('is undone like any other tap', async () => {
    const s = await running();
    await s.movePlayer('p1', true);
    await s.append('packing', 'p1', 4);
    await s.undo();
    expect(kinds(s)).not.toContain('packing');
  });

  it('keeps the count of a tap it reloads', async () => {
    fetchStatEvents.mockResolvedValue([
      { id: 'e1', kind: 'packing', playerId: 'p1', atSeconds: 120, period: 1, bypassed: 3 }
    ]);
    const s = await opened();
    expect(s.events[0]).toMatchObject({ kind: 'packing', bypassed: 3 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/stores/plus-minus.test.ts`
Expected: FAIL. The stopped-clock tap is recorded, the bad counts are accepted, and `bypassed` is missing.

- [ ] **Step 3: Implement the store**

In `src/stores/plus-minus.ts`, add `import { validBypassed } from '../domain/packing';` and set:

```ts
const CLOCK_GATED: StatKind[] = [
  'plus', 'minus', 'shot', 'goal', 'assist', 'packing', 'goal_for', 'goal_against'
];
```

Change `append`'s signature and its refusal wording, and add the count guard straight after the clock guard:

```ts
  async function append(kind: StatKind, playerId?: string | null, bypassed?: number): Promise<WriteResult> {
    // THE RULE. See the module comment.
    if (CLOCK_GATED.includes(kind) && !running.value) {
      say(everStarted.value
        ? 'The clock is stopped. Start it to record match statistics.'
        : 'Please start the clock to record match statistics — before kick-off '
          + 'they stamp at 0:00 and nobody is credited any minutes.');
      return { ok: false, error: notice.value };
    }

    // Here rather than left to the database, so the board never shows a tap
    // the write would refuse.
    if (kind === 'packing' && !validBypassed(bypassed)) {
      say('Pick how many opponents that took out, from 1 to 11.');
      return { ok: false, error: notice.value };
    }
```

Build the event with the count only on a packing tap. That way existing `toEqual` assertions on other events are unaffected:

```ts
    const event: StatEvent = {
      kind,
      playerId: playerId || null,
      atSeconds: clock.value,
      period: period.value,
      seq: (seq.value += 1),
      ...(kind === 'packing' ? { bypassed } : {})
    };
```

In `open()`, extend the Task 1 mapping:

```ts
        events.value = rows.map((r: any) => ({
          id: r.id, kind: r.kind, playerId: r.playerId ?? null,
          atSeconds: Number(r.atSeconds) || 0, period: r.period,
          ...(r.bypassed != null ? { bypassed: Number(r.bypassed) } : {})
        }));
```

- [ ] **Step 4: Implement the service**

In `src/data/supabase.ts`:

`appendStatEvent`: widen the parameter type to `{ kind: string; playerId?: string | null; atSeconds: number; period?: number; bypassed?: number | null }` and add to the inserted object:

```ts
        bypassed: event.kind === 'packing' ? event.bypassed ?? null : null,
```

`fetchStatEvents`: select `'id, kind, player_id, at_seconds, period, bypassed, created_at'` and add `bypassed: r.bypassed` to the mapped row.

`fetchSeasonStats`: select `'id, match_id, kind, player_id, at_seconds, period, bypassed, created_at'` and add `bypassed: r.bypassed` to the pushed row.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run src/stores/plus-minus.test.ts src/components/schedule && npm run typecheck`
Expected: PASS, and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/stores/plus-minus.ts src/stores/plus-minus.test.ts src/data/supabase.ts
git commit -m "feat: record live packing only while the clock runs, with a count from 1 to 11

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Packing button on the live board

**Files:**
- Modify: `src/components/schedule/LiveMatchScreen.vue`
- Test: `src/components/schedule/LiveMatchScreen.test.ts`

**Interfaces:**
- Consumes: `pm.append('packing', id, n)`, `pm.arm('packing' | null)`, `pmResolveTap`, `PACKING_MIN`/`PACKING_MAX`.
- Produces: DOM hooks `[data-pm-arm="packing"]`, `[data-pm-count-row]`, `[data-pm-count="N"]`, `[data-pm-count-cancel]`, `[data-pm-packing-for="<playerId>"]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/schedule/LiveMatchScreen.test.ts`. Use the file's existing `mountBoard`, `openSettled` and `flush`. `mountBoard` returns the wrapper. Get the store with `usePlusMinusStore()` after mounting, the way the file's other tests do:

```ts
describe('packing', () => {
  async function liveWithP1On() {
    const w = await mountBoard();
    const pm = usePlusMinusStore();
    await openSettled(pm);
    await pm.movePlayer('p1', true);
    await pm.toggleClock();
    await flush();
    return { w, pm };
  }

  it('records arm, player, count as one packing tap and disarms', async () => {
    const { w, pm } = await liveWithP1On();
    await w.find('[data-pm-arm="packing"]').trigger('click');
    await w.find('[data-pm-player="p1"]').trigger('click');
    await flush();
    expect(w.find('[data-pm-count-row]').exists()).toBe(true);

    await w.find('[data-pm-count="3"]').trigger('click');
    await flush();
    expect(pm.events.filter((e: any) => e.kind === 'packing'))
      .toEqual([expect.objectContaining({ playerId: 'p1', bypassed: 3 })]);
    expect(pm.armed).toBeNull();
    expect(w.find('[data-pm-count-row]').exists()).toBe(false);
    expect(w.find('[data-pm-packing-for="p1"]').text()).toContain('3');
  });

  it('offers eleven counts and nothing else', async () => {
    const { w } = await liveWithP1On();
    await w.find('[data-pm-arm="packing"]').trigger('click');
    await w.find('[data-pm-player="p1"]').trigger('click');
    await flush();
    expect(w.findAll('[data-pm-count]').map(b => b.attributes('data-pm-count')))
      .toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  });

  it('records nothing when Cancel is pressed, or Packing is pressed again', async () => {
    const { w, pm } = await liveWithP1On();
    await w.find('[data-pm-arm="packing"]').trigger('click');
    await w.find('[data-pm-player="p1"]').trigger('click');
    await flush();
    await w.find('[data-pm-count-cancel]').trigger('click');
    await flush();
    expect(w.find('[data-pm-count-row]').exists()).toBe(false);
    expect(pm.armed).toBeNull();

    await w.find('[data-pm-arm="packing"]').trigger('click');
    await w.find('[data-pm-player="p1"]').trigger('click');
    await flush();
    await w.find('[data-pm-arm="packing"]').trigger('click');
    await flush();
    expect(w.find('[data-pm-count-row]').exists()).toBe(false);
    expect(pm.events.some((e: any) => e.kind === 'packing')).toBe(false);
  });

  it('says the clock is stopped instead of arming while it is', async () => {
    const w = await mountBoard();
    const pm = usePlusMinusStore();
    await openSettled(pm);
    await w.find('[data-pm-arm="packing"]').trigger('click');
    await flush();
    expect(pm.armed).toBeNull();
    expect(w.find('[data-pm-notice]').text()).toMatch(/start the clock/i);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/components/schedule/LiveMatchScreen.test.ts`
Expected: FAIL, because `[data-pm-arm="packing"]` doesn't exist.

- [ ] **Step 3: Implement**

In `LiveMatchScreen.vue`'s script:

```ts
import { PACKING_MIN, PACKING_MAX } from '../../domain/packing';

const EVENT_KINDS = [
  { kind: 'shot' as const, label: 'Shot' },
  { kind: 'goal' as const, label: 'Goal' },
  { kind: 'assist' as const, label: 'Assist' },
  { kind: 'packing' as const, label: 'Packing' }
];

const COUNTS = Array.from({ length: PACKING_MAX - PACKING_MIN + 1 }, (_, i) => PACKING_MIN + i);

/** The player whose packing count is being chosen, between the tap and the count. */
const packingFor = ref<string | null>(null);

// Pressing Packing again disarms it, and that has to close the count row too.
watch(() => pm.armed, (k) => { if (k !== 'packing') packingFor.value = null; });

async function onArm(kind: 'shot' | 'goal' | 'assist' | 'packing'): Promise<void> {
  if (!pm.running) { await pm.append(kind); return; }
  pm.arm(kind);
}

async function onCount(n: number): Promise<void> {
  const id = packingFor.value;
  packingFor.value = null;
  pm.arm(null);
  if (id) await pm.append('packing', id, n);
}

function onCountCancel(): void {
  packingFor.value = null;
  pm.arm(null);
}
```

`pm.append('packing')` with no count while the clock is stopped still hits the clock guard first. That's intended: the coach sees the clock message, not the count message.

In `onTapPlayer`, after `if (!decision?.kind) return;`, insert:

```ts
  // Packing needs a count before anything is recorded; stay armed until it
  // is chosen or cancelled.
  if (decision.kind === 'packing') { packingFor.value = playerId; return; }
```

Extend `statOf`'s fallback with `packing: 0`.

In the template, inside each on-pitch row's `row__stat` span, after the net figure:

```html
            <span :data-pm-packing-for="p.id"> · pack {{ statOf(p.id).packing || 0 }}</span>
```

Directly after the closing `</div>` of that `v-for="p in onPitch"` row (still inside `.rows`):

```html
      <div v-if="packingFor" class="countrow" data-pm-count-row role="group" aria-label="Opponents bypassed">
        <span class="countrow__label">
          Opponents bypassed — {{ shortName(byId.get(packingFor)) }}
        </span>
        <button
          v-for="n in COUNTS" :key="n" type="button" class="countrow__n tnum"
          :data-pm-count="n" @click="onCount(n)"
        >{{ n }}</button>
        <button type="button" class="minor" data-pm-count-cancel @click="onCountCancel">Cancel</button>
      </div>
```

Styles (scoped, tokens only):

```css
.countrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
}
.countrow__label { flex-basis: 100%; font-size: 12.5px; color: var(--ink-muted); }
.countrow__n {
  min-width: 44px;
  min-height: 44px;
  border: 1.5px solid var(--mark);
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  font-size: 17px;
}
```

The 44px minimum is the touch-target size, for one-handed use on a touchline.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/components/schedule/LiveMatchScreen.test.ts src/design-tokens.test.ts`
Expected: PASS. `design-tokens.test.ts` fails on any literal colour.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/LiveMatchScreen.vue src/components/schedule/LiveMatchScreen.test.ts
git commit -m "feat: tap packing on the live board — arm, player, opponents bypassed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Service methods for video tags

**Files:**
- Modify: `src/data/supabase.ts` (new methods after `undoStatEvent`; `fetchSeasonStats`)

**Interfaces:**
- Consumes: `PackingTag` from `src/domain/packing.ts`.
- Produces:

```ts
findStatMatch(teamId: string, matchId: string): Promise<{ ok: boolean; error?: string; id: string | null }>;
fetchPackingTags(statMatchId: string): Promise<PackingTag[] | null>;
addPackingTag(statMatchId: string, tag: PackingTag): Promise<{ ok: boolean; error?: string; id?: string; createdAt?: string }>;
removePackingTag(tagId: string): Promise<{ ok: boolean; error?: string }>;
// fetchSeasonStats additionally returns: tagsBySession: Record<string, PackingTag[]>
```

There's no unit test here. These are thin PostgREST calls in the style of the methods beside them; the constraints they depend on are proved in Task 2, and Tasks 8 and 9 test against them through mocks. The gate is the typecheck.

- [ ] **Step 1: Add the methods**

Add `import type { PackingTag } from '../domain/packing';` at the top of `src/data/supabase.ts` beside the other type imports, then after `undoStatEvent`:

```ts
  /**
   * The tracking session for a fixture, if there is one — without creating it.
   *
   * The video screen opens without writing anything; the first saved tag
   * calls openStatMatch, which creates the row.
   */
  async findStatMatch(teamId: string, matchId: string): Promise<{ ok: boolean; error?: string; id: string | null }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.', id: null };
    if (!teamId || !this.isUuid(teamId) || !matchId || !this.isUuid(matchId)) {
      return { ok: false, error: 'No fixture selected.', id: null };
    }
    const { data, error } = await this.client!
      .from('stat_matches').select('id')
      .eq('team_id', teamId).eq('match_id', matchId).eq('is_deleted', false)
      .maybeSingle();
    if (error) { report('findStatMatch', error.message); return { ok: false, error: error.message, id: null }; }
    return { ok: true, id: data?.id ?? null };
  }

  /** Every video tag of a tracked match, in the order entered. Null on failure. */
  async fetchPackingTags(statMatchId: string): Promise<PackingTag[] | null> {
    if (!this.isConfigured() || !statMatchId || !this.isUuid(statMatchId)) return null;
    const { data, error } = await this.client!
      .from('packing_tags')
      .select('id, player_id, receiver_id, action, bypassed, video_seconds, created_at')
      .eq('match_id', statMatchId)
      .eq('is_deleted', false)
      .order('created_at');
    if (error) { report('fetchPackingTags', error.message); return null; }
    return (data || []).map(r => ({
      id: r.id, playerId: r.player_id, receiverId: r.receiver_id ?? null,
      action: r.action, bypassed: Number(r.bypassed),
      videoSeconds: r.video_seconds ?? null, createdAt: r.created_at
    }));
  }

  async addPackingTag(statMatchId: string, tag: PackingTag): Promise<{ ok: boolean; error?: string; id?: string; createdAt?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!statMatchId || !this.isUuid(statMatchId)) return { ok: false, error: 'No match is being tagged.' };
    const { data, error } = await this.client!
      .from('packing_tags')
      .insert([{
        match_id: statMatchId,
        player_id: tag.playerId,
        receiver_id: tag.action === 'pass' ? tag.receiverId : null,
        action: tag.action,
        bypassed: tag.bypassed,
        video_seconds: tag.videoSeconds,
        is_deleted: false
      }])
      .select('id, created_at');
    if (error) { report('addPackingTag', error.message); return { ok: false, error: error.message }; }
    if (!data || !data[0]) return { ok: false, error: 'The database refused that tag. You must coach this team.' };
    return { ok: true, id: data[0].id, createdAt: data[0].created_at };
  }

  /** Soft-deleted, like an undone event, so a removed tag is still in the record. */
  async removePackingTag(tagId: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!tagId || !this.isUuid(tagId)) return { ok: false, error: 'Nothing to remove.' };
    const { data, error } = await this.client!
      .from('packing_tags').update({ is_deleted: true }).eq('id', tagId).select('id');
    if (error) { report('removePackingTag', error.message); return { ok: false, error: error.message }; }
    if (!data || data.length === 0) return { ok: false, error: 'The database refused that.' };
    return { ok: true };
  }
```

- [ ] **Step 2: Return the tags with the season**

In `fetchSeasonStats`, change the return type to add `tagsBySession: Record<string, PackingTag[]>`. Return `{ sessions: [], eventsBySession: {}, tagsBySession: {} }` on the empty path. After the events query:

```ts
    const { data: tags, error: tErr } = await this.client!
      .from('packing_tags')
      .select('id, match_id, player_id, receiver_id, action, bypassed, video_seconds, created_at')
      .in('match_id', ids)
      .eq('is_deleted', false)
      .order('created_at');
    if (tErr) { report('fetchSeasonStats', tErr.message); return null; }

    const tagsBySession: Record<string, PackingTag[]> = {};
    ids.forEach(id => { tagsBySession[id] = []; });
    (tags || []).forEach(r => {
      (tagsBySession[r.match_id] ||= []).push({
        id: r.id, playerId: r.player_id, receiverId: r.receiver_id ?? null,
        action: r.action, bypassed: Number(r.bypassed),
        videoSeconds: r.video_seconds ?? null, createdAt: r.created_at
      });
    });

    return { sessions, eventsBySession, tagsBySession };
```

- [ ] **Step 3: Typecheck and run the suites that mock the service**

Run: `npm run typecheck && npx vitest run src/components/schedule`
Expected: typecheck exits 0, and the tests pass (the existing season mocks omit `tagsBySession`; Task 9 handles that).

- [ ] **Step 4: Commit**

```bash
git add src/data/supabase.ts
git commit -m "feat: read, add and remove packing video tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The video tagging screen

**Files:**
- Create: `src/components/schedule/PackingTagScreen.vue`
- Create: `src/components/schedule/PackingTagScreen.test.ts`
- Create: `src/views/PackingTagView.vue`
- Modify: `src/router/index.ts` (route after `live`)
- Modify: `src/views/ScheduleView.vue` (link beside each `Live ±`)

**Interfaces:**
- Consumes: Task 3's `parseVideoTime`, `formatVideoTime`, `orderTags`, `resolveShirtNumber`, `matchPacking`, `livePackingCount`, `validBypassed`; Task 7's service methods; existing `openStatMatch`, `fetchStatEvents`.
- Produces: route `{ name: 'packing', path: '/schedule/:matchId/packing' }`. DOM hooks: `[data-pt-field="time|player|receiver|bypassed"]`, `[data-pt-action="pass|dribble"]`, `[data-pt-pick="player|receiver"]`, `[data-pt-error]`, `[data-pt-notice]`, `[data-pt-tag]`, `[data-pt-remove]`, `[data-pt-summary-row]`.

- [ ] **Step 1: Write the failing component tests**

Create `src/components/schedule/PackingTagScreen.test.ts`:

```ts
/**
 * Tagging packing from video.
 *
 * A coach has the video in another window and the keyboard under their
 * hands, so Enter walks the row and saves from its last box — the session
 * grid's rule. And a match recorded live as well must say, before and after,
 * that the tags replace the taps.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PackingTagScreen from './PackingTagScreen.vue';

const findStatMatch = vi.fn();
const openStatMatch = vi.fn();
const fetchStatEvents = vi.fn();
const fetchPackingTags = vi.fn();
const addPackingTag = vi.fn();
const removePackingTag = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    findStatMatch: (...a: any[]) => findStatMatch(...a),
    openStatMatch: (...a: any[]) => openStatMatch(...a),
    fetchStatEvents: (...a: any[]) => fetchStatEvents(...a),
    fetchPackingTags: (...a: any[]) => fetchPackingTags(...a),
    addPackingTag: (...a: any[]) => addPackingTag(...a),
    removePackingTag: (...a: any[]) => removePackingTag(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';
const MATCH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PLAYERS = [
  { id: 'p9', name: 'Nine Alva', number: 9, recordingNumber: 4 },
  { id: 'p11', name: 'Eleven Budde', number: 11 },
  { id: 'p7a', name: 'Seven One', number: 7 },
  { id: 'p7b', name: 'Seven Two', number: 7 }
];

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0));
};

async function mountTags() {
  const w = mount(PackingTagScreen, {
    props: { matchId: MATCH, matchLabel: 'Redlands', teamId: TEAM, schoolId: 's1', players: PLAYERS },
    attachTo: document.body,
    global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } }
  });
  await flush();
  return w;
}

const field = (w: any, name: string) => w.find(`[data-pt-field="${name}"]`);

async function typeAndEnter(w: any, name: string, value: string) {
  await field(w, name).setValue(value);
  await field(w, name).trigger('keydown', { key: 'Enter' });
  await flush();
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  findStatMatch.mockResolvedValue({ ok: true, id: 'sm1' });
  openStatMatch.mockResolvedValue({ ok: true, id: 'sm1' });
  fetchStatEvents.mockResolvedValue([]);
  fetchPackingTags.mockResolvedValue([]);
  addPackingTag.mockImplementation(() => Promise.resolve({ ok: true, id: `t${Math.random()}`, createdAt: '2026-11-15T00:00:00Z' }));
  removePackingTag.mockResolvedValue({ ok: true });
});

describe('the entry row', () => {
  it('walks time → player → receiver → bypassed on Enter and saves from the last', async () => {
    const w = await mountTags();
    await typeAndEnter(w, 'time', '23:41');
    expect(document.activeElement).toBe(field(w, 'player').element);
    await typeAndEnter(w, 'player', '9');
    expect(document.activeElement).toBe(field(w, 'receiver').element);
    await typeAndEnter(w, 'receiver', '11');
    expect(document.activeElement).toBe(field(w, 'bypassed').element);
    expect(addPackingTag).not.toHaveBeenCalled();
    await typeAndEnter(w, 'bypassed', '3');

    expect(addPackingTag).toHaveBeenCalledWith('sm1', {
      playerId: 'p9', receiverId: 'p11', action: 'pass', bypassed: 3, videoSeconds: 1421
    });
    expect(w.findAll('[data-pt-tag]')).toHaveLength(1);
    // Ready for the next one: the players and count clear, the time and action stay.
    expect((field(w, 'player').element as HTMLInputElement).value).toBe('');
    expect((field(w, 'time').element as HTMLInputElement).value).toBe('23:41');
    expect(document.activeElement).toBe(field(w, 'time').element);
  });

  it('hides Receiver for a dribble and saves without one', async () => {
    const w = await mountTags();
    await w.find('[data-pt-action="dribble"]').trigger('click');
    expect(field(w, 'receiver').exists()).toBe(false);
    await typeAndEnter(w, 'player', '9');
    expect(document.activeElement).toBe(field(w, 'bypassed').element);
    await typeAndEnter(w, 'bypassed', '2');
    expect(addPackingTag).toHaveBeenCalledWith('sm1', expect.objectContaining({
      action: 'dribble', receiverId: null, videoSeconds: null
    }));
  });

  it('offers a choice when two players wear the number, and saves the one chosen', async () => {
    const w = await mountTags();
    await w.find('[data-pt-action="dribble"]').trigger('click');
    await typeAndEnter(w, 'player', '7');
    const pick = w.find('[data-pt-pick="player"]');
    expect(pick.exists()).toBe(true);
    expect(pick.findAll('option').map((o: any) => o.attributes('value'))).toEqual(['', 'p7a', 'p7b']);
    await pick.setValue('p7b');
    await typeAndEnter(w, 'bypassed', '1');
    expect(addPackingTag).toHaveBeenCalledWith('sm1', expect.objectContaining({ playerId: 'p7b' }));
  });

  it.each([
    ['time', '23:5', /m:ss/],
    ['bypassed', '12', /1 to 11/],
    ['bypassed', '0', /1 to 11/]
  ])('refuses %s = %s beside the row and saves nothing', async (name, value, message) => {
    const w = await mountTags();
    await w.find('[data-pt-action="dribble"]').trigger('click');
    await field(w, 'player').setValue('9');
    await field(w, 'time').setValue(name === 'time' ? value : '');
    await field(w, 'bypassed').setValue(name === 'bypassed' ? value : '2');
    await field(w, 'bypassed').trigger('keydown', { key: 'Enter' });
    await flush();
    expect(addPackingTag).not.toHaveBeenCalled();
    expect(w.find('[data-pt-error]').text()).toMatch(message);
  });

  it('refuses a pass to the passer', async () => {
    const w = await mountTags();
    await field(w, 'player').setValue('9');
    await field(w, 'receiver').setValue('9');
    await field(w, 'bypassed').setValue('2');
    await field(w, 'bypassed').trigger('keydown', { key: 'Enter' });
    await flush();
    expect(addPackingTag).not.toHaveBeenCalled();
    expect(w.find('[data-pt-error]').text()).toMatch(/somebody else/);
  });

  it('creates the tracking session on the first save when the fixture has none', async () => {
    findStatMatch.mockResolvedValue({ ok: true, id: null });
    const w = await mountTags();
    expect(openStatMatch).not.toHaveBeenCalled();
    await w.find('[data-pt-action="dribble"]').trigger('click');
    await field(w, 'player').setValue('9');
    await typeAndEnter(w, 'bypassed', '2');
    expect(openStatMatch).toHaveBeenCalledWith(TEAM, 's1', MATCH, 'Redlands');
    expect(addPackingTag).toHaveBeenCalledWith('sm1', expect.anything());
  });
});

describe('saying what replaces what', () => {
  it('warns before the first tag when there are live taps, and confirms after', async () => {
    fetchStatEvents.mockResolvedValue([
      { kind: 'packing', playerId: 'p9', bypassed: 2 },
      { kind: 'packing', playerId: 'p11', bypassed: 1 },
      { kind: 'plus', playerId: 'p9' }
    ]);
    const w = await mountTags();
    expect(w.find('[data-pt-notice]').text()).toContain('2 live packing taps');
    expect(w.find('[data-pt-notice]').text()).toMatch(/instead/);

    await w.find('[data-pt-action="dribble"]').trigger('click');
    await field(w, 'player').setValue('9');
    await typeAndEnter(w, 'bypassed', '2');
    expect(w.find('[data-pt-notice]').text()).toMatch(/now count these video tags/);
  });

  it('says nothing when there were no live taps', async () => {
    const w = await mountTags();
    expect(w.find('[data-pt-notice]').exists()).toBe(false);
  });
});

describe('the list and the summary', () => {
  it('lists tags in video order and removes one', async () => {
    fetchPackingTags.mockResolvedValue([
      { id: 't1', playerId: 'p9', receiverId: null, action: 'dribble', bypassed: 1, videoSeconds: null },
      { id: 't2', playerId: 'p11', receiverId: 'p9', action: 'pass', bypassed: 4, videoSeconds: 90 }
    ]);
    const w = await mountTags();
    const tags = w.findAll('[data-pt-tag]');
    expect(tags[0].text()).toContain('1:30');
    await tags[0].find('[data-pt-remove]').trigger('click');
    await flush();
    expect(removePackingTag).toHaveBeenCalledWith('t2');
    expect(w.findAll('[data-pt-tag]')).toHaveLength(1);
  });

  it('lists every player in the summary, including those with nothing', async () => {
    fetchPackingTags.mockResolvedValue([
      { id: 't2', playerId: 'p11', receiverId: 'p9', action: 'pass', bypassed: 4, videoSeconds: 90 }
    ]);
    const w = await mountTags();
    expect(w.findAll('[data-pt-summary-row]')).toHaveLength(PLAYERS.length);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/components/schedule/PackingTagScreen.test.ts`
Expected: FAIL, because `./PackingTagScreen.vue` can't be resolved.

- [ ] **Step 3: Write the screen**

Create `src/components/schedule/PackingTagScreen.vue`:

```vue
<script setup lang="ts">
/**
 * Tagging packing from video.
 *
 * A coach with the match video in another window types one row per completed
 * pass or dribble that took opponents out of play. Players are typed by SHIRT
 * number, because that is what the video shows.
 *
 * Enter moves to the next box and saves from the last — the session grid's
 * rule, for the same reason: the keyboard is faster than the mouse.
 *
 * Once a match has any video tag, the reports count the tags instead of the
 * live taps (domain/packing.ts). The screen says so before and after, because
 * nothing is lost and so nothing needs confirming.
 */
import { ref, computed, watch, nextTick } from 'vue';
import ToolScreen from '../layout/ToolScreen.vue';
import { supabaseService } from '../../data/supabase';
import { lineupShortName } from '../../domain/lineup';
import {
  parseVideoTime, formatVideoTime, orderTags, resolveShirtNumber,
  matchPacking, livePackingCount, validBypassed,
  type PackingAction, type PackingTag
} from '../../domain/packing';

const props = defineProps<{
  matchId: string | null;
  matchLabel?: string;
  teamId: string | null;
  schoolId: string | null;
  players: any[];
}>();

const squad = computed(() => (props.players || []).filter((p: any) => !p.is_deleted && !p.isDeleted));
const byId = computed(() => new Map(squad.value.map((p: any) => [p.id, p])));
const nameOf = (id: string | null) => (id && byId.value.get(id) ? lineupShortName(byId.value.get(id)) : '—');

const statMatchId = ref<string | null>(null);
const liveEvents = ref<any[]>([]);
const tags = ref<PackingTag[]>([]);
const loadError = ref<string | null>(null);
const rowError = ref('');
const saving = ref(false);

const action = ref<PackingAction>('pass');
const time = ref('');
const playerText = ref('');
const receiverText = ref('');
const bypassedText = ref('');
const playerPick = ref('');
const receiverPick = ref('');

const root = ref<HTMLElement | null>(null);

const fields = computed(() =>
  action.value === 'pass' ? ['time', 'player', 'receiver', 'bypassed'] : ['time', 'player', 'bypassed']);

function focusField(name: string): void {
  const el = root.value?.querySelector<HTMLInputElement>(`[data-pt-field="${name}"]`);
  el?.focus();
}

const playerLookup = computed(() => resolveShirtNumber(squad.value, playerText.value));
const receiverLookup = computed(() => resolveShirtNumber(squad.value, receiverText.value));

/** Offered when the number names nobody or more than one: the matches, else everyone. */
const choicesFor = (lookup: { candidates: any[] }) =>
  lookup.candidates.length > 1 ? lookup.candidates : squad.value;

const needsPlayerPick = computed(() => playerText.value.trim() !== '' && !playerLookup.value.player);
const needsReceiverPick = computed(() => receiverText.value.trim() !== '' && !receiverLookup.value.player);

const playerId = computed(() => playerLookup.value.player?.id ?? (playerPick.value || null));
const receiverId = computed(() => receiverLookup.value.player?.id ?? (receiverPick.value || null));

watch(playerText, () => { playerPick.value = ''; });
watch(receiverText, () => { receiverPick.value = ''; });

const liveTaps = computed(() => livePackingCount(liveEvents.value));
const ordered = computed(() => orderTags(tags.value));
const summary = computed(() =>
  matchPacking(liveEvents.value, tags.value, squad.value.map((p: any) => p.id)));

const notice = computed(() => {
  if (liveTaps.value === 0) return '';
  const taps = `${liveTaps.value} live packing tap${liveTaps.value === 1 ? '' : 's'}`;
  return tags.value.length === 0
    ? `This match has ${taps}. Once you save a video tag, the reports count the video tags instead.`
    : `Reports now count these video tags. The ${taps} are kept; removing every tag here brings them back.`;
});

async function load(): Promise<void> {
  loadError.value = null;
  if (!props.teamId || !props.matchId) { loadError.value = 'Choose a fixture first.'; return; }
  const found = await supabaseService.findStatMatch(props.teamId, props.matchId);
  if (!found.ok) { loadError.value = found.error || 'Could not open that fixture.'; return; }
  statMatchId.value = found.id;
  if (!found.id) { liveEvents.value = []; tags.value = []; return; }

  const [events, stored] = await Promise.all([
    supabaseService.fetchStatEvents(found.id),
    supabaseService.fetchPackingTags(found.id)
  ]);
  if (events === null || stored === null) {
    loadError.value = 'Could not load this match’s packing.';
    return;
  }
  liveEvents.value = events;
  tags.value = stored;
}

watch(() => [props.teamId, props.matchId], load, { immediate: true });

function refuse(message: string): void { rowError.value = message; }

async function save(): Promise<void> {
  if (saving.value) return;
  rowError.value = '';

  const t = parseVideoTime(time.value);
  if (!t.ok) return refuse(t.error);
  if (!playerId.value) return refuse('Type the shirt number of the player who passed or dribbled.');
  const bypassed = Number(bypassedText.value.trim());
  if (!validBypassed(bypassed)) return refuse('Opponents bypassed is a whole number from 1 to 11.');

  let receiver: string | null = null;
  if (action.value === 'pass') {
    if (!receiverId.value) return refuse('Type the shirt number of the player who received the pass.');
    if (receiverId.value === playerId.value) return refuse('A pass is received by somebody else.');
    receiver = receiverId.value;
  }

  const tag: PackingTag = {
    playerId: playerId.value, receiverId: receiver, action: action.value,
    bypassed, videoSeconds: t.seconds
  };

  saving.value = true;
  try {
    if (!statMatchId.value) {
      const opened = await supabaseService.openStatMatch(
        props.teamId as string, props.schoolId as string, props.matchId, props.matchLabel);
      if (!opened?.ok || !opened.id) return refuse(opened?.error || 'Could not start tracking this fixture.');
      statMatchId.value = opened.id;
    }
    const res = await supabaseService.addPackingTag(statMatchId.value, tag);
    if (!res.ok) return refuse(res.error || 'That tag did not save.');
    tags.value = tags.value.concat([{ ...tag, id: res.id, createdAt: res.createdAt }]);

    playerText.value = '';
    receiverText.value = '';
    bypassedText.value = '';
    await nextTick();
    focusField('time');
  } finally {
    saving.value = false;
  }
}

async function onEnter(name: string): Promise<void> {
  const list = fields.value;
  const i = list.indexOf(name);
  if (i === list.length - 1) { await save(); return; }
  focusField(list[i + 1]);
}

async function setAction(a: PackingAction): Promise<void> {
  action.value = a;
  rowError.value = '';
  await nextTick();
}

async function remove(tag: PackingTag): Promise<void> {
  if (!tag.id) return;
  const res = await supabaseService.removePackingTag(tag.id);
  if (!res.ok) { rowError.value = res.error || 'That tag was not removed.'; return; }
  tags.value = tags.value.filter(t => t.id !== tag.id);
}

const dash = (v: number | null) => (v === null ? '—' : String(v));
</script>

<template>
  <ToolScreen
    title="Packing from video" :kicker="matchLabel ? `vs ${matchLabel}` : ''"
    :back-to="{ name: 'schedule' }" back-label="Schedule"
  >
    <div ref="root">
      <p v-if="loadError" class="hint hint--bad" role="alert" data-pt-load-error>{{ loadError }}</p>

      <p class="lede">
        One row for each completed pass or dribble that took opponents out of
        play. Type players by shirt number. Enter moves to the next box and
        saves from the last.
      </p>

      <p v-if="notice" class="notice" role="status" data-pt-notice>{{ notice }}</p>

      <div class="actions" role="group" aria-label="Action">
        <button
          v-for="a in (['pass', 'dribble'] as const)" :key="a" type="button"
          class="seg" :class="{ 'is-on': action === a }" :aria-pressed="action === a"
          :data-pt-action="a" @click="setAction(a)"
        >{{ a === 'pass' ? 'Pass' : 'Dribble' }}</button>
      </div>

      <div class="entry">
        <label class="box">
          <span>Video time</span>
          <input
            v-model="time" data-pt-field="time" inputmode="numeric" placeholder="23:41"
            @keydown.enter.prevent="onEnter('time')"
          >
        </label>
        <label class="box">
          <span>Player #</span>
          <input
            v-model="playerText" data-pt-field="player" inputmode="numeric"
            @keydown.enter.prevent="onEnter('player')"
          >
          <select v-if="needsPlayerPick" v-model="playerPick" data-pt-pick="player">
            <option value="">Who?</option>
            <option v-for="p in choicesFor(playerLookup)" :key="p.id" :value="p.id">
              {{ p.number ?? '—' }} · {{ p.name }}
            </option>
          </select>
        </label>
        <label v-if="action === 'pass'" class="box">
          <span>Receiver #</span>
          <input
            v-model="receiverText" data-pt-field="receiver" inputmode="numeric"
            @keydown.enter.prevent="onEnter('receiver')"
          >
          <select v-if="needsReceiverPick" v-model="receiverPick" data-pt-pick="receiver">
            <option value="">Who?</option>
            <option v-for="p in choicesFor(receiverLookup)" :key="p.id" :value="p.id">
              {{ p.number ?? '—' }} · {{ p.name }}
            </option>
          </select>
        </label>
        <label class="box">
          <span>Bypassed</span>
          <input
            v-model="bypassedText" data-pt-field="bypassed" inputmode="numeric"
            @keydown.enter.prevent="onEnter('bypassed')"
          >
        </label>
      </div>

      <p v-if="rowError" class="hint hint--bad" role="alert" data-pt-error>{{ rowError }}</p>

      <p class="kicker sec">Tags <span class="tnum">{{ tags.length }}</span></p>
      <ul class="tags">
        <li v-for="t in ordered" :key="t.id" class="tag" data-pt-tag>
          <span class="tag__time tnum">{{ formatVideoTime(t.videoSeconds) || '—' }}</span>
          <span class="tag__what">
            {{ t.action === 'pass' ? `${nameOf(t.playerId)} → ${nameOf(t.receiverId)}` : `${nameOf(t.playerId)} dribble` }}
          </span>
          <span class="tag__n tnum">{{ t.bypassed }}</span>
          <button type="button" class="minor" data-pt-remove @click="remove(t)">Remove</button>
        </li>
        <li v-if="tags.length === 0" class="hint">No tags yet.</li>
      </ul>

      <p class="kicker sec">This match · {{ summary.source === 'video' ? 'from video' : summary.source === 'live' ? 'from live taps' : 'nothing recorded' }}</p>
      <div class="wrap">
        <table class="tbl">
          <thead>
            <tr><th class="is-text">Player</th><th>Packing</th><th>Received</th><th>By pass</th><th>By dribble</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in squad" :key="p.id" data-pt-summary-row>
              <td class="is-text">{{ p.number ?? '—' }} · {{ p.name }}</td>
              <td class="tabular">{{ summary.players.get(p.id)?.packing ?? 0 }}</td>
              <td class="tabular">{{ dash(summary.players.get(p.id)?.received ?? null) }}</td>
              <td class="tabular">{{ dash(summary.players.get(p.id)?.byPass ?? null) }}</td>
              <td class="tabular">{{ dash(summary.players.get(p.id)?.byDribble ?? null) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </ToolScreen>
</template>

<style scoped>
.lede { max-width: 44rem; font-size: 12.5px; line-height: 1.55; color: var(--ink-muted); }
.notice {
  margin: var(--space-3) 0;
  padding: var(--space-3);
  border-left: 3px solid var(--mark);
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
}
.actions { display: flex; gap: var(--space-2); margin: var(--space-3) 0; }
.seg {
  min-height: 40px;
  padding: 0 var(--space-4);
  border: 1.5px solid var(--rule-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--ink-muted);
}
.seg.is-on { border-color: var(--mark); color: var(--ink); }
.entry { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.box { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-muted); }
.box input, .box select {
  width: 7.5rem;
  min-height: 40px;
  padding: 0 var(--space-2);
  border: 1px solid var(--rule-strong);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  font-size: 16px;
}
.hint { font-size: 12.5px; color: var(--ink-muted); }
.hint--bad { color: var(--color-warning); }
.sec { margin-top: var(--space-6); }
.tags { list-style: none; margin: 0; padding: 0; }
.tag {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--rule);
  font-size: 13px;
  color: var(--ink);
}
.tag__time { width: 4.5rem; color: var(--ink-muted); }
.tag__what { flex: 1; min-width: 0; }
.tag__n { font-weight: 600; }
.wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { padding: 8px 10px; border-bottom: 1px solid var(--rule); text-align: right; color: var(--ink); }
.tbl .is-text { text-align: left; }
</style>
```

`kicker`, `tnum`, `minor` and `tabular` are utility classes the other tool screens already use. Check `LiveMatchScreen.vue`'s styles and copy any that are scoped rather than global. `--color-warning` is the token `LiveMatchScreen` already uses for refusals.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/components/schedule/PackingTagScreen.test.ts src/design-tokens.test.ts`
Expected: PASS. If the Enter-order test fails on focus, check the component was mounted with `attachTo: document.body`. Focus only moves in an attached tree.

- [ ] **Step 5: Add the view, the route and the link**

Create `src/views/PackingTagView.vue` as a copy of `src/views/LiveMatchView.vue` with three changes: the doc comment (*"Tagging packing from video, at its own URL…"*), the import and component (`PackingTagScreen` from `../components/schedule/PackingTagScreen.vue`), and nothing else. It takes the same props.

In `src/router/index.ts`, import `PackingTagView` beside `LiveMatchView`, and register after the `live` route:

```ts
    { path: '/schedule/:matchId/packing', name: 'packing', component: PackingTagView,
      meta: { ground: 'pitch', chrome: 'tool' } },
```

In `src/views/ScheduleView.vue`, after each of the three `Live ±` `RouterLink`s (lines ~167, ~188, ~215), add the same link with that row's match id. For the `m` rows:

```html
                  <RouterLink class="textlink" data-fixture-packing
                              :to="{ name: 'packing', params: { matchId: m.id } }">Packing</RouterLink>
```

and for the next-match card, use `schedule.nextMatch.id`. They're inside the same `canEdit` blocks as `Live ±`, so they're coach-only.

Add to `src/deploy-config.test.ts` or the router's own test, whichever already lists the tool routes (`grep -rn "'/schedule/:matchId/live'\|name: 'live'" src --include=*.test.ts`), the same assertion for `packing`. If neither lists them, add to `src/router/index.test.ts` (create it if missing):

```ts
import { describe, it, expect } from 'vitest';
import { router } from './index';

describe('the packing route', () => {
  it('is a touchline tool at /schedule/:matchId/packing', () => {
    const r = router.getRoutes().find(x => x.name === 'packing')!;
    expect(r.path).toBe('/schedule/:matchId/packing');
    expect(r.meta).toMatchObject({ chrome: 'tool' });
  });
});
```

- [ ] **Step 6: Run the gates for this task**

Run: `npx vitest run src/components/schedule src/views src/router && npm run typecheck`
Expected: PASS, and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule/PackingTagScreen.vue src/components/schedule/PackingTagScreen.test.ts src/views/PackingTagView.vue src/router/index.ts src/views/ScheduleView.vue
git add src/router/index.test.ts 2>/dev/null; true
git commit -m "feat: tag packing from video, by shirt number, replacing the live taps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Packing in the season report

**Files:**
- Modify: `src/data/season-stats.ts` (`MatchStats`, `SeasonTotals`, `seasonTotals`, new `seasonPackingCoverage`)
- Modify: `src/domain/season.ts` (`seasonColumns`)
- Modify: `src/components/schedule/SeasonReportScreen.vue`
- Test: `src/data/season-stats.test.ts` (create if missing; check with `ls src/data/season-stats*`), `src/domain/season.test.ts`, `src/domain/reports.test.ts`, `src/components/schedule/SeasonReportScreen.test.ts`

**Interfaces:**
- Consumes: `matchPacking`, `MatchPacking` from Task 3; `tagsBySession` from Task 7.
- Produces:

```ts
// MatchStats gains:
packing?: MatchPacking;
// SeasonTotals gains:
packing: number;
packingPerMatch: number | null;   // over matches where this player has minutes
received: number | null;          // null until a video-tagged match exists
byPass: number | null;
byDribble: number | null;
export function seasonPackingCoverage(matches: MatchStats[]): { withPacking: number; timed: number; video: number };
// seasonColumns() gains keys, in order after 'gdrate': 'pack', 'packrate', 'recv', 'bypass', 'bydribble'
```

- [ ] **Step 1: Write the failing tests**

Add to the season-stats test file:

```ts
import { describe, it, expect } from 'vitest';
import { seasonTotals, seasonPackingCoverage, type MatchStats } from './season-stats';
import { matchPacking } from '../domain/packing';

const stats = (entries: Record<string, number>) =>
  new Map(Object.entries(entries).map(([id, secs]) => [id, {
    playerId: id, plus: 0, minus: 0, score: 0, goalDiff: 0, secondsPlayed: secs,
    shots: 0, goals: 0, assists: 0, packing: 0, onPitch: false
  }])) as any;

const match = (id: string, minutes: Record<string, number>, packing: ReturnType<typeof matchPacking>): MatchStats => ({
  statMatchId: id, matchId: null, date: '', sortKey: null, opponent: '',
  stats: stats(Object.fromEntries(Object.entries(minutes).map(([k, m]) => [k, m * 60]))),
  packing
});

describe('packing across the season', () => {
  const live = match('m1', { a: 80, b: 10 },
    matchPacking([{ kind: 'packing', playerId: 'a', bypassed: 8 }, { kind: 'packing', playerId: 'b', bypassed: 2 }], [], ['a', 'b']));
  const videoOnly = match('m2', {},
    matchPacking([], [{ playerId: 'a', receiverId: 'b', action: 'pass', bypassed: 5, videoSeconds: null }], ['a', 'b']));

  it('totals every match, video-only ones included', () => {
    const t = seasonTotals([live, videoOnly], 80);
    expect(t.get('a')!.packing).toBe(13);
  });

  it('rates only over matches with minutes, and keeps a ten-minute player in', () => {
    const t = seasonTotals([live, videoOnly], 80);
    expect(t.get('a')!.packingPerMatch).toBeCloseTo(8, 6);   // 8 in 80 of an 80-minute match
    expect(t.get('b')!.packingPerMatch).toBeCloseTo(16, 6);  // 2 in 10 — noisy, and shown with its minutes
    expect(t.get('b')!.minutes).toBe(10);
  });

  it('scales to the team’s own match length', () => {
    expect(seasonTotals([live], 70).get('a')!.packingPerMatch).toBeCloseTo(7, 6);
  });

  it('reports received and the split only from video, null when there is none', () => {
    expect(seasonTotals([live], 80).get('b')!.received).toBeNull();
    const t = seasonTotals([live, videoOnly], 80);
    expect(t.get('b')!.received).toBe(5);
    expect(t.get('a')!.byPass).toBe(5);
    expect(t.get('a')!.byDribble).toBe(0);
  });

  it('counts how many packing matches the rate could cover', () => {
    expect(seasonPackingCoverage([live, videoOnly])).toEqual({ withPacking: 2, timed: 1, video: 1 });
  });
});
```

In `src/domain/reports.test.ts`, update the column list (and rename the test to `'offers the columns the report draws'`):

```ts
    expect(seasonColumns().map(c => c.key)).toEqual(
      ['player', 'apps', 'mins', 'plus', 'minus', 'net', 'gd', 'netrate', 'gdrate',
       'pack', 'packrate', 'recv', 'bypass', 'bydribble']);
```

Add to `src/domain/season.test.ts` inside `describe('the report columns', …)`:

```ts
  it('reads null, not zero, for received when no match was tagged from video', () => {
    expect(col('recv').get({ received: null })).toBeNull();
    expect(col('pack').get({ packing: 0 })).toBe(0);
  });
```

In `src/components/schedule/SeasonReportScreen.test.ts`, add `tagsBySession: {}` to the `SESSION` fixture and to the empty-season mock. Then append:

```ts
describe('packing', () => {
  it('shows a live-only season’s received as a dash, not 0', async () => {
    fetchSeasonStats.mockResolvedValue({
      ...SESSION,
      eventsBySession: { s1: [...SESSION.eventsBySession.s1, { kind: 'packing', playerId: 'p1', bypassed: 4, atSeconds: 700, period: 1 }] },
      tagsBySession: { s1: [] }
    });
    const w = await mountSeason();
    const row = w.findAll('[data-season-row]').find((r: any) => r.text().includes('Cesar Alva'))!;
    expect(row.find('[data-season-pack]').text()).toBe('4');
    expect(row.find('[data-season-recv]').text()).toBe('—');
  });

  it('says how many matches the rate covers when some were tagged without a live log', async () => {
    fetchSeasonStats.mockResolvedValue({
      sessions: [...SESSION.sessions, { id: 's2', match_id: null, label: 'vs Yucaipa', created_at: '2026-09-08T00:00:00Z' }],
      eventsBySession: { ...SESSION.eventsBySession, s1: [...SESSION.eventsBySession.s1, { kind: 'packing', playerId: 'p1', bypassed: 2, atSeconds: 700, period: 1 }], s2: [] },
      tagsBySession: { s1: [], s2: [{ id: 't', playerId: 'p1', receiverId: null, action: 'dribble', bypassed: 3, videoSeconds: null }] }
    });
    const w = await mountSeason();
    expect(w.find('[data-season-packing-coverage]').text())
      .toContain('Rate covers 1 of 2 matches');
  });
});
```

(Use the `PLAYERS` fixture's real names. The file defines `p1` as the full-match player, and the existing tests call them `'Cesar Alva'`.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/data/season-stats.test.ts src/domain/season.test.ts src/domain/reports.test.ts src/components/schedule/SeasonReportScreen.test.ts`
Expected: FAIL. `seasonPackingCoverage` isn't exported, the columns are missing, and `[data-season-pack]` isn't found.

- [ ] **Step 3: Implement the sums**

In `src/data/season-stats.ts`, add `import type { MatchPacking } from '../domain/packing';`, add `packing?: MatchPacking;` to `MatchStats`, add the five fields to `SeasonTotals` (with doc comments matching the Interfaces block), and in `seasonTotals`:

```ts
  const blank = (playerId: string): SeasonTotals => ({
    playerId, appearances: 0, minutes: 0, plus: 0, minus: 0, score: 0,
    goalDiff: 0, shots: 0, goals: 0, assists: 0,
    scorePerMatch: null, goalDiffPerMatch: null,
    packing: 0, packingPerMatch: null, received: null, byPass: null, byDribble: null
  });
  /** Packing from matches where the player has minutes: the rate's numerator. */
  const timedPacking = new Map<string, number>();
  const add = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);

  for (const m of matches || []) {
    m.stats.forEach((s, playerId) => {
      // …existing body unchanged…
    });

    m.packing?.players.forEach((p, playerId) => {
      if (!out.has(playerId)) out.set(playerId, blank(playerId));
      const t = out.get(playerId)!;
      t.packing  += p.packing;
      t.received  = add(t.received, p.received);
      t.byPass    = add(t.byPass, p.byPass);
      t.byDribble = add(t.byDribble, p.byDribble);
      const secs = m.stats.get(playerId)?.secondsPlayed || 0;
      if (secs > 0) timedPacking.set(playerId, (timedPacking.get(playerId) || 0) + p.packing);
    });
  }

  out.forEach(t => {
    t.scorePerMatch    = perMatch(t.score, t.minutes, fullMatch);
    t.goalDiffPerMatch = perMatch(t.goalDiff, t.minutes, fullMatch);
    // Only the packing earned while minutes were being logged is divided by
    // those minutes. A video-only match has packing and no minutes; dividing
    // its packing by somebody else's minutes would inflate the rate.
    t.packingPerMatch  = perMatch(timedPacking.get(t.playerId) || 0, t.minutes, fullMatch);
  });
```

And add:

```ts
/**
 * How much of the season a packing rate can speak for.
 *
 * `withPacking` matches recorded any packing; `timed` of those have minutes
 * logged by anybody (a live substitution log); `video` were tagged from video.
 * The report says "Rate covers timed of withPacking" when they differ.
 */
export function seasonPackingCoverage(matches: MatchStats[]): { withPacking: number; timed: number; video: number } {
  let withPacking = 0, timed = 0, video = 0;
  for (const m of matches || []) {
    if (!m.packing || m.packing.source === 'none') continue;
    withPacking += 1;
    if (m.packing.source === 'video') video += 1;
    let anyMinutes = false;
    m.stats.forEach(s => { if ((s.secondsPlayed || 0) > 0) anyMinutes = true; });
    if (anyMinutes) timed += 1;
  }
  return { withPacking, timed, video };
}
```

- [ ] **Step 4: Implement the columns and the screen**

In `src/domain/season.ts`, append to `seasonColumns()`:

```ts
    { key: 'pack',      label: 'Pack',      desc: true,  get: t => t.packing || 0 },
    { key: 'packrate',  label: 'Pack',      desc: true,  get: t => t.packingPerMatch ?? null },
    { key: 'recv',      label: 'Recv',      desc: true,  get: t => t.received ?? null },
    { key: 'bypass',    label: 'Pass',      desc: true,  get: t => t.byPass ?? null },
    { key: 'bydribble', label: 'Dribble',   desc: true,  get: t => t.byDribble ?? null }
```

In `SeasonReportScreen.vue`:
- Import `matchPacking` from `../../domain/packing` and `seasonPackingCoverage` from `../../data/season-stats`.
- In `load()`, build each match with `packing: matchPacking(data.eventsBySession[s.id] || [], (data.tagsBySession || {})[s.id] || [], playerIds)`. Keep the `matches` array in a `ref` (`const seasonMatches = ref<MatchStats[]>([])`) so the coverage note can read it.
- Add `const coverage = computed(() => seasonPackingCoverage(seasonMatches.value));`.
- Add `const count = (v: any) => (v === null || v === undefined ? '—' : String(v));`.
- After the lede, add:

```html
    <p v-if="coverage.withPacking > 0 && coverage.timed < coverage.withPacking"
       class="lede" data-season-packing-coverage>
      Rate covers {{ coverage.timed }} of {{ coverage.withPacking }} matches.
      {{ coverage.withPacking - coverage.timed }} were tagged from video with no
      live log, so they have no minutes to divide by. Their packing is in the
      totals.
    </p>
    <p v-if="coverage.video > 0" class="lede" data-season-packing-video>
      Recv, Pass and Dribble come from {{ coverage.video }} video-tagged
      match{{ coverage.video === 1 ? '' : 'es' }}.
    </p>
```

- After the `gdrate` cell in each row:

```html
            <td class="tabular" data-season-pack>{{ r.packing }}</td>
            <td class="tabular" data-season-packrate>{{ fmt(r.packingPerMatch) }}</td>
            <td class="tabular" data-season-recv>{{ count(r.received) }}</td>
            <td class="tabular">{{ count(r.byPass) }}</td>
            <td class="tabular">{{ count(r.byDribble) }}</td>
```

The `sorted` computed already places nulls last, so sorting on `recv` behaves the way it does for the rates.

- [ ] **Step 5: Run them and watch them pass**

Run: `npx vitest run src/data src/domain src/components/schedule`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/season-stats.ts src/data/season-stats.test.ts src/domain/season.ts src/domain/season.test.ts src/domain/reports.test.ts src/components/schedule/SeasonReportScreen.vue src/components/schedule/SeasonReportScreen.test.ts
git commit -m "feat: report packing across the season, rated only over matches with minutes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Handbook, CLAUDE.md and the three gates

**Files:**
- Modify: `src/content/help.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a handbook entry**

Open `src/content/help.ts`, find the section that explains Live ± (search for `Live ±` or `plus/minus`), and add a sibling entry in the same structure and HTML style:

> **Packing points.** Packing counts the opponents a completed pass or dribble takes out of play. **On the touchline:** with the clock running, press **Packing**, tap the player, then press how many opponents were bypassed. Undo removes it like any other tap. **From video:** open **Packing** on the fixture in the Schedule. Type the video time if you want to find the clip again, choose Pass or Dribble, then type the shirt numbers and the count. Enter moves to the next box and saves from the last. **Once a match has any video tag, the reports count the video tags instead of the live taps.** The taps are kept, and removing every tag brings them back. The season report rates packing per full match only over matches with a live substitution log, and says how many that covers.

Run: `npx vitest run src/content src/domain/help-search.test.ts`
Expected: PASS. A help-search test may index sections; if it pins a count, update the count and nothing else.

- [ ] **Step 2: Record the rule in CLAUDE.md**

In `CLAUDE.md`:
- In *SQL files*, change `…through supabase/migrations/0040_quiz_results_security.sql.` to `…through supabase/migrations/0041_packing.sql.`
- In *The rules that are not guessable from the code*, after *A statistic may only be recorded while the clock is RUNNING*, add:

```markdown
### Packing: video replaces live, and live is clock-gated

Since `0041_packing.sql`. Packing counts opponents bypassed (1–11) by a completed pass or dribble. Live taps are `packing` events in `stat_events` with `bypassed`, so they go through `append()`'s gate and the one undo. Video tags are rows in `packing_tags` under the same `stat_matches` row, because they are entered after the fact and the replay orders the log by when an event was recorded.

**Once a match has any non-deleted tag, every report counts the tags and ignores the live taps** — `domain/packing.ts` (`packingSource`, `matchPacking`) is the only place that rule lives, so read a match through it. A live-sourced match reports received and the pass/dribble split as **null, not 0**: live entry never asked. The season rate divides only packing earned in matches where the player has logged minutes, because a video-only match has no minutes. Video players are typed by **shirt** number.
```

- [ ] **Step 3: Run all three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST_EXIT=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK_EXIT=$?"
npm run build > /dev/null 2>&1; echo "BUILD_EXIT=$?"
```

Expected: `TEST_EXIT=0`, `TYPECHECK_EXIT=0`, `BUILD_EXIT=0`. If any exit code is non-zero, run that gate without the redirect, fix what it reports, and run all three again. A green-looking test run that exits non-zero has found a real bug.

Confirm the database suites actually ran rather than skipped:
`npx vitest run src/data/testdb/packing.test.ts` should report its tests as passed, not skipped.

- [ ] **Step 4: Commit**

```bash
git add src/content/help.ts CLAUDE.md
git commit -m "docs: explain packing points in the handbook and record the source rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec section | Task |
| --- | --- |
| 1. Schema: `bypassed`, three constraints recreated, `packing_tags`, RLS through the parent, self-check | 2 |
| 1. A fixture's session created on first tag, reused if tracked | 7 (`findStatMatch`), 8 (`save`) |
| 2. Gesture: arm → player → count; cancel; disarm | 6 |
| 2. Guards: `CLOCK_GATED`, wording, bench refusal, `bypassed` validated before optimistic update | 4, 5 |
| 2. Undo unchanged; `replay` packing with no other figure moved; live tally | 4, 5, 6 |
| 3. Route, tool chrome, coach-only link | 8 |
| 3. Entry row: shirt number, picker, Dribble hides Receiver, Enter order, what clears | 8 |
| 3. `parseVideoTime` incl. `75:30` | 3 |
| 3. Tag list order, Remove (soft delete), summary table, replacement notices | 3, 7, 8 |
| 4. `packingSource`, `matchPacking`, nulls for live | 3 |
| 4. Rate only over matches with minutes; coverage sentence; `seasonFullMatchMinutes` | 9 |
| 4. Season columns; nobody filtered | 9 |
| 5. Database, permissions, domain, replay/store, season, component tests; three gates | 2–10 |
| (Found while planning) reopening a live match lost players and times | 1 |
