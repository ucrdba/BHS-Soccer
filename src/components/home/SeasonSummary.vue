<script setup lang="ts">
/**
 * How the season is going (spec 2026-09-10-home-hero-design.md §3).
 *
 * Before the first result: one line, when the season opens and how many
 * fixtures it has -- the preseason state the restyle never drew. Once results
 * exist: the last one in words, the form as letters, and the four figures the
 * page has always shown. The letter and the word carry the result; colour
 * only reinforces it.
 */
import type { SeasonRecord } from '../../domain/season-record';
import type { FormLetter } from '../../domain/schedule-view';

defineProps<{
  record: SeasonRecord;
  lastResult: { opponent: string; side: string; word: string; score: string } | null;
  form: FormLetter[];
  /** The next match's date as displayed, or '' when there is none. */
  opensOn: string;
  fixtures: number;
}>();
</script>

<template>
  <section v-if="record.gamesPlayed > 0" class="season" data-season>
    <p class="kicker">How we're doing</p>

    <div v-if="lastResult" class="last" data-last-result>
      <p class="last__who">Last out · <em>{{ lastResult.opponent }}, {{ lastResult.side }}</em></p>
      <p class="last__score tnum">{{ lastResult.word }} {{ lastResult.score }}</p>
    </div>

    <div v-if="form.length" class="form" data-form>
      <span class="form__label">Form</span>
      <template v-for="(l, i) in form" :key="i">
        {{ ' ' }}<span class="form__r" :class="{ 'form__r--w': l === 'W' }">{{ l }}</span>
      </template>
    </div>

    <div class="stats tnum">
      <div class="stat">
        <span class="stat__value">{{ record.recordText }}</span>
        <span class="stat__label">Record (W&ndash;L&ndash;D)</span>
      </div>
      <div class="stat">
        <span class="stat__value">{{ record.gamesPlayed }}</span>
        <span class="stat__label">Played</span>
      </div>
      <div class="stat">
        <span class="stat__value">{{ record.goalsPerGame }}</span>
        <span class="stat__label">Goals / game</span>
      </div>
      <div class="stat">
        <span class="stat__value">{{ record.cleanSheets }}</span>
        <span class="stat__label">Clean sheets</span>
      </div>
    </div>
  </section>

  <section v-else-if="opensOn" class="season" data-season>
    <p class="opens" data-season-opens>
      <span class="opens__label">Season</span>
      <span class="opens__text">Opens {{ opensOn }} · {{ fixtures }} fixture{{ fixtures === 1 ? '' : 's' }}</span>
    </p>
  </section>
</template>

<style scoped>
.last {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-2);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}

.last__who { font-size: 12px; color: var(--ink-muted); }
.last__who em { font-style: italic; }
.last__score { font-family: var(--heading-face); font-size: 17px; color: var(--ink); }

.form { display: flex; align-items: center; gap: 5px; padding: var(--space-2) 0; border-bottom: 1px solid var(--rule); }
.form__label { margin-right: auto; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-muted); }

.form__r {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  font-family: var(--heading-face);
  font-size: 15px;
  color: var(--ink);
}

.form__r--w { border-color: var(--mark); color: var(--mark); }

.stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 var(--space-4); }
.stat { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3) 0; border-bottom: 1px solid var(--rule); }
.stat__value { font-family: var(--heading-face); font-size: 20px; color: var(--mark); }
.stat__label { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-muted); }

.opens {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--rule-strong);
}

.opens__label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-muted); }
.opens__text { font-family: var(--heading-face); font-size: 20px; color: var(--ink); }

</style>
