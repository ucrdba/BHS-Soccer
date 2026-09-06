# Vue Migration Phase 4b — The Tactical Diagrammer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The canvas board — players, cones, balls, freehand arrows, pitch types, undo, and keyframes that animate — ported off the prototype and attached to a plan drill and to a library drill.

**Architecture:** `SoccerTacticalBoard` becomes a class in `src/diagram/` that owns a canvas element and nothing else. Its two DOM-rendering methods are replaced by one `onChange` callback; the toolbar and the keyframe timeline become Vue. The drawing routines come out as free functions so the print path can use them without a board.

**Spec:** `docs/superpowers/specs/2026-09-06-vue-phase-4-planner-design.md`

**Baseline:** 2,711 tests across 140 files, four gates green, at commit `8876e77`.

## The one thing that can destroy a coach's work

**`diagram_data` is stored, unversioned, and irreplaceable.** Every drill in `drills_bank` and every row in `practice_plans` can carry one, written by `exportDiagramData()` and read by `loadDiagramData()`. There is no migration path and no validation: a port that writes a subtly different shape orphans every diagram a coach has drawn, and **nothing on screen would say so** — the board would simply open empty.

So the serialization is not rewritten, it is moved verbatim, and it gets the strongest check available to this repo: `public/js/diagrammer.js` is loaded into the test with `?raw` + `new Function` (the shim `diagrammer-responsive.test.ts` already uses), a diagram is built on the **legacy** board, exported, and loaded into the **ported** one. If the two disagree the test fails. That is an agreement test in the same family as `time.ts` and `band-score.ts`, and it is the only kind of assurance worth having here.

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.** The legacy board keeps working; both apps read the same blob.
- **The `diagram_data` shape does not change.** Not a field, not a default, not a key order that a `JSON.stringify` comparison would notice.
- **No `'bhs'`, `Beaumont` or `Cougars` literal.**
- `typescript` stays 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Four gates, **checked by real exit code**.

## What a jsdom canvas can and cannot prove

`node-canvas` is not installed, so `getContext('2d')` returns null under jsdom. That rules out asserting on pixels, and pretending otherwise would produce tests that pass while the board renders nothing.

What it does **not** rule out is most of this phase. The geometry, the hit testing, the keyframe bookkeeping, the interpolation and the serialization are all arithmetic on plain objects, and they move into modules that are tested directly. The drawing functions take a context, so they can be handed a **recording stub** — an object collecting the calls made on it — which proves the pitch draws a centre circle and an element draws its number, without proving what either looks like. Say so in the tests rather than implying more.

---

### Task 1: `src/diagram/draw.ts` — the drawing routines as functions

They already behave as functions: the print path calls
`SoccerTacticalBoard.prototype.drawPitch.call({ ctx, pitchType }, w, h)`, building a fake `this` out of exactly the two fields they read. Making that honest is the whole task.

**Files:** Create `src/diagram/draw.ts` and its test.

**Interfaces:**
```ts
export type PitchType = 'full' | 'half' | 'thirds' | 'blank';

export function drawPitch(ctx: CanvasRenderingContext2D, w: number, h: number, pitchType: PitchType): void;
export function drawPath(ctx: CanvasRenderingContext2D, drawing: any): void;
export function drawElement(ctx: CanvasRenderingContext2D, el: any): void;
```

- [x] **Step 1: Write the failing test**

Against a recording stub. Cover: each pitch type draws a different set of calls, and `blank` draws the ground and no markings; an arrow draws its head as well as its line; a player draws its number and a ball does not; a selected element draws its highlight. Assert on the **calls made**, and say in the file comment that this proves the routine runs, not that the result looks right.

- [x] **Step 2: Move the bodies verbatim, watch the tests pass**

Verbatim: the numbers in these routines are a pitch's proportions, and "tidying" one moves a penalty spot.

- [x] **Step 3: Gates and commit**

---

### Task 2: `src/diagram/geometry.ts` — pointer maths

