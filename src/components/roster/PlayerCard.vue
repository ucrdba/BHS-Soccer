<script setup lang="ts">
/**
 * One player on the roster grid.
 *
 * Presentational: props in, events out, no store access. That is what lets
 * the roster be tested by seeding a store and the card be tested on its own.
 */
import { computed } from 'vue';
import { photoOrPlaceholder, type Player } from '../../domain/player-row';
import { lineupGrade } from '../../domain/lineup';

const props = defineProps<{ player: Player; canEdit: boolean }>();
const emit = defineEmits<{ open: [Player]; edit: [Player]; remove: [Player] }>();

const photo = computed(() => photoOrPlaceholder(props.player.photo));
// The same shortening the printed team card uses, so a player reads the same
// on screen and on paper.
const grade = computed(() => lineupGrade(props.player));
</script>

<template>
  <article class="card">
    <button type="button" class="card__open" data-player-open @click="emit('open', player)">
      <img class="card__photo" :src="photo" :alt="''" loading="lazy" />
      <span class="card__num">{{ player.number ?? '—' }}</span>
      <span class="card__name">{{ player.name }}</span>
      <span class="card__meta">
        <span v-if="player.position">{{ player.position }}</span>
        <span v-if="grade" class="card__grade">{{ grade }}</span>
      </span>
    </button>

    <div v-if="canEdit" class="card__admin">
      <button type="button" class="card__btn" data-player-edit @click="emit('edit', player)">
        Edit
      </button>
      <button type="button" class="card__btn card__btn--danger" data-player-remove
              @click="emit('remove', player)">
        Remove
      </button>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 10px;
  background: var(--bhs-navy-card);
  overflow: hidden;
}

.card__open {
  display: grid;
  grid-template-columns: 3rem 1fr;
  grid-template-rows: auto auto;
  gap: 0.1rem 0.75rem;
  align-items: center;
  width: 100%;
  padding: 0.85rem;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.card__open:hover,
.card__open:focus-visible { background: color-mix(in srgb, var(--ink) 3%, transparent); }

.card__photo {
  grid-row: 1 / 3;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bhs-navy-bg);
}

.card__num {
  grid-column: 2;
  color: var(--bhs-cyan-accent);
  font-size: 0.72rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.card__name {
  grid-column: 2;
  color: var(--ink);
  font-weight: 600;
  font-size: 0.95rem;
}

.card__meta {
  grid-column: 2;
  display: flex;
  gap: 0.5rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.75rem;
}

.card__grade::before { content: '· '; }

.card__admin {
  display: flex;
  gap: 0.4rem;
  padding: 0 0.85rem 0.75rem;
}

.card__btn {
  flex: 1;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.card__btn:hover { color: var(--ink); }
.card__btn--danger:hover { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }
</style>
