# Browser testing and a demo site

**Status:** approved, not yet implemented
**Date:** 2026-09-04

## Why

Two problems, one answer.

The coach is tired of typing. Looking at any populated screen — a season
report with real spread, a plus/minus sheet mid-match, a roster with numbers —
means filling forms by hand first, every time the data is cleared or a new
feature needs something to render.

And the test suite has a shape of hole in it. 1684 tests run under `vitest`
with `jsdom`: no browser, no layout, no CSS, no real DOM events. Over one week
of work every bug that reached the coach fell in that hole:

| Bug | Covered by the existing suite? |
| --- | --- |
| `pickColumn` called without `this`, so an import read no columns | No — nothing executes the import branch |
| The Plus/Minus option added to the Export dropdown instead of Template | No — a source scan counted two occurrences and passed |
| Plus/minus chips overlapping on the pitch | No — jsdom has no layout |
| Positions from an older layout restored from `localStorage` | No |
| The top banner naming a fixture that did not exist | No |

Every one is reachable by a real browser driving the real app. The logic they
sat on top of was already covered; the wiring, the layout and the browser
state were not.

The same scripts solve both problems, because seeding the app and testing it
are the same clicks. A script that adds twenty-four players is a script that
proves adding a player works.

## What this is not

Not a replacement for the `vitest` suite. That suite is fast, runs on every
change, and covers the pure logic — the replay engine, the per-match rates,
the import round trip. Browser tests are slow, need a database, and will be
run deliberately. They cover what the fast suite cannot reach.

Not visual regression. Screenshot diffing is famously noisy, and approving
diffs is more typing, which is the thing being removed.

Not continuous integration. There is no CI in this repo today, and a browser
plus a live database is the wrong first thing to put in one.

## The tool

**Playwright**, Chromium only.

Chosen over the alternatives for reasons that matter here rather than in
general: it starts and stops the dev server itself, it can measure an
element's real bounding box (which is what turns "chips must not overlap"
from arithmetic into an assertion), it handles file uploads, which the CSV
import needs, and it runs headless or headed from the same script, so the
same file can be watched when something looks wrong.

Cross-browser testing is deliberately out. One coach, one laptop, one phone;
three browser engines would triple the runtime for a risk nobody has hit.

## Where the data goes

**A throwaway organization inside the existing Supabase project.**

The scripts create and own **Test FC**, a club with **Test Varsity** and
**Test JV**. Everything they type belongs to it. Beaumont High School, REV
High School and Legends FC are never touched.

This was chosen over the two alternatives deliberately:

- Driving the app against the real Beaumont data would mean a buggy script
  edits real students' records. The database holds minors' names.
- A second Supabase project would be perfectly isolated, but every migration
  would have to be applied twice by hand, forever, and the two would drift
  the first time one was forgotten. This repo already applies migrations by
  hand; doubling that is a standing tax with a guaranteed failure mode.

The cost accepted: Test FC appears in the organization dropdown until it is
torn down.

### The guard

Scoping by convention is not scoping. Before any script types anything, a
shared fixture asserts that the active organization is the test one and fails
the run otherwise. A script that has somehow authenticated as a Beaumont
coach stops before it writes, rather than after.

## One-time setup, done by hand

Two steps, once. Both exist because of constraints that cannot be worked
around from here.

1. **Sign up a test coach through the UI**, with a throwaway address and a
   password kept in a gitignored `.env`. No agent here can create an
   `auth.users` row — there is no service key, only the publishable anon key.

2. **Run `Resouces/SQL/e2e_setup.sql`** in the Supabase SQL editor. It
   confirms and approves that account, sets its role to `coach`, creates Test
   FC and its two teams, and assigns the coach to both. Signup lands pending
   by design, and a pending profile can do nothing.

`Resouces/SQL/e2e_teardown.sql` removes the organization and everything under
it when it is no longer wanted.

## The scripts

