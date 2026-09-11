-- demo_seed.sql — the sample program, and cloning it
--
-- ██ DEMO PROJECT ONLY. NEVER APPLY THIS TO PRODUCTION. ██
--
-- Applied by the nightly rebuild (scripts/demo-rebuild.mjs), after every
-- migration and before demo_accounts.sql. It defines:
--
--   demo_orgs                 which organization is the template, and which
--                             copy belongs to which demo account
--   demo_clone_manifest()     the tables a copy takes, in order
--   demo_clone_org()          the deep copy
--   demo_seed_template(date)  Riverside High School Hawks, a season in progress,
--                             dated relative to the day of the rebuild
--
-- Spec: docs/superpowers/specs/2026-09-11-demo-accounts-design.md §5.4.

begin;

set role postgres;

-- ─── 0. Refuse to run on production ────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.schools where code in ('bhs', 'lfc')) then
    raise exception
      'REFUSING TO RUN: this database contains Beaumont High School or Legends FC, so it is production. Check the project ref.';
  end if;
end $$;

-- ─── 1. Which organization is which ────────────────────────────────────────
--
-- One template, and one copy per demo account. Revoked from the API and given
-- RLS with no policies: nothing a visitor does should be able to read or change
-- which organization is whose.

create table if not exists public.demo_orgs (
  school_id  uuid primary key references public.schools(id) on delete cascade,
  kind       text not null check (kind in ('template', 'account')),
  account_no int check (account_no between 1 and 9),
  check ((kind = 'template') = (account_no is null))
);

create unique index if not exists demo_orgs_one_template
  on public.demo_orgs ((kind)) where kind = 'template';
create unique index if not exists demo_orgs_one_per_account
  on public.demo_orgs (account_no) where kind = 'account';

alter table public.demo_orgs enable row level security;
revoke all on table public.demo_orgs from anon, authenticated;

-- ─── 2. What gets cloned, in what order ────────────────────────────────────
--
-- A function rather than a comment so that demo_clone_org and the test read the
-- same list and cannot drift apart.
--
-- scope_column / parent_table say how to FIND a table's rows for one
-- organization:
--   parent_table null  -> rows where scope_column = the template's school id
--   parent_table set   -> rows whose scope_column is an id already cloned from
--                         that parent table
--
-- players is the odd one: it carries no organization column at all, so its rows
-- are reached through team_players. That is spelled out in demo_clone_org
-- rather than expressible here.
--
-- soccer_categories is here since migration 0027 gave categories a school_id:
-- each copy has its own list.

create or replace function public.demo_clone_manifest()
returns table (ord int, table_name text, scope_column text, parent_table text)
language sql
immutable
as $$
  values
    ( 0, 'soccer_categories',      'school_id',   null),
    ( 1, 'teams',                  'school_id',   null),
    ( 2, 'drills_bank',            'school_id',   null),
    ( 3, 'coaches',                'school_id',   null),
    ( 4, 'players',                null,          'team_players'),
    ( 5, 'team_players',           'team_id',     'teams'),
    ( 6, 'schedule',               'team_id',     'teams'),
    ( 7, 'practice_plans',         'team_id',     'teams'),
    ( 8, 'daily_thoughts',         'team_id',     'teams'),
    ( 9, 'drill_time_bands',       'team_id',     'teams'),
    (10, 'matrix_sessions',        'team_id',     'teams'),
    (11, 'matrix_logs',            'team_id',     'teams'),
    (12, 'quiz_attempts',          'team_id',     'teams'),
    (13, 'quiz_questions',         'school_id',   null),
    (14, 'team_quiz_questions',    'team_id',     'teams'),
    (15, 'quiz_answers',           'question_id', 'quiz_questions'),
    (16, 'stat_matches',           'team_id',     'teams'),
    (17, 'lineups',                'team_id',     'teams'),
    (18, 'matrix_session_results', 'session_id',  'matrix_sessions'),
    (19, 'stat_events',            'match_id',    'stat_matches'),
    (20, 'lineup_players',         'lineup_id',   'lineups'),
    (21, 'player_answers',         'attempt_id',  'quiz_attempts')
