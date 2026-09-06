<script setup lang="ts">
/**
 * The question bank.
 *
 * Coach-visible, like the categories. The bank belongs to an organization
 * (`quiz_questions.school_id`) and each squad picks from it through
 * `team_quiz_questions`, so an under-14 side can switch off a question
 * pitched at seventeen-year-olds without deleting it for everyone.
 *
 * **This is the only place a question no team asks is visible.**
 * `fetchTeamQuiz` returns what one squad is asked right now; a question
 * nobody has switched on appears in no quiz at all, and a coach has no other
 * way to find it.
 *
 * A question may name the daily message it tests, and is then only asked
 * while that message is active. That is worth showing here, because it is the
 * likeliest reason a question a coach wrote is not appearing.
 *
 * Which option is correct is explicit rather than positional: the editor
 * marks a letter, and `upsertQuizQuestion` writes the flag onto the
 * `quiz_answers` row.
 */
import { ref, computed, watch } from 'vue';
import { supabaseService } from '../../data/supabase';
import { answerText } from '../../domain/quiz';

const props = defineProps<{ schoolId: string | null; teams: any[] }>();

const questions = ref<any[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const notice = ref<string | null>(null);
const error = ref<string | null>(null);

const editingId = ref<string | null>(null);
const draft = ref<any>({ question: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A' });

const LETTERS = ['A', 'B', 'C', 'D'];

const teamName = computed(() => {
  const byId = new Map((props.teams || []).map((t: any) => [t.id, t.name]));
  return (id: string) => byId.get(id) || 'a team';
});

async function load(): Promise<void> {
  loadError.value = null;

  if (!props.schoolId) {
    loadError.value = 'No organization for this team, so there is no bank to show.';
    questions.value = [];
    return;
  }

  loading.value = true;
  try {
    const rows = await supabaseService.fetchQuizBank(props.schoolId);
    if (rows === null) { loadError.value = 'Could not load the question bank.'; return; }
    questions.value = rows;
  } catch {
    loadError.value = 'Could not load the question bank.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.schoolId, load, { immediate: true });

function report(res: any, done: string): boolean {
  if (res?.ok) { notice.value = done; error.value = null; return true; }
  error.value = res?.error || 'That did not work.';
  notice.value = null;
  return false;
}

function startNew(): void {
  editingId.value = '';
  draft.value = { question: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A' };
}

function startEdit(q: any): void {
  editingId.value = q.question_id;
  const options: Record<string, string> = { A: '', B: '', C: '', D: '' };
  (q.answers || []).forEach((a: any) => { options[String(a.letter).toUpperCase()] = answerText(a); });

  draft.value = {
    question: q.question || '',
    options,
    correct: String(
      (q.answers || []).find((a: any) => a.isCorrect || a.is_correct)?.letter
      || q.correct_option || 'A'
    ).toUpperCase()
  };
}

async function onSave(): Promise<void> {
  if (!draft.value.question.trim()) { error.value = 'Write the question first.'; return; }
  if (!props.schoolId) { error.value = 'No organization for this team.'; return; }

  const answers = LETTERS
    .map(letter => ({
      letter,
      text: draft.value.options[letter],
      // Explicit rather than positional: the coach names the letter.
      isCorrect: draft.value.correct === letter
    }))
    .filter(a => String(a.text || '').trim());

  if (!answers.some(a => a.isCorrect)) {
    error.value = 'Mark which option is the correct one.';
    return;
  }

  const res = await supabaseService.upsertQuizQuestion({
    question_id: editingId.value || undefined,
    school_id: props.schoolId,
    question: draft.value.question,
    answers,
    correct_option: draft.value.correct
  });

  if (report(res, 'Question saved.')) { editingId.value = null; await load(); }
}

async function onRetire(q: any): Promise<void> {
  const ok = window.confirm(
    `Retire this question?\n\n"${q.question}"\n\n`
    + 'It stops being asked on every squad. Attempts already recorded keep '
    + 'their answers, and switching it back on restores which squads used it.'
  );
  if (!ok) return;

  report(await supabaseService.retireQuizQuestion(q.question_id), 'Question retired.');
  await load();
}

async function onToggleTeam(q: any, teamId: string, on: boolean): Promise<void> {
  const res = await supabaseService.setTeamQuizQuestion(teamId, q.question_id, on);
  if (report(res, on
    ? `Asked on ${teamName.value(teamId)}.`
    : `No longer asked on ${teamName.value(teamId)}.`)) {
    await load();
  }
}
</script>

<template>
  <section class="sec" data-quiz-bank>
    <h2 class="sec__h">
      Quiz questions
      <span v-if="questions.length" class="sec__n" data-bank-count>{{ questions.length }}</span>
    </h2>

    <p class="sec__note">
      The bank belongs to this organization; each squad picks from it. A
      question no squad has switched on appears in no quiz — this is the only
      place it is visible.
    </p>

    <p v-if="loading" class="note">Loading…</p>
    <p v-else-if="loadError" class="note note--bad" role="alert" data-bank-error>{{ loadError }}</p>
    <p v-else-if="questions.length === 0" class="note" data-bank-empty>
      No questions yet.
    </p>

    <div v-for="q in questions" :key="q.question_id" class="row" data-bank-row>
      <div class="row__what">
        <p class="row__q" data-bank-question>{{ q.question }}</p>

        <p class="row__meta">
          <span v-if="q.teamIds.length === 0" class="tag tag--warn" data-bank-unused>
            no squad asks this
          </span>
          <span
            v-for="id in q.teamIds" :key="id"
            class="tag" data-bank-team
          >{{ teamName(id) }}</span>

          <!-- The likeliest reason a question a coach wrote is not appearing. -->
          <span v-if="q.thought_id" class="tag tag--quiet" data-bank-thought>
            only while its daily message is active
          </span>
        </p>
      </div>

      <div class="row__acts">
        <select
          class="inp" :data-bank-team-pick="q.question_id"
          @change="onToggleTeam(q, ($event.target as HTMLSelectElement).value,
                                !q.teamIds.includes(($event.target as HTMLSelectElement).value))"
        >
          <option value="">— ask on / stop asking —</option>
          <option v-for="t in teams" :key="t.id" :value="t.id">
            {{ q.teamIds.includes(t.id) ? `Stop asking on ${t.name}` : `Ask on ${t.name}` }}
          </option>
        </select>

        <button type="button" class="btn" :data-bank-edit="q.question_id" @click="startEdit(q)">
          Edit
        </button>
        <button type="button" class="btn" :data-bank-retire="q.question_id" @click="onRetire(q)">
          Retire
        </button>
      </div>
    </div>

    <button
      v-if="editingId === null" type="button" class="btn btn--go"
      data-bank-new @click="startNew"
    >Write a question</button>

    <form v-else class="form" data-bank-form @submit.prevent="onSave">
      <label class="fld">
        <span class="fld__label">Question</span>
        <textarea v-model="draft.question" class="inp inp--wide" rows="2" data-bank-question-input />
      </label>

      <div v-for="letter in LETTERS" :key="letter" class="opt">
        <label class="opt__correct">
          <input
            type="radio" name="correct" :value="letter"
            :checked="draft.correct === letter"
            :data-bank-correct="letter"
            @change="draft.correct = letter"
          />
          {{ letter }}
        </label>
        <input
          v-model="draft.options[letter]" type="text" class="inp inp--wide"
          :data-bank-option="letter"
        />
      </div>

      <p class="fld__hint">Choose the radio beside the option that is correct.</p>

      <div class="acts">
        <button type="submit" class="btn btn--go" data-bank-save>Save question</button>
        <button type="button" class="btn" @click="editingId = null">Cancel</button>
      </div>
    </form>

    <p v-if="notice" class="note note--good" role="status" data-bank-notice>{{ notice }}</p>
    <p v-if="error" class="note note--bad" role="alert" data-bank-action-error>{{ error }}</p>
  </section>
</template>

<style scoped>
.sec { margin-bottom: 2rem; }

.sec__h {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin: 0 0 0.3rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.sec__n {
  padding: 0.05rem 0.45rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  color: var(--text-muted, #94a3b8);
  font-size: 0.7rem;
}

.sec__note {
  margin: 0 0 0.7rem;
  max-width: 40rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.8rem;
  line-height: 1.5;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--bhs-navy-border);
}

.row__what { flex: 1; min-width: 15rem; }
.row__q { margin: 0; color: #fff; font-size: 0.86rem; }
.row__meta { margin: 0.3rem 0 0; display: flex; flex-wrap: wrap; gap: 0.3rem; }
.row__acts { display: flex; gap: 0.3rem; flex-wrap: wrap; }

.tag {
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  color: var(--bhs-cyan-accent);
  font-size: 0.68rem;
}

.tag--quiet { color: var(--text-muted, #94a3b8); }
.tag--warn { border-color: var(--bhs-gold-accent); color: var(--bhs-gold-accent); }

.form { margin-top: 0.9rem; }
.fld { display: block; margin-bottom: 0.5rem; }

.fld__label {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.fld__hint { margin: 0.3rem 0 0.6rem; color: var(--text-muted, #94a3b8); font-size: 0.76rem; }

.opt { display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.3rem; }
.opt__correct { display: flex; gap: 0.25rem; align-items: center; color: var(--bhs-cyan-accent); font-size: 0.78rem; }

.inp {
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: var(--bhs-navy-bg);
  color: #fff;
  font: inherit;
  font-size: 0.82rem;
}

.inp--wide { width: 100%; }

.acts { display: flex; gap: 0.35rem; margin-top: 0.5rem; }

.note { margin: 0.6rem 0 0; color: var(--text-muted, #94a3b8); font-size: 0.83rem; line-height: 1.5; }
.note--bad { color: var(--color-danger, #f87171); }
.note--good { color: var(--bhs-cyan-accent); }

.btn {
  padding: 0.26rem 0.55rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}

.btn--go { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
</style>
