# Packing points — design

**Date:** 2026-11-15
**Status:** Approved in brainstorming, awaiting spec review

## What packing is

Packing counts the opponents an action takes out of play: every opponent who
was between the ball and their own goal before a pass or dribble, and behind the
ball after it. A forward pass that splits a midfield line of four scores 4; a
square pass scores nothing. Two figures come from it:

- **Packing** — opponents bypassed by a player's own passes and dribbles.
- **Packing received** — opponents bypassed by passes a player *received*,
  crediting whoever got into the space.

## Decisions

| Question | Decision |
| --- | --- |
| Where is it recorded? | Live on the touchline **and** tagged afterwards from video. |
| How much detail? | Live: player and count only. Video: action (pass or dribble), passer, receiver (passes only), count. |
| Which actions count? | **Completed actions only.** An intercepted pass or a lost dribble is not recorded. |
| One match recorded both ways? | **Video replaces live.** Once a match has any video tag, the reports count the tags and ignore the live taps, which are kept. Removing every tag brings the live taps back. |
| Does a video tag carry a time? | An **optional video timestamp**, for finding the clip again. Nothing is calculated from it. |
| Where is it shown? | The per-match views and the season report, with minutes beside every rate. |
| Storage shape | Live taps in the existing `stat_events` log; video tags in a new `packing_tags` table. |

### Why two storage shapes

Live packing belongs in `stat_events`: it is a clock-stamped statistic, so it
must pass through `append()`'s running-clock gate (CLAUDE.md: a new
clock-stamped statistic joins the rule rather than sidestepping it), and it
shares the one undo stack a coach on the touchline already uses.

Video tags do not belong there. `orderEvents` in `src/data/plus-minus.ts` orders
the log by when events were *recorded*, on the stated ground that nothing can
enter an event at a past time. Video tagging is exactly that, and its rows have
no meaningful `at_seconds`. Putting them in the same log would break the
replay's ordering assumption; a separate table keeps both intact.

A single packing table for both sources was rejected because live packing
would then need its own undo beside the plus/minus undo, and the clock gate
would have to be repeated outside `append()`.

## 1. Schema and permissions — `supabase/migrations/0041_packing.sql`

The migration inserts no data, so it applies to the empty demo database.

### Live taps, in `stat_events`

- `alter table public.stat_events add column if not exists bypassed smallint;`
- `stat_events_kind_chk` gains `'packing'`.
- `stat_events_player_chk` gains `'packing'` on its player-required side.
- New `stat_events_bypassed_chk`:
  `(kind = 'packing' and bypassed between 1 and 11) or (kind <> 'packing' and bypassed is null)`.
  Zero is never stored — a sideways pass is simply not tapped. The upper limit
  is 11, not 10, so a pass that also takes out the keeper is not refused.
- The two existing constraints are **dropped and recreated**. Their 0024 guard
  is "create only if missing", which would leave the old lists in place.

### Video tags, in `public.packing_tags`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | uuid pk | `gen_random_uuid()` |
| `match_id` | uuid not null | references `stat_matches (id)` on delete cascade — the same parent as `stat_events` |
| `player_id` | uuid not null | references `players (id)`; the passer or dribbler |
| `receiver_id` | uuid null | references `players (id)`; required for `pass`, null for `dribble`, never equal to `player_id` |
| `action` | text not null | `'pass'` or `'dribble'` |
| `bypassed` | smallint not null | 1–11 |
| `video_seconds` | int null | ≥ 0 |
| `is_deleted` | boolean not null | default false |
| `created_at` | timestamptz not null | default now() |

Index on `(match_id, created_at) where not is_deleted`.

### Access

Read and write are coach-only, through the parent: `exists (select 1 from
stat_matches m where m.id = packing_tags.match_id and
public.is_team_coach(m.team_id))`, written exactly as `stat_events`' policies
are, so a tag and its match cannot disagree about who may see them. No
security-definer functions: nothing here crosses teams. `grant select, insert,
update, delete on public.packing_tags to authenticated`.

### A fixture's session

