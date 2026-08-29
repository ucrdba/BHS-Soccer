-- supabase/migrations/0003_matrix_standings_view.sql
--
-- Standings derived from matrix_logs. Points are computed here (win 3, draw 1,
-- loss 0) rather than stored, so they cannot drift from the recorded outcome,
-- and correcting a mis-entered result re-derives every rank.
--
-- Ranking is by total points, tiebroken by percentage. Points measure
-- consistency (showing up and accumulating); percentage measures performance
-- and is displayed rather than ranked on, so a high percentage over few games
-- reads as a player who will climb once they play more.
--
-- security_invoker = true is REQUIRED. Without it the view runs as its owner
-- and bypasses the RLS on matrix_logs.
--
-- Rollback:
--   drop view if exists public.matrix_standings;

drop view if exists public.matrix_standings;

create view public.matrix_standings with (security_invoker = true) as
with sides as (
  select school_id,
         player_a_id as player_id,
         case outcome when 'a'    then 1 else 0 end as w,
         case outcome when 'draw' then 1 else 0 end as d,
         case outcome when 'b'    then 1 else 0 end as l
    from public.matrix_logs
   where coalesce(is_deleted, false) = false
  union all
  select school_id,
         player_b_id,
         case outcome when 'b'    then 1 else 0 end,
         case outcome when 'draw' then 1 else 0 end,
         case outcome when 'a'    then 1 else 0 end
    from public.matrix_logs
   where coalesce(is_deleted, false) = false
)
select player_id,
       school_id,
       sum(w)                as wins,
       sum(d)                as draws,
       sum(l)                as losses,
       count(*)              as games,
       3 * sum(w) + sum(d)   as points,
       -- nullif guards division by zero. The JavaScript this replaces computed
       -- wins/(wins+losses) and rendered NaN% for a player with no results.
       round(100.0 * (sum(w) + 0.5 * sum(d)) / nullif(count(*), 0), 1) as win_pct,
       rank() over (
         partition by school_id
         order by 3 * sum(w) + sum(d) desc,
                  (sum(w) + 0.5 * sum(d)) / nullif(count(*), 0) desc nulls last
       ) as rank
  from sides
 group by player_id, school_id;

grant select on public.matrix_standings to anon, authenticated;
