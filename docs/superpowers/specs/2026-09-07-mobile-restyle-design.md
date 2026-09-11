# The Mobile Restyle

**Status:** proposed
**Date:** 2026-09-07
**Source design:** `qlaudDesignSpec/soccer-program-mobile.dc.html`, a copy of the
"Soccer Program - Mobile" canvas from the Claude Design project *Soccer
Statistics App Design*. Its brief is `qlaudDesignSpec/functional-specification.md`.

## 1. What this is

The application gets the visual design drawn on the canvas, applied to the
existing Vue app rather than to a rebuild. Nothing about the data layer, the
stores, the domain modules or the rules in `CLAUDE.md` changes. What changes is
the stylesheet, the shell, and each view's template and scoped styles, and four
tools that are modals today become full-screen routes.

The canvas draws eleven phone screens across three visual treatments, and the
decision is to apply all three, as drawn:

| Treatment | Ground name | Where |
| --- | --- | --- |
| Light editorial, Cormorant Garamond over Lora, hairline rules | `paper` | Home, Roster, Schedule, Coaching Staff, Help, Quiz, Planner, Admin |
| Deep navy, Oswald display face, cyan for what is live | `pitch` | Lineup, Live plus/minus |
| Deep navy with the editorial faces, gold as stroke | `ledger` | Player Ratings and its panels, Season report, Session entry |

The restyle reaches the whole app. The eleven drawn screens are matched
closely; the screens with no mockup (Planner, Coaching Staff, Help, Quiz, Admin
and the modals) are restyled to the same rules without new mockups.

The design is responsive from one layout: the phone layout grows into a
centred measure above 768px, the bottom bar becomes a hairline top nav, and
tables and card grids widen. There is no separate desktop look.

## 2. Tokens and grounds

`index.css` is rewritten and becomes the only stylesheet. `styles.css`, the
2,205-line legacy sheet, is deleted (section 7).

### 2.1 Fixed tokens

Shared by every ground and never varied per organization:

- Status colours: `--color-success` `#10B981`, `--color-warning` `#F59E0B`,
  `--color-danger` `#EF4444`.
- Spacing scale `--space-1` … `--space-8` and radii `--radius-sm/md/lg`, taken
  from the Classical system's values (4.6px base step, 4px middle radius).
- Faces: `--font-heading` "Cormorant Garamond", `--font-body` "Lora",
  `--font-display` "Oswald". Inter is dropped. The Google Fonts link moves into
  `index.html` with the three families and the weights the canvas uses
  (Cormorant 300–600 plus italic, Lora 400–600 plus italic, Oswald 300–600).
- A `.tnum` helper setting `font-variant-numeric: tabular-nums`.

### 2.2 Ground tokens

The same token names are defined three times, once per ground, under
`[data-ground="paper"]`, `[data-ground="pitch"]` and `[data-ground="ledger"]`
on the `<html>` element. Every component styles against these names only.

| Token | Role | paper | pitch | ledger |
| --- | --- | --- | --- | --- |
| `--ground` | page background | `#f3f2f2` | `#0A1428` | `#0A1428` |
| `--surface` | raised panel, dialog | `#eae9e9` | `#112240` | `#112240` |
| `--surface-deep` | input wells, pitch | `#e0dede` | `#0d1b33` | `#0d1b33` |
| `--ink` | primary text | `#201f1d` | `#F8FAFC` | `#F8FAFC` |
| `--ink-muted` | secondary text | `#605d5d` | `#94A3B8` | `#94A3B8` |
| `--ink-soft` | tertiary text, dead controls | `#9b9797` | `#4a5b78` | `#4a5b78` |
| `--rule` | hairline divider | 16% ink | `#233554` | `#233554` |
| `--rule-strong` | emphasised rule, kicker | `#7d5411` | `#FFD700` | `#FFD700` |
| `--live` | what is live or active | `#7d5411` | `#00F0FF` | `#00F0FF` |
| `--mark` | the organization's mark | `--org-primary` (guarded) | `--org-secondary` (guarded) | `--org-secondary` (guarded) |
| `--heading-face` | face for headings | heading | display | heading |
| `--shadow-md` | elevation | ink-tinted | ambient dark | ambient dark |