The existing one-per-fixture unique index on `stat_matches (team_id, match_id)`
means tagging a fixture never tracked live **creates** its `stat_matches` row,
and tagging one that was tracked **reuses** it. That shared row is what lets
"video replaces live" be decided per match.

The migration ends with a self-check block, as 0024 does, raising if the table,
the three constraints or the policies are missing.

## 2. Live entry — `LiveMatchScreen.vue` and `stores/plus-minus.ts`

### The gesture

**Packing** joins the event row. Arm it, tap a player on the pitch, then press a
count on a row of large buttons (1–11) shown beside that player. Pressing the
count records the action and disarms. Pressing **Packing** again, or **Cancel**
on the count row, backs out without recording.

That is three taps. The arm press cannot be removed: a plain tap on a player
already means "plus", and that gesture must keep its meaning.

### Guards

All in the places that already hold the rules:

- `'packing'` joins `CLOCK_GATED`. The refusal wording broadens from "goals,
  plus and minus" to "match statistics".
- `pmResolveTap` refuses a bench player, as it already does for a plus.
- `append()` gains an optional `bypassed` argument and refuses a packing event
  whose `bypassed` is missing or outside 1–11 **before** the optimistic update,
  so the board never shows an entry the database will reject.
- `appendStatEvent` in `src/data/supabase.ts` writes `bypassed`, and the
  store's load maps it back (snake_case `bypassed` is the same name).

### Undo and the board

Undo is unchanged: a packing tap is a log entry like any other.

`replay` adds `packing` (the sum of `bypassed`) to `PlayerStats`. Packing events
must not change minutes, goal difference, plus/minus, shots, goals or assists —
a test pins this. The live screen shows this tally labelled **Live**, whether or
not video tags exist: a coach reviewing the live log sees what they tapped. The
"video replaces live" rule applies in the reports.

## 3. Video tagging — `/schedule/:matchId/packing`

A new `PackingTagView`, `meta.chrome: 'tool'`, rendering inside `ToolScreen`
like `/schedule/:matchId/live`. Reached from a **Tag packing from video** link
beside the existing Live link on a fixture, shown to coaches only. Opening it
finds the fixture's `stat_matches` row; the first save creates one if needed.

### The entry row

Keyboard-first, for a coach with the video in another window:

| Video time | Action | Player | Receiver | Bypassed |
| --- | --- | --- | --- | --- |
| `23:41` (optional) | Pass / Dribble | `9` | `11` | `3` |

- Players are typed by **shirt number** (`team_players.number`), because that is
  what the video shows — not the recording number. A number matching no one, or
  more than one player, on the team shows a picker in its place.
- **Dribble** hides Receiver. Receiver may not be the same player as Player.
- **Enter moves to the next field, and saves from the last one**, as the session
  grid does. After a save the row clears except Action and Video time.
- Anyone on the team's roster may be tagged. There is no on-pitch check: a
  fixture tagged only from video has no substitution log to check against.

### Video time

`parseVideoTime` in `domain/packing.ts`, not `parseTimeToSeconds` — the latter's
`.`-as-`:` reading and its rules belong to fitness times.

- Blank → null.
- `m:ss` / `mm:ss` / `mmm:ss`: any whole minutes, seconds exactly two digits
  00–59. **`75:30` is accepted as 4,530 seconds**, because a video player's scrub
  bar often shows long videos that way and the reading is unambiguous.
- `h:mm:ss`: minutes and seconds two digits, 00–59.
- Anything else — `23:5`, `23:60`, text, a negative — is refused with a message
  beside the box, and nothing is saved.

### The tag list

Below the row, in video-time order, untimed tags last in the order entered.
Each shows time, action, player(s) and count, and has **Remove** (soft delete).
There is no edit: removing and re-typing is quicker than an edit form.

A summary table beside it gives the per-match figures per player — packing,
received, by pass, by dribble — from `matchPacking`, with the source that
counted.

### Saying what replaces what

- Live taps exist, no tags yet: *"This match has 14 live packing taps. Once you
  save a video tag, the reports count the video tags instead."*
- Tags exist: *"Reports now count these video tags. The live taps are kept;
  removing every tag here brings them back."*

