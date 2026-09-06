# Vue Migration Phase 5 — The Match Tools

**Status:** proposed
**Date:** 2026-09-06
**Branch:** `feature/convertToVue`
**Follows:** `docs/superpowers/specs/2026-09-06-vue-phase-4-planner-design.md`. Phase 4 is complete: all seven nav views are real and the tactical board is ported, at 2,924 tests.

## What this phase builds

The tools a coach uses around a fixture rather than inside a screen: the lineup, the live plus/minus recorder, the season and squad reports, the progress chart, the round robin, and the recording numbers.

## The shape of the problem

Eight files, 3,753 lines — and **most of the logic is already extracted and tested.** Phase 0 pulled it into `src/domain/`, and `src/data/plus-minus.ts` and `src/data/season-stats.ts` predate even that:

| Module | Exports | Holds |
| --- | --- | --- |
| `domain/lineup.ts` | 18 | Formations, slots, drops, starters, bench, grading |
| `domain/plus-minus-court.ts` | 19 | Clock predicates, taps, drops, positions, columns, sort |
| `domain/round-robin.ts` | 8 | The pairing schedule, who has played, the CSV |
| `domain/progress.ts` | 5 | The series, the blocks, the report |
| `domain/season.ts` | 4 | Columns, sorting, the team's full-match length |
| `domain/recording-numbers.ts` | 3 | Proposing a block, the start, the roster order |
| `domain/report.ts` | 1 | The squad report |
| `data/plus-minus.ts` | 12 | **The replay engine** — every statistic is derived from events |
| `data/season-stats.ts` | 11 | Per-match and season aggregates |

**So this phase is mostly templates over tested modules.** That is what Phase 0 was for, and it is why a cluster this size can follow the diagrammer rather than precede it.

## These are not routes

Every one of them hangs off a screen that already exists in Vue, which is where the legacy app launches them from and where a coach looks for them:

| Tool | Launched from |
| --- | --- |
| Lineup | Schedule — a fixture, or a new one |
| Plus/Minus | Schedule — a fixture |
| Season report | Schedule |
| Squad report | Player Ratings |
| Progress report | Player Ratings |
| Round robin | Coach Planner |
| Recording numbers | Roster |

**No router changes.** Nothing here gets a URL, which is the decision taken at the start of this migration: the seven nav views get real URLs, and the thirty-six modals stay component state.

## The thing to get right

**A statistic may only be recorded while the clock is running.**

Not "has been started" — *running*. A clock stopped for half time, an injury, any break at all is as closed for recording as one that has never started.

This is not a nicety. Every plus/minus event is stamped with the match clock, and both playing time and goal difference are **derived from those stamps** rather than stored as counters. An event recorded while the clock is stopped is stamped at a minute that has already passed and attributed to whoever was on the pitch then, rather than to the players actually involved. Before kick-off it is worse: everything stamps at 0:00 and every player finishes the match credited with zero minutes.

In both cases the counters go up and the sheet looks right. **Nothing at the time reveals the damage.**

Two things stay outside the rule, and both matter:

- **Sending players on and off is not clock-dependent** and must keep working before kick-off, because arranging the starting shape is how a coach begins.
- **Starting the clock** obviously cannot be gated on the clock running.

The gate belongs at the single point where an event is appended, not in each gesture handler, so the variants cannot drift apart.

## The second thing to get right

**Low-minute players are the audience for these reports, not noise in them.**

High school soccer follows NFHS rules: substitution is unlimited and players may re-enter. Squads rotate far more heavily than professional football, a player's match is often several short spells, and much of the roster finishes any fixture well under a full match.

A coach reads these views **to decide who to give more minutes to**. Filtering out the fringe players removes precisely the players the report exists to inform a decision about, and does it invisibly.

The statistical concern is real — one plus in five minutes extrapolates absurdly — but the answer is to **show the uncertainty, not hide the player**: print the minutes beside the rate, weight a marker by them, or show a season figure that steadies as minutes accumulate. The coach can judge a noisy number as noisy. The report must not make that judgement for them.

**And a match is not ninety minutes.** High school games are 80 — two forty-minute halves — and club games vary by age group. `teams.match_minutes` holds it, `seasonFullMatchMinutes` reads it, and both `season-stats.ts` and `progress.ts` already normalise against it. A per-90 rate inflates every figure from an 80-minute game by an eighth, which breaks the one number a coach can check against their memory of the match — the number that earns the report its credibility. **No constant may be hardcoded**, and one organization can field teams playing different lengths.

## Decisions taken

**The phase splits in three, and plus/minus is on its own.** It is a third of the lines, it is the only live-input surface in the application, and it is the one where a mistake is silent. 5a is the lineup and the season report; 5b is plus/minus; 5c is the reports and the two utilities.

**Recording numbers are proposed, never assigned.** `proposeRecordingNumbers` suggests a block; the coach accepts it. They are assigned per squad in a block and must never change on their own — a number that moved would disagree with every paper sheet already written, and the Matrix and the session grid both read from those sheets.

**The replay engine is not touched.** `data/plus-minus.ts` derives every statistic from the event log, and the argument for that design is the same one the Matrix makes: correcting a mis-entered event re-derives everything. It is tested and it stays.

**The progress chart is drawn, not imported.** A charting library for a handful of line series is a dependency for a worse result, the same call the printed plan made about PDFs. `domain/progress.ts` already produces the series.

## What each part delivers

**5a — Lineup and the season report.** A formation, players dropped into slots, starters and bench, saved per fixture; and the season table, sorted, normalised against the team's own match length.

**5b — Plus/Minus.** The court, the clock, the taps that record, the substitutions, the undo. Events appended to Postgres and every figure replayed from them.

**5c — Reports and utilities.** The squad report, the progress chart, the round robin schedule and its CSV, and the recording-numbers block.

## Non-goals

**The quiz, the daily thoughts and the school profile forms are still not in scope.** They live in `planner.view.js` and `thoughts.view.js` by accident of the `app.js` split. The quiz is a player-facing surface and the profile forms are administration; they belong with Phase 6.

**No schema change.** `stat_matches`, `stat_events`, `lineups` and `teams.match_minutes` all exist.

**No new dependency.** No charting library, no date library.

**Nothing is deleted.** `public/js/`, `app.js` and `index.html` stay untouched until Phase 7.

## Verification

- `npm test` passes, above the 2,924 Phase 4 ended with.
- `npm run typecheck`, `npm run build` and `check_syntax.ps1` pass, by exit code.
- `git diff` shows no change to `index.html`, `public/js/` or `app.js`.
- **A statistic cannot be recorded while the clock is stopped**, asserted at the append point and through the UI.
- A substitution works before kick-off.
- No report filters a player out for having few minutes, asserted as an absence.
- Every rate is normalised against `teams.match_minutes`, not a constant.

## Risks

**Plus/minus is the only surface where the damage is silent.** Every other mistake in this migration shows up as a screen that looks wrong. Here the counters go up, the sheet reads correctly, and the minutes are wrong — discovered, if at all, weeks later when a season report disagrees with what the coach remembers.

**The legacy tests are the specification.** `plus-minus-gestures.test.ts` alone is 2,039 lines. They are legacy-coupled and will be retired at Phase 7, but what they assert is the behaviour, and anything they cover that the rebuild loses is a regression rather than a stale test.
