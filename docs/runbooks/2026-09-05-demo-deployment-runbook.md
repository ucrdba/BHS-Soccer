# Deploying the demo site

**Status:** ready to run
**Date:** 2026-09-05
**Who:** the coach — parts 2 and 3 are Vercel dashboard work nobody else can do

The demo is the same code as the real site. It differs in exactly two ways,
both from build-time environment variables, so neither can leak into
production:

1. it points at the demo Supabase project, and
2. it shows the permanent "everything here is made up" warning.

There is no branch in the application for demo mode beyond `src/demo.ts`. That
is the point: a conditional in a view is a conditional that can be wrong on
production, and the one thing that must never happen is the real site telling a
parent their child's record is invented.

```
feature branch
     │  merge
     ▼
   demo  ──►  bhs-soccer-demo.vercel.app     demo Supabase, self-serve accounts, warning
     │  merge when happy
     ▼
   main  ──►  bhssoccer.org                  real Supabase, real sign-in, no warning
```

---

## Before you start

Everything here is already done — this is the checklist, not work:

- [x] Demo Supabase project exists: ref `nzelhvipofeqoteewvhg`
- [x] Email confirmation is off (`mailer_autoconfirm` true) — visitor addresses
      are `<username>@demo.invalid` and can never receive mail
- [x] `Resouces/SQL/demo/demo_schema.sql` applied — 26 tables
- [x] `Resouces/SQL/demo/demo_auth_open.sql` applied — a probe signup came back
      `coach` / `active` / `can_write true`
- [x] The demo Supabase project has **no billing attached**. This is not a cost
      preference. Anyone on the internet can create an account there, and a
      project that cannot be billed cannot be made expensive: abuse degrades
      the demo instead of generating an invoice. Do not attach a card to it,
      and do not use a paid feature anywhere in the demo's design.

---

## Part 1 — Branches

The `demo` branch is the demo project's production branch, the way `main` is
the real site's.

1. Push the feature branch:

   ```bash
   git push -u origin feat/demo-site
   ```

2. Create `demo` from it and push:

   ```bash
   git checkout -b demo
   git push -u origin demo
   ```

`demo` doubles as a rehearsal of the real deploy, since it runs the same build
pipeline against the same `vercel.json`.

---

## Part 2 — Create the second Vercel project

The existing project (`bhs-soccer` → bhssoccer.org) is left completely alone.
This adds a second one from the same repository.

1. Go to https://vercel.com/new.

2. **Import the same Git repository** the production site uses. Vercel will
   warn that the repo is already connected to a project — that is expected and
   correct. Choose to create a new project anyway.

3. **Project Name:** `bhs-soccer-demo`. This becomes
   `bhs-soccer-demo.vercel.app`, matching how `bhs-soccer` became
   `bhs-soccer.vercel.app`.

4. **Framework Preset:** Vite. **Root Directory:** `./`. Leave the build and
   output settings alone — `vercel.json` already declares
   `npm ci` / `npm run build` / `dist`, and Vercel reads it from the repo.

5. **Before clicking Deploy, expand "Environment Variables"** and add all four.
   Adding them now avoids a first deploy that quietly points at production:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://nzelhvipofeqoteewvhg.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_l9J4lQrJ0CIMPgMBcn9siA_eTtEWmOY` |
   | `VITE_DEMO_MODE` | `true` |
   | `VITE_DEMO_EXPIRY_HOURS` | `48` |

   Apply each to **all environments** (Production, Preview, Development), so a
   preview deploy of this project also reaches the demo database rather than
   the real one.

   Two things about these values:

   - **The key is publishable by design.** It ships in the bundle, and RLS —
     not secrecy — is what protects the data. It is safe in this document. The
     demo project's `sb_secret_...` key is not, and must never appear in a
     `VITE_` variable, in the repo, or in the browser.
   - **`VITE_DEMO_MODE` must be the exact string `true`.** `TRUE`, `yes`, `1`
     and `true ` all leave demo mode off, deliberately: every accidental value
     fails closed onto the real site's behaviour.