Each is a Playwright spec that drives real screens in the order a coach would.
Running them in order leaves a populated Test FC.

| Spec | What it types | What it proves on the way |
| --- | --- | --- |
| `auth` | Signs in | The session persists across a reload |
| `roster` | ~24 players, recording and uniform numbers | Each appears on the roster with its numbers |
| `schedule` | A season of fixtures, home and away, with venue addresses | Dates render, the AWAY badge becomes a directions link only where an address exists |
| `lineup` | A default lineup and one per fixture | Eleven positions fill, a twelfth is refused |
| `session` | A practice session with matrix results | The leaderboard moves |
| `plusminus` | A tracked match — clock, substitutions, plus and minus, goals | Plus is refused while the clock is stopped; the pitch never holds twelve |
| `season` | Nothing; reads | Rates are per full match, sorting works, a player with no minutes shows a dash |
| `import` | Uploads a generated CSV through Admin → CSV | The row count matches, an unknown recording number is reported |

`npm run e2e:seed` runs them for the data. `npm run e2e` runs them as checks.
Same specs; the difference is whether a failure stops the run.

### Layout assertions

The ones the existing suite cannot make, written against real boxes:

- No two plus/minus chips overlap, in any formation, at desktop and phone
  widths. This replaces a modelled chip size that was wrong twice.
- The schedule's column headers sit over the columns they name.
- The season report's charts do not overflow their container.
- No page scrolls horizontally at 360px.

## The demo site

A standing **`demo`** branch with a stable Vercel preview URL.

```
feature branch
     │  merge
     ▼
   demo  ──►  demo-bhssoccer.vercel.app      (stable, shareable)
     │  merge when happy
     ▼
   main  ──►  bhssoccer.org
```

Vercel already builds every branch it receives; the reason no preview has
existed is that branches were merged locally and only `main` was ever pushed.
The change is to push the branch.

A standing branch was chosen over a preview-per-branch because the address
never moves, which is what makes it shareable with another coach without
handing them production.

**A demo deploy isolates code, not data.** It reads the same Supabase. The two
halves of this design are complementary and neither is sufficient alone: the
demo URL rehearses the deploy, Test FC keeps the data safe.

`npm run e2e -- --base-url=https://demo-bhssoccer.vercel.app` runs the suite
against the deployed demo rather than the local dev server, so the thing
tested is the thing that ships.

## Files

```
playwright.config.ts              dev server, base URL, Chromium
e2e/
  fixtures.ts                     sign-in, the test-organization guard
  data.ts                         the invented squad, fixtures, results
  auth.spec.ts
  roster.spec.ts
  schedule.spec.ts
  lineup.spec.ts
  session.spec.ts
  plusminus.spec.ts
  season.spec.ts
  import.spec.ts
  layout.spec.ts
Resouces/SQL/e2e_setup.sql        applied by hand, once
Resouces/SQL/e2e_teardown.sql     applied by hand, when finished
.env.example                      the variable names, no values
```

`.env` is gitignored. `.env.example` documents what is needed.

## Risks, stated plainly

**Install size.** Playwright downloads roughly 150 MB of browser.

**Runtime.** The suite drives a real browser against a live database over the
network. Minutes, not seconds. This is why it is not on every change.

**Flakiness.** Network-bound tests fail occasionally for reasons that are not
bugs. Mitigated by Playwright's auto-waiting and by asserting on what the
coach would look at rather than on timing.

**A stale demo branch.** `demo` drifts behind `main` unless merged. Worth a
line in the deploy notes rather than machinery.

**Test FC in the dropdown.** Visible to anyone signed in, until torn down.

## Success

The coach can run one command and get a fully populated Test FC to look at
without typing anything.

The bugs in the table at the top of this document would have been caught
before he saw them — with the honest exception of "the bold headings make GD
hard to read", which is a judgement about a typeface that no assertion
replaces.
