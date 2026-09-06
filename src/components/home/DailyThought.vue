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
 */
import { ref, computed, watch } from 'vue';
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
      <h2 class="thought__h">
        {{ active.title || "Coach's message" }}
      </h2>
      <p class="thought__text" data-thought-text>{{ active.thoughts_text }}</p>
      <p v-if="active.coach_name" class="thought__by" data-thought-by>{{ active.coach_name }}</p>
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
  margin-bottom: 1.5rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--bhs-gold-accent);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
}

.thought__h {
  margin: 0 0 0.4rem;
  color: var(--bhs-gold-accent);
  font-size: 0.78rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.thought__text { margin: 0; color: #fff; font-size: 0.95rem; line-height: 1.6; white-space: pre-wrap; }
.thought__by { margin: 0.4rem 0 0; color: var(--text-muted, #94a3b8); font-size: 0.78rem; }

.acts { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.7rem; }

.sub {
  margin: 1rem 0 0.3rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--bhs-navy-border);
  font-size: 0.82rem;
}

.row__title { color: #fff; }
.row__acts { display: flex; flex-wrap: wrap; gap: 0.25rem; }

.form { margin-top: 0.7rem; }
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

.inp {
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: var(--bhs-navy-bg);
  color: #fff;
  font: inherit;
  font-size: 0.84rem;
}

.inp--wide { width: 100%; }

.note { margin: 0.5rem 0 0; color: var(--text-muted, #94a3b8); font-size: 0.8rem; line-height: 1.5; }
.note--bad { color: var(--color-danger, #f87171); }
.note--good { color: var(--bhs-cyan-accent); }

.btn, .mini {
  padding: 0.26rem 0.55rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}

.mini { color: var(--text-muted, #94a3b8); font-size: 0.72rem; }
.btn--go { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
</style>
