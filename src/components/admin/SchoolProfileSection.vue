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
 * Colours are validated as hex here as well as in `domain/theme.ts`, because
 * they are written straight into CSS custom properties — `theme.ts` falls back
 * when it reads something else, and this stops the bad value being stored in
 * the first place.
 *
 * Extracted from the school profile forms in public/js/views/planner.view.js
 * during Phase 6.
 */
import { ref, watch } from 'vue';
import { supabaseService } from '../../data/supabase';
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY } from '../../domain/theme';

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
  name: '', mascot: '', city: '', league: '',
  primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY,
  wins: '0', losses: '0', draws: '0'
});

const loading = ref(false);
const saving = ref(false);
const notice = ref<string | null>(null);
const error = ref<string | null>(null);

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

async function load(): Promise<void> {
  // No organization resolved yet: wait, rather than reading a defaulted one.
  if (!props.schoolCode) return;

  loading.value = true;
  error.value = null;
  try {
    const row: any = await supabaseService.fetchSchool(props.schoolCode);
    if (!row) { error.value = 'That organization could not be loaded.'; return; }

    form.value = {
      name: row.name || '',
      mascot: row.mascot || '',
      city: row.city || '',
      league: row.league || '',
      primary: row.colors?.primary || DEFAULT_PRIMARY,
      secondary: row.colors?.secondary || DEFAULT_SECONDARY,
      wins: String(row.record?.wins ?? 0),
      losses: String(row.record?.losses ?? 0),
      draws: String(row.record?.draws ?? 0)
    };
  } catch (e: any) {
    error.value = e?.message || 'That organization could not be loaded.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.schoolCode, load, { immediate: true });

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
  if (!HEX.test(form.value.primary.trim()) || !HEX.test(form.value.secondary.trim())) {
    error.value = 'Each colour has to be a hex value like #0047AB.';
    return;
  }

  const school = {
    name,
    mascot,
    city: form.value.city.trim(),
    league: form.value.league.trim(),
    colors: { primary: form.value.primary.trim(), secondary: form.value.secondary.trim() },
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
  <section class="panel">
    <h3>Organization profile</h3>

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
        <label class="field">
          <span class="kicker">Primary colour</span>
          <input v-model="form.primary" data-school-primary type="text" class="input" />
        </label>
        <label class="field">
          <span class="kicker">Secondary colour</span>
          <input v-model="form.secondary" data-school-secondary type="text" class="input" />
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
  </section>
</template>

<style scoped>
.panel {
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.error { color: var(--color-danger); }
.ok { color: var(--live); }
</style>
