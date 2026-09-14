<script setup lang="ts">
/**
 * A player's bio, as anyone may see it.
 *
 * Photo plate, number and class year, name, position and height, the season
 * figures, and the four skill ratings as bars. The ratings are shown only to
 * the team's own coaches, admins and players — see
 * `domain/ratings-visibility.ts`; a rating that is not set is left out rather
 * than drawn at zero.
 */
import { computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import InviteControl from '../accounts/InviteControl.vue';
import { demoConfig } from '../../demo';
import { photoOrPlaceholder, PLAYER_SILHOUETTE, type Player } from '../../domain/player-row';
import { lineupGrade } from '../../domain/lineup';
import { skillBars } from '../../domain/player-skills';

const props = withDefaults(defineProps<{
  open: boolean;
  player: Player | null;
  /**
   * Whether this viewer may see the skill ratings. Decided by the roster,
   * which knows who is on the team; false by default so a screen that
   * forgets the prop shows nothing rather than everything.
   */
  canSeeRatings?: boolean;
  /** A coach of this team may invite the player to create their account. */
  canInvite?: boolean;
  teamId?: string | null;
}>(), { canSeeRatings: false, canInvite: false, teamId: null });

/** The demo's accounts are shared and public; nobody real is invited from it. */
const demo = demoConfig();
const emit = defineEmits<{ close: [] }>();

const photo = computed(() => photoOrPlaceholder(props.player?.photo));
const hasPhoto = computed(() => photo.value !== PLAYER_SILHOUETTE);
const grade = computed(() => (props.player ? lineupGrade(props.player) : ''));

/** "NO. 9 · SENIOR", or whichever half exists; nothing when neither does. */
const kicker = computed(() => {
  const parts: string[] = [];
  if (props.player?.number != null) parts.push(`No. ${props.player.number}`);
  if (props.player?.classYear) parts.push(String(props.player.classYear));
  return parts.join(' · ');
});

const line = computed(() => {
  const parts: string[] = [];
  if (props.player?.position) parts.push(props.player.position);
  if (props.player?.height) parts.push(String(props.player.height));
  return parts.join(' · ');
});

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

const skills = computed(() => skillBars(props.player?.ratings));
</script>

<template>
  <BaseModal :open="open" :title="player?.name || 'Player'" @close="emit('close')">
    <div v-if="player" class="bio">
      <div class="bio__top">
        <span class="plate" :class="{ 'plate--empty': !hasPhoto }">
          <img v-if="hasPhoto" class="plate__img" :src="photo" :alt="''" />
          <span v-else class="plate__label" data-photo-missing>Photo</span>
        </span>
        <div class="bio__text">
          <p v-if="kicker" class="kicker tnum" data-bio-kicker>{{ kicker }}</p>
          <p class="bio__name">{{ player.name }}</p>
          <p v-if="line" class="bio__line">{{ line }}<span v-if="grade" class="bio__grade"> · {{ grade }}</span></p>
        </div>
      </div>

      <ul v-if="stats.length" class="figures tnum">
        <li v-for="s in stats" :key="s.label" class="figure" data-season-stat>
          <span class="figure__value">{{ s.value }}</span>
          <span class="figure__label">{{ s.label }}</span>
        </li>
      </ul>

      <section v-if="canSeeRatings && skills.length" class="skills">
        <p class="kicker kicker--accent">Skill ratings</p>
        <div v-for="s in skills" :key="s.key" class="skill" data-skill-bar>
          <div class="skill__row">
            <span class="skill__name">{{ s.name }}</span>
            <span class="skill__value tnum">{{ s.value }} <span class="skill__of">/100</span></span>
          </div>
          <div class="skill__track"><div class="skill__fill" :style="{ width: s.pct + '%' }" data-skill-fill /></div>
        </div>
      </section>

      <section v-if="canInvite && teamId && !demo.enabled" class="account" data-bio-account>
        <p class="kicker kicker--accent">Account</p>
        <InviteControl :team-id="teamId" role="player" :player-id="player.id" :subject="player.name" />
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.bio__top { display: flex; gap: 14px; }

/* Base look (centering, background, overflow, the photo filter) comes from
   the global .plate/.plate__img; this modal keeps only its own larger size
   and the thicker matted border. */
.plate {
  flex: none;
  width: 104px;
  height: 128px;
  border: 6px solid var(--surface);
  outline: 1px solid var(--rule);
}
.plate__label { font-size: 10px; }

/* A plate with no photograph: the dashed edge says "no photograph yet"
   rather than "this image failed". Matches PlayerCard's empty plate. */
.plate--empty {
  border-style: dashed;
  background: transparent;
}

.bio__text { flex: 1; min-width: 0; }
.bio__name { margin-top: 6px; font-family: var(--heading-face); font-weight: 500; font-size: 27px; line-height: 1.1; color: var(--ink); }
.bio__line { margin-top: 3px; font-size: 13px; font-style: italic; color: var(--ink-muted); }
.bio__grade { font-style: normal; }

.figures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin: var(--space-3) 0 0;
  padding: var(--space-3) 0 0;
  border-top: 1px solid var(--rule);
  list-style: none;
}
.figure { display: flex; flex-direction: column; }
.figure__value { font-family: var(--heading-face); font-size: 20px; color: var(--ink); }
.figure__label { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-muted); }

.skills { margin-top: var(--space-6); }
.account { margin-top: var(--space-6); }
.skill { padding: var(--space-3) 0; border-bottom: 1px solid var(--rule); }
.skill__row { display: flex; align-items: baseline; justify-content: space-between; }
.skill__name { font-size: 13.5px; color: var(--ink); }
.skill__value { font-family: var(--heading-face); font-size: 15px; color: var(--ink); }
.skill__of { font-size: 11px; color: var(--ink-muted); }
.skill__track { height: 3px; margin-top: 7px; background: var(--rule); }
.skill__fill { height: 3px; background: var(--live); }
</style>
