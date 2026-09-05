# Browser testing, and a public demo playground

**Status:** approved, not yet implemented
**Date:** 2026-09-04

## Why

Two problems that turn out to share an answer.

**The coach is tired of typing.** Looking at any populated screen — a season
report with real spread, a plus/minus sheet mid-match, a roster with numbers —
means filling forms by hand first, every time data is cleared or a new feature
needs something to render.

**The test suite has a shape of hole in it.** 1684 tests run under `vitest`
with `jsdom`: no browser, no layout, no CSS, no real DOM events. Over one week
every bug that reached the coach fell in that hole:

| Bug | Covered by the existing suite? |
| --- | --- |
| `pickColumn` called without `this`, so an import read no columns | No — nothing executes the import branch |
| The Plus/Minus option added to the Export dropdown instead of Template | No — a source scan counted two occurrences and passed |
| Plus/minus chips overlapping on the pitch | No — jsdom has no layout |
| Positions from an older layout restored from `localStorage` | No |
| The top banner naming a fixture that did not exist | No |

Every one is reachable by a real browser driving the real app. The logic
underneath was already covered; the wiring, the layout and the browser state
were not.

And a third thing, which arrived last and reshaped the rest:

**Prospective coaches need somewhere to try the product.** A playground they
can open, use as a coach, break, and come back to tomorrow to find fresh.

The three connect: seeding the app and testing it are the same clicks, and the
seeded result is what the playground is reset to.

## The playground changes where data lives

Strangers will create, edit and delete in the demo. That cannot happen in the
database holding real students' records — the organization dropdown alone
would show a visitor Beaumont's squads.

**So the demo gets its own Supabase project**, containing only invented
organizations. No Beaumont, no real names, nothing about a real minor.

This reverses an earlier decision in this document's first draft, which put
test data in a throwaway organization inside the production project. That is
adequate for a suite the coach runs himself; it is not adequate for a public
playground. Isolation has to be at the project boundary once strangers are
invited in.

**The cost, stated plainly:** every migration is applied twice by hand,
production and demo, forever — and the two will drift the first time one is
forgotten. There is no way around this while SQL is applied by hand, and it is
the price of the isolation rather than an oversight.

## The demo build

The same code as production. It differs in exactly two ways, both from
build-time environment variables, so neither can leak into the real site:

1. **It points at the demo Supabase project.**
2. **It signs in automatically** as a shared demo coach.

### Why auto sign-in rather than no auth at all

A visitor sees no login screen either way. But RLS is enforced by Postgres
against a real JWT, so a faked client-side session would render the coach UI
and then have **every write silently refused** — the worst possible outcome
for a playground whose entire purpose is playing.

Auto sign-in uses the ordinary sign-in path with credentials baked into the
demo build, so authentication behaves exactly as it does in production and the
divergence shrinks to one bootstrap call.

Publishing that password in a public bundle is acceptable **here and only
here**: the project holds nothing but invented data and is wiped nightly. It
must never be the pattern for anything else.

### The warning

The demo carries a persistent notice, not dismissible, in the banner strip at
the top of every page:

```
DEMO SITE — everything here is made up, and all data is
recreated nightly. Change anything you like.
```

Three jobs, and it needs all three. It stops a visitor mistaking the site for
their real program. It tells them the players and results are fictional. And
it invites them to break things, which is the point of a playground and is not
obvious without being said.

Rendered from the same demo flag as the rest, so it cannot appear on
production and cannot be missing from the demo.

## Resetting the playground

**Nightly, from a snapshot — not by driving the browser.**

Driving the UI nightly would be slow and flaky, and a reset that fails
silently leaves the playground in whatever state the last visitor left it. So:

1. The Playwright scripts seed the demo project once, through the real UI.
2. That state is dumped to `Resouces/SQL/demo_seed.sql`, which lives in the
   repo and can be read and reviewed.
3. A scheduled GitHub Action truncates the demo project's tables and restores
   that file. Deterministic, seconds rather than minutes, and re-runnable on
   demand when somebody leaves the playground in a mess.

The snapshot is regenerated deliberately, when the demo data should change —
not on every run, or the playground would drift with it.

## The tool

**Playwright**, Chromium only.

