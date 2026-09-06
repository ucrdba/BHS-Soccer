# Vue Migration Phase 3 — Player Ratings

**Status:** proposed, awaiting approval
**Date:** 2026-09-06
**Branch:** `feature/convertToVue`
**Follows:** `docs/superpowers/specs/2026-09-05-vue-phase-2-public-views-design.md`. Phase 2 is complete: five of seven nav views are real, at 2,247 tests.

## What this phase builds

The Competitive Matrix — the first coach-only surface, and the reason the application exists rather than being a roster page. The overall board, the per-exercise leaderboard, the results a coach can correct, the session grid they record a whole squad in, and the weights and standards that decide what anything is worth.

## The thing to get right

**Not every exercise is asking the same question, and the screen has to know which is which.**

There are five measures, and they fall into two kinds:

| Measure | Kind | The question |
| --- | --- | --- |
| `head_to_head` | Competitive | Who beat whom, one against one |
| `win_loss` | Competitive | Who won the small-sided games |
| `count_high` | Competitive | Who did the most |
| `time_low` | Competitive | Who was fastest |
| `time_bands` | **Threshold** | **Did they meet the standard** |

The competitive measures are the Competitive Matrix proper: beating team-mates is the point, and spread across the squad is meaningful and desirable.

**`time_bands` is not that.** It is a fitness standard — the three-lap run, Cooper's, the beep test — used to check whether a player can last a full match. In the coach's own words, when most of the squad hit the top band:

> we are not trying to seperate anyone. Just measuring if they are fit. It's just a measurment we use to see if they can play a match for a full game.

A time is scored against **absolute standards**, taking the tightest band it still fits under, per squad. Seventeen of nineteen players on 1.0 is the **good** outcome, not a flat result needing correction.

**This changes what the screen should show.** For a threshold exercise the useful output is **who fell below the standard**, not who is at the top. Two players earning 0.5 and 0.25 under a 4:30 / 4:40 / 4:50 set are the signal; the seventeen on 1.0 need no attention. So:

- A `time_bands` leaderboard must make the players who **missed** the standard easy to find, rather than optimising for separating the ones who met it.
- Nothing in this phase may propose tightening bands to spread scores out, and no view should present a bunched threshold result as a problem.
- The competitive measures keep their ranking presentation unchanged. The distinction is the design, not an inconsistency.

**The emphasis is additive, and this is a condition of the change.** Asked to approve it, the coach's answer was *"as long as we can sort the time bands."* So highlighting who fell below a standard must **not** replace the sortable leaderboard with a curated "who missed" list, and must not remove or disable any column's sort. Every figure stays on screen, ordered however the reader chooses; the emphasis sits on top of that table rather than instead of it.

A test asserts every sort remains available on a `time_bands` exercise, so this cannot be lost to a later tidy-up.

## Decisions taken

**The phase splits in two, and the board comes first.** 3a is the board, the exercise leaderboard and the results panel — read-mostly, with one destructive action. 3b is the session grid and the weights editor, which are the hard part. Proving the read surfaces first means the grid is built against a screen that already shows its results correctly.

**The session grid keeps its keyboard.** It is bulk data entry: a coach with a clipboard entering twenty times in a row. `attachSessionKeys`, `sessionEntryFields` and `jumpToSessionPlayer` exist because tabbing through a sorted grid has to follow what the eye follows, not the roster order. Any rebuild that loses this makes the screen slower to use than paper, which is the standard it has to beat.

**Standards are per squad, and stay that way.** `drill_time_bands` is keyed on `(drill_id, team_id, max_seconds)`. A JV standard is not a Varsity standard, and a unique index stops two bands at one threshold making a score ambiguous.

**Recording numbers are displayed, never assigned here.** The grid and the board show the recording number because that is what the paper sheets carry, and the sheets are what the coach is reading from. Nothing in this phase changes one: they are assigned by the coach in a block per squad, and a number that moved on its own would disagree with every sheet already written.

**Phase 0's extraction is the foundation.** `domain/matrix.ts` and `domain/matrix-session.ts` already hold the board rows, both comparators, the leaderboard, the sort state, the session ordering and the attendance default — tested, framework-free. The components are templates over them, and anything still in the view that turns out to be logic gets extracted rather than reimplemented.

**Points are derived in Postgres, not stored.** `matrix_standings` and `matrix_exercise_points` are views over `matrix_logs` and `matrix_session_results`. The consequence worth stating: correcting a mis-entered result re-derives every rank, which is the whole argument for the results panel existing. A player with no logged results must still appear at 0/0/0 rather than vanishing, which is why the standings are left-joined onto the roster.

## What Phase 3a delivers

| Piece | Detail |
| --- | --- |
| The board | Every player, ranked, sortable by rank, points, share, name and number |
| Exercise leaderboard | One drill at a time, with the columns that measure actually has |
| Threshold presentation | For `time_bands`, who missed the standard, surfaced rather than buried |
| Results panel | Every logged result, with correction and deletion — coach only |
| Player breakdown | One player's results, phrased for the exercise they were in |

## What Phase 3b delivers

| Piece | Detail |
| --- | --- |
| Session grid | A squad's results for one exercise, entered in one pass |
| Keyboard entry | Tab and Enter following the visible order, jump-to-player |
| Attendance | Present, excused, unexcused — defaulting by measure |
| Weights editor | What each exercise is worth, and its measure |
| Standards editor | The time bands for the active squad |
| Session history | Past sessions, editable and removable |

## Non-goals

**The planner, the diagrammer and the admin panel are untouched.** Phases 4 and 6.

**No change to the scoring itself.** The `matrix_standings` view and the participation floor — `greatest(0.25, 1 - pr)`, so last place still beats a no-show — are correct and stay as they are. This phase renders what Postgres derives.

**Nothing is deleted.** `public/js/`, `app.js` and `index.html` stay untouched until Phase 7.

**No schema change.** Every table and view exists.

## Verification

- `npm test` passes, above the 2,247 Phase 2 ended with.
- `npm run typecheck`, `npm run build` and `check_syntax.ps1` pass.
- `git diff` shows no change to `index.html`, `public/js/` or `app.js`.
- A guest reaching `/matrix` is redirected, and a player sees the board but no coach controls.
- A coach can record a session, and the board reflects it after a reload — the only proof the write reached Postgres.
- A `time_bands` exercise shows who missed the standard without the reader having to scan for it.

## Risks

**This is the most heavily tested area of the app.** Twenty-four test files under `src/data/` touch the matrix and the session grid, covering keyboard navigation, attendance defaults, band drafts, sort order and column widths. They are legacy-coupled, so they are retired as their views are replaced — but what they assert is the specification, and anything they cover that the rebuild loses is a regression.

**The session grid is the highest-stakes screen for input speed.** Everything else in this migration can be a little slower without anyone minding. A coach entering twenty times against a stopwatch will notice immediately, and will go back to the legacy app — which is available and will keep working until Phase 7.
