# Vue Migration Phase 4 — The Coach Planner and the Diagrammer

**Status:** proposed
**Date:** 2026-09-06
**Branch:** `feature/convertToVue`
**Follows:** `docs/superpowers/specs/2026-09-06-vue-phase-3-player-ratings-design.md`. Phase 3 is complete: six of the seven nav views are real, and Player Ratings reads and writes, at 2,502 tests.

## What this phase builds

The last placeholder route. A coach builds a practice session as a timeline of drills, saves it under a name, reloads it another day, prints it for the touchline, and draws each drill on a tactical board that animates through the steps.

## The shape of the problem

`public/js/views/planner.view.js` is 2,344 lines and `public/js/diagrammer.js` is 1,021 more. Together they are the largest single chunk left, and the reason Phase 4 sits this late.

But the planner file is not 2,344 lines of planner. It is a **grab-bag left over from the `app.js` split**, and reading it as one thing is the first mistake available:

| What is in the file | Where it belongs |
| --- | --- |
| Planner timeline, drills, saved plans, print, download | **This phase** |
| Diagrammer glue — attach, remove, tool, PNG | **This phase** |
| Drills bank / master drill library | **This phase** |
| Coaching Staff view and coach CRUD | **Already migrated**, Phase 2b. Dead weight here. |
| School profile forms, `updateHeaderBranding` | Phase 6, with the admin panel |
| Quiz — take, submit, leaderboard | Phase 5 |
| Round robin | Phase 5, with the match tools |

Roughly 900 of the file's lines are not this phase's work. Scoping by file would drag three unrelated surfaces forward and make the phase twice the size it needs to be.

## The thing to get right

**The diagrammer is an engine, and it should stop pretending to be a view.**

`SoccerTacticalBoard` is a competent 1,021-line canvas engine — elements, freehand paths, pitch types, undo, and keyframes that interpolate into an animation. Almost all of it is arithmetic and drawing. Its coupling to the page is **six lines**:

- `init(canvasId)` looks the canvas up by id.
- `updateToolbarUI()` queries `.diagrammer-toolbar .tool-btn` and sets classes.
- `updateTimelineUI()` writes `innerHTML` for the keyframe buttons — with `onclick="app.diagrammer.goToKeyframe(…)"` baked into the string.
- It reads `this.app.masterDiagrammer === this` to decide **which set of element ids to write to**, because there are two boards on the page.
- One `document.activeElement` check, to avoid stealing Delete from a text field.

That last-but-one is the tell. The engine knows there are two instances and hard-codes both sets of ids, which is what happens when a class is asked to render its own controls. In Vue the toolbar and the timeline are just state, so:

**The port drops the UI methods entirely and gains a change callback.** `onChange` fires when the tool, the pitch, the frame list or the play state moves; the component renders from it. `init` takes the canvas element rather than an id, and the `masterDiagrammer` check disappears along with the ids it selected between — two boards become two component instances, which is what they always were.

What must not change is the **serialization**. `exportDiagramData()` and `loadDiagramData()` define the `diagram_data` blob already stored against every drill and practice-plan item in Postgres. A rebuild that writes a subtly different shape orphans every diagram a coach has drawn, and nothing on screen would say so until they opened one. So the port keeps that shape byte-for-byte, and a test loads a real exported blob and asserts the round trip.

## Decisions taken

**The engine is ported, not rewritten.** Two thousand lines of geometry that already work are not improved by being retyped. The port is mechanical — a class in `src/diagram/`, ids replaced by an element, UI methods replaced by a callback — and the tests come with it.

**The drawing routines come out as free functions.** `drawPitch`, `drawPath` and `drawElement` currently get called as `SoccerTacticalBoard.prototype.drawPitch.call(dummyBoard, …)` by the print path, which builds a fake `this` with just a `ctx` and a `pitchType`. That trick works and says exactly what these are: functions of a context, not methods. Extracting them makes the print path honest, and makes the pitch renderable in a test without a board.