`--rule-strong` and `--live` coincide on paper on purpose: the Classical
system has one accent, and the canvas uses it for both the fixture rule and the
active tab.

`--heading-face` is what lets the touchline screens use Oswald while the other
two grounds use Cormorant without a component knowing which ground it is on:
`h1`–`h4` and any element with `.display` read `--heading-face`.

### 2.3 Organization colours

The organization store keeps painting the active organization's colours onto
the document at runtime, exactly as today, under two renamed properties:
`--org-primary` and `--org-secondary`. `themeVars()` in `src/domain/theme.ts`
returns those names. The old `--bhs-blue-primary` and `--bhs-gold-accent` are
aliased to them in `index.css` for the duration of the work and removed in the
final phase (section 7).

They are used only as stroke, never as fill or body text:

- On paper, `--org-primary` is the crest keyline in the header and the letter
  inside it.
- On the dark grounds, `--org-secondary` is `--mark`: the recording-number
  rank colour, the standard box border, the kicker colour.

**One exception, on Home.** The band at the top of the home page fills with
`--org-band`, the organization's primary guarded to 4.5:1 against the white
text on it. It is recorded, with its reasons, in
`2026-09-10-home-hero-design.md` §6.4.

**Contrast guard.** The spec says the interface, not the admin, adapts when an
organization's colour would fail contrast. `src/domain/theme.ts` gains
`contrastRatio(a, b)` (WCAG relative luminance, returns a number) and
`guardedMark(colour, ground, fallback)`, which returns `colour` when its ratio
against `ground` is at least 3:1 and `fallback` otherwise. The store applies it
when painting: `--org-mark-paper` is the primary guarded against `#f3f2f2`
with `#201f1d` as the fallback, and `--org-mark-dark` is the secondary guarded
against `#0A1428` with `#FFD700` as the fallback. Each ground's `--mark` reads
the one for its own background. The default colours (`#0047AB`, `#FFD700`) pass
both guards, so the first organization looks as the canvas draws it.

### 2.4 Choosing the ground

The ground is a function of the route, not of state. Each route carries
`meta.ground`; the router's `afterEach` sets `document.documentElement.dataset.ground`
from it. `src/router/ground.ts` exports `groundFor(meta)`, which returns
`meta.ground` when it is one of the three names and `'paper'` otherwise, so the
mapping is tested without a DOM and an unknown value cannot leave the document
unstyled. `index.html` ships `data-ground="paper"` on `<html>` so the first
paint is not a flash of unset tokens.

## 3. The shell

### 3.1 Header

`AppHeader.vue` becomes the crest block from screen 1a:

- A 38px keyline box, `1.5px solid var(--mark)`, holding the organization
  name's first letter in the heading face and the mark colour.
- Beside it, the organization name as a small uppercase kicker in
  `--ink-muted`, and the mascot as a 26px heading in `--ink`.
- A second row under a hairline: the team switcher on the left and the season
  record on the right.

The **team switcher** is a native `<select>` bound to `org.setActiveTeam`,
populated from `org.teams` and grouped by organization with `<optgroup>`
labelled by the school's name, styled as the "Varsity · 2026 ▾" text. It is
hidden when the viewer can see only one team. Grouping by organization is the
point of the control and is stated in the spec.

The **season record** is the existing `schedule.record` from
`domain/season-record.ts`, rendered as `8W 3L 2D` in tabular figures with the
letters in `--ink-muted`. It is omitted until the schedule has settled and
omitted when no match has been played.

The account controls collapse to one outlined button on the right of the first
row: "Sign in" for a guest, the role badge plus "Sign out" otherwise. The
`AuthModal` is unchanged.

Every word in the header still comes from the organization row; a missing
mascot renders nothing in its place.

### 3.2 Navigation

`AppNav.vue` renders from `NAV_ITEMS` filtered by `routeAllowed`, as today.
What changes is the shape:

- **Above 768px**: a hairline top nav in the Classical `.nav` pattern, all
  visible items in a row, the current one underlined in `--live`.
