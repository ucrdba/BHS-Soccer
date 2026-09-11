<script setup lang="ts">
/**
 * The organization's own profile — name, mascot, city, league, colours, record.
 *
 * **Nothing here may fall back to Beaumont.** `upsertSchool` fills a blank
 * name, mascot and city with `Beaumont High School` / `Cougars` /
 * `Beaumont, CA`, which is legacy seeding behaviour and harmless when the
 * organization *is* Beaumont. For a club it is not: the mascot is rendered on
 * headings across the app, so a club admin who cleared the field would find
 * their club had quietly become the Cougars. This form therefore refuses a
 * blank rather than sending one, and always writes against the resolved
 * organization code rather than the service's default.
 *
 * Colours are validated here with `domain/colour.ts`'s `parseColour` — a hex
 * code, an rgb() triple, or one of its named colours — as well as in
 * `domain/theme.ts`, because they are written straight into CSS custom
 * properties. `theme.ts` falls back when it reads something else; this stops
 * the bad value being stored in the first place.
 *
 * Extracted from the school profile forms in public/js/views/planner.view.js
 * during Phase 6.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import SectionShell from './SectionShell.vue';
import { supabaseService } from '../../data/supabase';
import {
  DEFAULT_PRIMARY, DEFAULT_SECONDARY,
  guardedColour, contrastRatio,
  MIN_MARK_CONTRAST, MIN_TEXT_CONTRAST,
  PAPER_GROUND, PAPER_INK, PAPER_ACCENT_FALLBACK,
  DARK_GROUND, DARK_INK, DARK_MARK_FALLBACK,
  safeImageUrl
} from '../../domain/theme';
import { parseColour, toHex } from '../../domain/colour';

const props = defineProps<{
  /**
   * The active organization's `code`, not its uuid — `fetchSchool` and
   * `upsertSchool` both key on `schools.code`, so a uuid here silently
   * matches no row. Never defaulted; see the module comment.
   */
  schoolCode: string | null;
  isAdmin: boolean;
}>();

const emit = defineEmits<{ saved: [school: any] }>();

const form = ref({
  name: '', mascot: '', city: '', league: '', logoUrl: '',
  primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY,
  wins: '0', losses: '0', draws: '0'
});

const loading = ref(false);
const saving = ref(false);
const notice = ref<string | null>(null);
const error = ref<string | null>(null);

/** The row as last loaded, kept so a save can merge into its `colors` rather
 * than replacing it -- see the merge in onSave. */
const row = ref<any>(null);

/**
 * The address the logo preview is showing, and the one that failed to load.
 *
 * The preview follows the field after a pause rather than on every keystroke,
 * so a half-typed address is not fetched, does not fail, and does not flash a
 * warning at an admin who has not finished typing. Set at once on load.
 */
const previewUrl = ref('');
const brokenPreview = ref<string | null>(null);

