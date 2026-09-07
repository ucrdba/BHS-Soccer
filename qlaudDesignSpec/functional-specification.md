# Soccer Program — Functional Specification

**Purpose of this document.** It describes *what the application does*, for
someone designing how it should look. It deliberately says nothing about how it
is built — no framework, no component library, no state management. Those are
design decisions to be made against this specification, not constraints handed
down by it.

Read it as: here are the audiences, here is every screen, here is what each one
must let a person do, and here are the rules that must survive whatever layout
you choose.

---

## 1. What this is, and who uses it

A web application for a soccer program: a **public side** anyone can read, and a
**coaching side** behind sign-in.

It serves **more than one organization**. A high school and an independent club
both use it, each with their own name, crest colours, teams, players, drills and
categories. A person may belong to more than one — a player can be on their
school team and a club team at the same time, with separate statistics in each.

Four kinds of visitor:

| Who | What they are here for |
| --- | --- |
| **Visitor** (not signed in) | The roster, the schedule, the next fixture, the coaching staff, the handbook. No account needed. |
| **Player** (signed in, approved) | The above, plus their own ratings and the quiz. |
| **Coach** | Everything a player sees, plus the ratings board, session entry, practice planning, the tactical board, match tools, and parts of the admin screen. |
| **Admin** | Everything, plus approvals, team and organization management, the data import/export, and diagnostics. |

Signing up creates an account in a **pending** state. It does nothing until a
coach or admin approves it. This is deliberate: the coaching side contains
player assessments.

**Where this is used matters to the design.** A coach uses the match tools
standing on the touchline, on a phone, in sunlight, often one-handed, sometimes
with a clipboard in the other hand. The session-entry screen competes directly
with a paper stopwatch sheet — if it is slower than paper, the coach uses paper.
The public screens, by contrast, are read on a phone by a parent looking up
kick-off time, or on a laptop by someone browsing the roster.

---

## 2. The rule that governs everything: nothing is hardcoded

**Every value the application displays comes from the database.** Not from the
markup, not from a constants file, not from a build-time configuration. If a
designer sees a name, a colour, a number, a label or a list in a mockup, the
question to ask is "which table does this come from?" — and there is always an
answer.

This is not a preference about tidiness. The application serves several
organizations at once, and any value baked into the code becomes one
organization's value imposed on all of them. A club that opens the app and sees
another organization's name, mascot or colours has been shown somebody else's
identity.

### What comes from where

| On screen | Comes from |
| --- | --- |
| Organization name, mascot, city, league | the organization record |
| Primary and secondary colour | the organization record |
| Season record (wins, losses, draws) | the organization record |
| Team names, seasons, which team is the public default | the teams table |
| **How long a full match is** | the team record — see §9 |
| Player names, numbers, positions, class year, height, photo | player identity + team membership |
| Season statistics (goals, assists, saves, clean sheets) | team membership |
| Skill ratings (technical, tactical, physical, mental) | team membership |
| Recording numbers | team membership |
| Fixtures, opponents, venues, kick-off times, results | the schedule table |
| Coaching staff, their roles, contact details, biographies | the coaches table |
| Drill library, categories, coach notes, diagrams | drills + categories tables |
| Drill scoring weight and measurement type | the drill record |
| Time standards and their bands | the bands table |
| Practice plans and their timings | the practice plan rows |
| Quiz questions, options, correct answer, explanation | the quiz tables |
| The coach's daily message | the daily message table |
| Roles and what each may do | the roles table |

The only things not read from the database are the **structural** ones: the
navigation's existence, the shape of a screen, and the neutral fallback colours
used before an organization has been resolved.

### Consequences for layout

- **A name can be long.** "Beaumont High School" and "Legends FC" have very
  different widths, and so do "Cougars" and "U16 Reds Development Squad".
  Headings must not assume a length.
- **A colour can be anything.** The organization's primary and secondary
  colours are chosen by an admin. A design that only works with one particular
  blue is a design that breaks for the second organization.
- **A list can be empty.** Every collection here can legitimately have nothing
  in it — a new organization has no players, no fixtures, no drills. An empty
  state is a normal state, not an error, and it should say what to do next.
- **A value can be missing.** A player may have no photo, no shirt number, no
  height, no recorded position. The layout must degrade rather than break.

---

## 3. Visual identity

Keep the current character: a **dark, deep-navy interface** with a bright cyan
accent and a gold highlight. It reads as a sports program's command centre
rather than a corporate dashboard, and that is right for the audience.

