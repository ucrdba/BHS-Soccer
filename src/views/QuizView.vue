<script setup lang="ts">
/**
 * The team quiz.
 *
 * A route rather than a dialog on top of the planner: taking a quiz is
 * something a player does, not something that happens over a coach's screen.
 *
 * **Marked against the stored answers.** `domain/quiz.ts` reads the correct
 * letter from the `quiz_answers` row flagged correct — the original version
 * of this held `['B','A','A','B','C']` in the view, so editing a question
 * silently broke the marking and recorded the attempt that way.
 *
 * **An attempt names a person, so it needs a real one.** A signed-out visitor
 * can read the questions and cannot submit; the client refuses independently,
 * and this is the layer that says so in words.
 *
 * The questions are whatever `fetchTeamQuiz` returns, which already drops a
 * question naming a daily message that is not the active one — that is what
 * stops last week's questions testing a focus nobody remembers.
 */
import { ref, computed, watch } from 'vue';
import { supabaseService } from '../data/supabase';
import { useAuthStore } from '../stores/auth';
import { useOrganizationStore } from '../stores/organization';
import { markQuiz, answerText, type QuizQuestion } from '../domain/quiz';

const auth = useAuthStore();
const org = useOrganizationStore();

const questions = ref<QuizQuestion[]>([]);
const chosen = ref<Record<string, string>>({});
const result = ref<any>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const notice = ref<string | null>(null);
const submitting = ref(false);

const signedIn = computed(() => !auth.isGuest);
const answered = computed(() => Object.keys(chosen.value).length);

async function load(): Promise<void> {
  loadError.value = null;
  result.value = null;
  chosen.value = {};

  const teamId = org.activeTeamId;
  if (!teamId) { loadError.value = 'Choose a team first.'; return; }

  loading.value = true;
  try {
    const rows = await supabaseService.fetchTeamQuiz(teamId);
    // Null is a failed read. Showing "no questions" for one tells a player
    // there is nothing to do when there is.
    if (rows === null) { loadError.value = 'Could not load the quiz.'; return; }
    questions.value = rows as QuizQuestion[];
  } finally {
    loading.value = false;
  }
}

watch(() => org.activeTeamId, load, { immediate: true });

function pick(questionId: string, letter: string): void {
  chosen.value = { ...chosen.value, [questionId]: letter };
}

async function onSubmit(): Promise<void> {
  notice.value = null;

  // Guarded here as well as in the client: a row attributed to a player who
  // does not exist is worse than a lost attempt.
  if (!signedIn.value) {
    notice.value = 'Sign in to record your score.';
    return;
  }

  const marked = markQuiz(questions.value, chosen.value);
  result.value = marked;

  submitting.value = true;
  try {
    const user = auth.user;
    const saved = await supabaseService.saveQuizAttempt(
      { id: user?.id, name: user?.name }, marked.answers,
      marked.score, marked.total, org.activeTeamId);

    notice.value = saved
      ? 'Score recorded.'
      : 'Scored here, but the attempt was not recorded.';
  } finally {
    submitting.value = false;
  }
}

function outcomeFor(questionId: string): boolean | null {
  if (!result.value) return null;
  const row = result.value.answers.find((a: any) => a.questionId === questionId);
  return row ? row.isCorrect : null;
}
</script>

