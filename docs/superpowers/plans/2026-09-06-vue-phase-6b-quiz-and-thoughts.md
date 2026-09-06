# Vue Migration Phase 6b — The Quiz and the Daily Thought

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The question bank in admin, taking a quiz at `/quiz`, and the daily thought on Home.

**Architecture:** One domain module for the marking, a store for the thought, and components. Every client method exists.

**Spec:** `docs/superpowers/specs/2026-09-06-vue-phase-6-admin-design.md`

**Baseline:** 3,242 tests across 166 files, four gates green, at commit `4b1f617`.

## The thing to get right

**A quiz is marked against the stored answer, never against a key in the code.**

The original `submitQuizAnswer` hardcoded `['B','A','A','B','C']` in the view. Editing a question in the database then silently broke the marking — a player answering correctly was told they were wrong, and the attempt was recorded that way. That has since been fixed in the legacy app, and the rebuild must not reintroduce it: the correct answer comes from the `quiz_answers` row flagged `is_correct`, falling back to `correct_option` for a question whose options are still columns.

**An attempt belongs to a person, so it needs a real one.** The legacy code guards this twice — in the opener and again in the submit — because a missing check writes a row attributed to a player who does not exist. The guard stays at the submit, which is the one door.

## The second thing to get right

**A question may name the daily message it tests, and is then asked only while that message is active.**

`fetchTeamQuiz` already does this: a question carrying a `thought_id` is filtered out unless it matches the team's active thought, and one naming no message is evergreen. That is what stops last week's questions testing a focus nobody remembers. The rebuild reads through that method rather than assembling its own list.

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.**
- **Never hardcode an answer key.** Marking reads the stored answer.
- **An attempt needs a signed-in person.**
- **No `'bhs'`, `Beaumont` or `Cougars` literal.**
- `typescript` stays 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Four gates, **checked by real exit code**.

---

### Task 1: `domain/quiz.ts` — the marking

**Files:** Create `src/domain/quiz.ts` and its test.

```ts
export interface QuizAnswer { letter: string; text: string; isCorrect?: boolean }
export interface QuizQuestion { question_id: string; question: string; answers?: QuizAnswer[]; correct_option?: string }

/** The letter that is right, from the stored answer. */
export function correctLetter(q: QuizQuestion): string | null;

/** Mark a set of selections. */
export function markQuiz(questions: QuizQuestion[], chosen: Record<string, string>):
  { score: number; total: number; percentage: number; answers: any[] };
```

- [x] **Step 1: Write the failing test**

- **The correct letter comes from the answer row flagged correct**, not from a constant.
- It falls back to `correct_option` when a question's options are still columns.
- **A question with no correct answer stored marks nothing right** rather than defaulting to A — a broken question must not silently award or deny a point.
- An unanswered question is wrong but recorded, so the attempt shows what was skipped.
- The percentage rounds, and a quiz of no questions does not divide by zero.
- Each answer carries the question id and what was chosen, which is what `player_answers` stores.

- [x] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 2: `/quiz` — taking it

**Files:** `src/views/QuizView.vue` and its test; the route and its guard.

- [x] **Step 1: Write the failing test**

- **A signed-out visitor is told to sign in and cannot submit.** An attempt attributed to nobody is worse than no attempt.
- The questions are whatever `fetchTeamQuiz` returns — including the active-thought filtering, which is asserted by returning a question the client already excluded and checking it is not invented back.
- Every question shows its options; one with none says so rather than rendering an unanswerable question silently.
- **Submitting marks against the stored answers** and shows the score.
- The attempt is written with the team.
- A failed read is reported rather than shown as "no questions".

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 3: The question bank, in admin

**Files:** `src/components/admin/QuizBankSection.vue` and its test.

- [ ] **Step 1: Write the failing test**

- Coach-visible, like the categories.
- Every question in the organization's bank is listed — including ones **no team asks**, which are invisible everywhere else.
- Each question shows **which teams ask it**, and can be switched on or off per team.
- Editing a question edits its options, and **which one is correct is explicit** rather than positional.
- **Retiring a question says it stops being asked** and that past attempts keep their record.
- A question naming a daily message says so, since that is why it may not be appearing.

- [ ] **Step 2: Build it, watch the tests pass**

- [ ] **Step 3: Gates and commit**

---

### Task 4: The daily thought, on Home

**Files:** `src/stores/thoughts.ts`, `src/components/home/DailyThought.vue`, tests; wire into `HomeView`.

- [ ] **Step 1: Write the failing tests**

- The active thought is shown to everyone; there is no thought and no empty box when none is set.
- A coach can write one, edit it, and **make it the active one** — only one is active, and setting a new one stands the old one down.
- **Deleting says what it costs**, including that quiz questions naming it stop being asked.
- **Copy-to-team offers only teams the coach may write to**, the same rule as the practice plan.
- A failed read is reported.

- [ ] **Step 2: Build and wire, watch the tests pass**

- [ ] **Step 3: Gates and commit**

---

### Task 5: Close out 6b

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat 05ed4b1..HEAD -- index.html public/js app.js
```

- [ ] **Step 2: Update `CLAUDE.md`** — what 6c owes.

- [ ] **Step 3: Commit**

## Definition of done

- A quiz is marked against the stored answers, and a test would fail if a key were hardcoded.
- A signed-out visitor cannot record an attempt.
- A question tied to a daily message is asked only while that message is active.
- The bank shows questions no team asks.
- The daily thought is on Home, one is active at a time, and copying offers only teams the coach may write to.
- Four gates green by exit code; `git diff` shows no change to the legacy app.