- **Under 768px**: a fixed bottom bar, 56px tall, `--surface` background,
  hairline top border, safe-area padding. Each tab is a label in the body
  face at 10px with a 2px top rule in `--live` on the current item.

A bottom bar cannot hold seven items. `src/domain/nav-bar.ts` exports
`barItems(visible, max = 5)`: when `visible.length <= max` it returns them all
and no More tab; otherwise it returns the first `max - 1` plus a `more`
marker. A guest's four public items fit; a coach's seven become Home, Roster,
Schedule, Ratings and More. The **More** tab opens a bottom sheet listing the
remaining items, plus Admin for a coach or admin, since `/admin` is not in
`NAV_ITEMS` and today can only be typed. The sheet closes on selection and on
backdrop tap.

The existing hooks are kept so the current tests need only small changes:
`data-nav-item` on every rendered link (bar and sheet), `data-nav-toggle` on the
More tab, `data-nav-drawer` on the sheet, `aria-expanded` on the toggle.

The footer, the last element in the document, gets `padding-bottom: 72px` plus the safe-area inset under 768px so the bar never covers it or the content above it.

Coaching Staff stays gated to coaches and admins, as the app and its tests have
it. The functional specification lists it as public; that is a behaviour
change and is out of scope here.

### 3.3 Footer

`AppFooter.vue` keeps the build stamp and the year, restyled as a hairline in
`--ink-muted`.

### 3.4 Tool chrome

Routes whose `meta.chrome` is `'tool'` render without header, nav or footer:
`App.vue` reads the meta and wraps the three in `v-if`. A tool screen draws its
own top bar (a back link to its parent route on the left, the title, and its
one control on the right) and its own footer bar, as every touchline screen on
the canvas does. This applies at every width; on a desktop the tool simply sits
in the centred measure.

## 4. Routes

Four routes are added. Each is guarded on coach or admin, which is who can
open the equivalent button today.

| Path | Name | Screen | Ground | Chrome |
| --- | --- | --- | --- | --- |
| `/schedule/lineup/:matchId?` | `lineup` | `LineupView.vue` | pitch | tool |
| `/schedule/:matchId/live` | `live` | `LiveMatchView.vue` | pitch | tool |
| `/schedule/report` | `season-report` | `SeasonReportView.vue` | ledger | tool |
| `/matrix/session/:drillId` | `session-entry` | `SessionEntryView.vue` | ledger | tool |

`routeAllowed` returns `a.isCoach() || a.isAdmin()` for the four names, and
`guards.test.ts` gains cases for them. The existing routes take
`meta.ground` from the table in section 1; none of them are `tool`.

**Cold arrival.** A bookmark or a reload lands on these with empty stores.
Each view watches `org.activeTeamId` and loads what it needs (`schedule.load`,
`roster.load`, `lineup.loadIndex`, `session.loadDrills`, `session.loadHistory`)
exactly as the parent view does today, then resolves its subject from the store
by the route parameter. A match id that is not in the loaded schedule renders a
short refused state naming the id, with the back link, rather than a blank.

**Session entry edit.** `?session=<id>` on the session route opens an existing
session for editing, calling `session.openExisting` where `MatrixView` calls it
today; without the query it calls `session.openNew`.

**Conversion.** The four modal components are converted in place rather than
wrapped:

- `PlusMinusModal.vue` becomes `components/schedule/LiveMatchScreen.vue`
- `LineupModal.vue` becomes `components/schedule/LineupScreen.vue`
- `SeasonReportModal.vue` becomes `components/schedule/SeasonReportScreen.vue`
- `SessionModal.vue` becomes `components/matrix/SessionEntryScreen.vue`

Each drops its `BaseModal` wrapper and `open` prop, keeps every other prop and
emit, and emits `close` where it did; the owning view navigates back on it. The
test files are renamed with them and their mounting adjusted; every behavioural
assertion stays. `ScheduleView` and `MatrixView` replace their modal state with
`RouterLink`s.

`vercel.json` already serves any extensionless path as `index.html`, so no
deployment change is needed.

