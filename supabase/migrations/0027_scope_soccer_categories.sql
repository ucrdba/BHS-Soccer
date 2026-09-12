-- ═══════════════════════════════════════════════════════════════════════════
-- 0027: drill categories belong to an organization
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `soccer_categories` was a single global list. `name` is UNIQUE across the
-- whole table and the client upserts on that name, so:
--
--   * a club coach opening the categories editor sees Beaumont's categories;
--   * two organizations cannot both have a "Possession" — the second one to
--     save updates the first one's row, changing its description under them;
--   * deleting a category removes it from every organization at once.
--
-- `supabase_schema.sql` declares a `school_id` column, but PRODUCTION DOES
-- NOT HAVE IT: an earlier version of `upsertSoccerCategory` set it and every
-- call failed with 42703, which is documented at that method and mirrored in
-- `Resouces/SQL/demo/demo_schema.sql`, which drops the column explicitly to
-- match. So this adds the column rather than assuming it.
--
-- ── What happens to the rows that exist ────────────────────────────────────
--
-- Every existing category is COPIED TO EVERY ORGANIZATION, and the unscoped
-- originals are then removed.
--
-- The alternative — backfilling them all to Beaumont — is what the column
-- name suggests and is wrong: a club coach who added "Transition Play" to
-- what looked like their own list would lose it, and every club's editor
-- would open empty. Nothing in the table records who created a row, so there
-- is no way to tell a seeded category from one a club added. Copying means
-- nobody loses anything on the day this is applied, and the lists diverge
-- from here on, which is the behaviour that was wanted.
--
-- `drills_bank.category` is free TEXT, not a foreign key, so no drill is
-- affected either way — a drill keeps its category name whatever happens to
-- the row of the same name.
--
-- ── This must be applied BEFORE the client that reads it ───────────────────
--
-- `fetchSoccerCategories` filters on `school_id`, and PostgREST answers 42703
-- for a column that does not exist. Deployed against a database without this
-- migration, every category list reads as empty.

begin;

-- The SQL editor may run as a role that is a member of postgres without
-- defaulting to it; ALTER TABLE checks ownership rather than privilege.
set role postgres;

-- ── 1. The column ──────────────────────────────────────────────────────────

alter table public.soccer_categories
  add column if not exists school_id uuid references public.schools(id) on delete cascade;

-- Production's id carries no default, though supabase_schema.sql declares
-- `DEFAULT gen_random_uuid()` — the same drift as drills_bank.points. The copy
-- below inserts without an id and fails there with 23502, and so does every
-- category the app adds: upsertSoccerCategory sends no id either. A no-op
-- where the default is already set.

alter table public.soccer_categories
  alter column id set default gen_random_uuid();

-- ── 2. Stop the name being unique across the whole table ───────────────────
--
-- This has to come BEFORE the copy below, which deliberately creates rows
-- sharing a name — leaving it until afterwards makes the migration fail on
-- its own second row. The constraint's generated name is what
-- supabase_schema.sql's inline `UNIQUE` produced; the drop is written
-- defensively because an installation provisioned from a different script may
-- have named it otherwise.

alter table public.soccer_categories
  drop constraint if exists soccer_categories_name_key;

-- ── 3. Copy each unscoped category into every organization ─────────────────

insert into public.soccer_categories (school_id, name, description, is_deleted)
select s.id, c.name, c.description, coalesce(c.is_deleted, false)
  from public.soccer_categories c
 cross join public.schools s
 where c.school_id is null
   and not exists (
     select 1 from public.soccer_categories x
      where x.school_id = s.id and x.name = c.name
   );

-- The originals have been copied to every organization, so they belong to
-- none. Deleted outright rather than soft-deleted: a row with a null
-- school_id is unreachable by every read once the client filters on it, and
-- leaving it would keep the old global name collision alive.
delete from public.soccer_categories where school_id is null;

-- ── 4. Unique per organization instead ─────────────────────────────────────
--
-- Over every row, INCLUDING the retired ones, which is a deliberate choice
-- and not the obvious one. A partial index `where is_deleted is not true`
-- reads better -- a retired category should not reserve its name forever --
-- but PostgREST cannot upsert against a partial index: `on_conflict` emits a
-- bare `ON CONFLICT (school_id, name)`, Postgres cannot infer a partial index
-- from that, and every category save fails with 42P10.
--
-- The full index gives the better behaviour anyway. Re-adding a name that was
-- retired is the obvious thing a coach does after retiring one by mistake,
-- and with this index that save lands on the retired row and clears its
-- `is_deleted` -- the category comes back, with its new description, instead
-- of a second row appearing beside an invisible first.
drop index if exists soccer_categories_school_name_key;
create unique index soccer_categories_school_name_key
  on public.soccer_categories (school_id, name);

-- ── 5. Writes stay inside the writer's own organization ────────────────────
--
-- The client filter is a UI affordance; this is the enforcement. Reads stay
-- public, as they are for every other table here — the categories are not
-- secret, and the roster and schedule are readable by a signed-out visitor
-- too. What must not happen is a coach editing or retiring ANOTHER
-- organization's category, which is what the global unique name made easy.

drop policy if exists "soccer_categories_write" on public.soccer_categories;

create policy "soccer_categories_write" on public.soccer_categories
  for all
  using (
    public.current_profile_role() in ('coach', 'admin')
    and school_id = public.current_profile_school_id()
  )
  with check (
    public.current_profile_role() in ('coach', 'admin')
    and school_id = public.current_profile_school_id()
  );

commit;
