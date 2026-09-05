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
can open, make an account on in seconds, fill with their own team, break, and
come back to later the same day with their work still there.

The three connect: seeding the app and testing it are the same clicks, and the
seeded result is the template every visitor's playground is copied from.

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
The version number on the home page can be compared to see they are in sync


## The demo build

The same code as production. It differs in exactly two ways, both from
build-time environment variables, so neither can leak into the real site:

1. **It points at the demo Supabase project.**
2. **It enables demo mode** — self-serve accounts, the warning, and the
   expiry notice.

### Visitors make their own account

A prospective coach picks a username and a password and is a coach
immediately. No email confirmation, no waiting for an admin to approve them,
no shared login.

**"Without authentication" means without the friction, not without a
session.** The demo project runs ordinary Supabase Auth. What differs is that
email confirmation is off and a trigger marks every new profile
`role = 'coach'`, `status = 'active'` on creation. Production keeps its
pending-approval flow untouched — the difference is a migration applied to the
demo project only, not a branch in the app.

This matters because RLS is enforced by Postgres against a real JWT. A faked
client-side session would render the coach UI and then have **every write
silently refused**, which is the worst possible outcome for a playground whose
entire point is playing. A real account makes every write behave exactly as it
does in production.

It also removes something the earlier draft had to apologise for: no shared
password is baked into a public bundle, because there is no shared account.

**A username is not an email address.** Supabase Auth requires one, so a
chosen username is stored as `<username>@demo.invalid`. It can never receive
mail, which is correct — nothing on the demo should ever send any. The visitor
never sees the synthetic address; they sign back in with the username they
chose.

### Each visitor gets their own copy

On signup, the template organization is cloned: a new organization owned by
that visitor, with its own teams, players, fixtures and results copied from
the template. They can rename, delete, re-import and generally wreck anything
without another visitor noticing, and without touching the template.

This is what makes the playground usable by two people at once, and it is why
the reset deletes accounts rather than wiping the database.

### The warning

A persistent notice, not dismissible, in the banner strip on every page:

```
DEMO SITE — everything here is made up. Your data is deleted
48 hours after you create your account. Change anything you like.
```

Four jobs, and it needs all four. It stops a visitor mistaking the site for
their real program. It says the players and results are fictional. It states
the expiry, in hours, before they invest an evening in it. And it invites them
to break things, which is the point of a playground and is not obvious unless
said.

Rendered from the same demo flag as the rest, so it cannot appear on
production and cannot be missing from the demo.

## Resetting the playground

**Expiry, not a nightly wipe.**

Wiping everything on a schedule would delete a visitor's work in the middle of
their evaluation, which is the opposite of what was asked for. Instead:

- Each visitor organization carries the moment it was created.
- A scheduled job deletes organizations **older than 48 hours**, and the
  accounts that own them.
- The **template organization is never touched**, and is what each new signup
  is cloned from.

48 hours because a coach who tries this in the evening comes back after school
the next day, which is when they actually have time. Twenty-four would delete
their work exactly then, and that reads as the product losing data rather than
as a demo expiring.

The template itself is seeded once by the Playwright scripts, dumped to
`Resouces/SQL/demo_seed.sql`, and restored only when the demo data should
deliberately change. A reviewable file in the repo rather than whatever state
a browser run happened to leave.

## Keeping it free, and bounded

The demo project stays on Supabase's **free tier, with no billing attached**.
Not as a cost preference but as a hard stop: anyone on the internet can create
an account here, and a project that cannot be billed cannot be made expensive.
Abuse degrades the demo instead of generating an invoice. Nothing about this
design may assume a paid feature.

That makes the free tier's limits the real constraint, so the design has to
stay inside them deliberately rather than by luck.

### A cap on live visitors

At most **N** visitor organizations may exist at once, where N is a setting
rather than a constant in the code:

- It lives in a `demo_settings` row in the demo database, so it can be changed
  without a rebuild or a deploy. A number that requires a deploy to change is
  a number nobody adjusts at the moment it matters.
- Signup counts the live, unexpired visitor organizations first. At the cap it
  refuses, and says something true and useful:

  ```
  The demo is full at the moment — it holds N programs at a time and
  they clear after 48 hours. Please try again a little later.
  ```

- The refusal happens in the database, not only in the page. A cap enforced
  only by the UI is not a cap, and this one exists to stop a script.

**N is a starting guess, deliberately low.** Ten is enough for a handful of
coaches evaluating at once and small enough that nothing approaches a free-tier
limit. It is a setting precisely because the right number is unknown until
somebody actually shares the link.

The two bounds work together: the 48-hour expiry limits how long anything
lives, and the cap limits how much exists at once. Either alone leaves a hole
— expiry without a cap allows a thousand signups in an hour, and a cap without
expiry fills permanently and then refuses everyone.

### What else the free tier forces

- **No scheduled jobs inside Supabase.** Expiry runs from a GitHub Action.
- **No email.** Nothing on the demo sends any, which the synthetic
  `@demo.invalid` addresses already guarantee.
- **Storage stays small.** Diagrams and photos are the only things that could
  grow; a visitor copy clones references rather than files.

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
Resouces/SQL/demo/
  demo_schema.sql                  every migration, concatenated, for a fresh project
  demo_auth_open.sql               DEMO ONLY: no confirmation, auto-approve
  demo_settings.sql                the cap on live visitors, and its default
  demo_seed.sql                    the template every visitor is cloned from
  demo_expire.sql                  deletes organizations older than 48 hours
.github/workflows/demo-expire.yml  the scheduled expiry job
.env.example                       variable names, no values
```

## Risks, stated plainly

**Migrations applied twice, forever.** The largest ongoing cost, and the
likeliest thing to go wrong. Mitigated only by `demo_schema.sql` being
regenerated from the migration files rather than maintained by hand.

**Anyone can create an account on the demo.** That is the point, and it is
also an open door. Bounded three ways: the 48-hour expiry, the cap on live
visitor organizations, and a free-tier project with no billing attached, so
abuse degrades the demo rather than generating a bill. None of the three is
sufficient alone.

**Auto-approval is a demo-only migration.** If it were ever applied to
production it would make every signup an instant coach. It must be named so
that mistake is hard to make, and must never appear in supabase/migrations/,
which is production's directory.

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

A prospective coach opens a link, picks a username and a password, and is
running their own copy of a program within a minute — no confirmation email,
no waiting to be approved. They can break anything, come back after school the
next day and find their work, and never once touch a real student's record.

The bugs in the table at the top would have been caught before the coach saw
them, with the honest exception of "the bold headings make GD hard to read",
which is a judgement about a typeface that no assertion replaces.
