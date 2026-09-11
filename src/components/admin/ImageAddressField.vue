<script setup lang="ts">
/**
 * An image address on the organization's profile: the logo, or the photo.
 *
 * Extracted from the logo field when the photo arrived, so the two cannot
 * drift. Every behaviour here was earned by the logo first:
 *
 * - disabled, with a note, until the migration that adds the column is
 *   applied -- naming a missing column makes PostgREST refuse the WHOLE
 *   profile save with 42703;
 * - an address the public page would refuse is said before saving (the
 *   parent refuses the save itself);
 * - the preview follows the typing after a 400ms pause, so a half-typed
 *   address is not fetched, does not fail, and does not flash a warning;
 * - an address that does not load an image is warned about, not refused --
 *   the file may not be uploaded yet, and the public page withdraws an image
 *   that fails.
 *
 * The data hooks are `data-school-${name}`, `-preview`, `-broken`, `-error`,
 * `-unmigrated` and `-hint`, which is what the profile's tests read.
 */
import { ref, watch, onBeforeUnmount } from 'vue';
import { safeImageUrl } from '../../domain/theme';

const props = withDefaults(defineProps<{
  /** `logo` or `hero`: names the data hooks. */
  name: string;
  label: string;
  /** "logo" or "photo", as the sentences say it. */
  noun: string;
  /** The migration that adds the column, for the unmigrated note. */
  migration: string;
  modelValue: string;
  /** The address as the row holds it. A value equal to it came from a load. */
  loadedValue: string | null;
  /** Whether the loaded row has the column. */
  available: boolean;
  /** Whether a row has loaded at all. */
  loaded: boolean;
  /** Why the typed address is refused, or null. */
  error: string | null;
  /** What a visitor sees when the image does not load. */
  whenBroken: string;
  hint?: string;
  /** A band-shaped preview rather than a square one. */
  wide?: boolean;
}>(), { hint: '', wide: false });

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const previewUrl = ref('');
const brokenPreview = ref<string | null>(null);

watch(() => props.loadedValue, (v) => { previewUrl.value = safeImageUrl(v); }, { immediate: true });

let timer: ReturnType<typeof setTimeout> | undefined;
watch(() => props.modelValue, (typed) => {
  clearTimeout(timer);
  const url = safeImageUrl(typed);
  // The row's own value: a load (or typing back to it), so show it at once.
  // Waiting would only race a test's fake clock with a real timer.
  if (typed === (props.loadedValue ?? '')) { previewUrl.value = url; return; }
  if (url === previewUrl.value) return;
  timer = setTimeout(() => { previewUrl.value = url; }, 400);
});
onBeforeUnmount(() => clearTimeout(timer));

/** `{ 'data-school-logo-preview': '' }` and the like. */
const hook = (suffix: string) => ({ [`data-school-${props.name}${suffix}`]: '' });
</script>

<template>
  <div class="image-field">
    <label class="field">
      <span class="kicker">{{ label }}</span>
      <input
        :value="modelValue" type="text" class="input" v-bind="hook('')"
        :disabled="!available" placeholder="https://… or /img/…"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
    </label>

    <p v-if="hint && available" class="note" v-bind="hook('-hint')">{{ hint }}</p>

    <p v-if="loaded && !available" class="note" v-bind="hook('-unmigrated')">
      This database has no {{ noun }} column yet. Apply migration {{ migration }} to give the organization a {{ noun }}.
    </p>
    <p v-else-if="error" class="note note--bad" role="alert" v-bind="hook('-error')">{{ error }}</p>
    <template v-else-if="previewUrl">
      <img
        v-show="brokenPreview !== previewUrl" :src="previewUrl" alt=""
        class="preview" :class="{ 'preview--wide': wide }" v-bind="hook('-preview')"
        @error="brokenPreview = previewUrl" @load="brokenPreview = null" />
      <p v-if="brokenPreview === previewUrl" class="note note--bad" role="alert" v-bind="hook('-broken')">
        That address did not load an image, so {{ whenBroken }}. Check it is spelled
        exactly as the file is named, including the extension (.png, .jpg).
      </p>
    </template>
  </div>
</template>

<style scoped>
.image-field { display: flex; flex-direction: column; gap: var(--space-1); margin-top: var(--space-3); }

/* The image as the public page will show it, before it is saved. */
.preview { width: 6rem; height: 6rem; object-fit: cover; border-radius: var(--radius-md); }
.preview--wide { width: 18rem; max-width: 100%; height: 6rem; }
</style>