**Files:** Create `src/diagram/geometry.ts` and its test.

```ts
export function distToSegment(p: Point, v: Point, w: Point): number;
export function touchHitRadius(base: number): number;
export function isPointNearDrawing(pos: Point, drawing: any, maxDist?: number): boolean;
export function canvasPos(e: any, canvas: HTMLCanvasElement): Point;
```

- [x] **Step 1: Write the failing test**

- A point on a segment is at distance zero; beside it, the perpendicular distance; past its end, the distance to the nearer endpoint. A zero-length segment does not divide by zero.
- **A coarse pointer gets double the catchment.** 18px was measured against a mouse; a fingertip covers roughly 40px and you cannot see under it, so selecting a line on a phone becomes guesswork at the mouse radius. Test both branches by stubbing `matchMedia`.
- `canvasPos` scales by `canvas.width / rect.width`, because a board displayed smaller than its backing store would otherwise place every element at an offset that grows across the pitch.
- A touch event reads `touches[0]`; a mouse event reads `clientX`.

- [x] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 3: `src/diagram/frames.ts` — keyframes and the animation

The bookkeeping behind "the same players, one step later".

**Files:** Create `src/diagram/frames.ts` and its test.

```ts
export interface Keyframe { time: number; label: string; elements: any[]; drawings: any[] }

export function blankKeyframes(): Keyframe[];
export function reindexNumbers(elements: any[]): any[];
export function propagateForward(frames: Keyframe[], fromIndex: number): Keyframe[];
export function appendKeyframe(frames: Keyframe[], fromIndex: number): Keyframe[];
export function interpolateFrames(a: any[], b: any[], t: number): any[];
```

- [x] **Step 1: Write the failing test**

- **A player added on frame 2 appears on every later frame**, at the position it was added. Without that they pop into existence mid-animation, which reads as a bug in the diagram rather than in the tool.
- **Interpolation matches on id first**, then on type-and-number, then — for a ball only — on type. The fallbacks exist because a diagram drawn frame by frame has elements that are "the same player" without sharing an id.
- **A matched element interpolates; an unmatched one is carried at its own position** rather than vanishing mid-step.
- **An element only in the later frame is included**, so a player who joins the move appears.
- `t = 0` gives frame A exactly and `t = 1` gives frame B's positions.
- **Renumbering is per side and in array order**: attackers 1..n, defenders 1..n, and a goalkeeper or a cone is never numbered.
- The first frame is labelled as the start position and `blankKeyframes()` always returns exactly one.

- [x] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 4: `src/diagram/serialize.ts` — the blob, and the agreement test

**This is the task the phase turns on.** See the section above.

**Files:** Create `src/diagram/serialize.ts` and its test.

```ts
export interface DiagramData {
  keyframes: Keyframe[];
  currentFrameIndex: number;
  elements: any[];
  drawings: any[];
  pitchType: PitchType;
}

export function exportDiagram(state): DiagramData;
export function loadDiagram(data: any): { keyframes; currentFrameIndex; elements; drawings; pitchType };
```

- [x] **Step 1: Write the failing test, agreement first**

Load the legacy class with `?raw` + `new Function`. Build a board with two keyframes, some elements and a drawing, export it, and assert the ported loader reads back **exactly** what the legacy loader does — element positions, ids, numbers, colours, drawings, pitch type, frame index.

Then the loader's own cases:

- A **string** is parsed: the blob comes back from Postgres as JSON text often enough that this is the normal path, not the exception.
- Unparseable text loads an empty board rather than throwing, because a corrupt blob must not take the modal down with it.
- **A pre-keyframe diagram still opens.** Older blobs have `elements` and `drawings` and no `keyframes`; they become a single Time 0 frame. There are drills in the library from before keyframes existed.
- `null` gives one empty frame, not zero.
- `currentFrameIndex` is clamped: a blob saved on frame 3 whose frames were later cut must not index past the end.
- Export always writes the current frame back first, or the last thing the coach drew is missing from the save.

