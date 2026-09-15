<script setup lang="ts">
/**
 * The Goals-by-role standards one squad is held to on one exercise.
 *
 * A tab per role, because each role is judged on its own terms: an attacker on
 * goal difference with a bonus for goals scored, a defender or goalkeeper on
 * goal difference with a bonus for goals given up. Each tab has two lists of
 * bands -- a threshold and the share of the exercise's weight it earns.
 *
 * The worked example scores a result with the bands on screen, and the rules
 * save_goal_bands will enforce (the 100% rule, duplicate thresholds, whole
 * numbers) are shown here first, in the same words.
 *
 * Per squad: the team selected in the header, as for time bands.
 */
import { ref, computed } from 'vue';
import { roleLabel, type PositionRole } from '../../domain/position';
import { goalBandExample } from '../../domain/role-goal-score';
import {
  GOAL_ROLES, draftsToGoalBands, type GoalBandDraft, type GoalBandDrafts
} from '../../domain/goal-bands-draft';

const props = defineProps<{ drillId: string; rows: GoalBandDrafts }>();
const emit = defineEmits<{ 'update:rows': [GoalBandDrafts] }>();

type Kind = 'base' | 'bonus';
const KINDS: Kind[] = ['base', 'bonus'];
const BLANK: GoalBandDraft = { threshold: '', percent: '' };

const active = ref<PositionRole>('attack');

function list(kind: Kind): GoalBandDraft[] {
  return props.rows?.[active.value]?.[kind] || [];
}

function shown(kind: Kind): GoalBandDraft[] {
  const rows = list(kind);
  return rows.length ? rows : [{ ...BLANK }];
}

function kindLabel(kind: Kind): string {
  return kind === 'base' ? 'Goal difference (scored − given up)' : 'Bonus';
}

function condition(kind: Kind): string {
  if (kind === 'base') return 'Goal difference at least';
  return active.value === 'attack' ? 'Goals scored at least' : 'Goals given up at most';
}

function write(kind: Kind, next: GoalBandDraft[]): void {
  const role = props.rows[active.value];
  emit('update:rows', { ...props.rows, [active.value]: { ...role, [kind]: next } });
}

function set(kind: Kind, index: number, field: keyof GoalBandDraft, value: string): void {
  write(kind, shown(kind).map((r, i) => (i === index ? { ...r, [field]: value } : r)));
}

function add(kind: Kind): void {
  write(kind, shown(kind).concat([{ ...BLANK }]));
}

function remove(kind: Kind, index: number): void {
  const kept = shown(kind).filter((_, i) => i !== index);
  write(kind, kept.length ? kept : [{ ...BLANK }]);
}

const check = computed(() => draftsToGoalBands(props.rows?.[active.value] || { base: [], bonus: [] }));

const example = computed(() => {
  const c = check.value;
  if (!c.ok) return '';
  return goalBandExample(active.value, c.bands.map(b => ({ ...b, role: active.value })));
});

const problem = computed(() => (check.value.ok ? '' : (check.value as { error: string }).error));
</script>

<template>
  <div class="goals" :data-goal-bands="props.drillId">
    <p class="goals__head">
      Standards for this squad, per role. Each band earns a share of the
      exercise's weight; the best goal-difference band plus the best bonus
      band may not add up to more than 100%.
    </p>

    <div class="tabs" role="tablist">
      <button
        v-for="r in GOAL_ROLES" :key="r"
        type="button" role="tab" class="tab" :class="{ 'tab--on': active === r }"
        :aria-selected="active === r ? 'true' : 'false'"
        :data-goal-role-tab="r"
        @click="active = r"
      >{{ roleLabel(r) }}</button>
    </div>

    <section v-for="kind in KINDS" :key="kind" class="list" :data-goal-kind="kind">
      <p class="list__label">{{ kindLabel(kind) }}</p>
      <div v-for="(row, i) in shown(kind)" :key="i" class="list__row" data-goal-band-row>
        <span class="cond">{{ condition(kind) }}</span>
        <input
          class="inp" type="text" inputmode="numeric" placeholder="2"
          :aria-label="condition(kind)"
          :value="row.threshold" data-goal-threshold
          @input="set(kind, i, 'threshold', ($event.target as HTMLInputElement).value)"
        />
        <span class="cond">earns</span>
        <input
          class="inp" type="number" min="0" max="100" step="5" placeholder="50"
          aria-label="Percent of the weight"
          :value="row.percent" data-goal-percent
          @input="set(kind, i, 'percent', ($event.target as HTMLInputElement).value)"
        />
        <span class="cond">%</span>
        <button type="button" class="btn" data-goal-remove @click="remove(kind, i)">Remove</button>
      </div>
      <button type="button" class="btn" :data-goal-add="kind" @click="add(kind)">+ Add a band</button>
    </section>

    <p v-if="problem" class="problem" role="alert" data-goal-problem>{{ problem }}</p>
    <p v-else class="example" data-goal-example>{{ example }}</p>
  </div>
</template>

<style scoped>
.goals {
  margin: 0.4rem 0 0.2rem 1rem;
  padding: 0.5rem 0.7rem;
  border-left: 2px solid var(--rule);
}

.goals__head { margin: 0 0 0.45rem; max-width: 36rem; color: var(--ink-muted); font-size: 0.74rem; line-height: 1.5; }

.tabs { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }

.tab {
  padding: 0.22rem 0.6rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 0.74rem;
  cursor: pointer;
}

.tab--on { border-color: var(--live); color: var(--live); }

.list { margin-bottom: 0.45rem; }
.list__label { margin: 0 0 0.3rem; color: var(--ink); font-size: 0.74rem; }
.list__row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 0.35rem; }
.cond { color: var(--ink-muted); font-size: 0.74rem; }

.inp {
  max-width: 4.5rem;
  padding: 0.28rem 0.45rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: var(--surface-deep);
  color: var(--ink);
  font: inherit;
  font-size: 0.8rem;
}

.btn {
  padding: 0.22rem 0.55rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.example { margin: 0.3rem 0 0; color: var(--ink); font-size: 0.76rem; font-variant-numeric: tabular-nums; }
.problem { margin: 0.3rem 0 0; color: var(--color-danger); font-size: 0.76rem; }
</style>