<template>
  <section class="quiz">
    <header class="quiz__head">
      <h1 class="quiz__title">Team quiz</h1>
      <p class="quiz__sub">
        A few questions on what the squad is working on. Your score is recorded
        against your name.
      </p>
      <p v-if="org.branding.name" class="quiz__org kicker">
        {{ org.branding.name }}
        <span v-if="org.activeTeam">· {{ org.activeTeam.name }}</span>
      </p>
    </header>

    <p v-if="!signedIn" class="notice" data-quiz-signin>
      You can read the questions, but signing in is what lets your score be
      recorded — an attempt is kept against a real name.
    </p>

    <p v-if="loading" class="state">Loading…</p>
    <p v-else-if="loadError" class="state state--bad" role="alert" data-quiz-error>{{ loadError }}</p>

    <p v-else-if="questions.length === 0" class="state" data-quiz-empty>
      No questions are being asked right now.
    </p>

    <template v-else>
      <ol class="list">
        <li v-for="q in questions" :key="q.question_id" class="q" data-quiz-question>
          <p class="q__text" data-quiz-text>{{ q.question }}</p>

          <p v-if="!q.answers || q.answers.length === 0" class="q__none" data-quiz-no-options>
            This question has no options set, so it cannot be answered yet.
          </p>

          <label
            v-for="a in (q.answers || [])" :key="a.letter"
            class="opt" :class="{ 'is-picked': chosen[q.question_id] === a.letter }"
            :data-quiz-option="`${q.question_id}:${a.letter}`"
          >
            <input
              type="radio" :name="`q_${q.question_id}`" :value="a.letter"
              :checked="chosen[q.question_id] === a.letter"
              :disabled="!!result"
              @change="pick(q.question_id, a.letter)"
            />
            <span class="opt__letter">{{ a.letter }}</span>
            <span>{{ answerText(a) }}</span>
          </label>

          <p
            v-if="outcomeFor(q.question_id) !== null"
            class="q__mark" :class="outcomeFor(q.question_id) ? 'is-right' : 'is-wrong'"
            :data-quiz-mark="q.question_id"
          >{{ outcomeFor(q.question_id) ? 'Correct' : 'Not this time' }}</p>
        </li>
      </ol>

      <div class="foot">
        <span class="foot__count" data-quiz-progress>
          {{ answered }} of {{ questions.length }} answered
        </span>

        <button
          v-if="!result" type="button" class="btn btn--go"
          :disabled="submitting || !signedIn" data-quiz-submit @click="onSubmit"
        >{{ submitting ? 'Saving…' : 'Submit' }}</button>

        <button v-else type="button" class="btn" data-quiz-again @click="load">
          Take it again
        </button>
      </div>

      <p v-if="result" class="score" role="status" data-quiz-score>
        {{ result.score }} of {{ result.total }} — {{ result.percentage }}%
      </p>

      <p v-if="notice" class="notice" role="status" data-quiz-notice>{{ notice }}</p>
    </template>
  </section>
</template>

<style scoped>
.quiz { padding: var(--space-4) var(--space-4) var(--space-8); }

.quiz__head { margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.quiz__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--mark); }
.quiz__sub { margin-top: var(--space-1); color: var(--ink-muted); font-size: 14px; line-height: 1.5; }
.quiz__org { margin-top: var(--space-1); }

.state { padding: var(--space-6) 0; color: var(--ink-muted); text-align: center; font-size: 14px; }
.state--bad { color: var(--color-danger); }

.list { margin: 0; padding: 0; list-style: none; }

.q { margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.q__text { margin: 0 0 var(--space-2); color: var(--ink); font-size: 15px; line-height: 1.5; }
.q__none { margin: 0; color: var(--color-danger); font-size: 13px; }

/* An answer the player can pick: an outline that fills only with the live
   colour's own light wash when chosen, so the choice is unmistakable without
   becoming a filled control. */
.opt {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  margin-bottom: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 14px;
  cursor: pointer;
}
.opt:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.opt.is-picked { border-color: var(--live); background: color-mix(in srgb, var(--live) 10%, transparent); }
.opt__letter { color: var(--ink-muted); font-family: var(--heading-face); font-weight: 500; }
.opt.is-picked .opt__letter { color: var(--live); }

/* The mark says the word as well as the colour — a wrong answer read only by
   hue is a wrong answer a colour-blind player cannot read at all. */
.q__mark { margin: var(--space-1) 0 0; font-size: 13px; }
.is-right { color: var(--live); }
.is-wrong { color: var(--color-danger); }

.foot { display: flex; gap: var(--space-3); align-items: center; }
.foot__count { color: var(--ink-muted); font-size: 13px; }

.score { margin: var(--space-3) 0 0; color: var(--ink); font-family: var(--heading-face); font-weight: 500; font-size: 20px; }

.notice {
  margin: var(--space-3) 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink-muted);
  font-size: 13px;
  line-height: 1.5;
}

@media (min-width: 768px) { .quiz { max-width: 40rem; margin: 0 auto; } }
</style>