## 5. Screen by screen

### 5.1 Paper ground

**Home** (`HomeView.vue`, canvas 1a·1)

- **Superseded in part by `2026-09-10-home-hero-design.md`.** The fixture
  block became a band over the organization's photo, and "Coming up" and
  "How we're doing" were added for the visitor. The bullets below describe the
  page before that change.
- The crest and record are the shell's; the view's own org line and "HOME OF
  THE" heading go.
- "Next match" kicker in `--rule-strong`; opponent as a 32px heading; home or
  away and venue in `--ink-muted`; then a block under a `--rule-strong` rule
  with the date and kick-off on the left and the countdown on the right.
- The countdown is one figure, "3d 04h", or "04h 12m" inside a day, or
  "12m" inside an hour. `domain/schedule.ts` gains `shortCountdown(c)` over the
  existing `Countdown` shape, tested for the three forms and for zero.
- "Last out · Millbrook, home" and the result word with the score, under
  hairlines, when `schedule.lastPlayed` exists.
- `DailyThought` renders as the bordered card with a 2px `--rule-strong` left
  rule, kicker "From {coach} · today", the title as a heading and justified
  body text. It still renders nothing when there is no message and the viewer
  cannot write one.
- The record strip stays below as hairline figures.
- Loading, empty, stale and complete states keep their present wording.

**Schedule** (`ScheduleView.vue`, canvas 1a·2)

- The next fixture is lifted out of the list into a bordered card: opponent
  heading, an outlined Away or Home pill, the date and venue line, and a
  Directions link when `matchDirectionsUrl` returns one. The canvas's "Add to
  calendar" is not in the spec or the app and is left out.
- "Upcoming" and "Completed" kickers, each list as hairline rows: opponent and
  when on the left; the side on the right for upcoming, the score in the
  heading face over the word Won, Drawn or Lost for completed. The word is what
  carries the outcome; colour is not relied on.
- A coach's per-fixture controls become a row of small text links under the
  fixture: Edit, Lineup, Live, and on the page header Add fixture and Season
  report. Lineup, Live and Report are `RouterLink`s to section 4's routes.
  Fixtures still missing a lineup keep their marker.

**Roster** (`RosterView.vue`, canvas 1a·3)

- The chips render as 34px pills, the active one filled from the accent's
  lightest ramp step with a darker accent border. Counts stay in the chip.
- The sort control becomes "Sort: number ▾" text that toggles.
- The list is hairline rows: shirt number in the heading face and `--ink-muted`
  (an em dash when missing, still sorted last), a 30px plate placeholder, name,
  and position or "Position not recorded".
- `PlayerDetailModal` stays a modal and takes the canvas bio layout: a 104px
  `.plate` photo or placeholder, "NO. 9 · SENIOR" kicker, name heading,
  position and height in italic, the three season figures under a hairline,
  then "Skill ratings" as four labelled 3px bars. The canvas puts this inline
  at the top of the roster; keeping it a modal keeps the existing tests and
  the coach's edit and remove controls where they are.
  The bars are shown only to the team's own coaches, admins and players
  (`domain/ratings-visibility.ts`): a rating is a coach's assessment of a
  player, most of whom are minors, so it is not public. This overrules the
  earlier reading of the functional specification, on the user's decision of
  2026-09-07.
- `PlayerFormModal` and `RecordingNumbersModal` are restyled to the paper
  dialog (section 5.4) with no layout change.

**Coaching Staff, Help, Quiz, Admin, Planner** have no mockup and are restyled
to the paper rules only: editorial headings, kickers for section labels,
hairline sections, outlined buttons, bordered unfilled cards, `.plate` on
photographs. Help additionally gets a reading measure of 38em for its prose and
a sticky section index on the left above 768px, with the search box above it.
The tactical board canvas, its toolbar behaviour and the print layout are
untouched; only their surrounding chrome takes the tokens.

### 5.2 Pitch ground

**Lineup** (`LineupScreen.vue`, canvas 1b·1)

- Top bar: back link, "LINEUP" in the display face, the formation `<select>`
  styled as "4–3–3 ▾" in `--mark`.
