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
      <div class="help__aside">
        <label class="search">
          <span class="search__label kicker">Search the handbook</span>
          <input
            v-model="query" type="search" class="search__input input"
            placeholder="roster, lineup, ratings…" data-help-search
          />
        </label>

        <nav class="index" aria-label="Handbook sections">
          <div v-for="part in index" :key="part.part" class="index__part">
            <h2 class="index__title kicker">{{ part.part }}</h2>
            <ul class="index__list">
              <li v-for="s in part.sections" :key="s.id">
                <button type="button" class="index__link" data-help-jump @click="jumpTo(s.id)">
                  {{ s.title }}
                </button>
              </li>
            </ul>
          </div>
        </nav>
      </div>

      <div class="sections">
        <article
          v-for="s in matches" :key="s.id" :id="`help-${s.id}`"
          class="section" data-help-section
        >
          <header class="section__head">
            <h2 class="section__title">{{ s.title }}</h2>
            <span v-if="roleLabel(s)" class="section__role tag" data-help-role>
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
.help { padding: var(--space-4) var(--space-4) var(--space-8); }

.help__head { margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.help__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.help__sub { margin-top: var(--space-1); color: var(--ink-muted); font-size: 14px; line-height: 1.5; }

.search { display: block; margin-bottom: var(--space-4); }
.search__label { display: block; margin-bottom: var(--space-1); }

.count { margin: 0 0 var(--space-3); color: var(--live); font-size: 13px; }

.help__body { display: block; }

/* The index is a sidebar only where there is room for one; under 768px the
   handbook is one column and the search is simply the first thing on it. */
.index__part { margin-bottom: var(--space-4); }
.index__title { margin: 0 0 var(--space-1); }
.index__list { margin: 0; padding: 0; list-style: none; }

.index__link {
  display: block;
  width: 100%;
  padding: 3px 0;
  border: 0;
  background: none;
  color: var(--ink-muted);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.index__link:hover, .index__link:focus-visible { color: var(--live); }

.section {
  padding-bottom: var(--space-6);
  margin-bottom: var(--space-6);
  border-bottom: 1px solid var(--rule);
  scroll-margin-top: var(--space-8);
}
.section:last-child { border-bottom: 0; }

.section__head { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; margin-bottom: var(--space-2); }
.section__title { margin: 0; color: var(--ink); font-family: var(--heading-face); font-weight: 500; font-size: 20px; }

.section__body { color: var(--ink-muted); font-size: 14px; line-height: 1.65; }

.empty { padding: var(--space-8) var(--space-3); color: var(--ink-muted); text-align: center; }

/* Above 768px: the index on the left, the prose in a 38em measure (spec §6). */
@media (min-width: 768px) {
  .help { max-width: 64rem; margin: 0 auto; }
  .help__body { display: grid; grid-template-columns: 15rem minmax(0, 38em); gap: var(--space-8); align-items: start; }
  .help__aside { position: sticky; top: var(--space-8); }
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
