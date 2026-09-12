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

-- ─── 4. The sample program ─────────────────────────────────────────────────
--
-- Riverside High School Hawks, as 2026-09-05-demo-seed-data-design.md
-- describes, with two changes (spec §5.4): every date is relative to `as_of`,
-- so the season is always half-played whatever night the rebuild runs, and
-- there is one Matrix drill per measure, the match-readiness bands belonging to
-- the time_bands drill.
--
-- created_at is set explicitly and increases in the order things happened. The
-- app reads plus/minus events, fixtures and plan slots ordered by created_at,
-- and every row inserted in one transaction would otherwise share now().
-- demo_clone_org copies created_at verbatim, so the copies keep the order.

create or replace function public.demo_seed_match_events(
  match uuid, squad uuid[], score text, kickoff timestamptz
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  gf   int := split_part(score, ' - ', 1)::int;
  ga   int := split_part(score, ' - ', 2)::int;
  gf1  int := (split_part(score, ' - ', 1)::int + 1) / 2;
  ga1  int := split_part(score, ' - ', 2)::int / 2;
  nf   int := 0;
  na   int := 0;
  seq  int := 0;
  i    int;
  t    int;
  starters int[] := array[1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
begin
  -- Every event is stamped one second after the last, so the recorded order is
  -- the order they happened.

  -- First half.
  seq := seq + 1;
  insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
  values (match, null, 'clock_start', 0, 1, kickoff + make_interval(secs => seq));

  foreach i in array starters loop
    seq := seq + 1;
    insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
    values (match, squad[i], 'on', 0, 1, kickoff + make_interval(secs => seq));
  end loop;

  for t in 1..14 loop
    if t in (3, 7, 11) and nf < gf1 then
      nf := nf + 1; seq := seq + 1;
      insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
      values (match, null, 'goal_for', t * 100, 1, kickoff + make_interval(secs => seq));
    end if;
    if t in (5, 9, 13) and na < ga1 then
      na := na + 1; seq := seq + 1;
      insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
      values (match, null, 'goal_against', t * 100, 1, kickoff + make_interval(secs => seq));
    end if;
  end loop;

  -- 25 minutes: the first change.
  seq := seq + 1;
  insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
  values (match, squad[12], 'off', 1500, 1, kickoff + make_interval(secs => seq));
  seq := seq + 1;
  insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
  values (match, squad[13], 'on', 1500, 1, kickoff + make_interval(secs => seq));

  -- Half-time, exactly as the live screen records it: the clock stops, the
  -- period advances, and the clock starts again for the second half.
  seq := seq + 1;
  insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
  values (match, null, 'clock_stop', 2400, 1, kickoff + make_interval(secs => seq));
  seq := seq + 1;
  insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
  values (match, null, 'period', 2400, 2, kickoff + make_interval(secs => seq));
  seq := seq + 1;
  insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
  values (match, null, 'clock_start', 2400, 2, kickoff + make_interval(secs => seq));

  -- Second half: four more changes, three of them late, so the squad report
  -- has players with 12, 6 and 5 minutes -- the players it exists for.
  nf := 0; na := 0;
  for t in 25..47 loop
    if t in (27, 33, 39) and nf < gf - gf1 then
      nf := nf + 1; seq := seq + 1;
      insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
      values (match, null, 'goal_for', t * 100, 2, kickoff + make_interval(secs => seq));
    end if;
    if t in (29, 35, 41) and na < ga - ga1 then
      na := na + 1; seq := seq + 1;
      insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
      values (match, null, 'goal_against', t * 100, 2, kickoff + make_interval(secs => seq));
    end if;
    if t in (30, 36, 42, 45) then
      seq := seq + 1;
      insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
      values (match, squad[case t when 30 then 5 when 36 then 8 when 42 then 10 else 11 end],
              'off', t * 100, 2, kickoff + make_interval(secs => seq));
      seq := seq + 1;
      insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
      values (match, squad[case t when 30 then 14 when 36 then 15 when 42 then 16 else 17 end],
              'on', t * 100, 2, kickoff + make_interval(secs => seq));
    end if;
  end loop;

  seq := seq + 1;
  insert into public.stat_events (match_id, player_id, kind, at_seconds, period, created_at)
  values (match, null, 'clock_stop', 4800, 2, kickoff + make_interval(secs => seq));
end;
$$;

create or replace function public.demo_seed_template(as_of date)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  sch     uuid;
  varsity uuid;
  jv      uuid;
  rivera  uuid;
  active_thought uuid;
  base    timestamptz;
  grad    int;

  v_first text[] := array['Mateo','Liam','Noah','Ethan','Lucas','Diego','Aiden','Caleb','Isaac','Owen',
                          'Julian','Adrian','Gabriel','Elijah','Samuel','Nathan','Andres','Kai','Jonah','Leo'];
  v_last  text[] := array['Alvarez','Brooks','Castillo','Dawson','Espinoza','Fletcher','Guerrero','Hayes','Ibarra','Jensen',
                          'Kowalski','Lindqvist','Montoya','Nakamura','Okafor','Pereira','Quinlan','Ramos','Sutherland','Tran'];
  v_pos   text[] := array['GK','GK','DEF','DEF','DEF','DEF','DEF','DEF','MID','MID',
                          'MID','MID','MID','MID','MID','FWD','FWD','FWD','FWD','FWD'];
  v_num   int[]  := array[1, 12, 2, 3, 4, 5, 6, 15, 7, 8, 10, 14, 16, 18, 20, 9, 11, 17, 19, 21];

  j_first text[] := array['Felix','Marco','Tyler','Rowan','Emilio','Jaden','Hugo','Omar','Theo',
                          'Rafael','Dylan','Miles','Tomas','Ezra','Victor','Cruz','Nico','Amir'];
  j_last  text[] := array['Uribe','Vance','Whitaker','Yamada','Zamora','Acosta','Bishop','Calloway','Delgado',
                          'Ellison','Farrow','Galvan','Holloway','Iverson','Jaramillo','Kessler','Lozano','Mercer'];
  j_pos   text[] := array['GK','GK','DEF','DEF','DEF','DEF','DEF','DEF','MID',
                          'MID','MID','MID','MID','MID','FWD','FWD','FWD','FWD'];
  j_num   int[]  := array[1, 13, 2, 3, 4, 5, 6, 22, 7, 8, 10, 14, 16, 23, 9, 11, 17, 19];

  opp      text[] := array['Canyon Ridge','Palm Valley','Mesa Verde','Lakeside','Cedar Hills','Harbor View',
                           'Sierra Vista','Oak Grove','Desert Springs','Valley Central','North Ridge','Pine Crest',
                           'Bay Point','Summit','Eastwood','Westfield'];
  v_scores text[] := array['3 - 1','1 - 1','2 - 0','0 - 1','4 - 2','2 - 2','1 - 0','0 - 2','3 - 0','2 - 1'];
  j_scores text[] := array['2 - 1','0 - 0','1 - 3','2 - 2','3 - 1','1 - 0','0 - 1'];

  session_drill text[] := array['Juggling Challenge','Small-Sided Games 3v3','30m Sprint',
                                'Three-Lap Standard','Juggling Challenge','Three-Lap Standard'];
  session_ago   int[]  := array[18, 18, 11, 11, 4, 4];

  plan_name  text[] := array['Tuesday - Possession Focus', 'Thursday - Match Prep'];
  plan1      text[] := array['Dynamic Warm-up','Juggling Challenge','Rondo 4v2','Small-Sided Games 3v3',
                             'Overlap and Cross','Crossing and Finishing','Corner Routines','Recovery Runs'];
  plan1_mins int[]  := array[15, 10, 15, 20, 15, 15, 10, 10];
  plan2      text[] := array['Dynamic Warm-up','30m Sprint','Rondo 4v2','1v1 to Goal',
                             'Pressing Triggers','Crossing and Finishing','Corner Routines','Three-Lap Standard'];
  plan2_mins int[]  := array[15, 10, 10, 15, 15, 15, 10, 15];

  q_text text[] := array[
    'When we lose the ball, what is our first job?',
    'How far apart should our back four stay when we are compact?',
    'Who calls the press?',
    'If the press is beaten, what do we do?',
    'How many players does each team have on the pitch?',
    'How long is a regulation high school match?',
    'The ball crosses the goal line, last touched by an attacker. What restarts play?',
    'When is a player in an offside position?'];
  q_correct text[] := array['A','B','A','B','C','B','B','B'];
  q_cat text[] := array['Tactical','Tactical','Tactical','Tactical','Rules','Rules','Rules','Rules'];
  q_expl text[] := array[
    'The first five seconds after losing it are when the other team is least organized.',
    'Ten to fifteen yards keeps the gaps too small to play through.',
    'The nearest player sees the trigger first; everyone else follows their lead.',
    'Chasing a beaten press leaves space behind us. Recover, get compact, press again.',
    'Eleven, one of them the goalkeeper.',
    'Eighty minutes, in two forty-minute halves.',
    'A goal kick. A corner is for a ball last touched by a defender.',
    'Nearer the goal line than both the ball and the second-last defender when the ball is played to them.'];
  q_ans text[] := array[
    'Press the ball and win it back', 'Drop to the halfway line', 'Wait for the midfield', 'Foul to stop the break',
    'As wide as the pitch', 'About ten to fifteen yards', 'Forty yards', 'It does not matter',
    'The nearest player to the ball', 'The goalkeeper only', 'The coach', 'Nobody',
    'Keep chasing the ball', 'Recover behind the ball and get compact', 'Stop running', 'Foul',
    'Nine', 'Ten', 'Eleven', 'Twelve',
    'Ninety minutes', 'Eighty minutes', 'Seventy minutes', 'Sixty minutes',
    'A corner kick', 'A goal kick', 'A throw-in', 'A drop ball',
    'Anywhere in their own half', 'Nearer the goal line than the ball and the second-last defender', 'Level with the last defender', 'When receiving a throw-in'];

  vp       uuid[] := '{}';
  fixture  uuid[] := '{}';
  qids     uuid[] := '{}';
  pid      uuid;
  fid      uuid;
  sid      uuid;
  mid      uuid;
  did      uuid;
  qid      uuid;
  aid      uuid;
  ms       text;
  att      text;
  pick     text;
  i        int;
  k        int;
  q        int;
  p        int;
  mins     int;
  start_m  int;
  correct  int;
  d        date;
  w  int;
  dr int;
  l  int;
begin
  if as_of is null then
    raise exception 'demo_seed_template: as_of is required';
  end if;
  if exists (select 1 from public.demo_orgs where kind = 'template') then
    raise exception 'demo_seed_template: a template already exists. The rebuild wipes the database before seeding.';
  end if;

  base := as_of::timestamptz - interval '150 days';
  -- The class that graduates next June: this calendar year before August,
  -- next year from August on.
  grad := extract(year from as_of)::int + case when extract(month from as_of) >= 8 then 1 else 0 end;

  -- The organization.
  insert into public.schools (code, name, mascot, kind, city, league, colors, created_at)
  values ('demo-template', 'Riverside High School', 'Hawks', 'school', 'Riverside, CA',
          'Inland Valley League', '{"primary": "#1F4E79", "secondary": "#F2A900"}'::jsonb, base)
  returning id into sch;
  insert into public.demo_orgs (school_id, kind) values (sch, 'template');

  -- 80 minutes, stated rather than left to the app's fallback: a high school
  -- match is 80 (0034), and the demo should show the column doing its job.
  insert into public.teams (school_id, name, season, is_public_default, match_minutes, created_at)
  values (sch, 'Varsity', to_char(as_of, 'YYYY'), true, 80, base)
  returning id into varsity;
  insert into public.teams (school_id, name, season, is_public_default, match_minutes, created_at)
  values (sch, 'JV', to_char(as_of, 'YYYY'), false, 80, base + interval '1 second')
  returning id into jv;

  insert into public.soccer_categories (school_id, name, description, display_order, active, created_at)
  select sch, c.name, c.descr, c.ord, true, base + make_interval(secs => c.ord)
    from (values
      (1, 'Warm-up',    'Activation and ball mastery before the main work.'),
      (2, 'Possession', 'Keeping the ball under pressure: rondos and positional games.'),
      (3, 'Attacking',  'Combination play and runs in behind.'),
      (4, 'Finishing',  'Shots, crosses and the final pass.'),
      (5, 'Defending',  'Pressing, cover and recovery runs.'),
      (6, 'Fitness',    'Match-readiness standards and sprint work.'),
      (7, 'Set Pieces', 'Corners, free kicks and throw-ins.')
    ) as c(ord, name, descr);

  insert into public.coaches (school_id, name, level, email, bio, created_at)
  values (sch, 'Dana Rivera', 'Head Coach', 'rivera@riverside.demo.invalid',
          'Twelve seasons in charge of the Hawks.', base)
  returning id into rivera;
  insert into public.coaches (school_id, name, level, bio, created_at) values
    (sch, 'Marcus Lee', 'Assistant Coach', 'Goalkeepers and set pieces.', base + interval '1 second'),
    (sch, 'Priya Shah', 'JV Coach', 'Runs the JV and the fitness standards.', base + interval '2 seconds');

  -- The squads. Recording numbers are a contiguous block per squad, assigned
  -- the way a coach assigns them -- not derived from shirt numbers.
  for i in 1..20 loop
    insert into public.players (name, first_name, last_name, class_year, height, created_at)
    values (v_first[i] || ' ' || v_last[i], v_first[i], v_last[i], (grad + i % 3)::text,
            format('%s''%s"', (66 + (i * 5) % 9) / 12, (66 + (i * 5) % 9) % 12),
            base + make_interval(secs => 10 + i))
    returning id into pid;
    insert into public.team_players (team_id, school_id, player_id, number, position, recording_number, created_at)
    values (varsity, sch, pid, v_num[i], v_pos[i], i, base + make_interval(secs => 10 + i));
    vp := vp || pid;
  end loop;

  for i in 1..18 loop
    insert into public.players (name, first_name, last_name, class_year, height, created_at)
    values (j_first[i] || ' ' || j_last[i], j_first[i], j_last[i], (grad + 2 + i % 2)::text,
            format('%s''%s"', (64 + (i * 5) % 9) / 12, (64 + (i * 5) % 9) % 12),
            base + make_interval(secs => 40 + i))
    returning id into pid;
    insert into public.team_players (team_id, school_id, player_id, number, position, recording_number, created_at)
    values (jv, sch, pid, j_num[i], j_pos[i], i, base + make_interval(secs => 40 + i));
  end loop;

  -- The season: ten Varsity results and six fixtures to come; seven and five
  -- for JV. Our score first, which is how parseScore reads it.
  for k in 1..16 loop
    d := case when k <= 10 then as_of - (11 - k) * 4 else as_of + (k - 10) * 4 end;
    insert into public.schedule (team_id, match_date, match_time, opponent, location, is_home, status, score, created_at)
    values (varsity, to_char(d, 'FMMON FMDD YYYY'),
            case when k % 2 = 1 then '6:00 PM' else '4:30 PM' end,
            opp[k],
            case when k % 2 = 1 then 'Riverside High Stadium' else opp[k] || ' High' end,
            k % 2 = 1,
            case when k <= 10 then 'COMPLETED' else 'UPCOMING' end,
            case when k <= 10 then v_scores[k] end,
            base + interval '1 minute' + make_interval(secs => k))
    returning id into fid;
    fixture := fixture || fid;
  end loop;

  for k in 1..12 loop
    d := case when k <= 7 then as_of - (8 - k) * 4 - 1 else as_of + (k - 7) * 4 + 1 end;
    insert into public.schedule (team_id, match_date, match_time, opponent, location, is_home, status, score, created_at)
    values (jv, to_char(d, 'FMMON FMDD YYYY'), '3:15 PM', opp[k],
            case when k % 2 = 0 then 'Riverside High Stadium' else opp[k] || ' High' end,
            k % 2 = 0,
            case when k <= 7 then 'COMPLETED' else 'UPCOMING' end,
            case when k <= 7 then j_scores[k] end,
            base + interval '2 minutes' + make_interval(secs => k));
  end loop;

  -- The record agrees with the results, because a record that contradicts the
  -- fixture list is the first thing a coach notices.
  select count(*) filter (where gf > ga), count(*) filter (where gf = ga), count(*) filter (where gf < ga)
    into w, dr, l
    from (select split_part(score, ' - ', 1)::int as gf, split_part(score, ' - ', 2)::int as ga
            from public.schedule where team_id = varsity and status = 'COMPLETED') s;
  update public.schools set record = jsonb_build_object('wins', w, 'draws', dr, 'losses', l) where id = sch;

  -- The drill bank: one Matrix drill per measure, then the rest. Three carry a
  -- diagram captured from the real board (Resouces/SQL/demo/demo_diagrams.json,
  -- substituted in by scripts/demo-rebuild-lib.mjs).
  insert into public.drills_bank (school_id, name, category, points, measure, coach_notes, diagram_data, created_at)
  values
    (sch, '1v1 to Goal',            'Attacking',  1.5, 'head_to_head', 'Attacker against defender, finish inside eight seconds.', '{}'::jsonb, base + interval '3 minutes 1 second'),
    (sch, 'Small-Sided Games 3v3',  'Possession', 1,   'win_loss',     'Four-minute games; winners stay on.', '{}'::jsonb, base + interval '3 minutes 2 seconds'),
    (sch, 'Juggling Challenge',     'Warm-up',    0.5, 'count_high',   'Most touches without a drop in sixty seconds.', '{}'::jsonb, base + interval '3 minutes 3 seconds'),
    (sch, '30m Sprint',             'Fitness',    1,   'time_low',     'Timed from a standing start; best of two.', '{}'::jsonb, base + interval '3 minutes 4 seconds'),
    (sch, 'Three-Lap Standard',     'Fitness',    1.5, 'time_bands',   'Three laps of the field. Under 4:30 is match-ready.', '{}'::jsonb, base + interval '3 minutes 5 seconds'),
    (sch, 'Rondo 4v2',              'Possession', 3,   'head_to_head', 'Two touches; a defender who wins it swaps with the passer.', __DEMO_DIAGRAM_RONDO__::jsonb, base + interval '3 minutes 6 seconds'),
    (sch, 'Overlap and Cross',      'Attacking',  3,   'head_to_head', 'Full-back overlaps the winger; cross before the byline.', __DEMO_DIAGRAM_OVERLAP__::jsonb, base + interval '3 minutes 7 seconds'),
    (sch, 'Crossing and Finishing', 'Finishing',  3,   'head_to_head', 'Near post, far post, cut-back: attack all three.', __DEMO_DIAGRAM_CROSSING__::jsonb, base + interval '3 minutes 8 seconds'),
    (sch, 'Dynamic Warm-up',        'Warm-up',    3,   'head_to_head', 'Mobility, then ball work, then short sprints.', '{}'::jsonb, base + interval '3 minutes 9 seconds'),
    (sch, 'Pressing Triggers',      'Defending',  3,   'head_to_head', 'Press on a back pass, a bad touch or a pass to the touchline.', '{}'::jsonb, base + interval '3 minutes 10 seconds'),
    (sch, 'Corner Routines',        'Set Pieces', 3,   'head_to_head', 'Three routines; the taker signals which.', '{}'::jsonb, base + interval '3 minutes 11 seconds'),
    (sch, 'Recovery Runs',          'Defending',  3,   'head_to_head', 'Sprint back goal-side of the ball when it is lost.', '{}'::jsonb, base + interval '3 minutes 12 seconds');

  -- The standard, per squad: bands everyone near match fitness clears.
  select id into did from public.drills_bank where school_id = sch and name = 'Three-Lap Standard';
  insert into public.drill_time_bands (drill_id, team_id, max_seconds, factor) values
    (did, varsity, 270, 1.0), (did, varsity, 300, 0.6), (did, varsity, 330, 0.25),
    (did, jv,      300, 1.0), (did, jv,      330, 0.6), (did, jv,      360, 0.25);

  -- Six Matrix sessions across three dates, one result per Varsity player.
  -- Some are excused or unexcused, so the attendance column is not uniform.
  for k in 1..6 loop
    select id, measure into did, ms from public.drills_bank where school_id = sch and name = session_drill[k];
    insert into public.matrix_sessions (team_id, drill_id, occurred_on, created_at)
    values (varsity, did, as_of - session_ago[k], base + interval '5 minutes' + make_interval(secs => k))
    returning id into sid;

    for i in 1..20 loop
      att := case when (i + k) % 17 = 0 then 'excused'
                  when (i + k * 3) % 19 = 0 then 'unexcused'
                  else 'present' end;
      insert into public.matrix_session_results (session_id, player_id, attendance, raw_value, outcome)
      values (sid, vp[i], att,
              case when att <> 'present' then null
                   when ms = 'count_high' then 8 + (i * 7 + k * 3) % 17
                   when ms = 'time_low'   then round(4.40 + ((i * 13 + k * 5) % 60) / 100.0, 2)
                   when ms = 'time_bands' then 240 + (i * 11 + k * 7) % 45
                   else null end,
              case when att = 'present' and ms = 'win_loss'
                   then (array['win','draw','loss'])[1 + (i + k) % 3] end);
    end loop;
  end loop;

  -- Head-to-head history for 1v1 to Goal: twenty pairings among the outfield
  -- players, with a score that agrees with the outcome.
  select id into did from public.drills_bank where school_id = sch and name = '1v1 to Goal';
  for k in 1..20 loop
    insert into public.matrix_logs (team_id, drill_id, player_a_id, player_b_id, outcome, score_text, occurred_on, created_at)
    values (varsity, did, vp[3 + k % 18], vp[3 + (k * 7 + 5) % 18],
            (array['a','b','draw'])[1 + k % 3], (array['3 - 2','1 - 3','2 - 2'])[1 + k % 3],
            as_of - 21 + (k % 3) * 7, base + interval '6 minutes' + make_interval(secs => k));
  end loop;

  -- Plus/minus for the four most recent results.
  for k in 7..10 loop
    insert into public.stat_matches (team_id, school_id, match_id, label, created_at, updated_at)
    select varsity, sch, s.id, s.opponent,
           base + interval '7 minutes' + make_interval(secs => k),
           base + interval '7 minutes' + make_interval(secs => k)
      from public.schedule s where s.id = fixture[k]
    returning id into mid;
    perform public.demo_seed_match_events(
      mid, vp,
      (select score from public.schedule where id = fixture[k]),
      (select match_on from public.schedule where id = fixture[k])::timestamptz + interval '18 hours');
  end loop;

  -- Two practice plans of eight slots, times reflowed from a 3:30 PM start in
  -- the format the planner writes: "3:30 PM - 3:45 PM", "15 min".
  for p in 1..2 loop
    start_m := 15 * 60 + 30;
    for k in 1..8 loop
      mins := case p when 1 then plan1_mins[k] else plan2_mins[k] end;
      insert into public.practice_plans (team_id, name, drill, time_slot, duration, coach_notes, diagram_data, created_at)
      select varsity, plan_name[p], db.name,
             to_char(time '00:00' + make_interval(mins => start_m), 'FMHH12:MI AM') || ' - '
               || to_char(time '00:00' + make_interval(mins => start_m + mins), 'FMHH12:MI AM'),
             mins || ' min', '', db.diagram_data,
             base + interval '8 minutes' + make_interval(secs => p * 10 + k)
        from public.drills_bank db
       where db.school_id = sch and db.name = case p when 1 then plan1[k] else plan2[k] end;
      start_m := start_m + mins;
    end loop;
  end loop;

  -- Three messages from the coach; the newest is the active one.
  insert into public.daily_thoughts (team_id, coach_id, coach_name, title, thoughts_text, is_active, created_at) values
    (varsity, rivera, 'Coach Rivera', 'Win the second ball',
     'Half of this game is decided by who reacts first to the ball nobody controls. Be first.',
     false, as_of::timestamptz - interval '14 days'),
    (varsity, rivera, 'Coach Rivera', 'Talk early, talk often',
     'A call that comes early saves a sprint later. Name the runner, name the space.',
     false, as_of::timestamptz - interval '7 days'),
    (varsity, rivera, 'Coach Rivera', 'Compact when we lose it',
     'When the ball goes, the first five seconds are ours. Press it, or get compact behind it. Never neither.',
     true, as_of::timestamptz - interval '1 day');
  select id into active_thought from public.daily_thoughts where team_id = varsity and is_active;

  -- The quiz: four questions on this week's message, four evergreen.
  for q in 1..8 loop
    insert into public.quiz_questions (school_id, question, correct_option, explanation, category, thought_id, created_at)
    values (sch, q_text[q], q_correct[q], q_expl[q], q_cat[q],
            case when q <= 4 then active_thought end,
            base + interval '9 minutes' + make_interval(secs => q))
    returning question_id into qid;
    qids := qids || qid;
    for k in 1..4 loop
      insert into public.quiz_answers (question_id, letter, answer_text, is_correct, ordinal)
      values (qid, chr(64 + k), q_ans[(q - 1) * 4 + k], chr(64 + k) = q_correct[q], k);
    end loop;
    insert into public.team_quiz_questions (team_id, question_id) values (varsity, qid);
  end loop;

  -- Six attempts, mostly right, so the results view has something in it.
  for i in 3..8 loop
    insert into public.quiz_attempts (player_id, player_name, started_at, completed_at, score, total_questions, team_id)
    select vp[i], pl.name,
           as_of::timestamptz - interval '20 hours' + make_interval(mins => i),
           as_of::timestamptz - interval '20 hours' + make_interval(mins => i + 4),
           0, 8, varsity
      from public.players pl where pl.id = vp[i]
    returning attempt_id into aid;

    correct := 0;
    for q in 1..8 loop
      pick := case when (i + q) % 4 = 0
                   then chr(65 + (ascii(q_correct[q]) - 65 + 1) % 4)
                   else q_correct[q] end;
      insert into public.player_answers (attempt_id, question_id, selected_option, is_correct)
      values (aid, qids[q], pick, pick = q_correct[q]);
      if pick = q_correct[q] then correct := correct + 1; end if;
    end loop;
    update public.quiz_attempts set score = correct where attempt_id = aid;
  end loop;

  return sch;
end;
$$;

comment on function public.demo_seed_template(date) is
  'Inserts the template organization, Riverside High School Hawks, with a '
  'season in progress as of the given date. Refuses if a template exists: the '
  'rebuild wipes the database first.';

-- None of these is an API. A function keeps EXECUTE for PUBLIC unless it is
-- taken away, and PostgREST publishes as an RPC anything anon can execute.
-- demo_clone_org is security definer: without this, the published anon key
-- could clone the template -- a schools row and twenty tables of copy -- as
-- often as it liked.
revoke all on function public.demo_clone_org(uuid, text) from public, anon, authenticated;
revoke all on function public.demo_clone_manifest()      from public, anon, authenticated;
revoke all on function public.demo_seed_template(date)                                 from public, anon, authenticated;
revoke all on function public.demo_seed_match_events(uuid, uuid[], text, timestamptz) from public, anon, authenticated;

commit;
