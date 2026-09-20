<script setup lang="ts">
/**
 * Who has taken the quiz, for the squad the coach has active.
 *
 * **Every player is listed, including the ones who have not taken it.** Who
 * has not is what a coach opens this for, so those rows carry dashes rather
 * than being dropped — the same bargain the squad report and the season
 * report make.
 *
 * The latest attempt is the one shown, with how many times they have taken it
 * beside it: the quiz asks about the message that is up now, so an older
 * score says less than the current one.
 *
 * Reads `quiz_attempts` directly, never the `quiz_results` view — the view
 * carries no team, and 0040 hands it back to the caller's own permissions.
 */
import { ref, computed, watch } from 'vue';
import { supabaseService } from '../../data/supabase';
import { quizAttemptRows, quizTakenCount } from '../../domain/quiz-attempts';

const props = defineProps<{ teamId: string | null }>();

const roster = ref<Array<{ id: string; name: string }>>([]);
const attempts = ref<any[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const rows = computed(() => quizAttemptRows(roster.value, attempts.value));
const taken = computed(() => quizTakenCount(rows.value));

const shown = (row: any) =>
  row.score === null || row.total === null ? '—' : `${row.score} of ${row.total}`;

/** The day it was taken, as a coach reads a date. */
function dayOf(iso: string | null): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function load(): Promise<void> {
  loadError.value = null;
  roster.value = [];
  attempts.value = [];

  if (!props.teamId) { loadError.value = 'Choose a team first.'; return; }

  loading.value = true;
  try {
    const [rosterRows, found] = await Promise.all([
      supabaseService.fetchTeamRoster(props.teamId),
      supabaseService.fetchTeamQuizAttempts(props.teamId)
    ]);

    if (rosterRows === null || found === null) {
      loadError.value = 'Could not read who has taken the quiz.';
      return;
    }

    roster.value = (rosterRows as any[])
      .map(m => ({ id: m?.players?.id, name: m?.players?.name || '' }))
      .filter(p => p.id);
    attempts.value = found as any[];
  } finally {
    loading.value = false;
  }
}

watch(() => props.teamId, load, { immediate: true });
</script>

<template>
  <section class="sec" data-admin-quiz-attempts>
    <h2 class="sec__h">Quiz attempts</h2>
    <p class="sec__lede">
      Who has taken the quiz for this squad, and what they last scored. A player
      who has not taken it is listed with a dash rather than left out.
    </p>

    <p v-if="loading" class="state">Loading…</p>
    <p v-else-if="loadError" class="state state--bad" role="alert" data-attempt-error>{{ loadError }}</p>

    <template v-else>
      <p class="count" data-attempt-count>
        {{ taken.taken }} of {{ taken.of }}
        {{ taken.of === 1 ? 'player has' : 'players have' }} taken it.
      </p>

      <p v-if="taken.taken === 0" class="state" data-attempt-none>
        Nobody has taken it yet. The quiz is offered under the coach's message on the home page.
      </p>

      <div v-if="rows.length" class="wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th class="is-text">Player</th>
              <th class="is-text">Last taken</th>
              <th>Score</th>
              <th>%</th>
              <th>Times</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.playerId" data-attempt-row>
              <td class="is-text" data-attempt-player>{{ row.playerName }}</td>
              <td class="is-text" data-attempt-when>{{ dayOf(row.lastTakenOn) }}</td>
              <td class="tabular" data-attempt-score>{{ shown(row) }}</td>
              <td class="tabular" data-attempt-share>
                {{ row.percentage === null ? '—' : `${row.percentage}%` }}
              </td>
              <td class="tabular" data-attempt-times>{{ row.times }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.sec { margin-bottom: var(--space-6); }

.sec__h {
  margin: 0 0 0.2rem;
  font-family: var(--heading-face);
  font-weight: 400;
  font-size: 20px;
  color: var(--ink);
}

.sec__lede {
  margin: 0 0 0.7rem;
  max-width: 44rem;
  color: var(--ink-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.count { margin: 0 0 0.4rem; color: var(--ink); font-size: 0.85rem; }

.state { padding: 0.6rem 0; color: var(--ink-muted); font-size: 0.85rem; }
.state--bad { color: var(--color-danger); }

.wrap { overflow-x: auto; }
.tbl { width: auto; min-width: min(100%, 26rem); border-collapse: collapse; font-size: 0.83rem; }

.tbl th, .tbl td {
  padding: 0.28rem 0.75rem;
  border-bottom: 1px solid var(--rule);
  text-align: right;
}

.tbl th.is-text, .tbl td.is-text { text-align: left; }

.tbl th {
  color: var(--live);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tabular { font-variant-numeric: tabular-nums; }
</style>