### The palette as it stands

| Role | Value |
| --- | --- |
| Page background | `#0A1428` — near-black navy |
| Card / panel surface | `#112240` |
| Border, divider | `#233554` |
| **Primary** (organization) | `#0047AB` — deep blue |
| Primary, darker | `#002D62` |
| Electric blue | `#1E90FF` |
| **Cyan accent** | `#00F0FF` — the highlight colour, used sparingly |
| **Secondary / gold** (organization) | `#FFD700` |
| Silver | `#E2E8F0` |
| Primary text | `#F8FAFC` |
| Muted text | `#94A3B8` |
| Dark text (on light surfaces) | `#0F172A` |
| Success | `#10B981` |
| Warning | `#F59E0B` |
| Danger | `#EF4444` |

There is also a translucent "glass" surface treatment — a semi-opaque navy
panel with a faint white border and a deep shadow — used for raised elements.
Typography pairs a condensed display face for headings with a neutral
sans-serif for body text.

### The part that is per-organization

**Primary and secondary are not fixed.** They are the organization's own
colours, loaded from its record, and the values above are only what the first
organization happens to use. A club's primary might be red, or green, or a very
light colour.

Design implications:

- **Never rely on the primary being dark**, or on the secondary being a warm
  gold. Text placed on either must remain legible when they change. Where
  contrast matters, prefer the fixed surface colours and use the organization's
  colours for accents, borders, badges and emphasis.
- The **structural** colours — backgrounds, surfaces, borders, text, and the
  success/warning/danger set — stay fixed. Only the two organization colours
  vary. This is what keeps the app coherent while still feeling like the club's.
- Before an organization resolves (the first moment of a cold load), the
  fallback colours apply. A design should not flash jarringly when the real
  colours arrive.

The **browser tab title** also follows the organization. The document loads with
a neutral title and the application replaces it once the active organization is
known.

---

## 4. The shell

Present on every screen.

### Header

Carries the organization's identity — its name and mascot — and the **team
switcher**, the season record, and the sign-in state.

**The team switcher is more important than its size suggests.** Almost
everything on every screen is scoped to one active team: the roster, the
schedule, the ratings, the practice plans, the match tools. Switching teams
changes what the whole application is about. It groups teams by organization,
because that distinction is the point — a person may coach a school team and a
club team, and confusing the two is the failure this feature exists to prevent.

The chosen team is remembered per device. It is only honoured while the viewer
still has access to that team, so a coach removed from a team stops seeing it.

A visitor who is not signed in, or who belongs to no team, sees the
organization's designated public team rather than an empty application.

### Navigation

Seven destinations, each a real URL that can be linked to, bookmarked and
reloaded:

| Destination | Path | Who sees it |
| --- | --- | --- |
| Home | `/` | everyone |
| Roster & Bios | `/roster` | everyone |
| Schedule & Results | `/schedule` | everyone |
| Player Ratings | `/matrix` | coaches, and players for their own results |
| Coach Planner | `/planner` | coaches |
| Coaching Staff | `/coaches` | everyone |
| Help | `/help` | everyone |

Two further destinations are not in the main navigation: the **admin screen**
(`/admin`) and the **quiz** (`/quiz`).

The current icons are: ⚽ Home, 👥 Roster, 📅 Schedule, 🏆 Ratings, 📋 Planner,
👔 Staff, 📖 Help. Treat these as intent rather than mandate.

Navigation must work on a phone. A coach reaches the match tools through the
Schedule screen while standing on a touchline.

### Footer

Carries the build identity — which version is actually running. This exists so
a problem can be diagnosed without a developer, and it is more useful than it
looks.

### Sign-in

A modal, not a page, so signing in does not lose the reader's place. It offers
sign-in, account creation, and a code-based email confirmation step.

**One detail worth preserving.** When someone types an email address whose
domain looks like a near-miss of a common provider, the form offers a
correction — and offers keeping what was typed with equal weight. The
correction is a suggestion, never an assumption; someone whose address really is
unusual must not be pushed into a wrong one. And accepting a correction must not
lead to a second correction being offered.

Sign-up must **never** be restricted to a school's email domain. Club coaches
and players use personal addresses.

---

## 5. Home

The landing screen, and the one a parent or player sees most.

It shows:

- **The organization's identity** — name, mascot, colours.
- **The season record** — wins, losses, draws.
- **The next fixture**, with a countdown, opponent, venue, kick-off time, and
  whether it is home or away.