$$;

comment on function public.demo_clone_manifest() is
  'Ordered table list for demo_clone_org. Every table appears after everything '
  'it references. profiles, roles and team_coaches are deliberately absent: '
  'demo_accounts.sql writes each copy''s profiles and coaches itself.';

-- ─── 3. The deep clone ─────────────────────────────────────────────────────
--
-- The table list and its order are explicit (section 1). Everything else is
-- discovered from the catalog at runtime: each table's columns, its primary
-- key, and which of its columns are foreign keys. So a migration that adds a
-- column to players clones that column without an edit here, which matters
-- because this file is applied by hand and nobody will remember to.
--
-- Three rules do the remapping:
--
--   school_id            -> always the new organization
--   an FK to a table we cloned -> that table's mapping
--   an FK to a table we did NOT clone -> null
--
-- The third rule is what keeps matrix_logs.logged_by from pointing at a
-- profile in someone else's organization. The template has no profile, and the
-- visitor's does not exist yet at clone time.

create or replace function public.demo_clone_org(template_school uuid, new_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_school uuid;
  m          record;
  col        record;
  pk         text;
  orphan     uuid;
  select_list text;
  insert_list text;
  scope_sql  text;
  stmt       text;
begin
  if template_school is null then
    raise exception 'demo_clone_org: no template organization given';
  end if;

  -- The mapping from template row to cloned row, for this call only.
  --
  -- Dropped and recreated rather than created `if not exists`, and reached only
  -- through EXECUTE. `on commit drop` means the table is gone by the caller's
  -- next transaction while the session lives on, so a static reference to it in
  -- this function body would leave plpgsql holding a cached plan for a relation
  -- that no longer exists. Dynamic SQL is re-planned on every call.
  if to_regclass('pg_temp.demo_clone_map') is not null then
    -- to_regclass rather than `drop table if exists`, which raises a
    -- NOTICE about the missing schema on the session's first call.
    execute 'drop table pg_temp.demo_clone_map';
  end if;
  execute $t$
    create temporary table demo_clone_map (
      table_name text not null,
      old_id     uuid not null,
      new_id     uuid not null,
      primary key (table_name, old_id)
    ) on commit drop
  $t$;

  insert into public.schools (code, name, mascot, kind, city, colors, record, league)
  select
    'demo-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    new_name, s.mascot, s.kind, s.city, s.colors, s.record, s.league
  from public.schools s
  where s.id = template_school
  returning id into new_school;

  if new_school is null then
    raise exception 'demo_clone_org: template organization % not found', template_school;
  end if;

  for m in select * from public.demo_clone_manifest() order by ord loop

    -- The table's single-column uuid primary key, if it has one. Tables with a
    -- composite key (team_quiz_questions, matrix_session_results) get no new id
    -- and no mapping entry -- nothing references them.
    select a.attname into pk
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
     where i.indrelid = ('public.' || m.table_name)::regclass
       and i.indisprimary
       and array_length(i.indkey::int[], 1) = 1
       and format_type(a.atttypid, null) = 'uuid';

    -- How to find the template's rows for this table.
    if m.table_name = 'players' then
      -- No organization column at all: reached through team_players.
      scope_sql := format(
        'src.id in (select tp.player_id from public.team_players tp
                     join demo_clone_map cm on cm.table_name = %L and cm.old_id = tp.team_id)',
        'teams');
    elsif m.parent_table is null then
      scope_sql := format('src.%I = %L::uuid', m.scope_column, template_school);
    else
      scope_sql := format(
        'src.%I in (select old_id from demo_clone_map where table_name = %L)',
        m.scope_column, m.parent_table);
    end if;

    select_list := '';
    insert_list := '';

    for col in
      select c.column_name,
             c.is_nullable,
             fk.referenced_table,
             fk.referenced_column,
             fk.referenced_pk,
             fk.referenced_in_public
        from information_schema.columns c
        left join lateral (
          -- Any foreign key this column takes part in, composite keys included,
          -- and WHICH column of the parent it points at.
          --
          -- Both halves matter. team_players.team_id is constrained only by the
          -- two-column (team_id, school_id) -> teams (id, school_id) key, so a
          -- lookup that considered single-column keys alone would find nothing,
          -- copy the template's team_id verbatim, and raise 23503. And that
          -- same composite key points team_players.school_id at teams.school_id
          -- -- not a primary key, and not what demo_clone_map is keyed on -- so
          -- knowing the table alone is not enough to remap safely. conkey and
          -- confkey are unnested together and joined on ordinality to recover
          -- the column-to-column pairing.
          --
          -- Where a column sits in both a single- and a multi-column key, the
          -- single-column one wins: it names the parent's primary key directly.
          select tgt.relname                              as referenced_table,
                 ra.attname                               as referenced_column,
                 tgt.relnamespace = 'public'::regnamespace as referenced_in_public,
                 (select pa.attname
                    from pg_index pi
                    join pg_attribute pa
                      on pa.attrelid = pi.indrelid and pa.attnum = any(pi.indkey)
                   where pi.indrelid = tgt.oid
                     and pi.indisprimary
                     and array_length(pi.indkey::int[], 1) = 1
                     and format_type(pa.atttypid, null) = 'uuid')
                                                          as referenced_pk
            from pg_constraint co
            join pg_class src2 on src2.oid = co.conrelid
            join pg_class tgt  on tgt.oid  = co.confrelid
            join unnest(co.conkey)  with ordinality ck(attnum, ord) on true
            join unnest(co.confkey) with ordinality fkc(attnum, ord) on fkc.ord = ck.ord
            join pg_attribute a  on a.attrelid  = co.conrelid  and a.attnum  = ck.attnum
            join pg_attribute ra on ra.attrelid = co.confrelid and ra.attnum = fkc.attnum
           where co.contype = 'f'
             and src2.relname = m.table_name
             and src2.relnamespace = 'public'::regnamespace
             and a.attname = c.column_name
           order by array_length(co.conkey, 1), co.conname
           limit 1
        ) fk on true
       where c.table_schema = 'public'
         and c.table_name = m.table_name
         and c.is_generated = 'NEVER'
         and (pk is null or c.column_name <> pk)
       order by c.ordinal_position
    loop
      insert_list := insert_list || format(', %I', col.column_name);

      -- school_id is tested before the foreign keys deliberately. On
      -- team_players it is the other half of the composite key, where it
      -- references teams.school_id rather than a primary key and the mapping
      -- table holds no entry that could answer it. The new organization is the
      -- right answer on every table carrying the column.
      if col.column_name = 'school_id' then
        select_list := select_list || format(', %L::uuid', new_school);

      elsif col.referenced_table is null then
        select_list := select_list || format(', src.%I', col.column_name);

      elsif col.referenced_in_public
        and exists (select 1 from public.demo_clone_manifest()
                     where table_name = col.referenced_table) then

        -- demo_clone_map is keyed on the parent's single-column uuid primary
        -- key, so a reference to any other column of the parent cannot be
        -- answered from it. Stop loudly rather than remap it wrongly: whoever
        -- adds such a key needs to add a rule for it here.
        if col.referenced_pk is null or col.referenced_column is distinct from col.referenced_pk then
          raise exception
            'demo_clone_org: %.% references %.%, which is not the single-column uuid primary key demo_clone_map is keyed on. Remapping it is unsupported -- add an explicit rule.',
            m.table_name, col.column_name, col.referenced_table, col.referenced_column;
        end if;

        -- Look for a template row whose parent is NOT in the clone's scope
        -- before the insert turns it into a null. Without this the failure is
        -- either a bare 23502 raised from inside dynamic SQL with no hint which
        -- table or column produced it, or -- worse -- no failure at all and a
        -- visitor's copy quietly carrying a null where a pointer belongs.
        execute format(
          'select src.%I from public.%I src
            where %s
              and src.%I is not null
              and not exists (select 1 from demo_clone_map cm
                               where cm.table_name = %L and cm.old_id = src.%I)
            limit 1',
          col.column_name, m.table_name, scope_sql,
          col.column_name, col.referenced_table, col.column_name)
        into orphan;

        if orphan is not null then
          if col.is_nullable = 'NO' then
            -- Nothing sensible to write, and the clone runs inside
            -- handle_new_user, so this aborts the signup. Better a named error
            -- than a half-built organization.
            raise exception
              'demo_clone_org: %.% is NOT NULL and points at %.% row %, which is outside the template organization and so was not cloned. The template is inconsistent; fix the seed.',
              m.table_name, col.column_name, col.referenced_table, col.referenced_pk, orphan;
          else
            -- A nullable FK is ALLOWED to point outside the clone, and one
            -- really does: quiz_questions.school_id is nullable because the
            -- quiz bank is shared across organizations (see upsertQuizQuestion
            -- in src/data/supabase.ts), so a template attempt may answer a
            -- question no single organization owns. Failing a visitor's signup
            -- over that would be wrong. The pointer is dropped -- it cannot
            -- survive into a private copy without pointing at another
            -- organization's row -- but it is dropped audibly, so the seed's
            -- author sees it in the log instead of discovering it later.
            raise warning
              'demo_clone_org: %.% points at %.% row %, which is outside the template organization; the clone stores null there.',
              m.table_name, col.column_name, col.referenced_table, col.referenced_pk, orphan;
          end if;
        end if;

        select_list := select_list || format(
          ', (select cm.new_id from demo_clone_map cm
               where cm.table_name = %L and cm.old_id = src.%I)',
          col.referenced_table, col.column_name);

      else
        -- References something we did not clone (profiles), or something
        -- outside the public schema. Null rather than a pointer into another
        -- organization.
        select_list := select_list || format(', null::%s',
          (select format_type(a.atttypid, a.atttypmod)
             from pg_attribute a
            where a.attrelid = ('public.' || m.table_name)::regclass
              and a.attname = col.column_name));
      end if;
    end loop;

    if pk is null then
      -- Composite key: straight copy with the same remapping, no mapping row.
      stmt := format(
        'insert into public.%I (%s) select %s from public.%I src where %s',
        m.table_name, substr(insert_list, 3), substr(select_list, 3), m.table_name, scope_sql);
      execute stmt;
    else
      -- The source rows are aliased `src` inside the CTE as well as outside it:
      -- scope_sql and select_list are both written against that name, and the
      -- WHERE clause lands inside the CTE.
      stmt := format($f$
        with src as (select src.*, gen_random_uuid() as __new from public.%I src where %s),
        ins as (
          insert into public.%I (%I%s) select src.__new%s from src
        )
        insert into demo_clone_map (table_name, old_id, new_id)
        select %L, src.%I, src.__new from src
      $f$, m.table_name, scope_sql, m.table_name, pk, insert_list, select_list, m.table_name, pk);
      execute stmt;
    end if;

  end loop;

  return new_school;
end;
$$;

comment on function public.demo_clone_org(uuid, text) is
  'Deep-copies one organization. Tables and order come from '
  'demo_clone_manifest(); columns, primary keys and foreign keys are read from '
  'the catalog, so a new column clones without editing this function.';

-- None of these is an API. A function keeps EXECUTE for PUBLIC unless it is
-- taken away, and PostgREST publishes as an RPC anything anon can execute.
-- demo_clone_org is security definer: without this, the published anon key
-- could clone the template -- a schools row and twenty tables of copy -- as
-- often as it liked.
revoke all on function public.demo_clone_org(uuid, text) from public, anon, authenticated;
revoke all on function public.demo_clone_manifest()      from public, anon, authenticated;

commit;