Chosen for reasons specific to this app rather than in general: it starts and
stops the dev server itself; it measures an element's real bounding box, which
is what turns "chips must not overlap" from arithmetic into an assertion; it
handles file uploads, which the CSV import needs; and it runs headed or
headless from the same script, so a failing test can be watched.

Cross-browser is deliberately out — one coach, one laptop, one phone. Three
engines would triple the runtime against a risk nobody has hit.

## The scripts

Each drives real screens in the order a coach would. Run in order they leave a
populated demo.

| Spec | What it types | What it proves on the way |
| --- | --- | --- |
| `auth` | Signs in | The session survives a reload |
| `roster` | ~24 invented players, recording and uniform numbers | Each appears with its numbers |
| `schedule` | A season of fixtures, home and away, with venue addresses | Dates render; the AWAY badge links only where an address exists |
| `lineup` | A default lineup and one per fixture | Eleven positions fill; a twelfth is refused |
| `session` | A practice session with matrix results | The leaderboard moves |
| `plusminus` | A tracked match — clock, substitutions, plus and minus, goals | Plus is refused while the clock is stopped; the pitch never holds twelve |
| `season` | Nothing; reads | Rates are per full match; sorting works; a player with no minutes shows a dash |
| `import` | Uploads a generated CSV through Admin → CSV | The row count matches; an unknown recording number is reported |

`npm run e2e:seed` runs them for the data. `npm run e2e` runs them as checks.
Same specs; the difference is whether a failure stops the run.

### Layout assertions

The ones jsdom cannot make, written against real boxes:

- No two plus/minus chips overlap, in any formation, at desktop and phone
  widths — replacing a modelled chip size that was wrong twice.
- The schedule's column headings sit over the columns they name.
- The season charts do not overflow their container.
- No page scrolls horizontally at 360px.

### Where they run

Against the local dev server by default, or against a deployed URL:

```
npm run e2e -- --base-url=https://bhssoccer-demo.vercel.app
```

The demo project is the only database they may write to. A shared fixture
asserts that before any script types anything, and fails the run otherwise —
scoping by convention is not scoping.

## Deployment

```
feature branch
     │  merge
     ▼
   demo  ──►  bhssoccer-demo.vercel.app     demo Supabase, auto sign-in, warning
     │  merge when happy
     ▼
   main  ──►  bhssoccer.org                 real Supabase, real sign-in
```

A second Vercel project, built from the `demo` branch, with its own
environment variables. The `demo` branch also serves as a rehearsal of the
deploy itself, since it is the same build pipeline.

Two pieces of dashboard work only the coach can do: creating the demo Supabase
project, and creating the demo Vercel project with its variables. Both get
written instructions rather than being assumed.

## Files

```
playwright.config.ts               dev server, base URL, Chromium
e2e/
  fixtures.ts                      sign-in, the demo-project guard
  data.ts                          the invented squad, fixtures, results
  auth|roster|schedule|lineup|session|plusminus|season|import|layout .spec.ts
src/demo.ts                        the demo flag, auto sign-in, the warning
Resouces/SQL/
  demo_schema.sql                  every migration, concatenated, for a fresh project
  demo_seed.sql                    the snapshot the nightly reset restores
.github/workflows/demo-reset.yml   the nightly job
.env.example                       variable names, no values
```

## Risks, stated plainly

**Migrations applied twice, forever.** The largest ongoing cost, and the
likeliest thing to go wrong. Mitigated only by `demo_schema.sql` being
regenerated from the migration files rather than maintained by hand.

**A password in a public bundle.** Safe only because that project holds
nothing real. Worth a comment at the point it appears so nobody copies it.

**Install size and runtime.** Playwright downloads roughly 150 MB of browser.
The suite drives a real browser against a live database: minutes, not seconds.
This is why it is not on every change.

**Flakiness.** Network-bound tests fail occasionally for reasons that are not
bugs. Mitigated by auto-waiting and by asserting on what a coach would look at
rather than on timing.

**A stale demo branch.** `demo` drifts behind `main` unless merged.

## Success

The coach runs one command and gets a populated site to look at, without
typing anything.

A prospective coach opens a link, is a coach immediately, can break whatever
they like, and finds it fresh tomorrow — never once touching a real student's
record.

The bugs in the table at the top would have been caught before the coach saw
them, with the honest exception of "the bold headings make GD hard to read",
which is a judgement about a typeface that no assertion replaces.