- [x] **Step 2: Move the bodies verbatim, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 5: `src/diagram/board.ts` — the engine

**Files:** Create `src/diagram/board.ts` and its test.

The port, mechanically:

- `init(canvas)` takes the **element**, not an id.
- `updateToolbarUI()` and `updateTimelineUI()` are **deleted**. One `onChange` callback fires when the tool, pitch, frame list, frame index or play state moves; the component renders from it.
- The `this.app.masterDiagrammer === this` check goes with them. It only existed to pick between two hard-coded sets of element ids; two boards are two component instances.
- `alert()` becomes a returned result. A modal cannot be styled, cannot be tested, and blocks the page.

- [x] **Step 1: Write the failing test**

- Placing a tool adds an element of that type at that position, numbered per side.
- Undo restores the previous state; the history is capped and drops the oldest.
- Deleting with nothing selected removes the **last** element — the legacy behaviour, and it is what a coach expects from a Delete key with no selection.
- **`onChange` fires on a tool change, a frame change and a play state change**, because that is the whole contract the component depends on.
- Playing needs two frames, and says so by returning a reason rather than calling `alert`.
- `resize` rescales every element by the same factor. Coordinates are canvas pixels, so a resize that does not rescale slides every player relative to the pitch — a diagram that still renders and no longer means what it did. (`diagrammer-responsive.test.ts` asserts this for the legacy board; the port needs its own.)

- [x] **Step 2: Port it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 6: `TacticalBoard.vue` and `DiagramModal.vue`

**Files:** Both components and their tests; wire into `PlannerView` and `DrillsBankModal`.

- [x] **Step 1: Write the failing tests**

- The toolbar marks the active tool, and picking one tells the board.
- The keyframe strip lists every frame, marks the current one, and moves the board when one is clicked.
- Play is disabled with one frame, with a title saying why — rather than offering a control that can only produce an error.
- Deleting the only keyframe is refused, and the reason is on screen instead of in an `alert`.
- **Saving a diagram writes it to the drill it was opened from**, and to `drills_bank` when opened from the library.
- The modal is coach-only.

- [x] **Step 2: Build both, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 7: Diagrams in the printed plan

`plan-print.ts` already takes rasterized steps keyed by drill name and leaves the rendering to its caller. This is that caller.

**Files:** `src/diagram/raster.ts` and its test; wire into `PlannerView.onPrint`.

- [x] **Step 1: Write the failing test**

```ts
export function renderStep(data: any, stepIndex: number, width?: number):
  { dataUrl: string; label: string } | null;
export function renderAllSteps(data: any, width?: number): { dataUrl: string; label: string }[];
```

- The native size is 800×480, and it is not a decoration: it is the interactive board's own aspect, and rendering at another one moves every element relative to the pitch.
- A step index past the end falls back to the top-level `elements`/`drawings` rather than throwing.
- A diagram with no keyframes renders one image.
- **Returns null when there is no canvas** — under jsdom, and in any browser that refuses one — so the print path drops the diagrams and still prints the plan.
- The step's label comes from the keyframe.

- [x] **Step 2: Write it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 8: Close out Phase 4

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat 1af3c90..HEAD -- index.html public/js app.js
```

- [ ] **Step 2: Update `CLAUDE.md`** — the diagrammer's two homes, what Phase 5 owes.

- [ ] **Step 3: Commit**

## Definition of done

- A diagram drawn on the **legacy** board opens in the ported one with every element, drawing, pitch and keyframe intact — asserted by a test, not by eye.
- A coach draws a drill in the Vue planner, saves it, and it is on the drill after a reload.
- Keyframes animate, and a player added on a later frame does not pop into existence.
- The board rescales with the viewport without moving anything relative to the pitch.
- Diagram steps appear in the printed plan.
- Four gates green by exit code; `git diff` shows no change to the legacy app.