- **The last result**, when there is one.
- **The coach's daily message**, when one is set — a short piece of writing the
  coach wants the squad to read that day. It has a title and a body.

Empty states are real here. A program before its first fixture has no next
match and no record, and the screen should still feel complete.

The daily message deserves prominence when present and no leftover space when
absent.

---

## 6. Roster & Bios

Public. The squad, as cards.

Each card shows the player's photo (or a placeholder), shirt number, name and
position. Opening one shows a fuller view: class year, height, season
statistics, and the four skill ratings.
The four skill ratings are not public: they are shown to the team's own
coaches, admins and players, and to nobody else.

**Filtering** is by position group, as a small set of chips: All, Keepers,
Defence, Midfield, Attack. Positions are stored as free text — "Center Back",
"CB", "Right Wing" — and are matched by keyword, so the filters are tolerant of
how a coach typed them. An unrecognised filter shows everyone rather than
nobody, because an empty roster reads as "there are no players", which would be
a lie.

**Sorting** is by shirt number or by name. Note that the roster sorts on the
**shirt** number, while the ratings screens sort on the **recording** number —
these are two different numbers (see §9).

Coaches additionally get: add a player, edit a player, remove a player, and
assign recording numbers.

Design notes:

- A squad is typically 18–30 players. The card grid is the primary visual
  element of this screen.
- A player with no photo is common, not exceptional.
- A player with no shirt number sorts last, never first.

---

## 7. Schedule & Results

Public. Every fixture: date, kick-off time, opponent, venue, home or away,
status, and score where played.

Fixtures group naturally into upcoming and completed. The next fixture deserves
emphasis — it is the single most-looked-up piece of information in the app.

Coaches can add and edit fixtures, and from each fixture reach the three match
tools:

- **Lineup** — arrange the starting eleven and the bench on a pitch, by
  formation.
- **Live plus/minus** — the in-match recording tool (§8).
- **Season report** — the cumulative per-player picture across all fixtures.

The venue may carry a full address, which should be reachable as directions.

---

## 8. The match tools

These are the touchline screens. They are used standing up, on a phone, in
bright light, while watching a match. Legibility and target size beat density.

### Live plus/minus

A running match clock, the pitch with the players currently on it, and the
bench. The coach taps to record: a plus, a minus, a shot, a goal, an assist —
and makes substitutions.

**The rule that governs this screen, and it is not optional:**

> **A statistic may only be recorded while the clock is actually RUNNING** —
> not merely started, and not while stopped.

Every event is stamped with the match clock, and playing time and goal
difference are *derived from those stamps*. An event recorded during a stoppage
is credited to whoever was on the pitch at a minute that has already passed.
Before kick-off, everything stamps at 0:00 and every player finishes the match
credited with zero minutes. In both cases the counters go up and the sheet looks
correct — which is exactly why the application must refuse rather than trust the
coach to remember.

When a coach taps a gated action with the clock stopped, the screen must say so
plainly, and say something different depending on whether the match has started
at all. Substitutions and starting the clock are **not** gated.

The record is a log of events, never a running tally. Every figure is replayed
from the events, which is what makes correcting a mistake possible.

### Lineup

A pitch, a formation, and the squad. Players are placed into positions;
everyone else is the bench. It should work by dragging on a desktop and by
tapping on a phone.

### Season report

Per player, across the season: appearances, minutes, plus, minus, net, goal
difference, and the per-match rates of the last two.

**Low-minute players stay in this table.** See §9.

---

## 9. Rules that must survive any layout

These are the rules that were learned the hard way. A design that quietly
violates one of them produces a screen that looks right and misleads a coach.

### A match is not ninety minutes

High school matches are 80 minutes. Club age groups play shorter. **The length
is stored on the team record and read from it.** Every per-match rate divides by
this number, so a hardcoded 90 silently rescales every figure a coach reads. One
organization can field teams playing different lengths at the same time.

### Low-minute players are the audience, not the noise

The season report, the plus/minus sheet, the squad report and the progress
chart must **never** filter out, hide, collapse or de-emphasise players with few
minutes.

The reasoning: substitution and re-entry are unlimited, so much of the squad
finishes any fixture well under a full match — and a coach reads these views
precisely to decide *who to give more minutes to*. Filtering the fringe players
removes exactly the players the decision is about, and does it invisibly.