async function load(): Promise<void> {
  // No organization resolved yet: wait, rather than reading a defaulted one.
  if (!props.schoolCode) return;

  loading.value = true;
  error.value = null;
  try {
    const fetched: any = await supabaseService.fetchSchool(props.schoolCode);
    if (!fetched) { error.value = 'That organization could not be loaded.'; return; }
    row.value = fetched;

    form.value = {
      name: fetched.name || '',
      mascot: fetched.mascot || '',
      city: fetched.city || '',
      league: fetched.league || '',
      logoUrl: fetched.logo_url || '',
      primary: fetched.colors?.primary || DEFAULT_PRIMARY,
      secondary: fetched.colors?.secondary || DEFAULT_SECONDARY,
      wins: String(fetched.record?.wins ?? 0),
      losses: String(fetched.record?.losses ?? 0),
      draws: String(fetched.record?.draws ?? 0)
    };
    previewUrl.value = safeImageUrl(fetched.logo_url);
  } catch (e: any) {
    error.value = e?.message || 'That organization could not be loaded.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.schoolCode, load, { immediate: true });

/**
 * Whether this database has the logo column yet.
 *
 * Read off the loaded row rather than assumed. Until 0028 is applied the
 * column is absent, `select *` simply omits it, and naming it in the save
 * would make PostgREST refuse the WHOLE profile with 42703 -- losing an
 * admin's name or colour edit over a field they never touched.
 */
const logoColumn = computed(() => !!row.value && 'logo_url' in row.value);

/** A typed address the public page would refuse, said before saving. */
const logoError = computed<string | null>(() => {
  const typed = form.value.logoUrl.trim();
  if (!typed || safeImageUrl(typed)) return null;
  return 'A logo address must start with https://, http:// or / (a file shipped with the app).';
});

const logoPreview = computed(() => safeImageUrl(form.value.logoUrl));

let previewTimer: ReturnType<typeof setTimeout> | undefined;
watch(logoPreview, (url) => {
  clearTimeout(previewTimer);
  // Already showing it: the load path sets the preview directly, and waiting
  // to set the same value again would only race a test's fake clock.
  if (url === previewUrl.value) return;
  previewTimer = setTimeout(() => { previewUrl.value = url; }, 400);
});
onBeforeUnmount(() => clearTimeout(previewTimer));

/** What the two fields accept, said once so the message and the hint agree. */
const COLOUR_FORMS = 'a hex code (#21196F), an rgb() triple (rgb(33, 25, 111)), or a colour name (navy)';

const colourError = computed<string | null>(() => {
  for (const [label, value] of [['Primary', form.value.primary], ['Secondary', form.value.secondary]] as const) {
    if (!parseColour(value)) {
      return `${label} colour: "${value}" is not a colour this app can read. Use ${COLOUR_FORMS}.`;
    }
  }
  return null;
});

/**
 * The colours the touchline and ratings screens will actually use, wherever
 * they differ from what the admin typed.
 *
 * An organization is entitled to know the interface overrode its brand, even
 * though the spec's position is that the interface adapts rather than the
 * admin. Both colours are checked, not just the secondary: the primary now
 * drives --live on the paper ground (body-size text, so the 4.5:1 floor),
 * and an admin who set only a bad primary previously heard nothing about it.
 *
 * `guardedColour` substitutes for either of two reasons -- the colour cannot
 * be seen against its ground, or it sits too close to the ink beside it --
 * and of the colours that fail on the dark ground in practice, most fail the
 * contrast floor rather than the ink-distance one. Reporting one reason for
 * both would be wrong most of the time it fires, so each substitution names
 * whichever check actually failed. Since guardedColour checks contrast first,
 * a substitution that isn't a contrast failure is necessarily a distance one.
 */
const substitutions = computed<Array<{ used: string; reason: string }>>(() => {
  const out: Array<{ used: string; reason: string }> = [];

  const check = (
    value: string, ground: string, ink: string, min: number, fallback: string, place: string
  ): void => {
    const parsed = parseColour(value);
    if (!parsed) return;
    const used = guardedColour(value, ground, ink, min, fallback);
    const asked = toHex(parsed);
    if (used.toLowerCase() === asked.toLowerCase()) return;

    const reason = contrastRatio(value, ground) < min
      ? `${value} cannot be seen against the ${place} screens, so those use ${used} instead.`
      : `${value} cannot be told apart from the text on the ${place} screens, so those use ${used} instead.`;
    out.push({ used, reason });
  };

  // Primary drives --live on the paper ground (MIN_TEXT_CONTRAST, since a
  // link is body-size text). Secondary drives the dark-ground mark
  // (MIN_MARK_CONTRAST) -- matching what themeVars actually does.
  check(form.value.primary, PAPER_GROUND, PAPER_INK, MIN_TEXT_CONTRAST, PAPER_ACCENT_FALLBACK, 'paper');
  check(form.value.secondary, DARK_GROUND, DARK_INK, MIN_MARK_CONTRAST, DARK_MARK_FALLBACK, 'dark match');

  return out;
});

/** The parsed colour as hex, or transparent so a half-typed value shows
 * nothing rather than the last good one. */
function swatchFor(value: string): string {
  const c = parseColour(value);
  return c ? toHex(c) : 'transparent';
}

/** A whole number, or zero. A record field holds text. */
const count = (v: string): number => {
  const n = Math.trunc(Number(String(v).trim()));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

async function onSave(): Promise<void> {
  if (!props.schoolCode) return;

  const name = form.value.name.trim();
  const mascot = form.value.mascot.trim();

  // The two that would otherwise be filled in with Beaumont's.
  if (!name) { error.value = 'A name is needed — it is on every heading.'; return; }
  if (!mascot) {
    error.value = 'A mascot is needed — it is rendered on headings across the app.';
    return;
  }
  if (colourError.value) { return; }
  if (logoError.value) { error.value = logoError.value; return; }

  const school = {
    name,
    mascot,
    city: form.value.city.trim(),
    league: form.value.league.trim(),
    ...(logoColumn.value ? { logoUrl: form.value.logoUrl.trim() } : {}),
    colors: {
      ...(row.value?.colors ?? {}),
      primary: form.value.primary.trim(),
      secondary: form.value.secondary.trim()
    },
    record: {
      wins: count(form.value.wins),
      losses: count(form.value.losses),
      draws: count(form.value.draws)
    }
  };

  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    const res: any = await supabaseService.upsertSchool(props.schoolCode, school);
    if (res?.error) {
      error.value = typeof res.error === 'string' ? res.error : (res.error.message || 'Saved nothing.');
      return;
    }
    notice.value = 'Saved.';
    // Every heading reads the organization, so the app is told rather than
    // waiting for a reload.
    emit('saved', school);
  } catch (e: any) {
    error.value = e?.message || 'That could not be saved.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <SectionShell title="Organization profile" :badge="form.name || null">

    <p v-if="!isAdmin" class="note">
      Only an admin can edit the organization's name, colours and record.
    </p>

    <template v-else>
      <p v-if="loading" class="note">Loading…</p>

      <div class="grid">
        <label class="field">
          <span class="kicker">Name</span>
          <input v-model="form.name" data-school-name type="text" class="input" />
        </label>
        <label class="field">
          <span class="kicker">Mascot</span>
          <input v-model="form.mascot" data-school-mascot type="text" class="input" />
        </label>
        <label class="field">
          <span class="kicker">City</span>
          <input v-model="form.city" data-school-city type="text" class="input" />
        </label>
        <label class="field">
          <span class="kicker">League</span>
          <input v-model="form.league" data-school-league type="text" class="input" />
        </label>
        <label class="field field--wide">
          <span class="kicker">Logo address</span>
          <input v-model="form.logoUrl" data-school-logo type="text" class="input"
                 :disabled="!logoColumn" placeholder="https://… or /img/…" />
        </label>
        <label class="field">
          <span class="kicker">Primary colour</span>
          <span class="swatch-row">
            <input v-model="form.primary" data-school-primary type="text" class="input" />
            <span class="swatch" :style="{ background: swatchFor(form.primary) }" aria-hidden="true"></span>
          </span>
        </label>
        <label class="field">
          <span class="kicker">Secondary colour</span>
          <span class="swatch-row">
            <input v-model="form.secondary" data-school-secondary type="text" class="input" />
            <span class="swatch" :style="{ background: swatchFor(form.secondary) }" aria-hidden="true"></span>
          </span>
        </label>
        <label class="field">
          <span class="kicker">Wins</span>
          <input v-model="form.wins" data-school-wins type="number" min="0" class="input" />
        </label>
        <label class="field">
          <span class="kicker">Losses</span>
          <input v-model="form.losses" data-school-losses type="number" min="0" class="input" />
        </label>
        <label class="field">
          <span class="kicker">Draws</span>
          <input v-model="form.draws" data-school-draws type="number" min="0" class="input" />
        </label>
      </div>

      <p class="note" data-school-colour-forms>Colours accept {{ COLOUR_FORMS }}.</p>
      <p v-if="colourError" class="note note--bad" role="alert" data-school-colour-error>{{ colourError }}</p>
      <p v-for="(item, i) in substitutions" :key="i" class="note" data-school-colour-note>{{ item.reason }}</p>

      <!-- Shown on the public home page, in place of the coach's message. -->
      <p v-if="row && !logoColumn" class="note" data-school-logo-unmigrated>
        This database has no logo column yet. Apply migration 0028 to give the organization a logo.
      </p>
      <p v-else-if="logoError" class="note note--bad" role="alert" data-school-logo-error>{{ logoError }}</p>
      <template v-else-if="previewUrl">
        <img v-show="brokenPreview !== previewUrl" :src="previewUrl" alt="" class="logo-preview"
             data-school-logo-preview
             @error="brokenPreview = previewUrl" @load="brokenPreview = null" />
        <!-- Warned, not refused: the file may not be uploaded yet, and the
             public page withdraws a logo that fails to load. -->
        <p v-if="brokenPreview === previewUrl" class="note note--bad" role="alert" data-school-logo-broken>
          That address did not load an image, so visitors will not see a logo. Check it is spelled
          exactly as the file is named, including the extension (.png, .jpg).
        </p>
      </template>

      <p class="note">
        The name and mascot are rendered on headings throughout the app.
      </p>

      <button type="button" class="btn btn--go" data-school-save
              :disabled="saving" @click="onSave">
        {{ saving ? 'Saving…' : 'Save profile' }}
      </button>

      <p v-if="error" class="error" data-school-error>{{ error }}</p>
      <p v-if="notice" class="ok" data-school-notice>{{ notice }}</p>
    </template>
  </SectionShell>
</template>

<style scoped>

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.error { color: var(--color-danger); }
.ok { color: var(--live); }

.swatch-row { display: flex; gap: var(--space-2); align-items: center; }
.swatch {
  width: 28px;
  height: 28px;
  flex: none;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
}

/* The logo as the public page will show it, before it is saved. */
.logo-preview { width: 6rem; height: 6rem; object-fit: cover; border-radius: var(--radius-md); }
</style>