- A line under it: opponent, side, and "{n}-minute match" from
  `teams.match_minutes`, because every rate downstream divides by it.
- The pitch: a 330px bordered field with the halfway line and centre circle,
  44px circular markers with a 1.5px `--live` border, shirt number in the
  display face and the position as a cyan tag.
- "Bench · tap to place" kicker, then a two-column grid of 52px bench cards:
  number in `--mark`, name.
- Footer bar: Save lineup (outlined `--live`), Go live (outlined `--rule`),
  which navigates to the live route for the same match.
- Tap-to-place and drag both keep working; the picked state highlights the
  target slots as today.

**Live plus/minus** (`LiveMatchScreen.vue`, canvas 1b·2 and 1b·3)

- Top bar: "{period} · vs {opponent}" kicker, the clock at 33px in the display
  face coloured `--live` when running and `--color-warning` when stopped, and
  the clock button: Start before kick-off, Stop while running, Restart while
  stopped. Period end and Undo sit in an overflow row under the top bar.
- Status strip: a 9px dot and the words "Clock running · recording live",
  "Clock stopped" with "± and events are held" on the right, or "Not started".
  Stopped and not-started tint the strip `#1c1608`.
- The refusal card: `--color-warning` border with a 4px left rule on
  `#241c07`, title in the display face, body from `pm.notice`. The title is
  "The clock is stopped" when `pm.everStarted` and "The match hasn't kicked
  off" otherwise. The body text is the store's own; the store already words the
  two cases differently and is the one place the rule lives.
- "On the pitch" rows: shirt number in `--mark`, name with "{mins}′ on · net
  {score}" beneath, then 54px minus and plus buttons. While the clock is not
  running the buttons render with a dashed `--rule` border and `--ink-muted`
  text (`--ink-soft` fails the contrast floor on this ground, and the screen
  is read outdoors). They remain buttons: a tap still goes through `pm.append`, which
  refuses and sets the notice, so the card appears. Nothing here duplicates
  the guard. The same failure holds on the ledger ground: `MatrixBoard.vue`'s
  never-attempted rank dash and `ExerciseLeaderboard.vue`'s never-attempted
  mark use `--ink-muted` for the identical reason.
- Bench rows below, each with an On control. Sub (in the footer) scrolls to the
  bench. Taking a player off keeps its Off control on the row.
- Footer bar: Shot, Goal, Assist and Sub as 56px targets, the first three dashed
  and soft while not running, Sub always live. Shot, Goal and Assist arm the
  kind the way the existing `pm.arm` does and the next player tap records it;
  the goal-for and goal-against team buttons stay in the overflow row.
- The sheet table stays under the rows in the ledger table style.

### 5.3 Ledger ground

**Ratings board** (`MatrixView.vue`, `MatrixBoard.vue`, canvas 1c·1)

- Page header: "Competitive matrix" kicker in `--rule-strong`, "Player Ratings"
  heading, a hairline row with "{org} · {team}" and "{n} exercises · {n}
  players".
- The canvas's five sub-tabs become a segmented control under the header:
  Board, Exercise, Results, History, and Session entry for a coach. It switches
  the panels the view already renders rather than routing; Session entry links
  to the session route with the chosen exercise. Weights & standards, Squad
  report and Progress stay as outlined buttons in an actions row for a coach.
- The board is hairline rows under a `--rule-strong` header rule: rank in the
  heading face and `--mark`, recording number, name, points in the heading
  face, and sessions attended in `--ink-muted`. Every player, no minimum, no
  "others" row. Column headers stay buttons that sort.

**Exercise leaderboard** (`ExerciseLeaderboard.vue`, canvas 1c·2)

- Header: "Exercise · {measure}" kicker, exercise name, "Entered as {unit} ·
  weight {w} · standard {s}" line.
- For `time_bands` only, a `--rule-strong` bordered box: "Match-readiness
  standard, not a ranking" kicker, the count of players below in 34px, and the
  sentence "of {n} players are below the standard. The other {m} have cleared
  it." The figures come from `domain/matrix-threshold.ts`.