The real problem being solved — that a rate computed from five minutes is
volatile — is solved by **showing the minutes beside the rate**, so the reader
can weigh it. Not by hiding the player.

### Recording numbers are the coach's, and never change by themselves

Players carry a **recording number** distinct from their shirt number. It is
what the paper stopwatch sheets are numbered by, all season.

The application may **propose** a set of numbers for a squad, which the coach
then accepts or edits. Nothing renumbers a squad automatically, ever. A number
changing under a coach mid-season invalidates every paper sheet they hold.

Because the numbers must be unique within a team, swapping two players' numbers
is a genuine operation the interface must support cleanly, and a duplicate must
be refused before anything is written rather than halfway through.

### Fitness standards are pass/fail, not a ranking

See §10 — this shapes the ratings screens significantly.

### Nothing is deleted

Removing a player, a fixture, a category or a drill retires it rather than
destroying it. Interfaces should say "retire" or "remove from this team" rather
than implying destruction, and should say what else the action affects — how
many drills a category change moves, for instance.

---

## 10. Player Ratings — the Competitive Matrix

The heaviest coaching screen, and the one that most needs a good layout.

### What it is

A ranking system: players compete at a set of exercises across the season, and
the results produce a standing. Each exercise has a **weight** (how much it
counts) and a **measurement type**, and the measurement type changes what the
result *means*.

### The five measurement types

| Type | What it records | Better is |
| --- | --- | --- |
| Head to head | one player against another | winning |
| Win / loss | a result | winning |
| Count, high | a number of repetitions | higher |
| Time, low | a time in **decimal seconds** — a sprint | lower |
| **Time bands** | a time in **minutes and seconds** against a standard | meeting the standard |

**The last one is different in kind, and this is the single most important
distinction on this screen.** The first four rank players against each other.
**Time bands does not — it is a match-readiness standard.** A fitness benchmark
that the whole squad clears is the *good* outcome, not a broken exercise.

So for a banded exercise the screen reports **how many players fell below the
standard** and marks them, rather than presenting a ranking as if the top of it
were meaningful.

Two constraints follow:

1. **This emphasis is strictly additive.** It must never narrow the table,
   remove players, or disable a sort that is available for other exercises. A
   coach must still be able to sort and read the full squad.
2. **Bands must not be tuned to spread scores out.** If everyone passes, the
   squad is fit. That is the answer, not a problem with the exercise.

Note also that the two time-based types are **entered differently** — one as
`4:30` meaning four minutes thirty, the other as `4.85` meaning four point eight
five seconds. The input must make clear which is expected, because both are
plausible-looking numbers and reading one as the other produces a result that is
wrong but not obviously wrong.

### What the screen contains

- **The board** — every player, their standing, their points.
- **A per-exercise leaderboard** — one exercise at a time, ranked, with the
  band summary where the exercise is a standard.
- **A logged-results panel** — what has actually been recorded.
- **A player breakdown** — one player's results across every exercise, in words
  a coach can act on.

And these tools:

- **Session entry** — recording a session's results (below).
- **Weights editor** — how much each exercise counts.
- **Standards and bands editor** — the time bands for a banded exercise.
- **Session history** — past sessions.
- **Squad report** — the whole squad against the standards.
- **Progress chart** — one player's readings for one exercise, over time.

### Session entry — the screen that competes with paper

A coach runs a fitness session with a clipboard and a stopwatch, and enters
twenty-five times one-handed. **If this screen is slower than paper, the coach
uses paper and the data never arrives.**

Three behaviours exist for exactly that reason and must survive any redesign:

1. **Enter moves to the next entry field**, rather than submitting the form.
2. **It moves in the order shown on screen**, not the underlying roster order —
   these differ once the coach has sorted the list.
3. **Typing a value marks the player present.** A recorded time outranks
   whatever the attendance control said; a coach who has just typed a time
   should not also have to change a dropdown.

Design implications: a dense, keyboard-navigable grid; large numeric input
targets; the attendance state visible but not in the way; and no modal
interruption between one player and the next.

### Progress over time

For one player and one exercise, the readings in date order.

**A session the player missed is dropped, not plotted as zero.** An absence is
not a result of nothing, and drawing it as one shows a collapse that never
happened — on the very chart a coach uses to judge whether someone is improving.

**One reading is not a trend.** With a single result the honest answer is to say
so, not to label the player "level".

---

## 11. Coach Planner

Coaches only. Three things live here.

### The practice plan