Nothing is confirmed, because nothing is lost.

## 4. The rule and the reports

### `src/domain/packing.ts`

Framework-free, and the only place the rule lives.

- `packingSource(liveEvents, tags)` → `'video'` if any non-deleted tag exists,
  else `'live'` if any non-deleted packing event exists, else `'none'`.
- `matchPacking(liveEvents, tags)` → per player `{ packing, received, byPass,
  byDribble, source }`. **For a live-sourced match `received`, `byPass` and
  `byDribble` are `null`, not 0** — live entry never asked, and zero would be a
  claim nobody made. Views show null as a dash.
- `parseVideoTime(text)` → seconds, null for blank, or a refusal.

Every report goes through `matchPacking`, so no two views can disagree about
which source counts.

### Rates and minutes

A rate per full match divides by minutes played, and minutes come only from
the live substitution log. **A match tagged from video and never tracked live
has no minutes.** Its packing counts in the totals; the rate is computed only
over matches where that player has logged minutes, scaled by
`seasonFullMatchMinutes` (never 90). The report says so: *"Rate covers 9 of 12
matches. 3 were tagged from video with no live log, so they have no minutes to
divide by."*

Assuming a full match for everyone was rejected: it credits a substitute with
minutes they did not play — the low-minute distortion CLAUDE.md forbids.

### Season report — `SeasonReportScreen.vue`, sums in `src/data/season-stats.ts`

New columns:

- **Packing** — season total, and rate per full match with the minutes behind
  it beside it.
- **Received**, **By pass / By dribble** — totals over video-tagged matches
  only, headed "from N video-tagged matches". A dash for a player with none.

Every player on the roster is listed, including those with no minutes or no
packing. Nobody is filtered.

The per-match view is the tag screen's summary table and the live tally; the
season report gets no match drill-down of its own.

## 5. Testing

### Database — `src/data/testdb/packing.test.ts`, real Postgres

- A `packing` event without `bypassed`, with 0, or with 12 is refused; a `plus`
  carrying `bypassed` is refused.
- An event of **every pre-existing kind** still inserts after the migration —
  catches a recreated constraint that lost a kind.
- `packing_tags`: a pass without a receiver, a dribble with one, receiver equal
  to player, an unknown action and a negative `video_seconds` are each refused.
- The migration applies to the empty demo schema and runs twice cleanly.

### Permissions — `accounts-db.ts`, `authenticated` connection

The superuser harness skips every privilege check, so these run as visitors: a
coach of the team reads and writes tags; a coach of another team, a player and
an anonymous visitor can do neither.

### Domain — `src/domain/packing.test.ts`

- Source: no tags → live; one tag → video; removing every tag → live again;
  deleted rows ignored on both sides.
- A live-sourced match gives null received and split, never 0.
- `parseVideoTime`: `23:41`, `75:30` (4,530 s), `1:02:05` and blank accepted;
  `23:5`, `23:60`, `1:60:00`, text and a negative refused.

### Replay and store

- `replay` sums packing per player, and adding packing events to a fixture leaves
  every other figure unchanged.
- `append('packing')` with the clock stopped is refused; so is a bench player,
  and a missing or out-of-range count — before the optimistic update.
- Undo removes a packing tap.

### Season stats

- The rate covers only matches with minutes; video-only matches still count in
  totals.
- A low-minute player stays in the table with their minutes shown.
- A team with `match_minutes = 70` scales to 70.

### Components

- `LiveMatchScreen`: arm → tap → count records; pressing Packing again cancels.
- `PackingTagView`: Enter moves through the fields and saves from the last one;
  Dribble hides Receiver; an ambiguous shirt number opens the picker; the
  replacement notice reads correctly before and after the first tag.
- `SeasonReportScreen`: a live-only player's Received shows a dash, not 0.

### Gates

`npm test` (judged by exit code), `npm run typecheck`, `npm run build`.

## Out of scope

- Editing a tag in place (remove and re-type instead).
- Counting failed attempts or a completion rate.
- Packing as a Competitive Matrix measure in practice.
- Packing on a player's bio or card.
- Splitting totals by half (video tags carry no match minute).
