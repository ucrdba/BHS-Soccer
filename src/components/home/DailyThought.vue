<script setup lang="ts">
/**
 * The coach's message to the squad.
 *
 * On Home, which is where the squad looks — it lived in the practice planner
 * only as an artefact of how `app.js` was split.
 *
 * **One message is active at a time**, and making a new one active stands the
 * old one down. That matters beyond tidiness: a quiz question can name the
 * message it tests, and `fetchTeamQuiz` only asks such a question while that
 * message is active. So deleting a message quietly stops some questions being
 * asked, and the confirmation says so rather than letting a coach find out
 * when the quiz goes short.
 *
 * Nothing renders when no message is set. An empty box on the front page,
 * every day, teaches the squad to stop looking at it.
 *
 * **The quiz is reached from here and nowhere else.** It is not in the nav,
 * because what it asks about is this message -- so the link sits under the
 * message, and only when there is one to be asked about.
 */
import { ref, computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useThoughtsStore } from '../../stores/thoughts';

const props = defineProps<{ teamId: string | null; canEdit: boolean }>();

const thoughts = useThoughtsStore();

const composing = ref(false);
const editingId = ref<string | null>(null);
const title = ref('');
const text = ref('');
const target = ref<Record<string, string>>({});
const notice = ref<string | null>(null);
const error = ref<string | null>(null);

const active = computed(() => thoughts.active);
const others = computed(() => thoughts.thoughts.filter((t: any) => !t.is_active));

watch(() => props.teamId, async (id) => {
  await thoughts.load(id);
  if (props.canEdit) await thoughts.loadCopyTargets();
}, { immediate: true });

function startNew(): void {
  composing.value = true;
  editingId.value = null;
  title.value = '';
  text.value = '';
}

function startEdit(t: any): void {
  composing.value = true;
  editingId.value = t.id;
  title.value = t.title || '';
  text.value = t.thoughts_text || '';
}

function report(res: WriteLike, done: string): boolean {
  if (res?.ok) { notice.value = done; error.value = null; return true; }
  error.value = res?.error || 'That did not work.';
  notice.value = null;
  return false;
}

interface WriteLike { ok: boolean; error?: string }

async function onSave(): Promise<void> {
  if (!text.value.trim()) { error.value = 'Write something first.'; return; }

  const res = await thoughts.save(props.teamId, {
    id: editingId.value || undefined,
    title: title.value,
    text: text.value,
    isActive: !editingId.value || active.value?.id === editingId.value
  });

  if (report(res, 'Message saved.')) { composing.value = false; editingId.value = null; }
}

async function onSetActive(t: any): Promise<void> {
  report(await thoughts.setActive(props.teamId, t.id), 'That is now the squad\'s message.');
}

async function onRemove(t: any): Promise<void> {
  const ok = window.confirm(
    `Delete this message?\n\n`
    + (t.title ? `"${t.title}"\n\n` : '')
    + 'Any quiz question that names this message stops being asked, because a '
    + 'question is only asked while the message it tests is the active one.'
  );
  if (!ok) return;

  report(await thoughts.remove(props.teamId, t.id), 'Message deleted.');
}

async function onCopy(t: any): Promise<void> {
  const to = target.value[t.id];
  if (!to) { error.value = 'Pick a team to copy it to.'; return; }

  const team = thoughts.copyTargets.find((x: any) => x.id === to);
  report(await thoughts.copyToTeam(t.id, to), `Copied to ${team?.name || 'that team'}.`);
}
</script>