**The phase splits in two, and the planner comes first.** 4a is the timeline, the drills and the saved plans; 4b is the board. The planner is usable without a diagram — that is how most sessions are written — and proving it first means the board is attached to a screen that already works.

**Times are recalculated, never typed twice.** `recalculatePlanTimelineTimes` reflows every drill's slot from the first one's start plus the durations, and it runs after every add, edit, delete and reorder. This is not cosmetic: the printed plan is read on a touchline against a watch, and a timeline whose third drill says 4:40 when the second ends at 4:45 is worse than no times at all.

**A reorder is a save.** The legacy drag handler writes the whole plan back to Postgres on drop. It has to: the order *is* the plan, and a coach who drags two drills and closes the tab has changed nothing otherwise.

**Print stays a rendered document, not a PDF library.** The existing path builds an HTML document with the diagram steps rasterized into it and hands it to the browser's own print dialog. That works, has no dependency, and prints correctly. Rebuilding it around a PDF library would be a new dependency for a worse result.

## What Phase 4a delivers

| Piece | Detail |
| --- | --- |
| Planner route | The timeline, replacing the placeholder |
| Drill CRUD | Add, edit, delete, with the start/end/duration arithmetic |
| Reorder | Drag, and a keyboard equivalent — see below |
| Saved plans | Save, load, rename, delete, copy to another team |
| Drills bank | The organization's library, and adding from it |
| Print and download | The rendered document, diagrams included |

**The reorder gets a keyboard path it does not have today.** Drag-and-drop is the only way to move a drill in the legacy planner, which means a coach on a phone at training — the actual setting — is dragging a list item with a finger, and anyone using a keyboard cannot reorder at all. Move-up and move-down buttons are two controls and remove both problems. The drag stays.

## What Phase 4b delivers

| Piece | Detail |
| --- | --- |
| `src/diagram/board.ts` | The engine, ported, with a change callback |
| `src/diagram/draw.ts` | `drawPitch`, `drawPath`, `drawElement` as free functions |
| `TacticalBoard.vue` | Canvas, toolbar and keyframe timeline |
| Attach to a drill | On a plan item and on a master drill |
| Animation | Play, pause, add and delete keyframes |

## Non-goals

**The quiz, the daily thoughts, the school profile forms and the round robin are not in this phase**, however much of `planner.view.js` they occupy. Moving them would be scoping by file rather than by surface.

**No schema change.** `practice_plans`, `drills_bank` and the `diagram_data` blob all exist and are already written by the legacy app.

**No change to the diagram format.** See above — it is the one thing in this phase that can silently destroy a coach's work.

**Nothing is deleted.** `public/js/`, `app.js` and `index.html` stay untouched until Phase 7, and the legacy planner keeps working throughout.

## Verification

- `npm test` passes, above the 2,502 Phase 3 ended with.
- `npm run typecheck`, `npm run build` and `check_syntax.ps1` pass, by exit code.
- `git diff` shows no change to `index.html`, `public/js/` or `app.js`.
- A diagram exported by the **legacy** board loads into the ported one and renders the same elements, drawings, pitch and keyframes.
- A plan saved in the Vue planner opens in the legacy one, and the reverse.
- The printed document contains every drill and every diagram step.
- A guest sees no planner; the route is coach-only.

## Risks

**The diagram blob is the sharp edge.** It is stored, it is not versioned, and a coach's drawings are unrecoverable if the shape drifts. Mitigated by porting the two serialization methods unchanged and pinning them with a fixture captured from the legacy board.

**The canvas is hard to test and easy to break.** Pointer maths, hit radii and the touch paths have no assertions on them today. The port should carry the geometry into testable functions where it can, and not pretend a jsdom canvas proves the rendering is right.

**The planner writes the whole plan on almost every action.** `saveFullPracticePlan` replaces the plan's items wholesale, so a partial local state written at the wrong moment truncates a session. Every write path needs the same "reload rather than patch" discipline the Matrix store settled on.
