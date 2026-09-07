<script setup lang="ts">
/**
 * The handbook.
 *
 * The index and the search are computed over the sections rather than walked
 * through the DOM, which is why this needs no `setTimeout` — the legacy
 * version had one in the router because its wiring ran after `innerHTML`
 * landed.
 *
 * Section bodies are rendered with `v-html`. They are authored prose committed
 * to this repository, not user input, which is what makes that the right call
 * here rather than a shortcut: turning 700 lines of handbook into structured
 * data would risk losing content for nothing a reader would notice.
 */
import { ref, computed } from 'vue';
import { helpSections } from '../content/help';
import { searchHelp, helpIndex } from '../domain/help-search';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const query = ref('');
const all = helpSections();

const matches = computed(() => searchHelp(all, query.value));
const index = computed(() => helpIndex(matches.value));
const searching = computed(() => query.value.trim().length > 0);

/** Coach- and admin-only sections are marked, not hidden: knowing a feature
 *  exists is useful even to someone who cannot reach it yet. */
function roleLabel(section: any): string {
  const kinds = section.roles.map((r: any) => r.kind);
  if (kinds.includes('all')) return '';
  return section.roles.map((r: any) => r.label).join(' / ');
}

function jumpTo(id: string): void {
  document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>

<template>
  <section class="help">
    <header class="help__head">
      <h1 class="help__title">Handbook</h1>
      <p class="help__sub">
        What each screen does, and how to get it to do it.
        <template v-if="auth.isGuest">
          Some sections describe coach-only screens; they are marked.
        </template>
      </p>

      <label class="search">
        <span class="search__label">Search the handbook</span>
        <input
          v-model="query" type="search" class="search__input"
          placeholder="roster, lineup, ratings…" data-help-search
        />
      </label>
    </header>

    <p v-if="searching" class="count" role="status" data-help-count>
      {{ matches.length }}
      {{ matches.length === 1 ? 'section matches' : 'sections match' }}
      “{{ query }}”
    </p>

    <p v-if="matches.length === 0" class="empty" data-help-none>
      Nothing in the handbook matches that. Try a single word — a screen name,
      or what you are trying to do.
    </p>

    <div v-else class="help__body">
      <nav class="index" aria-label="Handbook sections">
        <div v-for="part in index" :key="part.part" class="index__part">
          <h2 class="index__title">{{ part.part }}</h2>
          <ul class="index__list">
            <li v-for="s in part.sections" :key="s.id">
              <button type="button" class="index__link" data-help-jump @click="jumpTo(s.id)">
                {{ s.title }}
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <div class="sections">
        <article
          v-for="s in matches" :key="s.id" :id="`help-${s.id}`"
          class="section" data-help-section
        >
          <header class="section__head">
            <h2 class="section__title">{{ s.title }}</h2>
            <span v-if="roleLabel(s)" class="section__role" data-help-role>
              {{ roleLabel(s) }}
            </span>
          </header>
          <!-- Authored HTML from src/content/help.ts, not user input. -->
          <div class="section__body" v-html="s.body" />
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.help { max-width: 72rem; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }

.help__head { margin-bottom: 1.5rem; }
.help__title { margin: 0; color: var(--ink); font-size: 1.4rem; }

.help__sub {
  margin: 0.3rem 0 1rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.9rem;
}

.search { display: block; max-width: 26rem; }

.search__label {
  display: block;
  margin-bottom: 0.3rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.search__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 6px;
  background: var(--bhs-navy-bg);
  color: var(--ink);
  font: inherit;
  font-size: 0.9rem;
}

.count {
  margin: 0 0 1rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.82rem;
}

.help__body {
  display: grid;
  grid-template-columns: 15rem 1fr;
  gap: 2rem;
  align-items: start;
}

@media (max-width: 860px) {
  .help__body { grid-template-columns: 1fr; gap: 1.25rem; }
  .index { position: static !important; }
}

.index { position: sticky; top: 5rem; }
.index__part { margin-bottom: 1.1rem; }

.index__title {
  margin: 0 0 0.4rem;
  color: var(--bhs-gold-accent);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.index__list { margin: 0; padding: 0; list-style: none; }

.index__link {
  display: block;
  width: 100%;
  padding: 0.22rem 0;
  border: 0;
  background: none;
  color: var(--text-muted, #94a3b8);
  font: inherit;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.index__link:hover, .index__link:focus-visible { color: var(--bhs-cyan-accent); }

.section {
  padding-bottom: 1.75rem;
  margin-bottom: 1.75rem;
  border-bottom: 1px solid var(--bhs-navy-border);
  scroll-margin-top: 5rem;
}

.section:last-child { border-bottom: 0; }

.section__head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: baseline;
  margin-bottom: 0.6rem;
}

.section__title { margin: 0; color: var(--ink); font-size: 1.1rem; }

.section__role {
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--bhs-gold-accent);
  border-radius: 999px;
  color: var(--bhs-gold-accent);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.section__body { color: var(--text-muted, #94a3b8); font-size: 0.9rem; line-height: 1.65; }

.empty {
  padding: 3rem 1rem;
  color: var(--text-muted, #94a3b8);
  text-align: center;
}
</style>

<style>
/* Unscoped: these style markup that arrives through v-html, which scoped
   styles cannot reach because it carries no scope attribute. */
.section__body h4 {
  margin: 1.25rem 0 0.4rem;
  color: var(--ink);
  font-size: 0.95rem;
}

.section__body p { margin: 0 0 0.7rem; }
.section__body b, .section__body strong { color: var(--ink); }
.section__body ol, .section__body ul { margin: 0 0 0.8rem; padding-left: 1.3rem; }
.section__body li { margin-bottom: 0.3rem; }

.help-path {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--rule);
  border-radius: 6px;
  font-size: 0.84rem;
}

.help-path span { color: var(--ink-muted); }

.help-note, .help-warn {
  margin: 0.8rem 0;
  padding: 0.7rem 0.85rem;
  border-left: 3px solid var(--live);
  border-radius: 0 6px 6px 0;
  background: color-mix(in srgb, var(--ink) 3%, transparent);
}

.help-warn { border-left-color: var(--color-warning); }

.help-note-label, .help-warn-label {
  display: block;
  margin-bottom: 0.3rem;
  color: var(--live);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.help-warn-label { color: var(--color-warning); }

.help-tablewrap { overflow-x: auto; margin: 0.8rem 0; }

.help-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.help-table th, .help-table td {
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  vertical-align: top;
}

.help-table th { color: var(--live); font-size: 0.72rem; text-transform: uppercase; }

/* Numbered because these genuinely are sequences: do this, then this. */
.help-steps { list-style: none; counter-reset: hstep; padding-left: 0 !important; }
.help-steps > li {
  counter-increment: hstep;
  position: relative;
  padding-left: 34px;
  margin-bottom: 10px;
}
.help-steps > li::before {
  content: counter(hstep);
  position: absolute;
  left: 0;
  top: 0;
  width: 23px;
  height: 23px;
  display: grid;
  place-items: center;
  border: 1px solid var(--live);
  border-radius: 50%;
  color: var(--live);
  font-family: var(--heading-face);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

/* A worked calculation, set as a figure. */
.help-calc {
  margin: 0 0 14px;
  padding: 13px 15px;
  overflow-x: auto;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--surface-deep);
  color: var(--ink-muted);
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 0.78rem;
  line-height: 1.75;
  font-variant-numeric: tabular-nums;
}
.help-calc-hl { color: var(--live); }

.section__body mark {
  padding: 0 2px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--rule-strong) 28%, transparent);
  color: var(--ink);
}
</style>