- Rows: recording number, name, the value in the heading face, and for a banded
  exercise the word "met" in `--ink-muted` or "△ below" in `--color-warning`.
  The word, not the colour, carries the state. Sorting is unchanged and the
  table is never narrowed.

**Player breakdown** (`PlayerBreakdownModal.vue`, canvas 1c·3) stays a modal
on the ledger dialog: "Recording no. {rec} · shirt {n}" kicker, name heading,
standing, points and sessions as three figures under a hairline, "Across the
exercises" kicker, one row per exercise with the value, the rank or "met" mark
and the note sentence `domain/matrix-breakdown.ts` already produces. The
progress box shows `domain/progress.ts`'s single-reading message verbatim when
there is one reading.

**Results panel, session history, weights, squad report, progress** take the
ledger tokens and table style without layout change. The progress chart keeps
dropping absences.

**Season report** (`SeasonReportScreen.vue`) is the ledger table full screen,
minutes beside every rate, every player present, with a back link to the
schedule.

**Session entry** (`SessionEntryScreen.vue`, canvas 2a)

- Top bar: "Session entry · {date}" kicker, exercise name heading, and "Sort:
  {name | recording no.} ▾" which toggles the sort.
- The format banner, `--rule-strong` bordered: for `time_bands` the figure
  "m:ss" and "Minutes and seconds — 10:41. This exercise is banded, not a
  sprint."; for `time_low` the figure "0.00" and "Decimal seconds — 4.85. A
  colon is refused here, not silently read as a time."; for `count_high` the
  figure "count" and "Repetitions — whole numbers."; nothing for `win_loss`,
  whose field is the result select.
- The date input and the jump box move under the banner in one row.
- Header row under a `--rule-strong` rule: No, Player, and Time, Secs, Count or
  Result by measure.
- Rows: recording number in the heading face, name with the attendance state
  beneath in 10px uppercase ("present", "present · timed" in `--live`,
  "absent" in `--color-warning`, "incomplete" or "reads as text" in
  `--color-danger` from the existing parser feedback), and the entry field:
  84px wide, 48px tall, right-aligned, `inputmode="numeric"` for bands,
  `"decimal"` for seconds and counts. The attendance `<select>` stays, as a
  small control after the field, so an absence can still be marked without a
  value. The band feedback ("earns 3 of 5") stays beside the field for a banded
  exercise.
- Enter moves to the next field in the order shown; typing marks present; no
  interruption between rows. These are the existing behaviours and their
  tests move with the component unchanged.
- Footer bar: "{n} timed · {n} absent · {n} to go" in tabular figures and the
  Save session button, 48px, outlined `--live`.
- A refused save shows the card from canvas 2a·2: `--color-warning` bordered,
  "Refused" kicker, the store's error text in the body, and "Your times are
  still in the fields above. Retry, or send this wording to your admin." The
  fields keep their values. The canvas's "12 rows written, 2 refused" partial
  state is not shown: the store writes a session as one unit and cannot report
  a partial result, so claiming one would be invented.

### 5.4 Dialogs

`BaseModal.vue` keeps its focus, Escape and scroll behaviour and takes the
ground's dialog: `--surface` panel, hairline border, `--shadow-md`, the title in
the heading face. Under 640px it stays a bottom sheet. Every remaining modal
picks this up without change; their own scoped styles are updated to the
tokens as their phase reaches them.

## 6. Widths

- Under 768px: the canvas layouts, 18–20px side padding, the bottom bar.
- 768px and above: the top nav; content in a centred measure of 64rem for the
  tables and 40rem for reading pages; the roster becomes a card grid of
  `minmax(14rem, 1fr)`; the ratings board and season report use their full
  column set; the lineup pitch grows to 480px tall with the bench beside it.
- Tables that carry meaning in every column (the board, the season report, the
  sheet) never hide a column; under 768px they scroll horizontally inside
  their own container with the name column sticky.

## 7. Retiring the legacy stylesheet