<template>
  <section v-if="active || canEdit" class="thought" data-daily-thought>
    <!-- Only when there is one. An empty box on the front page every day
         teaches the squad to stop looking at it. -->
    <template v-if="active">
      <p class="thought__kicker kicker">
        <template v-if="active.coach_name">From {{ active.coach_name }}</template>
        <template v-else>Coach's message</template>
      </p>
      <h2 class="thought__h">{{ active.title || "Coach's message" }}</h2>
      <p class="thought__text" data-thought-text>{{ active.thoughts_text }}</p>
      <p v-if="active.coach_name" class="thought__by sr-only" data-thought-by>{{ active.coach_name }}</p>
      <p class="thought__quiz">
        <RouterLink to="/quiz" class="thought__quizlink" data-thought-quiz>
          Take the quiz on this
        </RouterLink>
      </p>
    </template>

    <template v-if="canEdit">
      <div class="acts">
        <button type="button" class="btn" data-thought-new @click="startNew">
          {{ active ? 'New message' : 'Write a message' }}
        </button>
        <button
          v-if="active" type="button" class="btn"
          data-thought-edit @click="startEdit(active)"
        >Edit</button>
        <button
          v-if="active" type="button" class="btn"
          data-thought-remove @click="onRemove(active)"
        >Delete</button>
      </div>

      <form v-if="composing" class="form" data-thought-form @submit.prevent="onSave">
        <label class="fld">
          <span class="fld__label">Title</span>
          <input v-model="title" type="text" class="inp inp--wide" data-thought-title />
        </label>
        <label class="fld">
          <span class="fld__label">Message</span>
          <textarea v-model="text" class="inp inp--wide" rows="3" data-thought-body />
        </label>
        <div class="acts">
          <button type="submit" class="btn btn--go" data-thought-save>Save</button>
          <button type="button" class="btn" @click="composing = false">Cancel</button>
        </div>
      </form>

      <template v-if="others.length">
        <h3 class="sub">Earlier messages</h3>
        <div v-for="t in others" :key="t.id" class="row" data-thought-past>
          <span class="row__title">{{ t.title || 'Untitled' }}</span>

          <div class="row__acts">
            <button
              type="button" class="mini" :data-thought-activate="t.id"
              @click="onSetActive(t)"
            >Make active</button>

            <select v-model="target[t.id]" class="inp" :data-thought-copy-pick="t.id">
              <option value="">— copy to —</option>
              <option v-for="team in thoughts.copyTargets" :key="team.id" :value="team.id">
                {{ team.name }}
              </option>
            </select>
            <button type="button" class="mini" :data-thought-copy="t.id" @click="onCopy(t)">
              Copy
            </button>

            <button type="button" class="mini" :data-thought-delete="t.id" @click="onRemove(t)">
              Delete
            </button>
          </div>
        </div>
      </template>

      <p v-if="thoughts.loadError" class="note note--bad" role="alert" data-thought-error>
        {{ thoughts.loadError }}
      </p>
      <p v-if="notice" class="note note--good" role="status" data-thought-notice>{{ notice }}</p>
      <p v-if="error" class="note note--bad" role="alert" data-thought-action-error>{{ error }}</p>
    </template>
  </section>
</template>

<style scoped>
.thought {
  margin: var(--space-6) var(--space-4) 0;
  padding: var(--space-4) var(--space-4) var(--space-6);
  border: 1px solid var(--rule);
  border-left: 2px solid var(--rule-strong);
  border-radius: var(--radius-md);
}

.thought__kicker { color: var(--ink-muted); }

.thought__quiz { margin: var(--space-3) 0 0; }

.thought__quizlink {
  display: inline-block;
  padding: 4px 12px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  color: var(--ink);
  font-size: 0.82rem;
  text-decoration: none;
}

.thought__quizlink:hover { border-color: var(--rule-strong); color: var(--mark); }
.thought__quizlink:focus-visible { outline: 2px solid var(--mark); outline-offset: 2px; }

.thought__h {
  margin: var(--space-2) 0 0;
  font-family: var(--heading-face);
  font-weight: 500;
  font-size: 21px;
  line-height: 1.2;
  color: var(--ink);
}

.thought__text {
  margin: var(--space-2) 0 0;
  color: var(--ink);
  font-size: 13.5px;
  line-height: 1.65;
  text-align: justify;
  hyphens: auto;
  white-space: pre-wrap;
}

.acts { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-3); }

.sub {
  margin: var(--space-4) 0 var(--space-1);
  font-size: 9.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--rule);
  font-size: 0.82rem;
}

.row__title { color: var(--ink); }
.row__acts { display: flex; flex-wrap: wrap; gap: var(--space-1); }

.form { margin-top: var(--space-3); }
.fld { display: block; margin-bottom: var(--space-2); }

.fld__label {
  display: block;
  margin-bottom: 4px;
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.inp {
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
}

.inp:focus-visible { border-color: var(--live); outline-offset: 0; }
.inp--wide { width: 100%; }

.note { margin: var(--space-2) 0 0; color: var(--ink-muted); font-size: 0.8rem; line-height: 1.5; }
.note--bad { color: var(--color-danger); }
.note--good { color: var(--live); }

.btn, .mini {
  min-height: 34px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font-family: var(--heading-face);
  font-size: 14px;
  cursor: pointer;
}

.mini { min-height: 30px; font-size: 13px; color: var(--ink-muted); }
.btn--go { border-color: var(--live); color: var(--live); }
.btn:hover, .mini:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }

@media (min-width: 768px) {
  .thought { max-width: 40rem; margin-inline: auto; }
}
</style>
