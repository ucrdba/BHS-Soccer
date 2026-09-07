<script setup lang="ts">
/**
 * One player on the roster.
 *
 * A hairline row on a phone — number, plate, name, position — and a card on a
 * desk, by CSS alone. Presentational: props in, events out, no store access,
 * which is what lets the roster be tested by seeding a store and the card be
 * tested on its own.
 */
import { computed } from 'vue';
import { photoOrPlaceholder, PLAYER_SILHOUETTE, type Player } from '../../domain/player-row';
import { lineupGrade } from '../../domain/lineup';

const props = defineProps<{ player: Player; canEdit: boolean }>();
const emit = defineEmits<{ open: [Player]; edit: [Player]; remove: [Player] }>();

const photo = computed(() => photoOrPlaceholder(props.player.photo));
/** The silhouette is a placeholder, and the plate says so rather than showing it. */
const hasPhoto = computed(() => photo.value !== PLAYER_SILHOUETTE);
// The same shortening the printed team card uses, so a player reads the same
// on screen and on paper.
const grade = computed(() => lineupGrade(props.player));
</script>

<template>
  <article class="card">
    <button type="button" class="card__open" data-player-open @click="emit('open', player)">
      <span class="card__num tnum">{{ player.number ?? '—' }}</span>
      <span class="plate" :class="{ 'plate--empty': !hasPhoto }">
        <img v-if="hasPhoto" class="plate__img" :src="photo" :alt="''" loading="lazy" />
        <span v-else class="plate__label">Photo</span>
      </span>
      <span class="card__text">
        <span class="card__name">{{ player.name }}</span>
        <span class="card__meta">
          <template v-if="player.position">{{ player.position }}</template>
          <template v-else>Position not recorded</template>
          <span v-if="grade" class="card__grade">· {{ grade }}</span>
        </span>
      </span>
    </button>

    <div v-if="canEdit" class="card__admin">
      <button type="button" class="textlink" data-player-edit @click="emit('edit', player)">Edit</button>
      <button type="button" class="textlink textlink--danger" data-player-remove @click="emit('remove', player)">Remove</button>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--rule);
}

.card__open {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.card__open:hover .card__name,
.card__open:focus-visible .card__name { color: var(--live); }

.card__num {
  width: 26px;
  flex: none;
  font-family: var(--heading-face);
  font-size: 16px;
  color: var(--ink-muted);
}

/* The plate: a photograph matted like a tipped-in plate, or the box that
   says one is missing. A missing photo is ordinary, not broken. */
.plate {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  height: 30px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  background: var(--surface-deep);
  overflow: hidden;
}

.plate__img { width: 100%; height: 100%; object-fit: cover; filter: sepia(0.22) saturate(0.82) contrast(1.05); }
.plate__label { display: none; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); }

.card__text { display: flex; flex-direction: column; min-width: 0; }
.card__name { font-size: 13.5px; color: var(--ink); }
.card__meta { font-size: 11px; color: var(--ink-muted); }
.card__grade { color: var(--ink-soft); }

.card__admin { display: flex; gap: var(--space-3); flex: none; }

.textlink {
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--live);
  background: none;
  color: var(--live);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.6;
  cursor: pointer;
}
.textlink:hover, .textlink:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }
.textlink--danger { color: var(--ink-muted); border-bottom-color: var(--rule); }
.textlink--danger:hover, .textlink--danger:focus-visible { color: var(--color-danger); border-bottom-color: var(--color-danger); }

/* A card on a desk: the plate grows, the row becomes a column. */
@media (min-width: 768px) {
  .card {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
  }
  .card__open { flex-direction: column; align-items: flex-start; gap: var(--space-2); }
  .plate { width: 100%; height: 160px; }
  .plate__label { display: block; }
  .card__num { width: auto; }
  .card__name { font-size: 17px; font-family: var(--heading-face); }
}
</style>
