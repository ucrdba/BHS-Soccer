<script setup lang="ts">
/**
 * The band at the top of the home page: who the organization is, top-left,
 * and the next match, bottom-left, over its own photo -- or its colour when it
 * has none (spec 2026-09-10-home-hero-design.md §4).
 *
 * Presentational. HomeView turns the stores and the domain functions into
 * these strings, so everything a visitor reads is tested where it is worked
 * out, and this file only decides how it looks and what to do when an image
 * will not load.
 *
 * The one fill an organization colour is allowed on the paper ground (§6.4):
 * `--org-band` is guarded to 4.5:1 against the white text on it. Every colour
 * here is a token; no component style may carry a white.
 */
import { ref, computed } from 'vue';
import type { LongCountdown } from '../../domain/schedule';

const props = defineProps<{
  /** The photo address, already passed through safeImageUrl, or ''. */
  photo: string;
  logo: string;
  orgName: string;
  /** "League · City", or '' when the organization has neither. */
  place: string;
  kicker: string;
  /** The opponent, or a state line such as "Season complete". */
  headline: string;
  /** The headline is a state line, not an opponent. */
  quiet: boolean;
  countdown: LongCountdown | null;
  /** "DEC 8 2026 (Tue) · Kick-off 4:30 PM", or ''. */
  when: string;
}>();

/*
 * The addresses that failed to load. Keyed on the address rather than a flag,
 * so correcting the organization's row brings the image back without a
 * reload -- the same rule the logo followed on its own (8f7d13b).
 */
const failedPhoto = ref<string | null>(null);
const failedLogo = ref<string | null>(null);

const showPhoto = computed(() => !!props.photo && failedPhoto.value !== props.photo);
const showLogo = computed(() => !!props.logo && failedLogo.value !== props.logo);
</script>

<template>
  <section class="band" :class="{ 'band--photo': showPhoto }" data-home-band>
    <img
      v-if="showPhoto" class="band__photo" :src="photo" alt=""
      fetchpriority="high" decoding="async" referrerpolicy="no-referrer" data-band-photo
      @error="failedPhoto = photo" />
    <div class="band__shade" aria-hidden="true"></div>
    <div class="band__corner" aria-hidden="true"></div>

    <div v-if="showLogo || place" class="band__who" data-band-who>
      <img
        v-if="showLogo" class="band__logo" :src="logo" :alt="orgName || 'Organization logo'"
        referrerpolicy="no-referrer" data-band-logo @error="failedLogo = logo" />
      <span v-if="place" class="band__place">{{ place }}</span>
    </div>

    <div class="band__match">
      <p class="band__kicker">{{ kicker }}</p>
      <h1
        class="band__headline" :class="{ 'band__headline--quiet': quiet }"
        :data-next-fixture="quiet ? null : ''"
      >{{ headline }}</h1>

      <p v-if="countdown?.underway" class="band__underway" data-countdown>Under way</p>
      <p v-else-if="countdown" class="band__count" data-countdown>
        <!-- Read as a sentence; the figures are for the eye. -->
        <span class="sr-only">{{ countdown.spoken }}</span>
        <span class="band__figures" aria-hidden="true">
          <template v-for="(p, i) in countdown.parts" :key="i">
            <span class="band__n">{{ p.value }}</span><span class="band__u">{{ p.unit }}</span>
          </template>
        </span>
      </p>

      <p v-if="when" class="band__when">{{ when }}</p>
    </div>
  </section>
</template>

<style scoped>
.band {
  position: relative;
  height: 300px;
  overflow: hidden;
  background: var(--org-band);
  color: var(--band-ink);
}

.band__photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 50%;
}

.band__shade,
.band__corner { position: absolute; inset: 0; pointer-events: none; }
.band__shade { background: var(--band-shade); }
.band__corner { background: var(--band-corner); }

/* Who we are: top-left, over the part of a photo that is usually sky. */
.band__who {
  position: absolute;
  top: var(--space-3);
  left: var(--space-4);
  right: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.band__logo { width: 30px; height: 30px; flex: none; border-radius: var(--radius-md); object-fit: cover; }

.band__place,
.band__kicker {
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--band-ink-muted);
  text-shadow: var(--band-text-shadow);
}

/* The next match: bottom-left, where the two shades are darkest. */
.band__match { position: absolute; left: var(--space-4); right: var(--space-4); bottom: var(--space-4); }

.band__kicker { margin: 0 0 5px; }

.band__headline {
  margin: 0;
  font-family: var(--heading-face);
  font-weight: 500;
  font-size: 40px;
  line-height: 0.95;
  color: var(--band-ink);
  overflow-wrap: anywhere;
  /* The band's height is fixed and the match block anchors to its bottom, so
     a long opponent name grows upward without limit and can reach the logo
     row. Clamped to two lines with an ellipsis; the full name stays in the
     element's text content, so a screen reader still reads all of it. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.band__headline--quiet { font-size: 28px; }

.band__count { margin: 10px 0 2px; font-family: var(--heading-face); }
.band__figures { display: flex; align-items: baseline; gap: 6px; }
.band__n { font-size: 42px; font-weight: 500; line-height: 1; }
.band__u { margin-right: 8px; font-size: 13px; color: var(--band-ink-muted); }

.band__underway { margin: 10px 0 2px; font-family: var(--heading-face); font-size: 28px; }

.band__when {
  margin: 0;
  font-size: 12px;
  color: var(--band-ink-muted);
  text-shadow: var(--band-text-shadow);
}

/*
 * On a computer the band is four times wider than it is tall, so the photo
 * shows at full width and can only move up and down. The words move instead:
 * to the header's left edge, never the centred column, which would sit on the
 * subject of any photo composed around its middle (spec §3).
 */
@media (min-width: 768px) {
  .band { height: 320px; }
  .band__photo { object-position: 50% 25%; }
  .band__corner { background: var(--band-corner-wide); }
  .band__who,
  .band__match { left: max(var(--space-4), calc((100% - 64rem) / 2)); right: auto; max-width: 30rem; }
  .band__headline { font-size: 48px; }
  .band__n { font-size: 48px; }
}
</style>