A timeline of drills for a session: each with a start time, a duration, a name,
and coach notes. Drills are reordered by dragging, and — because dragging is
poor on a phone — also by explicit move-up and move-down controls.

**The session's start time is fixed by the coach and must not wander.** Moving
or deleting the first drill in the list must not shift when practice begins.

Plans are saved by name, listed, renamed, deleted, and copied to another team.
A plan may be printed as a document for the touchline, including the drill
diagrams.

### The drill library

The organization's drills: name, category, coach notes, a scoring weight, a
measurement type, and optionally a diagram.

**Categories belong to the organization.** Two organizations may both have a
"Possession" category, and one editing theirs must not affect the other's.
Because a drill's category is stored as free text, a drill can carry a category
name that no category record defines — these are shown as their own group,
"used by drills, not defined", so the drift is visible and can be adopted as a
real category or merged into one. Every destructive action here says how many
drills it moves.

### The tactical board

A canvas for drawing a drill: players, cones, balls, arrows, freehand lines, and
a choice of pitch types. Undo and redo. **Keyframes** let a coach show movement
— frame one is the setup, frame two is where everyone moves to.

Two design constraints:

- **Diagrams already exist in the database and cannot be re-drawn.** The stored
  format must keep loading, including older diagrams saved before keyframes
  existed.
- **Coordinates are relative to the drawing surface.** Resizing the board must
  rescale everything together, or a diagram silently stops meaning what it did.

There is also a **1v1 round robin** generator here: every player against every
other exactly once, arranged into rounds. No player appears twice in a round,
and with an odd squad the bye rotates so nobody sits out twice. The schedule can
be exported for printing.

---

## 12. Coaching Staff

Public. The coaching staff: name, role or level, photograph, biography, and
contact details.

Coaches can add and edit entries.

This screen must show **this organization's** staff. It is a small screen with a
large failure mode.

---

## 13. Help

Public. A handbook of around thirty sections, grouped into parts, each written
for a particular audience — everyone, coaches, or admins.

It is **searchable**, and search is the primary way in: a coach with a question
types a word, not a table of contents entry.

Each section has a stable identifier so it can be linked to directly.

Layout notes: this is long-form authored prose with headings, ordered steps,
tables, notes and warnings. It needs a genuine reading layout — measure,
rhythm, and a persistent index — not a wall of cards.

---

## 14. The quiz

Players. A short set of questions with multiple options, marked immediately,
with an explanation shown afterwards.

Two rules:

- **The correct answer comes from the database, never from a key in the
  application.** An earlier version held the answers in the code, so editing a
  question silently broke the marking — a player answering correctly was told
  they were wrong, and it was recorded that way.
- **A question with no stored correct answer marks nothing right**, including
  the option the player chose. Guessing would award or deny a point on a
  half-written question.

A question may be tied to the coach's daily message, and is then only asked
while that message is the active one — which keeps the quiz testing this week's
focus rather than one nobody remembers.

---

## 15. Admin

Reached at `/admin`, not in the main navigation.

**Each section is gated separately, and the screen is not admin-only.** Some
sections belong to any coach; others to admins alone. A screen that gated the
whole page on the admin permission would be wrong, and — because permissions
fail closed when they cannot be loaded — would lock a real admin out of the very
screen they would visit to diagnose that. When that happens, the screen must say
so rather than render nothing.

Sections:

| Section | Who | What it does |
| --- | --- | --- |
| Approvals | coach, admin | Approve or reject pending sign-ups. |
| Teams & organizations | admin | Create and edit teams; set the public default. |
| Unassigned players | coach, admin | Players not on any team, and how to place them. |
| Drill categories | coach, admin | Add, rename, retire and merge; adopt undefined names. |
| Quiz bank | coach, admin | Write and edit questions and answers. |
| Organization profile | admin | Name, mascot, city, league, **colours**, season record. |
| Import / export | admin | The spreadsheet round trip (below). |
| Connection & diagnostics | admin | Database credentials, and a live diagnostic. |

### The organization profile

This is where the colours come from. An admin editing this screen changes the
appearance of the whole application for their organization, and the form should
make that consequence visible — a preview rather than two colour fields and a
save button.

The name and mascot are **required**: they are rendered on headings throughout
the app, and a blank one does not fall back gracefully.

### Import and export

Eleven tables, exportable as one workbook, as individual files, as a zip, or as
blank templates. Then importable back.

Three behaviours to preserve:

