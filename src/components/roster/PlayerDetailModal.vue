<script setup lang="ts">
/**
 * A player's bio, as anyone may see it.
 *
 * Season statistics are shown, ratings are not: ratings are the Competitive
 * Matrix's business and are gated on canAccessRatings(), which this public
 * screen does not check. Player Ratings is Phase 3 and is where they belong.
 */
import { computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { photoOrPlaceholder, type Player } from '../../domain/player-row';
import { lineupGrade } from '../../domain/lineup';

const props = defineProps<{ open: boolean; player: Player | null }>();
const emit = defineEmits<{ close: [] }>();

const photo = computed(() => photoOrPlaceholder(props.player?.photo));
const grade = computed(() => (props.player ? lineupGrade(props.player) : ''));

/** Whatever season_stats holds, since it differs for a keeper. */
const stats = computed(() => {
  const s = props.player?.seasonStats || {};
  return Object.entries(s)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ({
      // goalsAgainst -> Goals against
      label: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
      value: String(v)
    }));
});
</script>

<template>
  <BaseModal :open="open" :title="player?.name || 'Player'" @close="emit('close')">
    <div v-if="player" class="bio">
      <img class="bio__photo" :src="photo" :alt="''" />
      <dl class="bio__facts">
        <template v-if="player.number != null">
          <dt>Shirt</dt><dd>{{ player.number }}</dd>
        </template>
        <template v-if="player.position">
          <dt>Position</dt><dd>{{ player.position }}</dd>
        </template>
        <template v-if="grade">
          <dt>Year</dt><dd>{{ grade }}</dd>
        </template>
        <template v-if="player.height">
          <dt>Height</dt><dd>{{ player.height }}</dd>
        </template>
      </dl>
    </div>

    <section v-if="stats.length" class="season">
      <h3 class="season__title">This season</h3>
      <ul class="season__list">
        <li v-for="s in stats" :key="s.label" class="season__item" data-season-stat>
          <span class="season__value">{{ s.value }}</span>
          <span class="season__label">{{ s.label }}</span>
        </li>
      </ul>
    </section>
  </BaseModal>
</template>

<style scoped>
.bio { display: flex; gap: 1rem; align-items: center; }

.bio__photo {
  width: 5rem;
  height: 5rem;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bhs-navy-bg);
}

.bio__facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.9rem;
  margin: 0;
  font-size: 0.85rem;
}

.bio__facts dt {
  color: var(--text-muted, #94a3b8);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.bio__facts dd { margin: 0; color: var(--ink); }

.season { margin-top: 1.25rem; }

.season__title {
  margin: 0 0 0.6rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.75rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.season__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.season__item {
  display: flex;
  flex-direction: column;
  padding: 0.6rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 8px;
}

.season__value {
  color: var(--ink);
  font-size: 1.1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.season__label {
  color: var(--text-muted, #94a3b8);
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
</style>