6. Click **Deploy**.

---

## Part 3 — Point it at the `demo` branch

By default Vercel treats `main` as the production branch, which would deploy
the real site's code to the demo URL.

1. In the new project: **Settings → Git → Production Branch**.
2. Change it to `demo` and save.
3. **Deployments → the latest → ⋯ → Redeploy**, so the change takes effect.

---

## Part 4 — Verify

Do all of these. Step 3 is the one that matters: everything can look right
while the demo reads and writes the real database, because pointing at the
wrong project is not an error, just the wrong data.

1. **The site loads:** open https://bhs-soccer-demo.vercel.app.

2. **The warning is there**, above everything else at the top of the page:

   > DEMO SITE — everything here is made up. Your data is deleted 48 hours
   > after you create your account. Change anything you like.

   If it is missing, `VITE_DEMO_MODE` is not exactly `true`, or the deploy
   predates the variables being set.

3. **It is talking to the demo database.** Open DevTools → Console and look for:

   ```
   ⚡ Connected to Supabase Cloud Database: https://nzelhvipofeqoteewvhg.supabase.co
   ```

   **If that line names `arsigevpgpbqluqbnhjr`, stop.** The demo is pointed at
   production. Do not sign up, and do not share the link — a visitor's edits
   would land on real students' records. Fix the variables and redeploy.

4. **It is running the commit you think it is:**

   ```bash
   npm run deployed https://bhs-soccer-demo.vercel.app
   ```

5. **A real visitor journey works.** Sign up with a username you invent, and
   confirm all three:
   - you land as a coach without any approval step,
   - the organization is yours and named after you,
   - you can actually add a player. A write that is refused means the
     `team_coaches` row is missing, which is the failure `demo_auth_open.sql`
     exists to prevent.

6. **Production is untouched.** Open https://bhssoccer.org: no warning banner,
   and the console names `arsigevpgpbqluqbnhjr`. Then check its Vercel project
   has **no** `VITE_` variables at all.

---

## Standing rules

**Never add `VITE_DEMO_MODE` to the production project.** There is no
legitimate reason for it to exist there. If it is ever set, the real site tells
every parent, player and coach that the records they are reading are fictional.

**Every migration is applied twice, by hand, forever.** Production first, then
the demo. This is the largest ongoing cost of the demo and the likeliest thing
to be forgotten. Two things keep it honest:

- `npm run demo:schema` regenerates `Resouces/SQL/demo/demo_schema.sql` from
  the migration files, and `src/data/demo-schema.test.ts` fails if a migration
  exists that is neither included nor deliberately skipped.
- `npm run deployed` against both URLs shows whether the two sites are running
  the same commit.

**`demo` drifts behind `main` unless you merge.** After a release, merge `main`
into `demo` and push, or the demo slowly becomes a different product.

**Never apply `demo_auth_open.sql` to production.** It makes every signup an
instant active coach. It lives in `Resouces/SQL/demo/` and must never be copied
into `supabase/migrations/`, which is production's directory. Its section 0
refuses to run on a database containing Beaumont or Legends FC, but that is a
safety net, not a substitute for checking the project ref.

---

## If you need to take it down

- **Pause it:** in the demo Vercel project, Settings → General → **Pause
  Project**. The URL stops serving; nothing is lost.
- **Stop new signups without taking the site down:** set the cap to zero in the
  demo database. Existing visitors keep working until they expire.

  ```sql
  update public.demo_settings set max_live_orgs = 0;
  ```

- **Clear every visitor immediately**, keeping the template:

  ```sql
  delete from public.schools s
   where exists (select 1 from public.demo_orgs o
                  where o.school_id = s.id and o.kind = 'visitor');
  delete from auth.users u
   where u.email like '%@demo.invalid'
     and not exists (select 1 from public.profiles p where p.id = u.id);
  ```

- **Remove it entirely:** delete the `bhs-soccer-demo` Vercel project, then the
  demo Supabase project. Neither touches production, which shares only the Git
  repository.