- **An export invents nothing.** An empty table exports an empty sheet with its
  column headings — which is precisely what tells a coach the table is empty. An
  earlier version filled empty tables with plausible sample rows, and because an
  export is a backup, re-importing it injected invented players and results into
  a real database.
- **An import previews before it writes.** Choosing a file describes what would
  change — which sheets were recognised, how many rows each holds, which were
  not recognised and why — and applies only on a second, informed action. An
  earlier version applied as it read, so a misread column was discovered after
  it had overwritten a season.
- **A team is never guessed.** A spreadsheet names a team as text; the database
  identifies teams by an opaque identifier. A row written against the wrong team
  puts a player on a squad they never played for, in the record that holds their
  minutes, ratings and recording numbers. Unrecognised team names are **put to
  the coach to map**, and applying is refused while any are unmapped. This
  mapping step is a real part of the flow and needs real design attention — it
  is the last point at which a bad import can be stopped.

Two sheets are honest about their limits: the Matrix results sheet exports but
cannot be imported back, and the user-accounts sheet exports with headings and
no rows. Both say so on screen, so a restore that is incomplete does not look
complete.

### Diagnostics

Runs a live check against the database and **reports what it found, per table,
in the database's own words** — reading it and writing to it separately, since a
table that reads but refuses writes is the commonest configuration failure and a
single pass/fail hides it.

This screen exists so a misconfigured deployment can be diagnosed *without a
developer*. "Failed" sends someone to find an engineer; "players: read ok, write
refused by security policy" does not. Design it as a report, not a status light.

The credentials editor must say what it does **not** do: the values are stored in
one browser on one device, and saving them configures nothing for anyone else.

---

## 16. States, feedback and failure

Every screen needs four states designed, not three:

1. **Loading** — the database is remote and a cold load takes a moment.
2. **Empty** — a legitimate state, not an error. Say what would fill it.
3. **Populated.**
4. **Refused** — the database declined the operation.

The fourth is the one usually forgotten, and it matters here because the real
access rules live in the database, not in the interface. The interface's
permission checks are *affordances* — they decide what to offer — while the
database decides what actually happens. So an action can be offered and still
refused, and when that happens the screen must say so in words rather than
silently doing nothing or falsely reporting success.

Guidance:

- **Destructive actions state their consequences in specifics** — how many
  drills a merge moves, how many players a change affects — not "are you sure?".
- **A partial success is reported as one.** "Twelve rows written, three
  refused" is the truth; "imported" is not.
- **A failure names what failed.** Wherever the database gives a reason, show
  it. This application is operated by coaches, not administrators, and a vague
  error means an email to whoever built it.

---

## 17. Devices

**The phone is not the secondary case.** The match tools, session entry and the
lineup are used on a phone at the pitch. The planner, the ratings board and the
admin screens are used on a laptop at a desk.

- Touch targets on the match tools must be large enough for a coach who is
  watching the game rather than the screen.
- The tactical board and the lineup need drag on a desktop and tap on a phone —
  a drag-only interaction excludes the device it is most used on.
- Wide tables (the ratings board, the season report) must remain readable on a
  narrow screen without hiding columns that carry meaning — remembering that
  minutes must stay visible beside any rate.
- The printed practice plan is a genuine output: it goes to the touchline on
  paper.

---

## 18. Accessibility

- Text must remain legible against organization colours that the design cannot
  predict. Where an organization's colour would fail contrast, the interface —
  not the admin — should be the thing that adapts.
- The session grid must be fully keyboard-operable; that is its primary input
  mode.
- Status must never be carried by colour alone. Players below a fitness
  standard, fixtures won and lost, and pass/fail states all need a second signal.
- The application is used outdoors in daylight, which argues for stronger
  contrast than a dark interface usually gets away with.

---

## 19. Glossary

| Term | Meaning |
| --- | --- |
| **Organization** | A school or a club. The top-level tenant. |
| **Team** | A squad within an organization, with its own season and match length. |
| **Membership** | A player's place in a team, carrying everything that varies by team. |
| **Shirt number** | The number on the jersey. What the roster sorts by. |
| **Recording number** | The number on the coach's paper sheets. What the ratings screens sort by. |
| **Matrix** | The competitive ranking system on the Player Ratings screen. |
| **Measure** | How an exercise is scored — one of five types. |
| **Bands** | Time thresholds defining a fitness standard, each earning points. |
| **Plus/minus** | Live match recording; every figure derived from a stamped event log. |
| **Daily message** | A short piece of writing from the coach, shown on Home. |
