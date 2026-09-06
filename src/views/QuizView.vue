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
      <p v-if="org.branding.name" class="quiz__org">
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
.quiz { max-width: 46rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }

.quiz__head { margin-bottom: 1.2rem; }
.quiz__title { margin: 0; color: #fff; font-size: 1.4rem; }

.quiz__sub {
  margin: 0.3rem 0 0;
  color: var(--text-muted, #94a3b8);
  font-size: 0.88rem;
  line-height: 1.5;
}

.quiz__org {
  margin: 0.4rem 0 0;
  color: var(--bhs-cyan-accent);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.state { padding: 2rem 0; color: var(--text-muted, #94a3b8); text-align: center; font-size: 0.88rem; }
.state--bad { color: var(--color-danger, #f87171); }

.list { margin: 0; padding: 0; list-style: none; }

.q {
  margin-bottom: 1.2rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid var(--bhs-navy-border);
}

.q__text { margin: 0 0 0.5rem; color: #fff; font-size: 0.95rem; }
.q__none { margin: 0; color: var(--color-danger, #f87171); font-size: 0.8rem; }

.opt {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  padding: 0.32rem 0.45rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 6px;
  margin-bottom: 0.3rem;
  color: #fff;
  font-size: 0.86rem;
  cursor: pointer;
}

.opt.is-picked { border-color: var(--bhs-cyan-accent); }
.opt__letter { color: var(--bhs-cyan-accent); font-weight: 700; }

.q__mark { margin: 0.4rem 0 0; font-size: 0.8rem; }
.is-right { color: var(--bhs-cyan-accent); }
.is-wrong { color: var(--color-danger, #f87171); }

.foot { display: flex; gap: 0.8rem; align-items: center; }
.foot__count { color: var(--text-muted, #94a3b8); font-size: 0.8rem; }

.score { margin: 0.8rem 0 0; color: var(--bhs-gold-accent); font-size: 1.05rem; }

.notice {
  margin: 1rem 0;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 6px;
  color: var(--text-muted, #94a3b8);
  font-size: 0.84rem;
  line-height: 1.5;
}

.btn {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.btn--go { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
.btn:disabled { opacity: 0.55; cursor: default; }
</style>