- `styles.css` is deleted and its link removed from `index.html`.
- The nineteen classes still referenced from Vue components (`btn`,
  `drill-duration`, `filter-chip`, the nine `help-*` classes, `lineup-pitch`,
  `nav-item`, `nav-toggle`, the four `pm-*` classes, `progress-chart`) move
  into the scoped styles of the one component that uses each, restated in the
  tokens.
- The `.text-gold`, `.text-cyan`, `.text-muted`, `.text-gradient` and
  `.brand-font` helpers in the old `index.css` are dropped; nothing in `src/`
  uses them.
- `--bhs-*` names are aliased to the new tokens in `index.css` from phase 1 and
  deleted in phase 5, after the last scoped style has been rewritten. A grep
  for `--bhs-` in `src/` returning nothing is the exit condition.

## 8. Testing

The existing suite (2,300 tests) stays green throughout. Tests change only
where the DOM contract changes:

- `AppNav.test.ts`: the drawer becomes the More sheet; the toggle appears only
  when more than five items are visible, so the guest cases assert its
  absence and the coach cases assert the sheet lists the overflow.
- The four modal tests are renamed with their components and mount the screen
  directly instead of through `open`.
- `ScheduleView.test.ts` and `MatrixView.test.ts` assert `RouterLink`s to the
  new routes where they asserted modal state.

New tests, framework-free unless stated:

- `domain/theme.test.ts`: `contrastRatio` on known pairs; `guardedMark`
  returns the colour above 3:1 and the fallback below; `themeVars` emits the
  four properties.
- `router/ground.test.ts`: `groundFor` for each name, for undefined, and for an
  unknown string.
- `domain/nav-bar.test.ts`: `barItems` with four, five and seven items.
- `domain/schedule.test.ts`: `shortCountdown` for days, hours, minutes, zero.
- `router/guards.test.ts`: the four new names for guest, player, coach, admin.
- Component tests for `LineupView`, `LiveMatchView`, `SeasonReportView` and
  `SessionEntryView`: mounted with a stubbed router and testing pinia, they
  assert the subject resolves from the route parameter, the refused state
  appears for an unknown id, and `close` navigates back. `LiveMatchView`
  additionally asserts the card title differs on `everStarted`.
- `App.test.ts`: the shell hides header, nav and footer on a `tool` route.

Verification per phase, by exit code: `npm test`, `npm run typecheck`,
`npm run build`. Each drawn screen is also opened in the in-app browser at
412px and compared with the canvas.

## 9. Sequencing

Five phases, each with its own implementation plan and commits. The app builds
and passes at the end of every phase.

1. **Foundation.** New `index.css`, fonts, grounds, `groundFor`, the contrast
   guard, renamed org properties with aliases, header, nav bar and More sheet,
   footer, tool chrome in `App.vue`, `styles.css` retired. Every view renders
   on paper with the new tokens and its old layout.
2. **Public screens.** Home, Schedule, Roster, the player detail, and the short countdown. — done 2026-09-07; the result word and the skill bars landed with it, and the white guard and the More sheet's keyboard handling from phase 1's review.
3. **Touchline routes.** Lineup, Live plus/minus and Season report as routes
   and screens on their grounds; Schedule links to them. — done 2026-09-07; the three screens share one ToolScreen frame, and matchById answers a stale bookmark.
4. **Ratings.** The board, the segmented control, the exercise leaderboard,
   the breakdown, the remaining ledger panels, and Session entry as a route. — done 2026-09-07; the panels became a segmented control rather than routes, and subjectState/ToolNotice replaced the duplicated route-view states phase 3 left behind.
5. **The rest.** Planner, Coaching Staff, Help, Quiz, Admin and the remaining
   modals on paper; the `--bhs-*` aliases removed. — done 2026-09-09; the shared paper primitives moved into index.css first, which turned each screen into a deletion, and `.plate` and `.kicker--accent` stopped being copied per component.

## 10. Out of scope

- Making Coaching Staff public.
- "Add to calendar" on a fixture.
- Reporting partial writes from session entry.
- Any change to stores, domain rules, the data layer or the database.
- The Classical system's own stylesheet and classes; the tokens are restated
  in `index.css` rather than imported, because that sheet is light-only and
  its class names collide with existing ones.
